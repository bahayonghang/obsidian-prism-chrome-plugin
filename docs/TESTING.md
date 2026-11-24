# Validation and manual acceptance

Updated 2026-11-24. This document distinguishes implemented checks from completed execution. The commands below are reproducible procedures, not a claim that every check has already run in every browser.

## Automated commands

| Command | Checks | Does not establish |
|---|---|---|
| `npm run check` | JS syntax, versions, browser-specific background declarations, least-privilege defaults, CSP, resources, icon dimensions and notice presence | Website selector coverage or visual quality |
| `npm test` | Isolated configuration/storage/background/adaptation/handover contracts in the Node test suite | Signed-in website behavior or browser permission prompts |
| `npm run build` | Allowlisted files, valid browser manifest inputs, PNG sizes, ZIP integrity, deterministic ordering and SHA-256 output | Store acceptance or Mozilla signing |
| `npm run test:browser` | Local ChatGPT/Gemini fixtures in Chromium; unpacked extension popup/options `uiThemeMode`, palette-card preview, Reading tab `formulaPreview` & settings sync when available | Current live site variants, real model output or paid translation |
| `PRISM_BROWSER=firefox npm run test:browser` | The shared DOM runtime and 25×25 intrinsic popup checks (including `uiThemeMode` & palette clicks) against local fixtures in Firefox | A fully installed/signed Firefox extension lifecycle |
| `PRISM_SUITE=live-fixtures npm run test:browser` | Only the offline probe-derived ChatGPT/Gemini fixtures: native baselines without the extension (plus composable ChatGPT bottom variants), structure-probe privacy, (#18) ChatGPT turn recognition and tier-aware Context Vial, (#20) conversation heading typography, (#19/#26/#28) compact two-row Composer Surface with empty-header collapse, left four-pointed star Model Capsule, and primary action contrast, (#21/#26/#38) Content Width Presets at `1707`/`1280` viewports and `1280`/`1100` main widths (including direct-form/nested-wrapper and `nested native-cap` User Turn/composer variants, proportional ~80% long User Turn growth breaking old 820px/458px/540px caps, compact right-aligned short prompts, Native Palette width retention, zero-residue disable, and `<900px` fallback), (#22/#25/#29/#30/#31) pure transparent ChatGPT dock + independent-scroller Alpha fade + sticky-overlay clearance, Gemini blur Composer Scrim (`16px` feather) & fallback, `5px` active-conversation bottom pinning, external empty/hidden-content/vt/negative-margin spacer & disclaimer folding, and `composerRestyle: false` restoration, (#27/#31) Bottom Dock singleton handover, anti-squish, `3×3` + `820×500` zero-overlap/hit-test matrix, and zero-residue teardown, (#33) Gemini `<code-block>` de-nesting, >= 4.5:1 Material/SVG header icon contrast, and dual-host Native Math Surface readability & `overflow-x: auto` containment, and (#34/#35) dual-host offline Temml MathML Formula Preview, `%` comment captions, per-segment/full fallback, lossless `Source` / `Formula` toggle & native Copy preservation, 48-line fold coordination, 280ms streaming debounce, Native Palette inheritance, Context Vial invariance, and live `formulaPreview` disable/restore | A full browser pass, or anything about a live signed-in session (未在真实登录会话验证) |

The probe-derived fixtures, the shared measurement helpers in `tests/measure.mjs` and the read-only structure probe `tools/structure-probe.js` (including v0.4.0–v0.4.2 `pseudos`, full `ancestorsOf`, `userBubbleAncestors`, Gemini `userQueryText` / `inputAreaChildren`, `siblingsAfter`, `cornerFloats`, and `--bard-chat-window-content-width` collection) are described in `tests/README.md`. The probe is a developer tool, outside the release packages. All browser checks run against offline probe-derived fixtures (`未在真实登录会话验证`); running the committed probe on a signed-in ChatGPT or Gemini page is a manual evidence step that needs the owner's authorization. Derived facts belong in `.trellis/research/live-host-dom.md`; raw output must not be committed.

With `PRISM_ACTION_HEADED=1`, Chromium's extension check uses a real toolbar popup in a visible browser window (CI supplies Xvfb), measures its natural size and exercises settings without a viewport override. Both engines also load the actual popup files inside a 25×25 initial iframe to catch intrinsic-size regressions; this iframe check alone is not native extension installation. The standalone `tests/native-firefox-popup.py` adds a temporary-installation Firefox check; its execution result is recorded separately below.

Normal checks need Node.js 22+ and Python 3.9+ and have no npm dependencies. The optional browser runner needs Playwright 1.62.1 and its browsers. See the README for installation commands.

The browser runner must fail if its requested engine cannot launch; a sandbox or missing-browser error is **not a passing test**. In an environment that blocks browser subprocesses or sockets, report the limitation and run these checks elsewhere.

## Build reproducibility

Run two builds from unchanged source using the same Python/zlib environment and compare `dist/SHA256SUMS`. Each ZIP uses the fixed timestamp `2026-11-21 00:00:00`, sorted paths and fixed file permissions. Timestamps of source files and local checkout paths do not affect ZIP contents.

The package allowlist excludes tests, `.git`, dependencies and secrets. Verify that each browser ZIP contains its own manifest at the root and that Firefox has `background.scripts`, not `background.service_worker`.

## Manual acceptance on real websites

Use a current Chrome and Firefox with a test conversation. These checks require the site to be accessible to the person testing; do not infer success from local fixture tests.

### 安装后的五项快速验收（尚未替你执行）

- [ ] Chrome加载 `dist/chrome`；Firefox临时加载 `dist/firefox/manifest.json`，分别刷新ChatGPT与Gemini，确认输入、发送和切换会话正常。
- [ ] 切换四套主题及跟随系统模式，打开网站菜单和代码块；在另一个标签页确认设置同步，并检查中文输入法正常。
- [ ] 搜索会话大纲、跳转提问、折叠/展开长代码；使用网站原有复制按钮，确认复制内容完整。
- [ ] 确认不再出现宠物；切换环境样式/纹理/速度，关闭动效、关闭对应网站开关，确认原网页恢复且再次开启不出现重复控件。
- [ ] 不配置翻译服务时确认没有翻译请求；如需测试翻译，仅使用自己明确授权的接口，检查撤销权限和错误提示。Firefox长期安装另需Mozilla签名。

### Detailed acceptance matrix

| Area | Acceptance steps |
|---|---|
| First load | Install correct browser build, grant target-site access, refresh each site; verify no broken composer or navigation |
| Themes | Check all four palettes, host mode, forced light/dark and system transitions; inspect menus, tables and code contrast |
| Settings | Change a setting with two site tabs open; verify both update and preference survives refresh; reset and import/export |
| Site isolation | Disable ChatGPT while leaving Gemini enabled and vice versa; verify native colors/controls recover |
| Navigation | Open a long conversation, search outline, jump between turns, regenerate/edit responses, switch conversations |
| Keyboard | Confirm Alt+Up/Down works during reading and yields inside editor/search/modal; test Chinese IME composition |
| Code | Fold/unfold a completed long code block; stream a new block; verify copying returns unchanged complete code |
| Motion | Change Aurora/Spotlight/None, texture, speed and focus glow; confirm no pets; resize, hide tab, toggle system reduced-motion and verify the animated layers pause |
| Estimation | Verify the label says estimate and counts only recognized loaded turns; compare after streaming/navigation |
| Translation opt-in | Without credentials, verify disabled state and no unsolicited requests; grant/revoke exact-origin and Firefox data permissions |
| Translation request | With an explicitly authorized test endpoint, translate a visible thought block; test denial, timeout and disabled state without losing source text |
| Credential handling | Export settings and inspect for absence of keys; confirm no key in host localStorage or DOM; changing origins must not reuse an old credential silently |
| Responsive/accessibility | Keyboard-only settings and outline, focus visibility, labels, 200% zoom, narrow viewport and reduced-motion |
| Removal | Disable/uninstall extension; confirm website can be used normally without extension controls |

## Known limits

- ChatGPT and Gemini can change selectors, use experiments, virtualize old messages or present different account layouts. Adapters are best-effort and need maintenance.
- A DOM token heuristic cannot measure hidden prompts, attachments, quotas, billing or actual model context capacity.
- `document_start` plus asynchronous storage does not guarantee the absence of every initial color transition.
- Custom Highlight effects require browser support and are disabled when unavailable.
- Firefox temporary installation does not test all production installation/data-consent prompts and ends on restart. Mozilla signing is separate.
- CI runs on pull requests and manual dispatch only. A direct push does not imply CI has run.

## v0.1.0 execution record

Completed on 2026-11-21 (America/New_York) for implementation commit `3ddda204b15f2f6bb07ef315995947eb22ea9006`.

[GitHub Actions run 44983614734](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/actions/runs/44983614734) completed successfully with all three jobs passing:

| Job | Actual outcome |
|---|---|
| `validate` | Static/manifest/resource checks passed; all 49 Node tests passed; both browser packages built; repeated builds produced identical SHA-256 hashes. |
| `browser-fixtures (chromium)` | Playwright 1.62.1 / Chrome for Testing 151.0.7922.34. A real unpacked extension loaded its service worker and settings page; serialized changes propagated to content scripts; keyboard tabs worked. Both offline website fixtures passed lifecycle, folding, navigation/search, startup-race, reduced-motion, observer-idle, explicit-translation, body-replacement and shutdown checks. |
| `browser-fixtures (firefox)` | Playwright 1.62.1 / Firefox 153.0. Both offline website fixtures passed the shared DOM runtime checks, using Firefox Promise-style API test doubles. This did not install a native Firefox extension or exercise its real permission prompts. |

The authoring workspace denied browser-process socket creation, so it was not counted as a local browser pass. Browser execution was completed in GitHub Actions. Settings dark/light screenshots and representative host fixture screenshots were inspected. The fixtures are synthetic interaction samples, not visual replicas of production pages; their plain navigation sidebar does not establish live sidebar selector coverage.

No authenticated ChatGPT/Gemini session, real translation API key, paid API request, store submission or Mozilla signing was used. The declared minimum versions (Chrome 111 / Firefox 140) were not executed as separate browser versions. The live-site acceptance boxes above remain intentionally unchecked. This documentation update records the completed run; it does not claim an additional CI run for the documentation-only change.


## v0.2.0 execution record

Completed on 2026-11-21 (America/New_York) for implementation commit `f3b233b9d568e9e2f2017429ff60397b132e07dd`. [PR #4](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/pull/4) merged as `01d42b6884e67bfa37550abfe0254c5d017c955b` and closed [Issue #3](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/3).

[GitHub Actions run 44987182553](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/actions/runs/44987182553) passed all three jobs:

| Job | Actual outcome |
|---|---|
| `validate` | Syntax/manifest/resource checks and all 52 Node tests passed. Both v0.2.0 packages built twice with identical SHA-256 output. |
| `browser-fixtures (chromium)` | A real unpacked Chrome extension loaded its service worker and settings. Configuration synchronization, legacy import without pets, popup bounds at 440px/420px and both offline website fixtures passed. |
| `browser-fixtures (firefox)` | Both offline website fixtures passed the shared runtime using Promise-style browser API test doubles. Native Firefox extension installation, production prompts and signing are not covered. |

New browser checks exercise complete composer shells, multiple sidebar surfaces, blank home screens, actual computed styles, Aurora/Spotlight and independent textures, intensity/speed/glow controls, hidden-tab and reduced-motion handling, original attribute restoration, and removal of all pet UI. Native editor identity and synthetic composition events are checked; this does not validate an operating-system Chinese input method.

Selected history text and user-message bubbles in dark and light themes passed 4.5:1 contrast checks after finite CSS transitions settled. ChatGPT's explicit nested bubble is tested separately from its attachment background. Native palette and extension disable restore the original bubble colors. Existing folding, navigation, observer-idle, DOM-replacement, translation opt-in and teardown checks also passed.

Representative popup, full-settings and home/conversation screenshots were inspected. Visual inspection resolved CSS specificity conflicts in composer glow and glass sidebar controls, popup density, status localization and a light-background/light-text ChatGPT bubble case. Continuous ambient animation was deliberately left running while finite surface transitions were settled for screenshots. Synthetic screenshots contain no user conversations or project names.

Browser execution took place in GitHub Actions because the authoring workspace denied browser-process socket creation. No authenticated ChatGPT/Gemini session, real translation API request, store submission or Mozilla signing was used. The real-site checklist above remains unchecked, and the declared minimum browser versions were not run separately.

This documentation-only completion record does not claim a further CI run. Final packages are rebuilt from `main`; their executable files match the tested PR head, while bundled documentation includes this record.

## v0.2.1 regression execution record

Completed on 2026-11-22 (America/New_York) for tested implementation commit `a509237c71763dcf3bd2db43f6212733b4e6f5a9`. [PR #7](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/pull/7) merged as `4394bd317f1d7de487fdba0405f5bcaa9974fb20` and closed [Issue #5](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/5) and [Issue #6](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/6).

[GitHub Actions run 44990668077](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/actions/runs/44990668077) passed all three jobs:

| Job | Actual outcome |
|---|---|
| `validate` | Static, manifest and resource checks passed, as did all 52 Node tests. Both 26-file browser archives were built twice with identical SHA-256 output. |
| `browser-fixtures (chromium)` | Playwright 1.62.1 / Chrome for Testing 151.0.7922.34 loaded the unpacked extension. Actual `POPUP` contexts acquired 440×600 naturally in both color modes; settings interaction and close/reopen passed without an action-popup viewport override. Ordinary full options passed their 420px responsive check. Both host fixture suites passed. |
| `browser-fixtures (firefox)` | Playwright 1.62.1 / Firefox 153.0 passed both host fixture suites and intrinsic popup sizing from a 25×25 container. A separate headed Firefox 153.0 / geckodriver 0.37.1 / Selenium 4.53.0 temporary-installation test opened a real action popup. Initial, motion and reopened views were all 440×600, without horizontal overflow; controls were visible and spotlight plus 77% intensity persisted. |

The Firefox native test adds only a test background script to a temporary manifest. All 25 other release files are hash-verified unchanged, and the original built artifact remains unchanged. The test runs within its own extension through public APIs, sends synthetic measurements to a token-protected loopback reporter using ordinary CORS, and captures the actual Xvfb desktop. This is an installed add-on with explicitly recorded instrumentation, not an untouched ZIP installation or store-signing test. The harness is excluded from release archives. Product permissions and optional-translation state remain unchanged.

Headed checks use Xvfb with Openbox. The containing window and ordinary options tab must finish normal focus/layout before screenshots; action popup dimensions remain entirely browser-selected. No popup auto-hide preference, privileged WebDriver context, system-access flag, protection bypass or browser downgrade is used.

Two earlier attempts exposed automation setup gaps and are not counted as passing native Firefox validation. Run 44989518352 reached Firefox 153's protected-page navigation restriction after the shared fixtures passed. Run 44990354157 demonstrated a working extension-owned reporter but the native popup disappeared under Xvfb without a window manager; Chromium's first ordinary-options screenshot also encountered zero-width layout. The final run above resolves those setup gaps while preserving all popup assertions.

The v0.2.0 popup screenshots came from ordinary extension tabs with a forced 440×600 or 420×600 viewport. They did not verify the browser action's intrinsic sizing. The new action check is deliberately separate from those page-layout checks. Footer fixtures now include opaque nested wrappers and decorative fade layers; sidebar fixtures include nested selected flags and dynamic state migration.

Both engines verified four identified backdrop layers and preserved attachment paint, composer identity and pseudo-element content. Nested state normalization, repeated scans, title-only active flags, attribute-only selection migration and independent rows in project groups passed. Native palette, disabled composer restyling, native sidebar, extension disable and subsequent DOM replacement restored the expected original styles/attributes. Existing lifecycle, folding, keyboard, code-copy, reduced-motion, observer-idle and translation opt-in checks remained green. Representative dark/light conversation, home and popup screenshots were inspected.

No authenticated ChatGPT/Gemini session or real model/translation service was used. Production account experiments, Windows/macOS-specific browser chrome, a real Chinese IME, minimum supported browser versions, store submission and Mozilla signing were not separately tested. The live-site acceptance checklist remains unchecked. This documentation-only completion record does not claim another CI run; final packages are rebuilt from main with the same tested executable files and updated bundled documentation.

## v0.4.0 local verification record

Completed on 2026-11-23 for the `#23`–`#27` implementation and review-fix pass. Static validation (`node scripts/check.mjs`), all 110 isolated Node unit tests (`node --test tests/*.test.cjs`), and the offline probe-derived `PRISM_SUITE=live-fixtures` suite (`PRISM_SKIP_EXTENSION=1`) passed locally on both Chromium and Firefox, covering dual-mode Composer Scrim (4 palettes, in-flow vs sticky-overlay, Gemini overlay, blur/fallback), two-row Composer Surface with left four-pointed star Model Capsule and >= 4.5:1 primary action contrast, Content Width Presets (`1707`/`1280` viewports and `1280`/`1100` main widths plus wrapper variants), and Bottom Dock singleton handover, anti-squish, 3×3 zero-overlap matrix, popover containment, and zero-residue teardown.

All browser checks ran against offline probe-derived fixtures (`未在真实登录会话验证`). The full extension popup/install suites (`actualChromiumExtension` / `native-firefox-popup.py`), GitHub Actions CI run, and live signed-in manual acceptance checklist remain unexecuted in this local pass.

## v0.4.1 local verification record

Completed on 2026-11-23 for the `#28`–`#35` v0.4.1 implementation, two-axis `/code-review` remediation, version alignment (`0.4.1`), and full regression pass. Static validation (`npm run check` covering 11 JavaScript files, both manifests, CSP, notices, and Temml asset/scoping guards), all 135 isolated Node unit tests (`npm test`), reproducible dual-browser archives across two consecutive `python scripts/build.py` runs (producing identical `dist/SHA256SUMS` for both 29-file `obsidian-prism-web-0.4.1-chrome.zip` and `obsidian-prism-web-0.4.1-firefox.zip` archives), `PRISM_SUITE=live-fixtures` (`41/41` PASS on Chromium, including `3/3` native baselines), the full headed Chromium suite (`PRISM_BROWSER=chromium PRISM_ACTION_HEADED=1`, `49/49` PASS including `actualChromiumExtension` real toolbar action popup Reading tab `formulaPreview` toggle persistence across close/reopen without breaking `440×600` natural size, unpacked extension service worker & full-options sync at 420px, 25×25 intrinsic popup, saved-disabled startup, blank home, and synthetic/probe-derived host fixtures), and the full Firefox suite (`PRISM_BROWSER=firefox`, `47/47` PASS including 25×25 intrinsic popup Reading tab check) all passed locally, covering `checkLiveFixtureBaselines`, `checkTwoRowComposer`, `checkLiveTurnsAndCapacity`, `checkHeadingTypography`, `checkLiveWidthPresets`, `checkLiveComposerScrim`, `checkBottomDock`, `checkCodeAndNativeMathSurfaces` (`#33`), and `checkFormulaPreview` (`#34`–`#35`).

All host-page browser checks ran against offline synthetic and probe-derived fixtures (`未在真实登录会话验证`). The standalone Selenium `native-firefox-popup.py` harness, GitHub Actions CI workflow run, and live signed-in manual acceptance checklist remain unexecuted in this local pass.

## v0.4.2 local verification record

Completed on 2026-11-24 for the `#36`–`#39` v0.4.2 implementation, two-axis `/code-review` remediation (`fix(v042)`), version alignment (`0.4.2`), domain/architecture/test documentation updates, and full regression pass:

- **Static & Unit Suite**: `npm run check` (11 JavaScript files, Chrome/Firefox `0.4.2` manifests, package version match, CSP, permissions, and notices) and `npm test` (`138/138` PASS, zero skipped/failed, covering `uiThemeMode` schema/isolation/color-scheme guards, `contentWidth.userTurnTargets` / uncap static CSS guards without `820px` ceilings, multi-level `input-container :has(.input-area-container)` and `[data-message-author-role="user"] :has(...)` sync, and extended `tools/structure-probe.js` privacy/redaction checks).
- **Headed Chromium Browser Suite** (`PRISM_BROWSER=chromium PRISM_ACTION_HEADED=1 node tests/browser-smoke.mjs`): `51/51` PASS, including `actualChromiumExtension` (real `440×600` toolbar action popup in dark & light modes, `#btn-ui-theme` & `#cfg-uiThemeMode` sync and close/reopen persistence, non-destructive palette-card clicks under `themeMode: 'auto'` including already-checked defaults, bilingual `zh-CN`/`en-US` zero overflow, full options `emulateMedia` live `auto` switching, Host Surface / `#chat-preview` isolation, Native Palette fallback to `crystal`/`obsidian` with matching `color-scheme`, and 420px responsiveness), `43/43` offline probe-derived live-fixture checks within the suite (including `assertUserTurnProportions` across short & long User Turns, two-level input-wrapper `applyGeminiNestedNativeCap` and `applyChatGPTNestedNativeCap` wrapper variants, Native Palette width retention, `<900px` fallback, and zero-residue disable), `25×25` intrinsic popup check (including single synchronous `render()` on unchecked palette-card click and keyboard `ArrowLeft` radio navigation), saved-disabled startup, blank home, and synthetic offline fixtures.
- **Firefox Browser Suite** (`PRISM_BROWSER=firefox node tests/browser-smoke.mjs`): `49/49` PASS, including `43/43` offline probe-derived live-fixture checks within the suite, `25×25` intrinsic popup sizing with `emulateMedia` `uiThemeMode` switching, single synchronous `render()` on palette-card click, keyboard `ArrowLeft` radio navigation, palette-card click preservation of `themeMode: 'auto'`, and bilingual zero overflow, saved-disabled startup, blank home, and synthetic offline fixtures.
- **Reproducible Packaging & Archive Verification**: `python scripts/build.py` and `node scripts/pack-installers.mjs --verify-reproducible` verified two consecutive deterministic builds of 29-file `dist/obsidian-prism-web-0.4.2-chrome.zip` (pre-doc-update build: `276,777` bytes, SHA-256 `7756e91c086fe66afbfe28d7ab6f92ff9ba4a2367189c020ebbcd26da643367d`) and 29-file `dist/obsidian-prism-web-0.4.2-firefox.zip` (pre-doc-update build: `276,897` bytes, SHA-256 `7815b5a99f4f8a3d28eafe5fc132a37ca175629f1e924553afee718b12b9efdd`), plus `.crx` (`277,370` bytes) and `.xpi` (`276,897` bytes) installers, confirming zero `tools/` or `tests/` entries in either archive and byte-identical `dist/SHA256SUMS` / `dist/SHA256SUMS.installers` across repeated runs; `npm run check`, `npm test`, and reproducible `pack-installers.mjs --verify-reproducible` were re-run after this final documentation edit.

All host-page browser checks ran against offline synthetic and probe-derived fixtures (`未在真实登录会话验证`). The standalone Selenium `native-firefox-popup.py` harness, GitHub Actions CI workflow run, and live signed-in manual acceptance checklist above remain unchecked and unexecuted in this local pass.
