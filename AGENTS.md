# RoamCat 工程笔记

完整项目的构建与验证要求 Node.js 22.13+（Node 24 已验证）；随发布包单独安装的本机连接器可用 Node.js 20+（安装器只校验主版本 ≥ 20）。CI 在 Node 22.13.0 与 24 上均跑静态检查、单测及生产/开发构建。

## 构建与验证

`verify:all` 拒绝未知参数、无效门禁名称/并发数，以及过滤后零项的组合；零项运行不会记为通过。

| 命令 | 用途 |
|---|---|
| `npm run build` | Vite 开发构建 → `dist/extension/`（manifest 注入固定 key，供 chrome://extensions 加载） |
| `npm run build:release` | 生产构建（minify、无 key） |
| `node tools/package-release.mjs` | 发布打包：在 `build:release` 之后运行，按白名单生成 `dist/release/roamcat-<版本>-extension.zip` 与 `SHA256SUMS`（只打包、不上传） |
| `npm run build:watch` | `tools/watch-build.mjs` 监听 src/、扩展源码、build/ 与根配置的增删改，合并保存并串行执行完整开发构建（先 content-ui 后页面与源码拷贝），失败后继续监听；忽略自身生成的 content-ui.js，退出时关闭监听 |
| `npm run gen:i18n` | 由 `extension/i18n.js` 生成内容脚本专用的瘦身词典 `extension/i18n-content.js`（改了网页侧文案或网页侧脚本新用了别的命名空间后必须重跑；`i18n-content.test.mjs` 拦截漂移） |
| `npm run verify:all` | 一键跑全部门禁（`tools/run-gates.mjs`）：静态检查（单测/模块图/字典/死代码）失败即停 → 构建一次 → 浏览器门禁 → 生产构建门禁，打印汇总表，日志写 `preview/gates/logs/`、汇总写 `preview/gates/summary.json`；`-- --quick` 跳过站点与生产构建门禁且性能门禁不等休眠，`-- --only=video,livechat` / `-- --skip=sites`，`-- --jobs=2` 浏览器门禁两路并行，`-- --keep-going` 静态失败也继续 |
| `npm run verify` | 模块图静态门禁（R1–R12，约 1 秒；R11 语法检查在单个子进程里用 vm 只编译不执行；R1–R11 只扫 `roamcat-0.0.1/extension` 与 `connector`，R12 字号档位另扫 `src/`） |
| `npm run verify:sites` | 站点档案端到端：fixture 按真实 URL 路由进浏览器断言 inspect()（加 `--live` 复核真站） |
| `npm run verify:service` | 本机常驻连接服务端到端：先断言扩展内置服务地址端口 = 47821，测试副本把这一处地址改到 127.0.0.1 的空闲端口、缩短重试窗口，并把浏览器连接器宿主名换成不存在的名字（回退立刻报「未找到」，不拉起本机真实安装的连接器、不占用真实服务的 47821），浏览器加载 `dist/extension`，预置 `chrome.storage.session` 令牌缓存。先在该端口起冒牌服务（接受 roamcat.v2 握手、拿不出证明）：不回证明 / 伪造证明时断言扩展回退、冒牌服务收不到任何一帧、令牌不出现在握手里、清掉令牌缓存并写 `SERVICE_AUTH` 诊断；再换成带假后端的真 `connector/service.mjs`：缺令牌不连服务、错令牌核对失败回退且不拉起后端、正确令牌双向认证后经 WebSocket 连上、服务停掉后回退 → `preview/connector-service.json`（先跑 `npm run build`；在 Claude 的沙箱里会卡住，要在终端面板里跑） |
| `npm run verify:grok-lockdown` | Grok 连接器锁定门禁（`tools/verify-grok-lockdown.mjs`）：本机真实 Grok CLI + 连接器真实命令行与环境，后端换成 127.0.0.1 假 xAI 接口，断言请求里没有 tools、仍带 json_schema、用户主目录里的金丝雀技能不进提示词，并用改动前的命令行做对照组 → `preview/gates/`（需本机装 Grok CLI，找不到时跳过；不耗订阅额度；不并入 `verify:all`，Grok CLI 升级后重跑） |
| `npm test` | 单元测试：`tools/run-unit-tests.mjs` 列出 `tools/unit/*.test.mjs` 再交给 `node --test`（Node 20 不展开通配符，故不直接传 glob） |
| `npm run verify:build` | 构建产物门禁：字节比对 + 浏览器实际加载 `dist/extension` 冒烟 |
| `npm run verify:release` | 生产构建门禁：先 `build:release` 拷到临时目录、随即恢复开发构建，再断言 manifest 无开发 key 且版本一致、全部脚本可编译、压缩后的源层脚本保留 MPL 头，无头 ego 加载生产版：弹窗/设置页无错、普通网页只有轻量引导、按需注入后阅读引擎可开启 → `preview/gates/release.json` |
| `npm run verify:ui` | 全界面 UI 门禁：浏览器加载 `dist/extension`，遍历 popup/options 全分区/welcome/reader 与页内挂件（词卡 HUD/任务条/解构卡/toast/选区条/伴读猫全状态），双主题截图 + 断言 → `preview/ui-audit/`（先跑 `npm run build`） |
| `npm run verify:pet` | 伴读猫按钮门禁：真实点击/键盘操作全部悬浮按钮（独立的竖排快捷工具栏及其拖动吸附、位置记忆与悬停提示/旋旋翻/缩放/贴边探头/气泡/摘要窗），断言状态、几何与可及性 → `preview/pet-buttons/` |
| `npm run verify:performance` | 性能回归：2000 段无语义根页面的缓存与增量失效、开放 shadow root、历史可见词统计、正文元素反复切换 class 不触发自动辅助重建（隐藏正文块仍重排）、长难句/公式开关经真实后台同步、15000 段阅读器分页、真实 EPUB worker、翻译调度（本地假模型/DeepLX 接口：千行表格只换 class 不重建上下文、流式译文不重复写页面、后台按场景分道与服务并发、机翻子请求并行逐条交付、阅读器 401 即停）与后台 40 秒空闲回收 → `preview/performance/`（先构建；`-- --skip-idle` 只跳过休眠等待） |
| `npm run verify:reader` | 阅读器行为门禁：翻译失败可见、保留译文并重试、持续失败停止而单条失败继续、鉴权/额度错误立即停止且限流不拆条、换书后旧请求不再重试或写入新书、远程文件名与体积限制、真实 EPUB worker 的转义路径与异常实体兼容 → `preview/gates/reader.json`（先构建） |
| `npm run verify:dictation` | 无字幕视频云端听写门禁：YouTube 地址 fixture 上注入 `dist/extension` 的页内脚本，用真实 `captureStream`/MediaRecorder 录播放器音轨（假听写响应），断言暂停提交、续录、手动停止丢弃在途结果、停止后按原时间轴回看、拖动自动停止、播完时最后一段在途则取消 YouTube 自动连播（没在听写时不干预） → `preview/audio-probe/`（先跑 `npm run build`；`--speech-fixture=<音频>` 换成真实语音） |
| `npm run verify:video` | 视频字幕门禁：仿 YouTube 页验证直播提示/双语层、原文稿位置（含原生控件视频包在绝对定位外壳里时排到外壳后面）、字幕外观；真实后台验证初始化与刷新保留偏好；`tools/lib/video-regressions.mjs` 验证关闭重开不残留 pending、原生自动翻译与人工/自动轨道缓存隔离及还原、换视频/卸载废弃旧直播队列、连续设置保存/失败回滚/卸载期间保存 → `preview/gates/video.json`（先跑 `npm run build`） |
| `npm run verify:livechat` | Twitch 直播聊天翻译界面门禁：仿 Twitch 直播页注入 `dist/extension` 的 live-chat.js（后台为桩），断言「译」开关位置与状态、排队圆点（不另起一行）与译文、单词梗/中文跳过、出错提示与红点及恢复、STALE 不提示、限速提示、真实点击关闭并保存、伴读猫 keepOutRight 避让聊天栏 → `preview/gates/livechat.json`（先跑 `npm run build`） |
| `npm run verify:options` | 设置页行为门禁（`tools/verify-options.mjs`）：本地 HTTP 服务 `dist/extension` + 模拟 `chrome.*`，断言句子粒度保存/失败回滚、查词按键、「视频与直播」字幕样式保存/预览/失败回滚、阅读记录、宣言弹层、模型列表与「恢复默认阅读偏好」→ `preview/verification.json`（以控制器写入 `window.optionsState` 为就绪，不用固定等待；先跑 `npm run build`） |
| `npm run verify:audit` | 真后台端到端审计：浏览器加载 `dist/extension`（host 权限收窄为 127.0.0.1）+ 本地假模型接口，覆盖设置持久化、规则增删、词卡、解构、整页翻译（含双语 / 仅译文切换）、摘要、伴读猫等 32 项 → `preview/audit/`（先跑 `npm run build`） |
| `npm run promo` | 宣传片流水线（`tools/promo/`）：提取品牌 SVG → 合成 chiptune WAV → 无头 ego lite 逐帧 `__seek(t)` 截图（1920×1080@30，可多 worker）→ ffmpeg 合成 `preview/promo/roamcat-intro.mp4`（需 `ffmpeg-static`，`--no-save` 安装；`--skip-frames` 复用已有帧） |

