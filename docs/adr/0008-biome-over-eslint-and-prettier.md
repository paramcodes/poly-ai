# ADR 0008: Biome instead of ESLint and Prettier

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

The repository needs linting and formatting for a Next.js 16 app with React 19,
TypeScript in strict mode, and Tailwind v4. Two facts from Next 16 shape this decision:

- **`next lint` was removed.** The command no longer exists, and the `eslint` option in
  `next.config` was removed with it. Linting is now something the project runs itself.
- **`next build` no longer runs the linter.** A green build no longer implies a clean
  lint. Linting has to be an explicit script and an explicit CI step, and it is now the
  project's own responsibility rather than the framework's.

That last point removes the historical reason many Next.js projects tolerate a slow,
two-tool lint setup: the framework used to run it for free as part of the build.

The candidates are:

- **ESLint + Prettier** — the incumbent. Two tools, two configurations, two dependency
  trees, and two different opinions about where a rule lives versus where formatting
  lives. ESLint's rule corpus is deep; Prettier's formatting is the most widely adopted
  in the ecosystem.
- **ESLint flat config with `eslint-plugin-next`** — a single tool that also knows about
  Next.js-specific rules, but still needs Prettier for formatting unless the
  formatter-conflicting rules are disabled.
- **Biome 2** — one tool, one config, one binary. Written in Rust, and roughly an order
  of magnitude faster on a typical codebase. Biome ships a **Next.js domain** that maps
  `@next/eslint-plugin-next` rules onto its own rule set.

We already have Biome wired: `biome.jsonc` enables the `next` and `react` domains with
recommended rule groups, and `package.json` exposes `lint` (`biome check .`),
`lint:fix` (`biome check --write .`) and `format` (`biome format --write .`).

## Decision

We use **Biome 2** (installed: `@biomejs/biome@2.4.2`) as the single tool for linting
and formatting the entire repository, with the **Next.js and React domains enabled**.

Concretely:

- One config file, `biome.jsonc`, at the repository root, with the `next` and `react`
  domains set to `recommended`. The file uses the `.jsonc` extension because Biome
  parses `biome.json` as strict JSON and rejects the comments the config needs.
- `pnpm lint` runs `biome check .` (lint + format check). `pnpm lint:fix` runs
  `biome check --write .`. `pnpm format` runs `biome format --write .`.
- **Linting is an explicit step**, because Next 16 no longer does it for us: it runs in
  the husky pre-commit hook via lint-staged, in `pnpm typecheck` (`tsc --noEmit`), and as
  a distinct CI job alongside the build.
- Biome's Next.js domain provides the framework-specific rules. The installed Biome
  schema (`@biomejs/biome/configuration_schema.json`) contains the mapped Next rules,
  including `useGoogleFontDisplay`, `noAsyncClientComponent`, `noDocumentImportInPage`,
  `noHeadElement` and `noImgElement`, plus the React and `n` (Node) rule sets. Rule
  documentation: https://next.biomejs.dev/linter/javascript/sources/
- **Formatting is delegated to Biome** rather than Prettier, and there is no Prettier
  config in the repository.

## Consequences

### Positive

- **One tool, one config, one dependency tree.** No ESLint + Prettier version-skew, no
  "the formatter and the linter disagree" class of bug, no `.eslintrc`/`.prettierrc`/
  `biome.jsonc` triplicate.
- **It is fast enough to be run on every commit and every save.** The Rust implementation
  is roughly 10× faster than ESLint on a comparable codebase. This matters more than it
  used to, because linting is no longer free from `next build`.
