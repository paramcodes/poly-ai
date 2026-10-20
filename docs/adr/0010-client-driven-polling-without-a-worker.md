# ADR 0010: Client-driven polling without a worker

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Video and music generations are long-running provider jobs (ADR-0006). The provider
keeps working after our HTTP request ends, but the result has to be **noticed**, and
something has to move it from "the provider has a file" to "the user has an artefact in
their history". On a serverless platform that "something" cannot be the request that
started the job:

- The function has a bounded lifetime — 300 s maximum on Hobby, 800 s on Pro
  (ADR-0009) — so a request that waits for a 5-minute video dies before the video does.
- A background worker or queue service (Trigger.dev, Inngest, QStash) would work, but it
  adds a vendor, a deployment surface, a monitoring story and a failure mode to a product
  that does not yet have the volume to justify any of it.
- `waitUntil()` continues work after the response, but is still bounded by the function's
  duration, so it is the wrong tool for the same reason.
- A cron-based poller needs a scheduler and a place to run the poller — which is a worker
  by another name.

What we want is a mechanism where **the job survives the request**, and where the
application can pick the job back up later, with no long-lived server-side process at all.

## Decision

**The client polls our own API; each poll drives one server-side status refresh.**

### The mechanism

1. The generation request creates a `generations` row in `queued`, submits the job to the
   provider, stores `providerExternalId` and `providerStatusUrl`, and sets the row to
   `running` (ADR-0006).
2. The client polls **`GET /api/generations/:id`** with TanStack Query, using a
   **`refetchInterval` of 5 seconds while the row is `running`** and no polling once it
   reaches a terminal state (`succeeded`, `failed`, `cancelled`).
3. Each poll triggers a **server-side refresh**: the route handler reads the row, asks the
   provider for the current status using the stored identifiers, and updates the row.
4. **On completion**, the server downloads the asset from the provider, uploads it to blob
   storage (ADR-0009), writes `outputUrl`, marks the row `succeeded`, and the client's
   polling stops.

### Why this is enough

The provider keeps working after our function dies. The job's state lives in the
database, not in a process. **The next poll picks the result back up** — whether that
poll happens 5 seconds later or 5 days later. There is no worker, no queue service, and no
dependency on `waitUntil`. The only thing the client drives is *observation*; it does not
drive the work.

The `GenerationEvent` union (ADR-0005) carries the same lifecycle to the UI — `queued`,
`progress`, `partial`, `complete`, `error` — so the streaming status and the polled status
are the same shape.

## Consequences

### Positive

- **No infrastructure to run.** No worker deployment, no queue provider, no scheduler, no
  new accounts. The entire async story is a table, a polling endpoint and a client
  `refetchInterval`.
- **The job outlives the request.** A function that is killed, times out or hits a cold
  start does not lose the job: the row stays `running`, the provider keeps working, and
  the next poll resumes from the stored identifiers.
- **The client is the natural place for the patience.** The user is already watching the
  panel; the poll interval is a UX knob we can tune without touching the server.
- **Polling is observable and debuggable.** The user sees live status in the panel, and
  the same status is queryable from the History panel later.
- **One status path.** The SSE stream during the request and the polled status
  afterwards agree, because both are the same `GenerationEvent` union over the same row.

### Negative / costs

- **The user must keep the tab open for the job to be *observed*.** This is the honest
  cost of the model. The provider still finishes and the result is still there — it is
  simply noticed on the next visit. The product must communicate this: the panel says
  "still processing" and the History panel shows a resumable `running` row.
- **A generation can sit in `running` for a long time.** Minutes, sometimes longer. We
  need a clear UI state for this, and eventually a policy for treating a long-stale
  `running` row as failed or as needing a re-check.
- **Every poll costs a provider API call.** At a 5-second interval, a 5-minute video is
  roughly 60 status calls per job, per observer. If several browser tabs are open on the
  same generation, the cost multiplies. Provider rate limits must tolerate this.
- **Polling is not push.** A completed job does not appear instantly in an open tab that
  has stopped polling; there is up to one interval of latency. This is invisible at
  5 seconds and would be annoying at 60.
- **The refresh path must be idempotent and guarded.** Two tabs polling the same
  generation must not double-download and double-upload the asset. The completion handler
  needs to be safe to run twice.

### Neutral / follow-ups

- **The History panel becomes the place to resume.** A generation started in one session
  and observed in another is a first-class case, not an edge case; the history list is
  where a `running` row is resumed.
- A server-side staleness sweep (re-check rows that have not changed in N minutes) is a
  natural follow-up but needs a scheduler — deferred until we have one.
- The poll interval should eventually be derived from the job's expected duration (fast
  for images, slow for video) rather than being a single global constant.

## Alternatives considered

**A background worker (Trigger.dev, Inngest, QStash).** Rejected for v1: real
infrastructure cost for a product without the volume to justify it. It remains the right
answer if we ever need guaranteed completion without a client connected, and the
`generations` row structure is already compatible with it — the row becomes the worker's
status mirror rather than the source of truth.

**Vercel Workflows.** Rejected for v1 for the same reason: it is designed for exactly
this problem, and it is a service dependency. It is the most natural upgrade path if
that dependency becomes acceptable, because the step names map cleanly onto our
submit → poll → download → upload sequence.

**`waitUntil()` inside the request.** Rejected as the job driver: it is bounded by the
function's duration, so a 5-minute video would be killed mid-flight. It remains useful
for short post-response work, such as a fire-and-forget provider submit.

**A cron poller.** Rejected: a cron job needs a scheduler and an execution environment,
which is a worker with an extra indirection, and it polls even when no user is waiting.

**Provider webhooks (call our endpoint when the job completes).** Not rejected on
principle — it is a strictly better notification mechanism than polling — but it is not
available uniformly: every provider adapter would need a different webhook contract, and
the AI SDK's `experimental_startVideo` supports a `webhookUrl` only for models that
implement `doStart`. Polling is the one mechanism every provider supports. Webhooks
become attractive as an optimisation once the adapter set is stable, and they would
coexist with the polling endpoint rather than replace it.

## Revisit triggers

- **We need guaranteed completion without a client connected** — the product requires
  that a generation finishes and lands in the user's history whether or not anyone is
  looking at the tab. This is the primary trigger for moving to a worker or to provider
  webhooks.
- **Job volume outgrows a single poll row** — for example if per-job provider status
  calls become a material cost, or if concurrent jobs make the polling load on our own
  API and on the providers significant.
- **We adopt a queue provider** (QStash, Trigger.dev, Inngest, Vercel Workflows), which
  makes the server-side refresh a worker step rather than a poll side effect.
- Provider rate limits make a 5-second poll interval unworkable, which would force a
  longer interval, an exponential backoff, or webhook notifications.
