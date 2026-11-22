# Obsidian Prism Web：Chrome / Firefox 移植规划

日期：2026-11-21  
目标：[bahayonghang/obsidian-prism-chrome-plugin](https://github.com/bahayonghang/obsidian-prism-chrome-plugin)  
上游：[RMvdesi/obsidian-prism](https://github.com/RMvdesi/obsidian-prism)，核查提交 `5dac53bfa7cf917d40101dad2579f32dd1b1b587`，版本 `1.0.7-beta.1`。

## 目标与可行性

将 Prism 的视觉设计与适合网页的工作台功能移植为标准 Manifest V3 扩展，服务于 ChatGPT 和 Gemini 网页。使用一套业务代码、分别生成 Chrome 与 Firefox 清单。通过隔离的 content scripts、扩展 storage、Popup / Options 和按需后台网络请求完成；不需要 CDP、本地 Sidecar 或 IDE。

用户提供的两个 ZIP 是同一原型的源码版/打包版，可借鉴色板、图标和交互方向；不是已验收成品。参考计划中的上游版本、兼容范围、完成勾选、零闪白、<10ms 同步、512K 实际上下文等表述需要修订。当前实现基线保留上游 GPL-3.0-only 许可证及完整声明，明确独立社区移植。

## 功能取舍

| 功能 | 本期处理 | 验收边界 |
| --- | --- | --- |
| Obsidian / Warm / Crystal / Alabaster，Host 原生融合 | 保留 | 四套色板、深浅模式、原生模式有完整扩展组件颜色 |
| Follow / Cobalt / Iris / Amber / Mono 强调色 | 保留 | Follow 是本移植版的站点强调色选择，不称上游完全一致 |
| 圆角、代码本地字体与连字、环境光、紧凑侧栏 | 保留 | 字体缺失可回退；不远程下载字体 |
| Popup + 全页设置，中英双语，Ultra / Focus / Eco，JSON 备份 | 保留并重写 | 严格配置校验、后台串行保存、跨标签更新、失败可见、备份不含密钥 |
| ChatGPT / Gemini 独立开关 | 保留 | 全局/站点关闭及时移除扩展 UI 与样式状态，再开启可恢复 |
| 代码块工具栏、48 行长代码手动折叠 | 适配 | 不替换宿主文本；保留复制按钮，支持动态增长与真正的滚动容器 |
| 会话大纲、搜索、Alt+↑/↓ 跳转 | 适配 | 去重 Gemini 嵌套消息；按钮/搜索支持键盘；编辑输入时不抢快捷键 |
| 像素蟹 / 紫猫 / 小队，拖动与点击互动 | 保留 | 可关闭；尊重减少动态效果；不持续计时轮询 |
| 流式高亮、环境光与回复状态余晖 | 渐进增强 | 只观察回复区域；排除自身 DOM；缺少 Highlight API 时正常回退 |
| 当前页面上下文估算 | 降级保留 | 仅估算已加载文本；不是模型真实窗口、额度或隐藏上下文；代码是总量子集 |
| 可见思考文字翻译 | 可选保留，默认关闭 | 用户配置兼容端点、主动授权与点击后才发送；后台请求，拒绝任意 URL 与跳转；无内置免费翻译接口 |
| 悬浮模拟输入光标 | 不移植 | 保留原生输入光标，避免中文输入法/选择/光标冲突 |
| CDP、Sidecar、文件网关、IDE 模型滑块、桌面配额/路径等 | 不移植 | 不属于网页主题扩展范围 |

## 必须修复的参考原型问题

1. 不得把完整配置或 API Key 写入 ChatGPT/Gemini 的 localStorage。公开配置与密钥分开，内容脚本不读取密钥。
2. 区分 Chrome 回调 API 与 Firefox Promise API，保存失败不能伪装为成功。
3. MutationObserver 必须忽略扩展自身节点，渲染幂等，空闲不反复扫描。
4. 配置保存由后台串行处理补丁，避免多窗口或快速操作丢失更新。
5. 每项增强具备可重复创建、更新、销毁的生命周期；关闭后撤销本扩展所作改变。
6. 翻译请求由后台执行，仅使用设置中经验证且已授权的端点；默认不传输会话文字。
7. CSS 和功能开关都尊重 prefers-reduced-motion，并避免改动网页原有消息结构。

## 架构与交付

- `src/config-schema.js`：类型/范围校验、预设、中英字典、WebExtension API 适配与公开配置。
- `src/background.js`：串行配置更新、独立密钥、翻译端点与权限检查。
- `src/early-boot.js`：document_start 尽早读取配置，不承诺同步存储或绝对零闪白。
- `src/adapters.js`：分站点消息/思考/代码/滚动容器适配，集中维护选择器。
- `src/content.js`：各功能的可逆生命周期、受限观察与事件驱动更新。
- `styles/`：色板变量与有范围约束的宿主样式。
- `popup/`：双语响应式设置和实时预览。
- `manifest.json` / `manifests/firefox.json`：Chrome worker / Firefox background scripts，限定三站点自动运行。
- `scripts/`：可重复构建、静态校验、双端 ZIP 和 SHA-256。
- `tests/`：真实浏览器 API 差异、权限、存储和 DOM 生命周期回归；本地离线网页夹具。
- `docs/`：规划、架构、验收记录、已知边界。
- CI：仅 pull_request 与 workflow_dispatch 触发。

本期目标基线为 Chrome 111+ / Firefox 140+。Firefox 包未签名，只用于临时加载测试；商店上架与签名不属于本次仓库实现交付。

## 实施清单

- [x] 克隆目标空仓库；解压并审计两个参考包。
- [x] 核查最新上游、许可证、浏览器官方资料；确定功能边界。
- [x] 创建并记录本 Issue（#1）。
- [x] 重写设置、存储与可选翻译后台；完成设置 UI。
- [x] 实现主题、双站点适配、代码折叠、大纲、估算、伙伴和可选光效。
- [x] 添加权限/存储/生命周期回归测试，构建双浏览器包。
- [x] 记录实际验证结果与无法覆盖的真实登录态场景。
- [ ] 提交并推送实现，回填提交与验证证据后关闭 Issue。

## 验证标准

- Chrome 回调和 Firefox Promise 存储路径都通过；无未处理异常或假成功。
- 无网站存储密钥；导出不含密钥；未知/危险导入键被拒绝或忽略。
- 默认运行无远程请求；翻译需已授权、正确来源且用户主动触发；纯文本渲染译文。
- 开关反复切换无残留/重复，Gemini 消息不重复计数，折叠控件可键盘操作。
- 宿主文字不插入逐字包装，不修改 React/Angular 管理的正文；SPA 更换会话可恢复。
- 动效关闭、系统减少动态效果与后台标签页可暂停装饰。
- 清单、所有脚本语法、许可证与包内容校验通过。
- 浏览器测试与真实网站测试分开报告；当前环境如不能启动浏览器，明确记录限制，保留可复现的测试脚本。

## 主要来源

- [上游固定提交 README](https://github.com/RMvdesi/obsidian-prism/blob/5dac53bfa7cf917d40101dad2579f32dd1b1b587/README.md)
- [上游 NOTICE](https://github.com/RMvdesi/obsidian-prism/blob/5dac53bfa7cf917d40101dad2579f32dd1b1b587/NOTICE)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome 跨域请求](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Firefox background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Firefox 数据传输许可](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Firefox 签名与分发](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
