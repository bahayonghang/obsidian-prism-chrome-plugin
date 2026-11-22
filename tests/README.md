# Verification scope

`npm test` runs deterministic Node tests without browser installation, network access, API keys, or user accounts. The API doubles distinguish Chrome callback APIs, Firefox Promise APIs, and Chrome's newer Promise namespace. They exercise failure handling, serialization, secrets, permissions, sender validation, bounded translation requests, early initialization, native theme restoration, and adapter behavior.

`npm run build && npm run test:browser` runs Playwright with the Chromium extension built in `dist/chrome`. It checks service-worker startup, the real options page, settings propagation, and an intercepted local ChatGPT fixture. It then injects the source into isolated synthetic ChatGPT/Gemini pages to inspect runtime diagnostics and verify DOM behavior.

The browser suite also covers saved-disabled startup, native theme changes, whole-body replacement, removed extension controls, permanent teardown, collapsed thought summaries, stale translation responses, and failed translations in immersive mode. It writes synthetic default-page screenshots, Chromium options screenshots in both color modes, and failure screenshots to the ignored `test-artifacts/` directory for visual review. Screenshots contain only fixture text and extension settings.

The site fixtures include recognizable app rails, conversation history surfaces and complete native composer shells. Separate empty-home fixtures exercise the aurora, spotlight and texture controls without conversation content obscuring the visual result. Tests compare computed sidebar/composer styles against their native baseline, check that surface markers are restored, verify independent texture/light switches and actual animation timing/pausing, and ensure old pet settings never recreate companion UI. Composition-event checks verify that extension effects do not consume IME-related events; they are not a test of an operating-system IME installation.

Chromium also captures the actual popup page at 440 × 600 and 420 × 600, checks bounded scrolling, exercises the motion controls, and imports an old settings file containing a pet selection. Full settings screenshots include the motion panel in light and dark modes. Home screenshots in both browser engines show each supported site in dark, focused-composer and light states.

```sh
npm install --no-save playwright@1.62.1
npx playwright install chromium firefox
npm run build
PRISM_BROWSER=chromium npm run test:browser
PRISM_BROWSER=firefox npm run test:browser
```

The Firefox run uses Firefox's browser engine with Promise-only WebExtension API doubles. **It does not install or sign an actual Firefox add-on.** Firefox installation and store validation remain separate checks.

All HTTP requests in the browser suite are intercepted: the two fixture URLs receive local HTML, and every other HTTP request is blocked. Translation responses are test doubles. No real conversations, credentials, model calls, or signed-in websites are used.

Useful environment variables:

- `PRISM_EXTENSION_DIR`: built extension directory, relative to the repository or absolute (Chromium installation check).
- `PRISM_BROWSER_EXECUTABLE`: explicit installed browser executable when Playwright's bundled executable is unavailable.
- `PRISM_SKIP_EXTENSION=1`: run only the injected DOM fixtures. This explicitly does not verify extension installation.

Do not describe a passing synthetic fixture as live-site compatibility validation. The sites can change their DOM independently, and signed-in production testing should confirm important native operations such as sending, regenerating, copying code, opening attachments, and navigating conversations.