浏览器门禁与截图脚本只用本机 **ego lite**，不依赖 Playwright：统一经 `tools/lib/ego.mjs` 以临时配置启动一个独立的无头 ego（自动找 `Program Files/Citro Labs/ego lite/Application/ego.exe`，`ROAMCAT_EGO` 可指定路径），经 Chrome DevTools Protocol 直接驱动（需 Node 22+，用内置 WebSocket），不碰日常 ego 的配置与数据；`ROAMCAT_HEADED=1` 开窗观察。每个测试页开在独立窗口里（扩展看到的 `tab.active` 恒为真）；全新配置首次加载扩展会自动开欢迎引导页，`openBrowser` 启动后先关掉它（引导页是单例，否则扩展可能关掉测试页）。ego 自己在全新配置上也会开首次引导（`chrome://onboarding/`，`--no-first-run` 管不住），引导一打开就请求「设为默认浏览器」并弹出 Windows「默认应用」设置页；是否走引导只看用户数据目录里的 `ego_config.json`（`{"not_first_run":true}`），`openBrowser` 启动前预先写好它，引导根本不出现（若 ego 升级后引导又冒出来，会打警告并把它导航到空白页兜底，不要直接关，否则会触发 ego 的退出流程）。门禁不碰本机安装的订阅连接器：dev 扩展 ID 固定，正好在已装连接器的 allowed_origins 里，不隔离的话一查订阅状态就会拉起真实的 `launch.exe → host.mjs → codex`（Windows Terminal 当默认终端时还会弹出空白控制台窗口，浏览器关掉后变成孤儿进程）。所以 `openBrowser` 加载扩展时实际加载的是临时配置里的副本：`subscription.js` 的三个 NativeMessaging 宿主名换成 `…_gate_absent`，出厂服务地址 47821 换成没人监听的端口（调用方的副本已改过的部分保持不动；写法变了替换落空会直接报错）。门禁里订阅状态一律是「未找到连接器」，要测连接器链路用 `verify:service` 的假服务。构建会把源码指纹写进 `dist/.roamcat-build.json`（`build/source-stamp.mjs`），浏览器门禁启动前核对：源码在构建后改过、产物被手改过或 dist 是生产构建时直接报错要求先 `npm run build`；拷贝或经本地服务读取 dist 的门禁显式调用 `assertFreshDist()`。临时实验可设 `ROAMCAT_ALLOW_STALE_DIST=1` 跳过（只警告）；构建指纹只看 `package.json` 的版本、依赖与模块类型，改 npm scripts 不算过期。门禁里动作之后不用固定等待：按状态轮询到要断言或截图的状态（截图前再等动画与过渡跑完），只有断言「不会发生」时保留观察窗口并注明。新门禁用 `tools/lib/gate-report.mjs` 的 `createGateReport()`（逐项 PASS/FAIL，结尾一行 `GATE <名字>: N 通过，M 失败`，报告写 `preview/gates/<名字>.json`），老门禁结尾补了 `printGateSummary()`，`verify:all` 靠这行收集结果。`verify:ui` 的 `layoutLint()` 版式体检（一字一行竖排、单行省略且无悬停提示的截断、超出视口）覆盖设置页全部分区（1440/1150/480）、普通网页上的弹窗（在网页所在窗口开后台标签页加载 popup.html，它取到的活动标签页就是网页）与引导页窄屏（480/375），新界面与改版式时保持干净。`openBrowser` 启动时清掉一小时前残留的 `roamcat-(ego|audit-ext|service-e2e|release)-*` 临时目录；Ctrl+C / 终止信号先关浏览器、删临时配置再退出。CI（`.github/workflows/ci.yml`）跑模块图、单测、字典、死代码检查，Node 22/24 上再做生产与开发构建；浏览器门禁只在本机跑。新脚本用 `openBrowser()`、`page.locator()` 等该模块接口，不要再引入 Playwright。

