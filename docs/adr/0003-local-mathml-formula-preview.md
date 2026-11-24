---
status: accepted
---

# Local MathML Core Rendering for Formula Preview

Formula Preview renders qualifying LaTeX Code Surfaces locally using a pinned, bundled copy of Temml (MIT-licensed, zero dynamic evaluation) outputting browser-native MathML Core, keeping host `<pre><code>` elements untouched for lossless toggling and copying while avoiding webfont bundling or `web_accessible_resources`.

## Considered Options

1. **Pinned local Temml outputting native MathML Core (chosen)**: Runs completely offline inside the isolated content script via DOM APIs without `eval`, `new Function`, `.woff2` webfont files, or `web_accessible_resources`, matching the extension's Chrome 111+ and Firefox 140+ floor while covering standard TeX math syntax (`\mathcal`, `\mathrm`, `aligned`, fractions, matrices, subscripts/superscripts).
2. **Bundled KaTeX HTML+MathML with webfont assets (rejected)**: Delivers uniform TeX webfonts across operating systems, but substantially increases package weight and requires either exposing `web_accessible_resources` (relaxing the extension's zero-public-resource boundary) or inlining large base64 fonts that strict host `font-src` policies can block.
3. **Hand-written minimal LaTeX-to-MathML subset parser (rejected)**: Avoids third-party assets, but breaks easily on multi-line environments, nested commands, and varied AI-generated TeX syntax, raising long-term maintenance cost.

## Consequences

The repository vendors pinned static Temml runtime files registered in the explicit build allowlist, manifest validation checks, and `THIRD_PARTY_NOTICES.md`. Rendered math glyphs follow each operating system's native MathML math font rather than a bundled KaTeX webfont. Multi-equation blocks with `%` comment lines are segmented before rendering so comments display as readable captions, failed segments degrade gracefully to monospace text, and disabling the feature, toggling to source, or unloading the extension removes all owned preview nodes cleanly without mutating host code text.
