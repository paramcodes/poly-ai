# Working on this repo

The operating guide for every contributor to Poly-AI, human or AI. It covers orientation, branches, the commit-size limit, the pre-commit pipeline, delegation rules, the secrets rules, progress tracking, and the phase release gate.

`AGENTS.md` at the repository root is the short version of this guide. This file is the long version; when they disagree, this file wins.

## Orientation

Read in this order, and stop there:

1. `todos.md` at the repository root — the source of truth for where the project is and what the current slice of work is.
2. `docs/README.md` — the map of the docs tree and the reading order for your role.
3. The current branch's diff — `git diff master...HEAD` and `git log master..HEAD` tell you what is already done in this phase.

Do not re-scan the whole repository to orient yourself. The repository is small enough that a full scan costs you context you need for the work itself, and the diff plus `todos.md` answer the question "where am I" in two reads.

Read `docs/glossary.md` if the task touches providers, models, categories, adapters, or generations. The terms in the code match that glossary exactly.

## Branches and phases

- One branch per phase: `phase/<N>-<slug>`, branched from `master`. Example: `phase/3-provider-adapters`.
- `master` only ever receives merged phase branches. Do not commit to `master` directly; do not open a PR from a branch that is not a phase branch.
- **Never force-push.** A published branch is a shared reference; rewriting it silently changes what your collaborators have.
- **Never rewrite published history.** No `rebase` of a pushed branch, no `commit --amend` on a pushed commit, no history rewriting of any kind once the commit is on the remote.
- **Never amend a commit you did not author.** If a commit needs changing and it is not yours, add a new commit.
- If you must rebase a branch that has never been pushed, that is fine. The rule is about published history, not local tidiness.

## Commits — the 3000-token rule

### The hard rule

**No commit may exceed 3000 tokens of diff.**

A husky `pre-commit` hook runs `scripts/check-commit-size.ts`, which tokenises the staged diff with `gpt-tokenizer` and blocks the commit when it is over the limit. When it blocks, it reports the total token count and a per-file breakdown, so you can see which file blew the budget.

The limit can be raised for a single commit with the `COMMIT_TOKEN_LIMIT` environment variable:

```bash
COMMIT_TOKEN_LIMIT=4500 git commit -m "feat(...): ..."
```

Raise it only when a single file genuinely cannot be split — a lockfile-scale generated artefact, or a vendored snapshot. Do not raise it to fit a feature you have not bothered to decompose. If you need a permanently higher limit, change the default in the script and say why in the commit body.

### What counts

- **Text diffs count their real token cost.** A 3000-token commit is roughly 10,000–12,000 characters of typical TypeScript or Markdown.
- **Binary files count as a flat 2000-token penalty each.** A screenshot or a video cannot quietly consume the whole budget, and cannot be slipped in alongside a feature that is already at the limit.
- **Generated files are exempt by path.** The exemption list lives in `scripts/lib/commit-tokens.ts` and is documented there — read the script for the current list. Two paths are on it: `pnpm-lock.yaml`, because the package manager rewrites it and its size says nothing about how much of the change was reviewed; and `docs/evidence/**`, because committed screenshots and GIFs are reviewed as images rather than as a diff. The models.dev fallback snapshot is the kind of file that belongs on it.

### The gate must count your text

The gate reads the `+++` header of each file's diff hunk to find its added lines, and matches that header against the path git reports in `--name-status`. The two must agree.

They do not agree on every machine. `diff.mnemonicPrefix` rewrites the `a/` and `b/` prefixes into `c/` and `i/`, and `diff.noprefix` removes them. Both are common global git settings, and either one makes every text file count as **zero tokens** — the gate then reports a clean tree no matter how large the change is, and the 3000-token rule silently stops existing.

The gate therefore passes `--no-prefix` to git, which pins the header to the repository path regardless of local configuration. If you ever change how the diff is read in `scripts/lib/commit-tokens.ts`, verify the count is still non-zero for a known text file: `pnpm check:commit-size` prints a per-file breakdown, and a real file must not show `0 tokens`.

### CI enforces the same thing

The same check runs in CI against the whole branch diff, not only the last commit. That means `--no-verify` buys you nothing: the commit passes locally, then the branch fails the pipeline. The local hook exists to give you the failure while the change is still in your hands.

### How many commits per phase

Each phase is broken into **2–6 small commits**. A commit must be a coherent checkpoint that leaves the repository working — after every commit, `pnpm build` and `pnpm test` pass.