## 结构约定

- `roamcat-0.0.1/extension/`：扩展源码层（manifest、background、content scripts、领域模块、`ui/` 共享模块、icons/fonts/_locales/local-inference）。生成物不手改：`content-ui.js`（改 `src/content-ui/index.js` 后重跑构建）、`design.js`（`gen:tokens`）、`i18n-content.js`（`gen:i18n`）。
- `roamcat-0.0.1/connector/`：本机订阅连接器（`service.mjs` 常驻服务、`install.mjs` 安装器、各 CLI 客户端）。
- `src/`：Vite 项目（Lit 页面应用与共享组件），`src/content-ui/` 为页内 UI lit-html 渲染层（`vite.content-ui.config.mjs` → `extension/content-ui.js` IIFE，由 background 于 content.js 前按需注入，暴露 `globalThis.RoamCatContentUI`），`@ext` 别名指向扩展源目录。
- `build/`：构建期脚本与 `extension-key.json`（dev 构建的 manifest key 与扩展 ID，公钥可提交，无私钥）。
- `dist/extension/`：构建产物 = 源层拷贝 − `REPLACED_BY_BUILD`（`build/extension-plugin.mjs` 中维护，页面迁移完成后当前为空）+ Vite 页面产物 + 变换后的 manifest。
- `docs/`：GitHub Pages 落地页源（`main` + `/docs` → `roamcat-dev.github.io/roamcat`）——`index.html`/`zh.html` 双语静态页（head 元数据 + 单个 `@graph` JSON-LD：WebSite / WebPage / SoftwareApplication / SoftwareSourceCode / Person / FAQPage，页面里的 FAQ 与 FAQPage 问题一一对应）+ `404.html`（noindex）+ `llms.txt` / `llms-full.txt`（给 AI 助手读的摘要与完整事实）+ `sitemap.xml`/`robots.txt`/`.nojekyll`；OG 图 `docs/assets/og-cover.png` 由 `node tools/capture-social.mjs` 生成（同步产出 `.github/assets/social-preview.png`，需在仓库 Settings → Social preview 手动上传）。发版时一起改：两个落地页的 `softwareVersion` / `dateModified` / 「最新版本」行 / 页脚日期、`llms.txt` 与 `llms-full.txt` 的版本和日期、`sitemap.xml` 的 `lastmod`，`tools/unit/site-seo.test.mjs` 拦截漂移（数字类事实归 `docs-facts.test.mjs`）。项目站里的 `robots.txt` 爬虫读不到——爬虫只认主机根目录的 `/robots.txt`，`roamcat-dev.github.io/robots.txt` 目前是 404（等于不设限）——所以收录靠在 Google Search Console / Bing Webmaster Tools 里提交 `sitemap.xml`；绑定自定义域名后该文件才在根目录生效，`404.html` 里的绝对地址也要同步改。落地页（`index.html`/`zh.html`/`404.html`）是独立静态页、不能 import tokens，所以 `:root` 调色板（`--paper`/`--card`/`--paper-2`/`--ink`/`--ink-soft`/`--line`/`--amber`）和 `theme-color` 是照抄 `tokens.css` 的 `--rc-canvas`/`--rc-surface`/`--rc-surface-subtle`/`--rc-ink`/`--rc-ink-secondary`/`--rc-line-mid`/`--rc-accent`（`theme-color` 取画布色，必须等于页面底色）；改了 `tokens.css` 里这几个值，要同步这三个页面，`site-seo.test.mjs` 会拦漂移。
- `preview/`：验证报告与截图（不入库）。
- 普通网页静态只加载 `page-bootstrap.js`；伴读猫启用时动态加载 UI 依赖与宠物脚本，阅读/翻译/摘要等实际操作再经 `ENSURE_PAGE_UI` 或 `PAGE_UI_INJECT` 加载阅读引擎。新增网页侧模块要同时维护 `background.js` 注入顺序、`build/gen-i18n-content.mjs` 动态文案扫描清单与模块图门禁。生产构建还会压缩源层 classic `.js`，开发构建仍字节拷贝。
- 阅读器按 80 个正文块分页，目录跳转会切到对应分页；翻译结果按块 ID 保留。EPUB 在独立 worker 中只解压 container/OPF/nav/spine 文本（单文件 8 MiB、合计 32 MiB 上限），换书/关页会取消旧解析。

