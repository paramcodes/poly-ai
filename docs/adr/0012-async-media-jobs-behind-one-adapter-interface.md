# ADR 0012: Async media jobs behind one adapter interface

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

ADR-0006 decided that video and music are asynchronous provider jobs tracked by a row in
`generations`, and ADR-0010 decided that the client polls our own endpoint to observe
them. Both decisions assume there is a way to hand a job to a provider and later ask the
provider what became of it, but neither says what that interface looks like. Phase 6 has
to answer that for two vendors, and the answer has to survive a third.

The OpenAI-compatible path that covers most of the provider long tail (ADR-0003) cannot
serve these categories. The installed `@ai-sdk/openai-compatible@2.0.85` ships
language, chat, completion, embedding and image models — no video model factory, and no
`speechModel` either. The AI SDK's own video helpers exist but are experimental: in
`ai@7.0.145` they are `experimental_generateVideo`, `experimental_startVideo` and
`experimental_getVideoStatus`. `experimental_startVideo` is a fire-and-forget call that
returns an opaque `operation` reference, and `experimental_getVideoStatus` takes that
reference back. There is no AI SDK music or song API at all, so a song needs a queue
adapter regardless of what the SDK offers for video.

That leaves two vendors that both model the work as a queue, and both are reachable with
one key per user:

- **fal.ai** fronts a wide catalogue of video and music models behind one integration
  pattern: submit to a model endpoint, get a request id and a status URL, poll, then
  fetch the result.
- **Replicate** runs predictions: post to a model's predictions endpoint, get a
  prediction id and a `urls.get` endpoint, poll it, and read the output URL from the
  finished prediction.

Both are queue-based, both are pay-per-use, and both are vendors a user already holds a
key for in a BYOK studio. Suno and Udio have no official developer API, so they are not
options.

The second pressure is on our own side. The image category already has an adapter
(`getImageModel` in `src/server/adapters/index.ts`) that answers with bytes inside the
request. Video and music answer with a job handle and are observed later. If each vendor
got a bespoke function signature — fal's `request_id`/`status_url`, Replicate's
`id`/`urls.get`, and a third shape for whoever comes next — the poll handler would grow a
branch per vendor, and the `generations` row would stop being a uniform record of provider
state.

## Decision Drivers

- One call site must be able to submit a job and later ask for its status without knowing
  which vendor is behind it.
- The provider handle has to be storable in `generations` columns, so the shape must be
  two strings and nothing more.
- The interface must not depend on an `experimental_` API, because the app is built on a
  versioned SDK that can change under us.
- A provider error must arrive as data rather than as an exception, so that a failed job
  is a row the user can see and retry.
- Test keys must never reach the network, so the mock path has to sit behind the same
  interface as the real one.

## Decision

**All asynchronous media work goes through one provider-agnostic `AsyncJobAdapter`
interface, the `generations` row is the only durable record of a job, and the client
observes the job by polling our own endpoint.**

### The adapter interface

`src/server/adapters/async-job.ts` defines the whole boundary:

```ts
export type AsyncJobState = "queued" | "running" | "succeeded" | "failed";

export interface AsyncJobAdapter {
	submit(request: AsyncJobRequest): Promise<AsyncJobHandle>;
	status(handle: AsyncJobHandle): Promise<AsyncJobStatus>;
}
```

`AsyncJobRequest` carries the `prompt`, the `modelId` and an optional `params` record.
`AsyncJobHandle` is the provider's own job id plus, when the provider exposes one, the
provider's status URL. `AsyncJobStatus` is the normalised answer: a `state`, an optional
`progress` from 0 to 100, an optional `message`, the finished asset's `outputUrl` and an
optional `error`.

`getAsyncJobAdapter(kind, options)` picks the adapter for a provider kind — `fal` and
`replicate` are the only two — and throws `No async job adapter for provider kind: <kind>`
for anything else. A new queue vendor is a new file under `src/server/adapters/` and one
more branch in that function; nothing above it changes.

Two adapters ship in this phase. `createFalJobAdapter` posts to `{baseUrl}/{modelId}`
(default `https://fal.run`) with an `Authorization: Key` header and reads `request_id` and
`status_url` from the answer; its status call maps `IN_QUEUE` to `queued`, `IN_PROGRESS`
to `running` and `COMPLETED` to `succeeded`, then fetches the result payload to find the
asset URL. `createReplicateJobAdapter` posts to `{baseUrl}/models/{modelId}/predictions`
(default `https://api.replicate.com/v1`) with a `Bearer` header and reads `id` and
`urls.get`; its status call maps `starting` to `queued`, `processing` to `running`,
`succeeded` to `succeeded`, and `failed` or `canceled` to `failed`.

A key that starts with `mock-` or `sk-test-`, or is exactly `valid-key`, never reaches
the network: the adapter hands back a job id and then reports the job as `succeeded` with
a small valid placeholder asset — a one-frame MP4 for video, a silent WAV for music —
encoded as a data URL. The bytes are real, so the storage upload works exactly as it does
for a live provider.

### The row is the only durable record

A job's whole server-side state lives in one `generations` row. `providerExternalId`
holds the adapter's `externalId`, `providerStatusUrl` holds its `statusUrl`, `status`
moves through `queued`, `running` and then `succeeded` or `failed`, `outputUrl` holds the
blob-storage URL of the finished asset, and `error` holds the failure message with no key
material in it. The adapter is rebuilt from the provider row on every call, so nothing
about a job lives in process memory.