Rules that follow from that:

- **No commit mixes a refactor with a feature.** If you renamed something to make the feature possible, the rename is its own commit, first.
- **A schema change ships with its migration in the same commit.** The Drizzle migration and the code that uses it are one checkpoint, never two.
- **A bug fix ships with its regression test.** A fix without the test that would have caught it is not a checkpoint.
- **Docs for a behaviour ship with the behaviour.** See `docs/README.md` for the doc conventions.

### Commit message format

The subject line follows Conventional Commits:

- **≤ 72 characters.**
- Imperative mood: "add the fal adapter", not "added" or "adds".
- No trailing period.
- A scope in parentheses when there is an obvious one: `feat(providers):`, `fix(streaming):`, `docs(glossary):`, `refactor(adapters):`, `test(generation):`, `chore(deps):`.

The body says **what changed and why** — not a restatement of the diff. The diff already says what changed. A body is required once a commit exceeds roughly 150 tokens; below that, a good subject line is enough.

Add a `Refs:` trailer when the commit implements or is motivated by an ADR:

```
Refs: docs/adr/0007-provider-adapter-kinds.md
```

### Worked example

A real commit message for a real-sized change:

```
feat(providers): add fal adapter for image models

fal is not reachable through the openai-compatible path: it takes a
different auth shape and its media models return a job handle instead
of bytes, which the openai-compatible adapter cannot express.

- add the fal adapter, resolving the provider key to an image model
- map fal model ids onto the image capability from the catalogue
- return { externalId, statusUrl } so the client polls the job
- cover key resolution and result shape with a unit test

Refs: docs/adr/0007-provider-adapter-kinds.md
```

Why it works: the subject says what the commit does and stays inside 72 characters; the first paragraph explains the *why* — the reason a new adapter exists rather than a config change, which is the part a reader cannot infer from the diff; the bullets enumerate the behavioural changes; the trailer points at the decision record that motivated it. The ADR number and filename above are illustrative — use the ADR your commit actually implements.

## The pre-commit and pre-push pipeline

`pre-commit` runs three steps, in this order:

1. **Biome on the staged files** — lint and format, via lint-staged. Biome is the linter and formatter for this repository. There is no ESLint and no Prettier; do not add either. Its config is `biome.jsonc` at the repository root — the `.jsonc` extension is required, because Biome parses `biome.json` as strict JSON and rejects the comments the config carries. A `biome.json` that fails to parse is not a warning: Biome falls back to its defaults, which format the entire repository to a different style and lint the build output in `.next/`.
2. **`tsc --noEmit`** — the typecheck, under `strict`.
3. **The commit-size gate** — `scripts/check-commit-size.ts`, described above.

`commit-msg` runs **commitlint** against the message.

A failure in any of these is a signal to fix the code, not a reason to reach for `--no-verify`. The hooks exist to stop you from shipping a broken checkpoint; bypassing them moves the failure to CI, where it costs a round trip and still blocks the merge. If a hook is wrong — it flags something that is genuinely fine — fix the hook or the config and say so in the commit body, so the next person knows the change was deliberate.

Run the same checks locally before you push:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Delegation

### Roles

The parent session is the chief of staff: it owns strategy, sequencing, integration, and the final integration pass. Subagents own tactical execution inside a brief. A subagent does not re-plan the phase, and the parent does not hand-write a subagent's deliverable.

### Concurrency budget

**At most 2 CPU-bound subagents at a time.** CPU-bound work means build, typecheck, test, Playwright, screenshot capture, and installs — anything that holds a large amount of RAM. The machine has limited RAM, and exceeding the budget means swapping, timeouts, and flaky failures that look like product bugs.

LLM-bound subagents — research, ADR drafting, code review, doc writing — have no such limit. They run on the model provider, not on this machine, so you can fan those out as widely as the work allows.

### Write scope is exclusive

Parallel workers must own **disjoint file sets**. A file is never edited by two agents in the same wave. If two tasks genuinely need the same file, run them serially.

This includes files that look shared: `todos.md`, `package.json`, schema files, barrel exports, and the lockfile. Two agents adding a dependency at the same time will conflict on `pnpm-lock.yaml`. Assign those to one agent, or sequence the tasks.

### Briefs are self-contained

A child agent has no access to this conversation and no memory of your reasoning. A brief that only says "add the fal adapter" will produce a different adapter than the one you wanted, in files you did not authorise.

Every brief states:

