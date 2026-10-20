# Phase 4 Implementation Plan — Text and Website Streaming

## Spec and Scope
This plan implements Phase 4 of Poly-AI as specified in `todos.md`, `docs/glossary.md`, `docs/adr/0005-ai-sdk-v7-streaming-over-ag-ui.md`, and `docs/adr/0007-iframe-srcdoc-over-sandpack.md`:
1. `src/lib/website/extract-html.ts` deterministic HTML extraction from model output with unit tests covering fenced blocks, raw documents, HTML fragments, and fallbacks.
2. `POST /api/generate/text` and `POST /api/generate/website` route handlers using AI SDK v7 `streamText` and `toUIMessageStreamResponse()`, session validation, and on-demand provider key decryption.
3. Chat streaming client infrastructure and Text category workspace in `/app/text` using `useChat` and `DefaultChatTransport` with `prepareSendMessagesRequest`, message rendering with chat bubbles, markdown support, auto-scroll, and prompt controls.
4. Website category workspace in `/app/website` with `ResizablePanelGroup`, sandboxed iframe preview with `srcDoc` and `sandbox="allow-scripts allow-forms allow-popups"`, debounced streaming updates (~400ms) with immediate completion update, device width toggles (Desktop 1280px, Tablet 768px, Mobile 390px), Code tab with syntax display, copy to clipboard, and HTML download.
5. Verification, Playwright E2E tests for text and website generation and preview, evidence capture into `docs/evidence/phase-4/`, ADR-0005 decision record update, and `todos.md` status update.

## Global Constraints
- Framework: Next.js 16.4.2 App Router, React 19.3, Tailwind v4.
- AI SDK: `ai@^7` (`streamText`, `DefaultChatTransport`), `@ai-sdk/react@^4` (`useChat`), `@ai-sdk/openai-compatible`.
- Streaming protocol: AI SDK data stream (`toUIMessageStreamResponse()`).
- Security: Sandboxed iframe with `sandbox="allow-scripts allow-forms allow-popups"` (strictly NO `allow-same-origin`). Key decryption server-side only; never send API keys to browser.
- Icons: `lucide-react`.
- UI: Radix / shadcn components in `src/components/ui/` (`resizable.tsx`, `tabs.tsx`, `button.tsx`, `card.tsx`, etc.).
- Testing & Quality: Vitest (`pnpm test`), Playwright (`pnpm test:e2e`), Biome (`pnpm lint`), TypeScript (`pnpm typecheck`).
- Commits: Max 3000 tokens per commit. Imperative subject ≤ 72 chars, conventional commits with body explaining why.

---

## Task 1: HTML Document Extraction Utility and Unit Tests

### Description
Implement `src/lib/website/extract-html.ts` to deterministically extract clean standalone HTML documents from model output per ADR-0007:
1. Extraction precedence:
   - Fenced code block (```` ```html ```` or ```` ```htm ````): extract content of the block.
   - Raw HTML: find first `<!DOCTYPE html` or `<html` (case-insensitive) and extract through the last `</html>`.
   - HTML Fragment: if output contains `<body` or `<div` or `<main` fragment, wrap in minimal HTML shell:
     ```html
     <!DOCTYPE html>
     <html lang="en">
     <head>
       <meta charset="utf-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>Preview</title>
     </head>
     <body>
       {fragment}
     </body>
     </html>
     ```
   - Fallback: minimal error document explaining that the model did not emit valid HTML.
2. Cleanups:
   - Strip leading/trailing markdown fences and commentary preceding `<!DOCTYPE` or `<html>`.
   - Handle incomplete HTML during active streaming gracefully without crashing (e.g. unclosed tags during stream still render best-effort or extract whatever document/fragment exists).
