# RoamCat 工程笔记

## 构建与验证

| 命令 | 用途 |
|---|---|
| `npm run build` | Vite 开发构建 → `dist/extension/`（manifest 注入固定 key，供 chrome://extensions 加载） |
| `npm run build:release` | 生产构建（minify、无 key） |
| `node tools/package-release.mjs` | 发布打包：在 `build:release` 之后运行，按白名单生成 `dist/release/roamcat-<版本>-extension.zip` 与 `SHA256SUMS`（只打包、不上传） |
| `npm run build:watch` | watch 模式持续构建 |
| `npm run gen:i18n` | 由 `extension/i18n.js` 生成内容脚本专用的瘦身词典 `extension/i18n-content.js`（改了网页侧文案或网页侧脚本新用了别的命名空间后必须重跑；`i18n-content.test.mjs` 拦截漂移） |
| `npm run verify` | 模块图静态门禁（R1–R12；R1–R11 只扫 `roamcat-0.0.1/extension` 与 `connector`，R12 字号档位另扫 `src/`） |
| `npm run verify:sites` | 站点档案端到端：fixture 按真实 URL 路由进浏览器断言 inspect()（加 `--live` 复核真站） |
| `npm run verify:service` | 本机常驻连接服务端到端：先断言扩展内置服务地址端口 = 47821，再在 127.0.0.1 空闲端口起带假后端的 `connector/service.mjs`（要求配对令牌；测试副本改这一处地址、缩短重试窗口，并把浏览器连接器宿主名换成不存在的名字——回退立刻报「未找到」，不拉起本机真实安装的连接器、不占用真实服务的 47821），浏览器加载 `dist/extension`，预置 `chrome.storage.session` 令牌缓存，断言缺令牌 / 错令牌回退浏览器连接器、正确令牌经 WebSocket 连上、服务停掉后回退 → `preview/connector-service.json`（先跑 `npm run build`） |
| `npm test` | 单元测试：`tools/run-unit-tests.mjs` 列出 `tools/unit/*.test.mjs` 再交给 `node --test`（Node 20 不展开通配符，故不直接传 glob） |
| `npm run verify:build` | 构建产物门禁：字节比对 + 浏览器实际加载 `dist/extension` 冒烟 |
| `npm run verify:ui` | 全界面 UI 门禁：浏览器加载 `dist/extension`，遍历 popup/options 全分区/welcome/reader 与页内挂件（词卡 HUD/任务条/解构卡/toast/选区条/伴读猫全状态），双主题截图 + 断言 → `preview/ui-audit/`（先跑 `npm run build`） |
| `npm run verify:pet` | 伴读猫按钮门禁：真实点击/键盘操作全部悬浮按钮（2×2 快捷按钮/旋旋翻/缩放/贴边探头/气泡/摘要窗），断言状态与可及性 → `preview/pet-buttons/` |
| `npm run verify:performance` | 性能回归：2000 段无语义根页面的缓存与增量失效、开放 shadow root、历史可见词统计、正文元素反复切换 class 不触发自动辅助重建（隐藏正文块仍重排）、15000 段阅读器分页、真实 EPUB worker 与后台 40 秒空闲回收 → `preview/performance/`（先构建；`-- --skip-idle` 只跳过休眠等待） |
| `npm run verify:dictation` | 无字幕视频云端听写门禁：YouTube 地址 fixture 上注入 `dist/extension` 的页内脚本，用真实 `captureStream`/MediaRecorder 录播放器音轨（假听写响应），断言暂停提交、续录、手动停止丢弃在途结果、停止后按原时间轴回看、拖动自动停止、播完时最后一段在途则取消 YouTube 自动连播（没在听写时不干预） → `preview/audio-probe/`（先跑 `npm run build`；`--speech-fixture=<音频>` 换成真实语音） |
| `npm run verify:options` | 设置页行为门禁：本地 HTTP 服务 `dist/extension` + 模拟 `chrome.*`，断言句子粒度保存/失败回滚、查词按键、「视频与直播」字幕样式保存/预览/失败回滚、阅读记录、宣言弹层、模型列表与「恢复默认阅读偏好」→ `preview/verification.json`（先跑 `npm run build`） |
| `npm run verify:audit` | 真后台端到端审计：浏览器加载 `dist/extension`（host 权限收窄为 127.0.0.1）+ 本地假模型接口，覆盖设置持久化、规则增删、词卡、解构、整页翻译、摘要、伴读猫等 30 项 → `preview/audit/`（先跑 `npm run build`） |
| `npm run promo` | 宣传片流水线（`tools/promo/`）：提取品牌 SVG → 合成 chiptune WAV → 无头 ego lite 逐帧 `__seek(t)` 截图（1920×1080@30，可多 worker）→ ffmpeg 合成 `preview/promo/roamcat-intro.mp4`（需 `ffmpeg-static`，`--no-save` 安装；`--skip-frames` 复用已有帧） |

