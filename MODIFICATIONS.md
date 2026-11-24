# Downstream modifications

**Project:** Obsidian Prism Web — Community Edition  
**Maintainer:** bahayonghang  
**Date:** 2026-11-24\
**Version:** 0.4.3

**License:** GPL-3.0-only

This independent community derivative is based on [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism) by RMvdesi. The upstream baseline inspected for this release is **v1.0.7-beta.1**, commit **`5dac53bfa7cf917d40101dad2579f32dd1b1b587`**. It is not an official upstream release and is not endorsed by RMvdesi, OpenAI, or Google.

The user-provided implementation plan and two prototype browser-extension archives were used as reference material. Their completion checkboxes, performance promises and compatibility claims were not treated as verification evidence.

## Changes from the desktop suite

| Area | Modification |
|---|---|
| Distribution | Replaced CDP/Sidecar installation with Manifest V3 WebExtensions; separate Chrome service-worker and Firefox event-page manifests |
| Site adaptation | Added explicit adapters for ChatGPT and Gemini, scoped styles and reversible extension-owned UI |
| Themes | Adapted four upstream palette families, accent choices, corner styles, installed code fonts and ambient appearance |
| Settings | Redesigned compact popup/full settings, persistent navigation, motion previews, browser-local validated preferences, scene presets and sanitized import/export |
| Reading tools | Page-visible conversation outline, code folding/header enhancements and keyboard navigation |
| Motion | Aurora/Spotlight CSS layers, static decorative textures, speed/intensity controls, composer focus glow and stream highlights; hidden/reduced-motion handling; pets removed |
| Context indicator | Replaced desktop telemetry with a labeled heuristic over currently loaded visible conversation text |
| Translation | Explicit manual requests for already visible text, user-configured compatible endpoint, optional origin/data permissions and separate local credentials |
| Build and quality | Dependency-free syntax/configuration checks, isolated automated tests, deterministic allowlisted browser archives and PR/manual CI |

CDP bindings, localhost desktop daemons, local-file previews, IDE engineering controls, model effort selectors, hidden/accurate quota telemetry, desktop update machinery and artificial composer caret behavior are not included.

## v0.2.0 visual iteration

Issue #3 responds to installed-extension feedback: remove the pixel pets, restore a horizon-light visual language, identify and theme current sidebar/composer surfaces, and make motion controls easy to discover. The original reference appearance informed the palette and composition; the implementation uses lightweight browser-scoped CSS and does not copy the desktop telemetry dashboard or its WebGL/physics subsystem. Native editor and navigation ownership stays with the host websites.

## v0.2.1 regression fixes

Issues #5 and #6 address installed-browser regressions: give the toolbar popup an intrinsic size independent of its initial viewport, keep full-page options responsive, identify and clear only verified composer backdrop layers, and draw sidebar selection once per navigation item. Validation now distinguishes an actual Chromium action popup from a page with a forced viewport and adds opaque footer / nested-selection fixtures. No permissions, host access, translation behavior or remote dependencies are added.

## v0.3.0 workbench refresh

Spec #8 (#9–#14) updates the ChatGPT and Gemini DOM adapters, adds three Content Width Presets (`standard`, `wide`, `full`) synced with a decoupled Bottom Dock quick toggle via a scoped `OP_CONTENT_WIDTH_SET` channel, enforces >= 4.5:1 WCAG AA Code Surface and syntax token contrast across all four optical palettes without altering Native Palette (`host`), calibrates local DOM Context Vial heuristics with `auto` model-matched Reference Capacity and uncounted-attachment indicators (ADR-0001), tightens active ChatGPT bottom whitespace while adding a canvas-matched feathered Composer Scrim across both hosts, and introduces an elevated reference Composer Surface with in-place circular add trigger, Model Capsule, and unified chips without DOM reparenting or text mutation (ADR-0002). No new permissions, host access, or remote network dependencies are added.

## v0.4.0 dual-mode scrim, composer capsule & bottom dock hardening

Spec #23 (#24–#27, 2026-11-23) extends the read-only structure probe (`pseudos`, full `ancestorsOf`, `siblingsAfter`, `cornerFloats`) and probe-derived offline fixtures (`live-baselines`), introduces dual-mode `Composer Scrim` distinguishing in-flow flex docks (zero canvas veil/blur, collapsed empty spacers, compacted bottom whitespace) from overlaid docks (`44%`/`26%` dark/light blur scrim, `56%`/`36%` fallback, `--op-dock-clearance`), bridges ChatGPT `contentWidth` presets onto `main` and `#thread-bottom` dock containers/wrappers/direct forms, reshapes the in-place two-row `Composer Surface` (`auto minmax(0, 1fr)` grid, left-aligned four-pointed star `Model Capsule` right of `+`, single 1px optical border, high-contrast primary action button with prioritized Send > Voice > Microphone selection), and adds `Bottom Dock` singleton `data-op-instance` handover (fully reversible across same-realm and isolated-world reloads), orphan root pruning, 11px anti-squish styling, and zero-polling dynamic collision avoidance against corner floats, the composer, and the Conversation Rail. No new permissions, host access, or remote network dependencies are added.

