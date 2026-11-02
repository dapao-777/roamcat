# Chrome Web Store Listing — RoamCat · 随心阅

> Last Updated: 2026-11-01（补全版本历史，更正商店图标大小与截图文件名；隐私政策补充了远程领域识别与 Jev 的数据流，第三方许可声明补入 pdf.js / fflate / Silkscreen；此前对照当前 Manifest 与 Chrome 官方文档校正了商店 ZIP 结构、必需图片、全站权限、听写音频披露及发布门禁状态，此前修复见版本历史）
> 本文是上架 Chrome Web Store / Microsoft Edge Add-ons 的单一事实源：商店文案、权限理由、隐私披露、版本历史。
> 提交前请逐项核对文末「提交前检查单」。本文保存在 `roamcat-0.0.1/`，不在 Release ZIP 的打包白名单内。

## 当前上架准备状态

本次为源码与材料核对，没有运行本轮完整门禁、生成商店安装包、登录开发者后台或提交审核。当前源码版本为 **0.7.2**，已经采用 Manifest V3；首次上架可使用此版本，不需要为了上架改成 1.0。

| 项目 | 当前状态与待办 |
|------|----------------|
| 开发者账号 | 需在 Chrome Web Store 开发者后台注册并支付一次性注册费，启用 Google 两步验证，填写发布者名称并验证联系邮箱；费用与其他账号核验以后台为准。 |
| 商店 ZIP | **现有 `tools/package-release.mjs` 产物是 GitHub Release 安装包，不能直接上传商店。** 它带有 `roamcat-<版本>/extension/` 外层目录及连接器。商店 ZIP 必须以扩展文件为根，直接包含 `manifest.json`、`background.js`、`ui/` 等；连接器继续单独提供下载。 |
| 商店素材 | 128×128 PNG 图标已有；至少 1 张 1280×800 或 640×400 实际界面截图、**440×280 小宣传图均为必需**，现有候选截图须重新核对版本与尺寸。 |
| 权限披露 | 当前 Manifest 使用必需的 `http://*/*` 与 `https://*/*`，**没有 `optional_host_permissions`**。网站规则是功能开关，不能描述成浏览器已限制访问范围的可选权限。保留全站权限时须说明任意网站阅读、自动开启、伴读猫和用户自定义模型端点的需要；如改为按站授权，必须另行修改并验证实现。 |
| 隐私披露 | 已有公开隐私政策。发送页面/文档文本、字幕、公开聊天和手动听写音频均应如实披露；本机处理邮箱、API Key 与可选阅读活动也不能仅以“无自有服务器”为由忽略。提交前还需核对 API Key 的本机明文保存方式与官方安全处理要求，不能把本次文档核对视为安全审核通过。 |
| 连接器 | 新建商店条目后，从后台取得正式扩展 ID；用 `node roamcat-0.0.1/connector/install.mjs --extension-id <商店ID>` 注册连接器，验证 Native Messaging 和常驻服务。不能默认沿用开发 ID `afpeggkplomdjjiemgajjgcajieincng`。 |
| 审核可复现性 | 提供从全新安装开始的模型配置与测试步骤；说明翻译/解释需要用户配置服务、订阅连接器为可选本机组件。若后台要求测试访问方式，应提供可供审核验证的方式，不把开发者密钥写进安装包。 |

### 建议提交顺序

1. 完成开发者账号、联系邮箱与两步验证；按后台要求完成其他身份/交易者信息核验。
2. 完成权限、数据披露及密钥安全核对，补齐当前版本图片和审核测试说明。
3. 在仓库根目录按顺序执行下面的命令。`verify:all` 未全过时先处理失败项；`--quick` 不可替代最终完整门禁。命令仅供发布时执行，本次尚未执行。

```powershell
npm run verify:all
npm run build:release
$storeManifest = Get-Content -LiteralPath '.\dist\extension\manifest.json' -Raw | ConvertFrom-Json
if ($null -ne $storeManifest.key) { throw '商店包必须使用不含开发 key 的生产构建' }
Compress-Archive -Path '.\dist\extension\*' -DestinationPath ".\dist\roamcat-$($storeManifest.version)-chrome-web-store.zip" -Force
npm run build
```

