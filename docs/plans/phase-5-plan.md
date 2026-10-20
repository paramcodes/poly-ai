# Phase 5 Implementation Plan — Image Generation and Gallery

## Spec and Scope
This plan implements Phase 5 of Poly-AI as specified in `todos.md`, `docs/glossary.md`, `docs/adr/0005-ai-sdk-v7-streaming-over-ag-ui.md`, `docs/adr/0006-resumable-job-model-for-async-media.md`, and `docs/adr/0009-vercel-deployment-and-blob-storage.md`:
1. **Adapter Registry & Image Generation Core**:
   - `src/lib/generation/events.ts`: Strongly typed `GenerationEvent` discriminated union (`queued`, `progress`, `partial`, `complete`, `error`) and SSE formatter/parser helpers.
   - `src/server/storage/index.ts`: `StorageAdapter` interface (`upload`, `delete`, `getUrl`) with Upstash/Vercel Blob remote implementation and deterministic in-memory/data-URL fallback for local dev and tests without cloud credentials.
   - `src/server/adapters/index.ts`: Image model adapter registry resolving user provider configurations (`openai-compatible`, `openai`, `custom`, and deterministic mock/test keys) to an AI SDK compatible `ImageModel`.
   - `src/server/generation/image.ts`: Generation orchestrator creating `generations` rows in Postgres, invoking `generateImage()`, uploading resulting image bytes to blob storage, updating the generation record (`succeeded` / `failed`), and emitting typed `GenerationEvent`s over SSE.
2. **Generation & History API Routes**:
   - `POST /api/generate/image`: SSE streaming endpoint authenticated via `getCurrentUser()`, validating request body (`prompt`, `providerId`, `modelId`, optional `aspectRatio` / `size`), and returning `text/event-stream` with `GenerationEvent` sequence.
   - `GET /api/generations`: Listing endpoint returning past generations filtered by `category` and user ID, ordered by `createdAt DESC`.
   - `GET /api/generations/[id]`: Retrieval endpoint for a single generation record.
