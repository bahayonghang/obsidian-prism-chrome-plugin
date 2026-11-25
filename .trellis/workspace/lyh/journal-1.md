# Journal - lyh (Part 1)

> AI development session journal
> Started: 2026-11-22

---



## Session 1: v0.3.1 线上回归分析：探针取证、spec 与 tickets
<!-- trellis-session: v=3 fp=e8d6085ab4478fbc -->

**Date**: 2026-11-22
**Task**: v0.3.1 线上回归分析：探针取证、spec 与 tickets
**Branch**: `dev`

### Summary

深入分析 Gemini/ChatGPT 宽度、Context Vial、黑色底栏、输入框、标题问题；用 ego-browser 只读探针核实线上 DOM；grill 两轮共 10 项决策（已约定未实现）；发布 spec #16 与 tickets #17-#22（含原生阻塞关系）。
Topics: [.trellis/research/live-host-dom.md](../../research/live-host-dom.md)

### Git Commits

(No associated commits)

### Next Steps

- 从 #17（探针与夹具）开始实施；#18/#19/#20 在 #17 后可并行，#21/#22 依赖 #18。


## Session 2: v0.4.3 线上取证：ChatGPT 底栏黑带根因与侧栏激活高亮，发布 spec #40 与 tickets #41-#43
<!-- trellis-session: v=3 fp=8007a7fb2a4c4b0e -->

**Date**: 2026-11-24
**Task**: v0.4.3 线上取证：ChatGPT 底栏黑带根因与侧栏激活高亮，发布 spec #40 与 tickets #41-#43
**Branch**: `dev`

### Summary

用 ego-browser 在已登录 ChatGPT（v0.4.2 生效）只读取证：黑带来自滚动容器内绝对定位底栏的 ::before/::after（锚点定位，不透明 --color-surface）；扩展识别最多走 14 层祖先，线上需 19-32 层且多为 display:contents，标记数为 0。侧栏激活态在图标按钮和会话行上各有两层高亮。发布 spec #40 与 tickets #41-#43（#43 被 #41、#42 阻塞）；方案为助手起草，未实现。
Topics: [.trellis/research/live-host-dom.md](../../research/live-host-dom.md)

### Git Commits

(No associated commits)

### Next Steps

- 从 #41 与 #42 开始实施（互不阻塞），#43 收口 0.4.3 基线并做线上复看


## Session 3: 用户确认 spec #40 方案：0.4.3、不加正文淡出、按已发布 tickets 执行
<!-- trellis-session: v=3 fp=fdc489b24a2bfde1 -->

**Date**: 2026-11-24
**Task**: 用户确认 spec #40 方案：0.4.3、不加正文淡出、按已发布 tickets 执行
**Branch**: `dev`

### Summary

用户确认按助手推荐执行：版本取 0.4.3；本次不加正文淡出，线上复看时再判断；spec #40 与 tickets #41-#43 按已发布内容执行。已约定，未实现。
Topics: [.trellis/research/live-host-dom.md](../../research/live-host-dom.md)

### Git Commits

(No associated commits)


## Session 4: v0.4.3 实施完成：spec #40 / #41–#43 合并到 dev 并关单
<!-- trellis-session: v=3 fp=87a6208b1349d711 -->

**Date**: 2026-11-24
**Task**: v0.4.3 实施完成：spec #40 / #41–#43 合并到 dev 并关单
**Branch**: `dev`

### Summary

按任务图实施 v0.4.3：#41 ChatGPT 底栏黑带（宿主标记为主、display: contents 不计层数、只清绘制）、#42 侧栏激活高亮（图标瓷片与整行单层）、#43 0.4.3 基线与文档；/code-review 双轴返修后全量验证通过（单测 146、有头 Chromium 59、Firefox 57、两次打包校验和一致），所有者线上复看：黑带消失、高亮符合设计、正文从输入框两侧经过可接受。dev 合并提交 fa33aa2，#40–#43 已关闭。复用：just ci 的私钥须作位置参数（just ci <key>），写 key=… 会被当成路径并生成新私钥。
Topics: [.trellis/research/live-host-dom.md](../../research/live-host-dom.md)

### Git Commits

| Hash | Message |
|------|---------|
| `fa33aa2` | merge(v043): 🔀 合并 feat/v043-spec-40（Spec #40 / #41–#43）至 dev |

### Next Steps

- 如需发布，按所有者授权推送 dev


## Session 5: v0.4.4 线上取证与原版对照：确认方案并发布 spec #44
<!-- trellis-session: v=3 fp=ee770081d1aff1e8 -->

**Date**: 2026-11-24
**Task**: v0.4.4 线上取证与原版对照：确认方案并发布 spec #44
**Branch**: `dev`

### Summary

ego-browser 线上实测定位 Gemini 底栏两侧黑框（扩展自身全宽 Composer Scrim 44% 画布染色+模糊无横向裁剪）与 ChatGPT 底部 72px 空白（threadColumns 误命中含 --thread-content-* 外层壳注入 48px + [data-thread-scroll-footer]::after 24px 且 Thread Footer 跳过了贴底与免责声明扫描），对照 ref/obsidian-prism 原版确认双端纯透明底栏、12px 紧凑光学卡片/1px 描边/去静态外雾、中性微凸胶囊与空态语音幽灵化方案，发布 Spec #44。
Topics: [.trellis/research/live-host-dom.md](../../research/live-host-dom.md)

### Git Commits

(No associated commits)
