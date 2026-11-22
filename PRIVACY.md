# Privacy / 隐私说明

Applies to Obsidian Prism Web Community Edition 0.1.0. Updated 2026-11-21.

## 默认行为

主题、设置、会话大纲、代码折叠、像素伙伴和文字量估算在浏览器本地运行。扩展没有分析统计、广告SDK、开发者遥测或内置翻译代理，不会把聊天内容上传到项目维护者的服务器。

它只在以下网页注入内容脚本：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://gemini.google.com/*`

扩展读取这些页面已经呈现的DOM，以识别提问、回复、代码和可见思考文字。不读取浏览器历史或Cookie，不索取网站账号密码，不获取模型隐藏推理，不调用ChatGPT/Gemini的私有会话接口。

## 本地保存什么

外观与功能偏好保存在浏览器的扩展本地存储中，用于刷新页面和重启浏览器后恢复设置。翻译API密钥单独保存于扩展本地存储，不放入网页的 `localStorage`、DOM、导出的配置或仓库。扩展本地存储不等于操作系统密钥保险箱；能够访问你浏览器配置文件的人仍可能读取其中数据。

会话大纲和估算从当前页面即时生成，不构建聊天历史数据库。导出配置只包含经过校验的设置，不导出API密钥或对话文字。导入配置不应自动授予网络权限；目标服务仍需用户明确授权。

## 可选翻译如何发送数据

翻译默认关闭，只有在你配置服务、授权权限并点击翻译时才发送请求。请求内容包含你选择翻译的**页面可见文字**、目标语言/翻译指令和模型标识；如果提供了API密钥，会把它用于该服务的认证。

接收方是**你在设置中指定的服务提供者**。该服务能看到请求来源IP，并可能记录或收费；这些行为由其隐私政策和合同决定。项目不内置免费第三方翻译地址，也不自动提供或购买API额度。

允许HTTPS地址，以及明确指定的本机HTTP服务（`localhost`、`127.0.0.1`）。可选的宽域名声明只是为了允许你选择服务；扩展在使用时只请求所选服务的协议与主机名访问权限，不自动获得所有HTTPS网站权限。浏览器的主机权限不区分端口，因此会涵盖该主机的所有端口；扩展自身仍只向你保存的完整地址（包含端口和路径）发送请求。请求在扩展后台执行，不由宿主网页处理密钥。

Firefox清单把 `websiteContent`、`personalCommunications` 和 `authenticationInfo` 声明为**可选**数据类型，用于分别覆盖待翻译文本、其中可能包含的聊天内容，以及可选API认证信息。核心功能的必需数据声明为 `none`。

你可以关闭翻译、清除保存的密钥，并在浏览器扩展权限界面撤销服务访问权限。关闭翻译不会撤回服务已经接收的数据；应联系对应服务处理已发送的内容。

## 如何删除

恢复默认设置可重置偏好；密钥使用设置页的清除操作处理。卸载扩展通常删除其本地存储。Firefox临时加载可能保留测试存储，必要时在扩展调试工具中清理，参见 [Mozilla临时安装文档](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)。

问题反馈请使用[项目Issues](https://github.com/bahayonghang/obsidian-prism-chrome-plugin/issues)。请勿在公开Issue中附带API密钥、私人对话或账号凭据。

## English

The core extension runs locally on ChatGPT and Gemini pages. It has no analytics, advertising SDK, developer telemetry or bundled translation proxy. Settings are stored in browser extension local storage. Outlines and token estimates use text already loaded in the page; the extension does not retrieve hidden model reasoning, private account telemetry, cookies or browser history.

Translation is optional and disabled by default. After explicit configuration, origin/data permission and a manual translation action, selected visible text, the target language/instructions, model identifier and any supplied API credential are sent to the endpoint you configured. That provider can observe your IP and may retain requests or charge fees under its own terms. Core features send no conversation data to the maintainer.

Credentials are separated from ordinary preferences, are never mirrored into host-page storage, and are excluded from configuration exports. Local extension storage is not an encrypted operating-system credential vault. Clear credentials in settings and revoke optional permissions in the browser when no longer needed.

For data types and exact access scopes, see the packaged manifest. Firefox declares no required collection and optional website content, personal communications and authentication information for manual translation.
