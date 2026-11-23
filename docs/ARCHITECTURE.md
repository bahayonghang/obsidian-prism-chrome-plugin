# Browser extension architecture

Modified 2026-11-23 for the independent Obsidian Prism Web community port. GPL-3.0-only.

## Execution boundaries

| Component | Responsibility | Boundary |
|---|---|---|
| `src/config-schema.js` | Defaults, validation, presets, language strings, browser storage abstraction and root theme attributes (adopting prior Prism root flags/style across isolated-world reloads without treating them as host originals) | Ordinary preferences only; secrets excluded from exports and page mirrors |
| `src/early-boot.js` | Start loading preferences at `document_start` and apply the initial visual state | Extension storage is asynchronous; do not claim guaranteed zero flash |
| `src/adapters.js` | Identify supported host elements, extract currently loaded conversation structure, declare per-site layout facts (width-limiter selectors, native reading widths, composer card/grid slots, prioritized primary actions), detect overlaid docks, and compute dock collision avoidance + edge margins | DOM selectors, read-only geometry queries, and declarations only; no internal ChatGPT/Gemini API calls |
| `src/content.js` | Singleton instance handover (`data-op-instance`), reversible reading tools, width quick toggle, zero-polling dock avoidance/popover placement, effects and optional manual-translation controls | Isolated content script; preserve host message/editor ownership |
| `src/background.js` | Serialized settings writes (`OP_CONFIG_PATCH` for extension pages, constrained `OP_CONTENT_WIDTH_SET` for top-frame chat pages), optional translation requests and credential access | Validate senders, enums, origins and endpoint settings; do not expose general config patches to chat pages or a general URL-fetch proxy |
| `popup/*` | Settings popup and options page | Packaged scripts, no inline executable handlers or remote code |
| `styles/*` | Palette variables, host-specific styling and extension-owned controls | Scope overrides under enabled extension attributes |

Content scripts run only on the three explicitly supported HTTPS origins and only in the top-level document. The extension does not declare external messaging or public web-accessible resources.

## Browser manifests

`manifest.json` is the Chrome manifest. `manifests/firefox.json` is a complete Firefox variant; the build copies it to `dist/firefox/manifest.json`. Runtime files are shared.

Chrome uses `background.service_worker`; Firefox uses `background.scripts` with the configuration module loaded before the background module. Both use Manifest V3, request `storage`, and include only the ChatGPT/Gemini host permissions by default.

The optional host declarations allow user-selected HTTPS translation services and explicit HTTP loopback endpoints. Actual browser permission is requested for the configured scheme and hostname; match patterns do not isolate ports. Runtime requests retain the exact configured endpoint, including port and path. Firefox additionally declares optional data-transmission types, while core functionality declares `required: ["none"]`.

Official references:

- [Background compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Firefox data collection consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Chrome cross-origin extension requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Extension storage versus page storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)

## Appearance and lifecycle

Theme variables are supplied at `document_start`; stored preferences then determine which scoped overrides activate. Disabling the extension for a site removes its root flags, owned controls, temporary styles and active effects. The host retains its original classes and content.

Site changes are detected by bounded, coalesced DOM work. A webpage is not a stable API: when a target cannot be identified, skip the enhancement instead of rewriting arbitrary DOM. Route changes, regenerated responses, streamed code and replaced composers must be treated as normal lifecycle events.

Stream highlights are a progressive enhancement using `CSS.highlights`. They must not wrap or rewrite host text nodes. Reduced-motion users receive the static presentation. Animation work should cease when effects are disabled or the page is hidden; this is a statement about the extension's own work, not total site CPU/GPU usage.

## Reading and estimation

The outline derives from recognized user turns already loaded in the DOM. It does not fetch missing history. Keyboard navigation yields to text entry and modal interactions. Code folding is manual and reversible; copied code remains the original host text.

The context display uses a documented local DOM heuristic (ADR-0001) rather than a model-specific tokenizer or internal account API. It strips non-content UI chrome, weights CJK, prose, and code separately, and excludes off-screen virtualized turns, hidden system prompts, and binary/document attachment bodies (marking visible attachments with `+` and listing the uncounted count). Its Reference Capacity defaults to `auto` (resolving from the visible model label, including the ChatGPT tier label: Pro / Thinking / High / xHigh map to `400K` and Instant to `128K`; per-host fallbacks are `1M` on Gemini and `128K` on ChatGPT, where an unrecognized label is flagged with `?` and a hint to set it in settings; a manual preset from `32K` to `2M` always wins). The resolver reports one `source` (`manual`, `matched`, `fallback` or `unrecognized`); only `unrecognized` shows the `?`. Product text must continue labeling the readout as a local estimate.

