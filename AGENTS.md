# RoamCat 工程笔记

## 构建与验证

| 命令 | 用途 |
|---|---|
| `npm run build` | Vite 开发构建 → `dist/extension/`（manifest 注入固定 key，供 chrome://extensions 加载） |
| `npm run build:release` | 生产构建（minify、无 key） |
| `node tools/package-release.mjs` | 发布打包：在 `build:release` 之后运行，按白名单生成 `dist/release/roamcat-<版本>-extension.zip` 与 `SHA256SUMS`（只打包、不上传） |
| `npm run build:watch` | watch 模式持续构建 |
| `npm run verify` | 模块图静态门禁（R1–R12；R1–R11 只扫 `roamcat-0.0.1/extension` 与 `connector`，R12 字号档位另扫 `src/`） |
| `npm run verify:sites` | 站点档案端到端：fixture 按真实 URL 路由进 Edge 断言 inspect()（加 `--live` 复核真站） |
| `npm test` | 单元测试：`tools/run-unit-tests.mjs` 列出 `tools/unit/*.test.mjs` 再交给 `node --test`（Node 20 不展开通配符，故不直接传 glob） |
| `npm run verify:build` | 构建产物门禁：字节比对 + Edge 实际加载 `dist/extension` 冒烟 |
| `npm run verify:ui` | 全界面 UI 门禁：Edge 加载 `dist/extension`，遍历 popup/options 全分区/welcome/reader 与页内挂件（词卡 HUD/任务条/解构卡/toast/选区条/伴读猫全状态），双主题截图 + 断言 → `preview/ui-audit/`（先跑 `npm run build`） |
| `npm run verify:pet` | 伴读猫按钮门禁：真实点击/键盘操作全部悬浮按钮（2×2 快捷按钮/旋旋翻/缩放/贴边探头/气泡/摘要窗），断言状态与可及性 → `preview/pet-buttons/` |
| `npm run verify:options` | 设置页行为门禁：本地 HTTP 服务 `dist/extension` + 模拟 `chrome.*`，断言句子粒度保存/失败回滚、查词按键、阅读记录、宣言弹层、模型列表与「恢复默认阅读偏好」→ `preview/verification.json`（先跑 `npm run build`） |
| `npm run verify:audit` | 真后台端到端审计：Edge 加载 `dist/extension`（host 权限收窄为 127.0.0.1）+ 本地假模型接口，覆盖设置持久化、规则增删、词卡、解构、整页翻译、摘要、伴读猫等 30 项 → `preview/audit/`（先跑 `npm run build`） |
| `npm run promo` | 宣传片流水线（`tools/promo/`）：提取品牌 SVG → 合成 chiptune WAV → Playwright 逐帧 `__seek(t)` 截图（1920×1080@30，可多 worker）→ ffmpeg 合成 `preview/promo/roamcat-intro.mp4`（需 `ffmpeg-static`，`--no-save` 安装；`--skip-frames` 复用已有帧） |

## 结构约定

- `roamcat-0.0.1/extension/`：扩展源码层（未迁移部分：manifest、background、content scripts、领域模块、icons/fonts/_locales/local-inference）。**不要直接改 ui/ 下将由构建替代的文件**；`content-ui.js` 同为生成物，改 `src/content-ui/index.js` 后重跑构建。
- `src/`：Vite 项目（Lit 页面应用与共享组件），`src/content-ui/` 为页内 UI lit-html 渲染层（`vite.content-ui.config.mjs` → `extension/content-ui.js` IIFE，manifest 于 content.js 前加载，暴露 `globalThis.RoamCatContentUI`），`@ext` 别名指向扩展源目录。
- `build/`：构建期脚本与 `extension-key.json`（dev 构建的 manifest key 与扩展 ID，公钥可提交，无私钥）。
- `dist/extension/`：构建产物 = 源层拷贝 − `REPLACED_BY_BUILD`（`build/extension-plugin.mjs` 中维护）+ Vite 页面产物 + 变换后的 manifest。
- `docs/`：GitHub Pages 落地页源（`main` + `/docs` → `dapao-777.github.io/roamcat`）——`index.html`/`zh.html` 双语静态页 + `llms.txt`/`sitemap.xml`/`robots.txt`/`.nojekyll`；OG 图 `docs/assets/og-cover.png` 由 `node tools/capture-social.mjs` 生成（同步产出 `.github/assets/social-preview.png`，需在仓库 Settings → Social preview 手动上传）。
- `preview/`：验证报告与截图（不入库）。

