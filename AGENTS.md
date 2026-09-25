# RoamCat 工程笔记

## 构建与验证

| 命令 | 用途 |
|---|---|
| `npm run build` | Vite 开发构建 → `dist/extension/`（manifest 注入固定 key，供 chrome://extensions 加载） |
| `npm run build:release` | 生产构建（minify、无 key） |
| `npm run build:watch` | watch 模式持续构建 |
| `npm run verify` | 模块图静态门禁（R1–R11，只扫 `roamcat-0.0.1/extension` 与 `connector`） |
| `npm test` | `node --test` 单元测试（默认递归扫描 `*.test.*`） |
| `npm run verify:build` | 构建产物门禁：字节比对 + Edge 实际加载 `dist/extension` 冒烟 |

## 结构约定

- `roamcat-0.0.1/extension/`：扩展源码层（未迁移部分：manifest、background、content scripts、领域模块、icons/fonts/_locales/local-inference）。**不要直接改 ui/ 下将由构建替代的文件**；`content-ui.js` 同为生成物，改 `src/content-ui/index.js` 后重跑构建。
- `src/`：Vite 项目（Lit 页面应用与共享组件），`src/content-ui/` 为页内 UI lit-html 渲染层（`vite.content-ui.config.mjs` → `extension/content-ui.js` IIFE，manifest 于 content.js 前加载，暴露 `globalThis.RoamCatContentUI`），`@ext` 别名指向扩展源目录。
- `build/`：构建期脚本与 `extension-key.json`（dev 构建的 manifest key 与扩展 ID，公钥可提交，无私钥）。
- `dist/extension/`：构建产物 = 源层拷贝 − `REPLACED_BY_BUILD`（`build/extension-plugin.mjs` 中维护）+ Vite 页面产物 + 变换后的 manifest。
- `preview/`：验证报告与截图（不入库）。

## 注意

- 新源文件须带 `/** @file … */` 中文文件头 + MPL-2.0 尾注（见 `tools/lib/module-graph.cjs` 样例）。
- dev 构建的扩展 ID 固定为 `build/extension-key.json` 中的 `id`（当前 `afpeggkplomdjjiemgajjgcajieincng`）；改加载目录不影响 ID。连接器订阅服务若绑定旧路径 ID，需重装连接器。
- CSP `script-src 'self'`：产物 HTML 禁止内联脚本与 `on*=` 属性。
- Vite 8 用 `rolldownOptions`（`rollupOptions` 已弃用）；HTML 中 `@ext/` 别名只对 `<script type="module">` 与 `<link rel="stylesheet">` 生效，`img/link[icon]` 需用相对路径。
