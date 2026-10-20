# ADR 0001: Next.js 16 App Router as the application framework

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI is a single deployable that has to do four things at once: render an
auth-gated dashboard, hold a user's decrypted provider key in memory while a third-party
API call streams back, serve a catalogue of models and providers, and expose route
handlers for generation jobs. The shape of the app pushes in a specific direction.

- **Streaming is a hard requirement.** Text and website generations stream token by token to
  the browser; image, video and music generations stream status events. Any framework that
  buffers the whole response before writing to the socket disqualifies the streaming path
  or forces a manual SSE endpoint around it.
- **Secrets must stay on the server.** Provider keys are decrypted inside route handlers
  (see ADR-0004) and are never serialised to the client. We need a server-side request
  model where the handler owns the secret for the lifetime of one request.
- **The component ecosystem is Next-first.** shadcn/ui (ADR-0002), the Vercel AI SDK
  (ADR-0005) and the Vercel deploy target all assume a Next.js App Router project. Adopting
  a different framework means fighting the documentation of every component we copy in.
- **One deploy.** Auth, database access, streaming routes and the UI ship together.
  A separate frontend and API means two deploys, two origins, and a CORS/auth boundary
  between them that buys us nothing.

Next.js 16.4.2 introduces changes that must be designed around rather than discovered
later. Verified against the version-matched docs shipped in the installed package
(`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` and
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/`):

- **Turbopack is stable and the default** for `next dev` and `next build`. The
  `--turbopack` flag is no longer needed, and a custom `webpack` config now fails the
  build unless you explicitly opt out with `--webpack`.
- **`middleware.ts` is deprecated and renamed to `proxy.ts`.** The exported function is
  named `proxy`. The `proxy` runtime is Node.js and **is not configurable** — the Edge
  runtime is not supported in `proxy`. Config flags carrying the old name were renamed
  too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`).
- **The `runtime` route segment config no longer offers a supported Edge runtime.**
  `'edge'` is marked deprecated in the config table; the documented path is to remove the
  `runtime` export entirely and use the default Node.js runtime.
- **`next lint` was removed and `next build` no longer runs the linter.** Linting is now
  an explicit script and an explicit CI step (see ADR-0008).
- **`cacheComponents` is optional and off by default** for this app. It is a partial
  prerendering model aimed at pages that mix static shells with dynamic holes; Poly-AI is
  auth-gated and per-user dynamic on nearly every route, so the model would fight the app
  rather than help it.

## Decision

We use **Next.js 16.4.2 with the App Router**, built with **Turbopack**, running on the
**Node.js runtime**, and deploy it as a single application to Vercel.

Concretely:

- All routes live under `src/app`, using the App Router file conventions (layouts, route
  handlers under `route.ts`, server components by default, `"use client"` only where
  interactivity requires it).
- Streaming endpoints are **Route Handlers** (`export async function POST(request: Request)`)
  that return a `Response` whose body is a stream. Text and website generations return the
  AI SDK data stream; media generations return an SSE stream of `GenerationEvent`s
  (ADR-0005, ADR-0006).
- We use the **Node.js runtime** everywhere. We do not set `export const runtime`, and we
  do not attempt Edge runtime. This is not a preference: the BYOK decryption path uses
  `node:crypto` for AES-256-GCM (ADR-0004), which has no Edge-compatible equivalent, and
  the `proxy` file is Node-only in Next 16 regardless.
- We use **`proxy.ts`** (not `middleware.ts`) for request interception, exporting a
  function named `proxy`.
- **`cacheComponents` is disabled.** The app is authenticated and per-user dynamic, so
  every meaningful route renders per request against the session and the user's own
  catalogue assignments. There is no static shell worth prerendering, and opting into
  Cache Components would add `connection()` requirements around environment reads for no
  cache hit we care about.
- Linting runs as a **separate script and CI step** (`pnpm lint` → `biome check .`), never
  as part of `next build`, because Next 16 no longer runs the linter during the build.

## Consequences

### Positive

- One deployable covers UI, auth, database access and streaming. No API gateway, no CORS
  configuration, no second origin to secure.
- Route handlers give us a clean place to hold a decrypted provider key for exactly one
  request. The key never crosses the server/client boundary by construction rather than by
  convention.
