---
status: accepted
---

# Local DOM Context Estimation with Model-Aware Reference Capacity

Context Vial computes token estimates solely from rendered conversation DOM text (cleaned of UI chrome and calibrated for modern CJK, Latin, and code tokenizers), resolves its Reference Capacity automatically from the visible model label (with per-host fallbacks and manual override), and explicitly flags detected visible attachments (such as PDFs or images) as uncounted rather than fabricating attachment token counts.

## Considered Options

1. **Local DOM heuristic + model-pill window lookup + attachment indicator (chosen)**: Reads only rendered DOM turns and model labels in the isolated content script, preserving zero network interception and low maintenance coupling.
2. **Intercepting host internal web APIs (rejected)**: Violates the extension's local-only and no-internal-API architecture boundary, breaks easily across host protocol changes, and risks unintended exposure of conversation payloads.

## Consequences

Off-screen virtualized turns, hidden system prompts, and binary or document attachment bodies are not included in the numeric estimate. The UI must continue labeling values as local estimates (`≈`) and surface uncounted attachments honestly in both the pill and popover.
