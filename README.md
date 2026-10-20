# Poly-AI

A bring-your-own-key (BYOK) multimodal generation studio built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and the Vercel AI SDK.

Add your own provider API keys, assign models to studio categories, and generate text, images, video, music, and sandboxed live website artifacts from one unified interface.

---

## Features

- **Bring Your Own Key (BYOK)**: Add keys for OpenAI, Anthropic, Google Gemini, Groq, Mistral, fal.ai, Replicate, or any OpenAI-compatible provider.
- **AES-256-GCM Envelope Encryption**: Keys are encrypted at rest with authenticated AES-256-GCM using `node:crypto`. Secrets are never sent to the browser and are decrypted only in secure server runtimes.
- **5 Multimodal Studios**:
  - **Text**: Real-time conversation streaming with AI SDK v7.
  - **Website**: Live HTML/CSS streaming rendered directly in a sandboxed `iframe` with responsive device toggles (desktop, tablet, mobile) and code inspection.
  - **Image**: High-fidelity image synthesis streaming lifecycle state over SSE and persisting assets via Upstash Blob storage.
  - **Video**: Asynchronous queueing and polling for video generation jobs (fal.ai, Replicate).
  - **Music & Speech**: Text-to-speech audio rendering and full song generation queueing.
- **Keyboard-First Navigation**: Quick navigation and generation triggers with global shortcuts (`?` for cheat-sheet, `⌘B` for sidebar).
- **Reduced-Motion Compliant**: Strict adherence to `prefers-reduced-motion` across CSS transitions, animations, loaders, and skeletons.

---

## Architecture Overview

```
                      ┌───────────────────────────────────────┐
                      │      Poly-AI Next.js 16 Studio        │
                      └──────────────────┬────────────────────┘
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   ▼                     ▼                     ▼
          ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
          │  Text & Website │   │  Image (SSE)    │   │  Media Jobs     │
          │  AI SDK v7      │   │  SSE Stream     │   │  (Video/Music)  │
          │  Data Stream    │   │  + Upstash Blob │   │  Polling Model  │
          └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
                   │                     │                     │
                   └─────────────────────┼─────────────────────┘
                                         ▼
                             ┌───────────────────────┐
                             │ Provider Adapters &   │
                             │ AES-256-GCM Key Vault │
                             └───────────┬───────────┘
                                         ▼
                     OpenAI / Anthropic / fal.ai / Replicate
```

### Key Architectural Decisions (ADRs)

- **ADR-0001**: Next.js 16 App Router with Turbopack and React 19.
- **ADR-0002**: shadcn/ui on Radix primitives pinned to `radix-nova` style.
- **ADR-0003**: models.dev integration for capability detection via `modalities.output`.
- **ADR-0004**: AES-256-GCM envelope encryption with 12-byte IV and 16-byte auth tag.
- **ADR-0005**: AI SDK v7 native data streaming over custom protocols.
- **ADR-0006**: Resumable job state machine for asynchronous video and music jobs.
- **ADR-0007**: Isolated `iframe` preview with strict sandbox attributes (`allow-scripts allow-forms allow-popups`, explicitly omitting `allow-same-origin`).
- **ADR-0008**: Biome for fast formatting and linting.
- **ADR-0011**: Media generation lifecycle streaming over SSE.
- **ADR-0012**: Unified `AsyncJobAdapter` contract across video and music providers.

---

## BYOK Walkthrough

### 1. Register an Account
Visit Poly-AI and create an account via `/sign-up`. Authentication is managed through Better Auth with session cookies.

### 2. Connect Your Providers
Navigate to **Settings → Providers & Models** (`/settings/providers`):
1. Click **Add Provider**.
2. Select a known provider preset (e.g. OpenAI, Anthropic, Google, fal.ai, Replicate) or select **Custom OpenAI-compatible** for self-hosted / gateway endpoints (Ollama, vLLM, OpenRouter).
3. Paste your personal API key.
4. Poly-AI immediately runs an authenticated probe against the provider to verify credentials before saving.

### 3. Assign Models to Categories
In the **Model Assignment Table**:
1. Click **Assign Model**.
2. Select your verified provider and choose from detected models supported by the provider.
3. Capability gating ensures models can only be assigned to categories matching their `modalities.output` capabilities.
4. Set your default model for each category.

---

## Getting Started

### Prerequisites

- Node.js 22.x or later
- pnpm 12.x or later
- PostgreSQL database (Neon serverless supported)
- Upstash Blob storage (for image persistence)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/paramcodes/poly-ai.git
   cd poly-ai
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in the required configuration:
   - `DATABASE_URL`: Postgres connection string
   - `BETTER_AUTH_SECRET`: Random 32+ character secret
   - `KEY_ENCRYPTION_SECRET`: 32-character AES-256 key (`openssl rand -hex 16` or 32 chars)
   - `UPSTASH_BLOB_TOKEN`: Upstash Blob storage token for media uploads

4. Run database migrations:
   ```bash
   pnpm db:migrate
   ```

5. Start the development server:
   ```bash
   pnpm dev
   ```

---

## Commands & Verification

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start development server |
| `pnpm build` | Production Next.js build |
| `pnpm lint` / `pnpm lint:fix` | Biome lint checks |
| `pnpm format` | Biome code formatting |
| `pnpm typecheck` | `next typegen` followed by `tsc --noEmit` |
| `pnpm test` | Run Vitest unit & integration test suite |
| `pnpm test:e2e` | Playwright end-to-end tests (requires build) |
| `pnpm check:commit-size` | Enforce 3000-token commit size gate |
| `pnpm evidence` | Capture visual evidence and screenshots |

---

## Security & Privacy

- **Zero Key Logging**: Provider keys are never logged, printed, or sent in network payloads to the client.
- **Client Isolation**: Sandboxed iframe preview prevents user-generated website code from accessing parent storage or auth cookies.
- **Commit Gate**: Strict commit-size gate (≤3,000 tokens per commit) and commit-message conventions keep code changes reviewable and audited.
