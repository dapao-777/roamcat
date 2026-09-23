# RoamCat · 随心阅（RoamCat）工程规范 SPEC

> 本文是 `roamcat-0.2.0/` 项目工程文件夹的**权威工程规范**，与 `README.md`（产品说明）互补：
> README 面向用户说明「是什么、怎么用」，本文面向工程实现与维护说明「由什么构成、如何协作、约束是什么」。
> 代码与本文冲突时，以代码为准并回头修订本文。

| 项 | 值 |
|---|---|
| 产品名 | RoamCat · 随心阅 |
| 版本 | v0.0.1 prerelease（未上架 Chrome Web Store / Edge Add-ons） |
| 形态 | Chrome / Edge Manifest V3 扩展 + Node.js 本机 Native Messaging 连接器 |
| 最低浏览器 | Chrome / Edge 125（`minimum_chrome_version: "125"`） |
| 许可 | 项目代码 MPL-2.0；第三方材料见 `NOTICE.txt` 及各子目录声明 |
| 规范版本 | v1.5（2026-09-24，页内 UI 渲染层迁移：content script 静态四件套（新增 src/content-ui 构建产物 content-ui.js）+ 伴读猫按需动态注册；词卡/解构卡/状态条/已认识 toast/伴读猫骨架改由 lit-html 工厂构建；Vite/Lit 构建链覆盖全部 UI 表面） |

---

## 1. 产品定义

### 1.1 目标
- 产品按**双模式**组织：**主模式 = 本页双语翻译**（保留英文、译文原位对照、按阅读位置推进）；**副模式 = 阅读辅助**（保留网页真实英文，在词/短语/句子附近提供**稀疏**帮助：英文短注 hint、局部中文说明 rescue、可选阅读解构）。
- 帮助是「临时支撑」而非「译文接管」：自动辅助只面向可可靠识别的主要阅读区；本页双语翻译需单独触发，不后台预译整篇。
- 本地优先：领域识别、词档案、阅读记录默认在本机；模型请求的数据去向对用户明示。

### 1.2 非目标（明确不做）
- 不做整页默认中文化、不做后台预译整篇。
- 不做用户能力画像：个性化分析只能提出可逆的提示密度/优先词调整，禁止掌握率、能力等级、敏感画像（`personalization.mjs` 的指令与结果校验强制此约束）。
- 不自建云服务、不中转请求。
- 视频字幕支持当前关闭（`activation.js: VIDEO_SUPPORT_ENABLED = false`），代码与许可保留。

### 1.3 关键产品决策（2026-09-21 起）
本页双语翻译**不做数据/费用二次确认**：工具栏「翻译本页」与 `Alt+Shift+T` 立即开始；停止不能撤回已发送请求。此决策同步体现在 `README.md`、`manifest.json` 命令描述、`ui/popup.html`（确认面板已移除）、`ui/popup.js`（intent 焦点直接 `popupEmergencyStart()`）。

---

## 2. 系统架构

### 2.1 组件清单

```
┌────────────────────────── 浏览器 ──────────────────────────┐
│ content scripts（manifest 静态四件套，document_idle）         │
│   design.js → reading-style.js → content-ui.js → content.js   │
│   · content-ui.js：lit-html 页内 UI 渲染层（构建产物入库）      │
│   · content.js：阅读区识别/标注/查词卡片/解构/整页翻译          │
│ 动态注册（chrome.scripting，按需注入）                         │
│   · floating-pet.js：伴读猫挂件（Shadow DOM）+ 文章摘要        │
│   · auto-start.js：按站规则自动开启                           │
├────────────────────────────────────────────────────────────┤
│ Service Worker（background.js，ES module）                   │
│   · 71 种消息路由、设置校验、缓存、并发、诊断、订阅端口管理    │
├────────────────────────────────────────────────────────────┤
│ 扩展页面：popup.html / options.html / welcome.html           │
│   · 三页均由 src/ 下 Lit 应用经 Vite 构建产出                 │
│ 离屏文档：local-inference/offscreen.html（本地 MiniLM 分类） │
├────────────────────────────────────────────────────────────┤
│ 本机连接器（Node.js 20+，Native Messaging stdio）            │
│   host.mjs + codex.mjs / grok.mjs / antigravity.mjs          │
└────────────────────────────────────────────────────────────┘
```

### 2.2 生命周期要点
- **Service Worker 无状态**：所有跨调用状态落在 `chrome.storage.local/session` 与 IndexedDB；SW 重启后由 `subscriptionLinked*` 标志按需重连连接器。
- **content script 幂等**：`window.__ROAMCAT_CONTENT__` 存在且存活则复用；`dispose()` 负责解绑全部监听。
- **伴读猫每页一只**：仅顶层主框架挂载（`window.top === window`）；`MutationObserver` 看护 host 不被站点移除；脚本按设置经 `chrome.scripting.registerContentScripts` 动态注册（`PET_SCRIPT_ID`），未启用时不在任何页面注入。
- **离屏文档按需创建、5 分钟空闲销毁**（`local-classifier.js` / `offscreen.js`）。

### 2.3 信任边界
| 来源 | 可信度 | 约束 |
|---|---|---|
| 扩展页面（popup/options/welcome） | 高（trusted） | 可访问全部消息；`API_MODELS_LIST` 仅 options 页 |
| 内容脚本（网页上下文） | 低 | 仅 `contentAllowed` 白名单 33 种消息；密钥/历史数据不直接暴露 |
| 模型返回内容 | 不可信数据 | 全部经 `gloss.mjs` 的结构化校验后才进入 UI |
| 网页 DOM 文本 | 不可信数据 | 提示词统一声明 `SOURCE_DATA_INSTRUCTIONS`（数据非指令） |

---

## 3. Manifest 规范（`extension/manifest.json`）

### 3.1 字段规范
- `manifest_version: 3`；`background.service_worker = background.js`，`type: module`。
- `minimum_chrome_version: "125"`；`content_security_policy.extension_pages = "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'"`（wasm 供本地 ONNX 推理）。
- 内容脚本固定四件套 `design.js, reading-style.js, content-ui.js, content.js`（`content-ui.js` 为 `src/content-ui` 经 `vite.content-ui.config.mjs` 构建的 IIFE 产物，入库、不手改），`run_at: document_idle`，`all_frames: false`；`floating-pet.js` 与 `auto-start.js` 改为 `chrome.scripting` 按需动态注册（同为 classic 形态，受模块图 R1 同约束）。
- `web_accessible_resources` 仅 `icons/roamcat.svg`（`use_dynamic_url: true`）——页面内品牌图标所需，最小暴露面。

