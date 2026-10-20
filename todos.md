# Poly-AI — Progress

> Updated at the end of every session. Read this first, then `docs/README.md`.
> This file is the single source of truth for where the project is.

## Current phase

**Phase 6 — Video and music** · status: complete
Branch: `phase/6-video-and-music` · PR: #4

## Legend

`[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked · `[-]` dropped

## Phase 0 — Bootstrap

- [x] `create-next-app` — Next 16.4.2, React 19.3, Tailwind v4, App Router, Turbopack
- [x] `shadcn init -b radix` — `style: radix-nova`, neutral base, lucide icons
- [x] Base components — sidebar, resizable, dialog, select, tabs, sonner, input,
      textarea, card, badge, table, dropdown-menu, separator, tooltip, scroll-area,
      skeleton, label, alert
- [x] Chat components — message-scroller, message, bubble, attachment, marker
- [x] Biome config with the `next` and `react` domains enabled — `biome.jsonc`
      (the `.jsonc` extension is required; Biome parses `biome.json` as strict
      JSON and rejects the comments)
- [x] husky hooks + lint-staged + commitlint (Conventional Commits)
- [x] **Commit-size gate** — `scripts/check-commit-size.ts`, 3000-token limit,
      binary penalty, exemptions for the lockfile and committed evidence
- [x] **Commit-message body rule** — `scripts/check-commit-message.ts`, a body is
      required once a commit passes 150 tokens
- [x] Vitest (unit + opt-in integration) and Playwright (e2e) configured
- [x] End-to-end suite for the landing page — `tests/e2e/landing.spec.ts`
- [x] `docs/README.md`, `docs/glossary.md`, `docs/guides/working-on-this-repo.md`
- [x] `docs/adr/0000`–`0010` — the decision records
- [x] `AGENTS.md`, `todos.md`, `.env.example`, `.github/pull_request_template.md`
- [x] Landing screen with the category launcher and a shell preview
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green
- [x] `pnpm test:e2e` green — 4 tests
- [x] Evidence capture — screenshots under `docs/evidence/phase-0/`
- [x] Open the PR, run the verification gate, self-merge

## Phase 1 — Data and auth

- [x] Drizzle schema: `providers`, `models`, `generations` (+ Better Auth tables)
- [x] First migration, Neon connection, `drizzle.config.ts`
- [x] Better Auth — email/password, optional GitHub + Google OAuth, Drizzle adapter
- [x] `proxy.ts` guarding `/app/**` and `/settings/**`
- [x] Sign-in and sign-up pages
- [x] AES-256-GCM key envelope (`src/lib/crypto/keys.ts`) with unit tests

## Phase 2 — Catalogue and providers

- [x] `GET /api/catalog` — models.dev proxy, 6 h cache, committed snapshot fallback
- [x] `src/lib/capabilities.ts` — `modalities.output` → category mapping
- [x] Provider CRUD with encrypted key storage
- [x] "Add provider" form — known-provider combo + custom OpenAI-compatible
- [x] Model assignment table with capability gating
- [x] Provider verification probe
## Phase 3 — App shell and categories

- [x] Collapsible sidebar, state persisted
- [x] Category routes `/app/[category]`
- [x] Model picker
- [x] Empty-state toast contract — amber for "not configured", red for "failed"
- [x] `src/lib/toast.ts` + `notifyCategoryEmpty` with unit tests

## Phase 4 — Text and website streaming

- [x] `POST /api/generate/text` and `/api/generate/website` — AI SDK data stream
- [x] `useChat` wiring with `prepareSendMessagesRequest`
- [x] Website route — `ResizablePanelGroup`, prompt pane beside preview pane
- [x] `src/lib/website/extract-html.ts` with unit tests
- [x] Sandboxed `iframe` preview with live streaming updates and device toggles
- [x] Code tab, copy, download

## Phase 5 — Image

- [x] `generateImage` through the adapter registry — `src/server/adapters/index.ts`
- [x] Blob upload through the `StorageAdapter` — Upstash Blob SDK
- [x] `GenerationEvent` SSE stream — `src/lib/generation/events.ts`
- [x] `generations` row per run, `GET /api/generations` history
- [x] Gallery rendering — cards, lightbox, copy prompt, download
- [x] ADR-0011 — media generation streams its lifecycle over SSE

## Phase 6 — Video and music

- [x] Resumable job model — `createMediaJob`, `refreshMediaJob`, `retryMediaJob`
      in `src/server/generation/job.ts`, on the existing `generations` row
- [x] fal.ai and Replicate queue adapters behind one `AsyncJobAdapter`
- [x] TTS through `generateSpeech` — `src/server/adapters/speech.ts`
- [x] Media players, history panel with retry — `media-history.tsx`
- [x] Video and music workspaces, polling every five seconds
- [x] ADR-0012 — one adapter interface for asynchronous media jobs
- [x] Feature docs — `docs/features/video.md`, `docs/features/music.md`
- [x] End-to-end test and phase-6 evidence

## Phase 7 — Polish and CI

- [ ] Empty-state illustrations, skeletons, keyboard shortcuts
- [ ] Reduced-motion audit
- [ ] GitHub Actions — lint, typecheck, test, build, commit-size check
- [ ] README with the BYOK walkthrough

## Blockers and open questions

- (none)

## Notes carried forward

- models.dev's per-model `type` field is null for 9,029 of 9,079 models (~99%) —
  always use `modalities.output` for capability detection. Measured 2026-10-20.
- Live models.dev counts (2026-10-20): 232 providers, 9,079 models. Output
  modalities — text 8,710, image 101, text+image 97, video 73, audio 47,
  text+audio 33. 30 providers offer image output, 23 offer audio output, 10 offer
  video output.
- `api` (base URL) is present on 207 of 232 providers, and on all 193
  OpenAI-compatible ones. `env` is non-empty on all 232. `status: "deprecated"`
  on 301 models, `canonical_model_id` on 6,197, a partial `cost` field on 8,625.
- 193 of 232 providers are `@ai-sdk/openai-compatible`, and that package supports
  `.imageModel()` — so most providers are one adapter, not 193.
- AI SDK v7 video is **experimental**: `experimental_generateVideo`,
  `experimental_startVideo`, `experimental_getVideoStatus`. There is no stable
  `generateVideo` in v7.
- `@ai-sdk/openai-compatible` exposes no video model factory — video needs a
  dedicated adapter (fal / Replicate / Google).
- `useChat` with `DefaultChatTransport` is chosen and adopted for all streaming in Phase 4 (ADR-0005).
- Media categories do **not** use the AI SDK data stream. They answer with a
  `text/event-stream` of `GenerationEvent`s (`event: <type>` / `data: <json>`).
  See ADR-0005 and ADR-0011.
- `@upstash/blob@0.0.11` is the SDK behind the `StorageAdapter`. Its `Bucket`
  validates the token format eagerly, so the adapter builds the bucket lazily.
  The env var is `UPSTASH_BLOB_TOKEN` (not Vercel Blob's
  `BLOB_READ_WRITE_TOKEN`). A private bucket has no public URL — the adapter
  throws rather than storing an empty `outputUrl`.
- The AI SDK image model interface in `ai@7.0.145` is `ImageModelV2`; a v3 or v4
  mock needs a `response` field with `timestamp`, `modelId` and `headers`.
- There is no AI SDK music API. Songs need a fal.ai or Replicate queue adapter.
- `@ai-sdk/openai-compatible@2` ships **no** speech model — no `speechModel()` on
  the provider — so text-to-speech is a hand-written `SpeechModelV2` that posts to
  the OpenAI `/audio/speech` endpoint. `ai@7` does not re-export `SpeechModelV2`
  either; it lives in `@ai-sdk/provider`.
- Video and music are observed by **polling** `GET /api/generations/:id`, not by
  SSE. Only the image category streams `GenerationEvent`s. The reason is that a
  job that runs for minutes outlives the request that started it.
- The music category has two mechanisms: a song is a queued job, voice is
  rendered inside the request. Both write a `generations` row with the category
  `music`.
- For the website allowlist, match the catalogue's real `family` tokens
  (`claude-sonnet`, `gpt-codex`, `qwen3.5`, …), not model-id substrings.
- AG-UI is not adopted; AI SDK v7's own streaming is the protocol. See ADR-0005.
- The `edge` runtime is unavailable in Next 16; key decryption uses `node:crypto`,
  so routes stay on Node.
- `next build` no longer lints, so `pnpm lint` is a separate step in CI.
- `pnpm typecheck` runs `next typegen` first — generated route types are required.
- `cacheComponents` and `partialPrefetching` are off: the app is auth-gated and
  per-user dynamic, and `partialPrefetching` requires `cacheComponents`.
- The shadcn Base UI changelog is at
  `https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default`. Init with
  `pnpm dlx shadcn init -b radix`; this repo pins `"style": "radix-nova"`.
- `src/components/ui/` is vendored shadcn code — Biome's `noDocumentCookie` and
  `useExhaustiveDependencies` rules are relaxed there so `shadcn add` can
  overwrite files without a merge conflict.
- The repository is public: committed evidence must never contain a real key,
  a real email, or real user data.
- **Biome's config file must be `biome.jsonc`.** Biome parses `biome.json` as
  strict JSON and rejects the comments the config carries. A config that fails
  to parse is not a warning — Biome silently falls back to its defaults, which
  format the whole repo to the wrong style and lint the build output in
  `.next/`. Symptom seen on 2026-10-20: `pnpm lint` reported 5,863 errors,
  checked 171 files and took 270s. With the config loading it checks 51 files
  in under a second.
- **The commit-size gate must read the diff with `--no-prefix`.** A global
  `diff.mnemonicPrefix` (or `diff.noprefix`) rewrites the `a/`/`b/` prefixes
  the gate matches on, so every text file counts as 0 tokens and the 3000-token
  rule stops existing. On 2026-10-20 the gate reported 2,000 tokens for a
  77,483-token staged diff. Fixed with `--no-prefix`, plus a unit test.
- **The app themes with a `dark` class on `<html>`, not `prefers-color-scheme`.**
  `page.emulateMedia({ colorScheme: "light" })` changes nothing on screen;
  drive the theme toggle instead. Evidence captured with the wrong method
  produced byte-identical "light" and "dark" screenshots.
- **Port 3000 on this machine is not always Poly-AI.** Another project may
  hold it. `pnpm evidence` now asserts the document title before capturing, so
  a screenshot of the wrong app fails loudly instead of landing in the PR.
- `.env.example` is committed; `.env*` in `.gitignore` needed a `!.env.example`
  exception, or the template was untrackable.
