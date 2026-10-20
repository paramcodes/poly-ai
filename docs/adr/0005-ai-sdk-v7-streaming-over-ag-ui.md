# ADR 0005: AI SDK v7 streaming instead of the AG-UI protocol

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI streams every generation live. Text and website categories stream tokens
incrementally; image, video and music categories stream status and progress events until
the asset is ready. We need one client-side story for all five categories, and the
streaming protocol we pick determines how much of the UI we write ourselves.

Two candidate protocols:

**The Vercel AI SDK v7** (`ai@^7` + `@ai-sdk/react@^4`). `streamText()` produces a data
stream with typed parts — text, reasoning, tool calls, custom data parts — and
`toUIMessageStreamResponse()` turns it into the HTTP response consumed by `useChat` on the
client. It is already the reference implementation for the Vercel AI SDK provider
packages we use, including `@ai-sdk/openai-compatible`, which carries most of the
provider long tail (ADR-0003).

**AG-UI** (the Agent User Interaction Protocol, from the CopilotKit ecosystem, spec 1.0
with 1.1 in draft). Per https://docs.ag-ui.com/introduction, AG-UI is an open, event-based
protocol that standardises how an agent runtime connects to a user-facing application. It
defines typed events for text messages, tool calls, reasoning, shared state (snapshots
plus deltas), activity, subagents, and interrupts/resume, transported over HTTP+SSE or
Protobuf. It has TypeScript, Python and .NET SDKs, a Generative UI specification, and
integrations with LangGraph/LangChain, CrewAI, Mastra, the OpenAI Agents SDK, Cloudflare
Agents, AWS Bedrock AgentCore, the Claude Agent SDK, Google ADK, Pydantic AI, Agno,
LlamaIndex and AG2.

One AG-UI feature is directly relevant and must be acknowledged: AG-UI supports a
**"Direct to LLM"** mode with no agent framework behind it, so it *can* wrap plain model
calls. "It is possible to use AG-UI" is therefore not a reason to reject it on capability
grounds. The question is whether it buys anything here.

## Decision

**We do not adopt AG-UI for v1. We stream with the AI SDK v7 data stream.**

### Why not AG-UI

AG-UI is an **agent** protocol. Its value is concentrated in agent-shaped problems:
multi-step tool orchestration, an agent loop that runs across multiple model calls,
shared mutable state between backend and frontend, human-approval interrupts, subagent
trees, and a chat surface that has to render an agent's *process* as well as its output.

Poly-AI in v1 has none of those. It is a **single-turn BYOK generation studio**: the
user picks a category, picks a model, types a prompt, and receives one output. There is
no agent loop, no tool calling, no shared state, no interrupt, no subagent. Adopting
AG-UI would mean:

- **Translating every provider response into AG-UI events** — a mapping layer whose only
  job is to convert `text` into `RUN_STARTED` / `TEXT_MESSAGE_CONTENT` / `RUN_FINISHED`,
  with the provider-specific semantics flattened away.
- **Adding the AG-UI client on top of `useChat`**, which already streams text, reasoning,
  tool calls and custom data parts natively. That is a second client, a second message
  model, and a second set of React state, next to the one we already need.
- **Paying all of that for zero functional gain**, because none of AG-UI's differentiating
  features apply to a single-shot generation.

### What AG-UI did influence

Two design ideas from AG-UI are adopted, without the dependency:

1. **Separation of lifecycle from content.** AG-UI keeps "the run started / the run
   progressed / the run failed" distinct from "here is a chunk of content". That
   separation is the basis of our own **`GenerationEvent` union** for media streaming:
   `queued` → `progress` → `partial` → `complete` → `error`. We take the design, not the
   protocol. See ADR-0006 for how these events drive the job model.
2. **Resumability as a first-class concept.** AG-UI's resumable/interrupt model
   confirmed our own approach to long-running media jobs: a job outlives the request that
   started it, and the client can pick the result up later. See ADR-0006 and ADR-0010.

### The streaming design

- **Text and website** use the AI SDK data stream. The server route handler calls
  `streamText()` and returns `toUIMessageStreamResponse()`. The client consumes it with
  `useChat` from `@ai-sdk/react@^4`. The client attaches the selected `providerId` and
  `modelId` to each request via `prepareSendMessagesRequest`, so the server knows which
  provider and model to construct — the server never has to guess from the prompt, and
  the key for that provider is decrypted only when the call is built (ADR-0004).
- **Image, video and music** stream status via the **`GenerationEvent` SSE union**
  (`queued`, `progress`, `partial`, `complete`, `error`), emitted from the generation
  route handler. Media providers do not produce a token stream, so a token-shaped
  protocol would be a lie; a small typed event union is the honest shape for them.