### 3.2 权限与用途（上架时可直接引用的理由）
| 权限 | 用途 | 理由（面向审核） |
|---|---|---|
| `activeTab` | 用户点击图标/快捷键时操作当前页 | 仅响应用户直接操作时访问当前标签页 |
| `scripting` | 向已授权页面注入 UI 与自动启动脚本 | 在用户开启的网页中注入阅读辅助界面 |
| `storage` | 设置、词档案、阅读记录、诊断 | 全部数据仅存本机 |
| `nativeMessaging` | 连接本机订阅连接器 | 使用用户自己的 ChatGPT/Grok/Google 订阅权益 |
| `offscreen` | 本地领域识别模型推理 | 在离屏文档中运行打包的本地模型，不访问网络 |
| `contextMenus` | 右键「帮助理解选中内容」「开启/暂停」「双语翻译本页」 | 提供选中文本的快捷求助入口与整页双语翻译快捷入口（后者与 `Alt+Shift+T` 同链路） |
| `tts` | 朗读英文单词/原句 | 使用系统本地语音，不产生网络请求 |
| `webNavigation` | 校验主框架文档切换 | 页面导航后及时失效过期请求 |
| `host_permissions: http/https://*/*` | 阅读辅助需在用户选择的网站上运行 | 由「网站规则/自动开启」设置按 origin 授权；不使用 `tabs` 权限 |

> 合规备注：`host_permissions` 目前为全站（阅读类扩展的常见形态），上架时需按审核要求提供措辞；可选优化为按 `optional_host_permissions` 渐进申请。

---

## 4. 模块规范

### 4.1 Service Worker
| 文件 | 职责 | 关键约束 |
|---|---|---|
| `background.js` | 消息路由（71 种，与 `MESSAGE_TYPES` 一一对应）、设置校验与迁移、四大模型链路编排、缓存/并发/看门狗、订阅端口状态、诊断编排 | 无跨调用内存态假设；所有写操作串行化（`writes` 链）；长操作必须带 `guard()` |
| `subscription.js` | 三个连接器的端口、请求-响应映射、超时（assist/翻译/总结 120s，其余 45s）、进度事件转发 | 端口单例；断开时拒绝全部在途请求 |
| `diagnostic-service.js` / `diagnostics.mjs` | traceId 贯穿、元数据脱敏、渲染回执、连接器镜像 | 只记录结构化元数据，不记录正文/密钥 |
| `history-service.js` / `history-store.js` | 阅读记录（IndexedDB）、摘要/个性化引擎装配 | 记录默认关闭，需显式授权 origin |
| `reading.js` / `lexicon.js` / `reading-style.js` / `domain-routing.js` | 渐退状态机、术语/词频/词形还原、分层样式 CSS 生成、站点规则匹配 | 纯函数优先，可单测 |
| `local-classifier.js` | 离屏文档生命周期 + 本地分类请求队列 | 网页不得直接调用（`target:'local-classifier'` 校验 `sender.tab` 为空） |
| `speech.js` | TTS 端口会话（一次一个，打断上一个） | 仅本地英文语音 |
| `activation.js` / `auto-start.js` | 自动开启策略、动态注册 content script、SPA 导航检测；`pageOrigin`/`sitePattern`/`validateAutomation`/`validateVideo`/`registrationMatches` 为纯函数（已纳入领域层 lint 与单测） | `registrationMatches()` 是权限/注册的唯一事实源 |
| `shared.js` | `DEFAULT_SETTINGS`、`normalizeSettings`、`wordId`、`request()` | 旧配置键不得通过 spread 复活 |
| `message-router.js` | 类型化消息路由器：注册表构造、重复类型即失败、`parse`+`handle` 两段派发 | 泛型实现，不认识任何具体消息；未知类型抛「未知请求。」 |
| `message-protocol.js` | 消息协议唯一事实源：`MESSAGE_TYPES`（71 种）、`CONTENT_ALLOWED_TYPES`、纯载荷解析器与自 `background.js` 下沉的 `validatePatch`（设置补丁校验）、`settingsPatchEffects`（STATE_PATCH 副作用计划）、`parseAssistRequest`/`parsePassageRequestRef`（请求身份）、`onDemandSuggestionDecision`（按需建议判定）、`text`/`domain`/`customDetectionService` | 只依赖 `shared.js`、`domain-routing.js`、`api-providers.mjs`、`gloss.mjs` 等领域/协议模块；新增类型必须同步注册表与第 5 节 |
| `api-providers.mjs` / `api-transport.mjs` | 26 家服务商目录、8 种协议适配、结构化输出能力探测、模型列表 | HTTPS only（本机回环除外）；同源重定向禁止；密钥不进内容脚本 |
| `gloss.mjs` | 提示词、JSON Schema、响应校验/纠正（扩展与连接器共享） | `SUPPORT_POLICY_VERSION` 变更即使全部缓存失效 |
| `sentence-groups.mjs` / `assistance-stream.mjs` / `personalization.mjs` | 解构协议与修复、流式进度解析、个性化策略机 | 共享文件被连接器安装副本引用，改动需双边同步 |

### 4.2 内容脚本
| 文件 | 职责 | 关键约束 |
|---|---|---|
| `content.js` | 阅读根识别、文本映射、自动标注、查词（按键+卡片+顶部词注）、选段翻译、阅读解构高亮、整页翻译引擎、历史采集、重载侦察（失效 toast） | 只拆文本节点不重建强调/链接；所有跨文档操作带 generation 校验；DOM 批量更新走 rAF；重载侦察用可见性门控的低频探测，不用常驻 port（不阻止 SW 空闲回收） |
| `floating-pet.js` | 伴读猫（SVG/Shadow DOM/拖拽贴边/菜单/摘要/状态气泡/左侧快捷按钮行）、全局快捷键 | window 级监听只注册一次（`bindGlobalEvents`）；快捷键在输入框/可编辑区不触发（`petShortcutBlocked`）；左侧快捷按钮行（阅读开关/摘要/设置/贴边）贴左屏时翻向右侧，贴边时随旋旋翻隐藏 |
| `design.js` | 设计 token（明暗双主题）唯一下发 | 仅当脚本带 `data-roamcat-page` 时才向页面根注入 |
| `reading-style.js` | 三层（原文/词注/译文）样式规范化与 CSS 生成 | 选择器必须静态；`!important` 全覆盖以对抗站点样式 |