Pixel companions were removed in v0.2.0; the retired `mascot` setting is ignored. Ambient environments now use three CSS transform/opacity layers and optional fixed decorative glyph/grid textures. These are never derived from user content. The stage sits behind text inside an isolated recognized main surface and cannot receive pointer events. Bounds follow resize/scroll events, without permanent JavaScript polling. CSS motion pauses for hidden pages, disabled motion and reduced-motion preferences. A visible moving background still incurs rendering work.

Adapters also identify whole composer shells (plus `composerCardSurface` for outer card bounds such as Gemini `input-area-v2`), code surfaces/headers, column containers, model triggers, add triggers, chips, visible attachments, trailing spacers, and left navigation surfaces using explicit selectors before constrained semantic/geometry fallbacks. The runtime records original marker attribute values in `surfaceMarks`, restores them when a surface changes, when Native Palette (`host`) or `composerRestyle: false` is chosen, or when the extension is disabled, and reattaches owned layers after host replacement. Consistent with ADR-0002, the native editor, Model Capsule, attachments, and navigation nodes are styled strictly in place without reparenting or rewriting framework-owned text nodes. For the two-row prototype (`composerRestyle: true`), `composerGrid` verifies either the site's declared area names (`composerGridAreas`: ChatGPT `leading`/`primary`/`trailing`, Gemini `leading-actions`/`text-input`/`trailing-actions`) or positional structural slots (`data-op-composer-leading`/`-primary`/`-trailing`), marks the trailing flex toolbar (`data-op-composer-toolbar`) and the slot containing the Model Capsule (`data-op-model-capsule-item`), and ranks `composerPrimaryAction` by selector tier (`Send` > `Voice` > `Microphone` > trailing fallback). CSS overrides the verified grid into two columns (`auto minmax(0, 1fr)`) and places `data-op-model-capsule-item` immediately right of `+` via `order: -10` and `margin-inline-end: auto`, while `data-op-composer-attachment` styles attachment previews inside the card and `data-op-model-capsule::before` renders the four-pointed star.

From v0.4.0, composer backdrops and `Composer Scrim` operate in dual mode via `Adapters.isComposerDockOverlaid(dock, scroller)`. In active conversations (never in Home State or Native Palette), the outermost recognized dock carries `data-op-composer-dock`, while inner/non-scrim backdrop layers clear native paint, gradients, and masks (`:not([data-op-composer-scrim="true"])::before/::after`). When the dock sits in flow below the scroller as a separate flex sibling (such as ChatGPT `#thread-bottom-container`), it skips `data-op-composer-scrim` and renders zero canvas veil or blur so the Ambient Stage glow continues uninterrupted to the viewport bottom, while `data-op-composer-empty-sibling`, `data-op-composer-disclaimer`, `data-op-thread-spacer`, and `data-op-thread-column` compact redundant bottom whitespace. When the dock overlays the conversation scroller (such as Gemini `input-container.input-gradient` or a sticky-in-scroller dock), it also receives `data-op-composer-scrim`: `::before` paints 44% `--op-canvas` in dark mode (26% in light mode) with `backdrop-filter: blur(14px)` and a 28px top mask feather—falling back without `backdrop-filter` support to a 56% dark / 36% light gradient with `mask-image: none`—and `data-op-thread-scroller` writes the measured overlap plus an 8px gap to `--op-dock-clearance` (`::after` spacer). Selection flags on nested sidebar elements are normalized to one interactive row with `data-op-sidebar-active`. Native `aria-current`, `aria-selected` and `data-active` changes trigger the same coalesced lifecycle.

Bottom Dock lifecycle and geometry follow a zero-polling singleton contract: `src/content.js` stamps `data-op-instance` on `documentElement`, prunes any stale `[data-op-owned]` roots (`pruneOrphanRoots`), and yields silently via `disconnectRuntime()` / `yieldOwnership()` when superseded by a newer instance. On handover, the incoming runtime adopts existing `[attr="true"]` surface marks (`RUNTIME_SURFACE_ATTRS`) and `--op-reading-*` / `--op-dock-*` root variables (`RUNTIME_ROOT_VARS`) with zero visual flicker while preserving genuine non-`true` host attributes and non-runtime inline style declarations, so disabling, Native Palette, or `stop()` clears all runtime residue across both same-realm and isolated-world reloads. On scan, resize, and scroll events (never polling timers), `Adapters.findCornerFloatingObstacles`, `Adapters.dockEdgeMargin`, and `Adapters.computeDockAvoidance` shift `#op-bottom-dock` via `--op-dock-offset-x` and `--op-dock-offset-y` to remain clear of corner floating buttons, the Composer Surface, and the Conversation Rail within viewport margins, and `syncDockPopoverPosition()` flips (`data-op-popover-side="below"`) and shifts (`--op-vial-popover-shift-x`) the Context Vial popover cleanly inside the viewport.

