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

## 已实现（#17）

- 先取证：只读结构探针在 `tools/structure-probe.js`（开发工具，不进发布包；运行方法和隐私约束见 `tests/README.md`）。按本页事实生成的匿名夹具是 `tests/fixtures/chatgpt-live.html` 和 `tests/fixtures/gemini-live.html`；`tests/live-fixtures.mjs` 在不加载扩展的情况下断言原生基线，测量辅助函数在 `tests/measure.mjs`。本页事实之外的夹具数值（ChatGPT h1/h4、输入框附件行、Gemini h1/h4 等）是推断值，已在夹具 CSS 中标注。

## 已约定、尚未实现（来自 2026-11-22 的 grill，用户已确认）

- 测试断言用户能看到的结果：#18–#22 各自把断言迁到新夹具上。
- 宽度：standard 用宿主原生宽度；full 等于可用宽度减去安全边；wide 等于两者的中点，最多 1200px。限宽通过每个站点声明的选择器实现，**运行时不做几何查找、不逐节点打标记**（Gemini 是逐块限宽，逐节点打标记在流式输出时开销太大）。
- ChatGPT 容量：Pro / Thinking / High / xHigh 为 400K，Instant 为 128K；识别不了的标签按 128K 兜底，并显示 `?`。
- Composer Scrim：改成半透明画布色加背景模糊，不画实色底。已否决的方案：给滚动容器加 mask（会把 ChatGPT 的 sticky 输入框一起淡化）；在 scrim 里再复制一份光晕（会和背景错位）。
- 两行输入框：只改宿主 grid 的排布，不移动节点（ADR-0002）。
- 标题：跟随正文字体，并保证层级正确；扩展不新增阅读字体选项。
