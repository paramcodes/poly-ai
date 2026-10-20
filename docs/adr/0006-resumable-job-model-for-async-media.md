# ADR 0006: Resumable job model for asynchronous media

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Text generation completes in seconds and is served as a streaming HTTP response. Media
generation does not. **Video generation typically takes 30 seconds to 5 minutes**, and the
providers that do it well are asynchronous: you submit a job, get an id back, and poll for
the result. Music generation has the same shape.

That shape does not fit a request/response serverless function, and it does not fit our
deployment target either. On Vercel, a function's lifetime is bounded — 300 s maximum on
Hobby, 800 s maximum on Pro — and a 5-minute video generation can exceed that, can lose
the race against a cold start, and can be killed by a platform-side timeout while the
provider is still working. The provider does not care: it keeps rendering our video, and
its result exists whether or not our function was still alive to receive it.

The SDK situation shapes the adapter work:

- **The AI SDK v7 video API exists but is experimental.** In the installed `ai@7.0.145`
  the exports are `experimental_generateVideo` (which accepts a `poll` option),
  `experimental_startVideo` — a fire-and-forget counterpart that returns an opaque
  `operation` reference and is explicitly designed for "a process that will not stay
  alive" — and `experimental_getVideoStatus`, which takes that `operation` and returns the
  current status. The `experimental_` prefix is a real constraint on how much we build on
  top of it.
- **`@ai-sdk/openai-compatible` exposes no video model factory.** Its provider interface
  offers `imageModel()` but nothing for video. Video therefore needs dedicated adapters
  — fal, Replicate, Google — outside the OpenAI-compatible path that covers most of the
  provider long tail (ADR-0003).
- **There is no AI SDK music or song API at all.** `generateSpeech` is text-to-speech, not
  song generation, and a TTS endpoint is not a substitute for a music model.
- **The supported 2026 music APIs are fal.ai and Replicate.** fal.ai fronts MiniMax Music
  2.x, ACE-Step, Stable Audio, ElevenLabs Music and Sonauto behind a single key and a
  single integration pattern on a pay-per-use basis. Replicate hosts `meta/musicgen` and
  `minimax/music-2.5`. Both are queue-based, exactly like the video providers.
- **Suno and Udio have no official developer API in 2026.** Only unofficial wrappers
  exist, and they break. Building on them would mean shipping something that fails
  without warning and cannot be supported.

## Decision

**We model asynchronous work as a row in a `generations` table, and the client drives the
lifecycle.** No worker, no queue service, no long-lived process.

### The record

Every generation — including synchronous image generations — creates a row:

