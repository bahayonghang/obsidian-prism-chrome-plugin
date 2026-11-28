# Obsidian Prism Web

Obsidian Prism Web is a reversible, local-first browser extension theme and reading workbench for ChatGPT and Gemini web interfaces. It brings optical palettes, reading aids, and subtle visual atmosphere to supported AI conversations while leaving native host ownership intact.

## Language

### Host & Layout

**Host Surface**:
A supported AI web application (ChatGPT or Gemini) whose native interface Obsidian Prism themes reversibly.
_Avoid_: Target site, webpage, host app

**Primary Surface**:
The isolated main conversation viewport container where chat turns, the Ambient Stage, and the Composer Surface live, separate from navigation sidebars.
_Avoid_: Main canvas, chat pane, page body

**Home State**:
The empty-thread landing state of a Host Surface before any User Turn or Assistant Turn is rendered, distinct from an active conversation.
_Avoid_: Landing page, new tab, blank screen

**User Turn**:
A single top-level prompt submitted by the user in the active conversation.
_Avoid_: User bubble, prompt node, query item

**Assistant Turn**:
A single top-level response rendered by the AI model in the active conversation.
_Avoid_: Bot reply, model node, response block

**Content Width Preset**:
One of three reading-column width modes applied across Host Surfaces: `standard` keeps the host's native width, `full` spans the main area minus a left edge and a right reserve for the Conversation Rail, and `wide` is the midpoint of the two, at most 1200px. Under `wide` and `full`, User Turns scale proportionally (~80% of the reading column without a fixed pixel ceiling, while short prompts remain compact and right-aligned), and the Composer Surface aligns with the reading column.
_Avoid_: Page width, layout mode, zoom level

**Native Palette**:
The `host` palette choice that leaves all Host Surface colors untouched while keeping extension-owned controls legible.
_Avoid_: Raw mode, unstyled mode, default theme

**Settings UI Theme**:
The independent `auto` / `light` / `dark` color-scheme control governing the extension popup and options page, decoupled from Host Surface `themeMode`, optical palettes, and the extension enable switch.
_Avoid_: Popup dark mode, host theme override, global color lock

**Active Highlight**:
The single highlight the extension draws on the sidebar item for the current location, shaped like its control. An **icon tile** (an equal-width, near-square, icon-only sidebar button) gets an even accent-tinted fill, an even 1px inset ring and an accent icon, with no side bar and no host overlay; a **row** (a conversation, project or other text row) gets one layer over the whole row with a 2px accent left edge, replacing the host's own active paint instead of stacking on it. Sidebar style `native` and Native Palette leave the host's active state untouched.
_Avoid_: Selected pill, current-row bracket, active badge

### Reading & Estimation

**Conversation Rail**:
The floating right-edge outline toggle, tick strip, and searchable jump drawer listing loaded User Turns.
_Avoid_: TOC, sidebar outline, minimap

**Bottom Dock**:
The floating bottom-right control bar hosting compact page-level tools such as the Content Width quick toggle and Context Vial.
_Avoid_: Status bar, footer dock, widget bar

**Context Vial**:
The local-only token estimate pill and breakdown popover displaying approximate loaded conversation size against a Reference Capacity.
_Avoid_: Token counter, quota meter, usage bar

**Reference Capacity**:
The denominator scale used by the Context Vial, resolved either automatically from the active model label (on ChatGPT, the visible tier label) or manually overridden in settings. An automatic ChatGPT fallback for an unrecognized label is shown with a `?`.
_Avoid_: Context limit, real window, token quota

### Code & Input Surfaces

**Code Surface**:
The complete code presentation inside a conversation turn, encompassing its outer wrapper, sticky header with action icons, code well, syntax tokens, and inline code spans.
_Avoid_: Code box, pre block, snippet

**Formula Preview**:
The reversible rendered-math view presented on a qualifying LaTeX Code Surface, showing typeset equations while preserving the original source intact for toggling and copying.
_Avoid_: Math code block, formula box, equation snippet

**Native Math Surface**:
A mathematical expression rendered natively by the Host Surface outside any Code Surface, whose legibility and overflow stay consistent across palettes.
_Avoid_: Native formula, math block, host math

