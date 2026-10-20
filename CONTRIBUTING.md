# Contributing to Poly-AI

Thank you for your interest in contributing to Poly-AI! This document outlines our development workflows, coding standards, and verification gates.

For the full architectural guide, please read [`docs/guides/working-on-this-repo.md`](docs/guides/working-on-this-repo.md) and [`AGENTS.md`](AGENTS.md).

---

## Hard Rules

1. **Never commit secrets**: No API keys, credentials, or encryption secrets in code, logs, PR descriptions, or screenshots. The repository is public. Evidence capture must always use mock providers.
2. **Commit size limit (3000 tokens)**: No commit may exceed 3,000 tokens of diff. The `pre-commit` hook and CI strictly enforce this. Split larger changes into focused, cohesive commits.
3. **Never rewrite published history**: Do not force-push (`git push -f`) or amend commits that have already been pushed to the remote.
4. **Documentation ships with code**: Any change that modifies user behavior or architectural design must update matching documentation under `docs/` in the same PR.

---

## Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/poly-ai.git
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
   Provide valid test credentials for `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `KEY_ENCRYPTION_SECRET`.

4. Start development server:
   ```bash
   pnpm dev
   ```

---

## Development & Verification Commands

| Command | Purpose |
| --- | --- |
| `pnpm lint` / `pnpm lint:fix` | Run Biome linter across all project files |
| `pnpm format` | Run Biome code formatter |
| `pnpm typecheck` | Generate route types and check with `tsc --noEmit` |
| `pnpm test` | Run Vitest unit & integration test suite |
| `pnpm test:e2e` | Run Playwright end-to-end tests (requires build) |
| `pnpm build` | Production Next.js build |
| `pnpm check:commit-size` | Verify commit diff size against the 3000-token limit |

---

## Commit Discipline

Poly-AI enforces [Conventional Commits](https://www.conventionalcommits.org/):

- **Subject line**: ≤ 72 characters, imperative mood ("add", not "added"), no trailing period.
- **Scope**: Optional but recommended: `feat(providers):`, `fix(ui):`, `docs(readme):`, `test(adapters):`.
- **Commit Body**: A body explaining *what* and *why* is required for any commit exceeding ~150 tokens.

---

## Pull Request Checklist

Before submitting a pull request, ensure:
- [ ] `pnpm lint` passes cleanly with no warnings or errors.
- [ ] `pnpm typecheck` passes with no type errors.
- [ ] `pnpm test` passes all tests.
- [ ] `pnpm build` compiles successfully.
- [ ] Every individual commit is under 3000 tokens (`pnpm check:commit-size --base origin/master`).
- [ ] No credentials or personal secrets are included anywhere in the branch.
