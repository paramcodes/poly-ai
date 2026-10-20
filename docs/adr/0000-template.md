# ADR NNNN: <Short imperative title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <names or roles>

## Context

*What forces are at play? What problem, constraint or requirement makes this decision
necessary? State the facts — versions, limits, measured behaviour — not opinions. A reader
who was not in the discussion should be able to reconstruct the problem from this section
alone.*

*Keep it to the constraints that actually bear on the choice. Link the ADRs this one
depends on.*

## Decision

*What are we doing, in the present tense? "We use X", not "we will use X" or "it was
decided that X should be used". State the shape of the decision concretely enough that an
engineer could implement it without asking a follow-up question: names of libraries,
configuration keys, file locations, the data model, the boundaries of the module.*

*One decision per ADR. If the paragraph needs an "and", it is probably two ADRs.*

## Consequences

### Positive

*What gets easier or becomes possible.*

### Negative / costs

*What gets harder, what we give up, what new obligation we take on. Be specific: a
maintenance burden, a lock-in, a runtime constraint, a cost line item.*

### Neutral / follow-ups

*Things that are neither good nor bad but must be tracked: a config change, a script to
write, a question to settle later, a link to a sibling ADR.*

## Alternatives considered

*Each alternative, with a concrete reason it was rejected. Not strawmen: if an option is
genuinely close, say what tipped the balance and what would change the decision. A reader
should understand why the obvious alternative lost, not just that it did.*

*Format as a list, one entry per alternative.*

## Revisit triggers

*The specific, observable conditions that would make us reopen this decision. "It gets
popular" is not a trigger. "The upstream package drops the API we depend on", "our volume
exceeds the documented limit", "we need capability X" are triggers.*

*Each trigger should be checkable by someone else without asking the author what they
meant.*

---

## How to write a good ADR

**ADRs are immutable.** Once an ADR is accepted, do not edit it to reflect the current
state of the code. The record of a decision and of what was known at the time is the
point; rewriting it destroys the history that makes the document useful.

**One decision per ADR.** If a change bundles two choices, split it. Bundled ADRs cannot be
superseded, partially accepted, or discussed in isolation later.

**Supersede, do not rewrite.** When a decision changes, write a new ADR that references the
old one, and set the old ADR's status to `Superseded by ADR-NNNN`. The old document stays
readable and the chain of reasoning stays intact.

A short ADR that records a real trade-off is worth more than a long one that restates the
context. Write the parts a future reader cannot reconstruct from the code: the constraints
that forced the decision, the alternatives, and what would reverse it.