3. **Image Workspace & Gallery UI**:
   - `src/components/app/image-workspace.tsx`: Dedicated workspace for the Image category featuring:
     - Prompt bar with textarea, aspect ratio selector (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`), and Generate button.
     - Live generation state: displays current progress with visual stages (`Queued`, `Generating`, `Uploading`, `Complete`).
     - Image gallery: responsive grid of past generated images with prompt snippets, timestamp, model badge, lightbox/preview dialog, copy prompt, and download action.
   - Integration in `src/components/app/category-view.tsx` mounting `ImageWorkspace` when `category === "image"`.
4. **Verification & Evidence**:
   - Comprehensive unit tests: `tests/unit/generation-events.test.ts`, `tests/unit/storage.test.ts`, `tests/unit/image-adapter.test.ts`, `tests/unit/generate-image-route.test.ts`, `tests/unit/image-workspace.test.tsx`.
   - Playwright E2E tests: `tests/e2e/image.spec.ts`.
   - Evidence capture script and artifacts under `docs/evidence/phase-5/`.
   - Verification gate check and `todos.md` update.

## Global Constraints
- Framework: Next.js 16.4.2 App Router, React 19.3, Tailwind v4.
- AI SDK: `ai@^7` (`generateImage`), `@ai-sdk/openai-compatible`.
- Streaming protocol: SSE (`text/event-stream`) emitting JSON-encoded `GenerationEvent` payloads.
- Security: Never expose decrypted API keys to the browser.
- Storage: `StorageAdapter` abstraction cleanly separating application code from storage backend.
- UI: Radix / shadcn components in `src/components/ui/` (`dialog.tsx`, `card.tsx`, `button.tsx`, `badge.tsx`, `textarea.tsx`, `select.tsx`, etc.).
- Testing: Vitest (`pnpm test`), Playwright (`pnpm test:e2e`), Biome (`pnpm lint`), TypeScript (`pnpm typecheck`).
- Commits: Max 3000 tokens per commit. Conventional commits with explanatory body.

---

## Tasks Breakdown

### Task 1: Generation Events and Storage Adapter
- `src/lib/generation/events.ts`:
  - `GenerationEvent` type:
    ```ts
    export type GenerationEvent =
      | { type: "queued"; generationId: string }
      | { type: "progress"; generationId: string; progress: number; message?: string }
      | { type: "partial"; generationId: string; url?: string; base64?: string }
      | { type: "complete"; generationId: string; outputUrl: string; metadata?: Record<string, unknown> }
      | { type: "error"; generationId?: string; error: string };
    ```
  - `formatSSEEvent(event: GenerationEvent): string`
  - `parseSSEStream(stream: ReadableStream): AsyncGenerator<GenerationEvent>`
- `src/server/storage/index.ts`:
  - `StorageAdapter` interface:
    ```ts
    export interface StorageAdapter {
      upload(options: { pathname: string; body: Buffer | Uint8Array; contentType?: string }): Promise<{ url: string; pathname: string }>;
      delete(url: string): Promise<void>;
      getUrl(pathname: string): string;
    }
    ```
  - `UpstashBlobStorageAdapter` and `MemoryStorageAdapter`.
  - `getStorageAdapter()` returning singleton adapter.
- Unit tests in `tests/unit/generation-events.test.ts` and `tests/unit/storage.test.ts`.

### Task 2: Image Adapter Registry and Image Generation Service
- `src/server/adapters/index.ts`:
  - `getImageModel({ kind, apiKey, baseUrl }, modelId: string): ImageModel`
  - Handles mock/test keys deterministically.
- `src/server/generation/image.ts`:
  - `createImageGenerationStream(options)`:
    - Verifies user ownership of model assignment and provider.
    - Decrypts API key.
    - Inserts `generations` row with `status: "queued"`.
    - Creates a `TransformStream` or `ReadableStream` emitting SSE events.
    - Transitions to `running` with `progress` events.
    - Calls `generateImage({ model, prompt, ... })`.
    - Uploads bytes via `getStorageAdapter().upload(...)`.
    - Updates `generations` row to `status: "succeeded"` and `outputUrl`.
    - Emits `complete` event.
    - On failure, marks row `failed` with error message and emits `error` event.
- Unit tests in `tests/unit/image-adapter.test.ts`.

### Task 3: API Routes for Image Generation and Generation History
- `src/app/api/generate/image/route.ts`:
  - Handles `POST` requests.
  - Validates session, JSON payload (`prompt`, `providerId`, `modelId`, optional `aspectRatio`).
  - Returns SSE stream response with appropriate headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`).
- `src/app/api/generations/route.ts`:
  - Handles `GET /api/generations?category=image`.
  - Queries `generations` table for `userId` and `category`, sorted by `createdAt DESC`.
- `src/app/api/generations/[id]/route.ts`:
  - Handles `GET /api/generations/:id`.
  - Returns single generation record if owned by user.
- Unit tests in `tests/unit/generate-image-route.test.ts`.

### Task 4: Image Workspace and Gallery UI
- `src/components/app/image-workspace.tsx`:
  - Client component managing prompt state, generating state, live stream reader, and historical gallery.
  - Image generation form with prompt textarea, aspect ratio select, and submit button.
  - Live progress display during active generation (stages: Queued -> Generating -> Uploading -> Complete).
  - Gallery grid rendering completed generations with image preview, date, prompt preview, copy prompt, and download buttons.
  - Lightbox / preview dialog for viewing full-size image.
- Mount `ImageWorkspace` in `src/components/app/category-view.tsx` when `category === "image"`.
- Unit tests in `tests/unit/image-workspace.test.tsx`.

### Task 5: End-to-End Tests, Evidence, and Gate Verification
- E2E tests in `tests/e2e/image.spec.ts`:
  - Seed user, provider, and image model.
  - Navigate to `/app/image`.
  - Trigger image generation with mock provider.
  - Verify live status transitions from progress to complete.
  - Verify new generation appears in gallery with preview.
- Evidence capture script update and capture into `docs/evidence/phase-5/`.
- Run full verification: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.
- Update `todos.md`.