### 4.3 扩展页面
- 三个扩展页均已迁移到 `src/`（Vite + Lit）：`build/extension-plugin.mjs` 的 `REPLACED_BY_BUILD` 清单使构建产物覆盖对应 `ui/` 文件；**不要直接改将由构建替代的源文件**。页内 UI（content script 一侧）为后续阶段。
- `ui/popup.html|js`（构建产物来自 `src/pages/popup/`）：本页开关、网站自动开启、阅读解构、本页双语翻译（立即开始）、服务告警。
- `ui/options.html|js` + `options-nav.js`（构建产物来自 `src/pages/options/`：shell + 11 分区模板，`options-controller.js` 与 `@ext/ui/history.js` 动态加载填充动态内容）：11 个设置分区（assistance/appearance/sites/advanced/terms/personalization/history/privacy/service/diagnostics/guide）。
- `ui/welcome.html|js` + `welcome.css`（构建产物来自 `src/pages/welcome/`）：首次安装引导与交互式演示。
- `ui/provider-picker.js`：原生 select + Popover 自定义列表（Chrome 116+）。
- `ui/theme-init.js`：防主题闪烁的早期脚本（外链文件，符合 CSP）。
- 设计 token 唯一事实源 `src/tokens.css`：`npm run gen:tokens` 生成 `extension/design.js`，`design-tokens.test.mjs` 断言同步（见 `docs/design-system.md`）。

### 4.4 本地推理
`local-inference/`：Xenova/all-MiniLM-L6-v2（q8, wasm, 单线程）+ ONNX Runtime Web + `domain-prototypes.json`。分类 = 标题+正文 embedding 与各域原型集合的 top1/top2 加权相似度，`score≥0.10` 且 `margin≥0.055` 才采信，否则 `general`。

### 4.5 注释规范

- 每个源文件从第一个字符开始提供文件级长注释，统一写明：`@file` 相对路径、`文件职责`（解决什么问题）、`主要内容`（维护的关键类型/流程/UI）、`模块边界`（允许依赖什么、不得承担什么）。职责变化时必须同步维护，禁止复制不含文件语义的占位模板。`gloss.mjs` 与 `reading.js` 的文件头是本规范的示范。
- 非平凡的编排函数使用有意义的 step 注释（先做什么、再做什么、为什么）；注释解释「为什么、边界和所有权」，不复述语法；不为一行 getter、显然的类型守卫或简单映射机械添加。
- 导出的公共契约需要 TSDoc 风格说明；临时兼容导出必须标注 `@deprecated` 与新路径。
- 注释以中文为主，保留必要的协议名、标准名和用户可检索的英文错误上下文。
- 执行手段：`tools/lib/module-graph.cjs` R7 在每次模块图检查时强制文件头存在（生成产物 `frequency/` 以 `// Generated by` 豁免）；`gloss.mjs` 与 `reading.js` 的文件头是本规范的示范。
- 许可证：自有源文件的 `/** @file */` 块尾部统一附 MPL-2.0 文件头（`This Source Code Form … MPL/2.0/.`）；无文档块的脚本（如 `local-inference/`）、CSS 以 `/* */` 短块开头，HTML 在 `<!doctype>` 后加注释。第三方与生成文件（`vendor/`、`local-inference/runtime/`、`frequency/` 生成物）不加 MPL 头，保留各自许可。

---

## 5. 消息协议规范（`chrome.runtime`）

### 5.1 总则
- 统一信封：请求 `{type, ...payload}` → 响应 `{ok:true,data,traceId}` / `{ok:false,error,code,traceId}`。
- `sender.id !== chrome.runtime.id` 一律拒绝；`trusted = sender.url` 以扩展页开头。
- 全部消息类型登记在 `message-protocol.js` 的 `MESSAGE_TYPES`（唯一事实源），由 `background.js` 的 `messageHandlers` 注册表逐一分派；`createMessageRouter` 构造期拒绝重复类型，未注册类型抛「未知请求。」；`tools/unit/message-router.test.mjs` 的源码契约测试强制注册表与清单一致。
- 内容脚本仅可用白名单（`contentAllowed`，33 种，以 `CONTENT_ALLOWED_TYPES` 为准）：状态读取、分析、支持批次、解构、求助、翻译、历史信号、诊断回执、伴读猫位置等。
- 数据变更类消息进入 `activeDataRequests` 集合，供清理时排空（`clearReadingData`）。

