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
One of three reading-column width modes applied across Host Surfaces and synchronized with the Composer Surface: `standard` keeps the host's native width, `full` spans the main area minus a left edge and a right reserve for the Conversation Rail, and `wide` is the midpoint of the two, at most 1200px.
_Avoid_: Page width, layout mode, zoom level

**Native Palette**:
The `host` palette choice that leaves all Host Surface colors untouched while keeping extension-owned controls legible.
_Avoid_: Raw mode, unstyled mode, default theme

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

**Composer Surface**:
The elevated input card housing the host's native prompt editor, circular add button, Model Capsule, and action controls. When restyled it uses the prototype two-row layout: attachment previews, then the editor on a full-width row, then the add button on the left and the Model Capsule with voice/send controls on the right, arranged only by overriding the host's own grid areas.
_Avoid_: Input box, prompt bar, chat form

**Composer Scrim**:
The edge-feathered backdrop layer behind the Composer Surface that blends into the Prism canvas and ambient atmosphere while preventing scrolled conversation text from bleeding behind floating controls.
_Avoid_: Footer mask, white slab, transparent overlay

**Model Capsule**:
The host's native model-selector trigger restyled in place as a bordered pill featuring a subtle indicator icon, model name, accented tier label, and dropdown chevron.
_Avoid_: Model badge, dropdown button, model chip