**Composer Surface**:
The elevated optical input card housing the host's native prompt editor, compact rounded-square attachment previews (`4px` / `8px` / `10px`), neutral elevated circular `+` add button (`30×30px`), Model Capsule (`32px` height, `>= 108px` centered balanced min-width), and action controls. Styled with compact optical corners (`sharp: 6px`, `balanced: 12px`, `soft: 16px`), an opaque palette surface (`backdrop-filter: none`) with subtle top sheen, an explicit four-sided `1px` solid low-contrast border (no duplicate outline) plus top inset specular highlight and layered drop shadows, a calm resting state with no wide diffuse haze, and a `:focus-within` accent border (plus an optional pure-CSS `1px` perimeter prismatic spectrum rim on hover/focus when composer glow and motion are enabled, disabled under reduced motion). When restyled it uses the prototype two-row layout with comfortable vertical breathing room (`min-height: 38px` single-line editor, muted placeholders, zero-height collapsed empty headers): attachment previews on the top row, the editor on a full-width row, then on the bottom toolbar the neutral elevated `30×30px` circular `+` button on the left with the `32px` Model Capsule immediately to its right, transparent `30×30px` ghost secondary icons (Dictate and Microphone) plus a `32×32px` neutral elevated circular idle Voice Start button on ChatGPT with three-layer foreground penetration (`>= 4.5:1` icon contrast without filling stroked SVGs), and the high-contrast `32×32px` circular solid primary action strictly reserved for real Send and Stop/Cancel buttons (subdued when disabled)—arranged purely by overriding the host's own grid into two columns (`auto minmax(0, 1fr)`) and aligning the Model Capsule slot inside the flex toolbar via CSS `order` and `margin-inline-end: auto` (on a ChatGPT grid without area names, by naming the areas of its existing children) with zero DOM reparenting.
_Avoid_: Input box, prompt bar, chat form

**Composer Scrim**:
The unified dual-host transparent composer dock backdrop contract in an active conversation (never in Home State or Native Palette). Both Gemini and ChatGPT keep composer docks purely transparent (`usesOverlayScrim: false`), never painting any extension canvas veil or `backdrop-filter` blur layer: recognized dock backdrops (`data-op-composer-backdrop`—Gemini's full-width `input-container.input-gradient` and inner wrappers, ChatGPT's bounded dock ancestor chain, Thread Footer, and adjacent disclaimer shells) clear native paint, `backdrop-filter`, `::before`/`::after` pseudo layers, container fade layers, gradients, masks, `box-shadow`, and sharp-edge shadow variables while strictly protecting the Composer Surface, attachments, dialogs, and menus. When a dock geometrically overlays the conversation scroller (such as Gemini's absolute `input-container` or ChatGPT sticky-in-scroller layouts), it preserves `data-op-composer-overlaid` and dynamic `--op-dock-clearance` (`[data-op-thread-scroller]::after` or thread-column clearance) so the last Assistant Turn and its action bar scroll completely above the Composer Surface and remain clickable; on ChatGPT, independent message scrollers that do not contain the Composer Surface may additionally receive a reversible Alpha-channel bottom mask fade (`data-op-scroller-fade`) while sticky-in-scroller and Thread Footer layouts skip it. When composer restyling is enabled in an active conversation, both hosts also fold trailing empty or hidden-content spacers, hide disclaimers, and lower the Composer Surface near the viewport bottom (Gemini `5px`, ChatGPT in-flow `5px` / Thread Footer `6–8px`), restoring native paint and spacing cleanly when restyling is off, in Native Palette, in Home State, or on disable/`stop()`.
_Avoid_: Footer mask, white slab, solid fade, transparent overlay

**Thread Footer**:
ChatGPT's conversation footer layer: the positioned layer directly inside the conversation scroll container that holds the Composer Surface and wraps the elements carrying the host markers `data-thread-scroll-footer` / `data-thread-composer-backdrop` (when the host flattens them, the marker element itself is that layer). Its `::before`/`::after` paint the opaque band beside and below the Composer Surface, and `[data-thread-scroll-footer="true"]::after` reserves bottom inset space (`--thread-composer-bottom-inset`) while `[data-thread-composer-backdrop="true"]` limits composer width. The markers identify it with no ancestor-depth limit; without them the bounded dock ancestor walk is the fallback. Prism keeps its native positioning, `z-index`, and anchors, never makes it `data-op-composer-dock`, and leaves it native in Home State and Native Palette; in active conversations it clears footer paint unconditionally, and when `composerRestyle` is enabled (`data-op-thread-footer="true"`), reversibly collapses internal bottom insets, trailing empty siblings, and footer disclaimer shells to tighten the Composer Surface bottom breathing gap to `6–8px` while bridging `[data-thread-composer-backdrop="true"]` to `Content Width Preset`.
_Avoid_: Bottom bar, black band layer, Bottom Dock (the extension's own control bar)

**Model Capsule**:
The host's native model-selector trigger restyled in place as a calm, centered `32px`-tall (`min-width: 108px`, `88px` on narrow viewports) low-saturation neutral elevated pill (`--op-capsule-bg`, subtle top sheen, `1px` border, top `1px` inset specular, `13.5px` sans-serif `--op-font-ui` typography penetrating host child spans while preserving Material icon fonts on Gemini), featuring a `12px` accented four-pointed prism star indicator (`::before`), primary model name, accented semibold tier label (including paired ChatGPT tier suffixes without tinting wrapped chevron icons), and a compact neutral dropdown chevron with zero hollow interior gap, visually positioned immediately right of the circular `+` button without moving or rewriting its host DOM node.
_Avoid_: Model badge, dropdown button, model chip
