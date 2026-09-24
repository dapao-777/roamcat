# Chrome Web Store Listing — RoamCat · 随心阅

> Last Updated: 2026-09-22（与 SPEC v1.2、71 种消息协议同步）
> 本文是上架 Chrome Web Store / Microsoft Edge Add-ons 的单一事实源：商店文案、权限理由、隐私披露、版本历史。
> 提交前请逐项核对文末「提交前检查单」。本文不随 Release ZIP 发布（放在仓库根目录，打包白名单之外）。

## Store Listing

**Extension Name** [REQUIRED]
RoamCat · 随心阅

**Short Description** [REQUIRED]
（44 字符）在读英文网页时获得轻量帮助：词义短注、局部中文说明、可选整页双语对照，始终保留英文原文。

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
• 伴读猫——可拖拽的桌面小伙伴，随时访问常用功能

如何使用
1. 点击工具栏图标，开启当前页面的阅读辅助
2. 按住 D 键单击英文单词即查；也可选中句子或段落请求帮助
3. 需要整页双语时，点击「翻译本页」或按 Alt+Shift+T
4. 在「设置」中配置模型服务、提示密度、查词方式、显示样式与网站规则

隐私与权限
• 阅读记录、词档案与摘要默认只保存在本机，可随时导出或清理
• 需要模型生成帮助时，目标词句与有限上下文会发送给你自己选择的服务；扩展不设中转服务器，
  不收集任何分析或遥测数据
• API Key 只保存在浏览器本机存储中

支持
问题与建议：https://github.com/dapao-777/roamcat/issues

版本 0.0.1 — 首个 prerelease：阅读辅助、阅读解构、本页双语翻译、本地领域识别、生词渐退、文章摘要、伴读猫。
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

How to use
1. Click the toolbar icon to start reading assistance on the current page
2. Hold D and click an English word to look it up, or select a sentence for help
3. For whole-page bilingual reading, click "Translate this page" or press Alt+Shift+T
4. Configure services, hint density, lookup style and site rules in Settings

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
Provides lightweight, on-demand reading assistance for English web pages while keeping the original English text.