## 注意

- 新源文件须带 `/** @file … */` 中文文件头 + MPL-2.0 尾注（见 `tools/lib/module-graph.cjs` 样例）。
- 主题色唯一来源是 `src/styles/tokens.css` 的 `design-tokens:{light,dark}` 段（`npm run gen:tokens` 生成 `extension/design.js` 供内容脚本；页面经同名别名解析）。**ui.css/welcome.css 等页面样式不得再覆写 `--choice-*`/`--badge-*`/`--nav-active-*` 等主题 token**——曾因此产生页面/挂件双调色板漂移。改色只改 tokens.css；伴读猫 `--pet-*` 深色变量在 `floating-pet-styles.js` 内联（两处：`:host[data-theme]` 与 `@media` 兜底），需同步改。
- 字号只用 `--fs-1…6`（12/13/14/16/20/28，`npm run verify` 的 R12 拦截写死的 px 字号；内容脚本/Shadow DOM 内联写 `var(--fs-k, Npx)` 兜底）。层级只用 `--elev-0/1/2`：页面卡片 0 档（只靠 1px 边框），浮在网页或页面之上的词卡/菜单/挂件 2 档；旧拟物 token（`--face`/`--cast`/`--key-skirt`/`--lacquer` 等）保留名字但已压平，不要再给它们写回渐变或凸起阴影。
- 响应式断点只用 `max-width` 四档：1100 / 900 / 760 / 560（ui.css、refinement.css、options.css、welcome.css、reader.css 已统一）；设置页侧栏在 761–1100px 自动收成图标栏（`options-app.js` 与 `build/gen-design-tokens.mjs` 两处同步），≤760px 的窄屏外壳（顶部横向导航，放不下就折行、不藏进横向滚动；主区自滚）只写在 `src/pages/options/options.css`，其他样式文件不要再写窄屏侧栏规则。组件内部按自身可用宽度排版时用容器查询（`@container`，如快捷键页的键盘 + 清单），不受上面四档视口断点约束——侧栏展开/收起时同一视口下内容区宽度差约 200px，按视口判断会挤坏组件。`verify:ui` 在 1440/1100/800/600/480/375 断言页头与内容左对齐、主区可视高度 ≥70%、窄屏导航带文字且全部分组可见。
- 衬线字体栈 `--rc-serif` 必须西文字体在前、中文宋体在后（中文字体的 ’ “ ” 是全角字形，排前面会让英文出现「day’ s」空隙）；`refinement.css` 的 `--font-serif` 只引用它，不另写字体列表。
- 阅读解构成分颜色统一经 `RoamCatDesign.structureColor(role, theme)`（`build/gen-design-tokens.mjs` 生成）按文字所在底色取：解构卡传卡片宿主的 `data-theme`（创建时按 `pageTheme()` 设定：伴读猫在时用它的判断，否则用 content-ui 的 `RoamCatContentUI.pageTheme()` 按网页本身明暗，判断不出才跟随系统；伴读猫的 `detectPageTheme` 也复用其中的 `pageThemeHint()`），网页内高亮传正文明暗；不要再按网页正文给卡片里的标签取色。
- dev 构建的扩展 ID 固定为 `build/extension-key.json` 中的 `id`（当前 `afpeggkplomdjjiemgajjgcajieincng`）；改加载目录不影响 ID。连接器订阅服务若绑定旧路径 ID，需重装连接器。
- CSP `script-src 'self'`：产物 HTML 禁止内联脚本与 `on*=` 属性。
- 后台批量翻译与辅助按场景分道（`extension/work-lanes.mjs`）：page / passage / reader / video / liveChat / support / groups / domain 各一道，互不排队；每道同时放行数取这批工作所用服务的并发设置（自备 API 1–10、默认 2，机翻按 `mtConcurrency`，订阅 2），每道至多再排 16 条。真正的额度在内层服务闸门按服务计（每次实际 HTTP/本机调用各占一个名额，含 MyMemory 内部拆包），多场景、多标签页共用一个服务时合计不超过设置；下调上限后等待已有请求自然结束，上调时可立即放行等待者。后台订阅调用合计 2 路（连接器 `MAX_WORK_ITEMS=3` 留 1 个给查词）。视频字幕、直播聊天、选区在闸门里插队（`URGENT_SCENES`）。新增后台批量工作要给 `withBackgroundSlot` 传 `{lane, limit}`，订阅调用包 `backgroundSubscription(operation, urgent, beforeRequest)`（得到名额后再次检查代际与消费者），不要再加全局名额。
- 阅读器与字幕的机翻逐条进度由 `onItemProgress` 只交付完整且通过校验的原条目，分别经 `SS_READER_TRANSLATION_PROGRESS` / `SS_VIDEO_TRANSLATION_PROGRESS` 按随机 `requestId` 关联；阅读器换书/卸载清理监听，字幕回调检查 `sourceGeneration`。模型的半截字符串不能当作已完成机翻写入这些缓存。
- 订阅连接：扩展优先连本机常驻服务（`roamcat-0.0.1/connector/service.mjs`，`ws://127.0.0.1:47821`，握手校验 Host、扩展 Origin 与 `roamcat.v2` 子协议里的扩展随机数，连上后双方凭配对令牌做挑战—应答双向认证：服务先发 hello 证明、扩展用 WebCrypto 核对通过才回 auth 证明、服务回 ready 后才收发请求；令牌由安装器写进服务目录的 `pairing-token`，扩展经 NativeMessaging 宿主的 `pairingToken` 请求取得，只当 HMAC 密钥、从不上线，证明算法 `connector/pairing.mjs` 与 `subscription.js` 两边镜像、单测对齐，见 SPEC 8.4），连不上、拿不到令牌或服务证明不了身份才用 NativeMessaging（核对失败写 `SERVICE_AUTH` 诊断）；`roamcat-0.0.1/connector/install.mjs` 默认一并装服务与登录自启（`--no-service` 跳过）。在 Claude 的 Bash/PowerShell 沙箱里装的连接器只存在于沙箱视图，要装到用户真实环境须在终端面板里运行。
- Vite 8 用 `rolldownOptions`（`rollupOptions` 已弃用）；HTML 中 `@ext/` 别名只对 `<script type="module">` 与 `<link rel="stylesheet">` 生效，`img/link[icon]` 需用相对路径。

