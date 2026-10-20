<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

Poly-AI is a bring-your-own-key (BYOK) multimodal generation studio. Users add their
own provider API keys, assign models to categories, and generate text, images, video,
music and live website artifacts.

## Start here

1. **`todos.md`** (repo root) — the current phase, what is done, what is blocked.
2. **`docs/README.md`** — the documentation map.
3. **`docs/guides/working-on-this-repo.md`** — the full operating guide: branches,
   commit rules, delegation, secrets, and the release gate.

Do not re-scan the whole repository to orient yourself.

## Hard rules

- **Never commit, log, print or paste a secret.** No API keys, no `BETTER_AUTH_SECRET`,
  no `KEY_ENCRYPTION_SECRET`, no `DATABASE_URL` — in code, commits, PR bodies, PR
  comments, screenshots, or subagent briefs. The repository is public. Evidence
  screenshots must use a mock provider with a fake key.
- **No commit may exceed 3000 tokens of diff.** The `pre-commit` hook enforces this;
  CI enforces it again for the whole branch. Split the change.
- **Never force-push, never rewrite published history, never amend another commit.**
- **Never merge a PR without the verification gate passing.** See
  `docs/guides/working-on-this-repo.md`.
- **Docs land with the behaviour.** A change to how something works updates the
  matching file in `docs/` in the same commit.

## Conventions

- Package manager: **pnpm**. Linter and formatter: **Biome** (`pnpm lint`,
  `pnpm format`) — there is no ESLint or Prettier config in this repo.
- Tests: **Vitest** for unit and integration (`tests/unit`, `tests/integration`),
  **Playwright** for e2e (`tests/e2e`).
- UI: **shadcn/ui on Radix**, components in `src/components/ui/`. Add components with
  `npx shadcn@latest add <name>` — do not hand-write a component that the registry
  already provides.
- Animations: **Motion** (`motion/react` in client components). Respect
  `prefers-reduced-motion`.
- Toasts: **Sonner**. Severity lives with the message in `src/lib/toast.ts`, never at
  the call site.
- Category metadata lives in `src/lib/categories.ts`. It is the single source of
  truth for what a category is.
- Server-only modules (database, key decryption, provider adapters) must never be
  imported into a client component.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm lint` / `pnpm lint:fix` | Biome check |
| `pnpm format` | Biome format |
| `pnpm typecheck` | `next typegen` then `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:integration` | Integration tests — needs a real Postgres |
| `pnpm test:e2e` | Playwright e2e — needs `pnpm build` first |
| `pnpm evidence` | Capture screenshots and video for the current phase |
| `pnpm check:commit-size` | Run the commit-size gate by hand |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |

## Delegation

The parent session owns strategy and integration; subagents own tactical execution.
**At most 2 CPU-bound subagents at a time** (build, typecheck, test, Playwright,
installs). LLM-bound subagents (research, ADR drafting, review, doc writing) have no
such limit. Parallel workers must own **disjoint** file sets. Every subagent brief
must be self-contained, and results come back as pointers — paths, commit SHAs, test
names — not pasted file contents.
