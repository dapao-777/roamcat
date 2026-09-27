# 更新日志

本项目的版本历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### 已有

- **全界面中英双语**：新增 `extension/i18n.js` 运行时字典（约 1,600 键双语对齐），设置页、弹窗、引导页、阅读器、页内挂件、伴读猫与后台错误消息统一切换；偏好 `roamcat_ui_lang` 支持跟随浏览器/中文/English，语言变更经 `SS_REFRESH` 快照即时同步所有页面与内容脚本（含 storage 受限上下文的 `STATE_GET` 回退）；各页顶栏提供语言循环钮。
- **深色主题重设计**：砚台冷墨材质——微蓝砚底 `#0b0e13`、暖象牙字、瓷白漆主键、琥珀金收敛为语义强调；`ui.css` 重复 token 块清除，主题色回归 `src/styles/tokens.css` 单一事实源；新增 `--rc-face-panel` 大面板材质。
- **欢迎页改版**：材质接入新 token 体系，顶栏新增主题/语言循环钮，移除点阵分隔带。
- **新门禁**：`npm run verify:ui`（77 项：全页面/挂件遍历、明暗主题、中英文断言、溢出与控制台检查）、`npm run verify:pet`（65 项：伴读猫全部按钮真实点击）；`node tools/check-dict.cjs` 双语典对齐校验。
- **程序员站点档案**：新增 `site-profiles.js`（content script 九件套之一）——按 hostname/生成器匹配 GitHub、Reddit（新旧 UI）、Hacker News、Stack Exchange 系、Discourse、dev.to（Forem）、Lobsters，向 SKIP 体系注入站点级跳过/构件选择器并可指定阅读根；代码区、diff、文件树、署名/时间戳/投票/标签、侧栏与页眉页脚不再进阅读块，构件区归入整页翻译的 chrome 分区。新增 `npm run verify:sites` fixture 验收（`--live` 复核真站）。
- **整页翻译失败恢复升级**：失败单元由「仅自动重试一次」改为分级退避重试（默认 2.5s→6s→14s，共 3 次）——批级失败按错误码分类（限流/HTTP/解析类可重试，鉴权/协议/封装类直接失败），可重试时整泵进入一拍冷却避免持续捶打；退避期间单元为静默 `retrying` 态不渲染失败 UI，状态条显示「重试中 N」，耗尽后才露出「重试这一段」。

## [0.0.1] - 2026-09

预发布版。RoamCat · 随心阅 首个可运行快照。

### 已有

- 双模式产品形态：**主模式**整页双语翻译（会话锚定 `document.body`，按 `article` / `content` / `chrome` 三级区域调度渲染——正文原位对照、导航/侧栏/页眉页脚等构件以行内小字呈现并按文本去重；失败段可重试）+ **副模式**阅读辅助（稀疏英文提示 hint、按需中文救援 rescue、查词卡片、句子结构解构；手动入口覆盖全页，自动标注限正文区域）。
- Shadow DOM 伴读猫快捷入口（`chrome.scripting` 按需注册，未启用不注入）；快捷键 `Alt+Shift+S`（辅助开关）/ `Alt+Shift+T`（整页双语页）。
- 本地领域分类：`Xenova/all-MiniLM-L6-v2` 在离屏文档 + Worker 中运行，不联网。
- 自备 API：26 家服务商、8 种协议，`json_schema` 能力实测缓存。
- 订阅连接器：ChatGPT（Codex app-server）、Grok、Antigravity 三个 Native Messaging 适配。
- Vite + Lit 页面构建链：popup / options / welcome 三个扩展页与页内 UI（词卡/解构卡/状态条/已认识 toast/伴读猫骨架，`src/content-ui` → `content-ui.js` IIFE）已迁移，`npm run build` → `dist/extension`（dev 固定扩展 ID），`verify:build` 产物门禁。
- 本地优先隐私：阅读历史默认关闭且按站授权、IndexedDB 90 天保留、无痕不采集、无 `chrome.storage.sync`、无遥测。
- 诊断导出与清理工具；诊断镜像到连接器侧 jsonl（256KB 轮转、0600 权限）。
- **PDF / 电子书阅读器**：`ui/reader.html` 扩展页——http(s) `.pdf` 导航自动重定向（`settings.pdfReader` 可关）、右键菜单「在阅读器中打开」、本地文件选择器；PDF 走 pdfjs-dist 文本提取 + 行重组，EPUB 走 fflate 解包 + 轻量 XHTML 切块；「翻译全文」按 `READER_TRANSLATE`（可信扩展页，passage 作用域、1–4 项/12K 字符批次）逐段生成中文。
- **阅读增强（本地分析）**：`complexity.js` 长难句判定（≥22 词且含从句/多层标点，或 ≥34 词）在正文区给琥珀色下划线提示；`formula.js` 公式保护——MathML/KaTeX/MathJax 容器并入 SKIP_HARD 不进翻译单元，行内 `$…$`/`\(…\)`/`\[…\]`/`$$…$$`/`\begin{}` 以等宽标记（`$` 需数学信号防误伤价格）。两项均有设置开关，包壳可逆且对翻译提取透明。

### 已知限制

- 视频字幕辅助代码保留但未启用（`VIDEO_SUPPORT_ENABLED = false`）。
- `host_permissions` 仍为宽泛的 `http(s)://*/*`，计划改为 `optional_host_permissions` 按需申请。
- 未上架商店；扩展仅支持开发者模式加载（直接加载 `roamcat-0.0.1/extension` 时 ID 与目录路径绑定；`npm run build` 产物 ID 固定）。

[0.0.1]: https://github.com/dapao-777/roamcat
