# ADR 0007: iframe `srcDoc` sandbox for the website artifact preview

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

The website category generates a standalone HTML document and renders it **live in a
resizable right-hand preview** beside the generation panel. The output is model-authored
code: an entire HTML document, typically with inline `<style>` and `<script>`, produced
from a natural-language prompt by a model we do not control.

That makes the preview a security boundary, not just a rendering surface. A model can be
prompted — deliberately or by a user testing it — to emit a document containing
`<script>` that tries to read our cookies, enumerate our DOM, exfiltrate data, open a
credential-harvesting popup, or make requests to internal endpoints. The preview runs in
the user's browser, in the same origin as the app by default. If the model's output
executes in our page context, we have a stored-XSS hole in a multi-user application where
every user's session token is reachable.

The preview also has to feel live: the user watches the page build itself as the model
writes it, in a pane they can resize between desktop, tablet and mobile widths.

## Decision

We render the generated document in a **sandboxed `<iframe>` using `srcDoc`**.

```tsx
<iframe
  key={revision}
  srcDoc={html}
  sandbox="allow-scripts allow-forms allow-popups"
  className="h-full w-full border-0 bg-white"
/>
```

### Sandbox flags

The sandbox is `allow-scripts allow-forms allow-popups`, and it **deliberately omits
`allow-same-origin`**. That omission is the whole security property:

- The iframe is given an **opaque origin**. Its scripts cannot read our cookies or
  `localStorage`, cannot touch our DOM, cannot call `window.parent`, and cannot read the
  app's origin.
- `allow-scripts` is required — generated sites are interactive and the user expects
  buttons, animations and forms to work.
- `allow-forms` and `allow-popups` are granted because generated sites legitimately
  contain forms and `target="_blank"` links. `allow-popups` gives the popup a sandboxed
  document too; `allow-popups-to-escape-sandbox` is **not** granted, so a popup cannot
  break out.
- We do **not** grant `allow-top-navigation`, `allow-modals`, `allow-downloads` or
  `allow-storage-access-by-user-activation`.

Model-authored JavaScript runs isolated, with no access to our session.

### Remount on revision

The iframe is **`key`ed on a monotonically increasing revision counter**. Assigning a new
`srcDoc` to a live iframe does not reliably re-execute scripts in every browser — the
document may be updated in place, and scripts that already ran will not run again. Changing
the `key` forces React to unmount and remount the element, which produces a genuinely new
document with a fresh script execution.

### Streaming behaviour

- While the model is still writing, `srcDoc` updates are **debounced by ~400 ms**. A
  faster cadence would remount the iframe dozens of times per second and make the
  preview unusable (flicker, scroll loss, CPU burn).
- On **completion**, the final HTML is applied **immediately**, with no debounce, so the
  user does not wait for a timer after the stream ends.
- Intermediate revisions are *best effort*: the preview fills in live as the model
  writes, and the completed document is authoritative.

### Device-width toggles

The preview offers **desktop (1280 px), tablet (768 px) and mobile (390 px)** width
toggles, implemented by constraining the iframe's rendered width inside the pane (with
the pane itself scrolling horizontally when the chosen width exceeds it). The iframe is
always sized to the available height; only the inner document width changes.

### HTML extraction

Model output is prose plus, hopefully, a document. We normalise it with a deterministic
extraction step, in this order:

1. If a fenced code block exists (```` ```html ```` or ```` ```htm ````), take the
   **contents of that block**.
2. Otherwise, find the first `<!DOCTYPE html` or `<html` and take everything **through
   the last `</html>`**.
3. Otherwise, if the output contains a `<body` or `<div` fragment, **wrap it in a minimal
   HTML shell** (doctype, `<html lang="en">`, `<head>` with a charset declaration, and a
   `<body>`).
4. Otherwise, return a **minimal error document** stating that the model produced no
   HTML.

In all cases we strip a leading or trailing markdown fence and any prose that precedes
`<!DOCTYPE`.

## Consequences

### Positive

- **Model output cannot touch the app.** The opaque origin means an injected script
  cannot steal the session, read our DOM, or call our API with the user's credentials.
  This is the failure mode we are specifically defending against, and the sandbox
  eliminates it by construction rather than by sanitisation.
- **No sanitiser to maintain.** We do not attempt to parse and clean model HTML — an
  allowlist sanitiser is a permanent source of bypasses. Isolation is a stronger and
  simpler property.
