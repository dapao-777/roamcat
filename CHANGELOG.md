# 更新日志

本项目的版本历史。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

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

### 已知限制

- 视频字幕辅助代码保留但未启用（`VIDEO_SUPPORT_ENABLED = false`）。
- `host_permissions` 仍为宽泛的 `http(s)://*/*`，计划改为 `optional_host_permissions` 按需申请。
- 未上架商店；扩展仅支持开发者模式加载（直接加载 `roamcat-0.0.1/extension` 时 ID 与目录路径绑定；`npm run build` 产物 ID 固定）。

[0.0.1]: https://github.com/dapao-777/roamcat
