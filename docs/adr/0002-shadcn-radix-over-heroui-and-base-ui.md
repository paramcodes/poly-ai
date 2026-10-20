# ADR 0002: shadcn/ui on Radix primitives

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI's UI has a specific and non-trivial set of requirements:

- A **collapsible left sidebar** that selects the generation category (text / image /
  video / music / website).
- A **resizable split pane** for the website category, where the generated HTML renders
  live in a right-hand preview beside the prompt panel.
- **Dialogs, selects, tabs, toasts, popovers and comboboxes** for provider and model
  pickers, settings, and the "model not configured yet" / "attempt failed" toasts.
- **Chat-shaped streaming UI** for the text category, where tokens arrive incrementally and
  the scroll container must not jump while a reply streams in.

We want to own the component source in the repository (so we can restyle freely), we want
accessible primitives with real focus management, and we want the components to be
familiar to the AI coding tools that will be writing most of the UI code in this project.

Facts about the ecosystem as of 2026-10-20:

- **shadcn/ui changed its default to Base UI in July 2026.** New projects created with
  `shadcn init` get Base UI. The changelog is explicit that Radix "is not being
  deprecated" and is "still fully supported", and that projects on Radix do not need to
  migrate. Radix is one flag away: `pnpm dlx shadcn init -b radix`. See
  https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
- **shadcn shipped its own chat primitives in June 2026**: `MessageScroller`, `Message`,
  `Bubble`, `Attachment` and `Marker`. They are installable with
  `shadcn@latest add message-scroller message bubble attachment marker` and exist for
  both Radix and Base UI. See
  https://ui.shadcn.com/docs/changelog/2026-06-chat-components
- **The AI Elements line is now patterns, not a package.** The October 2026 entry states
  "There is no package to install. Each pattern is a composition you copy into your
  project". The same entry states that AI Elements replaces **AI SDK Elements**, and that
  AI SDK Elements "is going to be deprecate[d]" — i.e. the standalone `ai-elements` CLI is
  the thing being retired, not the shadcn component line. See
  https://ui.shadcn.com/docs/changelog/2026-10-ai-elements
- **`Resizable` is built on `react-resizable-panels` v4**, which is already in our
  dependency tree (`react-resizable-panels@^4.0.0`).
- With **Tailwind v4**, the `tailwindcss-animate` package is deprecated in favour of
  `tw-animate-css`, which is what our `globals.css` uses.

## Decision

We use **shadcn/ui on Radix primitives**, initialised with:

```
pnpm dlx shadcn init -b radix
```

Concretely:

- The repository's `components.json` pins `"style": "radix-nova"`, and the copied
  components import from the unified **`radix-ui`** package (the consolidated Radix
  distribution, `radix-ui@^1.8.1`) rather than from individual `@radix-ui/*` packages.

- The project is initialised with the **Radix** base, and every component added later with
  `shadcn add <component>` defaults to the Radix variant.
- **Components are copied into the repository** (`src/components/ui/…`) and edited in
  place. There is no abstraction layer over the upstream code and no runtime dependency on
  a shadcn package.
- We install shadcn's **chat primitives** (`message-scroller`, `message`, `bubble`,
  `attachment`, `marker`) for the text category, and we do **not** install the standalone
  `ai-elements` CLI or the AI SDK Elements package.
- Styling is Tailwind v4 with **`tw-animate-css`**; `tailwindcss-animate` is not used.
- The resizable website preview uses shadcn's `Resizable` (which wraps
  `react-resizable-panels` v4), so panel sizing and persistence follow the upstream
  component rather than a bespoke implementation.

## Consequences

### Positive

- **The component source is ours.** We can restyle the sidebar, the resizable panes and the
  toasts without fighting a vendor's design decisions or a theme API, and there is no
  abstraction tax between the upstream component and the code we ship.
- **Radix has the largest community corpus** and the widest set of battle-tested
  behaviour for the specific primitives we need — focus trapping, typeahead comboboxes,
  dismissible layers, and the `Sidebar` component's collapse/pin behaviour, which is
  exactly the interaction the left navigation needs.
