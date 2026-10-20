# Poly-AI glossary

The vocabulary the code, the docs, and the issue tracker share. When you introduce a new noun for a domain concept, add it here in the same commit.

| Term | Definition | Notes |
| --- | --- | --- |
| **Provider** | A user's configured connection to one model vendor. Holds a display name, an adapter kind (`openai-compatible`, `openai`, `anthropic`, `google`, `fal`, `replicate`, `custom`), an optional base URL, and an encrypted API key. | A user may register any number of providers. The API key is encrypted at rest and never leaves the server; the browser only ever sees a masked hint such as `••••a1b2`. |
| **Model** | One model id exposed by a provider — for example `gpt-4o-mini` — assigned by the user to a category, with a capability set. | Rows are per-user. Two users can point the same model id at different providers, and one provider can expose the same id twice under different names. |
| **Capability** | What a model can do: `text`, `image`, `video`, `audio`, plus flags such as `toolCall`, `reasoning`, `attachment`. | Capabilities are *read from the catalogue* (models.dev `modalities.output`), not chosen by the user. Category assignment is what the user chooses. The two are independent: a capability says what a model can do, the category says where it appears. |
| **Category** | One of the five app surfaces: `text`, `image`, `video`, `music`, `website`. The collapsible left sidebar selects a category, and each category page hosts its own generation panel. | The `website` category is not a sixth model kind — it is a text model asked to emit one HTML document. `music` maps to the `audio` capability. |
| **Category catalogue** | The set of enabled models assigned to a category for the current user. | It is empty when the user has no providers, has no models matching the category, or has only providers whose keys are invalid. An empty catalogue is what triggers the empty state. |
| **Adapter** | The server-side module that turns a provider plus a model into a concrete AI SDK model or provider call. | The UI never knows which vendor is behind a model; it only sees the adapter's result. Add a new vendor kind by adding an adapter, not by touching the UI. |
| **Capability adapter result** | What an adapter returns: either a synchronous result, or `{ externalId, statusUrl }` for an async provider job. | The `statusUrl` is the handle the client polls. See **Resumable job**. |
| **Generation** | One persisted run: category, provider, model, prompt, status, output, and an error code when it failed. | Status is one of `queued`, `running`, `succeeded`, `failed`, `cancelled`. The row is the audit trail for the run and the anchor for polling. |
| **GenerationEvent** | The discriminated union used to stream a media generation to the client. | The variants are `queued`, `progress`, `partial`, `complete`, `error`. Every streamed event belongs to exactly one generation. |
| **Resumable job** | A long media generation tracked by a `generations` row that holds the provider's handle, so the work survives our serverless function dying. | The client polls; no worker process is required. This is what lets the app stay a single Next.js deployment with no queue. |
| **Artifact** | A generated HTML document, rendered live in a sandboxed `iframe` in the website category. | The resizable right-hand preview hosts the iframe. The document is model output, not a file on disk. |
| **BYOK** | Bring your own key: the user supplies vendor API keys and pays the vendor directly. | There is no hosted free tier and no billing in v1. The app never proxies a bill to the user and never holds a spendable balance. |
| **Provider status** | `active` (verified working), `invalid` (the key was rejected by the vendor), `disabled` (turned off by the user). | Only `active` providers contribute to a category catalogue. `invalid` is a state the user must see and fix — it is not an error to swallow. |
| **Key envelope** | The versioned `v1.<iv>.<tag>.<ciphertext>` AES-256-GCM format used to store an API key at rest. | The `v1` prefix leaves room to change the format without ambiguity, and the IV is unique per encryption. Decryption happens on the server only. |
| **Empty state** | The persistent inline card shown when a category has no usable models, shown alongside a one-shot toast. | The toast colour carries the cause: **amber** means "not configured yet", **red** means "attempt failed". The card persists because the toast is one-shot and the condition has not been fixed. |
| **Models.dev** | The third-party catalogue API at `https://models.dev/api.json` that supplies provider and model metadata. | The snapshot taken on 2026-10-20 served 232 providers and 9,079 models. Its per-model `type` field is unreliable — null for 9,029 of 9,079 models, about 99%. `modalities.output` is the reliable capability signal and was present on every model in that snapshot. Treat the catalogue as a third-party snapshot, not a contract: it changes under you. |
| **Phase** | One vertical slice of the product, delivered as one branch, one PR, one evidence set, one merge. | A phase is the unit of release and of the verification gate. Branch naming is `phase/<N>-<slug>`. |

## Terms we deliberately do not use

- **"Mode" and "tool"** — we say **category**. The five categories are app surfaces the sidebar selects, not interchangeable modes of one generator and not pluggable tools.
- **"Integration"** — we say **provider** for the user's configured vendor connection and **adapter** for the code that talks to it. Keeping the two apart is what lets a new vendor land without touching the UI.
- **"Workspace"** — we do not say workspace for a single user's settings. There is no multi-tenant workspace concept in v1; one account is one user's providers, models, and generations.
- **"Credits", "quota", "free tier"** — there is no billing or metering. The user pays the vendor directly.
- **"Artifact"** — reserved for the website category's HTML document. An image, a video, or an audio file is an output, not an artifact.
- **"Chat"** — the text category is a generation panel, not a conversation. Nothing in v1 persists a multi-turn transcript.
- **"Plugin"** — there is no extension system. A new vendor kind is an adapter in the server tree.