## v0.4.1 Gemini code surface, native math & offline formula preview

Spec #32 (#33–#35, 2026-11-23) de-nests Gemini's double-nested `<code-block>` Code Surface ownership in `src/adapters.js` and `styles/hosts.css`, overrides Material/font icon CSS variables and marks painted SVG header icons reversibly (`data-op-code-icon-fill` / `data-op-code-icon-stroke`) for >= 4.5:1 contrast, adds scoped Native Math Surface foreground inheritance and `overflow-x: auto` wide-equation containment on both hosts, vendors pinned offline `temml@0.14.0` (`vendor/temml/temml.js` and `vendor/temml/temml-local.css` scoped strictly under `html[data-op-enabled="true"] .op-formula-preview` with zero `@font-face` or `.woff2` assets) alongside `src/formula.js` and `src/content.js` `syncFormulas()` (ADR-0003) for reversible MathML Core Formula Preview with `%` captions, per-segment fallback, lossless `Source` / `Formula` toggling, 280ms streaming debounce, 48-line fold coordination, Native Palette color inheritance, and single-count Context Vial invariance, exposes the `formulaPreview` Reading-tab switch (`src/config-schema.js` + `popup/popup.js`), and aligns package and browser manifests to `0.4.1`. No new permissions, host access, `web_accessible_resources`, bundled webfonts, or remote network dependencies are added.

## v0.4.2 decoupled settings UI theme & proportional user turn width

Spec #36 (#37–#39, 2026-11-24) introduces an independent `uiThemeMode` (`auto` / `light` / `dark`, default `auto`) with `resolveUiScheme`, `resolveUiPalette` (falling back safely from `host` Native Palette to `obsidian` / `crystal`), and `applyUiThemeToRoot` in `src/config-schema.js`, wires synchronized header toggle (`#btn-ui-theme`) and Appearance Details dropdown (`#cfg-uiThemeMode`) controls plus document-level `color-scheme`, `@media (prefers-color-scheme: light)` pre-load fallback, and Native Palette `color-scheme` declarations across `popup/*` and `styles/prism-tokens.css` while keeping Host Surface resolution and `#chat-preview` decoupled, and fixes palette-card clicks (`handlePaletteCard` / `previewSchemeOverride`) so clicking any card previews and updates only its group preset without mutating `themeMode` or dead-clicking already-checked defaults; extends `tools/structure-probe.js` (`userBubbleAncestors`, Gemini `userQueryText`, `inputAreaChildren`, and `--bard-chat-window-content-width`), adds adapter-owned `contentWidth.userTurnTargets` and expanded `targets` / `composerTargets` in `src/adapters.js` mirrored in `styles/hosts.css` to uncap nested ChatGPT/Gemini User Turn and composer wrappers, bridge `--user-chat-width` and `--bard-chat-window-content-width*`, remove the legacy `820px` ceiling, scale long User Turns proportionally (~80% of `--op-reading-width` across `wide` / `full`) while preserving compact `fit-content` right-aligned short prompts, and keep Composer Surface width synchronized; and aligns manifests, package metadata, documentation, and verification records to `0.4.2`. No new permissions, host access, or remote network dependencies are added.

## v0.4.3 ChatGPT thread footer band & sidebar Active Highlight

Spec #40 (#41–#43, 2026-11-24) removes the opaque band that the live ChatGPT conversation footer paints beside and below the Composer Surface: the ChatGPT adapter now recognizes the footer by the host markers `[data-thread-scroll-footer="true"]` / `[data-thread-composer-backdrop="true"]` and the scroll-container layer that wraps them, keeps the bounded ancestor walk as a fallback that no longer counts zero-size `display: contents` wrappers, and clears only paint on the footer and its `::before`/`::after` (no positioning, size or `z-index` change, no new scrim or body fade, Home State left native). `tools/structure-probe.js` adds a `composerFooter` report (ancestor depth, boxless wrappers, marker positions, pseudo paint and anchor positioning) with the existing redaction. The sidebar Active Highlight is redesigned by control shape: `Adapters.sidebarActiveTargets` returns `{ element, shape }`, icon-only near-square buttons become an **icon tile** (even accent fill and 1px ring, accent icon, host overlay cleared, no side bar) and text rows get exactly one layer over the whole row; `data-op-sidebar-active-tile` joins the reversible runtime marks. Manifests and package metadata are aligned to `0.4.3`. No new permissions, host access, or remote network dependencies are added.

## File attribution

`LICENSE`, the original text of `NOTICE`, and `THIRD_PARTY_NOTICES.md` preserve the upstream notices and component attribution chain. The browser-specific runtime, configuration, settings UI, manifest, build/test code and documentation are modified or newly written for this derivative on the date above. File comments identify the port where their formats allow comments; JSON manifest/package changes are recorded here.

The four palette families derive from upstream `style.css`; icon/theme material from the supplied browser prototypes is retained or adapted as part of the same GPL-distributed community derivative. No claim of endorsement or exclusive ownership over upstream assets is made.

Complete corresponding source is available in [this repository](https://github.com/bahayonghang/obsidian-prism-chrome-plugin). Packaged runtime code is shipped as readable JavaScript/CSS without obfuscation or remote executable code.
