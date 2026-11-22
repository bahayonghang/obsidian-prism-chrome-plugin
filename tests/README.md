# Verification scope

`npm test` runs deterministic Node tests without browser installation, network access, API keys, or user accounts. The API doubles distinguish Chrome callback APIs, Firefox Promise APIs, and Chrome's newer Promise namespace. They exercise failure handling, serialization, secrets, permissions, sender validation, bounded translation requests, early initialization, native theme restoration, and adapter behavior.

`npm run build && npm run test:browser` runs Playwright with the Chromium extension built in `dist/chrome`. It checks service-worker startup, the real options page, settings propagation, an actual toolbar action popup, and an intercepted local ChatGPT fixture. It then injects the source into isolated synthetic ChatGPT/Gemini pages to inspect runtime diagnostics and verify DOM behavior.

The browser suite also covers saved-disabled startup, native theme changes, whole-body replacement, removed extension controls, permanent teardown, collapsed thought summaries, stale translation responses, and failed translations in immersive mode. It writes synthetic default-page screenshots, Chromium options screenshots in both color modes, and failure screenshots to the ignored `test-artifacts/` directory for visual review. Screenshots contain only fixture text and extension settings.

The site fixtures include recognizable app rails, conversation history surfaces and complete native composer shells. Separate empty-home fixtures exercise the aurora, spotlight and texture controls without conversation content obscuring the visual result. Tests compare computed sidebar/composer styles against their native baseline, check that surface markers are restored, verify independent texture/light switches and actual animation timing/pausing, and ensure old pet settings never recreate companion UI. Composition-event checks verify that extension effects do not consume IME-related events; they are not a test of an operating-system IME installation.

Chromium opens the actual toolbar popup with `chrome.action.openPopup()` in a persistent context with `viewport: null`. The test reads the real popup window through `chrome.extension.getViews({type: 'popup'})`, verifies Chrome reports a `POPUP` context, and captures its CDP target without changing its viewport. It checks natural 440 × 600 sizing, visible header/tabs/workspace/footer, tab interaction, and close/reopen in both color modes. Metrics and screenshots are saved with `chromium-action-popup-*` names. CI uses a headed browser under Xvfb (`PRISM_ACTION_HEADED=1`).

Both engines also load the unchanged popup HTML/CSS/JS in a 25 × 25 iframe and check that its body already has a 440 × 600 intrinsic layout before expanding the iframe from that measured size. This catches viewport-size circularity. **The Firefox iframe check is not a real installed Firefox action popup.** Ordinary popup-page tab tests remain supplemental UI checks; only the full options page is tested at 420 pixels. Settings screenshots include the motion panel in light and dark modes, and home screenshots show each supported site in dark, focused-composer and light states.

Conversation fixtures include opaque sticky footer ancestors, a native gradient pseudo-element, a decorative fade sibling, and a painted attachment control. Tests check that only backdrops become transparent, pseudo content and controls survive, and native palette/disable restore the original surfaces. Nested active sidebar rows include both parent and title markers; tests cover repeated scans, title-only state, attribute-only selection changes, independent rows inside a project group, and native-mode restoration.

```sh
npm install --no-save playwright@1.62.1
npx playwright install chromium firefox
npm run build
PRISM_BROWSER=chromium PRISM_ACTION_HEADED=1 xvfb-run -a npm run test:browser
PRISM_BROWSER=firefox npm run test:browser
```

The Playwright Firefox run uses Firefox's browser engine with Promise-only WebExtension API doubles. **That command does not install or sign an actual Firefox add-on.**

CI additionally runs `tests/native-firefox-popup.py` with Selenium 4.53.0, geckodriver 0.37.1 and the same Firefox binary under Xvfb. This separate test copies `dist/firefox` to a temporary directory, verifies that product files are unchanged, and appends a test-only background script to the temporary manifest. The installed add-on opens its own real action popup through public WebExtension APIs, measures the browser-selected size, operates settings, and checks saving and reopening. The report identifies this instrumentation; it is not an untouched-package installation or signing check. The release manifest, permissions and ZIPs do not contain the harness.

Firefox 153 [restricts ordinary WebDriver navigation to privileged pages, including extension pages](https://bugzilla.mozilla.org/show_bug.cgi?id=2048451). The native test therefore does not navigate to `about:debugging` or `moz-extension:` pages, enable system access, or disable protections. Its test script runs within its own extension and sends synthetic measurements to a temporary loopback report server. No user profile is used.

```sh
python3 -m pip install selenium==4.53.0
# Install geckodriver 0.37.1 separately and provide its executable path.
xvfb-run -a --server-args="-screen 0 1600x1200x24" python3 tests/native-firefox-popup.py \
  --firefox-binary "$(node -p "require('playwright').firefox.executablePath()")" \
  --geckodriver /path/to/geckodriver \
  --extension-dir dist/firefox --artifact-dir test-artifacts/native-firefox
```

All HTTP requests in the Playwright fixture suite are intercepted: the two fixture URLs receive local HTML, and every other HTTP request is blocked. Translation responses are test doubles. The separate native Firefox harness communicates only synthetic test measurements to its loopback reporter. No real conversations, credentials, model calls, or signed-in websites are used.

Useful environment variables:

- `PRISM_EXTENSION_DIR`: built extension directory, relative to the repository or absolute (Chromium installation check).
- `PRISM_BROWSER_EXECUTABLE`: explicit installed browser executable when Playwright's bundled executable is unavailable.
- `PRISM_SKIP_EXTENSION=1`: run only the injected DOM fixtures. This explicitly does not verify extension installation.
- `PRISM_ACTION_HEADED=1`: use a headed browser for the real Chromium toolbar-popup check; run under Xvfb on headless Linux CI.

Sizing expectations follow the official [Chrome action popup](https://developer.chrome.com/docs/extensions/reference/api/action#popup) and [Firefox popup sizing](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups#popup_resizing) descriptions: the browser derives popup dimensions from content, subject to its limits. A fixed-size ordinary tab does not exercise that sizing step.

Do not describe a passing synthetic fixture as live-site compatibility validation. The sites can change their DOM independently, and signed-in production testing should confirm important native operations such as sending, regenerating, copying code, opening attachments, and navigating conversations.