3. Unit tests in `tests/unit/extract-html.test.ts`:
   - Fenced ```` ```html ```` document with prose before and after.
   - Fenced ```` ```htm ```` block.
   - Unfenced raw document starting with `<!DOCTYPE html>` or `<html>` and ending with `</html>`.
   - Fragment with `<div class="hero">...</div>`.
   - Incomplete streaming chunks.
   - Pure prose with no HTML (triggers fallback error document).

### Acceptance Criteria
- `src/lib/website/extract-html.ts` exports `extractHtml(rawOutput: string): string`.
- `tests/unit/extract-html.test.ts` passes 100% with comprehensive cases.
- `pnpm lint` and `pnpm typecheck` pass.

---

## Task 2: Generation API Routes (Text & Website)

### Description
Implement streaming route handlers:
1. `src/server/generation/stream.ts`:
   - Helper function `createStreamingGeneration({ userId, category, providerId, modelId, messages })`:
     - Validates user ownership of model assignment and provider.
     - Fetches provider record and decrypts API key via `decryptApiKey`.
     - Instantiates `@ai-sdk/openai-compatible` client with `provider.name`, `apiKey`, and `provider.baseUrl`.
     - Sets system prompt appropriate for category:
       - For `text`: neutral assistant system prompt or user-provided messages.
       - For `website`: strong system prompt directing model to output a single, complete, responsive HTML document with modern inline styling/Tailwind CDN or `<style>` and interactive `<script>`, self-contained.
     - Calls `streamText({ model, system, messages })`.
     - Returns `result.toUIMessageStreamResponse()`.
2. `src/app/api/generate/text/route.ts`:
   - Handles `POST` requests.
   - Authenticates session via `getCurrentUser()`.
   - Validates JSON payload `{ messages, providerId, modelId }`.
   - Invokes `createStreamingGeneration` for category `"text"`.
3. `src/app/api/generate/website/route.ts`:
   - Handles `POST` requests.
   - Authenticates session via `getCurrentUser()`.
   - Validates JSON payload `{ messages, providerId, modelId }`.
   - Invokes `createStreamingGeneration` for category `"website"`.
4. Unit/integration tests in `tests/unit/generate-routes.test.ts` mocking `streamText` or using `MockLanguageModelV4`.

### Acceptance Criteria
- Both `/api/generate/text` and `/api/generate/website` return 401 for unauthenticated requests.
- Both endpoints validate required parameters and return 400 for missing `messages` or `providerId`/`modelId`.
- Both endpoints successfully stream responses with `toUIMessageStreamResponse()`.
- Server keys never leak in headers or responses.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

---

## Task 3: Text Streaming UI and Chat Wiring

### Description
Implement chat streaming workspace for text generation:
1. `src/components/app/text-workspace.tsx`:
   - Uses `useChat` from `@ai-sdk/react` configured with:
     ```ts
     new DefaultChatTransport({
       api: "/api/generate/text",
       prepareSendMessagesRequest: ({ messages, body }) => ({
         body: {
           messages,
           providerId: selectedModel.providerId,
           modelId: selectedModel.modelId,
           ...body,
         },
       }),
     })
     ```
   - Tracks messages state with user and assistant turns.
   - Uses `src/components/ui/message-scroller.tsx`, `message.tsx`, and `bubble.tsx` (or styled containers) for conversational layout.
   - Assistant messages render text stream smoothly, supporting markdown rendering or formatted text.
   - Bottom prompt bar with auto-resizing textarea, submit button (with loading spinner / stop button), and clear chat button.
   - Keyboard shortcut: Enter to submit, Shift+Enter for newline.
   - Loading indicator when waiting for first token; stop button to abort generation.
2. Integrate into `src/components/app/category-view.tsx` when `category === "text"`.
3. Unit tests in `tests/unit/text-workspace.test.tsx` verifying:
   - Renders message stream, input, and submit buttons.
   - Dispatches message with `providerId` and `modelId` via `prepareSendMessagesRequest`.
   - Stop and clear actions work as expected.