- **AI coding tools generate Radix props by default.** Most model training data and
  agent-generated code assumes Radix semantics (`asChild`, `data-state`, `data-side`). If we
  chose Base UI, generated code would intermittently use Radix-only props, producing
  subtle behavioural differences rather than hard errors.
- **The switch to Base UI later is one flag.** The component abstraction is the same, and
  shadcn ships a migration skill; if Base UI reaches parity on the components we use, the
  migration is progressive, one component at a time.
- Installing the **shadcn** chat primitives rather than a standalone elements package means
  the chat UI is composed from components that live in our repo, with our styling, and
  that ship for our chosen base library.

### Negative / costs

- **We are on the non-default path.** New shadcn documentation and examples default to
  Base UI. Any snippet we copy from the docs has to be checked for which base library it
  targets. The cost is a constant low-grade reading hazard.
- **Radix is not the strategic long-term bet in the ecosystem.** Base UI is where the
  Radix team's new work lands, and shadcn's own docs now default to it. Choosing Radix
  means we will eventually face a migration we chose to defer, not avoid.
- **Copied components are our maintenance burden.** When we update a component, we own the
  diff — including any upstream fixes we choose not to take. There is no upstream patch
  release to absorb.
- We inherit both libraries' ecosystem surface: Base UI-only components will simply not
  exist for us, and we track that gap manually.

### Neutral / follow-ups

- `tw-animate-css` replaces the deprecated `tailwindcss-animate`; no `tailwind.config.js`
  animation keyframes are needed under Tailwind v4.
- When upgrading shadcn/ui, we review the changelog for changes that affect the Radix
  variants specifically, and we re-run the component install so our copies pick up fixes.
- The deprecation of AI SDK Elements is announced but we have not found a published
  end-of-life date in the public changelog; our research put it at end of November 2026.
  We treat the date as indicative rather than fixed, and we avoid the package entirely so
  the date does not matter to us.

## Alternatives considered

**HeroUI v3.** A styled component library built on React Aria. The accessibility work is
excellent and the components look finished out of the box, but it is a *library* with a
theme system and a fixed API surface: styling goes through their theme, structure goes
through their slots, and we cannot take a component and edit its source. That directly
contradicts the copy-in model we want, and it introduces a second design language (their
opinionated styling) next to Tailwind tokens and shadcn's variants. It also couples us to
their release cadence for every fix.

**Base UI directly (via shadcn's Base UI variants).** A serious contender and the
ecosystem's forward direction: Base UI is stable, at 1.6.0 with 6M+ weekly downloads at the
time of the shadcn announcement, and the API is cleaner in places. It was rejected for v1
because its community corpus is materially smaller, our specific requirements are
sidebar-collapse plus resizable-pane plus chat-scrolling behaviours where Radix's
solutions are the well-trodden ones, and AI tooling still emits Radix props by default
(leading to code that silently misbehaves rather than failing loudly). Because shadcn
supports both behind one flag, this is a decision we can reverse cheaply later.

**Raw Radix without shadcn.** Rejected on effort: we would rebuild every component
ourselves — the sidebar's responsive behaviour, the resizable pane, the toast system, the
combobox — which is exactly the work shadcn has already done and that we would then have
to maintain in our own code anyway, with less community bug-reporting.

**Mantine / MUI / Chakra UI.** Styled libraries with strong defaults. Rejected for the
same reason as HeroUI — they impose their own design language and theme model, they are
heavier in the bundle, and they are not "copy the source and edit it" tools. In a project
where the visual design is going to be ours and where AI tools will be editing component
files directly, a themeable black box is the wrong shape.

## Revisit triggers

- **shadcn/ui drops Radix support**, or publishes a Radix deprecation timeline — either
  would make the "one flag away" exit path disappear.
- **Base UI reaches parity on every component we use** (`sidebar`, `resizable`,
  `scroll-area`, `combobox`, `sonner`-equivalent toasts, and the chat primitives) and the
  community corpus for it becomes comparable to Radix's.
- **The team prefers a fully styled component library** — i.e. we decide that shipping
  design-system work ourselves is more expensive than accepting someone else's theme
  model, which would make HeroUI or Mantine the better trade.
- AI tooling for this repo demonstrably produces Base UI props reliably, removing the
  "AI tools assume Radix" advantage that currently justifies staying on Radix.
