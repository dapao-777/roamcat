# RoamCat 工程笔记

## 构建与验证

| 命令 | 用途 |
|---|---|
| `npm run build` | Vite 开发构建 → `dist/extension/`（manifest 注入固定 key，供 chrome://extensions 加载） |
| `npm run build:release` | 生产构建（minify、无 key） |
| `npm run build:watch` | watch 模式持续构建 |
| `npm run verify` | 模块图静态门禁（R1–R11，只扫 `roamcat-0.0.1/extension` 与 `connector`） |
| `npm run verify:sites` | 站点档案端到端：fixture 按真实 URL 路由进 Edge 断言 inspect()（加 `--live` 复核真站） |
| `npm test` | `node --test` 单元测试（默认递归扫描 `*.test.*`） |
| `npm run verify:build` | 构建产物门禁：字节比对 + Edge 实际加载 `dist/extension` 冒烟 |
| `npm run verify:ui` | 全界面 UI 门禁：Edge 加载 `dist/extension`，遍历 popup/options 全分区/welcome/reader 与页内挂件（词卡 HUD/任务条/解构卡/toast/选区条/伴读猫全状态），双主题截图 + 断言 → `preview/ui-audit/`（先跑 `npm run build`） |
| `npm run verify:pet` | 伴读猫按钮门禁：真实点击/键盘操作全部悬浮按钮（快捷坞 5 按钮/旋旋翻/缩放/贴边/气泡/摘要窗），断言状态与可及性 → `preview/pet-buttons/` |

## 结构约定

- `roamcat-0.0.1/extension/`：扩展源码层（未迁移部分：manifest、background、content scripts、领域模块、icons/fonts/_locales/local-inference）。**不要直接改 ui/ 下将由构建替代的文件**；`content-ui.js` 同为生成物，改 `src/content-ui/index.js` 后重跑构建。
- `src/`：Vite 项目（Lit 页面应用与共享组件），`src/content-ui/` 为页内 UI lit-html 渲染层（`vite.content-ui.config.mjs` → `extension/content-ui.js` IIFE，manifest 于 content.js 前加载，暴露 `globalThis.RoamCatContentUI`），`@ext` 别名指向扩展源目录。
- `build/`：构建期脚本与 `extension-key.json`（dev 构建的 manifest key 与扩展 ID，公钥可提交，无私钥）。
- `dist/extension/`：构建产物 = 源层拷贝 − `REPLACED_BY_BUILD`（`build/extension-plugin.mjs` 中维护）+ Vite 页面产物 + 变换后的 manifest。
- `preview/`：验证报告与截图（不入库）。

## 注意

- 新源文件须带 `/** @file … */` 中文文件头 + MPL-2.0 尾注（见 `tools/lib/module-graph.cjs` 样例）。
- 主题色唯一来源是 `src/styles/tokens.css` 的 `design-tokens:{light,dark}` 段（`npm run gen:tokens` 生成 `extension/design.js` 供内容脚本；页面经同名别名解析）。**ui.css/welcome.css 等页面样式不得再覆写 `--choice-*`/`--badge-*`/`--nav-active-*` 等主题 token**——曾因此产生页面/挂件双调色板漂移。改色只改 tokens.css；伴读猫 `--pet-*` 深色变量在 `floating-pet.js` 内联（两处：`:host[data-theme]` 与 `@media` 兜底），需同步改。
- dev 构建的扩展 ID 固定为 `build/extension-key.json` 中的 `id`（当前 `afpeggkplomdjjiemgajjgcajieincng`）；改加载目录不影响 ID。连接器订阅服务若绑定旧路径 ID，需重装连接器。
- CSP `script-src 'self'`：产物 HTML 禁止内联脚本与 `on*=` 属性。
- Vite 8 用 `rolldownOptions`（`rollupOptions` 已弃用）；HTML 中 `@ext/` 别名只对 `<script type="module">` 与 `<link rel="stylesheet">` 生效，`img/link[icon]` 需用相对路径。

## 界面多语言（i18n）

- `extension/i18n.js` 是唯一语言运行时：`RoamCatI18n.t(key, vars)` 查 `DICTS.zh/en`（缺键返回 key），`lang()/pref()/setPref()/apply()/onChange()`；偏好键 `roamcat_ui_lang` ∈ `auto|zh|en`，`auto` 回落 `chrome.i18n.getUILanguage()`。
- 改文案先在 i18n.js 双语典加同名键（zh/en 必须对齐，`node tools/check-dict.cjs` 校验），Lit 页用 `src/i18n-runtime.js` 的 `t()`，classic 脚本各自定义 `const T = (k,v)=>RoamCatI18n?.t?.(k,v) ?? k`。
- content script 上下文可能禁止 `chrome.storage`（"Access to storage is not allowed"）：i18n.js 此时自动回退 `STATE_GET`（`publicState.uiLang` 携带偏好），语言变更由 background 的 `storage.onChanged → broadcast()` 经 `SS_REFRESH` 快照推送；新增文案面时同步依赖该链路，勿假设 storage 可用。
- 后台/service-worker 文案用模块顶部 `const M=(zh,en)=>RoamCatI18n.lang()==='en'?en:zh` 就地双语（错误消息会缓存为文本，跨语言切换后按生成时语言显示）。
- `verify:ui` 含英文档段（options/popup/content script 三端断言）；`verify:pet` 断言伴读猫气泡文案——新增 `t()` 键后两者必须重跑。