## 界面多语言（i18n）

- `extension/i18n.js` 是唯一语言运行时（扩展页与 service worker 加载完整版；网页内容脚本加载 `gen:i18n` 生成的 `i18n-content.js`，运行时代码相同，词典只留网页侧用到的命名空间 `c./vid./pet./fp./ui./domain./design.`）：`RoamCatI18n.t(key, vars)` 查 `DICTS.zh/en`（缺键返回 key），`lang()/pref()/setPref()/apply()/onChange()`；偏好键 `roamcat_ui_lang` ∈ `auto|zh|en`，`auto` 回落 `chrome.i18n.getUILanguage()`。
- 改文案先在 i18n.js 双语典加同名键（zh/en 必须对齐，`node tools/check-dict.cjs` 校验；涉及网页侧文案再跑 `npm run gen:i18n`），Lit 页用 `src/i18n-runtime.js` 的 `t()`，classic 脚本各自定义 `const T = (k,v)=>RoamCatI18n?.t?.(k,v) ?? k`。
- content script 上下文可能禁止 `chrome.storage`（"Access to storage is not allowed"）：i18n.js 此时自动回退 `STATE_GET`（`publicState.uiLang` 携带偏好），语言变更由 background 的 `storage.onChanged → broadcast()` 经 `SS_REFRESH` 快照推送；新增文案面时同步依赖该链路，勿假设 storage 可用。
- 后台/service-worker 文案用模块顶部 `const M=(zh,en)=>RoamCatI18n.lang()==='en'?en:zh` 就地双语（错误消息会缓存为文本，跨语言切换后按生成时语言显示）。
- 扩展页（设置页、弹窗、引导页、阅读器）都要经 `src/i18n-runtime.js` 的 `onUiLangChange()` 订阅语言变化：渲染时才取文案的页面就地 `requestUpdate()`，把文案固化进模块级模板的设置页外壳只能 `location.reload()`；否则在别的扩展页切换语言后会中英混杂。
- `verify:ui` 含英文档段（options/popup/content script 三端断言，且语言在阅读器里切换、断言设置页自动整页换语言）；`verify:pet` 断言伴读猫气泡文案——新增 `t()` 键后两者必须重跑。
