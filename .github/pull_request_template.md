## What

<!-- What this phase delivers, in one or two sentences. -->

## Why

<!-- The problem this solves. Link the ADR if there is one. -->

Refs: <!-- e.g. docs/adr/0003-models-dev-as-model-catalogue.md -->

## Changes

<!-- Bullet list of the substantive changes, not a restatement of the diff. -->

-

## Docs

<!-- Which docs/ files were added or updated. Docs land with the behaviour. -->

-

## Evidence

<!-- Screenshots and GIFs for this phase, committed under docs/evidence/phase-N/. -->

<!-- Embed with raw.githubusercontent URLs, for example: -->
<!-- ![](https://raw.githubusercontent.com/paramcodes/poly-ai/<branch>/docs/evidence/phase-0/sidebar.png) -->

## Verification

<!-- Tick each. The phase is not merged until every box is ticked. -->

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] `pnpm test:e2e` passes
- [ ] Every evidence file exists and is non-empty
- [ ] Captured browser console is free of errors
- [ ] No secret-looking strings in the diff (`sk-`, `gho_`, `KEY_ENCRYPTION_SECRET=`, `DATABASE_URL=`)
- [ ] Every commit in this branch is under the token limit and has a proper message
- [ ] `docs/` and `todos.md` are updated in this branch

## Checklist

- [ ] No commit exceeds 3000 tokens of diff
- [ ] Commit messages follow Conventional Commits and explain themselves
- [ ] No secrets, no real user data, no real keys in code, logs, or evidence
