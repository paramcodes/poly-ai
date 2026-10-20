# Phase 3 Implementation Plan — App Shell and Categories

## Spec and Scope
This plan implements Phase 3 of Poly-AI as specified in `todos.md`, `docs/glossary.md`, and `AGENTS.md`:
1. Empty-state toast contract (`src/lib/toast.ts` + `notifyCategoryEmpty`) with Sonner severity encapsulation (amber for not configured, red for failed) and unit tests.
2. Collapsible sidebar with cookie persistence (`sidebar_state`), listing the 5 categories (`text`, `image`, `video`, `music`, `website`) from `src/lib/categories.ts`, settings link, theme toggle, and sign out.
3. Category routes `/app/[category]` with dynamic validation and `/app` redirect.
4. Model picker component fetching user models for the category from `/api/models?category=${category}`, filtering to active enabled models.
5. Persistent empty-state card alongside the one-shot toast when no active models exist for a category, linking to `/settings/providers`.
6. Playwright e2e tests for sidebar navigation, cookie persistence, empty state, and category routing.

## Global Constraints
- Framework: Next.js 16.4.2 App Router, React 19.3, Tailwind v4.
- Icons: `lucide-react`.
- UI: shadcn components in `src/components/ui/` (`sidebar.tsx`, `button.tsx`, `select.tsx`, `card.tsx`, etc.).
- Categories single source of truth: `src/lib/categories.ts` (`CATEGORIES`, `CATEGORY_META`, `SIDEBAR_CATEGORIES`, `isCategory`).
- Toast contract: Sonner (`sonner`). Severity lives with the message in `src/lib/toast.ts`, never at the call site. Amber (warning) for "not configured", red (error) for "failed".
- Server-only modules (`db`, crypto, `session`) must not be imported in client components.
- Linter: Biome (`pnpm lint`). Typecheck: `pnpm typecheck`. Tests: `pnpm test`, `pnpm test:e2e`.
- Commit size: Under 3000 tokens per commit.

---

## Task 1: Toast Contract and Category Empty Notification

### Description
Implement `src/lib/toast.ts` with `notifyCategoryEmpty(category, reason)` adhering to the toast contract.
In `docs/glossary.md`:
- "The toast colour carries the cause: amber means 'not configured yet', red means 'attempt failed'."
- `AGENTS.md`: "Severity lives with the message in `src/lib/toast.ts`, never at the call site."
`notifyCategoryEmpty(category: Category, reason: "not-configured" | "failed")`:
- For `"not-configured"`: triggers `toast.warning(title, { description, id })` with an amber warning style. Message clearly states no active models are configured for `${CATEGORY_META[category].name}` and guides the user to Settings.
- For `"failed"`: triggers `toast.error(title, { description, id })` with a red error style. Message explains that model or provider verification failed for `${CATEGORY_META[category].name}`.
- Uses fixed toast `id` based on category and reason (e.g. `empty-category-${category}`) to avoid spamming duplicate toasts on re-renders.
Add comprehensive unit tests in `tests/unit/toast.test.ts` verifying:
- Call to `toast.warning` when reason is `"not-configured"`.
- Call to `toast.error` when reason is `"failed"`.
- Correct category display names from `CATEGORY_META`.
- Deduplication id in toast options.

### Acceptance Criteria
- `src/lib/toast.ts` exports `notifyCategoryEmpty` and type `CategoryEmptyReason = "not-configured" | "failed"`.
- Call site does not specify toast severity (`toast.error` or `toast.warning` are only called inside `src/lib/toast.ts`).
- `tests/unit/toast.test.ts` passes with 100% assertions green via `pnpm test`.
- `pnpm lint` and `pnpm typecheck` pass.

---

## Task 2: App Sidebar and Layout Shell

### Description
Create the application layout shell for `/app`:
1. `src/components/app/app-sidebar.tsx`:
   - Uses `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarFooter` from `src/components/ui/sidebar.tsx`.
   - Header: Poly-AI logo, product name, link to `/app/text`.
   - Main menu: Maps over `SIDEBAR_CATEGORIES` from `src/lib/categories.ts`.
     - Uses correct icons for each category: `text` -> `Type`, `image` -> `ImageIcon`, `video` -> `Clapperboard`, `music` -> `Music2`, `website` -> `Code2`.
     - Highlights active category comparing pathname to `/app/${category}`.
     - Tooltip with category name when collapsed.
   - Footer:
     - Link to Settings (`/settings/providers`) with `Settings` icon.
     - Theme toggle component.
     - User session display and sign-out button calling `authClient.signOut()`.
