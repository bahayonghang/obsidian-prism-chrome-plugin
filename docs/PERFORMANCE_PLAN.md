# Obsidian Prism Web — v0.4.5 性能诊断、优化方案与实测对比

> **优化目标版本**：`v0.4.5`（Spec `#49` / Tickets `#50`–`#54`）  
> **基准基线版本**：`v0.4.4`  
> **压测边界声明**：所有基准数据均在本地 Playwright Headless Chromium（`1440×900`）中运行 [`tests/perf-benchmark.mjs`](../tests/perf-benchmark.mjs)，基于离线探针重建夹具 `tests/fixtures/chatgpt-live.html` 与 `tests/fixtures/gemini-live.html` 的 **1× 基线**（4–6 轮，215–237 DOM 节点）与 **25× 合成长对话**（100–150 轮、150 个 `<pre>` 含 100 有效公式与 25 非法 LaTeX 块、2,903–3,765 宿主 DOM 节点、40 条侧栏链接）测得。上述结果不构成对真实已登录 ChatGPT / Gemini 线上会话的等效替代（**未在真实登录会话验证**）。  
> **架构硬约束**：严格遵守 [ADR-0001](adr/0001-local-dom-context-estimation.md)、[ADR-0002](adr/0002-in-place-reversible-composer-styling.md)、[ADR-0003](adr/0003-local-mathml-formula-preview.md)，维持 `permissions: ["storage"]`、`all_frames: false`、零 `web_accessible_resources`、零 `eval`/`new Function`/`innerHTML`、Chrome 111+ / Firefox 140+ 兼容与零残留可逆关闭。

---

## 1. 实测前后对比（Chromium 1× / 25× 离线基准）

### 1.1 25× 长对话核心门禁对比

| 指标（25× 长对话夹具） | ChatGPT `v0.4.4` | ChatGPT `v0.4.5` | Gemini `v0.4.4` | Gemini `v0.4.5` | v0.4.5 门禁阈值 |
|---|---:|---:|---:|---:|---|
| **冷启动初始化 `init`** | 8,985 ms（108 recalc） | **184.6 ms**（4 recalc，520 `gCS`） | 8,922 ms（109 recalc） | **200.4 ms**（4 recalc，781 `gCS`） | `<= 250 ms`（`recalcs <= 6`） |
| **稳态全量 `scan()`（含估算）** | 290.3 ms / 163,836 `gCS` | **11.8 ms** / **520 `gCS`** | 117.1 ms / 65,192 `gCS` | **13.2 ms** / **482 `gCS`** | `<= 15 ms`（`gCS <= 1,500`） |
| **稳态 `scan()`（不含估算）** | 300.6 ms / 160,036 `gCS` | **10.0 ms** / **520 `gCS`** | 115.5 ms / 64,392 `gCS` | **14.1 ms** / **482 `gCS`** | — |
| **稳态冗余属性写（`setAttr`/`rmAttr`）** | 557 / 225 | **0 / 0** | 457 / 125 | **0 / 0** | `0 / 0` |
| **单帧滚动主线程（`script+recalc+layout`）** | 11.76 ms JS（墙钟 24.0 ms，7,661 `gCS`，107 `gBCR`） | **0.77 ms**（JS 0.39 + Recalc 0.30 + Layout 0.08，**0 `gCS`**，**3 `gBCR`**） | 9.81 ms JS（墙钟 21.4 ms，7,365 `gCS`，107 `gBCR`） | **1.10 ms**（JS 0.66 + Recalc 0.32 + Layout 0.12，**0 `gCS`**，**11 `gBCR`**） | `<= 4 ms`（`gCS <= 50`） |
| **流式爆发（30 token / 900 ms + 250 ms 尾稳）** | 3,040 ms（JS 1,578 ms + Recalc 362 ms，811,580 `gCS`，580 `cloneNode`） | 发包 **943.9 ms** / 含尾稳 **1,233.9 ms**（JS **8.55 ms** + Recalc **69.66 ms**，**0 `gCS`**，**0 `cloneNode`**） | 1,930 ms（JS 598 ms + Recalc 239 ms，323,560 `gCS`，130 `cloneNode`） | 发包 **923.7 ms** / 含尾稳 **1,178.1 ms**（JS **9.87 ms** + Recalc **6.66 ms**，**0 `gCS`**，**0 `cloneNode`**） | 发包 `<= 1,100 ms`，含尾稳 `<= 1,350 ms`，主线程活跃 `<= 150 ms`，`cloneNode = 0`，`gCS <= 5,000` |
| **安装包体积（Chrome / Firefox ZIP）** | 289,057 B / 289,177 B（29 文件） | **263,325 B / 263,444 B**（32 文件，净减 ~8.9%） | — | — | 确定性双次构建 SHA-256 一致 |