浏览器门禁与截图脚本只用本机 **ego lite**，不依赖 Playwright：统一经 `tools/lib/ego.mjs` 以临时配置启动一个独立的无头 ego（自动找 `Program Files/Citro Labs/ego lite/Application/ego.exe`，`ROAMCAT_EGO` 可指定路径），经 Chrome DevTools Protocol 直接驱动（需 Node 22+，用内置 WebSocket），不碰日常 ego 的配置与数据；`ROAMCAT_HEADED=1` 开窗观察。每个测试页开在独立窗口里（扩展看到的 `tab.active` 恒为真）；全新配置首次加载扩展会自动开欢迎引导页，`openBrowser` 启动后先关掉它（引导页是单例，否则扩展可能关掉测试页）。ego 自己在全新配置上也会开首次引导（`chrome://onboarding/`，`--no-first-run` 管不住），其中会请求「设为默认浏览器」并弹出 Windows「默认应用」设置页；`openBrowser` 连上后把它停掉并导航到空白页（直接关掉会触发 ego 的退出流程）。构建会把源码指纹写进 `dist/.roamcat-build.json`（`build/source-stamp.mjs`），浏览器门禁启动前核对：源码在构建后改过、产物被手改过或 dist 是生产构建时直接报错要求先 `npm run build`；拷贝或经本地服务读取 dist 的门禁显式调用 `assertFreshDist()`。临时实验可设 `ROAMCAT_ALLOW_STALE_DIST=1` 跳过（只警告）。CI（`.github/workflows/ci.yml`）跑模块图、单测、字典、死代码检查，Node 22/24 上再做生产与开发构建；浏览器门禁只在本机跑。新脚本用 `openBrowser()`、`page.locator()` 等该模块接口，不要再引入 Playwright。

## 结构约定

- `roamcat-0.0.1/extension/`：扩展源码层（manifest、background、content scripts、领域模块、`ui/` 共享模块、icons/fonts/_locales/local-inference）。生成物不手改：`content-ui.js`（改 `src/content-ui/index.js` 后重跑构建）、`design.js`（`gen:tokens`）、`i18n-content.js`（`gen:i18n`）。
- `roamcat-0.0.1/connector/`：本机订阅连接器（`service.mjs` 常驻服务、`install.mjs` 安装器、各 CLI 客户端）。
- `src/`：Vite 项目（Lit 页面应用与共享组件），`src/content-ui/` 为页内 UI lit-html 渲染层（`vite.content-ui.config.mjs` → `extension/content-ui.js` IIFE，由 background 于 content.js 前按需注入，暴露 `globalThis.RoamCatContentUI`），`@ext` 别名指向扩展源目录。
- `build/`：构建期脚本与 `extension-key.json`（dev 构建的 manifest key 与扩展 ID，公钥可提交，无私钥）。
- `dist/extension/`：构建产物 = 源层拷贝 − `REPLACED_BY_BUILD`（`build/extension-plugin.mjs` 中维护，页面迁移完成后当前为空）+ Vite 页面产物 + 变换后的 manifest。
- `docs/`：GitHub Pages 落地页源（`main` + `/docs` → `dapao-777.github.io/roamcat`）——`index.html`/`zh.html` 双语静态页 + `llms.txt`/`sitemap.xml`/`robots.txt`/`.nojekyll`；OG 图 `docs/assets/og-cover.png` 由 `node tools/capture-social.mjs` 生成（同步产出 `.github/assets/social-preview.png`，需在仓库 Settings → Social preview 手动上传）。
- `preview/`：验证报告与截图（不入库）。
- 普通网页静态只加载 `page-bootstrap.js`；伴读猫启用时动态加载 UI 依赖与宠物脚本，阅读/翻译/摘要等实际操作再经 `ENSURE_PAGE_UI` 或 `PAGE_UI_INJECT` 加载阅读引擎。新增网页侧模块要同时维护 `background.js` 注入顺序、`build/gen-i18n-content.mjs` 动态文案扫描清单与模块图门禁。生产构建还会压缩源层 classic `.js`，开发构建仍字节拷贝。
- 阅读器按 80 个正文块分页，目录跳转会切到对应分页；翻译结果按块 ID 保留。EPUB 在独立 worker 中只解压 container/OPF/nav/spine 文本（单文件 8 MiB、合计 32 MiB 上限），换书/关页会取消旧解析。