- Server Components keep the provider catalogue, the user's model assignments and the
  auth check off the client bundle by default.
- Vercel is a zero-config target: no Dockerfile, no build image, no runtime version
  pinning beyond the Node LTS requirement (Next 16 requires Node 20.9+).
- Turbopack by default means no separate `webpack`/`turbopack` config split to maintain.

### Negative / costs

- **We are Node-only.** If a future requirement demands an Edge runtime (geo routing,
  ultra-low-latency cold starts, or a deployment target that only supports Edge), Next 16
  cannot give it to us on the route-segment config path. The workarounds are an external
  service or a different framework — not a config flag.
- **We lose the built-in lint step.** A developer who runs only `next build` locally gets a
  green build with lint errors still present. This is mitigated by the husky + lint-staged
  pre-commit hook (ADR-0008) and a CI lint job, but it is a real footgun.
- **`proxy.ts` is a rename with sharp edges.** Any guide, snippet or mental model from
  Next 15 and earlier will be wrong about the filename and the export name. The upgrade
  codemod (`@next/codemod@next/upgrade`) handles it, but it is a migration cost for code we
  write later.
- **Cache Components being off means no partial prerendering.** Every page is a per-request
  render. At our scale this is a non-issue; it would become one if we added a public
  marketing surface to the same app.
- We accept the framework's release cadence. Next majors have carried breaking changes
  (`middleware` → `proxy`, `runtime` deprecation, `next lint` removal) and we track them.

### Neutral / follow-ups

- `next.config.ts` currently sets `cacheComponents: true` from the initial scaffold. It
  must be set to `false` (or the key removed) to match this ADR, and the `runtime` export
  must be absent from every route.
- Turbopack CSS handling is configured through the top-level `turbopack` key (the
  `experimental.turbopack` location is gone in 16).
- When writing code in this repo, read the version-matched docs in
  `node_modules/next/dist/docs/` first, as `AGENTS.md` instructs. The bundled docs are the
  authority; blog posts and older training data are not.

## Alternatives considered

**Vite + React SPA with a separate API server.** Rejected because it breaks the streaming
requirement at the framework level: a browser SPA talking to a JSON API needs either
polling, SSE plumbing written by hand, or fetch-response streaming bolted on manually.
It also loses Server Components, forcing catalogue and auth data to be fetched from the
client, and it means two deploys with an auth boundary between them. It is the right choice
for a pure read-heavy dashboard, which is not this app.

**Remix (now React Router 7) in framework mode.** Genuinely close. React Router 7 has
streaming loaders, is React-first, and would have satisfied the streaming requirement.
It was rejected because the surrounding stack is Next-first: the Vercel AI SDK's canonical
integration path, shadcn/ui's component installation and docs, and Vercel's own deployment
and observability tooling all assume Next.js. Choosing React Router would mean the app
runs against the ecosystem's second-best-supported path forever.

**A Bun-only runtime (Bun.serve + React).** Rejected on ecosystem grounds. Bun's runtime
APIs are close enough to Node for much of this app, but the AI SDK, Better Auth, Drizzle,
Playwright and the shadcn component scripts are all tested against Node. We would be
paying for Bun-specific advantages we do not need in exchange for debugging failures that
only happen on Bun.

**A separate SPA and a separate streaming API, deployed together.** This is the Vite
option with the split moved behind a reverse proxy. It preserves streaming but
reintroduces two codebases, and it forces us to re-implement the auth hand-off and CORS
policy that a single Next.js app gets for free.

## Revisit triggers

- **Next.js ships a major version with breaking App Router changes** that we cannot absorb
  with a codemod — a new rendering model, a new routing primitive, or a change to how
  route handlers stream responses.
- **We need a non-Node runtime** (Edge, or a target that only supports Edge) for a
  specific route, and the Node-only constraint on `node:crypto` (ADR-0004) cannot be
  removed by moving that work elsewhere.
- **The app becomes a multi-service architecture** — a separate frontend and a separate
  API that are deployed, versioned and scaled independently, where a single Next.js app
  stops being the right unit of deployment.
- We adopt a framework feature that requires a different build pipeline than Turbopack
  (for example a custom webpack loader that cannot be expressed as a Turbopack rule), and
  the `--webpack` escape hatch becomes the default.
