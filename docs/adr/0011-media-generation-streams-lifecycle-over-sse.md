# ADR 0011: Media generation streams its lifecycle over SSE in the request

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

ADR-0005 defined a `GenerationEvent` union — `queued`, `progress`, `partial`, `complete`,
`error` — for the media categories, and said it would be emitted from the generation
route handler. ADR-0006 defined the `generations` row and its lifecycle, and ADR-0010
defined client-driven polling for long-running jobs. Phase 5 is the first category to
implement the union, so the three records have to be reconciled into one shape that works
for a category that is short and for categories that are not.

The categories differ in duration by two orders of magnitude:

- **Image** generation takes seconds. The provider returns the bytes in the same
  response. Nothing needs to survive the request, and the user is watching the screen.
- **Video and music** take minutes. The provider returns a job handle, and the job
  outlives the request (ADR-0006, ADR-0010).

Two mechanisms are therefore in play, and the question is whether they can share one
request shape. There is also a protocol question: text and website stream the AI SDK
data stream (ADR-0005), so a media endpoint that answered with a different wire format
would need a second client-side reader.

The AI SDK offers `generateImage` for images and no image equivalent for video or music,
so the image path has to be assembled from parts: the SDK's image call, a blob upload
(ADR-0009), and a row write.

## Decision

**A media generation is one `POST` that answers with a `text/event-stream` of
`GenerationEvent`s, and the `generations` row is written for every run — synchronous or
not.**

### The request shape

`POST /api/generate/image` returns `Content-Type: text/event-stream` and emits the
`GenerationEvent` union as SSE blocks (`event: <type>` / `data: <json>`). The client
reads that stream directly; there is no second reader for the AI SDK data stream, and no
category component branches on which protocol is in use.

The row is written in `queued` before the provider call, moved to `running` when the
provider call starts, and set to `succeeded` with an `outputUrl` once the asset is in
blob storage — or to `failed` with the provider message, never with key material. The
same row is what `GET /api/generations` returns, so the history panel and the live
stream read the same state.

### One endpoint, two durations

For **image**, the whole lifecycle happens inside the request: the provider answers with
bytes, the bytes are uploaded, the row is closed, and the `complete` event carries the
public URL. The request ends when the work is done.

For **video and music** (Phase 6), the request ends as soon as the provider accepts the
job — the `queued` and `progress` events cover the submission, and the job is then
observed by the polling path in ADR-0010. The endpoint and the event union do not
change; only the point at which the request ends does.

### The client keeps the stream and the row

The workspace reads the SSE stream for live progress and re-reads
`GET /api/generations?category=image` when the stream reports `complete`. The re-read is
what makes the gallery correct: the stream knows the URL of the run that just finished,
but the gallery is the full history, and the history is the row.

## Consequences

### Positive

- **One protocol on the wire for media.** Every media category answers with the same
  event union, in the same SSE framing, so the client has one reader.
- **The row is the single source of truth.** Live stream, history list, and the
  single-generation endpoint all read the same `generations` row, so they cannot
  disagree.
- **Short media does not pay the async cost.** An image does not need a second round of
  polling to be noticed; the request that started it is the request that finishes it.
- **The interface is ready for the long categories.** Phase 6 adds a provider that
  returns a job handle; the endpoint, the event union, and the row stay as they are.

### Negative / costs

- **The stream is the only live view.** If the tab closes mid-generation, the live
  progress is gone; the row remains and the history shows the outcome.
- **The image request holds a function for the length of the provider call.** Image
  providers are fast, but a slow provider is a slow request, and a large upload is
  inside that request too. A provider that takes minutes needs the Phase 6 path
  instead.
- **The upload happens inside the stream.** The `complete` event is only emitted after
  the asset is in blob storage, so a storage failure surfaces as an `error` event on a
  generation that the provider already completed.
- **Two reads of the same state.** The live stream and the history list are two
  requests for the same fact, and the history re-read is what the gallery renders.

### Neutral / follow-ups

- The `partial` variant of the union is defined but unused so far. It exists for the
  case where a provider streams preview bytes before the final asset; if no provider
  needs it, it should be dropped rather than left as dead protocol.
- The gallery renders `queued` and `running` rows as placeholders. A row in those states
  can only appear if the tab that started it closed, since the live stream is
  request-bound.

## Alternatives considered

**Reuse the AI SDK data stream for media.** Rejected: the SDK's data stream is a token
protocol, and a media provider produces a status lifecycle with an artefact at the end
of it. Expressing that as token deltas would be a translation layer with no meaning,
which is exactly what ADR-0005 rejected when it declined AG-UI.

**Create the row and return its id, then poll from the first moment.** Rejected for
image: it turns a two-second generation into a poll cycle, and the user watches an
empty panel instead of a progress bar. It remains the right shape for video and music
(ADR-0010).

**Skip the row for image generations and keep only the URL.** Rejected: the history
panel, the resume path, and the uniform category model in ADR-0006 all assume one row
per run. A category that skips the row is a category that has to be special-cased
everywhere else.

**Store the asset in Postgres instead of blob storage.** Rejected in ADR-0009: media in
the database makes the database the largest cost centre and turns delivery into a
database query.

## Revisit triggers

- **A provider returns image previews before the final asset** — then `partial` becomes
  load-bearing, and the upload path has to accept a partial before the full asset.
- **Image generation on a real provider regularly exceeds the function duration** — then
  image moves to the create-and-poll path of ADR-0010, and the streaming endpoint keeps
  only the submission events.
- **The gallery needs to show generations from other sessions mid-flight** — then the
  live stream is not enough, and the gallery has to poll the running rows.