## 注意

- 新源文件须带 `/** @file … */` 中文文件头 + MPL-2.0 尾注（见 `tools/lib/module-graph.cjs` 样例）。
- 主题色唯一来源是 `src/styles/tokens.css` 的 `design-tokens:{light,dark}` 段（`npm run gen:tokens` 生成 `extension/design.js` 供内容脚本；页面经同名别名解析）。**ui.css/welcome.css 等页面样式不得再覆写 `--choice-*`/`--badge-*`/`--nav-active-*` 等主题 token**——曾因此产生页面/挂件双调色板漂移。改色只改 tokens.css；伴读猫 `--pet-*` 深色变量在 `floating-pet-styles.js` 内联（两处：`:host[data-theme]` 与 `@media` 兜底），需同步改。
- 字号只用 `--fs-1…6`（12/13/14/16/20/28，`npm run verify` 的 R12 拦截写死的 px 字号；内容脚本/Shadow DOM 内联写 `var(--fs-k, Npx)` 兜底）。层级只用 `--elev-0/1/2`：页面卡片 0 档（只靠 1px 边框），浮在网页或页面之上的词卡/菜单/挂件 2 档；旧拟物 token（`--face`/`--cast`/`--key-skirt`/`--lacquer` 等）保留名字但已压平，不要再给它们写回渐变或凸起阴影。
- dev 构建的扩展 ID 固定为 `build/extension-key.json` 中的 `id`（当前 `afpeggkplomdjjiemgajjgcajieincng`）；改加载目录不影响 ID。连接器订阅服务若绑定旧路径 ID，需重装连接器。
- CSP `script-src 'self'`：产物 HTML 禁止内联脚本与 `on*=` 属性。
- 订阅连接：扩展优先连本机常驻服务（`roamcat-0.0.1/connector/service.mjs`，`ws://127.0.0.1:47821`，握手校验 Host、扩展 Origin 与配对令牌：令牌由安装器写进服务目录的 `pairing-token`，扩展经 NativeMessaging 宿主的 `pairingToken` 请求取得，放在 `Sec-WebSocket-Protocol` 里，见 SPEC 8.4），连不上才用 NativeMessaging；`roamcat-0.0.1/connector/install.mjs` 默认一并装服务与登录自启（`--no-service` 跳过）。在 Claude 的 Bash/PowerShell 沙箱里装的连接器只存在于沙箱视图，要装到用户真实环境须在终端面板里运行。
- Vite 8 用 `rolldownOptions`（`rollupOptions` 已弃用）；HTML 中 `@ext/` 别名只对 `<script type="module">` 与 `<link rel="stylesheet">` 生效，`img/link[icon]` 需用相对路径。

## 界面多语言（i18n）

- `extension/i18n.js` 是唯一语言运行时（扩展页与 service worker 加载完整版；网页内容脚本加载 `gen:i18n` 生成的 `i18n-content.js`，运行时代码相同，词典只留网页侧用到的命名空间 `c./vid./pet./fp./ui./domain./design.`）：`RoamCatI18n.t(key, vars)` 查 `DICTS.zh/en`（缺键返回 key），`lang()/pref()/setPref()/apply()/onChange()`；偏好键 `roamcat_ui_lang` ∈ `auto|zh|en`，`auto` 回落 `chrome.i18n.getUILanguage()`。
- 改文案先在 i18n.js 双语典加同名键（zh/en 必须对齐，`node tools/check-dict.cjs` 校验；涉及网页侧文案再跑 `npm run gen:i18n`），Lit 页用 `src/i18n-runtime.js` 的 `t()`，classic 脚本各自定义 `const T = (k,v)=>RoamCatI18n?.t?.(k,v) ?? k`。
- content script 上下文可能禁止 `chrome.storage`（"Access to storage is not allowed"）：i18n.js 此时自动回退 `STATE_GET`（`publicState.uiLang` 携带偏好），语言变更由 background 的 `storage.onChanged → broadcast()` 经 `SS_REFRESH` 快照推送；新增文案面时同步依赖该链路，勿假设 storage 可用。
- 后台/service-worker 文案用模块顶部 `const M=(zh,en)=>RoamCatI18n.lang()==='en'?en:zh` 就地双语（错误消息会缓存为文本，跨语言切换后按生成时语言显示）。
- `verify:ui` 含英文档段（options/popup/content script 三端断言）；`verify:pet` 断言伴读猫气泡文案——新增 `t()` 键后两者必须重跑。
