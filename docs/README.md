# Poly-AI documentation

Poly-AI is a multi-user web app for generating media with your own AI vendor accounts. Each user brings their own API keys (BYOK), registers any number of providers, assigns the models those providers expose to one of five categories — text, image, video, music, website — and generates from a collapsible left sidebar, with every result streaming live. The website category is special: it asks a text model for a single HTML document and renders it live in a sandboxed, resizable preview beside the prompt. It is for developers and power users who want one interface across many vendors, for contributors who want to add a provider without touching the UI, and for AI agents that will read this directory to orient themselves before editing code.

## Current state

`todos.md` at the repository root is the source of truth for where the project actually is. Read it before you read anything in `docs/`. This index describes the *layout* and the *rules*; `todos.md` describes the *progress*. When the two disagree about what exists, `todos.md` wins.

## Map of the docs tree

| Directory | What lives there | When to read it | Status |
| --- | --- | --- | --- |
| `docs/adr/` | One file per decision record, numbered `NNNN-short-slug.md`. Records a decision, its context, the alternatives considered, and the consequences. | Before changing anything architectural: adding a provider kind, changing the database schema, changing how generations are streamed or persisted, changing the auth model. | Populated: `0000`–`0010` record the decisions taken so far. |
| `docs/architecture/` | How the system is put together: request flow from the browser to a provider, the adapter boundary, the storage layer, the streaming protocol, the deployment shape. | When you need to know where a piece of behaviour lives, or before adding a new subsystem. | Intended layout. Not yet written. |
| `docs/features/` | One document per user-facing feature. Describes how the feature works *and* how its pieces interact with the rest of the app. | Before changing a feature's behaviour, and when you need to know which other features depend on it. | Intended layout. Written as each feature lands, so most are not written yet. |
| `docs/components/` | One document per reusable UI component: its props contract, its state ownership, and the module that owns it. | Before you change a component's props or move it, and when a component is used in more than one category page. | Intended layout. Not yet written. |
| `docs/guides/` | Task-shaped guides that tell you *how to do something* — how to work in this repo, how to add a provider, how to release a phase. | When you need a procedure, not an explanation. | Populated: `working-on-this-repo.md` is the operating guide for contributors and agents. |
| `docs/evidence/` | Committed screenshots and GIFs, one directory per phase (`phase-<N>/`), captured by `pnpm evidence`. | When reviewing a phase PR, or when you want to see what a feature actually looked like when it shipped. | Populated: `phase-0/` through `phase-5/`. |

Two files sit at the top of `docs/` rather than in a directory: this index and [`glossary.md`](./glossary.md), which fixes the vocabulary the rest of the docs and the code share.

The table above describes intent. Directories marked "Not yet written" are placeholders for work that has not happened yet, and they may be populated by the time you read this — check the directory listing rather than trusting the status column.

## Start here

### A new contributor

1. `todos.md` at the repo root — where the project is and what the next slice of work is.
2. This file, then [`glossary.md`](./glossary.md) — the vocabulary the code uses.
3. [`guides/working-on-this-repo.md`](./guides/working-on-this-repo.md) — branches, the commit-size limit, the pre-commit pipeline, the secrets rules.
4. The ADRs that cover the area you are about to touch, once they exist.
5. `pnpm dev`, then click through all five categories in the sidebar. The five category pages are the product; the code around them is plumbing.

### A new AI agent

1. `todos.md` — the scope of the current work.
2. `AGENTS.md` at the repo root — the short version of the operating guide, and the file `next dev` rewrites; leave the block alone.
3. This file and `docs/glossary.md`.
4. [`guides/working-on-this-repo.md`](./guides/working-on-this-repo.md) in full. It carries the rules you will be judged against: 3000-token commits, disjoint write scopes, no secrets, `todos.md` updated in the same commit.
5. The ADR(s) your task references, if the task names one.
6. Then open the specific files your task names. Do not scan the repository to orient yourself — read the diff and the named files.

### Someone about to add a provider

1. [`glossary.md`](./glossary.md) for **Provider**, **Adapter**, **Capability adapter result**, **Provider status**, **Key envelope**.
2. The adapter architecture doc under `docs/architecture/`, when it exists.
3. The existing `openai-compatible` adapter — it is the reference shape for a new adapter.
4. The vendor's entry in the models.dev catalogue (`https://models.dev/api.json`) to see which model ids and output modalities you need to support.
5. The change itself: a new adapter module, capability mapping from `modalities.output`, provider-status verification, a unit test, and the feature doc — all in the same phase branch.

### Someone debugging a generation failure

1. [`glossary.md`](./glossary.md) for **Generation**, **GenerationEvent**, **Resumable job**, **Category catalogue**, **Empty state**, **Provider status**.
2. The `generations` row for the run: its `status` and, if it failed, its error code.
3. The provider's status: `active`, `invalid`, or `disabled`. Only `active` providers contribute models to a category catalogue.
4. The adapter for that provider kind, in `docs/architecture/` terms.
5. The category catalogue for the category you were on. An empty catalogue is a configuration problem, not a provider bug.
6. The toast colour is the first hint: **amber** means "not configured yet", **red** means "attempt failed".
7. The browser console and the server log for the request, and the `GenerationEvent` stream if the run got that far.

## Doc conventions

- **ADRs are immutable once Accepted.** To reverse an accepted decision, write a new ADR that supersedes the old one and link it. Editing history in place destroys the record of why the decision was made.
- **Every ADR has the same seven sections:** Status, Context, Decision Drivers, Decision, Alternatives Considered, Consequences, and References. A section you cannot fill in is a sign the decision is not yet made — leave the ADR in Proposed state instead.
- **Feature docs describe how a feature works *and* how its pieces interact** with the rest of the app. A feature doc that only lists screens is a description, not a document; the interactions are the part people need.
- **Component docs state the props contract and the owning module.** If a component's props change, its component doc changes in the same commit.
- **Docs land in the same commit as the behaviour they describe.** Never as a follow-up commit, never as a separate PR. A commit that changes behaviour without its doc is incomplete.
- **`docs/evidence/` holds committed screenshots and GIFs, one directory per phase.** Because the repository is public, evidence must never contain a real API key, real user data, or a real email address. Capture evidence against a mock provider with a fake key.

## Keeping docs honest

- When a behaviour changes, the doc that describes it changes in the same PR. Not the next one, not a backlog item.
- A doc that contradicts the code is a bug in the doc. Fix the doc or fix the code — do not leave them disagreeing.
- If you are not sure whether a doc is still true, verify it against the code. Read the implementation; do not trust the doc, and do not trust that it was true when it was written.
- Prefer deleting a stale doc over leaving it. An empty section marked "TODO" is noise; a missing doc is an obvious gap.
- If you find a doc that is wrong, fix it in the same branch you found it on. Do not open a docs-only PR against `master` — `master` only receives merged phase branches.