> **口径透明声明**：
> 1. **冷启动 `init` 与长会话分块公式渲染**：当会话含 `> 12` 个合格公式块时，首帧同步渲染前 6 个 + 末尾 2 个（覆盖顶部与滚底视口），其余中段离屏公式按 16 块/批异步排空（`drainFormulaChunks`）；`tests/perf-benchmark.mjs --assert` 强制断言进入稳态 `scan()` 前全部 `100/100` 有效公式均已完整渲染并挂载（且 `scan()` / `scroll` / `stream` 均在 100 公式 / 14,025 MathML 节点全量在 DOM 状态下测得）。
> 2. **单帧滚动主线程预算**：`tests/perf-benchmark.mjs --assert` 对滚动帧校验完整主线程耗时 `scriptMs + recalcMs + layoutMs <= 4 ms`（而非仅 JS 耗时）。
> 3. **流式爆发时间口径**：`streamBurst` 由 `30 × setTimeout(30)`（900 ms 发包窗口，单独校验 `burstMs <= 1,100 ms`）+ `setTimeout(250)`（250 ms 尾稳同步，合并校验 `wallMs <= 1,350 ms`）驱动，同时校验活跃主线程 `scriptMs + recalcMs + layoutMs <= 150 ms`、`cloneNode === 0` 与 `gCS <= 5,000`。

### 1.2 1× 基线对话表现（`v0.4.5`）

| 场景 | ChatGPT 1× (6 轮，215 节点) | Gemini 1× (4 轮，237 节点) |
|---|---|---|
| 冷启动初始化 `init` | 95.1 ms（2 recalc，88 `gCS`） | 112.5 ms（2 recalc，109 `gCS`） |
| 稳态 `scan()`（含/不含估算） | 2.1 ms / 1.6 ms（88 `gCS`，0 写） | 2.7 ms / 2.6 ms（98 `gCS`，0 写） |
| 单帧滚动主线程（`script+recalc+layout`） | 0.72 ms（0 `gCS`，3 `gBCR`） | 0.94 ms（0 `gCS`，3 `gBCR`） |
| 流式爆发（900 ms 发包 / 主线程活跃） | 925.4 ms（JS 8.59 ms + Recalc 20.29 ms，0 `gCS`，0 `cloneNode`） | 925.6 ms（JS 9.01 ms + Recalc 6.71 ms，0 `gCS`，0 `cloneNode`） |

---

## 2. 根因归类与四阶段落地架构

### Phase 1（Ticket `#50`）：可复现基准门禁 + Formula Preview 批量与负缓存治理
- **根因**：`syncFormulas()` 同步逐块调用 `commitFormulaEntry()` 并立即调用 `syncCodes()` → `adapter.codeBlocks()` → `isVisible()` → `getComputedStyle()`，在 25× 场景形成 $O(N^2)$ 强制样式重算风暴（`7.6 s`）；无效 LaTeX 块失败后从 `formulas` 删除导致稳态每次 `scan()` 死循环重解析；`pruneOrphanRoots()` 与 `syncAmbientBounds()` / `syncDockAvoidance()` 在单次 `scan()` 重复执行；大量属性无条件覆写产生 457–557 次无效 `setAttribute`。
- **落地方案**：
  - 新增开发期基准脚本 `tests/perf-benchmark.mjs` 与 `npm run test:perf`（含 `--assert` 与 `--json`，不进入发布白名单）。
  - `commitFormulaEntry(entry, { syncFold = true, precomputed })` 支持批量初始化跳过逐块 `syncCodes()` 并复用预计算 `source`/`hint`；新增 `formulaSkipCache`（`WeakMap`）缓存非 LaTeX 与渲染失败块直至源码或语言提示变化；超过 12 个公式的长对话采用首尾优先同步（前 6 + 尾 2）+ 中段分块异步排空（`drainFormulaChunks`），并为前序长对话预览标记 `data-op-formula-deferred="true"`（启用 `content-visibility: auto`，末尾 2 个与短对话保持急切排版以避免滚底高度跳变）。
  - 新增幂等写助手 `setAttr()` / `removeAttr()`；合并 `pruneOrphanRoots()` 为按需单次执行并去重 `syncAmbientBounds()` / `syncDockAvoidance()`。

