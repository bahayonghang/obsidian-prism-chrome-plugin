# Downstream modifications

**Project:** Obsidian Prism Web — Community Edition  
**Maintainer:** bahayonghang  
**Date:** 2026-11-21  
**Version:** 0.1.0  
**License:** GPL-3.0-only

This independent community derivative is based on [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism) by RMvdesi. The upstream baseline inspected for this release is **v1.0.7-beta.1**, commit **`5dac53bfa7cf917d40101dad2579f32dd1b1b587`**. It is not an official upstream release and is not endorsed by RMvdesi, OpenAI, or Google.

The user-provided implementation plan and two prototype browser-extension archives were used as reference material. Their completion checkboxes, performance promises and compatibility claims were not treated as verification evidence.

## Changes from the desktop suite

| Area | Modification |
|---|---|
| Distribution | Replaced CDP/Sidecar installation with Manifest V3 WebExtensions; separate Chrome service-worker and Firefox event-page manifests |
| Site adaptation | Added explicit adapters for ChatGPT and Gemini, scoped styles and reversible extension-owned UI |
| Themes | Adapted four upstream palette families, accent choices, corner styles, installed code fonts and ambient appearance |
| Settings | Browser-local validated preferences, bilingual popup/options, scene presets and sanitized import/export |
| Reading tools | Page-visible conversation outline, code folding/header enhancements and keyboard navigation |
| Motion | Optional stream highlights and companion effects with feature detection and reduced-motion handling |
| Context indicator | Replaced desktop telemetry with a labeled heuristic over currently loaded visible conversation text |
| Translation | Explicit manual requests for already visible text, user-configured compatible endpoint, optional origin/data permissions and separate local credentials |
| Build and quality | Dependency-free syntax/configuration checks, isolated automated tests, deterministic allowlisted browser archives and PR/manual CI |

CDP bindings, localhost desktop daemons, local-file previews, IDE engineering controls, model effort selectors, hidden/accurate quota telemetry, desktop update machinery and artificial composer caret behavior are not included.

## File attribution

`LICENSE`, the original text of `NOTICE`, and `THIRD_PARTY_NOTICES.md` preserve the upstream notices and component attribution chain. The browser-specific runtime, configuration, settings UI, manifest, build/test code and documentation are modified or newly written for this derivative on the date above. File comments identify the port where their formats allow comments; JSON manifest/package changes are recorded here.

The four palette families derive from upstream `style.css`; icon/theme material from the supplied browser prototypes is retained or adapted as part of the same GPL-distributed community derivative. No claim of endorsement or exclusive ownership over upstream assets is made.

Complete corresponding source is available in [this repository](https://github.com/bahayonghang/obsidian-prism-chrome-plugin). Packaged runtime code is shipped as readable JavaScript/CSS without obfuscation or remote executable code.
