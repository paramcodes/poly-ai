# ADR 0003: models.dev as the model catalogue

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI's core promise is BYOK: a user brings their own key, registers **any** provider,
and assigns **any** model to any category. That promise is only credible if the model
catalogue is not a list we maintain by hand. A hard-coded vendor list is a permanent
maintenance liability: it is stale on the day it ships, it omits the long tail of
aggregators and regional providers that BYOK users actually want, and every addition
becomes a code change and a release.

What the catalogue has to do:

1. **Enumerate providers** with enough information to create a working client for each:
   the AI SDK package to use, the base URL, and the environment-variable name that
   conventionally holds the key.
2. **Enumerate models per provider** with enough information to decide which Poly-AI
   category a model can serve (text, image, video, audio) and to give the user a sensible
   default ordering.
3. **Keep working when the upstream source is down.** An empty provider list is a dead
   app — the user cannot even configure a key.

We evaluated `https://models.dev/api.json` as the catalogue source and verified its
contents on **2026-10-20** by fetching the live document.

### Verified shape of the live API

Top level is a JSON object keyed by provider id. **232 providers**, **9,079 models** in
total. (Both numbers move between snapshots; the catalogue grew by roughly a thousand
models over the months preceding this ADR. Nothing in the code may depend on these
counts.)

Provider entry:

```json
{
  "id": "openai",
  "name": "OpenAI",
  "npm": "@ai-sdk/openai",
  "env": ["OPENAI_API_KEY"],
  "api": "https://api.openai.com/v1",
  "doc": "https://platform.openai.com/docs/models",
  "models": { "<modelId>": { /* ... */ } }
}
```

- `npm` is the AI SDK package that implements that provider.
- `env` is the list of environment-variable names that conventionally carry that
  provider's key. **All 232 providers carry a non-empty `env` array**, which is what lets
  us pre-fill the right variable name as a hint when a user adds a provider.
