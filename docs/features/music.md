# Music generation

The music category produces audio in two ways, and the difference between them is the
first thing to understand about it.

**Song** is a queued job. A music model accepts a prompt, renders a track for minutes
and hands the file back through a status endpoint, exactly like a video model. The
client posts the prompt, gets a job id back, and polls our own endpoint until the track
is finished.

**Voice** is a text-to-speech call. It runs through the AI SDK's `generateSpeech`,
returns the audio in the same request, and the row it writes is already `succeeded` when
the response arrives. There is no job id, no polling, and no provider queue involved.

Both modes write a `generations` row with the category `music`, both appear in the same
history list, and both are played back with an `<audio controls>` element.

## The user flow

### Song

1. The user opens the music category with the Song toggle selected — it is the default.
   The category page loads the models assigned to `music` for the signed-in user. The
   music category is fed by the `audio` capability, so a model appears here when it can
   produce audio.
2. The user types a prompt into the `music-prompt` textarea and presses Generate.
3. The workspace posts the prompt to `POST /api/generate/music`. The server creates the
   `generations` row, submits the job to the provider, and answers `202` with the row.
4. The workspace shows a progress card that reads "Waiting in the queue" while the row is
   `queued` and "Rendering" while it is `running`.
5. The workspace polls `GET /api/generations/:id` every five seconds. The route asks the
   provider for the current status before it answers.
6. When the provider reports success, the server downloads the asset, uploads it to blob
   storage, writes the storage URL to `outputUrl` and marks the row `succeeded`. The
   workspace stops polling, shows the track in an `<audio>` player, toasts "Music
   generated successfully!" and re-reads the history.

Polling stops on the first terminal status — `succeeded`, `failed` or `cancelled` — and
also stops after ten minutes, at which point the workspace reports that the generation
timed out. A song that is still rendering when the user closes the tab is not lost: the
provider keeps working, the row stays `running`, and the next visit to the category shows
it in the history.

### Voice

1. The user switches the toggle to Voice. The prompt label stays the same, but the
   placeholder becomes "Enter the text to speak..." and the note beside the toggle reads
   "Text to speech, finished immediately".
2. The user types the text to speak and presses Generate.
3. The request goes to the speech flow: the workspace posts to `POST /api/generate/music`
   with `mode: "voice"`, and the route runs the same code as `POST /api/generate/speech`
   — the dedicated route that takes `{ text, providerId, modelId }` directly.
4. The server runs `generateSpeech` from the AI SDK against a speech model obtained
   from `getSpeechModel` in `src/server/adapters/speech.ts`, uploads the audio to blob
   storage under `generations/${userId}/${generationId}.mp3` with the content type
   `audio/mpeg`, and inserts the row with `category: "music"`, `status: "succeeded"`,
   the spoken text as the `prompt` and the storage URL as `outputUrl`.
5. The response carries `{ generation }` — a finished row. The workspace shows the
   track, toasts "Voice generated successfully!" and re-reads the history. There is no
   progress card and no polling, because there is nothing to wait for.

## Components and who owns the state

`src/components/app/category-view.tsx` owns the model catalogue for the category, the
selected model and the empty state. For the `music` category it renders
`<MusicWorkspace selectedModel={selectedModel} />`, in the same place the image and
video workspaces are rendered.

`src/components/app/music-workspace.tsx` owns the run in progress: the prompt text, the
mode toggle, whether a submission is in flight, the stage of a running song job, the
finished result and the history list. It takes one prop, `selectedModel: AssignedModel`,
and uses `selectedModel.providerId` and `selectedModel.modelId` in the request body. The
mode is local to this component — it is a choice about the next request, not a property
of a generation, and nothing in the history is filtered by it.

`src/components/app/media-history.tsx` holds the shared history list and the shared
polling hook, and is the same component the video category uses. `MediaHistory` takes
the props of `MediaHistoryProps` — `category`, `generations`, `loading`, `onRefresh`,
`onRetry` and `emptyModelName` — and the rows it renders are `MediaGenerationRecord`
values. For the `music` category each card renders an `<audio controls>` player and
shows the prompt, the model id, a status badge, a copy-prompt button and a download
button, plus the error text in red and a Retry button for a `failed` row. The
`useMediaJob` hook exported from the same file owns the polling loop; only the Song mode
uses it, because the Voice mode never produces a running job.

## Routes and the data they move

| Route | Purpose |
| --- | --- |
| `POST /api/generate/music` | Starts a song job. With `mode: "voice"` it runs the speech flow. |
| `POST /api/generate/speech` | Runs text-to-speech and answers with a finished row. |
| `GET /api/generations/:id` | Returns one row, refreshed against the provider if it is running. |
| `POST /api/generations/:id/retry` | Starts a new job from a failed row. |
| `GET /api/generations?category=music` | Lists the user's music rows, newest first. |

`POST /api/generate/music` takes `{ prompt, providerId, modelId, params? }` and may also
carry `mode?: "song" | "voice"`. The default mode is `song`. It answers `401` when the
request is unauthenticated, `400` with the message "Invalid request: prompt, providerId,
and modelId are required" when the body is invalid, `404` when the provider or the
model assignment is not found for this user, `403` when the assignment is disabled, and
`500` otherwise. In Song mode it answers `202` with `{ generation }`, the row as it
stands after the job was submitted. In Voice mode it answers `202` with the finished
row the speech flow produced.

`POST /api/generate/speech` takes `{ text, providerId, modelId }` and answers `200` with
`{ generation }`. The row it returns is already `succeeded` and already carries the
storage URL, so a client that receives it has nothing left to poll. Its invalid-body
message is "Invalid request: text, providerId, and modelId are required".