- the **objective**, in one sentence;
- the **relevant facts** — stack, paths, existing patterns, the ADR or feature doc that applies;
- the **ruled-out approaches**, and why they were ruled out;
- the **exact file ownership** — the files this agent may create or edit, and the files it must not touch;
- the **constraints** — commit size limit, no secrets, no `git` history rewriting, tooling rules;
- the **deliverable** and the **acceptance criteria** that decide whether it is done;
- the **expected response format** — pointers, not file dumps.

### Subagents return pointers

A subagent returns paths, commit SHAs, and test names. It does not paste file contents back into the conversation. A pasted file dump costs as much context as reading the file yourself, and it goes stale the moment someone edits it.

## Secrets — non-negotiable

**The repository is public.** Everything in it, forever.

- Never print, log, commit, or paste an API key, `BETTER_AUTH_SECRET`, `KEY_ENCRYPTION_SECRET`, or `DATABASE_URL` into a commit, a PR, a comment, a screenshot, a log, or a subagent brief. Use env placeholders: `sk-test-...`, `your-key-here`, `$DATABASE_URL`.
- **Screenshots and recorded video used as evidence must use a mock provider with a fake key** — never a real one, never real user data, never a real email address. Committed evidence is public forever; a screenshot pasted into a PR comment is not a place to redact later.
- API keys are encrypted at rest and are never returned to the browser. The UI only ever sees a masked hint such as `••••a1b2`. If you find yourself about to return a key to the client, stop: that is a leak, not a feature.
- If a secret is ever committed, treat it as compromised. Rotate it with the vendor, then remove it. History rewriting is not a substitute for rotation, and it is forbidden here anyway.
- A diff containing anything secret-looking fails the release gate. When in doubt, use a fake value.

## Progress tracking

`todos.md` at the repository root is the single source of truth for where the project is. Update it in the **same commit** as the last change of any session — a session that ends with work in the tree and a stale `todos.md` has not finished.

Use this legend:

| Marker | Meaning |
| --- | --- |
| `[ ]` | Todo — not started |
| `[~]` | In progress — someone is on it right now |
| `[x]` | Done — shipped and verified |
| `[!]` | Blocked — cannot proceed, and the reason is recorded next to it |
| `[-]` | Dropped — deliberately not doing this, and why |

Record blockers explicitly, with the note that carries forward. A blocked item with no note is indistinguishable from an item nobody started. When you unblock one, say what unblocked it.

## Releasing a phase

### One PR per phase

Open a single PR for the phase, from `phase/<N>-<slug>` into `master`, using the repository's pull request template. The PR body states what the phase delivers, how to verify it, and which ADRs it implements.

### Evidence

Capture screenshots and GIFs into `docs/evidence/phase-<N>/` and commit them to the branch:

```bash
pnpm evidence
```

The PR comment embeds the evidence via `raw.githubusercontent.com` URLs, because the GitHub CLI cannot upload local images into a comment.

### The verification gate

A phase is merged **only after every one of these passes**:

- lint green — `pnpm lint`
- typecheck green — `pnpm typecheck`
- unit tests green — `pnpm test`
- build green — `pnpm build`
- e2e green — `pnpm test:e2e`
- every evidence file present and non-empty
- the captured browser console free of errors
- no secret-looking strings anywhere in the diff
- every commit under the token limit, with a proper message
- docs and `todos.md` updated

### Merging

Self-merge only after the gate passes:

```bash
gh pr merge <N> --squash --delete-branch
```

If any item fails: the PR stays open, the failure is reported with the exact failing condition, and the phase is not done. **Never merge blind.** A red gate item is a bug to fix, not a checkbox to override.

## Command reference

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server. |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` | Biome check across the repository. |
| `pnpm lint:fix` | Biome check with `--write`. |
| `pnpm format` | Biome format with `--write`. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm test` | Vitest, single run. |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm test:e2e` | Playwright. |
| `pnpm evidence` | Capture phase evidence into `docs/evidence/`. |
| `pnpm check:commit-size` | Run the commit-size gate on the staged diff. |
| `pnpm db:generate` | Drizzle Kit: generate a migration. |
| `pnpm db:migrate` | Drizzle Kit: apply migrations. |
| `pnpm db:studio` | Drizzle Kit: open the database studio. |

The package manager is pnpm 12.9.1, pinned in `package.json`. The linter and formatter are Biome. The test runners are Vitest and Playwright. There is no ESLint, no Prettier, and no monorepo — v1 is a single Next.js app.