| Field | Purpose |
| --- | --- |
| `id` | Primary key, exposed to the client |
| `category` | `text` \| `image` \| `video` \| `music` \| `website` |
| `providerId` | The provider the generation was sent to |
| `modelId` | The model that was selected |
| `status` | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` |
| `providerExternalId` | The provider's job id (the `operation` reference, the fal request id, …) |
| `providerStatusUrl` | The provider's status endpoint, when the provider exposes one |
| `outputUrl` | The blob-storage URL of the finished asset, once uploaded |
| `error` | Failure reason, provider message included, key material excluded |

Synchronous generations (text, image) move through `queued → running → succeeded` inside
the same request; only the *observation* of the transition differs. Keeping one row shape
for all categories means history, asset references and resumption logic are uniform.

### The lifecycle

1. The client sends a generation request. The server decrypts the provider key
   (ADR-0004), creates the `generations` row in `queued`, and returns its id.
2. The server submits the job to the provider, stores `providerExternalId` and
   `providerStatusUrl`, and moves the row to `running`. The submission is **fire and
   forget** relative to the provider: we do not wait for the asset.
3. The provider keeps working even if our function dies. **The job is not owned by the
   request that started it.**
4. The client polls our own `GET /api/generations/:id` (ADR-0010). Each poll triggers a
   server-side refresh that asks the provider for the current status using the stored
   identifiers.
5. On completion the server downloads the asset, uploads it to blob storage (ADR-0009),
   sets `outputUrl`, marks the row `succeeded`, and the polling stops.

The status transition is what the `GenerationEvent` union carries to the client
(ADR-0005): `queued`, `progress`, `partial`, `complete`, `error`.

### Provider choices

- **Music: fal.ai is the first-party provider.** One key, one integration pattern, five
  usable models behind it, pay-per-use pricing. **Replicate is the second adapter**
  (`meta/musicgen`, `minimax/music-2.5`). We do not integrate Suno or Udio: no official
  developer API exists in 2026, and unofficial wrappers are not a foundation we can ship
  on.
- **Video: dedicated adapters** (fal, Replicate, Google). The
  `@ai-sdk/openai-compatible` path covers images and text, not video.

## Consequences

### Positive

- **Long generations survive.** The provider owns the work; we own the bookkeeping. A
  function that is killed, times out or is cold-started does not lose the job — the next
  poll picks it back up.
- **No worker or queue service in v1.** No Trigger.dev, no Inngest, no QStash, no
  separate deployment, no new vendor account, no queue monitoring. The entire async
  story is a table and a polling endpoint.
- **The model is honest about the platform.** We do not pretend a serverless function can
  hold a 5-minute job open, and we do not depend on `waitUntil` to do it.
- **It degrades gracefully.** If the client closes the tab, the row stays `running` and
  is picked up on the next visit — no lost work, just delayed observation.
- **One uniform history model** across all five categories, which the History panel and
  the resume path both depend on.

### Negative / costs

- **The user must keep the tab open to observe completion.** The provider still finishes;
  the result is simply noticed later. This is the main behavioural cost of the
  client-driven model (ADR-0010).
- **Rows sit in `running` for a long time.** A generation can be `running` for minutes
  with no server-side process attached. We need a clear UI state for this and a policy
  for how long a row may remain `running` before it is treated as stale.
- **We do not use the AI SDK's video helpers as-is.** `experimental_startVideo` and
  `experimental_getVideoStatus` are the right shape, but they are experimental APIs, so
  our adapter depends on a surface that may change. The `generations` row is the
  contract that keeps us insulated: the provider-specific operation handle is stored in
  a column, not baked into the application logic.
- **Status polling costs a provider API call per poll.** With a 5-second poll interval,
  a 5-minute video is ~60 status calls per job. Provider rate limits and cost per status
  call must be considered when choosing the interval.
- **Asset download and upload happen inside a poll request**, which means the poll that
  observes completion also performs the transfer. For a large video this can approach the
  function duration limit, so the download must be bounded and the transfer must be
  resumable or retried.
- **Music has no standardised interface.** Each of fal's five models and both Replicate
  models has its own parameters, so the music category needs a per-model parameter
  schema rather than one uniform form.

### Neutral / follow-ups

- The `generations` table is the shared spine of ADR-0005 (event union), ADR-0009
  (storage) and ADR-0010 (polling). Changes to its shape ripple across all three.
- Because the video API in `ai@^7` is experimental, we should track its graduation to a
  stable `generateVideo` and re-evaluate the adapter boundary when it happens.
- A stale-`running` sweeper (rows with no status change for N minutes, re-checked once)
  is a natural follow-up, but it needs a scheduler — defer until we have one.

## Alternatives considered

**A blocking request with a long `maxDuration`.** Rejected. Vercel caps a function at
300 s (Hobby) or 800 s (Pro); a 5-minute video plus provider queue time plus asset
download crosses that line regularly, and when it fails the user gets an error and the
provider's work is wasted. It also ties up a function for the whole wait, which is
exactly the resource a serverless platform prices by duration.

**A dedicated queue service (QStash, Trigger.dev, Inngest).** Rejected for v1, not on
principle. It is the correct answer at volume — durable retries, scheduled jobs, batch
dispatch, observability — and it costs a new account, a new dependency, a new deployment
surface and a new failure mode. With no traffic to speak of, the `generations` table plus
client polling delivers the same observable behaviour for a fraction of the moving parts.

**`waitUntil()` from `next/server`.** Rejected as the primary mechanism: it continues
work after the response is sent, but it is still bounded by the function's maximum
duration, so a long video would be killed at exactly the same limit. It is useful for
short post-response work (a fire-and-forget submit) but cannot be the job model.

**A long-lived background process (a container that stays up on a VPS).** Rejected: it
reintroduces the operational burden we avoided by targeting serverless deployment
(ADR-0009), and it is a single point of failure for every queued job.

**Blocking on the provider with the SDK's own polling helper** (`experimental_generateVideo`
with `poll`). Rejected as the job model for the same reason as the blocking request, but
kept as a possible fast path for providers whose queues are reliably short — the
`generations` row structure does not prevent using it inside the poll handler.

## Revisit triggers

- **Video volume becomes sustained** — enough concurrent jobs that client-driven polling
  produces noticeable provider API traffic, or enough that a generation is often missed
  because no client was open.
- **We need guaranteed completion without a client connected** — the product requires
  that a generation finishes and lands in the user's history whether or not they are
  looking at the tab.
- **We adopt a queue provider** (QStash, Trigger.dev, Inngest, Vercel Workflows), at
  which point the `generations` row becomes the queue's status mirror rather than the
  queue itself.
- **The AI SDK's video API graduates out of `experimental_`**, or a provider offers a
  true webhook callback, changing the polling contract in ADR-0010.