- **The preview is genuinely live.** Debounced remounts during streaming give the
  "watch it build" feel, and the immediate application on completion keeps the final
  artefact exact.
- **The mechanism is native.** `srcDoc` + `sandbox` is a browser primitive with no
  dependency, no bundler, and no build step between the model's output and the screen.
- **Device toggles are a layout concern, not a rendering concern.** We constrain the
  iframe width; the document inside is unmodified, so what the user sees is what the
  model wrote.

### Negative / costs

- **Some generated sites break without `allow-same-origin`.** Scripts that read
  `localStorage`, use `fetch` to their own origin, or rely on `document.cookie` will
  throw. This is a deliberate trade: those are exactly the capabilities we refuse to
  grant. A site that needs a backend will not work in the preview.
- **The preview cannot talk back to the app.** No messaging, no shared state, no
  hand-off of user input collected in the preview. If a future requirement needs the
  generated site to call into Poly-AI, this decision must be revisited with a security
  redesign, not patched.
- **Remounting resets the document.** Scroll position, form state and any JS-held state
  inside the preview are lost on each revision. During streaming that is acceptable;
  afterwards it would not be, which is why the final render is applied once and the
  revision counter stops incrementing.
- **Debounced remounts are still remounts.** On a slow machine a large document
  re-parsed every 400 ms is a visible cost. The debounce interval is a tuning knob.
- **The extraction heuristic is best-effort.** A model that emits a document with a
  `<!DOCTYPE` inside a string literal, or two fenced blocks, may be mis-extracted. The
  failure mode is a wrong preview, not a security problem.

### Neutral / follow-ups

- The extraction function is a pure function and should be unit-tested against a corpus
  of real model outputs (fenced, raw, fragment-only, prose-only).
- If we later support "open in new tab", the blob-URL approach must carry the same
  isolation guarantees — a blob URL inherits the creating origin, so it would need to be
  served from a sandboxed context, not from our origin.
- Generated sites that need external assets (CDN scripts, fonts) must be allowed to make
  outbound requests; this is permitted by the current sandbox and should stay that way
  unless it becomes a privacy concern.

## Alternatives considered

**Sandpack (`@codesandbox/sandpack-react`).** The obvious alternative, and the right tool
for a different job: multi-file projects with npm imports, a real bundler in the browser,
and a live dev-server-like experience. We rejected it because our artefacts are
**single, self-contained HTML documents**. Sandpack adds a heavy in-browser bundler
(the dependency itself is large), a second rendering model to learn, and a preview that
does not match what the user would deploy. It is deferred, not dismissed: if the product
grows to multi-file project generation, this is the first thing to revisit.

**WebContainers.** A full Node runtime in the browser. Overkill for a single-file
artefact: slow to boot, large download, and it gives the generated code a Node-like
environment we do not need and would not want to secure.

**`react-markdown` + `rehype-raw` rendering into our own DOM.** Rejected on the exact
grounds the sandbox exists: `rehype-raw` injects the model's HTML into **our** document.
A `<script>` or an event handler in the output then executes with our origin, our cookies
and our DOM access. This is the class of bug the sandbox is the answer to.

**Rendering to a blob URL and pointing the iframe at it.** Rejected because a blob URL
inherits the origin of the page that created it, so the iframe's document is same-origin
with our app — the isolation is lost. A blob URL also does not give us the sandbox
attribute semantics we need, and it leaks the document into the app's origin storage.

**Serving generated HTML from our own route (`/preview/<id>`).** Rejected because it puts
untrusted HTML on our origin, where it would be same-origin with the app and with the
user's session. Serving it from a separate sandboxed origin would work, but it requires
a second domain and the deployment and CSP work that comes with it.

## Revisit triggers

- **We need npm-package imports in generated sites** — the artefact stops being a
  self-contained document and Sandpack (or a bundling step) becomes the right tool.
- **We need a multi-file project model** (several files, an entry point, shared
  components), which the single-`srcDoc` document cannot represent.
- **We want the preview to talk back to the app** — receiving user input, calling a
  Poly-AI endpoint, or sharing state. This requires `allow-same-origin` (or a `postMessage`
  bridge with a separate origin) and therefore a security redesign of this decision.
- Generated sites commonly break under the opaque origin in a way users report as a
  bug (local storage, same-origin `fetch`), which would make the sandbox flags a product
  issue rather than an implementation detail.
