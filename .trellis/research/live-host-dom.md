# 线上宿主 DOM 结构（探针证据）

来源：2026-11-22 在已登录的 ChatGPT 与 Gemini 会话中，用 ego-browser 运行只读结构探针（1707×909，DPR 1.5，每站各取一个对话；只读结构，不读正文）。线上 DOM 会继续变化，适配器和夹具应以最新一次探针结果为准。相关 spec：[#16](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/16)，tickets #17–#22。

## 实测事实

### ChatGPT

- **轮次标记**：`data-message-author-role`、`article[data-turn]`、`conversation-turn-*`、`.agent-turn`、user/assistant 相关 testid **全部消失**。每一轮是 `[data-turn-key]`（内部有 `[data-virtualized-turn]`）。角色写在 `[data-content-search-unit-key]` 的末尾，形如 `…:0:user` / `…:2:assistant`。回复正文是 `[data-markdown-text-style="assistant-message"]`；提问气泡是 `[data-user-message-bubble="true"]`，最大宽度由 `--user-chat-width` 控制。
- **限宽元素**：`[class*="transcriptContent"]`，由 `--thread-content-max-width: 48rem` 加左右各 20px 内边距决定，最大 808px。
- **输入框**：外层是 `form[data-chatgpt-composer]`；绘制底色的是 `ComposerLayoutRoot`（带 `data-composer-dark`，底色约 rgba 0.13 / 0.95），带 `data-composer-layout="single-line"`；底栏是三列 grid：`36px | 输入 | 右侧按钮`。按钮没有 testid，只能靠 aria-label 定位：`Add files and more`、`Select ChatGPT model`、`Dictate`、`Start Voice`。
- **模型标签**：模型按钮上显示的是**档位**（例如 "High"，并带 `data-selected-reasoning-effort`），看不到模型系列。
- **底部区域**：输入框外层的容器都是透明的，原生不画底色。
- **标题**：h2 18px/600，h3 16px/600，层级正常。

### Gemini

- **轮次标记**：`user-query`、`model-response` 仍然有效。
- **限宽方式**：在 `.md-content` 的**每个直接子块**上设 `max-width: 708px`（`.enable-extended-and-xl-grid` 下的作用域规则），外层面板约 1395px 宽；`user-query` 也是 708px，`.input-area-container` 是 660px，`--bard-chat-window-content-width-default` 是 744px。
- **输入框**：`.text-input-field` 是 grid，areas 为 `"file-preview file-preview file-preview" "leading-actions text-input trailing-actions"`；`input-area-v2` 自己画底色（约 rgb 30,31,32）。
- **原生底部遮罩**：`input-container.input-gradient` 是绝对定位、约 133px 高的渐变层，渐变到不透明的近黑色。
- **标题**：h2 24px/字重 380，h3 20px/字重 470。原生 h2 比 h3 细，层级是反的。
- **模型标签**：aria-label 形如 "Open mode picker, currently Neon High"。

## 由此得出的结论（v0.3.0 为什么 CI 绿、线上坏）

v0.3.0 的夹具是按推测的结构手写的，浏览器测试量的是扩展自己打了标记的包装元素，没有量正文段落的实际宽度和像素。

## 已实现（#17，`5ce0d76` / `0caadcc`）

- 先取证：只读结构探针在 `tools/structure-probe.js`（开发工具，不进发布包；运行方法和隐私约束见 `tests/README.md`）。按本页事实生成的匿名夹具是 `tests/fixtures/chatgpt-live.html` 和 `tests/fixtures/gemini-live.html`；`tests/live-fixtures.mjs` 在不加载扩展的情况下断言原生基线，测量辅助函数在 `tests/measure.mjs`。本页事实之外的夹具数值（ChatGPT h1/h4、输入框附件行、Gemini h1/h4 等）是推断值，已在夹具 CSS 中标注。

## 已实现（#18，`ebc60e8`）

- ChatGPT 轮次：适配器以 `[data-content-search-unit-key]` 的 `:user` / `:assistant` 后缀为主，`[data-user-message-bubble="true"]` 和 `[data-markdown-text-style="assistant-message"]` 为辅，`[data-turn-key]` 作为轮次容器；v0.3.0 的旧选择器保留为后备。没有这些标记的虚拟化占位轮次不计入（ADR-0001）。识别恢复后 Context Vial 非零、Conversation Rail 出现、Home State 为 false。
- ChatGPT 容量：Pro / Thinking / High / xHigh 为 400K，Instant 为 128K；识别不了的标签按 128K 兜底，胶囊显示 `?`，弹层写明"未识别型号，可在设置中指定"。手动指定始终优先。Gemini 自定义模式名（如 "Neon High"）继续按 1M 兜底，弹层标为"自动兜底"。评审修复（S9，`da2a6a8`）后容量结果只用一个 `source` 字段（`manual` / `matched` / `fallback` / `unrecognized`），文案不变。
- 断言在 `tests/live-turns.mjs`（在 live 夹具上注入扩展）和 `tests/adapters.test.cjs`、`tests/surfaces.test.cjs`。

## 已实现（#20，`1acfbc2`）

- 标题：非 Native Palette 下，User Turn 和 Assistant Turn 内的 h1–h4 继承所在消息正文的字体族，颜色用 `--op-fg`，字重按 700/650/600/600 排层级；字号保持宿主原值（两端原生已逐级递减）。规则在 `styles/hosts.css` 的 `v0.3.1 #20` 块，只按消息正文选择器（新旧标记）生效，不碰侧栏、宿主界面和扩展控件；扩展不新增阅读字体选项。浏览器测试 `tests/heading-typography.mjs`。

## 已实现（#19，`38bf145`）

- 两行输入框：只改宿主 grid 的列和 areas，不移动、不包装节点（ADR-0002）。适配器只在宿主 grid 的直接子节点用到全部约定的 area 名时才重排（ChatGPT `leading`/`primary`/`trailing`，Gemini `leading-actions`/`text-input`/`trailing-actions`），否则保留原生单行；ChatGPT 的卡片是带底色的 `[data-composer-layout]`。规则在 `styles/hosts.css` 的 `v0.3.1 #19` 块，浏览器测试 `tests/composer-two-row.mjs`。
- 评审修复（P1，`1db668e`）：ChatGPT 的 area 名是推断值（探针只看到 `36px | 输入 | 右侧按钮` 三列）。当 ChatGPT 网格的子节点都没有命名区域时，适配器按角色识别槽位（含添加按钮的为 leading、含编辑器的为 primary、编辑器之后唯一带控件的为 trailing），在这些现有子节点上加可逆的 `data-op-composer-leading` / `-primary` / `-trailing` 标记，由 CSS 命名区域；缺失或有歧义时保持原生单行。测试用不带 `grid-template-areas` 的位置式夹具变体。

## 已实现（#21，`1f4f378`）

- 宽度：standard 不覆盖，保持宿主原生宽度；full = 主区宽度 − 左侧安全边 20px − 给 Conversation Rail 留的右侧 56px；wide = (原生 + full) / 2，最多 1200px；视口不足 900px 时 wide 和 full 都回退为主区宽度减两侧各 16px。宽度指正文（段落）宽度；中点用每站点声明的原生正文宽度（ChatGPT 768px = 48rem，即 808px transcript 减去两侧 20px；Gemini 708px），不在运行时测量。`content.js` 只量主区宽度（Primary Surface），把结果写成根节点的 `--op-reading-width` 和 `--op-reading-shift`（列在容器内居中后向左平移，使全栏正文和输入框避开 Conversation Rail）。限宽选择器在 `src/adapters.js` 的 `contentWidth` 里按站点声明：ChatGPT 是 transcript 容器上的 `--thread-content-max-width`，以及 `#thread-bottom` 内带该变量的输入列；Gemini 是 `.md-content > *`、`user-query`、`.response-footer`、`hallucination-disclaimer`，输入区 `.input-area-container` 保持比正文窄 48px。运行时不做几何查找、不逐节点打标记。规则在 `styles/hosts.css` 的 `v0.3.1 #21` 块；User Turn 气泡在加宽和全栏下不超过 min(78%, 820px)。测试：`tests/content-width.test.cjs`、`tests/surfaces.test.cjs`、浏览器 `tests/live-width.mjs`。ChatGPT 夹具的输入列用同一个变量限宽是推断值（探针未测），线上输入列结构需人工验收。
- 评审修复（P3，`3dc7592`）：推断的输入列限宽元素缺失时，由互斥的 `:has()` 规则让探针确认的 `form[data-chatgpt-composer]` 直接跟随阅读宽度，不会双重限宽；测试用去掉该类名的夹具变体。评审修复（S5，`5215f60`）：限宽选择器归 `src/adapters.js` 所有，`hosts.css` 的宽度规则只是副本，由 `tests/content-width.test.cjs` 的静态守卫检查两者一致。评审修复（S2，`bc0b594`）：根变量按 `--op-ambient-alpha` 的方式保存并还原原始内联值与优先级，不留 `style=""`。Native Palette 下宽度预设照常生效（宽度是布局偏好，不是配色）。Gemini 的表格保持内在宽度、不超出阅读列，内容足够宽时增长到阅读列宽（P6，`08bc7d6`）。

## 已实现（#22，`79012d1`）

- Composer Scrim：在对话状态（非 Home State、非 Native Palette）下，scrim 宿主清除自身绘制并只获得层叠上下文；其 `::before` 在子节点之下绘制约 45% 画布色加 `backdrop-filter: blur(14px)`，顶部用 28px mask 羽化，不画实色底。光晕层的层级和遮罩不变，能从下方连续透出。不支持背景模糊时回退为最高 58% 画布色的渐变。Gemini 的 scrim 宿主就是 `input-container.input-gradient`，近黑色带被清除，布局不变。规则在 `styles/hosts.css` 的 `Blur Composer Scrim (v0.3.1 #22)` 段，浏览器测试 `tests/live-scrim.mjs`。已否决的方案：给滚动容器加 mask（会把 ChatGPT 的 sticky 输入框一起淡化）；在 scrim 里再复制一份光晕（会和背景错位）。
- 评审修复（P2，`53bea5e`）：Gemini 夹具的滚动区底部留白固定为 150px（推断值），#19 的两行输入框让 `input-container` 从约 170px 增高到约 238px，曾压住最后一条回复的操作栏。现在运行时识别覆盖在滚动容器上的停靠区，给该滚动容器加可逆标记 `data-op-thread-scroller`，把实测重叠量加 8px 写入根变量 `--op-dock-clearance`，CSS 在会话末尾追加同高的空 `::after`。默认设置下两站点的模糊与回退路径都断言操作行在输入框上方且可点中。线上 Gemini 是否动态调整留白尚未取证。
- Playwright 的 Firefox 报告支持 backdrop-filter，但截图里没有模糊；离线只能在 Chromium 中验证模糊的视觉效果。评审修复（P4，`1d86ced`）后两种引擎都断言 scrim 层计算出的 `backdrop-filter` 含 `blur(`。

## 已实现（来自 2026-11-22 的 grill，用户已确认）

- 测试断言用户能看到的结果：#18–#22 均已把断言迁到新夹具上。评审修复删除了与渲染检查重复的 `hosts.css` 源码正则断言，只保留声明与 CSS 的静态同步守卫（S1，`5215f60`）。

## 已实现（v0.4.0，#23–#27）

- **探针与基线夹具（#23，`f308560` / `274f1d3`）**：`tools/structure-probe.js` 新增 `::before`/`::after` 伪元素绘制与遮罩样式（`pseudos`）、无截断 `ancestorsOf` 链、`siblingsAfter` 及右下角浮件 `cornerFloats` 采集；`chatgpt-live.html` 与 `gemini-live.html` 同步流内底栏与 `.host-corner-help`，并新增 `PRISM_SUITE=live-baselines` 只运行原生基线与探针隐私断言。
- **双态 Composer Scrim 与底部留白治理（#25，`1f507b5` / `02d82fc` / `7226189` / `908930a`）**：`Adapters.isComposerDockOverlaid` 区分流内弹性底栏与叠层停靠区；流内底栏清除原生遮罩与背景且不绘制画布遮罩与模糊，折叠空占位兄弟节点并收紧声明与底栏间距；叠层底栏（Gemini 或粘性滚动区底栏）启用 `data-op-composer-scrim`，暗色 44% / 浅色 26% 模糊遮罩（无 `backdrop-filter` 回退 56% / 36% 渐变）并同步 `--op-dock-clearance`。`tests/live-scrim.mjs` 覆盖四套主题与两站点变体，并按浅色 26% 光学衰减公式校准无模糊截图方差上限。
- **双端输入框重塑、宽度桥接与左侧四芒星胶囊（#26，`37758e6` / `2a26620` / `7558a6d` / `1cd55fe`）**：`contentWidth` 声明与 `hosts.css` 桥接 ChatGPT `main`、`#thread-bottom-container`、`#thread-bottom` 及包装/直属表单，使其三档宽度与正文严格对齐；`Composer Surface` 收敛为单层 1px 描边与紧凑圆角，将两行网格设成 `auto minmax(0, 1fr)` 并以 `order: -10; margin-inline-end: auto` 把带四芒星的 `Model Capsule` 原位排到 `+` 右侧（ADR-0002 零节点重排），右侧渲染高对比墨曜主圆钮与幽灵次级按钮。`tests/live-width.mjs` 与 `tests/composer-two-row.mjs` 覆盖 1707/1280 视口、四套主题对比度及直属表单/位置式网格变体。
- **Bottom Dock 单例接管与零轮询避让（#27，`9834ae5` / `0a66954`）**：`src/content.js` 引入 `data-op-instance` 唯一所有权标记、`pruneOrphanRoots()` 孤儿清理与静默 `yieldOwnership()`（并确保重载接管后停用/原生配色/`stop()` 完全可逆、无残余标记与根变量）；`styles/hosts.css` 锁定 `#op-bottom-dock` 11px 胶囊字体与 `flex-shrink: 0`；`Adapters.findCornerFloatingObstacles`、`computeDockAvoidance` 与 `syncDockPopoverPosition` 在 scan/resize/scroll 时通过 `--op-dock-offset-x`/`-y` 与 `--op-vial-popover-shift-x` / `data-op-popover-side="below"` 自动避让角落浮件、输入框和 Conversation Rail。`tests/bottom-dock.mjs` 与单测覆盖跨实例接管、防挤压、3×3 零重叠与命中矩阵及完全卸载清理。

## 已实现（v0.4.1，#28–#31）

- **只读探针扩展与底栏变体夹具（#29）**：`tools/structure-probe.js` 扩展深层祖先链（ChatGPT depth 12 / Gemini depth 10，去除 `SAMPLE_LIMIT` 截断）、`contentFades`/`disclaimerShells` 的 `spec.limit` 采集、视口底部偏移（`viewportBottomOffset` / `bottomOffsets`）、`--sharp-edge-*`/`--composer-surface-primary`/`--main-surface-primary` 变量，以及 `viewTransitionName`、`*-placeholder-content` 与 CSS ID 脱敏；`tests/fixtures/chatgpt-live.html` 与 `tests/live-fixtures.mjs` (`applyChatGPTBottomVariants`) 提供 `.content-fade-container::after`、dock `::after`、`--sharp-edge-*` `box-shadow`、外层占位、`view-transition-name` 免责声明与粘性内置滚动变体夹具。
- **ChatGPT 纯透明底栏、安全 Alpha 淡出与策略解耦（#29 / #30）**：`styles/hosts.css` 无条件清除 `[data-op-composer-backdrop="true"]` 链与相邻免责声明壳上的 `--sharp-edge-*`、`box-shadow`、`::after` 与 `.content-fade` 遮罩（严格保护 `[role="dialog"]`、`[role="menu"]`、附件与 `Composer Surface`）；`src/adapters.js` 通过 `usesOverlayScrim`（ChatGPT `false` / Gemini `true`）与 `usesScrollerAlphaFade`（ChatGPT `true` / Gemini `false`）统一声明宿主遮罩/淡出能力，使 `src/content.js` 无需按站点名分支；ChatGPT 无论流内或叠层都不再挂载 `data-op-composer-scrim`，仅独立消息滚动容器（`Adapters.isIndependentMessageScroller`）挂载可逆 `data-op-scroller-fade`（`--op-scroller-fade-start` / `--op-scroller-fade-end`）以 Alpha 通道淡出正文，粘性内置滚动区跳过淡出并保留 `data-op-composer-overlaid` 与 `--op-dock-clearance`；Gemini 保持 `data-op-composer-scrim`（`--op-scrim-feather: 16px`、44%/26% 模糊与 56%/36% 回退）。
- **双端激活态 5px 贴底、空头行折叠与外层空壳/隐藏内容收敛（#28 / #31）**：`src/adapters.js` 收紧外层尾部兄弟判断，仅在 `dock` 内外至多 2 层祖先末尾可逆折叠纯空壳及"仅含隐藏文本/隐藏交互子节点但保留高度"的外层空壳（`hasVisibleText` / `hasVisibleInteractiveDescendant`，严格避让表单控件、`details`/`summary`、消息区、思考块与弹窗菜单），隐藏内层与外层显式/`view-transition-name`/负 `margin-top`/已标记免责声明壳（不再误隐藏外部非免责普通控件），并识别空网格头行（`data-op-composer-header-empty`）；`styles/hosts.css` 恢复粘性代码标题栏 `z-index: 5`，将 `[data-op-composer-overlaid="true"]` 设为 `z-index: 6 !important` 置于其上方，并把包括 `.composer-container`/`.composer-hint` 在内的双端 5px 贴底与占位折叠统一门控在 `[data-op-composer="true"]` 下。单测与双引擎 `live-fixtures` 验证 `composerRestyle: false`、原生配色、Home State 与停用零残留恢复（`未在真实登录会话验证`）。

## 已实现（v0.4.2，#36–#39）

- **设置界面独立主题与色卡修复（#37）**：`src/config-schema.js` 新增枚举 `uiThemeMode`（`auto` / `light` / `dark`，默认 `auto`）与 `resolveUiScheme` / `resolveUiPalette` / `applyUiThemeToRoot`，使设置弹窗和完整设置页的明暗解析与 Host Surface `themeMode`、光学配色及 `enabled` 开关彻底解耦（`host` 时安全回退到 `obsidian` / `crystal`）；`popup/popup.html`、`popup/popup.css`、`popup/popup.js` 与 `styles/prism-tokens.css` 补全文档/原生配色 `color-scheme` 声明与 `@media (prefers-color-scheme: light)` 预加载兜底，在顶栏新增 `#btn-ui-theme` 一键循环切换按钮、在外观「细节」卡片新增 `#cfg-uiThemeMode` 下拉框并双向同步，同时修复色卡点击（`handlePaletteCard` 通过 `previewSchemeOverride` 驱动预览而不覆盖 `themeMode`，且已选默认色卡同样响应）。Node 单测与双浏览器弹窗/选项页回归测试通过。
- **只读探针扩展与双端 User Turn / 输入区宽度治理（#38）**：`tools/structure-probe.js` 新增双端 `userBubbleAncestors`（depth 8）、Gemini `userQueryText` 与 `inputAreaChildren` 以及 `--bard-chat-window-content-width` 变量采集（保持零正文、不入发布包）；`src/adapters.js`（新增 `contentWidth.userTurnTargets` 并扩展 `targets`/`composerTargets`）与 `styles/hosts.css` 桥接 Gemini `chat-window` 变量、ChatGPT `main`/`transcriptContent`/User Turn 包裹链上的 `--user-chat-width`，解开双端多层 User Turn 包裹与内层文本限宽以及输入区外/内层包装壳限宽，去除旧 `820px` 硬顶，使长提问按 `calc(var(--op-reading-width, ...) * 0.8)` 随 `standard < wide < full` 等比正向递增，短提问保持 `fit-content` 紧凑贴右，Composer Surface 与阅读列同步加宽并避让 Conversation Rail。`tests/live-width.mjs` 在长/短双提问夹具与 `applyGeminiNestedNativeCap` / `applyChatGPTNestedNativeCap` 多层原生限宽变体、Native Palette、`<900px` 窄视口及零残留停用还原上通过（`未在真实登录会话验证`）。

## 2026-11-24 线上实测（v0.4.2 生效；spec [#40](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/40)，tickets #41–#43）

来源：已登录 ChatGPT 对话页，`dist/chrome` 解包加载 v0.4.2，深色 Obsidian 配色，ego-browser 临时只读脚本（只取结构、几何、计算样式，不读正文；不是仓库里的 `tools/structure-probe.js`）。宿主构建 `data-build=361f1c56…`，外观预设 `codex`。

### 实测事实

- **底栏黑带的绘制者**：会话滚动容器（`.thread-scroll-container`）的一个绝对定位直接子节点（`z-index: 20`，`anchor-scope: --thread-composer`）。它包着 `[data-thread-scroll-footer="true"]` → `[data-thread-composer-backdrop="true"]`（同时带 `data-pip-obstacle="thread-footer"`）→ `form[data-chatgpt-composer]`。这三层自身背景透明，底色由底栏的两个伪元素画出：
  - `::before`：输入框垂直中线到输入框底边，`linear-gradient(transparent → var(--color-surface))`；
  - `::after`：输入框底边到底栏底边，纯色 `var(--color-surface)`；
  - 两者 `inset-inline: var(--padding-toolbar)`（16px），用 CSS 锚点定位；规则只在 `:has([data-thread-composer-backdrop] [data-composer-body])` 时生效。`--color-surface` 线上为不透明 `#0e0e0e`。
- **扩展没有清掉的原因**：线上 `data-op-composer-backdrop` 标记数为 0。底栏识别最多向上走 14 层祖先；线上 `form` 到底栏 19 层，Composer Surface 卡片到底栏 25 层，编辑器到底栏 32 层，其中 13–15 层是 `display: contents` 的零尺寸包装。`#thread-bottom-container`、`#thread-bottom`、`content-fade` 等声明的选择器线上已全部不匹配。`data-op-scroller-fade` 线上同样为 0。
- **现场验证**：临时把这两个伪元素的 `background` 置为 `none`，黑带消失，光晕透到输入框两侧和下方，Composer Surface、Bottom Dock、Conversation Rail 不受影响。
- **侧栏激活态**：图标栏激活按钮是 `button[data-uniform][data-selected][aria-current="page"]`，36×36，宿主用 `::before` 画 10% 白色蒙层；扩展的行高亮（11% 强调色底 + 左侧 2px 边）叠在其上。会话激活行的 `aria-current="page"` 同时在整行 `div[role="group"]`（262×36，背景 `rgba(255,255,255,.1)`）和行内 `a`（243×20）上，扩展的 `data-op-sidebar-active` 落在行内 `a`，形成两层高亮。
- 宿主类名带哈希后缀（如 `footer-A8ZvKV`），不能作选择器；可依赖的是上述 `data-*` 标记和结构关系。

### spec #40 的方案（助手起草，用户 2026-11-24 确认"都按推荐走"；v0.4.3 已实现，见「已实现（v0.4.3，#40–#43）」）

- 版本取 `0.4.3`；spec 与 tickets 按已发布的内容和拆分执行。

- 底栏识别以 `[data-thread-scroll-footer="true"]`、`[data-thread-composer-backdrop="true"]` 为主，祖先遍历兜底且 `display: contents` 不计层数；只清绘制，不改定位，不新增遮罩或正文淡出。
- 激活高亮按形状分两种：图标瓷片（强调色填充 + 1px 内描边 + 强调色图标，无左边条）和整行单层高亮。
- 本次不加正文淡出（用户已确认）。清掉黑带后滚动中的正文会从输入框两侧经过，是否可接受留到 #43 线上复看时由所有者判断，不可接受则另开 issue。底栏是滚动容器的子节点，给滚动容器加遮罩会连输入框一起淡化。

### 取证方法备注

- ego-browser 截图前先执行 `Page.bringToFront`，否则 `Page.captureScreenshot` 会超时；需要固定视口时用 `Emulation.setDeviceMetricsOverride`，结束后清除。

## 已实现（v0.4.3，#40–#43）

- **ChatGPT 底栏黑带（#41，`fe20878` / `4906e2a` / `a8c57ac` / `9629a4a` / `142ab4d`，集成合并 `7e55286`）**：ChatGPT 适配器新增 `threadFooters`（`[data-thread-scroll-footer="true"]`、`[data-thread-composer-backdrop="true"]`），`findThreadFooter` 不设层数上限，取这两个标记加上滚动容器内直接包着它们的那一层（宿主把标记本身扁平化为滚动容器直接子节点时，该层就是标记本身）；无标记时以原有的有界祖先遍历兜底（小区域 / 底部 dock 启发式，14 层预算，`display: contents` 不计层数）。"标记或滚动容器的绝对/固定定位子节点"这一结构判断只用于让 Home State 的底栏保持原生、并阻止底栏成为 dock 宿主，本身不负责识别底栏。沿用 `data-op-composer-backdrop` 与现有清除规则，只清底栏及其 `::before`/`::after` 的绘制；底栏不作 dock 宿主，定位、`z-index`、锚点保持宿主原样；Home State（滚动容器内无消息）不标记。探针新增 `composerFooter`（表单 / 卡片 / 编辑器到绘制底栏的层数、不生成盒的层数、两个标记的位置、伪元素绘制与锚点属性）。夹具变体 `applyChatGPTThreadFooter` 复现 21 层（18 层 `display: contents`）与不透明 `#0e0e0e` 伪元素黑带；底栏下方 16px 内边距与 `[data-composer-body]` 所在节点为推断值。
- **侧栏激活高亮（#42，`4511d14` / `7e8b9ac` / `92a4e32` / `de2d85f` / `b66350d`，集成合并 `bd526dd`）**：`Adapters.sidebarActiveTargets` 返回 `{ element, shape }`；接近正方形、最长边 ≤ 64px、无可见文字的按钮为图标瓷片（几何优先，`data-uniform` 只放宽比例容差），其余为行；宿主在整行与行内链接重复激活态时，取带激活态、高度 ≤ 96px、只含一个且垂直居中链接的最外层行。瓷片打 `data-op-sidebar-active-tile`。浅色配色的图标墨色、行左边线与焦点环取 75% 强调色混前景色（`--op-sidebar-active-ink`），以保证不低于 3:1，属有意偏离纯强调色。
- **版本与文档（#43，`106af55` 等）**：三处版本号为 `0.4.3`；架构、测试、README、修改记录与本笔记同步。
- 以上均在离线 live 夹具上双引擎验证。2026-11-24 所有者在已登录 ChatGPT 对话页加载 v0.4.3 `dist/chrome` 复看：黑带消失，图标瓷片与整行高亮符合设计，滚动正文从输入框两侧经过可以接受（详见 `docs/TESTING.md` 的 v0.4.3 记录）。
- 本次取证推翻的旧结论：v0.4.1 的"ChatGPT 独立消息滚动容器挂 `data-op-scroller-fade` 淡出正文"在线上未生效（标记数 0），且现在底栏是滚动容器的子节点，不能再用滚动容器遮罩；v0.4.3 有意不加正文淡出，清掉黑带后正文会从输入框两侧经过。

## 2026-11-24 线上实测续（v0.4.3 生效；spec [#44](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/44)，tickets #45–#48，待实现）

来源：已登录 ChatGPT 与 Gemini 会话，`dist/chrome` 解包加载 v0.4.3，ego-browser 临时只读探针（1213×904，DPR 1.5，只取结构、几何与计算样式，未读正文），结合用户深色实机截图与 `ref/obsidian-prism` 原版样式对照。

### 实测事实

- **Gemini 底栏两侧暗色矩形框的来源**：线上底部停靠容器为 `input-container.hide-on-print.input-gradient.input-gradient-overlay.edge-to-edge.lm-input-redesign.grow-input-downwards`（`position: absolute; bottom: 0; padding: 8px 16px 0`，宽 `925.3px` 铺满整个 `chat-window`），内部居中的 `.input-area-container` 宽仅 `660px`。暗框并非宿主残留绘制，而是扩展挂在全宽 `input-container` 上的 `data-op-composer-scrim="true"`：其 `::before` 铺满全宽绘制 `44%` 画布色（浅色 `26%`）加 `backdrop-filter: blur(14px)`，且 `mask-image` 仅做顶边 `16px` 单向纵向羽化、左右无裁剪，在深色极光背景上将 `.input-area-container` 左右两翼压暗成高约 `106–136px` 的矩形暗带（左侧翼区平均 RGB `[16.9, 20.5, 29.6]`，正上方 `[18.3, 23.8, 35.8]`）。
- **ChatGPT 输入框下方 `72px`（1.5x 物理像素约 `89–108px`）空白的三重叠加根因**：视口高 `904px` 时，`ComposerLayoutRoot`（`[data-op-composer-surface="true"]`）底边在 `y=832px`（`vpBottomGap: 72px`）：
  1. 外层两个非滚动弹性布局壳（`div.@container/app-shell-main-content...[--thread-content-top-inset:...]` 与内层 `div.[--thread-content-responsive-max-width:...]`，以及更内层的 `div.group/thread-scroll-layout.[--thread-content-x:initial]`）因 Tailwind 自定义属性类名包含子串 `thread-content`，被 `src/adapters.js` 的 `threadColumns`（`[class*="thread-content"]`）误标 `data-op-thread-column="true"` 并各注入 `padding-bottom: 24px !important`，最外两层合计 `48px` 直接把整个滚动容器与绝对定位底栏顶高到 `y=856px`；
  2. `[data-thread-scroll-footer="true"]` 带有 `after:block after:h-(--thread-composer-bottom-inset)`（`::after` 静态块高 `24px`），把 `[data-thread-composer-backdrop="true"]`（宽 `808px`，左右内边距 `20px`，带 `[--thread-content-max-width:var(--thread-content-responsive-max-width,inherit)]` 与 `[--thread-body-max-width:...]`）及输入框底边再推高 `24px` 至 `y=832px`；
  3. v0.4.3 中 `findComposerScrim` 遇到 `Thread Footer` 直接返回 `null`，导致 `dockHost === null`，整条 `data-op-composer-dock` 贴底、空兄弟折叠与底栏内免责声明扫描链路被跳过。
- **ChatGPT 线上输入框计算样式与按钮细节**：`ComposerLayoutRoot` 计算出的 `border` 为 `0px none`（宿主规则压过了扩展描边颜色或重置了边框宽度），且残留宿主 `backdrop-filter: blur(12px)`；空输入状态下最右侧按钮为开始语音按钮（`[data-composer-voice-start="true"]`），被扩展 `findComposerPrimaryAction` 回退命中并染成 `30×30` 实心圆钮。
- **原版 `ref/obsidian-prism` 生产输入框基线**：生产样式 `ref/obsidian-prism/style.css` 对对话区底部渐变层与滚动遮罩全部清零（纯透明底栏，无全宽模糊带）；输入框卡片圆角为 `sharp: 6px / balanced: 10px / soft: 14px`，采用高不透明实底（`backdrop-filter: none`）+ `172°` 顶面微漫反光 + 低对比度 `1px` 物理描边 + 顶缘 `inset 0 1px 0` 镜面高光 + 分层投影，静态无宽幅紫青外发光雾，棱镜流光为 `1px` 贴边光谱细边；单行编辑区 `min-height: 40px`、卡片 `gap: 6px`；`+` 与模型胶囊同为 `28px` 中性微凸药丸（仅左侧星芒与档位后缀着色）；语音与麦克风为 `28×28` 透明幽灵圆钮，仅发送与停止按钮为 `30×30` 高对比实心圆钮。

### spec #44 的方案（2026-11-24 用户确认“都按照推荐来”；待实现，尚未合入代码）

- **协议状态（已确认规划，未实现）**：
  1. **双端统一纯透明底栏**：Gemini 关闭叠层模糊遮罩（取消 `44%/26%` 画布染色与 `backdrop-filter: blur`），只清 `input-container` 及其伪元素的原生绘制，保留叠层停靠区的 `--op-dock-clearance` 末尾留白确保最后一条回复及 `message-actions` 可完整滚出并点击。
  2. **对齐原版光学 `Composer Surface` 与控件分级**：圆角取 `sharp: 6px / balanced: 12px / soft: 16px`；清除宿主 `backdrop-filter`，强制四边 `1px` 实线低对比物理描边 + 顶缘内高光 + `172°` 漫反光实底；移除常态 `30px` 外雾与聚焦 `3px` 外环，`composerGlow` 改为悬停/聚焦态纯 CSS `1px` 贴边光谱细边（不加 Canvas 节点，遵守 ADR-0002）；单行编辑区最小高度拉升至约 `38–40px`；`+` 与 `Model Capsule` 改为中性微凸药丸（保留四芒星与档位后缀强调色）；`30×30` 实心主操作圆钮仅匹配真正的发送与停止按钮，语音开始按钮与麦克风归为透明幽灵图标。
  3. **收紧 ChatGPT 底部留白并桥接新底栏宽度**：`threadColumns` 排除含 `--thread-content-*` 自定义属性类名的外层非滚动应用壳（消除 `48px` 悬空）；对话态且开启重塑时收敛 `Thread Footer` 内部 `--thread-composer-bottom-inset` / `::after` 占位并恢复底栏内免责声明隐藏与空兄弟折叠，使输入框距视口底边落在 `6–8px`；把 `[data-thread-composer-backdrop="true"]` 补入 `contentWidth.composerTargets`；目标版本 `0.4.4`。

## 仍是推断值或未在线上验证

- 2026-11-24 实测已确认（替代旧推断）：ChatGPT `#thread-bottom-container` / `#thread-bottom` 已下线，当前线上输入列限宽落在 `[data-thread-composer-backdrop="true"]`（承载 `--thread-content-max-width` 与 `--thread-body-max-width`）；外层应用壳含 `[--thread-content-*]` Tailwind 变量类名；`[data-thread-scroll-footer="true"]::after` 提供 `24px` `--thread-composer-bottom-inset`；Gemini 底部停靠层为全宽 `input-container.input-gradient.input-gradient-overlay.edge-to-edge` 包裹 `660px` `.input-area-container`。
- 仍是推断选择器与数值：ChatGPT 嵌套用户气泡外/内限宽包裹层（`userTurnTargets` 覆盖链）、ChatGPT 两行输入框的 area 名 `leading`/`primary`/`trailing`（有结构槽位兜底）、输入框附件头行、h1/h4、线上真实角落浮件形态（`cornerFloatingObstacles`）；Gemini 网格列宽、`.response-footer` 宽度、h1/h4、User Turn 中间包裹容器链、滚动区底部留白数值及是否动态调白。
- 未在线上验证：仓库内的 `tools/structure-probe.js` 本身仍未直接在真实登录页面运行（2026-11-24 两轮事实均来自临时只读脚本）；v0.4.4 方案待编码实现并在离线夹具与真实登录会话上复看验收。