**Primary Language** [REQUIRED]
Chinese (Simplified)

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `roamcat-0.2.0/extension/icons/icon-128.png`（实测 128×128，4.0KB） |
| Screenshot 1 [REQUIRED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-lookup-card.png`（1440×1000） |
| Screenshot 2 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-page-translation.png`（1440×1000） |
| Screenshot 3 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/audit/real-sentence-structure.png`（1440×1000） |
| Screenshot 4 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/final-popup.png` 或 `preview/popup-emergency-ready.png` |
| Screenshot 5 [RECOMMENDED] | 1280×800 | 🟡 需裁剪 | `preview/audit/welcome.png` 或 `preview/audit/dark-assistance.png`（设置页） |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. **查词卡片**（核心功能）：真实文章页上按住 D 单击 "index"，卡片显示英文释义、当前语境说明、本句翻译与「用中文说明 / 我已认识」操作。建议保留可见的原文标记（底部词注）。
2. **整页双语翻译**：真实文章页中文译文按段插入、英文保留的状态；可见「已译 N / 已识别 N 段」进度与「停止 / 返回英文」操作。
3. **阅读解构**：句法下划线（主谓宾着色）+ 点击后弹出的结构卡片。
4. **工具栏弹窗**：本页开关、网站自动开启、阅读解构、本页双语翻译四张卡片。
5. **设置页 / 欢迎页**：明暗主题各一张，展示品牌与可配置项。
> 所有截图需从 1440×1000 裁剪/缩放到 1280×800（或 640×400）；不得使用手机/平板模拟图；截图须与当前版本一致。

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | 用户点击工具栏图标、快捷键或右键菜单时，在当前标签页开启/暂停阅读辅助、解释选中内容或启动本页翻译。仅在用户直接操作时生效。 |
| `scripting` | permissions | 在用户已授权的网页中注入阅读辅助界面与自动启动脚本（普通导航、输入框、代码块等区域不注入、不读取）。 |
| `storage` | permissions | 在本机保存设置、词档案、阅读记录（默认关闭、按网站授权）与诊断信息；支持导出与一键清理。 |
| `nativeMessaging` | permissions | 连接用户本机安装的订阅连接器，让用户复用自己官方 CLI 已登录的 ChatGPT / Grok / Google 订阅权益；连接器不经由任何中转服务器。 |
| `offscreen` | permissions | 在离屏文档中运行随扩展打包的本地领域识别模型，全程不访问网络。 |
| `contextMenus` | permissions | 提供「帮助理解选中内容」「开启/暂停阅读辅助」「双语翻译本页」三个右键入口（翻译入口与工具栏/快捷键同一链路，确认后才发送正文）。 |
| `tts` | permissions | 使用系统本地英文语音朗读单词与原句，不产生网络请求。 |
| `webNavigation` | permissions | 页面导航或主框架切换后及时作废过期请求，避免把结果显示到错误的页面。 |
| `https://*/*`, `http://*/*` | host_permissions | 阅读辅助需要运行在用户自行选择的网站上。实际注入范围由「网站规则 / 自动开启」设置与可选权限共同决定：默认不开启，用户可按站点授权或一次性全部开启；扩展不读取输入框、隐藏正文与视频字幕。 |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes（仅在用户使用相应功能时；无分析、无遥测）

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | 否（订阅连接器仅在设置页展示用户自己 CLI 登录态中的邮箱/套餐，不由扩展收集或外传） | 否 | 展示订阅账户状态 | 否 |
| Health info | 否 | 否 | — | 否 |
| Financial info | 否 | 否 | — | 否 |
| Authentication info | 是（用户自备 API Key） | 是（随请求发送到用户自己配置的服务端点） | 调用用户选择的模型服务 | 仅用户选择的服务商 |
| Personal communications | 否 | 否 | — | 否 |
| Location | 否 | 否 | — | 否 |
| Web history | 否（不记录访问过的网址；阅读记录事件不含网址） | 否 | — | 否 |
| User activity | 是（默认关闭，需明确开启并添加允许的网站） | 仅当用户开启「个性化分析」时，发送近 30 天有限的查询/摘要/客观统计（不含网址与原句） | 阅读记录、摘要与可逆的提示偏好调整 | 仅用户选择的服务商 |
| Website content | 是（仅功能触发时：目标词句、所选段落、有限上下文；自动预备的文章上下文上限 12,000 字符；整页双语翻译时还包括导航、侧栏、页眉页脚等页面构件中的可见英文） | 是（发送到用户选择的模型服务） | 生成英文线索、局部中文说明、句子解构、整页双语翻译与摘要 | 仅用户选择的服务商 |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

### 补充说明（与代码实现一致，提交时请核对披露表单）
- **不使用 `chrome.storage.sync`**：所有数据仅存本机（`chrome.storage.local` / `session` / IndexedDB），不同步到任何服务器。
- **无自有服务器**：项目不提供中转云服务；模型请求直达用户自己选择的服务商（自备 API，或用户本机连接器接管的官方 CLI 订阅）。
- **阅读记录默认关闭**：需明确开启并添加允许的网站；无痕页面不采集；可导出、可清理。
- **诊断仅本机**：只记录去除正文与响应后的结构化元数据（模型/服务以哈希指纹表示），可一键关闭或清空。
- **视频字幕支持当前关闭**：不读取视频字幕。

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://github.com/dapao-777/roamcat/blob/main/roamcat-0.2.0/PRIVACY.md`
政策正文在 `roamcat-0.2.0/PRIVACY.md`，仓库公开后上述 blob URL 即可直接引用；若改托管到 GitHub Pages（`https://dapao-777.github.io/roamcat/privacy`）再回填。
**提交前必须访问该 URL 确认可访问且内容完整（404 = 自动拒绝）。**

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
| 0.0.1（修订） | 2026-09-22 | 修复切换文章或模型后显示旧摘要的问题；新文章可立即重新总结，复制摘要保留原文标题和链接。 | Draft |
| 0.0.1 | 2026-09-21 | 首个 prerelease：保留原文的稀疏阅读辅助（词义短注 / 局部中文说明）、查词卡片与顶部词注、句子阅读解构、本页双语翻译（按阅读位置推进、失败段可重试）、内置本地领域识别、生词渐退、文章摘要、伴读猫；模型服务支持自备 API 与 ChatGPT / Grok / Google 订阅连接器。 | Draft |

---

## Review Notes

### Known Issues / Limitations（审核前自查）
- **`host_permissions` 较宽**（`http/https://*/*`）：阅读类扩展的常见形态，已在权限理由中说明「按站点授权 + 可选权限」的实际约束。若被要求收紧，可改为 `optional_host_permissions` 渐进申请。
- **第三方名称**：描述与设置中提到 ChatGPT / Grok / Google 仅为说明可复用的订阅权益，不代表关联或背书；商标归各自所有者（见 `NOTICE.txt` 与 `extension/icons/providers/NOTICE.txt`）。截图与文案避免使用第三方 Logo 于扩展自身品牌位。
- **模型依赖**：功能质量、时延与费用取决于用户选择的服务；网络、额度、权限、CSP 与响应格式都可能导致失败，失败时保留英文原文并给出可操作提示。
- **连接器平台**：订阅连接器需 Node.js 20+ 与官方 CLI；macOS 实测最充分，Linux/Windows 覆盖较少（Windows 经 `codex.cmd` 支持）。
- **最低版本**：`minimum_chrome_version: 125`；个别增强（自动打开弹窗 `chrome.action.openPopup` 需 127+、存储访问级别需 136+）均已做特性检测与降级。
- **Remote code**：无远端代码执行；本地 WASM 推理库随包分发（CSP `wasm-unsafe-eval`）。
- **资源占用**：内容脚本在已开启辅助的页面上运行（DOM 观察 + 视口扫描）；伴读猫默认开启并按需动态注册到普通网页，可在设置中关闭（关闭后不注入）。

### 提交前检查单（源自 chrome-extensions 技能包 review-checklist）
- [x] manifest_version 3；版本号 0.0.1 将于首次发布
- [x] Name 与 CHROMEWEBSTORE.md 一致（`RoamCat · 随心阅`）
- [x] manifest description ≤132 字符（实测 zh-CN 46 / en 108 字符）
- [ ] ZIP 仅含白名单：`extension/`、`connector/`、`README.md`、`LICENSE`、`NOTICE.txt`；排除 `.git/`、`node_modules/`、测试与开发工具、`CHROMEWEBSTORE.md`、`SPEC.md`、`PRIVACY.md`（政策需托管为公开 URL，见上文）
- [x] 每个权限均有具体理由（见上表）
- [x] 无 `chrome.storage.sync`（无需披露同步）
- [ ] 隐私政策 URL 可访问且与披露一致
- [ ] 至少 1 张 1280×800 截图（候选素材已列出，需裁剪）
- [ ] 128×128 商店图标就绪
- [x] 无混淆代码；第三方许可声明齐全
- [x] 已在真实 Edge 无头回归验证主要功能（截至 2026-09-22：完整回归 29 项 + 摘要补充 22 项，去重 30 场景；单元 81 项；模块图 43 文件/66 导入；报告见 `preview/audit/full-regression-20260922.json`）

### Rejection History
（暂无）