### 5.2 消息分组（71 种，与 `MESSAGE_TYPES` 顺序一致）
| 分组 | 类型 |
|---|---|
| 状态与设置（8） | `STATE_GET` `STATE_PATCH` `AUTOMATION_GET` `AUTOMATION_PATCH` `PAGE_ACTIVITY_SET` `VIDEO_SETTINGS_PATCH` `FLOATING_PET_POSITION_SET` `OPEN_OPTIONS` |
| 模型服务（7） | `SUBSCRIPTION_STATUS` `SUBSCRIPTION_LOGIN` `SUBSCRIPTION_CANCEL` `SUBSCRIPTION_LOGOUT` `MODELS_LIST` `API_MODELS_LIST` `PROVIDER_TEST` |
| 领域识别（4） | `RESOLVE_DOMAIN` `PAGE_DOMAIN_GET` `PAGE_DOMAIN_SET` `DOMAIN_TEST` |
| 阅读辅助（12） | `ANALYZE` `SUPPORT_BATCH` `ASSIST` `ASSIST_PREVIEW` `ASSIST_COMMIT` `PREPARED_SUPPORT` `PREPARED_ASSIST` `ENCOUNTER` `INTERACT` `READING_ACTIVITY` `WORD_PREFERENCE_SET` `ON_DEMAND_SUGGESTION` |
| 阅读解构（5） | `SENTENCE_GROUPS_GET` `SENTENCE_GROUPS_SET` `SENTENCE_GROUPS_DENSITY_SET` `SENTENCE_GROUPS_LINE_STYLE_SET` `SENTENCE_GROUPS_BATCH` |
| 翻译（6） | `EMERGENCY_BEGIN` `EMERGENCY_TRANSLATE` `EMERGENCY_CANCEL_REQUEST` `EMERGENCY_END` `PASSAGE_TRANSLATE` `PAGE_SUMMARY` |
| 历史与个性化（17） | `HISTORY_GET` `HISTORY_CONFIG` `HISTORY_BEGIN` `HISTORY_TICK` `HISTORY_COMMIT` `HISTORY_ANNOTATION` `HISTORY_DELETE` `HISTORY_SUMMARY_EDIT` `HISTORY_CLEAR` `HISTORY_EXPORT` `HISTORY_RULE_SET` `PERSONALIZATION_GET` `PERSONALIZATION_ANALYZE` `PERSONALIZATION_APPLY` `PERSONALIZATION_DISMISS` `PERSONALIZATION_ROLLBACK` `PERSONALIZATION_RESET` |
| 数据与诊断（12） | `READING_DATA_EXPORT` `MEMORY_CLEAR` `DIAGNOSTICS_GET` `DIAGNOSTICS_EXPORT` `DIAGNOSTICS_SET` `DIAGNOSTICS_CLEAR` `DIAGNOSTICS_RENDER` `POPUP_INTENT_TAKE` `PAGE_UI_INJECT` `ENSURE_PAGE_UI` `AUTO_BOOTSTRAP_CHECK` `YOUTUBE_CAPTIONS_BRIDGE` |

### 5.3 页面 → 后台 的旁路消息（`tabs.sendMessage`）
`SS_STATUS` `SS_SET_ENABLED` `SS_REFRESH` `SS_AUTO_START` `SS_CONTEXT_HELP` `SS_SET_SENTENCE_GROUPS` `SS_SET_SENTENCE_DENSITY` `SS_SET_SENTENCE_LINE_STYLE` `SS_EMERGENCY_START/STOP/RETRY/END` `SS_HELP_LANGUAGE` `SS_READING_STYLE` `SS_VIDEO_SETTINGS` `SS_TRANSLATION_PROGRESS` `SS_ASSIST_PROGRESS` `SS_WORD_PREFERENCE`。

---

## 6. 核心流程规范

### 6.1 自动支持（SUPPORT_BATCH）
1. content 侧：视口附近区块 → 本地 `ANALYZE`（词频/术语/历史/词形）提名候选 → 每句最多 3 个候选 → 批次 ≤8 句、≤8000 字符。
2. background 侧：候选过滤（已掌握词剔除）→ 读者证据（近 12 条查询/少提示词）→ 缓存命中（key = 策略版本+个性化+服务+页面+句子+候选，TTL 7 天，≤512 条）→ 未命中按背景槽位（并发 2，队列 16）分批请求 → `requestSupportWithCorrection`（一次纠正重试，仅文本类字段可纠正）→ 结果校验 → 缓存与「已提供」登记。
3. 呈现：每区块最多 2 条显著提示（个性化 sparse 时 1 条），阶段 `hint/mark/quiet` 由渐退状态机决定。

### 6.2 查词（ASSIST）
- 入口：按住 `lookupKey`（默认 D）+ 单击（卡片或顶部词注两种呈现）、右键「帮助理解选中内容」、视频字幕（暂关）。
- 链路：`ASSIST_PREVIEW`（旧参考义即时展示）∥ `ASSIST`（流式）→ 结果校验 → `ASSIST_COMMIT`（写入词档案义项与渐退计数）。
- 缓存：会话内 `pendingAssists:`（请求幂等，5 分钟）+ `assistResultCache:`（结果，5 分钟）+ `supportCache` 复用已预备解释。
- 竞态防护：requestId 幂等、页面/设置/服务变更即 STALE。

### 6.3 阅读解构（SENTENCE_GROUPS_BATCH）
- 模型返回扁平区间列表（role ∈ 7 种句法角色，≤5 层/≤64 节点），本地 `repairGroups` 修复交叉区间并推导父子嵌套，再映射为字符区间。
- 呈现：CSS Highlight API 下划线（粗细/颜色按角色与明暗主题），粒度 coarse/medium/fine，线型 solid/dashed/dotted/wavy；点击下划线弹出结构卡片。
- 授权：按 tab 的 `sentenceGroupsMode:`（manual 或 auto），自动授权随「所有网站阅读解构」开关与权限存在性派生。

### 6.4 本页双语翻译（EMERGENCY_*）
- 授权：`EMERGENCY_BEGIN` 签发 token（tab+url+代数+服务指纹绑定，session 存储）。
- 扫描：会话锚定 `document.body`，`emergencyBlocks` 全区域提取英文单元（跳过 `SKIP_HARD`：pre/code/输入框/表单/控件/媒体等），按句切分 ≤4000 字符；表格单元格带入表头上下文。单元按所在区域打 `zone`：`article`（正文容器）、`content`（正文外一般区域）、`chrome`（nav/aside/header/footer 等页面构件，`SKIP_CHROME`）。chrome 单元按规范化文本做会话级去重复用译文。
- 调度：仅视口 ±600px 内单元，就绪排序为可见性 → zone 权重（article > content > chrome）→ 距离 → 文档序；每批 ≤8 项、源文合计 ≤8000 字符；同一段的连续切片可以放进同一批。附近最多同时在飞 2 批，不预译整篇。模型一边返回，已完成的段落先画上。一批失败只标这一批，服务未连接时停住等待，滚动不会自动重发；连上服务或在弹窗里点「继续翻译」后再译，不把整页停掉。批次带 title/heading(≤160)/before/after(≤400) 封闭上下文。单段切片上限仍是 4000 字符。
- 渲染：article/content 单元在原文下插块级译文行；chrome 单元用 `data-zone="chrome"` 走内联译文（跟在原文后、弱化样式），避免撑破导航与侧栏布局；flex/grid 容器的直接文本子节点仍按 `skipped` 跳过。
- 失败：段落级失败可单独重试；成功译文仅入 5 分钟/256 项内存缓存；返回英文只移除扩展插入物。