- **A single client hook normalises both.** One hook — something like
  `useGenerationStream()` — returns a uniform view (`status`, `text`, `partialAssets`,
  `result`, `error`) to every category component, so **no category component branches on
  which protocol is in use**. Adding a fifth media type later touches the adapter, not
  the UI.

### Open question to settle in implementation

`@ai-sdk/react@^4` exports **both** `useChat` (a React hook) **and** a `Chat` class
(both are present in the installed package's type definitions). The hook is the
path of least resistance; the class is the shape that composes better with external
stores. **Which one is the recommended v7 entry point for this app is not settled here**,
and the implementation phase must pick one, use it consistently, and update the follow-ups
in this ADR. Until then, both are permitted and mixing them in one surface is not.

## Consequences

### Positive

- **One streaming implementation, not two.** The AI SDK data stream is already
  battle-tested against every provider package we ship, including the 193
  OpenAI-compatible ones (ADR-0003). We write no stream serialisation of our own for
  text.
- **No translation layer.** Provider responses go into `streamText()` directly. The
  mapping we would have to maintain for AG-UI does not exist.
- **One client state model.** `useChat` gives us message parts, streaming status and
  error handling for text; the `GenerationEvent` union gives us the same shape of
  information for media; one hook hides the difference.
- **The AI SDK is where the providers are.** Adding a provider package later (fal,
  Replicate, Google) is a dependency change in a codebase that already speaks the SDK's
  vocabulary, not an integration with a third protocol.
- We keep the AG-UI-shaped ideas (lifecycle events, resumability) without the dependency
  or the extra client.

### Negative / costs

- **We give up protocol portability.** If we later want to consume a third-party
  AG-UI-compatible agent, or expose Poly-AI over Slack or Teams, we will have to
  translate at the boundary rather than speak the protocol natively. That cost is
  deferred, not avoided — and it is real.
- **We cannot show agent-shaped UI for free.** Reasoning traces and tool calls can be
  rendered (the AI SDK streams both as parts), but a shared-state store, a timeline of
  agent steps, or an approval interrupt is work we would have to build, not features we
  would inherit.
- **The `GenerationEvent` union is ours to maintain.** It has no upstream spec, so
  changes to media streaming semantics are internal changes.
- **The `useChat` versus `Chat` question is unresolved**, and the two APIs have subtly
  different ergonomics. Picking wrong costs a refactor of the streaming layer.

### Neutral / follow-ups

- ADR-0006 (resumable job model) and ADR-0010 (client-driven polling) depend on the
  `GenerationEvent` union defined here.
- If we later adopt AG-UI, the natural migration is: keep the `GenerationEvent` union as
  our internal model, and add an AG-UI encoder at the server boundary as an alternative
  transport. The client hook is the natural place to add a second protocol reader.
- The `useChat` vs `Chat` decision must be recorded in this ADR's follow-ups once made.

## Alternatives considered

**AG-UI.** As analysed above: an agent protocol for a non-agent application. It would add
an event-translation layer, a second client, and a second message model, in exchange for
capabilities (tool loops, shared state, interrupts, subagents) that Poly-AI v1 does not
have. Its "Direct to LLM" mode makes adoption *possible*, not *useful*.

**A hand-rolled SSE protocol for everything.** Rejected. We would be re-implementing
chunked text streaming, reasoning parts, tool-call parts, error handling, reconnection and
message-part typing that the AI SDK already implements and tests against every provider
we support. Hand-rolling SSE for the text path would be strictly worse than the
dependency we already take for the provider layer.

**LangGraph, CrewAI, Mastra or another agent framework.** Rejected for v1: there is no
agent loop to run. Introducing a framework means adding its state model, its checkpointing
and its runtime, to produce the same single output that `streamText()` produces today.
Mastra is worth revisiting specifically because it is the framework AG-UI lists as a
first-party integration, so it would be the cheapest path to AG-UI later if we ever want
one.

**WebSocket instead of SSE for streaming.** Not adopted. SSE fits our direction of travel
(server → client only), works through the HTTP stack we already have, and is compatible
with the AI SDK's own data-stream transport. A bidirectional channel is a v1 feature we
do not need.

## Revisit triggers

- **We add multi-step agentic workflows with tool calling** — a generation that runs
  several model calls, uses tools, and needs to show the agent's steps. This is the
  condition AG-UI was designed for, and it is the first reason to adopt it.
- **We want one protocol across surfaces** — for example the same generation experience
  on the web and on chat platforms such as Slack or Teams via the AG-UI Channels SDK.
  Then a shared protocol has real value and the translation layer stops being waste.
- **We need human-in-the-loop approval interrupts** — the user must approve a step
  mid-run and the run must resume. The AI SDK can express tool approval, but if the
  pattern becomes central to the product, AG-UI's interrupt/resume model is designed for
  exactly it.
- **We want to consume third-party AG-UI-compatible agents** as providers inside Poly-AI,
  which requires speaking AG-UI rather than the AI SDK.