### Phase 2（Ticket `#51`）：消除滚动掉帧、扫描作用域缓存与读写分离
- **根因**：全局捕获 `scroll` 响应所有内层滚动并每帧调用全页 `findCornerFloatingObstacles()`（7,300+ `gCS`）与逐轮 `scrollContainer()` 遍历（107 `gBCR`）；单次 `scan()` 重复查询轮次 10–14×，`isVisible()` 无记忆化重复走祖先链，`findTurns`/`findCodeSurfaces`/`findCodeHeaders` 存在 $O(N^2)$ `.contains()`；读/写交错触发多次强制同步布局。
- **落地方案**：
  - `src/adapters.js` 新增 `adapter.withScanCache(fn)`，在单次扫描作用域内记忆化 `computedStyle`、`isVisible`、`scrollContainer`、显式轮次祖先集、`batchPres` 及各核心表面结果；`isVisible()` 采用 Chrome 105+ / Firefox 106+ 原生 `Element.prototype.checkVisibility()` 快路径，并在 `checkVisibility()` 对无盒子的 `display: contents` 元素返回 `false` 时自动回退到计算样式祖先链遍历。
  - 用 `filterOutermost()`、祖先集合查表、锚点双向 `findColumnSurfaces()`、`queryOutside()`（跳过 `primary`）、`getElementsByTagName('pre')` 与 `O(N)` `mergeSortedByDocumentOrder()` 消除 $O(N^2)$ 嵌套扫描与 14,025 MathML 节点全树误扫；`findCornerFloatingObstacles()` 与 `findComposerBelowSiblings()` 将廉价区域/滚动容器排除前置到 `isVisible()` 与 `querySelector(OVERLAY_EXCLUDED)` 之前。
  - `src/content.js` 滚动监听过滤侧栏/代码/公式/弹窗内部滚动，将 `syncDockAvoidance()` 与内层消息滚动解耦，`nearestTurn()` 复用缓存轮次与单次容器顶坐标并改用 $O(\log N)$ 二分查找，`updateRailActive()` 增加 `renderedActiveTurn` 守卫；新增 `codeHeaderSvgCache` 缓存代码头 SVG 描边/填充分类；`scan()` 重构为 Phase 1 纯读取 → Phase 2 纯 DOM/属性写入 → Phase 3 批量几何同步（`syncReadingWidth` 仅在宽度实际变化时先更新根变量再测量 `Bottom Dock` 避让，零稳态重排）；守卫 `ResizeObserver` 首次同尺寸冗余回调。

### Phase 3（Ticket `#52`）：流式零深拷贝文本提取、增量估算与分域 Observer
- **根因**：`textOf()` 与 `cleanTurnText()` 高频调用 `element.cloneNode(true)`（25× 流式期达 580 次整轮深拷贝）；`estimateTokens()` 逐字符执行 Unicode RegExp；`MutationObserver` 在 `document.body` 全子树无差别监听 `class` 与 `characterDataOldValue: true`，每 160 ms 触发全量 `scan()`；`paintHighlights()` 在回调内同步执行并每 55 ms 重建 64 个 `Range`。
- **落地方案**：
  - `textOf()` 与 `cleanTurnText()` 改为零克隆活 DOM 子树遍历（`collectLiveDomText` + `childElementCount === 0` 与 `data-op-owned` 快跳过，保留纯对象测试 DOM 兜底）；`estimateTokens()` 改为 `charCodeAt` BMP CJK 区间判断并正确步进 UTF-16 代理对。
  - 新增 `turnTokenCache`（`WeakMap`）+ `dirtyTurns`（`WeakSet`）实现 Context Vial 逐轮增量估算，以及 `railTurnTextCache` + `prevRailTurns` 缓存大纲标题文本。
  - `MutationObserver` 按 `cfg.streamChoreography && motionAllowed()` 动态开关 `characterDataOldValue`；`mutationsChanged()` 消除临时数组分配并按子系统分域打标（`surfaces`/`formulas`/`codes`/`rail`/`vial`/`thoughts`/`geometry`），纯正文流式输出直走 `vialOnly` 快路径且按 `260 ms` 合并、流式结束（`streamIdle`）补跑完整一致性同步；`paintHighlights()` 缓存已创建的 `Range` 并对齐 `requestAnimationFrame`（60 ms 分桶合并写入 `CSS.highlights`）。