### 6.5 领域识别
`手动固定 > 个人站点规则 > 全局固定 > 本地 MiniLM > 远程（订阅/API/Jev）`，结果 4 小时缓存（≤128 条）；本地不自信时回退个性化 `domainBias` 或 `general`。Jev 增强识别采用专用决策判定协议（`protocol: 'jev'`），支持自定义接口地址（Base URL）、模型 ID 及自定义 API Key，发送结构化问答后提取单选结果与置信度。Base URL 指向 `*.typesafe.ai` 时走官方 `/systemone` 原生协议（body 为 `{model, state, questions}`，模型自动去 `typesafe/` 前缀）；其余地址走 Requesty `chat/completions` 转发（`response_format: {type:'questions'}`）。

### 6.6 历史与个性化
- 采集默认关闭；需授权 origin 列表；无痕不采集；仅存 query/annotation/reading/summary 四类事件，段落只计次不存正文。
- 90 天保留：超期事件删除、贡献聚合成按日归档（archive），词/句以加盐指纹去重。
- 个性化：自动分析 7 天一次、手动 60 秒一次；需 ≥3 个含查询/摘要的会话或 ≥10 次查询；只能降低提示（sparse/mark）或设优先词（必须来自主动查询）；`autoApply` 仅允许只改优先词的提案。

### 6.7 诊断
- traceId 贯穿 request→provider→validation→render；渲染回执用于发现「成功但未展示」。
- 脱敏：模型/服务只存 SHA-256 指纹；ID 白名单字符；字段名白名单；无正文、无密钥。
- 连接器镜像：`diagnostics.jsonl`（≤256KB 轮转、7 天 TTL、0600 权限）。

---

## 7. 模型服务层规范

### 7.1 三种服务来源
| 模式 | 说明 |
|---|---|
| `api` | 自备 API：26 家服务商、8 种协议（chat/responses/anthropic/google/bedrock/cohere/ollama/jev），每服务独立并发（默认 2，1–10 可调） |
| `chatgpt` | 本机连接器 → 官方 Codex CLI（`app-server --stdio` JSON-RPC，隔离 config.toml 关闭全部工具/沙箱/更新） |
| `grok` | 本机连接器 → 官方 Grok CLI（`--json-schema` + prompt 文件） |
| `antigravity` | 本机连接器 → 官方 Antigravity CLI `agy`（`--json-schema`，剥离 RE2 不支持的 `pattern`） |

### 7.2 结构化输出策略
1. `chat`/`responses` 协议先做能力探测：带期望值的 `json_schema` 请求（期望值只出现在 response_format，不出现在提示词）；400/422 且错误指向格式不支持 → 降级 `json_object`（提示词内嵌 schema）。探测结果按 (provider, endpoint, model, key, thinking) 哈希缓存 1 小时。
2. 其余协议使用各自原生结构化字段（Anthropic tool/schema、Google `responseJsonSchema`、Ollama `format` 等）。
3. 全部响应必须通过 `gloss.mjs` 校验（字段集合、语言、长度、ID 绑定），失败按错误码分类并决定可否纠正重试。

### 7.3 超时与并发
| 项 | 值 |
|---|---|
| API 请求 | 25s（阶跃星辰 60s）；模型列表 25s |
| 订阅请求（扩展侧） | assist/emergencyTranslate/summarize 120s；其余 45s |
| Codex RPC | 30s/次；任务总超时 90s；并发 ≤3 |
| Grok/Antigravity | 任务 90s；并发 ≤3；**仅格式类错误重试（Grok ≤3 次，Antigravity 不重试）** |
| 背景槽位 | 并发 2，队列 16，超限即 `NOT_READY` |

---

## 8. Native Messaging 连接器规范

### 8.1 安装矩阵（`connector/install.mjs`）
- 平台：macOS / Linux / Windows（Windows 用 `.NET csc.exe` 现场编译 C# 启动器 + 注册表；其余平台写 `launch` shell 脚本 + `NativeMessagingHosts` JSON）。
- 浏览器：`chrome`/`edge` 默认；显式支持 `chromium`/`chrome-beta`/`chrome-testing`；只注册用户显式指定的目标。
- 扩展 ID：`--extension-id` 支持单个或逗号分隔多个；缺省时按 manifest.key 或路径哈希推导。
- CLI 查找：PATH + 平台特例（Windows `codex.cmd`/`.bat`、`~/.grok/bin`、`~/.local/bin`、`~/.gemini/bin` 等）；`--codex/--grok/--agy` 可指定。
- 登录态：仅缺失时才从 `~/.codex/auth.json` 复制；重装不覆盖。

### 8.2 帧协议（`connector/host.mjs`）
- stdio，4 字节小端/大端长度前缀 + UTF-8 JSON，上限 1MB；解析失败即断开。
- 请求：`{id, type, payload?, traceId?}`；响应：`{id, ok, data|error, code, detail}`；事件：`status` / `diagnostic` / `assistProgress` / `translationProgress`。
- 启动参数：`--config <path> <origin>`（Chrome 传入调用方 origin），额外仅允许 `--parent-window=N`。
- 来源校验：config 内 `extensionOrigin` 白名单 + `chrome-extension://<32 位 a–p>` 形态校验；两侧 origin 的结尾斜杠先归一化再比较（调用方与安装白名单可能一个带一个不带），空 pathname 与 `/` 均为合法形态（Node 的 URL 对不带路径的 chrome-extension URL 返回空 pathname）。帧协议与来源校验由 `tools/unit/connector-frame.test.mjs` 覆盖。
- 请求类型（13 种）：`sentenceGroups status login cancel logout models classify supportBatch assist emergencyTranslate historyModel summarize diagnostics`。

### 8.3 隔离与权限
- 数据目录 `0700`，配置文件 `0600`；Codex 使用隔离 `CODEX_HOME` 但保留真实 `HOME` 供钥匙串发现。
- 上游错误只映射为分类码 + 中文可读信息，**不回显上游原文**（可能含选区文本或密钥）。

---

## 9. 存储规范

