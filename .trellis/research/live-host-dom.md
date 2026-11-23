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

## 仍是推断值或未在线上验证

- 推断选择器与数值：ChatGPT `#thread-bottom [class*="--thread-content-max-width"]` 与中间包装层/直属 `form[data-chatgpt-composer]` 结构、ChatGPT 两行输入框的 area 名 `leading`/`primary`/`trailing`（有结构槽位兜底）、输入框附件头行、h1/h4、线上真实角落浮件形态（`cornerFloatingObstacles`）；Gemini 网格列宽、`.response-footer` 宽度、h1/h4、滚动区 150px 底部留白及是否动态调白。
- 未在线上验证：仓库内含 v0.4.0 扩展的 `tools/structure-probe.js` 尚未在真实登录页面上运行，需所有者授权后人工执行；本页实测事实仍来自 2026-11-22 更早一次只读探针，所有 v0.4.0 浏览器验证均运行于离线探针夹具（`未在真实登录会话验证`），线上 ChatGPT 输入列结构、A/B 底栏模式、两行输入框真实网格及角落浮件避让仍需登录实测验收。