## Content width

Content Width Presets (#21) change only the reading column. For `wide` and `full`, `content.js` measures the Primary Surface (main area) width and writes two root variables: `--op-reading-width` (the target paragraph width) and `--op-reading-shift` (a leftward shift so a full column clears the Conversation Rail). Like `--op-ambient-alpha`, their original inline value and priority are saved and restored, and an emptied `style` attribute that did not exist before is removed. `standard`, a disabled site and stop restore them, which returns the host's native width.

The widths use midpoint semantics: `full` is the main width minus a 20px left edge and a 56px rail reserve; `wide` is the midpoint of the site's native width and `full`, at most 1200px; below a 900px viewport both fall back to the main width minus 16px edges (`contentWidthTarget`). The native width is declared per site in `src/adapters.js` (`contentWidth.native`: ChatGPT 768px = 48rem, Gemini 708px), not measured at runtime.

`src/adapters.js` also declares the elements that actually limit the width (`contentWidth.targets` / `composerTargets`) and owns those selectors. `styles/hosts.css` repeats them in static rules, because CSS cannot read the adapter; `tests/content-width.test.cjs` is a static guard that fails when the two lists drift. On ChatGPT, `main`, `#thread-bottom-container`, `#thread-bottom`, and `#thread-bottom [class*="--thread-content-max-width"]` bridge `--thread-content-max-width` to `--op-reading-width`, while `[class*="transcriptContent"]`, `#thread-bottom :has(> form[data-chatgpt-composer])` (supporting intermediate wrappers inside `#thread-bottom`), and the direct-form fallback `#thread-bottom > form[data-chatgpt-composer]` size and shift with `--op-reading-width` and `--op-reading-shift`. On Gemini, `.md-content > *`, `user-query`, `.response-footer`, `hallucination-disclaimer`, and `.input-area-container` (48px inset) track `--op-reading-width` and `--op-reading-shift`. The variables re-sync on every scan and on the existing `ResizeObserver` of the Primary Surface, with no extra observer or polling.

Width presets keep applying under Native Palette: Native Palette only leaves host colors untouched, and width is a layout preference, as in v0.3.0.

## Settings sizing

Toolbar popups negotiate their viewport from the content's intrinsic size. Their 440×600 document dimensions must not be capped by the initial popup viewport through `100vw`/`100vh`, otherwise a small initial viewport can keep the page collapsed. The options document has its own early mode marker and remains viewport-responsive. Chromium CI calls `action.openPopup()` and inspects the resulting popup view without device-metric overrides; the tiny-iframe sizing regression is a separate cross-engine check, not an installed-extension claim.

## Optional translation

Only a user-requested, already visible thought block is eligible. Settings contain the endpoint and model; credentials are stored separately. A configuration export never includes credentials. Importing preferences must not enable transmission or grant permissions silently.

The background accepts a constrained translation operation, verifies its sender and the enabled site's configuration, builds the outgoing request from saved configuration, and applies limits and timeouts. It does not accept an arbitrary fetch URL or caller-provided authorization header. HTTPS is required except for explicit loopback hosts; redirects must not carry a key to another origin.

Translation responses are rendered as text, never executable markup. No automatic background translation, full-history upload, bundled free endpoint, or hidden-reasoning retrieval is part of this release.

## Builds and source provenance

The Python builder uses a fixed runtime/documentation allowlist. Each output is rooted at `manifest.json`, uses sorted entries with fixed timestamps and permissions, and receives a SHA-256 checksum. Nothing is discovered recursively from the working tree, so untracked credentials and development files cannot accidentally enter a package.

`npm run check` validates both manifests and packaged resources and runs JavaScript syntax checks. Node tests exercise behavior without paid services. Browser smoke tests use local fixtures; Chromium additionally loads the unpacked extension, while Firefox tests shared DOM behavior through injected runtime files. See [TESTING.md](TESTING.md) for the limits of that evidence.
