# ChatGPT 首页输入框双层轮廓优化计划

**已保留 Prism 外卡，清除 ChatGPT 首页宿主内层的底色和内阴影。** 整块输入区共用一道轮廓，模型按钮保留自己的胶囊边界。基线为 `dev@d0343cc`（0.4.5），2026-11-28 完成实施与双页实机复核。

## 原因

2026-11-28 在 Ego Browser 的 ChatGPT 新对话首页复现了截图中的结构。桌面视口为 1707 × 909 CSS px，设备像素比为 1.5，使用深色 Obsidian 配色和 balanced 圆角。

| 元素 | 实测样式 | 对应的视觉现象 |
| --- | --- | --- |
| 外层 `[data-op-composer-surface="true"]` | 约 768 × 83 CSS px，圆角 12px，有渐变、实线边框、顶缘高光和投影 | Prism 的圆角矩形卡片 |
| 内层 `[data-composer-body][data-composer-layout]` | 约 743 × 64 CSS px，圆角 32px，底色 `rgba(20, 21, 26, 0.97)`，白色 20% 不透明度的 1px 模糊内阴影 | 底色盖住外卡渐变，内阴影沿胶囊边缘画出细线 |

[适配器](../src/adapters.js) 的 `findComposer` 在当前 DOM 中选中了包住编辑器和按钮的外壳，[运行时](../src/content.js) 给它加上卡片标记，[公共 CSS](../styles/common.css) 在该节点绘制外卡。ChatGPT 在更深一层的 body 上通过 `--composer-layout-surface-fill` 和 `--composer-layout-surface-shadow` 再绘制一次。同一页面的外壳、body 和输入槽都有 `data-composer-layout`，仅凭这个属性无法区分三者。

在同一首页临时移除内阴影后，底色仍在。再把 body 底色设为透明，卡片和 body 的尺寸、四个按钮的位置与大小、网格行定义均与对照一致。失焦时双层现象仍可复现，重新聚焦时外卡边色仍会变化。移除试验样式后原值恢复。

## 实施步骤

1. **先让回归测试捕获内层绘制。** [首页夹具](../tests/fixtures/chatgpt-home.html) 增加带原生填充和内阴影的 body，包裹编辑器和工具栏。[浏览器用例](../tests/browser-smoke.mjs) 分别读取外卡与 body，旧样式在首页透明底色断言处失败。[对话夹具](../tests/fixtures/chatgpt-live.html) 继续覆盖单层外卡。
2. **在 [ChatGPT 样式表](../styles/host-chatgpt.css) 加一条规则。** 以下选择器在实测首页恰好匹配一个节点。后代关系也保护了仅有一层卡片的布局。两条声明直接作用于 body 的绘制属性，保留其圆角与几何，也让子按钮继续使用宿主颜色变量。

   ```css
   html[data-op-enabled="true"][data-op-composer="true"][data-op-host="chatgpt"][data-op-home="true"]:not([data-op-effective-palette="host"])
     [data-op-composer-surface="true"] [data-composer-body][data-composer-layout] {
     background-color: transparent !important;
     box-shadow: none !important;
   }
   ```

3. **用设置切换验证可逆性。** 在首页夹具记录原生 body 的底色和阴影。开启重塑后断言 body 透明、阴影为 `none`，外卡仍有边框和渐变。分别关闭输入框重塑、切换原生配色、禁用扩展，确认恢复到记录值。复用[双行输入框测试](../tests/composer-two-row.mjs)的几何检查，确认编辑器、加号、模型按钮与右侧操作仍可用。

## 验收

2026-11-28 在 Ego Browser 重载本仓库构建的 `dist/chrome`，刷新同一首页与普通对话页，按原尺寸复核局部截图。截图仅含输入框。

| 实测页面 | 构建产物的结果 |
| --- | --- |
| 首页 | 1157 × 125 像素的前后截图中，差异只落在原胶囊范围内。body 底色透明、阴影为 `none`。外卡几何与四个按钮位置保持一致。空态、聚焦及输入两行均保留单层外观；聚焦时外卡边色变化，模型菜单在按钮旁约 4 CSS px 处展开，Esc 可收起。试验草稿已清空。 |
| 普通对话页 | 实测 `[data-composer-body]` 缺少首页的 `data-composer-layout` 属性，原本即透明且无阴影。重载前后 1157 × 138 像素的输入框局部逐像素相同。 |

首页截图：[修复前](evidence/chatgpt-composer/home-before.png) · [修复后](evidence/chatgpt-composer/home-after.png)。普通对话页截图：[修复前](evidence/chatgpt-composer/thread-before.png) · [修复后](evidence/chatgpt-composer/thread-after.png)。

- **真实首页**。在同一视口、配色和圆角下截取实施前后输入框局部。空态、聚焦、输入多行文字时，整块输入区应只见外层轮廓；聚焦边色可辨，模型胶囊与加号边缘清晰。展开模型菜单并收起，确认锚点正确。清空草稿即可完成验证。
- **页面边界**。用普通对话页与已有 Gemini 夹具复核现有外观。若未来在对话页也观察到第二道轮廓，先定位实际绘制节点，再决定是否放宽首页条件。
- **项目检查**。`just ci` 已通过，含 164 项单测和可复现打包。Chromium 首次无头运行在原生设置窗口尺寸检查处中止；按项目 CI 使用 `PRISM_ACTION_HEADED=1` 重跑 `just test-browser` 后全量通过，含实际扩展弹窗。Firefox 使用 `PRISM_BROWSER=firefox` 运行 `npm run test:browser`，全套夹具通过。两种引擎均验证内层透明、外卡绘制，以及切换原生配色、关闭输入框重塑和禁用扩展时的恢复。[仓库测试说明](../tests/README.md)