每一步成功后再继续下一步；压缩后检查 ZIP 根目录的 `manifest.json`，并确认不含连接器、开发配置或密钥。最后一条命令恢复本地开发构建，已经生成的商店 ZIP 保留生产文件。首次上传商店草稿后取得正式 ID，完成连接器复测再提交；后续替换上传包时按后台要求递增版本。

4. 在[开发者后台](https://chrome.google.com/webstore/devconsole)新建条目、上传商店专用 ZIP，填写商品详情、隐私、分发信息及审核测试说明。描述应统一围绕“帮助理解英文内容”，伴读猫等作为辅助入口。
5. 提交审核，可选择审核通过后手动发布。官方说明审核通常数天，也可能数周；全站权限、新开发者和较多代码可能延长审核。通过后使用商店安装版再验证连接器与核心功能。

本次核对的官方依据：[注册账号](https://developer.chrome.com/docs/webstore/register)、[账号设置](https://developer.chrome.com/docs/webstore/set-up-account)、[打包结构](https://developer.chrome.com/docs/webstore/prepare)、[图片要求](https://developer.chrome.com/docs/webstore/images)、[隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)、[用户数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)、[开发者政策（含两步验证）](https://developer.chrome.com/docs/webstore/program-policies/policies)、[发布流程](https://developer.chrome.com/docs/webstore/publish)、[审核时长](https://developer.chrome.com/docs/webstore/review-process)。技能附带清单中“小宣传图推荐”的旧说法以当前官方“必需”要求为准。

## Store Listing

**Extension Name** [REQUIRED]
RoamCat · 随心阅

**Short Description** [REQUIRED]
像猫一样漫游英文世界：双语对照随读随译，阅读辅助保留原文、只给稀疏提示与按需说明。本地优先。

英文名称为 `RoamCat`，英文短描述以 `_locales/en/messages.json` 为准：
Roam the English web like a cat: bilingual page translation plus reading aids with sparse hints. Local-first.

**Detailed Description** [REQUIRED]
（中文为主；如需英文市场，可参考文末「英文描述备选」）

```
在读英文网页时获得刚好够用的帮助，而不是被整篇译文接管。RoamCat 保留网页上的真实英文，
只在需要的位置给出简短线索与局部中文说明。

功能
• 稀疏提示——自动只标注可可靠识别的主要阅读区域中的难点词；导航、控件和无关内容不会被打扰
• 查词卡片——按住 D 键单击英文单词，即可获得简单英文释义、当前语境说明与本句翻译（按键可自定义）
• 中文说明——英文解释仍不够时，可主动请求局部中文说明
• 阅读解构——标出句子的主谓宾等结构骨架，长句读不顺时一目了然；粒度与线型可调
• 本页双语翻译——按阅读位置逐段插入中文译文，英文始终保留；失败段落可单独重试，随时返回英文
• 领域识别——内置本地模型识别软件、数据、金融、医学、法律、设计等领域，让释义更贴合语境
• 生词渐退——对反复求助的用法自动从「短注」渐退到「仅标记」再到「暂缓」，熟悉的内容不再打扰
• 文章摘要——一键提炼整篇文章的核心结论、主要论点与关键术语；复制时保留原文章标题与链接
• 伴读猫——可拖拽的桌面小伙伴，随时访问常用功能，阅读辅助开关显示当前页面的实际状态
• YouTube 双语字幕——有字幕的视频可显示原文与中文译文，关闭再开启可接续已有译文；字幕外观可调整，换视频后跟随新内容
• 无字幕视频听写——在 YouTube 上手动开启云端听写后，为正在播放的声音生成原文与中文字幕；需要另行安装本机 Google 订阅连接器并具备可用服务
• Twitch 直播聊天翻译——手动开启后，在新出现的公开聊天消息下显示中文译文；默认关闭
• 内置阅读器——打开 PDF / EPUB，长文档分页阅读，目录可直接跳转；「翻译全文」逐段生成中文对照，超长段落也能完整翻译，失败后重试可补齐未完成部分，翻页后译文仍保留
• 中英双语界面——设置、弹窗、引导页、阅读器与页内挂件统一切换，可跟随浏览器语言

如何使用
1. 在「设置」中配置可用的模型服务；相关费用、额度和地区可用性由所选服务商决定，内置离线功能不能替代翻译和解释所需的模型服务
2. 点击工具栏图标，开启当前页面的阅读辅助；按住 D 键单击英文单词即查，也可选中句子或段落请求帮助
3. 需要整页双语时，点击「翻译本页」或按 Alt+Shift+T
4. 按需调整提示密度、查词方式、显示样式与网站规则；订阅连接器需要用户另行安装

隐私与权限
• 阅读记录、词档案与摘要默认只保存在本机，可随时导出或清理
• 需要模型生成帮助时，目标词句与有限上下文会发送给你自己选择的服务；扩展不设中转服务器，
  不收集任何分析或遥测数据
• API Key 只保存在浏览器本机存储中

支持
问题与建议：https://github.com/dapao-777/roamcat/issues

当前版本 0.7.2；首次商店提交尚未完成。
```

**英文描述备选**（供多语言市场上架时使用）

```
Get just enough help while reading English — without having the original text taken over.
RoamCat keeps the real English on the page and adds short clues and local explanations
only where you need them.

Features
• Sparse hints on the main reading area only — navigation, controls and unrelated content are left alone
• Word cards: hold D and click any English word for a simple definition, in-context note and sentence translation
• Chinese explanations on demand when an English hint is not enough
• Sentence deconstruction: subject / predicate / object structure made visible for long sentences
• In-page bilingual translation: Chinese appears next to the English as you read; failed passages can be retried; return to English anytime
• Built-in local domain recognition for tech, data, finance, medical, legal and design contexts
• Gradual fade-out for words you keep looking up, so familiar content stops interrupting
• One-tap article digest with key takeaways and terms
• A draggable desktop companion for quick access
• YouTube bilingual captions: original text with Chinese translations, reusable translations when toggling captions, adjustable styling and a fresh start for each video
• Manual cloud transcription for YouTube videos without captions; requires the separately installed local Google subscription connector and an available service
• Optional translation of new public Twitch chat messages; off by default
• Built-in reader for PDF / EPUB / pasted articles, with paragraph-by-paragraph bilingual translation
• Fully bilingual interface (Chinese / English) across every page and in-page widget

How to use
1. Configure an available model service in Settings, then click the toolbar icon to start reading assistance; service fees, quotas and regional availability depend on your provider
2. Hold D and click an English word to look it up, or select a sentence for help
3. For whole-page bilingual reading, click "Translate this page" or press Alt+Shift+T
4. Adjust hint density, lookup style and site rules in Settings; subscription connectors require a separate local installation

Privacy
• Reading records, word notes and digests stay on your device and can be exported or cleared anytime
• When a model is needed, only the target words and limited context are sent to the service you choose;
  there is no relay server, and no analytics or telemetry
• API keys are stored only in your browser's local storage

Support: https://github.com/dapao-777/roamcat/issues
```

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Helps users understand English content through on-demand explanations and Chinese translations alongside the original text in web pages, documents, video captions, and public live chat.

**Primary Language** [REQUIRED]
Chinese (Simplified)

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `roamcat-0.0.1/extension/icons/icon-128.png`（实测 128×128） |
| Screenshot 1 [REQUIRED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-lookup-card.png`（1440×1000） |
| Screenshot 2 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-page-translation.png`（1440×1000） |
| Screenshot 3 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-sentence-structure.png`（1440×1000） |
| Screenshot 4 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/final-popup.png` 或 `preview/popup-emergency-ready.png` |
| Screenshot 5 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `.github/assets/welcome-light.png` / `options-dark.png`（最新 UI 审计产物，见下） |
| 最新界面截图（README 同步） | — | ✅ 已更新 | `.github/assets/`：welcome-light/dark、options-light/dark/en、popup-light、reader-dark、widget-summary-dark、widget-wordcard-dark |
| 阅读器长文档分页 | — | 🟡 上架前更新 | 需展示分页与目录跳转；以当前 `preview/performance/` 验证结果为准 |
| Small Promo Tile [REQUIRED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. **查词卡片**（核心功能）：真实文章页上按住 D 单击 "index"，卡片显示英文释义、当前语境说明、本句翻译与「用中文说明 / 我已认识」操作。建议保留可见的原文标记（底部词注）。
2. **整页双语翻译**：真实文章页中文译文按段插入、英文保留的状态；可见「已译 N / 已识别 N 段」进度与「停止 / 返回英文」操作。
3. **阅读解构**：句法下划线（主谓宾着色）+ 点击后弹出的结构卡片。
4. **工具栏弹窗**：本页开关、网站自动开启、阅读解构、本页双语翻译四张卡片。
5. **设置页 / 欢迎页**：明暗主题各一张，展示品牌与可配置项。
> 以当前版本重新拍摄或合理裁剪为 1280×800（或 640×400）；不要把不同比例的图片拉伸变形。截图应保留核心操作的完整上下文，不使用手机/平板模拟图。小宣传图另行制作，不能只用截图代替。

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Allows reading assistance, selected-text help, and page translation on the current tab after a toolbar action, keyboard shortcut, or context-menu action. |
| `scripting` | permissions | Loads the reading, translation, summary, and companion UI into permitted pages as features are activated. Reading extraction excludes form inputs and hidden content. |
| `storage` | permissions | Saves model settings, API credentials, word profiles, optional reading records, and diagnostics on the device. Users can clear or export supported data. No Chrome account sync is used. |
| `nativeMessaging` | permissions | Connects to an optional, separately installed program on the user's computer to use the user's signed-in CLI services and retrieve the local service pairing token. No publisher-operated relay is used. |
| `offscreen` | permissions | Hosts the bundled offline topic-recognition worker. Its scripts, WebAssembly runtime, and model are packaged with the extension; remote model downloads are disabled. |
| `contextMenus` | permissions | Adds selected-text help, reading assistance, and page translation actions to the right-click menu. |
| `tts` | permissions | Reads requested English words and sentences using installed local English voices. Remote voices and third-party extension voices are excluded. |
| `webNavigation` | permissions | Detects page and same-document navigation to keep reading features aligned with the current article, and optionally opens HTTP(S) PDF navigations in the built-in reader. |
| `https://*/*`, `http://*/*` | host_permissions | Supports reading and bilingual translation on arbitrary user-selected websites, site-based automatic activation, the optional page companion, remote documents, and user-configured model endpoints. The current manifest requests these origins as required permissions. A lightweight bootstrap runs on ordinary HTTP(S) pages; reading features load when activated. Twitch chat translation is off by default. Caption translation sends text after activation; manually started YouTube cloud transcription also sends short player-audio segments through the local Google connector. |

以上为当前实现的英文审核说明。不要把网站规则开关写成 `optional_host_permissions`；如要实现按站申请，需要先修改 Manifest、授权流程与相关回归。静态 Twitch 脚本只匹配其主框架；默认关闭的是聊天翻译功能，而非该脚本的加载。

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes（仅在用户使用相应功能时；无分析、无遥测）

官方 User Data FAQ 将收集、传输、使用、共享均视为处理；仅在本机保存或展示的数据也需要披露。下表是提交草稿，不能仅凭“没有 RoamCat 服务器”选择不处理任何用户数据。当前页 URL、站点规则与远程文档地址的实际处理也应在后台对应数据类型下核对，不把“不建立浏览历史列表”等同于“不处理网页地址”。

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | 是（订阅连接器在本机读取并展示用户自己 CLI 登录态中的邮箱/套餐） | 不上传至项目运营者；此处仅在本机显示 | 展示订阅账户状态 | 不向新增第三方分享 |
| Health info | 否 | 否 | — | 否 |
| Financial info | 否 | 否 | — | 否 |
| Authentication info | 是（用户自备 API Key；远程文档主动重试时使用浏览器已有的网站登录态） | 是（API Key 发往用户配置的模型端点；网站登录态仅在主动重试时发往文档网站，不跟随重定向） | 调用用户选择的模型服务；读取需要登录的文档 | 用户选择的模型服务商；文档所属网站 |
| Personal communications | 是（仅开启 Twitch 直播聊天翻译时：公开聊天室里新出现的消息文本；不读私信、不读历史聊天） | 是（发送到用户选择的模型服务；使用 API 时每个标签页每分钟至多 12 次请求） | 在原消息下方显示简体中文译文 | 仅用户选择的服务商 |
| Location | 否 | 否 | — | 否 |
| Web history | 否（不记录访问过的网址；阅读记录事件不含网址） | 否 | — | 否 |
| User activity | 是（默认关闭，需明确开启并添加允许的网站） | 仅当用户开启「个性化分析」时，发送近 30 天有限的查询/摘要/客观统计（不含网址与原句） | 阅读记录、摘要与可逆的提示偏好调整 | 仅用户选择的服务商 |
| Website content | 是（仅功能触发时：目标词句、所选段落、有限上下文；自动预备的文章上下文上限 12,000 字符；整页双语翻译时还包括导航、侧栏、页眉页脚等页面构件中的可见英文；选择远程领域识别（订阅连接器、自定义 API 或 Jev 增强判定）时，还包括标题和经过长度限制的正文样本；在 YouTube 手动开启云端听写时，还包括正在播放的视频音轨片段，每段约 20 秒） | 是（发送到用户选择的模型服务；听写音频只经本机 Google 订阅连接器发给 Gemini） | 生成英文线索、局部中文说明、句子解构、整页双语翻译、摘要、页面领域识别与无字幕视频的听写字幕 | 仅用户选择的服务商 |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

### 补充说明（与代码实现一致，提交时请核对披露表单）
- **不使用 `chrome.storage.sync`**：所有数据仅存本机（`chrome.storage.local` / `session` / IndexedDB），不同步到任何服务器。
- **无自有服务器**：项目不提供中转云服务；模型请求直达用户自己选择的服务商（自备 API，或用户本机连接器接管的官方 CLI 订阅）。
- **阅读记录默认关闭**：需明确开启并添加允许的网站；无痕页面不采集；可导出、可清理。
- **诊断仅本机**：只记录去除正文与响应后的结构化元数据（模型/服务以哈希指纹表示），可一键关闭或清空。
- **远程文档登录态**：默认匿名下载；失败后只有用户主动点击重试才使用已有网站登录态，拒绝重定向，不读取或保存 Cookie，不向模型服务发送。修改 Jev 接口域名时需重新填写密钥。
- **视频双语字幕**：用户打开后才读取并发送当前字幕文本（含 YouTube 自动字幕）。
- **无字幕视频的云端听写**：只在 YouTube 上、用户在字幕设置里手动点「开始云端听写」后运行；只取视频元素的音轨（不用麦克风），每段约 20 秒、上限 512KB，经本机连接器交给用户已登录的 Google（Antigravity）订阅中的 Gemini 模型；连接器把片段临时写入自己的隔离目录，调用结束即删除。拖动进度、改倍速、切页、换视频或出现广告时自动停止；听写结果不写入阅读记录。
- **Twitch 直播聊天翻译**：默认关闭，用户在聊天输入区点「译」或在设置里打开后才运行；只发送打开后新到的公开聊天消息（刚打开时补最后几条），表情图片、单个词的梗和中文消息不发送；译文不写入阅读记录。

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://github.com/dapao-777/roamcat/blob/main/roamcat-0.0.1/PRIVACY.md`
政策正文在 `roamcat-0.0.1/PRIVACY.md`。2026-10-31 已用浏览器打开上述 URL，页面展示更新日期 2026-10-31 与政策正文；此后政策正文于 2026-11-01 补充了披露（远程领域识别与 Jev、本页双语翻译的处理范围），推送到远端后需重新核验；最终提交前仍需以无登录状态复核公开可访问性，并确认远端包含最终的数据实践更新。若将来改用 GitHub Pages，先发布并核验新页面，再回填实际地址。

---

## Distribution

**Visibility**: Public
**Regions**: All regions（模型服务的实际可用性、额度与地区限制由用户选择的服务商决定）

## Developer Info

**Publisher Name** [REQUIRED]
fenghua

**Contact Email** [REQUIRED]
⬜ 待填写（须为常用邮箱；Google 的重要通知发往此地址）

**Support URL / Email** [RECOMMENDED]
https://github.com/dapao-777/roamcat/issues

**Homepage URL** [RECOMMENDED]
https://github.com/dapao-777/roamcat

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.7.2 | 2026-11-01 | 扩展与本机常驻服务改为挑战—应答双向认证，令牌不再上线；不新增权限。 | GitHub Release（商店未提交） |
| 0.7.1 | 2026-11-01 | 本机订阅连接器收紧权限（Grok 不给模型工具、隔离主目录；Antigravity 批准策略压回默认），后台唤醒只比对已注册脚本，文档与落地页按代码校正；不新增权限。 | GitHub Release（商店未提交） |
| 0.7.0 | 2026-11-01 | 整页翻译新增「双语 / 仅译文」一键切换（网页左下角与弹窗），偏好保存在本地设置，不新增权限。核对商店发布流程，校正专用 ZIP 结构、必需小宣传图、全站权限与听写音频说明；更新发布前检查单，未提交商店。修复伴读猫在未开启页面误显示阅读辅助进行中、首次点击反向关闭，以及从弹窗切换后按钮状态不同步；工具栏红色「!」在换页面后撤掉，弹窗显示上一次快捷键失败的原因。 | GitHub Release（商店未提交） |
| 0.6.1 | 2026-10-31 | 修复 Jev 接口域名变更时复用旧密钥、并发设置丢失或服务引用失效、旧版浏览器 PDF 读取、带命名空间前缀的 EPUB 解析和流式用量统计；远程文档增加主动登录重试及原站查看。权限范围不变。 | GitHub Release（商店未提交） |
| 0.6.0 | 2026-10-31 | 改善长文章、阅读历史和大词库的响应；长文档分页，目录跳转后保留译文；修复超长段落漏翻、YouTube 双语开关后漏译、原生自动翻译替换原文、换视频后翻旧字幕及外观保存回退。现有权限与隐私披露范围不变。 | GitHub Release（商店未提交） |
| 0.5.0 | 2026-10-28 | Twitch 直播聊天实时翻译（默认关闭，只处理开启后新到的公开消息）；本机常驻连接服务改为配对令牌认证；隐私政策与商店披露补上 Twitch 聊天会发送的数据。新增一项只匹配 `https://www.twitch.tv/*` 的静态脚本，权限列表不变。 | GitHub Release（商店未提交） |
| 0.4.0 | 2026-10-26 | 「思考等级」按所选模型列出官方实际支持的档位。权限列表不变。 | GitHub Release（商店未提交） |
| 0.3.1 | 2026-10-26 | 英文界面下，订阅连接器返回的已分类错误提示改为英文。权限列表不变。 | GitHub Release（商店未提交） |
| 0.3.0 | 2026-10-26 | 各模型服务商新增可调「思考等级」。权限列表不变。 | GitHub Release（商店未提交） |
| 0.2.0 | 2026-10-26 | 本机常驻连接服务（只监听 `127.0.0.1:47821`，登录自启，可用 `--no-service` 跳过）；设置页改版与「暖纸墨」新配色。权限列表不变。 | GitHub Release（商店未提交） |
| 0.1.0 | 2026-10-22 | 首个正式版：YouTube 与带字幕轨道视频的双语字幕、三条订阅通道的稳定连接、技术站阅读（站点档案）、全界面中英双语与新一轮界面改版。权限列表不变。 | GitHub Release（商店未提交） |
| 0.0.1（修订） | 2026-09-22 | 修复切换文章或模型后显示旧摘要的问题；新文章可立即重新总结，复制摘要保留原文标题和链接。 | Draft |
| 0.0.1 | 2026-09-21 | 首个 prerelease：保留原文的稀疏阅读辅助（词义短注 / 局部中文说明）、查词卡片与顶部词注、句子阅读解构、本页双语翻译（按阅读位置推进、失败段可重试）、内置本地领域识别、生词渐退、文章摘要、伴读猫；模型服务支持自备 API 与 ChatGPT / Grok / Google 订阅连接器。 | Draft |

---

## Review Notes

### Known Issues / Limitations（审核前自查）
- **`host_permissions` 较宽**（`http/https://*/*`）：当前为必需权限，站点规则不是可选权限。官方说明全站权限可能延长审核；应核对每项现有功能需要的最小范围，逐项说明。改为 `optional_host_permissions` 是需要实现与回归的后续工作，不能仅修改材料声称已完成。
- **第三方名称**：描述与设置中提到 ChatGPT / Grok / Google 仅为说明可复用的订阅权益，不代表关联或背书；商标归各自所有者（见 `NOTICE.txt` 与 `extension/icons/providers/NOTICE.txt`）。截图与文案避免使用第三方 Logo 于扩展自身品牌位。
- **模型依赖**：功能质量、时延与费用取决于用户选择的服务；网络、额度、权限、CSP 与响应格式都可能导致失败，失败时保留英文原文并给出可操作提示。
- **连接器平台与 ID**：单独安装的连接器需 Node.js 20+ 与对应 CLI；完整工程构建需 Node.js 22.13+。首次上传后取得商店 ID，更新安装说明并用正式 ID 验证本机连接；不要假设开发 ID 与正式 ID 相同。
- **最低版本**：`minimum_chrome_version: 125`；个别增强（自动打开弹窗 `chrome.action.openPopup` 需 127+、存储访问级别需 136+）均已做特性检测与降级。
- **Remote code**：无远端代码执行；本地 WASM 推理库随包分发（CSP `wasm-unsafe-eval`）。
- **密钥安全待核对**：隐私政策明确说明 API Key 以本机明文保存；官方 User Data FAQ 对认证信息安全与静态存储加密有要求。提交前需检查实际保存方式并确定处理方案；本次未修改密钥存储实现，也未认定其已满足该要求。
- **资源占用**：内容脚本在已开启辅助的页面上运行（DOM 观察 + 视口扫描）；伴读猫默认开启并按需动态注册到普通网页，可在设置中关闭（关闭后不注入）。
- **截图更新**：发布前更新阅读器加载失败页截图，包含「使用网站登录状态重试」和「在浏览器中查看原文档」入口；伴读猫截图需展示与弹窗一致的阅读辅助开启/关闭状态。

### 提交前检查单（源自 chrome-extensions 技能包 review-checklist）
- [x] manifest_version 3；当前源码与 package.json 版本均为 0.7.2，商店尚未提交
- [x] 本地化名称与材料一致（中文 `RoamCat · 随心阅`；英文 `RoamCat`）
- [x] 中英文 manifest description 均不超过 132 字符（以 `_locales/*/messages.json` 为准）
- [ ] 商店专用 ZIP：根目录直接有 `manifest.json`；只含生产扩展运行文件与必要许可，不带外层 `extension/`、连接器、开发配置或密钥；不要上传 GitHub Release 安装包
- [x] 8 项权限与 HTTP(S) 主机权限均有具体理由，已校正可选权限与音频说明（见上表）
- [x] 无 `chrome.storage.sync`（无需披露同步）
- [ ] 完成账号注册、两步验证、发布者信息与联系邮箱验证，以及后台要求的其他信息
- [ ] 最终隐私政策在无登录状态可访问，且与最终代码、商店数据表单及产品内说明一致
- [ ] 完成 API Key 本机明文存储方式与安全处理要求的核对及必要整改
- [ ] 至少 1 张 1280×800 截图（候选素材已列出，需裁剪）
- [ ] 440×280 小宣传图就绪（必需）；1400×560 大宣传图可选
- [x] 128×128 PNG 商店图标在源目录中存在；上传前核对实际观感
- [x] 无混淆代码；第三方许可声明齐全
- [ ] 本次待上传代码完整通过 `npm run verify:all`，报告见 `preview/gates/summary.json`；旧版门禁数字不代表本次通过。项目浏览器门禁统一使用本机 ego lite，CI 使用 Node 22.13.0 与 24
- [ ] 以正式商店 ID 验证连接器与常驻服务，更新安装说明
- [ ] 审核测试说明能从全新安装复现主要功能，相关服务访问方式可用

### Rejection History
（暂无）
