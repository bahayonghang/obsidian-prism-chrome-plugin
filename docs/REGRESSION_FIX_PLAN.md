# v0.2.1 — 安装后回归修复计划

日期：2026-11-22（America/New_York）\
基线：`0fd95c79687b45403b517a2eea3750e2dc6e0589`（v0.2.0）

- [Issue #5：工具栏设置弹窗缩成空白小框](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/5)
- [Issue #6：对话底部白块与侧栏嵌套高亮](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues/6)

## 问题与证据

| 现象 | 已定位的结构问题 | v0.2.0 验证为何没有覆盖 |
|---|---|---|
| Chrome、Firefox 工具栏设置只出现小白框 | body 的固定尺寸同时受 `100vw`/`100vh` 限制，内部容器依赖百分比高度并隐藏溢出。浏览器先测内容、再给弹窗大小，初始小视口会反过来限制内容 | 普通标签页在测试中被强制设成 440×600，绕过了真实 action 弹窗的尺寸协商 |
| 对话底部出现大面积白块，首页正常 | 只给输入框本身标记主题，没有单独处理固定底栏外壳及其背景/渐变层；同时需要确认光场覆盖范围 | 离线底栏是单层透明容器，没有白底、内层遮罩或渐变伪元素 |
| 当前侧栏会话多出括号状弧线 | 同一选中项的外层、链接、内部文字可能都带状态属性，宽泛选择器重复绘制背景和左侧内阴影 | 原夹具只有单个选中链接，没有嵌套状态 |

截图能够证明视觉现象，但不能提供完整在线 DOM。实现采用已识别表面和有边界的结构判断，测试加入与反馈相应的结构特征，不宣称涵盖所有账号实验布局。用户截图和私人会话/项目名称不提交到仓库。

## 方案

### 工具栏弹窗

Action 弹窗使用不依赖当前视口的固有宽高，初次测量时无需等待脚本或存储读取即可撑开。完整设置页面单独启用响应式布局。保留内部滚动、固定导航、保存反馈和打开完整设置入口，不新增权限。

Chrome CI 从扩展调用 `action.openPopup()`，通过实际 popup view 检查自然尺寸、可见控件、设置保存与关闭再打开；不会通过 `setViewportSize()` 修正它。使用有窗口浏览器和 Xvfb。Firefox 先验证真实页面文件在小初始容器中的固有尺寸，并明确区分这一检查和原生 Firefox 扩展安装。

### 对话底栏与侧栏

输入框保持独立的不透明表面；仅移除确认是底栏背景的颜色/渐变，不遍历清空所有后代背景，不破坏附件、菜单、按钮或输入区。保留原生配色和关闭扩展后的恢复能力。

侧栏选中装饰归属于一个导航项，内部文字不再重复画边；原生语义状态、键盘焦点和操作按钮保留。

### 验证与交付

复杂离线对话结构覆盖固定底栏、嵌套背景、选中行和内部状态，并在浅深色、关闭/恢复、DOM 替换、首页与对话切换后检查实际样式和截图。测试必须证明原生输入框、附件及交互仍然存在。

## 验收清单

- [ ] 工具栏弹窗初次打开有正常内容尺寸，可保存并再次打开。
- [ ] 完整设置页面维持窄屏布局与滚动。
- [ ] 对话底栏无大面积原生白色遮罩；输入框及附件仍保留自身背景。
- [ ] 同一个侧栏会话只有一层选中装饰，内部文字没有额外弧线。
- [ ] 首页、原生配色、关闭扩展、页面替换与原生输入功能无退化。
- [ ] 静态检查、Node 测试、双浏览器检查与可重复打包通过。
- [ ] PR 合并，执行证据回填，Issue #5 / #6 关闭，交付 v0.2.1 两个安装包。

## 执行记录

实现与 CI 完成后回填。真实登录网站的账号专属布局、原生 Firefox 安装和真实操作系统输入法不由离线页面验证替代。

## 参考

- [Mozilla：popup resizing](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups)
- [Chrome：action.openPopup](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup)
- [Chrome：extension.getViews](https://developer.chrome.com/docs/extensions/reference/api/extension#method-getViews)
