---
status: accepted
---

# In-Place Reversible Styling for Composer Surface and Model Capsule

The reference Obsidian Prism composer and Model Capsule appearance is implemented by tagging existing host elements with reversible marker attributes and styling them in place, without reparenting nodes across containers or wrapping and rewriting text nodes owned by React or Angular.

## Considered Options

1. **In-place reversible attribute marking and CSS restyling (chosen)**: Applies reversible attributes to the host's real composer card, add trigger, model picker button, and floating chips, keeping framework reconciliation, dropdown poppers, and IME composition intact.
2. **DOM reparenting or custom overlay controls replicating the desktop layout left-to-right (rejected)**: Triggers React and Angular reconciliation crashes, breaks popper anchoring and IME composition, and fails clean toggle-off recovery.

## Consequences

Controls such as the Model Capsule (including host wrapper slots like `<bard-mode-switcher>` on Gemini), secondary ghost icons, and the primary send/voice action remain in their host-rendered DOM parent inside the trailing toolbar container. To align the visual layout with the Prism prototype without reparenting any DOM node, two-row mode overrides the verified composer grid into two columns (`auto minmax(0, 1fr)`), turns the trailing toolbar (`data-op-composer-toolbar`) into a full-width flex row, and uses CSS `order: -10` plus `margin-inline-end: auto` on the Model Capsule slot (`data-op-model-capsule-item`) to pull it immediately next to the left-edge `+` trigger while keeping secondary icons and the circular primary action button (`data-op-composer-primary-action`) flush at the right edge. Turning off composer restyling, switching to Native Palette, disabling the site or extension, or calling `stop()` restores all marker attributes and the native UI cleanly without residual nodes.