- **The Next.js rule set comes along.** We get the `@next/eslint-plugin-next` rules
  (mapped into Biome's Next domain) without installing, configuring or maintaining the
  plugin, and without the Next.js-specific ESLint peer-dependency churn that arrives
  with every framework major.
- **One formatter for every file type** we use — TypeScript, TSX, JSON, CSS (including
  Tailwind v4 directives, which the config enables via `css.parser.tailwindDirectives`).
- **A single command to fix everything.** `biome check --write .` applies safe fixes and
  formatting together, which makes "the lint failed, run this" a one-liner for everyone
  on the project.

### Negative / costs

- **Biome's type-aware linting is narrower than ESLint's.** Rules that require type
  information — some `no-floating-promises`-class rules — are not available or are less
  complete. TypeScript's own `tsc --noEmit` covers a different slice of the problem
  (type errors), and `pnpm typecheck` is a required step in CI, but there is a gap
  between "Biome + tsc" and "ESLint with type-aware rules".
- **Smaller rule corpus and ecosystem.** For any rule that is not in Biome, the answer
  today is "it does not exist" rather than "install a plugin" — although Biome does have
  a plugin system, it is far less populated than ESLint's.
- **Portability.** Contributors who arrive from an ESLint-heavy background will expect
  `.eslintrc` behaviour and some editors' ESLint integrations will not work out of the
  box. Biome ships its own editor extensions, which we should document in the repo
  README.
- **Not a drop-in replacement if we ever go back.** The ESLint → Biome direction is
  cheap; the reverse is a full re-installation of the ESLint ecosystem, plus
  `eslint-config-next` (which, since Next 16, requires ESLint 9+ and supports ESLint 10
  from `eslint-config-next@16.4.0`).

### Neutral / follow-ups

- The `lint` script name is kept even though `next lint` is gone, so muscle memory and
  CI configuration stay simple.
- If a rule we need exists only in ESLint, the escape hatch is a **narrow** ESLint
  invocation over specific paths, not a second full lint pass — see the alternatives.
- Biome's `assist.actions.source.organizeImports` is enabled, so import order is a tool
  decision, not a review comment.
- The `vcs.useIgnoreFile` setting keeps Biome aligned with `.gitignore`, so generated
  output and dependencies are not linted.

## Alternatives considered

**Keep ESLint + Prettier.** Rejected. Two tools and two configurations for the same
job, materially slower, and — decisively — the framework no longer runs either of them
during `next build`, so the "it comes free with Next" argument has expired. We would be
paying the maintenance cost with none of the offsetting benefit.

**ESLint flat config with `eslint-plugin-next`, no Prettier.** Rejected for now. This is
the strongest alternative: a richer rule set, including type-aware rules, and a single
tool if we disable the formatting-conflicting rules. It is slower, it requires disabling
or suppressing the stylistic rules that Prettier would normally own, and it puts us back
into the plugin-maintenance loop that Biome's Next domain already handles. If we hit a
rule gap we cannot live with, this is the fallback — which is why it appears as a
revisit trigger.

**Biome plus a narrow ESLint pass.** Rejected as a default, kept as an escape hatch. It
gives up the single-tool benefit and reintroduces two configs, but it is proportionate
when exactly one rule matters. We do not adopt it until we have a concrete rule we cannot
replace, and when we do it should be scoped to specific paths rather than the whole
repository.

**Prettier alone, with no linter.** Rejected. Formatting is not linting; without a linter
we lose the Next.js and React rules that catch real bugs (`noImgElement`,
`noDocumentImportInPage`, `noAsyncClientComponent`) and the correctness-oriented rules
Biome provides.

## Revisit triggers

- **A rule we need exists only in ESLint** — for example a type-aware rule that has no
  Biome equivalent and that we judge important enough to enforce. The trigger is
  concrete: a specific rule we have tried to live without and cannot.
- **Type-aware linting becomes a hard requirement** — for example a policy that
  no-floating-promises must be enforced in CI rather than left to review.
- **The team prefers ESLint conventions**, either because most contributors arrive from
  ESLint shops or because the organisation's tooling depends on ESLint output (custom
  reporter integrations, internal lint dashboards).
- Biome's Next.js domain stops tracking `@next/eslint-plugin-next`, or the mapped rule
  set diverges enough that we are maintaining our own copies of framework rules.