2. `src/components/app/app-header.tsx`:
   - Top bar inside the main view containing `<SidebarTrigger />`, separator, breadcrumb or category title, and quick links.
3. `src/app/app/layout.tsx`:
   - Server component reading `cookies()`:
     ```ts
     const cookieStore = await cookies();
     const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
     ```
   - Wraps content in `<SidebarProvider defaultOpen={defaultOpen}>`.
   - Renders `<AppSidebar />`, `<SidebarInset>`, `<AppHeader />`, and children.
4. `src/app/app/page.tsx`:
   - Default route redirecting `/app` to `/app/text` via Next.js `redirect("/app/text")`.

### Acceptance Criteria
- `/app` redirects to `/app/text`.
- Layout shell renders the sidebar with 5 categories and links to `/settings/providers`.
- Sidebar collapse toggles and sets `sidebar_state` cookie.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

---

## Task 3: Model Picker, Empty State, and Category Routes

### Description
Implement the category pages `/app/[category]` with model picker and persistent empty state:
1. `src/components/app/category-empty-state.tsx`:
   - Persistent inline `Card` rendered when a category has no usable models.
   - Props: `category: Category`, `reason: "not-configured" | "failed"`.
   - Calls `notifyCategoryEmpty(category, reason)` inside a `useEffect` on mount.
   - Card content:
     - Warning/Alert icon.
     - Title: "No models configured for {Category}" or "Provider verification failed".
     - Explanatory description.
     - Call to action `Button asChild` with `Link href="/settings/providers"` ("Configure Providers in Settings").
2. `src/components/app/model-picker.tsx`:
   - Select dropdown from `src/components/ui/select.tsx` (or Popover/Command).
   - Props: `models: AssignedModel[]`, `selectedModelId: string | null`, `onSelectModel: (id: string) => void`, `disabled?: boolean`.
   - If `models.length === 0`: renders disabled select showing "No models available".
   - If models exist: renders model name with provider name badge.
3. `src/components/app/category-view.tsx`:
   - Client component for `/app/[category]`.
   - Fetches models from `/api/models?category=${category}` (or receives server initial models).
   - Filters active models: `m.enabled && m.providerStatus === "active"`.
   - Computes state:
     - If loading: renders skeleton loader.
     - If active models exist: renders category header with title, description, `<ModelPicker />`, and placeholder workspace for generation (prompt textarea, generate button ready for Phase 4/5/6).
     - If no active models exist: renders `<CategoryEmptyState category={category} reason={reason} />`. Reason is `"failed"` if any model exists with `providerStatus === "invalid"`, otherwise `"not-configured"`.
4. `src/app/app/[category]/page.tsx`:
   - Validates `category` with `isCategory(params.category)`. If false, calls `notFound()`.
   - Sets dynamic metadata `title: `${CATEGORY_META[category].name} — Poly-AI``.
   - Renders `<CategoryView category={category} />`.

### Acceptance Criteria
- Navigating to `/app/[category]` with valid category (`text`, `image`, `video`, `music`, `website`) renders the category view.
- Navigating to `/app/invalid` returns 404 (`notFound()`).
- When no active models exist for a category:
  - Persistent inline empty state card is displayed with link to `/settings/providers`.
  - Amber (or red) toast is shown via `notifyCategoryEmpty`.
- When models exist:
  - Model picker displays the models and allows selecting one.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.

---

## Task 4: E2E Tests, Evidence Capture, and Phase Completion

### Description
Add Playwright e2e tests and update evidence capture:
1. `tests/e2e/app-shell.spec.ts`:
   - Tests `/app` redirect to `/app/text`.
   - Tests category navigation through sidebar (`/app/text`, `/app/image`, `/app/website`).
   - Tests sidebar collapse/expand and cookie persistence (`sidebar_state`).
   - Tests empty state persistent card and toast notification on category pages without configured models.
   - Tests `/app/unknown-category` returns 404.
2. `scripts/capture-evidence.ts`:
   - Update script to capture `/app/text` (app shell with sidebar and category view) and save to `docs/evidence/phase-3/app-shell.png` and `docs/evidence/phase-3/category-empty-state.png`.
3. Update `todos.md`:
   - Check off all Phase 3 tasks.
   - Set current phase status to ready/complete.

### Acceptance Criteria
- `pnpm test:e2e` passes including `tests/e2e/app-shell.spec.ts`.
- `pnpm evidence` captures evidence artifacts under `docs/evidence/phase-3/`.
- `todos.md` reflects all completed Phase 3 tasks.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` all green.