- `api` is the provider's base URL. **207 of 232 providers carry it.** The 25 that do
  not are first-party providers whose base URL is baked into their SDK package
  (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` and similar). This matters
  below.
- `doc` is a documentation link we can show next to the key field.

Model entry (fields that are present on every model): `id`, `name`, `description`,
`attachment`, `reasoning`, `tool_call`, `release_date`, `last_updated`,
`modalities: { input, output }`, `open_weights`, `limit: { context, output }`, and
`status` where applicable. Present on a subset: `family` (8,358), `temperature` (8,529),
`structured_output` (6,368), `knowledge` (4,787), `cost` (8,625),
`canonical_model_id` (6,197), `reasoning_options` (6,785), `interleaved` (1,403),
`type` (50). `limit.input` is present on 1,605 models; `limit.context` and `limit.output`
are present on all of them.

### The critical correction: `type` is not a capability signal

The per-model `type` field **is null for ~98% of models** — 9,029 of 9,079 (99.4%) in
the 2026-10-20 snapshot. Where it is populated it says `'image'` (32), `'embedding'` (7),
`'transcription'` (6), `'realtime'` (2), `'reranking'` (2) and `'video'` (1). Using `type`
to decide whether a model can generate an image would classify 9,029 models as "unknown"
and produce an app where almost nothing is selectable. **`type` must not be used for
capability detection.**

The reliable signal is **`modalities.output`**. Distribution across the 9,079 models:

| `modalities.output` | Models |
| --- | --- |
| `text` | 8,710 |
| `image` | 101 |
| `text` + `image` | 97 |
| `video` | 73 |
| `audio` | 47 |
| `text` + `audio` | 33 |
| `image` + `text` | 10 |
| `text` + `image` + `audio` | 4 |
| `image` + `pdf` | 3 |
| `audio` + `text` | 1 |

Providers offering at least one image-output model: 30. Audio-output: 23. Video-output:
exactly 10 — `alibaba-token-plan`, `alibaba-token-plan-cn`, `digitalocean`, `fastrouter`,
`google`, `nvidia`, `poe`, `qiniu-ai`, `vercel`, `xai`.

### The second key finding: most providers are one code path

**193 of the 232 providers list `npm: "@ai-sdk/openai-compatible"`.** Those 193 all carry
an `api` base URL (all 193/193 have `api` present). The `@ai-sdk/openai-compatible`
package supports `.imageModel()` — including the `/images/generations` and
`/images/edits` shapes — and therefore covers both chat and image models for that long
tail. See https://ai-sdk.dev/v7/providers/openai-compatible-providers

That means "add any provider" is **mostly one code path** (OpenAI-compatible chat + image
models, keyed by base URL) plus roughly 39 first-party provider packages, not 232
integrations.

### Other catalogue facts that shape behaviour

- **`status`**: 8,699 models have no status, 301 are `deprecated`, 78 are `beta`, 1 is
  `alpha`. Deprecated models must be hidden from the default catalogue view but must stay
  selectable — users on an older model should not have their working configuration
  invalidated by a catalogue refresh.
- **`canonical_model_id`** is present on 6,197 models and identifies the canonical entry
  for models that are duplicated across providers or resold under several names. It is the
  key for de-duplicating the catalogue view.
- There is **no capability flag for code generation** anywhere in the schema.

## Decision

We use **`https://models.dev/api.json` as the model catalogue**, fetched server-side,
cached for **6 hours**, with a **committed fallback snapshot** in the repository.

Concretely:

- The catalogue is fetched **server-side only** (route handlers / server components), never
  from the browser. The browser receives our own normalised catalogue shape.
- The upstream document is cached for **6 hours**. The cache is a server-side HTTP cache
  with a 6-hour revalidation window plus an in-process memo, so a burst of users does not
  mean a burst of upstream requests.
- A **fallback snapshot is committed to the repository** (`src/server/catalogue/models.dev.snapshot.json`),
  refreshed on a schedule and used whenever the upstream fetch fails. The app degrades to
  a slightly stale catalogue instead of an empty one.
- The upstream document is **normalised into our own type** at the boundary. No part of
  the application reads the upstream shape directly, so an upstream schema change is a
  change to one adapter, not to every consumer.

### Capability → category mapping

Capability is derived from `modalities.output`:

| Capability | Categories it enables |
| --- | --- |
| `text` | text, website |
| `image` | image |
| `video` | video |
| `audio` | music |

**This mapping is a proposal, not a hard constraint.** The user may assign any model to
any category. What the mapping buys is a *default* plus *guard rails*:

- A model whose capabilities do not cover the chosen category is **blocked from that
  category with an explanation** of which capability is missing.
- The user can **force-enable it anyway**, after an explicit warning that the provider may
  reject the request or return an unusable result.

### The website category

models.dev has no code-generation capability flag, so **every text-capable model is
eligible for the website category** — which is the correct behaviour, since a capable
model does not need to be labelled to be usable. What the catalogue cannot give us is
*ranking*.

Ranking for the website category uses a **curated allowlist of code-capable families**
plus a **user pin**. The allowlist is seeded with patterns such as `qwen3-coder`,
`qwen3-max`, `claude-*`, `gpt-5*`, `gemini-2.5-pro` and `deepseek-v3*`.

> **Open question / implementation note.** The allowlist must be maintained against the
> live `family` values, not against model ids. In the 2026-10-20 snapshot the family
> tokens are finer-grained than the patterns above — `claude-sonnet`, `claude-opus`,
> `claude-haiku`, `gpt-codex`, `qwen3.5`, `codestral`, `deepseek`, `gemini-pro`,
> `gemini-flash` — so the seeded patterns need to be reconciled with what the API
> actually returns before they are used for ranking. The mechanism (allowlist + user pin)
> is decided; the exact token list is not, and must not be hard-coded from memory.

## Consequences

### Positive

- **The long tail is free.** Users can register aggregators, regional gateways and
  self-hosted-compatible endpoints without us shipping an integration. New providers
  appear in the app within 6 hours of upstream publishing them, with no release.
- **The key field can be pre-filled correctly.** Because every provider carries `env`,
  the "add provider" form can suggest `OPENAI_API_KEY`, `FAL_KEY` and so on, and can
  label the field with the provider's real variable name instead of a generic "API key".
- **Almost every provider is one adapter.** 193 of 232 providers route through
  `@ai-sdk/openai-compatible`, so the "any provider" promise costs roughly 39 special
  cases rather than 232.
- **Capability detection is accurate** because it uses `modalities.output`, which is
  populated on every model, rather than `type`, which is populated on 50.
- **Deprecated models stay usable.** Hiding them from the default view while keeping them
  selectable means a catalogue refresh never breaks a user's working configuration.
- **The app survives an upstream outage** via the committed snapshot.

### Negative / costs

- **We depend on a third party for a core surface.** models.dev is a community project.
  If its schema changes, our adapter breaks; if it disappears, our catalogue goes stale
  until we maintain it by hand. The committed snapshot is the insurance, not the fix.
- **The catalogue is a moving target.** Between our own snapshots the model count moved
  by hundreds and per-provider capability counts moved by one or two. Any UI that
  displays absolute counts, sorts by "provider X" with a hard-coded model list, or tests
  against a fixed model id will break without warning.
- **Capability data is coarse.** `modalities.output` says a model emits video; it says
  nothing about duration limits, resolution support, or whether a specific provider
  actually exposes the model in the user's region.
- **The website category has no principled ordering from the catalogue**, so the curated
  allowlist is a maintained asset that will rot as family names change.
- **We inherit upstream naming.** Model ids and provider ids are the upstream strings.
  When upstream renames an id, a user's stored assignment can dangle; `canonical_model_id`
  helps but does not fully solve this.
- The snapshot file is large (~5.8 MB of JSON in the 2026-10-20 snapshot). Committing it
  is a repository-size and diff-noise cost that requires a deliberate refresh cadence.

### Neutral / follow-ups

- The API currently carries a partial `cost` field (8,625 of 9,079 models). We do not
  display pricing in v1, but the field is available if we later want a cost hint.
- Providers without an `api` base URL rely on their SDK package for the endpoint; the
  "add provider" form must handle both cases (base URL required vs. optional).
- The normalisation adapter is the only place allowed to know the upstream schema.

## Alternatives considered

**A hard-coded vendor list in the repository.** Rejected: unbounded maintenance. It would
need a release for every new provider and every new model, it would omit the long tail of
BYOK providers that is exactly the audience, and it would make the catalogue a fork of
models.dev that is wrong within weeks.

**Letting users type model IDs with no catalogue.** Rejected: it destroys the category
assignment UX. Without capability data we cannot tell a user that the model they pasted
cannot produce an image, cannot pre-fill the right environment-variable name for their
key, cannot offer a model picker, and cannot rank anything for the website category.
The catalogue is what makes "assign models to categories" a real feature.

**Scraping each vendor's own documentation or models endpoint.** Rejected on maintenance
and brittleness: 232 scrapers, each with its own pagination, rate limits, HTML shape and
breakage schedule. The long tail of aggregators would break first and most often. One
maintained upstream feed is strictly cheaper than 232 unreliable ones.

**OpenRouter-only.** Rejected: it breaks the BYOK promise. Users would have to hold an
OpenRouter key instead of their own provider key, and the 232-provider catalogue would
collapse to one. It also creates a single point of failure and a single pricing model.

## Revisit triggers

- **models.dev changes its schema** — a renamed or removed top-level field, a change to
  the `modalities` shape, or a change to the meaning of `type` — or the endpoint moves.
  The trigger is a failing normalisation or a visible drop in the catalogue's provider
  count.
- **models.dev is unavailable or unmaintained for an extended period** (weeks, not
  hours), at which point the committed snapshot stops being a fallback and starts being
  the product.
- **A first-party catalogue API appears** from a provider or an aggregator that is more
  authoritative for that provider's models than a community-maintained feed.
- **We need per-model pricing or rate-limit data** that the catalogue does not carry.
  Note the partial `cost` field: pricing exists for most models, but rate limits and
  per-provider pricing tables do not, and if we need reliable spend estimates we will
  need another source.
- **The committed snapshot's size or refresh cadence becomes a practical problem** for
  the repository (for example if the catalogue grows past ~20 MB and diffs become
  unreadable).
