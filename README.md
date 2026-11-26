# Obsidian Prism Web · 社区移植版

为 **ChatGPT 与 Gemini 网页版**提供四套 Prism 配色、可调外观和轻量阅读工具的 Chrome / Firefox 扩展。

> 基于 [Obsidian Prism](https://github.com/RMvdesi/obsidian-prism)，原作者 [RMvdesi](https://github.com/RMvdesi)，以 **GPL-3.0-only** 分发。这是独立社区移植版，并非上游官方发行版；与 RMvdesi、OpenAI、Google 均无隶属或背书关系。完整署名见 [NOTICE](NOTICE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

[English](#english) · [视觉改版规划](docs/UX_REFRESH_PLAN.md) · [首版规划](docs/IMPLEMENTATION_PLAN.md) · [隐私说明](PRIVACY.md) · [测试与限制](docs/TESTING.md) · [架构](docs/ARCHITECTURE.md)

## 功能与取舍

| 能力 | 浏览器版实现 |
|---|---|
| 四套主题 | 深空黑曜 Obsidian、暖炭玄岩 Warm、白昼冷晶 Crystal、暖白画册 Alabaster；也可保留宿主配色 |
| 外观微调 | 跟随系统亮暗、五档强调色、三档圆角、本地代码字体、连字；玻璃/实色/原生侧栏与紧凑密度 |
| 设置中心 | 紧凑弹窗、完整设置工作台、**独立设置界面明暗主题**（顶栏一键切换与外观细节 `auto` / `light` / `dark` 选择，与站点配色及总开关解耦，色卡点击只预览并保存分组预设不覆盖站点跟随系统）、常驻导航与保存状态、中英文、场景预设、外观/动效预览、JSON导入导出、跨标签页同步 |
| 阅读工具 | 代码块去嵌套与顶栏图标全主题 >= 4.5:1 对比度统一、Native Math Surface（原生公式配色继承与超宽横向滚动兜底）、**Formula Preview**（本地离线 Temml v0.14.0 将合格 LaTeX 代码块渲染为原生 MathML Core 公式，支持 `%` 注释分段、源码/公式无损切换与「阅读」页签 `formulaPreview` 开关，原代码与原生复制保持无损）、长代码手动折叠、带搜索的会话大纲、`Alt+↑` / `Alt+↓` 跳转、三档内容宽度（标准 / 加宽 / 全栏，User Turn 长提问按阅读列 ~80% 等比加宽且无 820px 硬顶、短提问保持紧凑贴右，ChatGPT/Gemini 主区与底栏同步伸缩）及右下角防挤压单键循环按钮 |
| 环境与动效 | Aurora/Spotlight底部光晕、Spotlight聚光、字符/网格纹理、光效浓度、移动速度、双端统一纯透明底栏（清除宿主渐变与伪元素绘制，叠层底栏保留末尾滚动避让留白，ChatGPT 收紧底部留白至 6–8px）、对齐原版光学质感的紧凑圆角（6/12/16px）与四边 1px 描边输入框卡片、悬停/聚焦 1px 贴边棱镜流光、中性微凸 `+` 与左侧四芒星 Model Capsule、发送/停止实心主圆钮与语音/麦克风幽灵图标分级及回复活动余晖；全部可配置且支持原生配色零干预；右下角 Bottom Dock 支持跨重载单例接管与零轮询碰撞避让 |
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
| `dist/obsidian-prism-web-0.4.5-chrome.zip` | Chrome开发/提交包 |
| `dist/obsidian-prism-web-0.4.5-firefox.zip` | Firefox开发/提交包，未签名 |
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

v0.4.0 在 v0.3.0 与 2026 探针适配基础上新增双态 `Composer Scrim` 与 ChatGPT 底部冗余留白收紧、三档内容宽度同步底栏容器与中间包装层、Prism 原型两行输入框布局（左侧四芒星 `Model Capsule` 紧随 `+`、单层 1px 描边、高对比主圆钮），以及 `Bottom Dock` 跨实例单例接管、防挤压 11px 按钮、零轮询角落浮件/输入框/大纲避让与视口内自适应弹层（详见 [ADR-0001](docs/adr/0001-local-dom-context-estimation.md) 与 [ADR-0002](docs/adr/0002-in-place-reversible-composer-styling.md)）。

v0.4.1 在此基础上进一步修复 Gemini 双层嵌套 `<code-block>` 样式错位与顶栏 Material/SVG 图标对比度，为 ChatGPT 与 Gemini 的 Native Math Surface 增加非原生配色下的前景色兜底与超宽公式内部横向滚动，并引入基于锁定版本 Temml v0.14.0 的本地离线 **Formula Preview**（默认在「阅读」页签开启 `formulaPreview` /「自动渲染公式代码块」，将合格 LaTeX 代码块与 `%` 注释分段渲染为原生 MathML Core，支持「源码 / 公式」无损来回切换、48 行折叠协调、280ms 流式防抖与 Native Palette 颜色继承，不改写宿主 `<pre><code>` 与原生复制行为，详见 [ADR-0003](docs/adr/0003-local-mathml-formula-preview.md)）。

v0.4.2 新增与 Host Surface 解耦的设置界面独立明暗控制 `uiThemeMode`（支持顶栏快捷按钮与外观「细节」下拉框双向同步、原生 `color-scheme` 声明、浅色系统预加载防闪黑及原生配色下回退到清晰标准色板，并修复外观页点击色卡破坏「跟随系统」及已选默认色卡无响应的问题），同时解开 Gemini 与 ChatGPT 双端 User Turn 多层中间包裹限宽及输入区包装壳限宽、移除旧 820px 硬上限，让长提问在「加宽 / 全栏」下按阅读列 ~80% 正向等比拓宽而短提问保持紧凑贴右、输入区与阅读列保持同步对齐。

v0.4.3 根治 ChatGPT 对话页输入框两侧与下方的不透明底栏黑带：底栏识别改以宿主稳定标记 `data-thread-scroll-footer` / `data-thread-composer-backdrop` 为主，祖先遍历兜底且不把零尺寸的 `display: contents` 包装计入层数，只清除底栏及其伪元素的绘制、不改定位，也不新增遮罩或正文淡出；同时按控件形状重新设计侧栏激活高亮——图标栏里的方形图标按钮显示为「图标瓷片」（均匀强调色填充与 1px 内描边、强调色图标、无左边条），会话等文字行只保留覆盖整行的一层高亮。侧栏样式选「原生」或使用原生配色时保持宿主原样。

v0.4.4 根治 Gemini 输入框左右两侧的暗色矩形「黑框」，对齐原版 Obsidian Prism 光学 `Composer Surface` 质感，并收紧 ChatGPT 底部大面积空白：Gemini 与 ChatGPT 统一采用纯透明底栏策略（关闭 Gemini 叠层模糊遮罩，仅清除宿主底部容器及伪元素的原生渐变/绘制，保留叠层停靠区对滚动末尾的动态 `--op-dock-clearance` 留白）；双端输入框卡片收紧至 `6px / 12px / 16px` 紧凑圆角、不透明漫反光实底（清除宿主 `backdrop-filter`）、强制四边 `1px` 实线物理描边与顶缘内高光，移除静态弥散外雾与聚焦 `3px` 外环并改为悬停/聚焦态纯 CSS `1px` 贴边棱镜光谱细边，拉升单行编辑区呼吸空间（`min-height: 38px`），将 `+` 与 `Model Capsule` 统一为 `28px` 中性微凸药丸（保留四芒星与档位强调色），并严格限定 `30×30` 实心主操作圆钮仅用于发送与停止按钮（ChatGPT 空态开始语音与双端麦克风归为 `28×28` 透明幽灵圆钮）；同时修复 ChatGPT `threadColumns` 对外层 `--thread-content-*` 非滚动应用壳的误匹配（消除 `48px` 悬空），在活跃对话开启重塑时收敛 `Thread Footer` 内部 `::after` 占位与免责声明使输入框底距视口收紧至 `6–8px`，并将 `[data-thread-composer-backdrop="true"]` 接入 `Content Width Preset` 桥接与 `Bottom Dock` 自动避让。

v0.4.5 面向 ChatGPT 与 Gemini 长对话、快速滚动与高频流式输出完成全链路性能优化并建立离线 1×/25× 自动化性能回归门禁（`npm run test:perf -- --assert`，不随扩展打包，详见 [PERFORMANCE_PLAN.md](docs/PERFORMANCE_PLAN.md)）：根治 `Formula Preview` 批量初始化 $O(N^2)$ 强制样式重算与非法公式死循环（引入负缓存、长对话首尾优先分块渲染与前序 `data-op-formula-deferred` 延迟排版）；引入单次扫描作用域缓存、`checkVisibility()`（兼容无盒子 `display: contents` 回退）与三阶段读写/几何分离，消除滚动期间全页按钮扫描并改用 $O(\log N)$ 二分定位当前轮次；移除文本提取与估算路径的 `cloneNode(true)` 深拷贝，改为零拷贝活 DOM 遍历、增量 Context Vial / Conversation Rail 缓存、分域 `MutationObserver`（流式正文直走 `vialOnly` 快路径）与 rAF 复用 `Range` 淡入高亮；将单体 `styles/hosts.css` 按站点拆分为 `styles/common.css`、`styles/host-chatgpt.css` 与 `styles/host-gemini.css` 并清除根级 `html:has()` 与通配 `*` 右端选择器，`#op-ambient-stage` 升级为 `contain: strict`、内联 SVG 字符瓦片（0 字符 DOM 节点）与局部 `data-op-aura`；同时复用 `early-boot.js` 预加载配置、优化 Popup 翻译与权限检查，并将 `vendor/temml/temml.js` 精简为同版本官方压缩产物 `vendor/temml/temml.min.js`（减重 61.6%，配套 `check.mjs` 严格 Chromium UTF-8 守卫），零新增权限与零残留可逆关闭保持不变。

旧配色与浓度会保留，宠物设置自动失效。想直接查看新版完整环境效果，可先选择“流光”场景，再在“光影”中微调。正文中的光场会主动减弱，首页的光场更明显。完整设置页可通过弹窗右上角按钮打开。

## 使用设置

先选择配色，再调整强调色、圆角和字体。三档场景预设用于快速切换完整光效、专注阅读或省电风格；仍可单独修改各项设置。ChatGPT和Gemini可分别启停，关闭后移除扩展添加的界面和样式。

会话大纲仅索引当前网页已加载的提问。快捷键在输入框、编辑区域和对话框内让位给网页原生操作。页面变窄或功能未能识别时，增强组件应安静退让。

「阅读」页签中的 `formulaPreview`（「自动渲染公式代码块」）默认开启；关闭后会立即撤回所有公式预览与切换按钮并恢复原始代码块与 48 行折叠栏，开启后平滑恢复。扩展不会重渲染宿主已经原生排版好的数学公式（Native Math Surface 仅做配色继承与超宽横向滚动兜底），也不对正文裸文本做全局正则公式替换（见 [ADR-0003](docs/adr/0003-local-mathml-formula-preview.md)）。

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

也可用 `python scripts/build.py`（Windows 仅安装 `py` 时用 `py -3 scripts/build.py`）打包，并用 `PRISM_SUITE=live-fixtures npm run test:browser` 快速运行离线探针夹具闭环（尚未在真实登录网站逐项验收）。设置 `PRISM_BROWSER=firefox` 可运行Firefox DOM夹具测试；这不等于Firefox签名扩展的完整生命周期测试。CI在两个引擎运行相同的本地夹具。所有测试均不需要真实账号或API密钥，不向ChatGPT、Gemini或付费翻译接口发送测试对话。

## 来源与许可证

主题与交互设计基于上游 `v1.0.7-beta.1`，核对提交 [`5dac53b`](https://github.com/RMvdesi/obsidian-prism/commit/5dac53bfa7cf917d40101dad2579f32dd1b1b587)。同时参考了用户提供的实施计划和两个浏览器移植原型ZIP，并重新处理跨浏览器权限、后台请求、设置存储和可恢复的网页适配。

本仓库以 **GPL-3.0-only** 发布，完整对应源码在本仓库提供；保留上游 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`，修改说明见 [MODIFICATIONS.md](MODIFICATIONS.md)。向上游与其列出的贡献者致谢。

---

## English

**Obsidian Prism Web — Community Edition** adapts the visual language of [Obsidian Prism by RMvdesi](https://github.com/RMvdesi/obsidian-prism) for ChatGPT and Gemini in desktop Chrome and Firefox. This is an independent, unofficial derivative, licensed under **GPL-3.0-only**.

### Included

- Four light/dark palettes plus host colors; five accents, system appearance, rounded corners, installed code fonts, ligatures and compact sidebars.
- Outside the host palette, conversation headings (h1–h4) follow the message body font, use the palette's primary foreground and keep a clear h1 > h2 > h3 > h4 weight hierarchy. There is no reading-font option; the body font stays the host's or yours.
- A compact bilingual popup and full settings workspace with persistent navigation, independent settings UI light/dark control (`uiThemeMode`: header toggle and Details dropdown decoupled from Host Surface `themeMode`, with `color-scheme` declarations, light pre-load fallback, and non-destructive palette-card click previews), motion preview, scene presets, live settings and sanitized JSON import/export.
- Glass/solid/native sidebar surfaces and an elevated, in-place reversible two-row Composer Surface aligned with original Obsidian Prism optical styling (compact `6px`/`12px`/`16px` corners, opaque card with top sheen and cleared host `backdrop-filter`, forced four-sided `1px` border, calm resting state without outer haze, optional hover/focus `1px` CSS prismatic rim, `min-height: 38px` editor breathing room, attachments on top, neutral elevated `28px` `+` and left-aligned four-pointed star Model Capsule via flex `order` + `margin-inline-end: auto`, transparent `28×28` ghost voice/mic controls, and high-contrast `30×30` circular primary action strictly for Send and Stop/Cancel without DOM reparenting or text rewriting per ADR-0002) plus a unified pure-transparent Composer Scrim on both ChatGPT and Gemini (clearing host backdrop gradients/shadows without canvas veils or blur, preserving overlaid `--op-dock-clearance` scroll clearance, tightening ChatGPT Thread Footer bottom margin to `6–8px`, and bridging `[data-thread-composer-backdrop="true"]` to Content Width Presets).
- Three Content Width Presets (`standard`, `wide`, `full`) synced across conversation turns (including proportional ~80% User Turn widening without an 820px cap and compact right-aligned short prompts) and composer containers/wrappers with a Bottom Dock quick toggle featuring singleton handover, anti-squish 11px pills, zero-polling collision avoidance, and viewport-contained Context Vial popovers; Gemini Code Surface de-nesting and >= 4.5:1 WCAG AA Code Surface / header icon contrast across all four optical palettes; Native Math Surface foreground cleanup and `overflow-x: auto` wide-equation containment; manual long-code folding, sticky headers, a searchable conversation outline, and `Alt+Up/Down` navigation.
- Local offline **Formula Preview** ([ADR-0003](docs/adr/0003-local-mathml-formula-preview.md)): pinned Temml v0.14.0 renders qualifying LaTeX code blocks into browser-native MathML Core with `%` comment captions, per-segment monospace fallback, 280ms streaming debounce, lossless `Source` / `Formula` toggling (leaving `<pre><code>`, native Copy, and Context Vial counts untouched), 48-line fold coordination, Native Palette color inheritance, and a Reading-tab `Formula preview` (`formulaPreview`, default on) toggle with zero-residue disable/restore.
- Configurable Aurora/Spotlight environments, decorative glyph/grid textures, motion speed, focus glow and optional stream highlighting. Pixel companions have been removed, including legacy settings support.
- A calibrated local-only DOM estimate of currently loaded text (ADR-0001) with `auto` model-matched Reference Capacity (ChatGPT tiers: Pro / Thinking / High / xHigh map to 400K and Instant to 128K; an unrecognized ChatGPT label falls back to 128K and is flagged with `?`; Gemini custom modes use the 1M auto fallback; a manual override always wins) and an explicit `+` indicator for uncounted visible attachments. It is **not** model quota, billing, or actual server-side context usage.
- Optional, manual translation of already visible thought text through a user-configured compatible endpoint. It is off by default, requires explicit origin/data permission, and never exposes credentials through host-page storage or config exports.

Desktop-only CDP, Sidecar services, local-file gateways, IDE controls and account telemetry are excluded. The native composer and caret remain under the host site's control.

### Build and load

With Node.js 22+ and Python 3.9+, run `npm run check`, `npm test`, then `npm run build`. No dependency installation is needed for these commands.

Load `dist/chrome` with **Load unpacked** in `chrome://extensions`. In Firefox, use **Load Temporary Add-on** in `about:debugging` and select `dist/firefox/manifest.json`. Chrome requires version 111+; Firefox requires 140+. Firefox development packages are unsigned; permanent installation in regular Firefox requires Mozilla signing.

Browser fixture tests use optional Playwright 1.62.1 and local HTML fixtures, with no real accounts or paid API calls. They do not establish compatibility with every current signed-in website variant. See [testing](docs/TESTING.md), [architecture](docs/ARCHITECTURE.md), [privacy](PRIVACY.md) and [modifications](MODIFICATIONS.md).