### 9.1 `chrome.storage.local`（持久，≤10MB，QUOTA 守卫）
| 键 | 内容 |
|---|---|
| `settings` | 规范化设置（见 `shared.js DEFAULT_SETTINGS`） |
| `words` | 词档案（≤5000 条；schema v5；义项 ≤8/词） |
| `wordSchemaVersion` / `productSchemaVersion` | 5 / 1；更高版本拒绝运行并提示更新 |
| `supportDataGeneration` | 支持数据代理号；变更即使缓存/会话失效 |
| `supportUsage` | 近 28 天按日聚合（eligible/hints/errors/help） |
| `legacyReadingArchive` | 首次迁移时的旧档案只读副本 |
| `readingHistory` | 阅读记录配置（enabled/origins/summaries/personalization/autoApply/epoch） |
| `subscriptionLinked` / `grokSubscriptionLinked` / `antigravitySubscriptionLinked` | 连接器登录态标志 |
| `diagnostics` | 诊断开关与事件（≤500 条，7 天 TTL） |
| `sentenceGroupsDensity` / `sentenceGroupsLineStyle` | 全局解构外观 |
| `readingCleanup` | 清理进度标记（崩溃恢复用） |

### 9.2 `chrome.storage.session`（会话，≤10MB，可丢失）
`supportCache`（≤512，TTL 7 天）、`sentenceGroupCache`（≤512，TTL 24h）、`domainCache`（≤128，TTL 4h）、`pageDomain:<tabId>`、`offeredSupport:` / `pendingAssists:` / `assistResultCache:<tabId>`、`emergencySession:<tabId>`、`sentenceGroupsMode:<tabId>`、`automationPaused:<tabId>`、`bilingualPopupIntent`、`readingHistorySessions`、`diagnosticReceipts`、`diagnosticNativeClear`。
> 约束：缓存写入失败（如配额）不得中断阅读请求；缓存条目不存整篇正文。

### 9.3 IndexedDB（`roamcat-reading-history`，v2）
- `events`（keyPath `id`，索引 at/type/domain 及复合 atId/typeAtId/domainAtId/domainTypeAtId）、`contributions`（按日聚合）、`receipts`（去重与序列）、`archive`（按日归档）、`control`（meta/salt/startedAt）。
- `meta`：个性化策略版本栈（pending/applied/dismissed/rolledBack/expired/invalidated，≤50 版）与手动规则（overrides）。
- 迁移：v1→v2 建索引并把 contributions 灌入 receipts。

---

## 10. 安全与隐私规范
1. **密钥边界**：API Key 仅存 `chrome.storage.local`；不进入内容脚本、不进入诊断、不进入连接器（订阅模式由 CLI 自行管理登录态）。
2. **内容脚本最小面**：白名单消息；`STATE_GET` 的非可信投影只含公开设置子集。
3. **存储隔离**：`setAccessLevel(TRUSTED_CONTEXTS)`（Chrome 136+ 才存在，代码已做特性检测，116–135 自动跳过）。
4. **提示词注入防护**：所有页面内容以数据身份进入提示词（`SOURCE_DATA_INSTRUCTIONS`）；schema 只约束输出形状，不提升输入信任。
5. **请求元数据**：载荷不含页面 URL；遥测/诊断不含正文与密钥。
6. **权限最小化**：`chrome.permissions.remove` 在服务/网站规则移除后回收；provider 与站点模式分离保护。
7. **XSS 面**：扩展页面无内联脚本；`innerHTML` 仅用于静态模板或经 `escapeHtml` 的模型文本；Shadow DOM 隔离样式。

---

## 11. 错误与诊断规范
- 错误码全集见 `diagnostics.mjs DIAGNOSTIC_CODES`（43 个）；`diagnosticError()` 负责从 message 推断码。
- 用户可见错误一律中文、可操作（「请先连接服务」「请刷新模型列表」等）；技术细节进诊断。
- `STALE/CANCELLED/NOT_READY` 视为取消而非失败，不计入失败率。
- 诊断汇总：requests / failures / slow(≥10s) / pending(>150s 判 INTERRUPTED) / NOT_DISPLAYED（期望渲染但 15s 内无回执）/ REPEATED_FAILURE（同操作 ≥3 次）。

---

## 12. 测试规范
| 层 | 工具 | 覆盖 |
|---|---|---|
| 连接器单测 | `tools/verify-summary-timeout.mjs`（chrome mock + 定时器拦截） | 原生消息超时与计时器释放 |
| 单元测试 | `node --test "tools/unit/**/*.test.mjs"`（Node 20+，零安装依赖，103 例） | `gloss.mjs` 四类协议的准备/校验/纠正重试与失败码；`reading.js` 渐退状态机、迁移与读者证据；`lexicon.js` 词提名（排除规则/优先级/出现位置）；`activation.js` 自动化策略；`message-router/protocol` 注册表契约、载荷解析、设置补丁与副作用计划；`connector/host.mjs` 帧协议与来源校验；`background.js` mock 浏览器冒烟（注册表构造、信任边界、真实派发） |
| 静态检查 | `node tools/verify-module-graph.cjs`（11 条规则：加载契约、import 解析、无环、连接器闭包纯净、分层方向、无反向依赖、文件头注释、无重复 ID、无内联脚本、manifest 资源存在、classic 脚本 `node --check` 语法）；`node tools/verify-deadcode.cjs`（未使用导出/导入，报告型） | 模块依赖方向、页面契约、语法与死代码 |
| 真实扩展回归 | `tools/audit-extension.cjs`（playwright-core + 系统 Edge 无头，本地 fixture 文章 + 模拟模型服务） | 截至 2026-09-22：完整回归 29 项 + 摘要补充回归 22 项（去重 30 场景）：设置持久化、11 分区明暗/窄窗、术语/规则、API 模型列表、内容脚本开关、真实按键查词卡片、语言切换、已认识词撤销、历史导出清理、句子结构、整页翻译显示与清除、本地模型零请求分类、个性化空态、摘要防重与切换文章/模型过期、伴读猫拖拽持久化、欢迎页 |
| 专项回归 | `tools/verify-bilingual-shortcut.cjs` 等（另有 `verify-catalog/jev/connector-throttle/pet-actions/popup-colors/popup-emergency/summary-timeout/ui`） | 快捷键（页面触发/输入框忽略/旋旋翻开关/工具栏入口）、服务目录、Jev 判定、连接器节流、伴读猫操作、弹窗配色与应急翻译、摘要超时、UI 布局 |
| 连接器行为 | 临时脚本（假 spawn） | Grok 重试门控（AUTH/429 不重试、格式错误重试、过长不重试） |

