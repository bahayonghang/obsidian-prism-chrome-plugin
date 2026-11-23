# Obsidian Prism Web · 社区移植版

为 **ChatGPT 与 Gemini 网页版**提供四套 Prism 配色、可调外观和轻量阅读工具的 Chrome / Firefox 扩展。

> 基于 [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)，原作者 [RMvdesi](https://github.com/RMvdesi)，以 **GPL-3.0-only** 分发。这是独立社区移植版，并非上游官方发行版；与 RMvdesi、OpenAI、Google 均无隶属或背书关系。完整署名见 [NOTICE](NOTICE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

[English](#english) · [视觉改版规划](docs/UX_REFRESH_PLAN.md) · [首版规划](docs/IMPLEMENTATION_PLAN.md) · [隐私说明](PRIVACY.md) · [测试与限制](docs/TESTING.md) · [架构](docs/ARCHITECTURE.md)

## 功能与取舍

| 能力 | 浏览器版实现 |
|---|---|
| 四套主题 | 深空黑曜 Obsidian、暖炭玄岩 Warm、白昼冷晶 Crystal、暖白画册 Alabaster；也可保留宿主配色 |
| 外观微调 | 跟随系统亮暗、五档强调色、三档圆角、本地代码字体、连字；玻璃/实色/原生侧栏与紧凑密度 |
| 设置中心 | 紧凑弹窗、完整设置工作台、常驻导航与保存状态、中英文、场景预设、外观/动效预览、JSON导入导出、跨标签页同步 |
| 阅读工具 | 代码块顶栏与全主题高亮对比度统一、长代码手动折叠、带搜索的会话大纲、`Alt+↑` / `Alt+↓` 跳转、三档内容宽度（标准 / 加宽 / 全栏）及右下角单键循环按钮 |
| 环境与动效 | Aurora/Spotlight底部光晕、Spotlight聚光、字符/网格纹理、光效浓度、移动速度、模糊式 Composer Scrim（无实色底，光晕连续透出）、原位圆角悬浮输入框卡片与 Model Capsule、聚焦光效及回复活动余晖；全部可配置且支持原生配色零干预 |
| 会话估算 | 按当前网页已加载文字校准估算 token 数；支持 `auto` 按可见模型标签自动匹配参考容量（ChatGPT 按档位：Pro / Thinking / High / xHigh 为 400K，Instant 为 128K，未识别的标签按 128K 兜底并显示 `?`；Gemini 未知模式按 1M 自动兜底）或手动覆盖，并在检测到可见附件时附加 `+` 标记与未计入附件提示 |
| 可选翻译 | 关闭为默认状态；手动翻译网页已经显示的思考文字，自行配置兼容接口并授权目标站点 |

网页无法提供原桌面版的可靠模型配额、真实上下文占用、缓存命中率或子代理遥测。因此会话估算**不是账号额度，也不是实际模型计费**；它不包括未加载历史、隐藏系统提示、图片或附件的真实 token 消耗。试管的参考容量支持 `auto`（根据当前识别到的可见模型标签映射常见参考尺度，未知时按站点兜底；ChatGPT 的未识别标签在试管中显示 `?`，弹层提示可在设置中指定）或手动选择（`32K`–`2M`），仅作阅读参考比例尺，不代表真实服务端截断窗口。

CDP注入、Sidecar守护进程、本地文件网关、IDE模型档位滑块和工程模式没有移植。输入框继续使用网页原生编辑和光标，保留中文输入法与无障碍行为。

## 安装试用

支持桌面 **Chrome 111+ / Firefox 140+**。这些是代码采用的最低能力版本；建议使用仍受维护的浏览器。当前构建是开发包，尚未宣称通过商店审核或所有网站界面的实机验收。

### 从源码生成

需要 Node.js 22+、Python 3.9+；普通检查和打包不需要 `npm install`。

```bash
git clone https://github.com/bahayonghang/obsidian-prism-chrome-plugin.git
cd obsidian-prism-chrome-plugin
npm run check
npm test
npm run build
```

Windows若只有 `py` 命令，可将最后一步改为 `py -3 scripts/build.py`。

生成文件：

| 文件/目录 | 用途 |
|---|---|
| `dist/chrome/` | Chrome解压扩展目录 |
| `dist/firefox/` | Firefox临时加载目录，使用独立Firefox清单 |
| `dist/obsidian-prism-web-0.4.0-chrome.zip` | Chrome开发/提交包 |
| `dist/obsidian-prism-web-0.4.0-firefox.zip` | Firefox开发/提交包，未签名 |
| `dist/SHA256SUMS` | 两个ZIP的SHA-256校验值 |

构建采用明确文件白名单，不包含Git目录、测试数据、开发依赖或本地密钥。相同源码与Python/zlib环境可生成相同ZIP字节。

### Chrome

1. 打开 `chrome://extensions`，启用“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择 **`dist/chrome`**。
3. 打开或刷新 `https://chatgpt.com/` 或 `https://gemini.google.com/`。
4. 点击扩展工具栏图标，选择主题；从弹窗打开完整设置页。

如果下载的是Chrome ZIP，先解压，再选择包含 `manifest.json` 的文件夹。已经打开的网站需要刷新才能首次加载扩展。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击“临时载入附加组件”，选择 **`dist/firefox/manifest.json`**，或选择Firefox ZIP。
3. 在浏览器要求时允许它访问ChatGPT/Gemini，然后刷新目标网页。

临时加载在重启Firefox后结束。普通Firefox的长期安装需要Mozilla签名；把ZIP改名为XPI不会完成签名。详见 [Mozilla安装文档](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) 和 [签名说明](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)。

### 从 v0.1.0 / v0.2.0 更新

Chrome：用新版包的内容覆盖原来加载的扩展目录，在 `chrome://extensions` 点击该扩展的“重新加载”，然后刷新所有已打开的 ChatGPT/Gemini 页面。保持原目录可以保留原有扩展身份与设置；不要同时启用新旧两份扩展。

Firefox：在 `about:debugging` 重新载入新版 Firefox 包，并刷新目标网页。

v0.3.0 升级了 2026 双端页面 DOM 适配器，新增「标准 / 加宽 / 全栏」三档内容宽度与右下角快捷切换、全主题高对比度代码块及语法高亮、默认 `auto` 模型感知与附件提示的上下文估算、ChatGPT 底部空白收紧与双端羽化 Composer Scrim，以及原位可逆的输入框卡片与 Model Capsule（详见 [ADR-0001](docs/adr/0001-local-dom-context-estimation.md) 与 [ADR-0002](docs/adr/0002-in-place-reversible-composer-styling.md)）。

旧配色与浓度会保留，宠物设置自动失效。想直接查看新版完整环境效果，可先选择“流光”场景，再在“光影”中微调。正文中的光场会主动减弱，首页的光场更明显。完整设置页可通过弹窗右上角按钮打开。

## 使用设置

先选择配色，再调整强调色、圆角和字体。三档场景预设用于快速切换完整光效、专注阅读或省电风格；仍可单独修改各项设置。ChatGPT和Gemini可分别启停，关闭后移除扩展添加的界面和样式。

会话大纲仅索引当前网页已加载的提问。快捷键在输入框、编辑区域和对话框内让位给网页原生操作。页面变窄或功能未能识别时，增强组件应安静退让。

代码字体使用电脑已有字体，缺失时自动回退到等宽字体；扩展不从第三方字体服务下载文件。非原生配色下，对话里的 h1–h4 跟随所在消息正文的字体、使用当前配色的主前景色，字重按 h1 > h2 > h3 > h4 排出层级；扩展不提供阅读字体选项，正文字体仍由宿主或用户决定。v0.2.0已完整移除像素宠物，旧版本配置中的宠物字段也不会使其恢复。

### 环境光与侧栏

在“光影”中选择Aurora底部光晕、Spotlight聚光或关闭；分别调整浓度、速度和静态字符/网格纹理。字符是固定装饰，不读取对话。输入框聚焦光效和回复活动余晖也可独立开关。关闭动效后保留静态外观；环境样式“关闭”只去掉光晕，纹理可另行关闭；浓度设为0会去掉环境光和纹理。

“外观”中可选择透光、纯色或原生侧栏以及紧凑密度。扩展仅标记识别到的原生输入框/侧栏，不重建输入框，不接管发送和附件功能。

环境光使用少量CSS图层，在当前可见标签页缓慢移动；后台标签页、动效关闭和系统“减少动态效果”时停止动画。扩展不使用永久JavaScript动画循环，但启用移动光效时仍有正常的渲染开销。

### 可选思考文字翻译

翻译需要你自行提供兼容聊天接口的完整地址、模型名和可选API密钥。它只处理**网页已经显示、由你手动请求翻译的文字**，不获取隐藏推理，也不会自动翻译整个聊天记录。

开启前会请求服务协议与主机名的访问权限；浏览器权限涵盖该主机的所有端口，实际请求只发送到你配置的完整地址。Firefox还会请求相关数据发送权限。可使用HTTPS服务，或你自行运行的 `http://localhost` / `http://127.0.0.1` 服务。不内置所谓免费翻译代理，不提供API密钥，也不代替你开通付费服务。

所选文字和语言指令会发送给你配置的服务；提供了密钥时，它会随请求用于认证。服务方可能收费，其隐私政策也适用于该请求。密钥留在扩展本地存储中，不写入宿主网页 `localStorage`，不包含在配置导出中。更多信息见 [PRIVACY.md](PRIVACY.md)。

## 兼容性与验证范围

ChatGPT和Gemini都是持续更新的网页；扩展通过独立适配器识别界面，不能保证所有A/B测试布局或未来版本永久兼容。样式主要针对页面结构与语义属性，避免改写宿主消息和编辑器内容。

流式高亮使用 `CSS.highlights` 能力检测，不支持时关闭该效果。配置从异步扩展存储读取，因此没有“绝对零闪白”“10毫秒内必达”等承诺。关闭扩展动效不等于整个网页零CPU/GPU占用；开启环境动画时仍有正常的渲染开销。

自动检查覆盖配置、权限和后台消息边界；可选浏览器测试使用本地构造的ChatGPT/Gemini页面，不能替代登录后真实网站验收。具体已运行项目和待手动核验项目见 [TESTING.md](docs/TESTING.md)。

CI仅在 **Pull Request** 和手动触发时运行，不因普通分支push自动运行。

## 开发

运行浏览器夹具测试时才需要安装开发工具：

```bash
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium firefox
npm run build
npm run test:browser
```

设置 `PRISM_BROWSER=firefox` 可运行Firefox DOM夹具测试；这不等于Firefox签名扩展的完整生命周期测试。CI在两个引擎运行相同的本地夹具。所有测试均不需要真实账号或API密钥，不向ChatGPT、Gemini或付费翻译接口发送测试对话。

## 来源与许可证

主题与交互设计基于上游 `v1.0.7-beta.1`，核对提交 [`5dac53b`](https://github.com/RMvdesi/obsidian-prism/commit/5dac53bfa7cf917d40101dad2579f32dd1b1b587)。同时参考了用户提供的实施计划和两个浏览器移植原型ZIP，并重新处理跨浏览器权限、后台请求、设置存储和可恢复的网页适配。

本仓库以 **GPL-3.0-only** 发布，完整对应源码在本仓库提供；保留上游 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`，修改说明见 [MODIFICATIONS.md](MODIFICATIONS.md)。向上游与其列出的贡献者致谢。

---

## English

**Obsidian Prism Web — Community Edition** adapts the visual language of [Obsidian Prism by RMvdesi](https://github.com/RMvdesi/obsidian-prism) for ChatGPT and Gemini in desktop Chrome and Firefox. This is an independent, unofficial derivative, licensed under **GPL-3.0-only**.

### Included

- Four light/dark palettes plus host colors; five accents, system appearance, rounded corners, installed code fonts, ligatures and compact sidebars.
- Outside the host palette, conversation headings (h1–h4) follow the message body font, use the palette's primary foreground and keep a clear h1 > h2 > h3 > h4 weight hierarchy. There is no reading-font option; the body font stays the host's or yours.
- A compact bilingual popup and full settings workspace with persistent navigation, motion preview, scene presets, live settings and sanitized JSON import/export.
- Glass/solid/native sidebar surfaces and an elevated, in-place reversible two-row Composer Surface (editor on its own row; circular add trigger on the left, Model Capsule and voice/send on the right, rearranged only through the host's grid areas) with unified chips, and a translucent blur Composer Scrim (no solid base; the horizon glow shows through) without DOM reparenting or text rewriting (ADR-0002).
- Three Content Width Presets (`standard`, `wide`, `full`) synced between Reading settings and an independent Bottom Dock quick toggle, >= 4.5:1 WCAG AA Code Surface contrast across all four optical palettes, manual long-code folding, sticky headers, a searchable conversation outline and `Alt+Up/Down` navigation.
- Configurable Aurora/Spotlight environments, decorative glyph/grid textures, motion speed, focus glow and optional stream highlighting. Pixel companions have been removed, including legacy settings support.
- A calibrated local-only DOM estimate of currently loaded text (ADR-0001) with `auto` model-matched Reference Capacity (ChatGPT tiers: Pro / Thinking / High / xHigh map to 400K and Instant to 128K; an unrecognized ChatGPT label falls back to 128K and is flagged with `?`; Gemini custom modes use the 1M auto fallback; a manual override always wins) and an explicit `+` indicator for uncounted visible attachments. It is **not** model quota, billing, or actual server-side context usage.
- Optional, manual translation of already visible thought text through a user-configured compatible endpoint. It is off by default, requires explicit origin/data permission, and never exposes credentials through host-page storage or config exports.

Desktop-only CDP, Sidecar services, local-file gateways, IDE controls and account telemetry are excluded. The native composer and caret remain under the host site's control.

### Build and load

With Node.js 22+ and Python 3.9+, run `npm run check`, `npm test`, then `npm run build`. No dependency installation is needed for these commands.

Load `dist/chrome` with **Load unpacked** in `chrome://extensions`. In Firefox, use **Load Temporary Add-on** in `about:debugging` and select `dist/firefox/manifest.json`. Chrome requires version 111+; Firefox requires 140+. Firefox development packages are unsigned; permanent installation in regular Firefox requires Mozilla signing.

Browser fixture tests use optional Playwright 1.62.1 and local HTML fixtures, with no real accounts or paid API calls. They do not establish compatibility with every current signed-in website variant. See [testing](docs/TESTING.md), [architecture](docs/ARCHITECTURE.md), [privacy](PRIVACY.md) and [modifications](MODIFICATIONS.md).