### Acceptance Criteria
- Navigating to `/app/text` with configured active model renders the Text Workspace.
- Typing prompt and submitting initiates stream via `POST /api/generate/text`.
- Incoming streamed text updates assistant message incrementally.
- Stop button cancels stream.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

---

## Task 4: Sandboxed Iframe Preview and Website Workspace

### Description
Implement the website generation surface with live iframe preview and code inspector per ADR-0007:
1. `src/components/app/website-preview.tsx`:
   - Accepts `html: string`, `isStreaming: boolean`, `generationKey?: string`.
   - Maintains `revision` counter that increments whenever `html` changes.
   - Debounces `html` updates by 400ms while `isStreaming === true`; updates immediately with latest `html` when `isStreaming` transitions to `false`.
   - Renders `<iframe key={revision} srcDoc={debouncedHtml} sandbox="allow-scripts allow-forms allow-popups" className="w-full h-full border-0 bg-white" />`.
   - Device width controls:
     - Buttons for Desktop (1280px), Tablet (768px), and Mobile (390px).
     - Centers iframe in container with responsive width constraining.
   - Reload / Refresh preview button.
2. `src/components/app/website-code-view.tsx`:
   - Code viewer displaying the extracted HTML with line numbers or formatted pre block.
   - Copy to clipboard button with feedback checkmark toast/icon.
   - Download `.html` file button triggering file download in browser.
3. `src/components/app/website-workspace.tsx`:
   - Split layout using `ResizablePanelGroup`, `ResizablePanel`, and `ResizableHandle` (`direction="horizontal"`).
   - Left panel (default 40% width, min 300px):
     - Model selector info, prompt textarea, generate button, and generation history/status.
   - Right panel (default 60% width):
     - Tabs with "Preview" and "Code".
     - Header containing device width toggle buttons (Desktop, Tablet, Mobile) and action buttons (Copy, Download, Reload).
     - Preview tab renders `<WebsitePreview />`.
     - Code tab renders `<WebsiteCodeView />`.
   - Connects to `useChat` with `api: "/api/generate/website"` using `extractHtml(latestAssistantMessage)` for preview.
4. Integrate into `src/components/app/category-view.tsx` when `category === "website"`.
5. Unit tests in `tests/unit/website-workspace.test.tsx`.

### Acceptance Criteria
- `/app/website` renders resizable dual-pane workspace.
- Sandboxed iframe preview has exact sandbox attributes `allow-scripts allow-forms allow-popups` (NO `allow-same-origin`).
- Live debounced updates during stream, immediate update on finish.
- Device toggles change iframe rendered width accurately.
- Copy and download buttons function properly.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` pass.

---

## Task 5: E2E Tests, Documentation Updates, Evidence, and Completion

### Description
1. Update `tests/e2e/streaming.spec.ts` (or expand `tests/e2e/app-shell.spec.ts`):
   - Test text generation flow with mocked `/api/generate/text` endpoint streaming text chunks.
   - Test website generation flow with mocked `/api/generate/website` streaming HTML and verify sandboxed iframe renders content.
   - Test device width toggles on website preview.
   - Test Code tab copy/download buttons exist and are interactive.
2. Update ADR 0005 (`docs/adr/0005-ai-sdk-v7-streaming-over-ag-ui.md`):
   - Record resolution of the open question: `useChat` with `DefaultChatTransport` is chosen and adopted for all chat streaming.
3. Update `scripts/capture-evidence.ts` to capture:
   - `/app/text` with message stream active.
   - `/app/website` with preview pane and code pane.
   - Save screenshots into `docs/evidence/phase-4/`.
4. Run `pnpm evidence`.
5. Update `todos.md` to mark Phase 4 complete.

### Acceptance Criteria
- `pnpm test:e2e` passes green.
- `docs/evidence/phase-4/` contains all required screenshots.
- ADR-0005 reflects the settled `useChat` decision.
- `todos.md` reflects all completed Phase 4 items.
- All verification checks pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`.
