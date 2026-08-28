---
name: feature-readiness
description: Readiness gate between a completed feature plan and implementation. Use after Lavish planning and before writing product code, when a feature plan looks done, or when an implementer would otherwise have to stop and ask what the product should do. Complements Lavish; does not replace it.
---

# Feature Readiness

## Overview

A short gate between planning and coding. Lavish is still where product and UX decisions get made. This skill only checks whether the completed plan is defined enough that an implementation worker can build it without stopping for new product or UX decisions.

This is a Tip Tracker experiment. Do not copy it into other repos.

## When to Use

- A Lavish planning pass has produced a feature plan and someone is about to implement
- A plan looks finished but you are not sure an implementer can start
- Implementation already stalled because a product or UX choice was missing

**When not to use**

- The idea has not been through Lavish yet — plan first
- The work is a mechanical fix with no new product behavior
- You need to invent or redesign the feature — that is Lavish, not this gate

## Workflow

```
Feature idea → Lavish planning → Feature Readiness → Implementation
```

If the review returns `NOT READY`:

```
Lavish → Feature Readiness → NOT READY → focused Lavish follow-up → Feature Readiness again
```

Repeat until the result is `READY`. Do not begin implementation while the feature is `NOT READY`.

Do not restart full feature planning on a follow-up. Do not change, extend, or replace Lavish.

## What to Review

Review the completed plan as an end-to-end user journey. Check:

- How the user enters the feature
- The main user flow
- Every meaningful `action → result → next state`
- What happens after completion
- Where the user ends up after finishing
- Alternate and edge paths
- Relevant loading, empty, success, error, and unavailable states
- Existing behavior that must remain unchanged
- Permissions or different user situations when they matter
- Any unresolved product or UX decisions
- Dead ends such as `Done → ???`
- Any point where an implementer would likely stop coding and ask what the product should do

Do not invent product decisions just to make the feature look complete. A missing choice is `NOT READY`, not a guess.

## Verdict

### READY

Return `READY` when an implementation worker should be able to build the feature without needing significant new product or UX decisions.

Include a compact implementation-ready summary of the complete intended behavior: entry, main path, after-completion, and the already-decided edges.

### NOT READY

If important behavior is undefined, return `NOT READY`.

List only the unresolved decisions that actually block readiness. Skip nits that would not stop a builder.

Then send those gaps back through a **focused Lavish follow-up board** that:

- contains only the missing decisions this review found
- preserves decisions already made in the original Lavish planning
- does not restart the feature-planning process
- gives clear choices and enough context to resolve each gap

After those follow-up decisions are captured, run this skill again against the updated complete plan. Repeat until `READY`.