模块图七规则（`tools/lib/module-graph.cjs`，零依赖，可由 `audit-extension.cjs` 在浏览器回归前自动执行，失败即中止）：

| 规则 | 内容 |
|---|---|
| R1 | manifest content script 四件套顺序固定、文件存在、且不得包含 ESM 语法；动态注册的 classic 脚本（`floating-pet.js`、`auto-start.js`）同约束 |
| R2 | 全部相对 import 必须解析到真实文件 |
| R3 | extension 与 connector 全图无循环依赖 |
| R4 | connector 的 import 闭包内的 extension 文件必须属于 §4.1 共享协议清单，且能在 Node 中安全 import（顶层不触碰浏览器 API） |
| R5 | 共享协议文件只允许互相引用；领域层（`reading/lexicon/domain-routing/shared/api-providers/api-transport`）必须 import 安全且只依赖领域层、共享协议与静态资源 |
| R6 | extension 不得反向 import connector |
| R7 | 全部参检源文件必须以 `/** @file … */` 长注释开头（含职责/主要内容/模块边界）；`connector/host.mjs` 允许首行 shebang、`frequency/` 生成产物以 `// Generated by` 来源声明代替 |

新增共享协议文件或领域层文件时必须同步更新 `tools/lib/module-graph.cjs` 清单与 §4.1。

运行方式：`PLAYWRIGHT_CORE_PATH=<playwright-core 路径> node tools/<script>`；模块图检查 `node tools/verify-module-graph.cjs`（零依赖，`audit-extension.cjs` 启动浏览器前也会强制通过）；单元测试 `node --test "tools/unit/**/*.test.mjs"`。截图与报告输出到 `preview/audit/`。

### 12.1 开发循环（改码后为何以及如何重载）

MV3 下改代码必须重载扩展：service worker 变更需重载扩展本身；content script 随页面注入，还需刷新已打开的标签页。项目把该循环压缩为两步，均不需要打开 `chrome://extensions`：

1. **重载扩展**：设置 → 运行诊断 → 「重新加载扩展」按钮（`chrome.runtime.reload()`）；设置改动均已即时保存，重载不丢数据。
2. **恢复页面**：重载后本页 content script 会话失效，页面右下角出现刷新 toast（`content.js` 重载侦察），一键刷新；勾选「以后自动」后（`localStorage roamcat_auto_reload`）失效即自动刷新。

约束：侦察用 15 秒低频 + `document.hidden` 门控的 `sendMessage` 探测（"Extension context invalidated" 信号），**不使用常驻 port 或更高频轮询**——两者都会阻止 service worker 的 30 秒空闲回收。失效信号同时挂接 `request()` 失败路径，用户一操作即可立即弹吐司，无需等待轮询。

---

## 13. 构建与发布规范
- 扩展本体以构建产物为准：`npm run build` → `dist/extension/`（源层拷贝 − `REPLACED_BY_BUILD` + Vite 页面产物 + 变换后的 manifest；dev 模式注入 `build/extension-key.json` 的固定 key，`npm run build:release` 为无 key 的 minify 产物）。产物门禁 `npm run verify:build`：字节比对 + Edge 实际加载冒烟。
- Release 包只含 `extension/`（构建产物重命名）、`connector/`、`README.md`、`LICENSE`、`NOTICE.txt`（白名单制；本文 SPEC.md 不随包发布）。
- 发布前要求：干净且已提交的 HEAD；生成 `dist/roamcat-0.2.0.zip` + `SHA256SUMS`。
- 升级约束：保持解压目录不变（未打包扩展 ID 与路径相关；使用 dev 构建时 ID 由 `build/extension-key.json` 固定）；连接器随扩展一起更新并重跑安装程序。
- 上架准备（尚未提交）：权限理由、隐私政策、1280×800 截图、ZIP 排除开发产物。

---

## 14. 已知问题与变更记录