### The client observes by polling

`POST /api/generate/video` and `POST /api/generate/music` create the row, submit the job
and answer `202` with the row. The client then polls `GET /api/generations/:id` every
five seconds; that route asks the adapter for the current status before it answers, so
the provider is queried once per poll. When the provider reports success the server
downloads the asset, uploads it to blob storage (ADR-0009) and sets `outputUrl`. This is
ADR-0010, implemented for the first time.

## Alternatives Considered

**Blocking on the provider inside the request.** Rejected. A function that waits for a
five-minute render dies before the render finishes — 300 s on Hobby, 800 s on Pro
(ADR-0009) — and the provider's work is wasted when it does. ADR-0006 already settled
that the job is not owned by the request that started it.

**The AI SDK's `experimental_startVideo` and `experimental_getVideoStatus` as the
boundary.** Rejected as the boundary because both are `experimental_` in `ai@7.0.145` and
can change or be renamed under us, and because the pair is provider-specific: it covers
the vendors an SDK package supports, not fal or Replicate, which is where the video and
music catalogues actually are. The shape is worth keeping, though:
`experimental_startVideo` returns an operation reference and `experimental_getVideoStatus`
takes it back, which is the same submit-then-status shape as `AsyncJobHandle` and
`AsyncJobStatus`. An adapter built on those two would fit this interface without any
change above it.

**Unofficial Suno and Udio wrappers.** Rejected. Neither vendor has an official
developer API, so a wrapper is an undocumented endpoint behind a scraped session: it
breaks without warning and cannot be supported. The two vendors that do have queue APIs
carry usable video and music catalogues.

**A webhook callback from the provider.** Not available from fal or Replicate today, so
it cannot be the mechanism we build on. It remains a plausible later optimisation next to
polling, exactly as ADR-0010 notes.

## Consequences

### Positive

- **The vendor-specific code stops at the adapter.** The poll handler, the job
  orchestration and the client all speak one shape, so a third queue vendor is one file.
- **A provider error is a row, not a crash.** The status call returns
  `{ state: "failed", error }` instead of throwing, so a failed job is something the user
  can see and retry.
- **The job survives the request.** The row carries the provider's id and status URL, so
  a function that is killed or cold-started loses nothing; the next poll picks the job
  back up.
- **Tests use the same interface as production.** The mock adapter is an
  `AsyncJobAdapter` like any other, so a test drives the real orchestration code with no
  network.

### Negative / costs

- **The tab has to stay open.** The client drives observation, so a user who closes the
  tab before the poll sees completion finds the row still `running` when they come back.
  This is the accepted cost of ADR-0010.
- **A stale `running` row needs a sweeper.** If no client ever polls a row again, nothing
  re-checks it, and it stays `running` in the history. A server-side sweep of rows that
  have not changed for N minutes needs a scheduler, which we do not have yet; it is a
  follow-up, not part of this decision.
- **Every poll costs provider quota.** One status call per poll, per observer: a
  five-minute video at a five-second interval is roughly sixty status calls, and a
  second tab watching the same job doubles it.
- **The interface is only as wide as its first two adapters.** `AsyncJobStatus.progress`
  is best effort, and the fal and Replicate mappings are coarse — `IN_PROGRESS` and
  `processing` both become `running` at 50 percent. A provider with finer-grained
  progress would need a new field, which means a new ADR or an amendment.
- **Music parameters have no uniform home.** The interface carries a free-form `params`
  record, so each music model's own parameters pass straight through to the vendor. A
  per-model parameter schema is still needed on the client, and nothing in this decision
  provides it.

### Neutral / follow-ups

- Text-to-speech is not a job. The voice mode in the music category calls
  `generateSpeech` through the AI SDK and answers with a finished row, so it
  deliberately does not go through `AsyncJobAdapter`.
- The `generations` table already has every column this decision needs; no migration
  ships with it.
- ADR-0011's `GenerationEvent` union and this decision meet at the row: video and music
  do not stream the union over SSE, while image still does.

## References

- ADR-0003 — models.dev as the model catalogue
- ADR-0004 — BYOK key encryption
- ADR-0006 — resumable job model for asynchronous media
- ADR-0009 — Vercel deployment and blob storage
- ADR-0010 — client-driven polling without a worker
- ADR-0011 — media generation streams its lifecycle over SSE in the request
- `docs/glossary.md`
- `src/server/adapters/async-job.ts`, `src/server/adapters/fal.ts`,
  `src/server/adapters/replicate.ts`
- `src/server/generation/job.ts`

## Revisit triggers

- **A third queue vendor appears** — the interface is proven only by fal and Replicate, and
  a vendor whose job handle is not two strings forces a change to `AsyncJobHandle` and
  therefore to the `generations` columns.
- **A provider offers webhook callbacks** — fal or Replicate shipping a completion
  callback would make the poll an optimisation rather than the mechanism.
- **The AI SDK's video API graduates out of `experimental_`** — then the SDK pair can
  become one adapter implementation instead of a shape we imitate.
- **Per-job provider status calls become a material cost** — at that point the poll
  interval, the number of observers, or a server-side sweeper has to change.
