# Browser extension architecture

Modified 2026-11-22 for the independent Obsidian Prism Web community port. GPL-3.0-only.

## Execution boundaries

| Component | Responsibility | Boundary |
|---|---|---|
| `src/config-schema.js` | Defaults, validation, presets, language strings, browser storage abstraction and root theme attributes | Ordinary preferences only; secrets excluded from exports and page mirrors |
| `src/early-boot.js` | Start loading preferences at `document_start` and apply the initial visual state | Extension storage is asynchronous; do not claim guaranteed zero flash |
| `src/adapters.js` | Identify supported host elements, extract currently loaded conversation structure, and declare per-site layout facts (width-limiter selectors and native reading widths, composer grid area names) | DOM selectors and declarations only; no internal ChatGPT/Gemini API calls |
| `src/content.js` | Reversible reading tools, width quick toggle, effects and optional manual-translation controls | Isolated content script; preserve host message/editor ownership |
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

Adapters also identify whole composer shells, code surfaces/headers, column containers, model triggers, add triggers, chips, visible attachments, trailing spacers, and left navigation surfaces using explicit selectors before constrained semantic/geometry fallbacks. The runtime records original marker attribute values in `surfaceMarks`, restores them when a surface changes, when Native Palette (`host`) or `composerRestyle: false` is chosen, or when the extension is disabled, and reattaches owned layers after host replacement. Consistent with ADR-0002, the native editor, Model Capsule, attachments, and navigation nodes are styled strictly in place without reparenting or rewriting framework-owned text nodes. From v0.3.1 (#19) the adapter also returns the host's own composer grid (`composerGrid`), but only when its direct children are placed by every area name the site declares (`composerGridAreas`: ChatGPT `leading`/`primary`/`trailing`, Gemini `leading-actions`/`text-input`/`trailing-actions`). The reversible `data-op-composer-grid` mark lets CSS override just that grid's columns and areas into the two-row prototype; an unrecognized grid keeps its native single row. The ChatGPT area names are inferred (the probe recorded only a `36px | input | trailing` grid), so when none of that grid's children carries a named area the adapter identifies the slots by role: leading holds the add button, primary the editor, and trailing is the only control-bearing child after primary. Those existing children get reversible `data-op-composer-leading` / `-primary` / `-trailing` marks in `surfaceMarks` and CSS names their areas; a missing or ambiguous slot keeps the native row. On ChatGPT the painted `[data-composer-layout]` root is the Composer Surface.

From v0.2.1 and v0.3.0, composer backdrops are distinct from the input card. Inner backdrop layers clear native opaque backdrops, while the single outermost recognized `data-op-composer-scrim` host (active conversations only, never in Home State or Native Palette) clears its own paint and gains a stacking context. Since v0.3.1 (#22) its `::before`, stacked below the host's children, paints about 45% `--op-canvas` with a backdrop blur and a top mask feather. The horizon glow, whose z-order and mask are unchanged, shows through and scrolled turns blur behind floating controls. Browsers without backdrop-filter get a low-opacity gradient (at most 58% canvas). On Gemini, the scrim host is the native `input-container.input-gradient`, so its near-black band is cleared without changing its layout. That dock overlays the conversation scroller instead of following the thread in flow (ChatGPT's sticky footer does), so the taller two-row Composer Surface could cover the last reply. The runtime marks such an overlaid scroller with `data-op-thread-scroller` and writes the measured overlap plus an 8px gap to the root `--op-dock-clearance`; CSS adds an empty `::after` of that height after the thread, keeping the last reply's action row above the dock in both the blur and the fallback path. The `::after` changes neither the scroller box nor the dock, so the measurement does not feed back on itself. Selection flags on nested sidebar elements are normalized to one interactive row with `data-op-sidebar-active`. Native `aria-current`, `aria-selected` and `data-active` changes trigger the same coalesced lifecycle. Both marker types retain and restore prior attribute values; native palette/disabled modes do not override their colors or bottom spacing.

## Content width

Content Width Presets (#21) change only the reading column. For `wide` and `full`, `content.js` measures the Primary Surface (main area) width and writes two root variables: `--op-reading-width` (the target paragraph width) and `--op-reading-shift` (a leftward shift so a full column clears the Conversation Rail). Like `--op-ambient-alpha`, their original inline value and priority are saved and restored, and an emptied `style` attribute that did not exist before is removed. `standard`, a disabled site and stop restore them, which returns the host's native width.

The widths use midpoint semantics: `full` is the main width minus a 20px left edge and a 56px rail reserve; `wide` is the midpoint of the site's native width and `full`, at most 1200px; below a 900px viewport both fall back to the main width minus 16px edges (`contentWidthTarget`). The native width is declared per site in `src/adapters.js` (`contentWidth.native`: ChatGPT 768px = 48rem, Gemini 708px), not measured at runtime.

`src/adapters.js` also declares the elements that actually limit the width (`contentWidth.targets` / `composerTargets`) and owns those selectors. `styles/hosts.css` repeats them in static rules, because CSS cannot read the adapter; `tests/content-width.test.cjs` is a static guard that fails when the two lists drift. There is no geometry search and no per-node mark: the rules size only the declared limiters from the root variables. The ChatGPT composer limiter `#thread-bottom [class*="--thread-content-max-width"]` is inferred; when no such element exists, a mutually exclusive `:has()` rule sizes the probed `form[data-chatgpt-composer]` instead, so the composer still follows the column and is never constrained twice. The variables re-sync on every scan and on the existing `ResizeObserver` of the Primary Surface, with no extra observer or polling.

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