### Phase 4（Ticket `#53`）：CSS 站点拆分与选择器瘦身、环境光减负、启动与 Popup 优化
- **根因**：98.8 KB 单体 `styles/hosts.css` 在双端全量解析；包含 `html:has([data-op-composer-overlaid="true"])` 根级 `:has()` 与通配 `*` 右端选择器；`#op-ambient-stage` 仅设 `contain: paint` 且构建 5,587 字符文本节点、在 `<html>` 上切换 `data-op-aura` 触发整页样式失效；`src/content.js` 未复用 `early-boot.js` 已发出的 `ObsidianPrismReady`；Popup 每次勾选配置都重走全页 `[data-i18n]` 与 `permissions.contains()`；未压缩 `vendor/temml/temml.js` 达 437 KB。
- **落地方案**：
  - 将 `styles/hosts.css` 拆分为 `styles/common.css`（共用规则）、`styles/host-chatgpt.css`（仅 ChatGPT 注入）与 `styles/host-gemini.css`（仅 Gemini 注入），双端清单改为 4 组 `content_scripts`（全部 `all_frames: false`、`permissions: ["storage"]`）。
  - 以可逆属性 `data-op-thread-overlaid="true"` 替换根级 `html:has(...)`；移除 Native Math Surface、`#op-ambient-stage *`、`[data-op-owned] *` 等通配 `*` 右端键选择器，收窄 13 分支代码语法高亮前缀。
  - `#op-ambient-stage` 升级为 `contain: strict`；`.op-ambient-glyphs` 改为内联 `data:image/svg+xml` CSS mask 瓦片（0 字符 DOM 节点）；`data-op-aura` 下沉至 `#op-ambient-stage`，并由 `data-op-ambient-active` 按需门控 `.op-aurora` 的 `will-change: transform`。
  - `src/content.js` 优先复用 `global.ObsidianPrismReady` 消除启动期重复 `storage.local.get` IPC；`popup/popup.js` 记忆化 `lastTranslatedLang`、仅在翻译页签或端点变更时调用 `checkPermission()` 并合并启动期 `OP_SECRETS_STATUS` 查询。
  - 将 `vendor/temml/temml.js`（436.9 KB）替换为同版本 `temml@0.14.0` 官方压缩产物 `vendor/temml/temml.min.js`（167.9 KB，-61.6%，仅对上游模板正则中 1 处原始 `U+FFFF` 非字符做运行时等价 `\uffff` ASCII 转义以通过 Chromium MV3 `base::IsStringUTF8` 加载校验，并在 `scripts/check.mjs` 新增 `assertChromeUtf8` 永久守卫，见 `THIRD_PARTY_NOTICES.md`）。

---

## 3. 验收与后续线上复看边界

- 本计划涉及的全部自动化门禁（`npm run check`、`npm test`、`node tests/perf-benchmark.mjs --assert`、有头 Chromium 全量套件、Firefox 全量套件与双次确定性打包 SHA-256 核验）记录见 [TESTING.md](TESTING.md)。
- 离线合成/探针夹具无法替代真实登录会话中的服务端流式帧率、账号实验布局或长对话内存曲线；真实 ChatGPT / Gemini 页面的手动复看项保持未勾选状态，待所有者在已登录环境实测确认。
