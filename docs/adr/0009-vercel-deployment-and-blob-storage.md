# ADR 0009: Vercel deployment with Upstash Blob behind a storage adapter

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI needs two independent things from its infrastructure:

1. **A host** for a streaming, multi-user Next.js application whose route handlers hold
   a decrypted provider key for the duration of a request and stream the provider's
   response back to the browser.
2. **Object storage** for the artefacts the app produces: images, videos and audio
   files. These are large, binary, and must be served back to the user over a URL that
   does not require the user to be authenticated to the storage provider.

The host choice constrains the storage choice, and both constrain the async design
(ADR-0006, ADR-0010). Concretely:

- **Function duration is the binding constraint.** Vercel's limits: **300 s default and
  300 s maximum on Hobby; 300 s default and 800 s maximum on Pro and Enterprise**; an
  extended maximum of **1800 s is in beta** for eligible plans. A 5-minute video
  generation plus provider queue time plus asset download does not fit comfortably in
  300 s, and even the 800 s ceiling is not a promise we want to design around.
  See https://vercel.com/docs/functions/limitations
- **`after()` does not escape the limit.** `after()` from `next/server` continues work
  after the response has been sent, which is useful for short post-response tasks, but it
  is still bounded by the function's duration. It cannot be the mechanism that waits for a
  5-minute video.
- **Video egress is expensive.** Generated video is the largest artefact class. The
  storage provider's egress pricing is the single largest infrastructure cost risk in
  this product, and it scales with usage rather than with user count.

## Decision

We **deploy to Vercel** and **store media in Upstash Blob behind a `StorageAdapter`
interface**.

### Hosting

- The app deploys to Vercel as a standard Next.js project: no Dockerfile, no container
  image, no infrastructure-as-code. The Git push is the deploy.
- The **Node.js runtime** is used everywhere (ADR-0001), which is also what the
  `node:crypto` key handling in ADR-0004 requires.
- We design around the function-duration limits rather than against them: asynchronous
  media work is a **resumable job row** (ADR-0006) observed by **client-driven polling**
  (ADR-0010), so no request ever has to stay open for the length of a video generation.
- We do not rely on `after()` for job completion. It may be used for short, best-effort
  follow-ups (a fire-and-forget provider submit, a bookkeeping write), but the job model
  does not depend on it.

### Storage

- **Media artefacts are stored in Upstash Blob.** The app never proxies large binary
  payloads through a route handler; it uploads to blob storage and stores the resulting
  URL on the `generations` row (ADR-0006).
- All storage access goes through a **`StorageAdapter` interface** with a small surface:
  upload (from bytes or from a provider URL), read metadata, delete, and produce a
  public URL. The Upstash Blob implementation is one adapter; the interface exists so
  the backing store can be swapped without touching application code.
- The adapter exists specifically so that **Cloudflare R2** — zero egress fees, and
  materially better economics for large video — is a **drop-in replacement**: implement
  the same interface, change the binding, deploy.

## Consequences

### Positive

- **Zero-config deploys.** The build output, the streaming route handlers, the database
  client (Neon Postgres over HTTP) and the storage bindings are configured as project
  environment variables, and a push to the main branch is a deploy.
- **Streaming works.** Vercel's platform supports streaming responses from route
  handlers, which is what the text and website categories need.
- **No media traffic through our functions.** Artefacts are served directly from blob
  storage, so a 50 MB video does not consume function duration or bandwidth.
- **The adapter keeps the storage decision reversible.** Migrating to R2 is a new
  implementation of a four-method interface plus a configuration change; no application
  code changes.
- **Neon Postgres + Upstash Blob + Vercel are all HTTP-based**, so there is no connection
  pool to manage and no VPC to configure.

### Negative / costs

- **Function duration caps what a single request can do.** We accept that no request may
  wait for a long video, and we pay for it with the polling model in ADR-0010 — which
  has its own costs (ADR-0010, ADR-0006).
- **Vercel's function-duration ceilings are plan-dependent**, so behaviour differs
  between a Hobby preview and a Pro production project. The design must not depend on
  the ceiling being 800 s.
- **Video egress on Upstash Blob is the main cost risk.** Serving generated video to
  users is metered egress, and it is the line item that grows fastest with usage. This
  is the reason the `StorageAdapter` boundary exists even though Upstash is a fine v1
  choice.
- **We are inside one hosting ecosystem.** Vercel is the deploy target, so a change of
  platform (or a need for a long-lived process, a custom runtime, or non-Next hosting)
  means a migration. ADR-0001 and ADR-0006 both assume this.
- **Vendor lock-in at the edges.** Vercel project settings, environment handling and
  deployment hooks are not portable to another host without rework.

### Neutral / follow-ups

- The `StorageAdapter` interface should be the only place that imports an Upstash Blob
  SDK, so that swapping to R2 is a single-module change.
- Artefact URLs stored on `generations.outputUrl` are permanent for now. If we later add
  signed URLs or expiry, the adapter is where that logic belongs.
- If egress becomes material, the migration path is: implement the R2 adapter, copy or
  re-point existing artefacts (or accept that old ones stay where they are), and change
  the binding.

## Alternatives considered

**Self-hosted Docker on a VPS.** Rejected for v1. It gives long-lived processes (which
would simplify the async story) and avoids platform limits, but it brings the whole
operations burden: patching, TLS, backups, monitoring, a process supervisor, and a
developer machine that cannot run the production shape. It also makes "open a PR" a
manual deploy. Zero-config deploys are worth more to us than long-lived processes,
because the async problem is already solved by the job model.

**Cloudflare R2 as the primary store.** Rejected as the v1 default, **kept as the first
migration target**. Its economics are better for video (no egress fees) and it has an
S3-compatible API. Against it: it is a different SDK and a different console, R2 requires
wrapping requests in Workers when binding directly to a Next.js route handler (rather
than using the HTTP API), and we would be adding a second cloud relationship. We already
have one Upstash relationship. The `StorageAdapter` is what keeps this a one-day change
rather than a rewrite.

**Vercel Blob.** Rejected as the storage store. It is the natural choice for a Vercel app
and integrates cleanly, but it is a Vercel-specific product rather than a general
S3-compatible store, so it trades portability for convenience. If we are already accepting
Vercel lock-in for hosting, it becomes a reasonable option — but Upstash Blob keeps the
storage layer vendor-neutral and its HTTP API is trivial from a serverless function.

**Storing media in Postgres (as bytea or base64).** Rejected. It would put multi-megabyte
video through the database connection, the migration layer and the backups, for no
benefit; it makes the database the largest cost centre; and it makes serving an artefact
mean a database query rather than a CDN request.

**A dedicated media service (Cloudinary, Mux, or a dedicated transcoding pipeline).**
Rejected for v1. It would solve egress and delivery elegantly, but it is another vendor
and another integration, and our artefacts are single files with no transcoding
requirement yet.

## Revisit triggers

- **Video volume or egress cost becomes material** — the storage bill is dominated by
  video egress, and the `StorageAdapter` makes the R2 migration a small change.
- **We need multi-region media delivery** — either because users are geographically
  distributed, or because a single-region store becomes a latency or availability
  problem.
- **We move off Vercel** for hosting (a long-lived-process requirement, cost at scale, or
  a platform preference), which forces the storage decision to be re-examined at the
  same time.
- **A plan change raises the function-duration ceiling** (for example the 1800 s extended
  maximum graduating from beta), which would change how much the polling model in
  ADR-0010 has to carry.
