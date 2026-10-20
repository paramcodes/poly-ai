# Video generation

The video category turns a prompt into a rendered clip. A video model does not answer
with bytes: it accepts a job, renders for minutes, and hands the file back through a
status endpoint. The video category is therefore the first place in Poly-AI where the
client has to *watch* a generation rather than read it, and the first place where the
user's tab is part of the mechanism.

The design follows ADR-0006 (a row in `generations` is the durable record), ADR-0010
(the client polls our own endpoint) and ADR-0012 (all asynchronous work goes through one
`AsyncJobAdapter` interface). Video and image sit next to each other in the app but use
different mechanisms, and the difference is described at the end of this document.

## The user flow

1. The user opens the video category. The category page loads the models assigned to
   `video` for the signed-in user, and the model picker shows the ones whose provider is
   `active` and whose assignment is enabled.
2. The user types a prompt into the `video-prompt` textarea and presses Generate.
3. The workspace posts the prompt to `POST /api/generate/video`. The server creates the
   `generations` row, submits the job to the provider, and answers `202` with the row.
4. The workspace shows a progress card that reads "Waiting in the queue" while the row is
   `queued` and "Rendering" while it is `running`.
5. The workspace polls `GET /api/generations/:id` every five seconds. The route asks the
   provider for the current status before it answers.
6. When the provider reports success, the server downloads the asset, uploads it to blob
   storage, writes the storage URL to `outputUrl` and marks the row `succeeded`. The
   workspace stops polling, shows the clip in a `<video>` player, toasts "Video generated
   successfully!" and re-reads the history.
7. If the provider reports a failure, the row is marked `failed` with the provider's
   message, the workspace toasts the error and stops polling. The failed row stays in the
   history with a Retry button.

Polling stops on the first terminal status — `succeeded`, `failed` or `cancelled` — and
also stops after ten minutes, at which point the workspace reports that the generation
timed out. A generation that is still running when the user closes the tab is not lost:
the provider keeps rendering, the row stays `running`, and the next visit to the category
shows it in the history.

## Components and who owns the state

`src/components/app/category-view.tsx` is the entry point. It owns the model catalogue
for the category, the selected model, and the empty state. For the `video` category it
renders `<VideoWorkspace selectedModel={selectedModel} />`; for `music` it renders
`<MusicWorkspace selectedModel={selectedModel} />`. The generic fallback form at the
bottom of the file is no longer used by any category, because every category has its own
workspace now.

`src/components/app/video-workspace.tsx` owns everything about the run in progress: the
prompt text, whether a submission is in flight, the stage the job is in, the finished
result, and the history list. It takes one prop, `selectedModel: AssignedModel`, and
uses `selectedModel.providerId` and `selectedModel.modelId` in the request body. It
renders the prompt form, the progress card, the latest result and the history.

`src/components/app/media-history.tsx` holds the shared history list and the shared
polling hook. `MediaHistory` takes the props of `MediaHistoryProps` — `category`,
`generations`, `loading`, `onRefresh`, `onRetry` and `emptyModelName` — and the rows it
renders are `MediaGenerationRecord` values. For the `video` category each card renders a
`<video controls>` player, and for `music` an `<audio controls>` player. Each card shows
the prompt, the model id, a status badge, a copy-prompt button, a download button, and —
for a `failed` row — the error text in red and a Retry button. The `useMediaJob` hook
exported from the same file owns the polling loop and reports the stage to the
workspace; both workspaces use it, so the poll interval and the timeout live in one
place.

`src/components/app/category-empty-state.tsx` and `src/lib/toast.ts` own the empty state
and the toast that goes with it; see the empty-state section below.

## Routes and the data they move

| Route | Purpose |
| --- | --- |
| `POST /api/generate/video` | Starts a job. |
| `GET /api/generations/:id` | Returns one row, refreshed against the provider if it is running. |
| `POST /api/generations/:id/retry` | Starts a new job from a failed row. |
| `GET /api/generations?category=video` | Lists the user's video rows, newest first. |

`POST /api/generate/video` takes `{ prompt, providerId, modelId, params? }`. It answers
`401` when the request is unauthenticated, `400` with the message "Invalid request:
prompt, providerId, and modelId are required" when the body is invalid, `404` when the
provider or the model assignment is not found for this user, `403` when the assignment is
disabled, and `500` otherwise. On success it answers `202` with `{ generation }`, the
row as it stands after the job was submitted. The workspace sends the prompt, the
provider and the model; it does not yet expose a parameter control, so `params` is
currently always absent.

`GET /api/generations/:id` is a route the whole app shares. For a row whose category is
`video` or `music` and whose status is `queued` or `running`, it refreshes the job
before answering, so a poll is what moves the row forward. For every other row it
answers with the row as stored, which is why the image category and the text category
are unaffected by it.

`POST /api/generations/:id/retry` takes no body. It answers `202` with
`{ generation }` — a *new* row, carrying the same prompt, model and params as the row
that failed — or `404` when the generation does not exist for this user, or `401` when
the request is unauthenticated. The original failed row is left alone; the history shows
both.

