# Verification scope

`npm test` runs deterministic Node tests without browser installation, network access, API keys, or user accounts. The API doubles distinguish Chrome callback APIs, Firefox Promise APIs, and Chrome's newer Promise namespace. They exercise failure handling, serialization, secrets, permissions, sender validation, bounded translation requests, early initialization, native theme restoration, and adapter behavior.

`npm run build && npm run test:browser` runs Playwright with the Chromium extension built in `dist/chrome`. It checks service-worker startup, the real options page, settings propagation, an actual toolbar action popup, and an intercepted local ChatGPT fixture. It then injects the source into isolated synthetic ChatGPT/Gemini pages to inspect runtime diagnostics and verify DOM behavior.

The browser suite also covers saved-disabled startup, native theme changes, whole-body replacement, removed extension controls, permanent teardown, collapsed thought summaries, stale translation responses, and failed translations in immersive mode. It writes synthetic default-page screenshots, Chromium options screenshots in both color modes, and failure screenshots to the ignored `test-artifacts/` directory for visual review. Screenshots contain only fixture text and extension settings.

The site fixtures include recognizable app rails, conversation history surfaces and complete native composer shells. Separate empty-home fixtures exercise the aurora, spotlight and texture controls without conversation content obscuring the visual result. Tests compare computed sidebar/composer styles against their native baseline, check that surface markers are restored, verify independent texture/light switches and actual animation timing/pausing, and ensure old pet settings never recreate companion UI. Composition-event checks verify that extension effects do not consume IME-related events; they are not a test of an operating-system IME installation.

Chromium opens the actual toolbar popup with `chrome.action.openPopup()` in a persistent context with `viewport: null`. The test reads the real popup window through `chrome.extension.getViews({type: 'popup'})`, verifies Chrome reports a `POPUP` context, and captures its CDP target without changing its viewport. It checks natural 440 × 600 sizing, visible header/tabs/workspace/footer, tab interaction, and close/reopen in both color modes. Metrics and screenshots are saved with `chromium-action-popup-*` names. CI uses a headed browser under Xvfb (`PRISM_ACTION_HEADED=1`).

Both engines also load the unchanged popup HTML/CSS/JS in a 25 × 25 iframe and check that its body already has a 440 × 600 intrinsic layout before expanding the iframe from that measured size. This catches viewport-size circularity. **The Firefox iframe check is not a real installed Firefox action popup.** Ordinary popup-page tab tests remain supplemental UI checks; only the full options page is tested at 420 pixels. Settings screenshots include the motion panel in light and dark modes, and home screenshots show each supported site in dark, focused-composer and light states.

Conversation fixtures include opaque sticky footer ancestors, a native gradient pseudo-element, a decorative fade sibling, and a painted attachment control. Tests check that only backdrops become transparent, pseudo content and controls survive, and native palette/disable restore the original surfaces. Nested active sidebar rows include both parent and title markers; tests cover repeated scans, title-only state, attribute-only selection changes, independent rows inside a project group, and native-mode restoration.

## Probe-derived ("live") fixtures and measurement helpers

`tests/fixtures/chatgpt-live.html` and `tests/fixtures/gemini-live.html` are anonymous fixtures rebuilt from the 2026-11-22 read-only structure probe recorded in `.trellis/research/live-host-dom.md`. They are served at `https://chatgpt.com/prism-live-fixture` and `https://gemini.google.com/prism-live-fixture` by the same intercepting router as the older fixtures. They use real host markers only (no `data-fixture-*` hooks): ChatGPT turn-key containers with `data-content-search-unit-key` role suffixes, `data-markdown-text-style="assistant-message"`, `data-user-message-bubble`, the `transcriptContent` column with `--thread-content-max-width: 48rem` (808px column), `form[data-chatgpt-composer]` with a `ComposerLayoutRoot` (`data-composer-layout="single-line"`) and a `36px | input | trailing` grid, and aria-label-only buttons. On the Gemini side they reproduce `.md-content > *` blocks and `user-query` limited to 708px, a 660px `.input-area-container`, the `.text-input-field` grid areas, the absolutely positioned near-black `input-container.input-gradient`, and native h2 24px/380 and h3 20px/470.

Values the probe did not measure are inferred and labelled in the fixture CSS: ChatGPT h1/h4 sizes, the ChatGPT composer header row for attachments, the exact composer RGB, Gemini h1/h4, Gemini grid column sizes and the response-footer width.

`tests/live-fixtures.mjs` opens these pages **without the extension** and asserts the native baselines at main-area widths of 1280 and 1100 px (`checkLiveFixtureBaselines`). It also runs `tools/structure-probe.js` on them and proves that the probe output contains no fixture text, typed draft text, page path or unredacted session/message id. `PRISM_SUITE=live-fixtures npm run test:browser` runs only this subset. That is a quick local loop, not a full browser pass.

`tests/measure.mjs` provides shared helpers that measure user-visible results. These are `paragraphWidth` (box and widest rendered line), `sampleBelow`/`capturePixels`/`regionStats` (decoded screenshot pixels), `headingStyles` (computed h1–h4 and body typography), `controlGeometry` (control rectangles relative to a container) and `setMainWidth` (resizes the viewport so the main area has an exact width). The existing Content Width Preset smoke test uses `paragraphWidth`.

