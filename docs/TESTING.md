# Validation and manual acceptance

Updated 2026-11-21. This document distinguishes implemented checks from completed execution. The commands below are reproducible procedures, not a claim that every check has already run in every browser.

## Automated commands

| Command | Checks | Does not establish |
|---|---|---|
| `npm run check` | JS syntax, versions, browser-specific background declarations, least-privilege defaults, CSP, resources, icon dimensions and notice presence | Website selector coverage or visual quality |
| `npm test` | Isolated configuration/storage/background/adaptation contracts in the Node test suite | Signed-in website behavior or browser permission prompts |
| `npm run build` | Allowlisted files, valid browser manifest inputs, PNG sizes, ZIP integrity, deterministic ordering and SHA-256 output | Store acceptance or Mozilla signing |
| `npm run test:browser` | Local ChatGPT/Gemini fixtures in Chromium; extension settings when available | Current live site variants, real model output or paid translation |
| `PRISM_BROWSER=firefox npm run test:browser` | The shared DOM runtime against local fixtures in Firefox | A fully installed/signed Firefox extension lifecycle |

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
- [ ] 拖动像素伙伴、关闭动效、关闭对应网站开关，确认原网页恢复且再次开启不出现重复控件。
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
| Motion | Enable/disable companions and highlights, drag companion, resize, hide tab, toggle system reduced-motion |
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

## Execution record

Completed on 2026-11-21 (America/New_York) for implementation commit `3ddda204b15f2f6bb07ef315995947eb22ea9006`.

[GitHub Actions run 44983614734](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/actions/runs/44983614734) completed successfully with all three jobs passing:

| Job | Actual outcome |
|---|---|
| `validate` | Static/manifest/resource checks passed; all 49 Node tests passed; both browser packages built; repeated builds produced identical SHA-256 hashes. |
| `browser-fixtures (chromium)` | Playwright 1.62.1 / Chrome for Testing 151.0.7922.34. A real unpacked extension loaded its service worker and settings page; serialized changes propagated to content scripts; keyboard tabs worked. Both offline website fixtures passed lifecycle, folding, navigation/search, startup-race, reduced-motion, observer-idle, explicit-translation, body-replacement and shutdown checks. |
| `browser-fixtures (firefox)` | Playwright 1.62.1 / Firefox 153.0. Both offline website fixtures passed the shared DOM runtime checks, using Firefox Promise-style API test doubles. This did not install a native Firefox extension or exercise its real permission prompts. |

The authoring workspace denied browser-process socket creation, so it was not counted as a local browser pass. Browser execution was completed in GitHub Actions. Settings dark/light screenshots and representative host fixture screenshots were inspected. The fixtures are synthetic interaction samples, not visual replicas of production pages; their plain navigation sidebar does not establish live sidebar selector coverage.

No authenticated ChatGPT/Gemini session, real translation API key, paid API request, store submission or Mozilla signing was used. The declared minimum versions (Chrome 111 / Firefox 140) were not executed as separate browser versions. The live-site acceptance boxes above remain intentionally unchecked. This documentation update records the completed run; it does not claim an additional CI run for the documentation-only change.