## 注意

- 新源文件须带 `/** @file … */` 中文文件头 + MPL-2.0 尾注（见 `tools/lib/module-graph.cjs` 样例）。
- 主题色唯一来源是 `src/styles/tokens.css` 的 `design-tokens:{light,dark}` 段（`npm run gen:tokens` 生成 `extension/design.js` 供内容脚本；页面经同名别名解析）。**ui.css/welcome.css 等页面样式不得再覆写 `--choice-*`/`--badge-*`/`--nav-active-*` 等主题 token**——曾因此产生页面/挂件双调色板漂移。改色只改 tokens.css；伴读猫 `--pet-*` 深色变量在 `floating-pet.js` 内联（两处：`:host[data-theme]` 与 `@media` 兜底），需同步改。
- 字号只用 `--fs-1…6`（12/13/14/16/20/28，`npm run verify` 的 R12 拦截写死的 px 字号；内容脚本/Shadow DOM 内联写 `var(--fs-k, Npx)` 兜底）。层级只用 `--elev-0/1/2`：页面卡片 0 档（只靠 1px 边框），浮在网页或页面之上的词卡/菜单/挂件 2 档；旧拟物 token（`--face`/`--cast`/`--key-skirt`/`--lacquer` 等）保留名字但已压平，不要再给它们写回渐变或凸起阴影。
- dev 构建的扩展 ID 固定为 `build/extension-key.json` 中的 `id`（当前 `afpeggkplomdjjiemgajjgcajieincng`）；改加载目录不影响 ID。连接器订阅服务若绑定旧路径 ID，需重装连接器。
- CSP `script-src 'self'`：产物 HTML 禁止内联脚本与 `on*=` 属性。
- Vite 8 用 `rolldownOptions`（`rollupOptions` 已弃用）；HTML 中 `@ext/` 别名只对 `<script type="module">` 与 `<link rel="stylesheet">` 生效，`img/link[icon]` 需用相对路径。

## 界面多语言（i18n）

- `extension/i18n.js` 是唯一语言运行时：`RoamCatI18n.t(key, vars)` 查 `DICTS.zh/en`（缺键返回 key），`lang()/pref()/setPref()/apply()/onChange()`；偏好键 `roamcat_ui_lang` ∈ `auto|zh|en`，`auto` 回落 `chrome.i18n.getUILanguage()`。
- 改文案先在 i18n.js 双语典加同名键（zh/en 必须对齐，`node tools/check-dict.cjs` 校验），Lit 页用 `src/i18n-runtime.js` 的 `t()`，classic 脚本各自定义 `const T = (k,v)=>RoamCatI18n?.t?.(k,v) ?? k`。
- content script 上下文可能禁止 `chrome.storage`（"Access to storage is not allowed"）：i18n.js 此时自动回退 `STATE_GET`（`publicState.uiLang` 携带偏好），语言变更由 background 的 `storage.onChanged → broadcast()` 经 `SS_REFRESH` 快照推送；新增文案面时同步依赖该链路，勿假设 storage 可用。
- 后台/service-worker 文案用模块顶部 `const M=(zh,en)=>RoamCatI18n.lang()==='en'?en:zh` 就地双语（错误消息会缓存为文本，跨语言切换后按生成时语言显示）。
- `verify:ui` 含英文档段（options/popup/content script 三端断言）；`verify:pet` 断言伴读猫气泡文案——新增 `t()` 键后两者必须重跑。