`tests/heading-typography.mjs` (`checkHeadingTypography`, part of the live-fixture subset) injects the extension into both live fixtures and checks the conversation heading contract with `headingStyles`. Outside Native Palette, each h1–h4 has the paragraph's computed font family, also after a test stylesheet switches the message body to a monospace stack. Weight and size satisfy h1 ≥ h2 ≥ h3 ≥ h4 with a strict step per pair, and Gemini's h2 is no lighter than its h3. ChatGPT keeps its native sizes and never gets lighter. Heading colour equals `--op-fg` with at least 4.5:1 contrast against the composited background in Obsidian (dark) and Crystal (light). Headings added at test time cover a User Turn (in scope) and host chrome and the sidebar (out of scope). Native Palette and a disabled extension must give exactly the native computed styles. The native Gemini fixture fails the font-family and h2/h3 checks as a negative case.

## Read-only structure probe (developer tool)

`tools/structure-probe.js` re-collects live structure evidence after a host redesign. It is syntax-checked by `npm run check`, and the release build allowlist excludes it. A Node test asserts that it is never packaged.

- **DevTools**: open a conversation, paste the whole file into the Console and press Enter. Then run `copy(JSON.stringify($_, null, 2))`.
- **ego-browser** (or any CDP/Playwright evaluate): evaluate the full file text as a script in the conversation tab. The completion value is the result object.
- Optional: before running, set `globalThis.__PRISM_PROBE_OPTIONS__ = { samples: 5, targets: { name: 'selector' } }`.

Privacy constraints: the probe emits only tags, class tokens, `data-*` attributes, roles, an `hasAriaLabel` flag, sizes and a fixed list of computed styles. It never reads text nodes, input values, `aria-label`, `title`, `alt`, `placeholder`, `href` or `src`, and it never emits element ids or the page path. In `data-*` values it redacts UUIDs, long hex or digit runs and mixed letter-digit tokens as `[id]`, URLs as `[url]` and free text as `[text]`. Structured keys such as `<conversation>:<n>:user` keep their role suffix. Review the output before sharing it. Never commit raw output from a signed-in page; record only the derived facts in `.trellis/research/live-host-dom.md`. The CI test runs the probe only on the synthetic live fixtures. Running it on a signed-in page is a manual step.

## Commands

```sh
npm install --no-save playwright@1.62.1
npx playwright install chromium firefox
npm run build
PRISM_BROWSER=chromium PRISM_ACTION_HEADED=1 xvfb-run -a bash tests/with-window-manager.sh npm run test:browser
PRISM_BROWSER=firefox npm run test:browser
```

The Playwright Firefox run uses Firefox's browser engine with Promise-only WebExtension API doubles. **That command does not install or sign an actual Firefox add-on.**

CI additionally runs `tests/native-firefox-popup.py` with Selenium 4.53.0, geckodriver 0.37.1 and the same Firefox binary under Xvfb. This separate test copies `dist/firefox` to a temporary directory, verifies that product files are unchanged, and appends a test-only background script to the temporary manifest. The installed add-on opens its own real action popup through public WebExtension APIs, measures the browser-selected size, operates settings, and checks saving and reopening. The report identifies this instrumentation; it is not an untouched-package installation or signing check. The release manifest, permissions and ZIPs do not contain the harness.

Firefox 153 [restricts ordinary WebDriver navigation to privileged pages, including extension pages](https://bugzilla.mozilla.org/show_bug.cgi?id=2048451). The native test therefore does not navigate to `about:debugging` or `moz-extension:` pages, enable system access, or disable protections. Its test script runs within its own extension and sends synthetic measurements to a temporary loopback report server. No user profile is used.

```sh
python3 -m pip install selenium==4.53.0
# Install geckodriver 0.37.1 separately and provide its executable path.
xvfb-run -a --server-args="-screen 0 1600x1200x24" bash tests/with-window-manager.sh python3 tests/native-firefox-popup.py \
  --firefox-binary "$(node -p "require('playwright').firefox.executablePath()")" \
  --geckodriver /path/to/geckodriver \
  --extension-dir dist/firefox --artifact-dir test-artifacts/native-firefox
```

Headed Linux checks need `openbox` and `x11-utils` in addition to Xvfb; native Firefox desktop screenshots also use ImageMagick. `tests/with-window-manager.sh` starts Openbox on the fresh Xvfb display and waits for its window-manager property before launching the test. [Mozilla documents that Xvfb alone lacks normal focus and may immediately hide native popups](https://firefox-source-docs.mozilla.org/ai-agent-tools/skills/desktop-theme-probing/references/platform-linux.html#displays). Popup auto-hide is not disabled, and no popup viewport is assigned. The ordinary options tab waits for a real, visible, stable layout before its first screenshot.

All HTTP requests in the Playwright fixture suite are intercepted: the two fixture URLs receive local HTML, and every other HTTP request is blocked. Translation responses are test doubles. The separate native Firefox harness communicates only synthetic test measurements to its loopback reporter. No real conversations, credentials, model calls, or signed-in websites are used.

Useful environment variables:

- `PRISM_EXTENSION_DIR`: built extension directory, relative to the repository or absolute (Chromium installation check).
- `PRISM_BROWSER_EXECUTABLE`: explicit installed browser executable when Playwright's bundled executable is unavailable.
- `PRISM_SKIP_EXTENSION=1`: run only the injected DOM fixtures. This explicitly does not verify extension installation.
- `PRISM_ACTION_HEADED=1`: use a headed browser for the real Chromium toolbar-popup check; run under Xvfb on headless Linux CI.

Sizing expectations follow the official [Chrome action popup](https://developer.chrome.com/docs/extensions/reference/api/action#popup) and [Firefox popup sizing](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups#popup_resizing) descriptions: the browser derives popup dimensions from content, subject to its limits. A fixed-size ordinary tab does not exercise that sizing step.

Do not describe a passing synthetic fixture as live-site compatibility validation. The sites can change their DOM independently, and signed-in production testing should confirm important native operations such as sending, regenerating, copying code, opening attachments, and navigating conversations.