`GET /api/generations/:id` is a route the whole app shares. For a row whose category is
`video` or `music` and whose status is `queued` or `running`, it refreshes the job
before answering, so a poll is what moves the row forward. For every other row it
answers with the row as stored.

`POST /api/generations/:id/retry` takes no body. It answers `202` with
`{ generation }` — a *new* row carrying the same prompt, model and params as the row
that failed — or `404` when the generation does not exist for this user, or `401` when
the request is unauthenticated. The retry is always a job, so the workspace starts
polling the new row. A voice row is written already `succeeded`, so it never carries a
Retry button.

`GET /api/generations?category=music` already existed. It filters the signed-in user's
rows by category, orders them by `createdAt` descending and returns them as
`{ generations }`. The music workspace calls it on mount and again whenever a run
finishes. Song rows and voice rows live in the same list, because they share the
category and the row shape; the `modelId` badge and the prompt are what tell them
apart.

## The generations row

Every run is one row in `generations`, and the row is the only durable record. The
columns the music path uses are `id`, `userId`, `category`, `providerId`, `modelId`,
`prompt`, `status`, `providerExternalId`, `providerStatusUrl`, `outputUrl`, `error`,
`metadata`, `createdAt` and `updatedAt`.
A song job moves through the same lifecycle as a video job:

1. `createMediaJob` inserts the row with `status: "queued"`, the `category` set to
   `music`, the `providerId`, the `modelId` and the `prompt`. When parameters were
   supplied they are kept in `metadata`.
2. The job is submitted through the adapter for the provider's kind. The provider's own
   job id is written to `providerExternalId` and the provider's status URL to
   `providerStatusUrl`; the row moves to `running`. The model id sent to the provider is
   the vendor's model id from the model row, not the assignment's id.
3. While the row is `running`, each poll runs `refreshMediaJob`, which asks the adapter
   for the current status and maps it onto the row.
4. On success the asset is downloaded — a `data:` URL is decoded directly, anything else
   is fetched — and uploaded to blob storage under
   `generations/${userId}/${row.id}.mp3`. The row becomes `succeeded` with `outputUrl` set
   to the storage URL.
5. On failure the row becomes `failed` and `error` holds the provider's message, or "The
   provider job failed" when the provider gave no reason. A provider call that throws is
   caught and recorded the same way. A row with no `providerExternalId` cannot be
   refreshed and is failed with "The provider job was never submitted".

A voice run skips all of that. The row is inserted already `succeeded`, with the spoken
text as the `prompt` and the storage URL as the `outputUrl`, and it never has a
`providerExternalId` or a `providerStatusUrl` because no provider job was ever created.

Music models do not share a parameter schema, so `params` is passed through to the
provider rather than validated. The workspace does not expose a parameter control yet.

## Failures, retries and what the user sees

A failed song is a row, not an exception that escapes into the UI. The provider's
message lands in `error`; the history card shows it in red under the prompt, and the
workspace toasts the same text. The card's Retry button posts to
`POST /api/generations/:id/retry`, and the workspace starts polling the new row, so
the retry behaves like a generation the user started by hand.

A submission that never becomes a job — an unknown provider, a disabled assignment, a
network error — is a failed response from `POST /api/generate/music`, and the workspace
toasts its `error` field. The row that was already inserted is marked `failed` with the
same message, so it appears in the history rather than disappearing. A speech call that
fails throws out of `generateSpeech` and surfaces the same way.

A provider key that starts with `mock-` or `sk-test-`, or is `valid-key`, never reaches
the network. The mock job adapter answers immediately with a tiny placeholder track, and
the mock speech model returns a short silent WAV, so both modes can be exercised without
a vendor account.

## The empty state

A music model is a model assigned to the `music` category whose provider is `active`
and whose assignment is enabled. When the user has no such model, `category-view.tsx`
renders `CategoryEmptyState` with the reason `not-configured`, and the workspace is not
rendered at all. `CategoryEmptyState` calls `notifyCategoryEmpty` from
`src/lib/toast.ts`, which raises one **amber** toast: "No models configured for Music",
with the description "No active models are configured for Music. Configure a provider in
Settings to get started." The toast is one-shot; the card persists underneath it, with
a link to `/settings/providers`. Amber means "not configured yet" — a red toast would
mean a provider's key was rejected, and that is the `failed` reason the same component
renders.

## Music and the other categories

**The image category** is a request that ends when the work is done.
`POST /api/generate/image` answers with a `text/event-stream` of `GenerationEvent`s —
`queued`, `progress`, `complete`, `error` — and the image workspace reads that stream
with `parseSSEStream`, showing live progress as it arrives (ADR-0011).

**The music category in Song mode** is a request that ends when the provider accepts the
job. `POST /api/generate/music` answers `202` with a job id and no event stream, and
the lifecycle is observed afterwards by polling `GET /api/generations/:id` (ADR-0010).
The provider owns the work; the client only watches.

**The music category in Voice mode** is shorter than either of those. The audio comes
back in the request and the row is finished before the response is sent, so the voice
path is a synchronous generation that happens to live in the music category.

None of the three uses the AI SDK data stream. Text and website stream tokens through
`useChat`; the media categories do not, because a media provider produces a status
lifecycle with an artefact at the end of it rather than a token sequence. Voice is the
exception within the media categories in the other direction: it uses the AI SDK's
`generateSpeech`, but it is a single synchronous call rather than a stream.

The practical differences follow from this. The image category needs its tab open for
as long as the request takes, which is seconds. A song needs its tab open for as long as
the render takes, which is minutes, and the app says so rather than hiding it: the
progress card is visible for the whole run, and a song whose tab was closed is still
listed in the history when the user comes back. The voice mode needs no tab at all
beyond the request itself.