### 14.1 本轮已修复（2026-09-21 起，含 09-22 摘要过期修复）
| # | 问题 | 修复 |
|---|---|---|
| 1 | `setAccessLevel` 无特性检测，Chrome/Edge 116–135 上扩展完全瘫痪 | `background.js` 加 `typeof` 守卫 + try/catch |
| 2 | 伴读猫快捷键在输入框抢键；重建 DOM 后 window 级监听重复注册 | `floating-pet.js` 新增 `petShortcutBlocked`，拆出 `bindGlobalEvents` 只注册一次 |
| 3 | Grok 连接器对 AUTH/429/超时也重试 3 次 | 新增 `retryableGrokFailure`，仅格式类错误重试 |
| 4 | `supportCache` 存整篇正文有 session 配额风险；写失败中断请求 | 缓存条目去掉 `articleText`（按 `articleKey` 判别）；存储失败不再中断业务 |
| 5 | 打开设置页任意分区都拉起连接器进程 | 仅进入「模型服务」区才刷新 |
| 6 | `endpointFor` 用 `arguments[2]` 传参 | 改显式 `stream` 参数 |
| 7 | 分层方向、加载契约与共享协议一致性仅有文档约束，无执行手段 | 新增 `tools/lib/module-graph.cjs` + `tools/verify-module-graph.cjs` 六规则静态门禁，`audit-extension.cjs` 浏览器回归前强制通过 |
| 8 | 共享协议层与渐退状态机没有自动化测试，回归依赖浏览器审计 | 新增 `node --test "tools/unit/**/*.test.mjs"` 零依赖单元测试，覆盖 `gloss.mjs` 与 `reading.js` |
| 9 | `background.js` 71 路巨型 switch 无静态保护：类型漂移、重复分发只能靠浏览器审计事后发现 | 迁移为 `message-router.js` + `message-protocol.js` 注册表（71 个处理器由脚本从原 switch 逐字提取并逐字比对，3 个走纯载荷解析器）；构造期拒绝重复类型，未知类型确定性报「未知请求。」；新增 mock 浏览器冒烟测试验证注册表构造、信任边界与派发 |
| 10 | 设置补丁校验与 STATE_PATCH 副作用计划内联在 background.js，无浏览器审计不可测 | 下沉 `validatePatch`、`settingsPatchEffects` 与 `parseAnalyze`/`parseHistoryRuleSet`/`parseHistoryRecordRef`/`parseHistorySummaryEdit` 至 `message-protocol.js`，`tools/unit/settings-patch.test.mjs` 以纯函数断言覆盖（编排条件经逐项比对确认与迁移前等价） |
| 11 | ASSIST 文章标识解构、段落翻译编号校验、按需建议日期判定内联在浏览器运行时 | 下沉 `parseAssistRequest`/`parsePassageRequestRef`/`onDemandSuggestionDecision` 至 `message-protocol.js`；`activation.js` 纳入模块图领域层，`pageOrigin`/`sitePattern`/`validateAutomation`/`validateVideo` 获得单测（81 例） |
| 12 | 改码后必须手动去 chrome://extensions 重载并逐标签页刷新，开发循环割裂 | 设置页新增「重新加载扩展」按钮（`chrome.runtime.reload()`）；`content.js` 增加可见性门控的重载侦察与页面角落一键刷新 toast（含自动刷新选项），并挂接 `request()` 失败路径 |
| 13 | 切换文章后仍接受旧摘要 | 请求前后校验完整 URL 与文档身份，页面变化返回过期提示；详见 `preview/audit/调试报告-20260922.md` |
| 15 | 连接器来源校验要求 `pathname === '/'`，而 Node 的 URL 对不带路径的 chrome-extension origin 返回空 pathname；安装白名单带斜杠而调用方可能不带，任一失配即拒绝所有连接 | `validateExtensionOrigin` 改为结尾斜杠归一化 + 接受空 pathname 与 `/`；`tools/unit/connector-frame.test.mjs` 覆盖两种合法形态与全部拒绝路径 |
| 16 | 帧协议、`lexicon.js` 词提名、`activation.js` 无单测；SPEC 声称的重复 ID/CSP/资源检查无执行工具；迁移遗留未使用导入 | 新增 `connector-frame` 与 `lexicon` 单测（总计 103 例）；模块图 lint 补齐 R8–R11 静态门禁；`tools/verify-deadcode.cjs` 常驻化并清除 `background.js`/`grok.mjs`/`antigravity.mjs` 的未使用导入 |
| 15 | 复制摘要误用新文章来源 | 快照摘要生成时的标题与地址，复制时使用原始来源 |
| 16 | 旧请求占用新文章总结状态 | 请求绑定页面与独立请求对象：同页重复点击合并，切文后可立即重总结，晚到结果不覆盖；组件销毁后忽略晚到结果 |
| 17 | 本页双语一次只送 4 段、合计 4000 字，长段还必须单独成批，进度被往返次数拖住 | 附近正文改为每批最多 8 段、合计 8000 字，长段的连续切片可以跟下一段一起送。仍只译视口附近，不预译整篇 |
| 18 | 下一批要等上一批结束；一批抛错就停掉整页；译文要等整批结束才出现 | 附近最多两批同时在飞。一批失败只标失败段落，未连接服务时停住等待。流式进度先画出已经译完的段落 |
| 19 | 服务商目录混入无官网、来源不明或与阅读场景不符的通道 | 移除 Jalapeno Cloud / Tensdaq / Atlas Cloud / Vercel / Replicate / Perplexity 六家及 `replicate` 协议实现与相关特判，服务商 32→26 家、协议 9→8 种；存量失效服务配置在加载归一化时静默丢弃 |
| 20 | 页面层为手写 HTML/JS 无构建链：样式 token 多处重复、无产物门禁；伴读猫常驻所有页面；产品叙事未反映双模式定位 | 新增 `src/`（Vite + Lit 页面应用）+ `build/`（拷贝/manifest 变换插件、tokens 生成、dev 固定 key）构建链，`npm run build` → `dist/extension`，`verify:build` 产物门禁；`minimum_chrome_version` 升至 125；manifest content script 四件套→三件套，`floating-pet.js`/`auto-start.js` 改 `chrome.scripting` 按需动态注册；README/SPEC 按「双语翻译主模式 + 阅读辅助副模式」重写 |
| 21 | options 页仍为经典 imperative 实现，与已迁移的 popup/welcome 两套 UI 体系并存；商店文案与 Release 说明仍是单模式旧口径 | options 迁移至 `src/pages/options`（Lit shell + 11 分区静态模板，`options-controller.js` 与 `@ext/ui/history.js` 动态填充），`REPLACED_BY_BUILD` 增加 options/options-nav/history 四项，三个扩展页全部 Lit 化；`verify:build` 新增 options 路由/主题/侧栏/弹层检查；`_locales` extDescription 与 Release 包内容清单改双模式与构建产物口径 |


### 14.2 遗留 / 观察项
- 视频字幕代码（`video-subtitles.js`、`youtube-captions-bridge.js`、vendor 许可）因 `VIDEO_SUPPORT_ENABLED=false` 不可达，保留待启用。
- API 模式每个新 (provider, endpoint, model, key) 组合会多发一次 128-token 能力探测请求（1 小时缓存）。
- 伴读猫在所有 http/https 页面常驻（STATE_GET + Shadow DOM + 主题探测）。
- Linux 连接器实测覆盖不足；Google 高思考模型等待时间是独立性能问题。
- `welcome.js` 保留两处 `console` 排障日志。

### 14.3 规范符合性核对（chrome-extensions 技能包 Output Checklist）
MV3 ✓ · 图标文件真实存在 ✓ · 无内联脚本/处理器 ✓ · async/await ✓ · SW 无内存态假设 ✓ · `action` 存在 ✓ · offscreen 仅用 runtime 消息 ✓ · 图片引用均为真实文件 ✓ · 内容脚本 rAF 批量 ✓ · `host_permissions` 需在上架前补充措辞（宽泛）· `chrome.action.openPopup`（127+）已有降级提示 · `chrome.storage.setAccessLevel`（136+）已做特性检测。

---

## 15. 修订方式
修改本规范须同步更新受影响章节；涉及消息类型、存储键、连接器协议、策略版本号（`SUPPORT_POLICY_VERSION` / `SENTENCE_GROUPS_POLICY_VERSION`）的变更，必须在「变更记录」登记，并确认连接器安装副本内的共享文件（`gloss.mjs`、`sentence-groups.mjs`、`assistance-stream.mjs`、`personalization.mjs`、`diagnostics.mjs`）已双边同步。