`GET /api/generations?category=video` already existed. It filters the signed-in user's
rows by category, orders them by `createdAt` descending and returns them as
`{ generations }`. The video workspace calls it on mount and again whenever a job
finishes, so the history list and the live result card cannot disagree.

## The generations row

Every run is one row in `generations`, and the row is the only durable record of the
job. The columns the video path uses are `id`, `userId`, `category`, `providerId`,
`modelId`, `prompt`, `status`, `providerExternalId`, `providerStatusUrl`, `outputUrl`,
`error`, `metadata`, `createdAt` and `updatedAt`.

The lifecycle is:

1. `createMediaJob` inserts the row with `status: "queued"`, the `category` set to
   `video`, the `providerId`, the `modelId` and the `prompt`. When parameters were
   supplied they are kept in `metadata`.
2. The job is submitted through the adapter for the provider's kind. The provider's own
   job id is written to `providerExternalId` and the provider's status URL to
   `providerStatusUrl`; the row moves to `running`. The model id sent to the provider is
   the vendor's model id from the model row, not the assignment's id.
3. While the row is `running`, each poll runs `refreshMediaJob`, which asks the adapter
   for the current status and maps it onto the row.
4. On success the asset is downloaded — a `data:` URL is decoded directly, anything else
   is fetched — and uploaded to blob storage under
   `generations/${userId}/${row.id}.mp4` with the content type from the response. The row
   becomes `succeeded` with `outputUrl` set to the storage URL.
5. On failure the row becomes `failed` and `error` holds the provider's message, or "The
   provider job failed" when the provider gave no reason. A provider call that throws is
   caught and recorded the same way, so a network failure is a failed row rather than a
   stuck one. A row that has no `providerExternalId` cannot be refreshed at all and is
   failed with "The provider job was never submitted".

`retryMediaJob` reads the failed row and calls `createMediaJob` again with its
`providerId`, `modelId`, `category`, `prompt` and `metadata.params`, which is where the
new row comes from.

## Failures, retries and what the user sees

A failure is a row, not an exception that escapes into the UI. The provider's message
lands in `error`; the history card shows it in red under the prompt, and the workspace
toasts the same text. The card's Retry button posts to
`POST /api/generations/:id/retry`, and the workspace immediately starts polling the new
row and refreshes the history, so the retry behaves exactly like a generation the user
started by hand.

A submission that never becomes a job — an unknown provider, a disabled assignment, a
network error while submitting — is a failed response from `POST /api/generate/video`.
The workspace reads the `error` field of the response body and toasts it. The row that
was already inserted is marked `failed` with the same message, so it appears in the
history rather than disappearing.

A provider key that starts with `mock-` or `sk-test-`, or is `valid-key`, never reaches
the network. The mock adapter answers immediately with a tiny placeholder clip, so the
whole flow — submit, poll, upload, play — can be exercised without a vendor account.

## The empty state

A video model is a model assigned to the `video` category whose provider is `active` and
whose assignment is enabled. When the user has no such model, `category-view.tsx` renders
`CategoryEmptyState` with the reason `not-configured`, and the workspace is not rendered
at all. `CategoryEmptyState` calls `notifyCategoryEmpty` from `src/lib/toast.ts`, which
raises one **amber** toast: "No models configured for Video", with the description "No
active models are configured for Video. Configure a provider in Settings to get started."
The toast is one-shot; the card persists underneath it, with a link to
`/settings/providers`, because the condition is not fixed by the toast. Amber means "not
configured yet" — a red toast would mean a provider's key was rejected, and that is the
`failed` reason the same component renders.

## Video and the image category

The two media categories share the row and the history endpoint, and nothing else.

**Image** is a request that ends when the work is done. `POST /api/generate/image`
answers with a `text/event-stream` of `GenerationEvent`s — `queued`, `progress`,
`complete`, `error` — and the image workspace reads that stream with
`parseSSEStream`, showing live progress as it arrives (ADR-0011). The whole lifecycle
happens inside one request.

**Video** is a request that ends when the provider accepts the job. `POST
/api/generate/video` answers `202` with a job id and no event stream, and the lifecycle
is observed afterwards by polling `GET /api/generations/:id` (ADR-0010). The provider
owns the work; the client only watches.

Neither category uses the AI SDK data stream. Text and website stream tokens through
`useChat`; the media categories do not, because a media provider produces a status
lifecycle with an artefact at the end of it rather than a token sequence.

The practical differences that follow from this are worth stating plainly. The image
category needs its tab open for exactly as long as the request takes, which is seconds.
The video category needs its tab open for as long as the render takes, which is minutes,
and the app says so rather than hiding it: the progress card is visible for the whole
run, and a job whose tab was closed is still listed in the history when the user comes
back. The image category's live view is the stream; the video category's live view is a
polling loop that costs one provider status call every five seconds.
