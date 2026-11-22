---
status: accepted
---

# In-Place Reversible Styling for Composer Surface and Model Capsule

The reference Obsidian Prism composer and Model Capsule appearance is implemented by tagging existing host elements with reversible marker attributes and styling them in place, without reparenting nodes across containers or wrapping and rewriting text nodes owned by React or Angular.

## Considered Options

1. **In-place reversible attribute marking and CSS restyling (chosen)**: Applies reversible attributes to the host's real composer card, add trigger, model picker button, and floating chips, keeping framework reconciliation, dropdown poppers, and IME composition intact.
2. **DOM reparenting or custom overlay controls replicating the desktop layout left-to-right (rejected)**: Triggers React and Angular reconciliation crashes, breaks popper anchoring and IME composition, and fails clean toggle-off recovery.

## Consequences

Controls such as the Model Capsule remain in their host-rendered DOM position (for example, on the right side of the composer toolbar where ChatGPT and Gemini mount them) while matching the reference card elevation, circular add trigger, bordered pill capsule, and accent hierarchy. Turning off composer restyling or switching to Native Palette restores the native UI cleanly without residual nodes.
