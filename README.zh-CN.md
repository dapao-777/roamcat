<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="roamcat-0.0.1/extension/icons/roamcat.svg">
    <img src="roamcat-0.0.1/extension/icons/roamcat-light.svg" alt="RoamCat 标志" width="96" height="96">
  </picture>
</p>

<h1 align="center">RoamCat · 随心阅</h1>

<p align="center">
  <strong>像猫一样漫游英文世界——帮助只在需要时出现，读懂了就悄悄退场。</strong><br>
  双语翻译把每段英文旁边配上中文；<br>
  阅读辅助保留整页英文，只给随你进步而渐退的稀疏提示。
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MPL-2.0" src="https://img.shields.io/badge/license-MPL--2.0-blue"></a>
  <a href="https://github.com/dapao-777/roamcat/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dapao-777/roamcat/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="版本 0.4.0" src="https://img.shields.io/badge/version-0.4.0-blue">
  <img alt="Chrome / Edge 125+" src="https://img.shields.io/badge/Chrome%20%2F%20Edge-125%2B-green">
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-V3-blueviolet">
</p>

<p align="center">
  <a href="#-快速开始"><b>快速开始</b></a> ·
  <a href="#-功能一览">功能一览</a> ·
  <a href="#-模型服务">模型服务</a> ·
  <a href="#-常见问题">常见问题</a> ·
  <a href="#-文档">文档</a> ·
  <a href="README.md">English</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-welcome-dark.png">
    <img src=".github/assets/banner-welcome-light.png" alt="RoamCat 欢迎页" width="94%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/dapao-777/roamcat/blob/main/.github/assets/roamcat-intro.mp4" title="观看 34 秒介绍短片（含配乐）">
    <img src=".github/assets/promo-teaser.gif" alt="RoamCat 介绍动画 —— 点击播放含配乐的完整版" width="94%">
  </a><br>
  <sub>▶ 34 秒介绍短片 · 点击片段观看完整版（带音乐）</sub>
</p>

> [!NOTE]
> **0.4.0：思考等级按模型显示官方档位**。从 [Releases](https://github.com/dapao-777/roamcat/releases/latest) 下载安装包或从源码构建，再以开发者模式加载（见[快速开始](#-快速开始)），尚未上架扩展商店。本项目是对开源项目 [RelyLess](https://github.com/rockythink/relyless) 的重构、优化与修复，详见[致谢](#-致谢)。

## ✨ 亮点

- **两种模式，一个引擎**——要么整页中英对照，要么保留英文原文、只在卡住时搭把手。
- **读得懂真实网页**——为 GitHub、Reddit、Hacker News、Stack Exchange、Discourse、dev.to、Lobsters 准备了站点档案，代码、diff、投票署名等构件不打扰阅读；公式原样保留。
- **PDF / EPUB 阅读器**——本地文件和粘贴的文章共用同一套双语引擎。
- **模型自己选**——33 家自备 API、内置离线模型，或复用本机 ChatGPT / Grok / Google CLI 订阅。
- **本地优先**——没有 RoamCat 服务器、没有遥测，阅读记录默认关闭、按站授权。
- **全界面中英双语**——所有界面都能在中英文间切换；页边还有一只伴读猫陪你读，亮色和深色各有一身打扮。

## 🌓 两种模式，一个引擎

| | 🌐 双语翻译 · 主模式 | 📖 阅读辅助 · 副模式 |
|---|---|---|
| **做什么** | 页面英文原位译成中英对照 | 保留英文，只给稀疏提示与按需救援 |
| **怎么用** | 弹窗「翻译本页」或 `Alt+Shift+T`，随阅读位置推进，不后台预译整篇 | 提示随读随减；按住 `D` + 单击查词；划词 / 选段手动救援 |
| **呈现** | 正文段落原位对照，表格卡片原位对应；导航、侧栏等构件以行内小字呈现译文 | 查词卡片 / 顶部词注 / 句子解构下划线 |
| **退出** | 「返回英文」只移除扩展插入的内容 | 提示随读随消，目标是逐渐不再需要提示 |

失败的段落按分级退避自动重试（2.5s → 6s → 14s，按错误码分类），用尽后才露出「重试这一段」——临时限流不会再闪现失败界面。

## 📸 功能一览

**伴读猫**趴在页边，提供阅读开关、文章摘要、设置与快捷键入口；可拖拽、可贴边，每页一只，未启用时完全不注入。它还会跟着网页换装：深色网站上是一团边缘发光的黑麻薯，亮色网站上是奶白麻薯。

<p align="center">
  <img src=".github/assets/pet-summary-dark.png" alt="页内文章摘要卡与伴读猫" width="52%">
  <img src=".github/assets/widget-wordcard-dark.png" alt="查词卡片" width="42%">
</p>

**内置阅读器**打开 PDF、EPUB（也可粘贴文章），「翻译全文」按你的阅读位置逐段生成中文对照。

<p align="center">
  <img src=".github/assets/reader-dark.png" alt="RoamCat 阅读器双语对照" width="88%">
</p>

**设置页与工具栏弹窗**——顶部一眼看到阅读、模型、最近请求三项状态，改动即时保存，支持亮色与深色主题。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/options-dark.png">
    <img src=".github/assets/options-light.png" alt="RoamCat 设置页" width="88%">
  </picture>
</p>

<p align="center">
  <img src=".github/assets/options-zh-dark.png" alt="RoamCat 设置页 · 中文深色" width="60%">
  <img src=".github/assets/popup-dark.png" alt="RoamCat 工具栏弹窗 · 深色" width="24%">
</p>

<details>
<summary><strong>更多：如何读懂真实网页</strong></summary>

- **站点档案**覆盖程序员常驻地——GitHub、Reddit（新旧 UI）、Hacker News、Stack Exchange 系、Discourse、dev.to（Forem）、Lobsters：代码区、diff、文件树、投票与署名构件不进阅读块，归入页面构件分区处理。
- **长难句检测**给含从句的 ≥22 词句子画上琥珀色细下划线——纯本地判定，不调模型。
- **公式保护**让 MathML / KaTeX / MathJax 容器与行内 `$…$` / `\(…\)` / `\[…\]` 不进入翻译单元。
- **弹窗快捷切换**：工具栏弹窗行内展示当前模型服务，展开即可在订阅通道与已存 API 之间切换。
- **Twitch 直播聊天翻译**（默认关闭）：在聊天输入区点「译」，新消息下方补一行简体中文；表情、单个词的梗和中文消息不翻。使用 API 时每个标签页每分钟至多发 12 次请求，避免热门频道把额度烧光。

</details>

## 🔌 模型服务

| 来源 | 内容 |
|---|---|
| **自备 API** | 33 家服务商、8 种协议——OpenAI / DeepSeek / Gemini / Anthropic / xAI / OpenRouter / Ollama / 阿里云 / 火山 / Kimi / 阶跃等。结构化输出能力先探测后降级。 |
| **订阅连接器** | 本机 Native Messaging 复用官方 CLI 权益——Codex CLI（ChatGPT 订阅）、Grok CLI（SuperGrok / X Premium+）、Antigravity `agy`（Google AI Pro / Ultra），免 API Key。 |
| **本地模型** | 内置 `Xenova/all-MiniLM-L6-v2` 在离屏文档中做页面领域识别，不联网、无需下载。 |

## 🚀 快速开始

需要 **Chrome 或 Edge 125+**。

**方式 A：Release 安装包。** 从 [Releases](https://github.com/dapao-777/roamcat/releases/latest) 下载 `roamcat-0.4.0-extension.zip` 并解压。打开 `chrome://extensions`（或 `edge://extensions`），开启**开发者模式**，点**加载已解压的扩展**，选择解压出的 **`roamcat-0.4.0/extension`** 文件夹。要用订阅连接器，在包含 `roamcat-0.4.0/` 的目录里运行 `node roamcat-0.4.0/connector/install.mjs`（需要 Node.js 20.11+）；它会按这个文件夹算出扩展 ID，移动文件夹后要重新运行。

**方式 B：从源码构建**（需要 Node.js 20.11+）：

```sh
git clone https://github.com/dapao-777/roamcat.git
cd roamcat
npm ci
npm run build      # → dist/extension
```

然后打开 `chrome://extensions`（或 `edge://extensions`），开启**开发者模式**，点**加载已解压的扩展**，选择 **`dist/extension`**。

开发构建的扩展 ID 是固定的（`afpeggkplomdjjiemgajjgcajieincng`，来自 `build/extension-key.json`），移动目录也不会让连接器失效。拉取新代码后重新 `npm run build`，再在扩展管理页点重新加载即可。

**可选：订阅连接器。** 让扩展使用你本机已登录的 ChatGPT / Grok / Antigravity CLI：

```sh
node roamcat-0.0.1/connector/install.mjs --extension-id afpeggkplomdjjiemgajjgcajieincng
```

一条命令会注册本机已经装好 CLI 的全部通道（Codex、Grok、`agy`），没装的会跳过。只注册一个通道时再加 `--backend grok`（或 `chatgpt` / `antigravity`）。

同一条命令还会装上**本机常驻连接服务**（只监听 `127.0.0.1:47821`，只接受这个扩展 ID 的连接）并设为登录自启：扩展优先连它，浏览器重启不用重新装连接器，CLI 也一直保持登录；服务没运行时自动改用浏览器连接器。不想装就加 `--no-service`。

连接服务的握手要带一个**配对令牌**：安装命令每次都会生成新令牌，存在只有当前系统用户读得到的目录里，扩展经浏览器连接器自动取得，本机其他账户即使伪造扩展来源也连不进来。所以浏览器里仍要有连接器注册（默认已为 Chrome、Edge 注册）。**从旧版本升级后要重新运行一次上面的安装命令才会启用令牌**，没重装之前服务照旧工作；重装后约 1 分钟内扩展先走浏览器连接器，之后自动改连常驻服务。

## 🔒 本地优先的边界

- 阅读记录默认关闭且按站授权，无痕页面不采集；API Key 只存在 `chrome.storage.local`。
- 密钥不进内容脚本、诊断日志或连接器；内容脚本只能使用 77 种消息中的 **36 种白名单类型**。
- 模型输出全部经结构化校验（`gloss.mjs`）才进入界面；自定义 API 地址强制 HTTPS（仅本机回环允许 HTTP）。
- 页面文本只在你主动调用模型功能时离开本机，直达你配置的服务商。完整说明见[隐私政策](roamcat-0.0.1/PRIVACY.md)。

## ⚖️ 与同类工具的对比

诚实的定位说明——RoamCat 不打算在所有人手里替代谁：

| | **RoamCat** | 沉浸式翻译 | Relingo | 彩云小译 |
|---|---|---|---|---|
| **思路** | 双模式：双语对照*或*保留原文为主的稀疏阅读辅助 | 整页双语翻译 | 按词频分级高亮 + 查词 | 整页与划词翻译 |
| **开源** | ✅ MPL-2.0 | ❌ 闭源 | ❌ 闭源 | ❌ 闭源 |
| **数据路径** | 无自有服务器、无遥测，阅读记录默认关闭 | 文本发往所选翻译服务，另有云端功能 | 云账户体系 | 云端服务 |
| **模型来源** | 33 家自备 API、内置本地模型，或复用本机 ChatGPT / Grok / Google CLI 订阅 | 内置服务 + 部分 AI 模型可自备 Key | 内置 | 内置 |
| **费用** | 免费——只有自选付费 API 才产生费用 | 订阅制免费额度 | 订阅制 | 订阅制 |
| **平台** | Chrome / Edge 125+ | Chrome、Edge、Firefox、Safari、移动端 | Chrome、Edge | Chrome、Edge、App |

想要最省心、平台最全的整页翻译，沉浸式翻译更成熟。想让英文原文始终主导、想要可审计的开源代码、或想复用已有的 AI 订阅而非再买一个——选 RoamCat。同样值得一看的开源邻居：[kiss-translator](https://github.com/fishjar/kiss-translator)、[openai-translator](https://github.com/openai-translator/openai-translator)。

## ❓ 常见问题

<details>
<summary><strong>RoamCat 收费吗？</strong></summary>

不收——MPL-2.0 开源，无账户、无付费档、无遥测。只有你自己接入付费 API 时才需要向该服务商付费；内置本地模型与订阅连接器没有额外成本。
</details>

<details>
<summary><strong>会把我的阅读数据传到哪里吗？</strong></summary>

项目没有自有服务器。阅读记录默认关闭、按站授权；页面文本只在你主动调用模型功能时离开本机，且直达你配置的服务商，不经任何中转。
</details>

<details>
<summary><strong>支持哪些浏览器？</strong></summary>

桌面端 Chrome 与 Edge 125+（Manifest V3）。暂不支持 Firefox 与 Safari。
</details>

<details>
<summary><strong>能整页翻译吗？</strong></summary>

能——双语翻译模式随阅读位置逐段插入中文对照。阅读辅助模式则保持整页英文，只给随读渐退的稀疏提示。
</details>

<details>
<summary><strong>支持 PDF 和 EPUB 吗？</strong></summary>

支持——内置阅读器可打开本地 PDF / EPUB 或粘贴的文章，共用同一套双语引擎。
</details>

<details>
<summary><strong>可以用哪些模型？</strong></summary>

33 家自备 API（OpenAI、DeepSeek、Gemini、Anthropic、xAI、OpenRouter、Ollama、阿里云、火山、Kimi、阶跃……）、内置本地领域识别模型，或经本机连接器复用已登录的 ChatGPT / Grok / Antigravity CLI 订阅——免 API Key。
</details>

<details>
<summary><strong>适合谁？</strong></summary>

日常泡在英文站点上的中文读者——文档、GitHub、Reddit、Hacker News——想要随阅读进步而渐退的帮助，或需要时的中英对照。
</details>

## 🎨 设计语言

**纸墨 × 像素 × 轻拟物**。米白纸面 `#faf9f4` + 暖黑墨色 `#161511`，Silkscreen 像素字体与边缘发光的麻薯猫点缀数码感；控件是带物理反馈的键帽。暗色主题是同一套材质的镜像：**砚台冷墨**——微蓝砚底 `#0b0e13` + 暖象牙字 `#ece7d9` + 瓷白漆主键，琥珀金 `#f0a63c` 只留给语义强调。两种主题下的小号文字都满足 WCAG AA 对比度。

<details>
<summary><strong>设计规格速览</strong></summary>

| 项 | 规格 |
|---|---|
| 界面文字 | 系统无衬线（Segoe UI / PingFang SC / 微软雅黑），14–15px |
| 阅读文本与标题 | 宋体系（Noto Serif SC → 宋体 → Georgia），正文 15px / 行距 1.6 |
| 品牌 / 数字 / 键帽 | Silkscreen 像素体（已内置 woff2，离线可用） |
| 色板 | 浅色：纸 `#faf9f4` + 墨 `#161511`；深色：砚台 `#0b0e13` + 象牙 `#ece7d9` + 琥珀 `#f0a63c` |
| 标志与形象 | 麻薯猫两身打扮——砚底砖上的边缘发光黑猫（`icons/roamcat.svg`）与拿铁砖上的奶白猫（`icons/roamcat-light.svg`），另有单色标；均由 `tools/make-brand-cat.mjs` 生成 |
| 动效 | 80 / 160 / 280 / 440ms 四档 + `linear()` 弹簧曲线，遵守 `prefers-reduced-motion` |

</details>

全部视觉决策收敛在 `src/styles/tokens.css` 一套 `--rc-*` token；页内组件经 Shadow DOM 与 `design.js` 注入同一套 token，不污染网站样式。详见[设计系统](roamcat-0.0.1/docs/design-system.md)、[品牌方案](roamcat-0.0.1/docs/brand.md)与可视化[品牌板](roamcat-0.0.1/docs/brand-board.html)。

## 🏗️ 架构

<details>
<summary><strong>组件图</strong></summary>

```
┌────────────────────────────── 浏览器 ──────────────────────────────────┐
│ 内容脚本（静态九件套，document_idle）                                    │
│   design.js → i18n-content.js → reading-style.js → content-ui.js →     │
│   pet-quotes.js → complexity.js → formula.js → site-profiles.js →      │
│   content.js                                                           │
│ 动态注册（chrome.scripting，按需注入）                                   │
│   · floating-pet.js 伴读猫 · auto-start.js 自动开启                      │
├────────────────────────────────────────────────────────────────────────┤
│ Service Worker：background.js（ES module，无状态）                       │
│   77 种消息路由 · 设置校验与迁移 · 缓存 / 并发 / 看门狗 · 订阅端口          │
├────────────────────────────────────────────────────────────────────────┤
│ 扩展页面：popup / options / welcome / reader                            │
│   src/ 下的 Lit 应用，经 Vite 构建到 dist/extension/ui/                   │
│ 离屏文档：本地 ONNX MiniLM 领域识别                                       │
├────────────────────────────────────────────────────────────────────────┤
│ 本机连接器（Node.js 20+，Native Messaging stdio）                        │
│   host.mjs + codex.mjs / grok.mjs / antigravity.mjs                    │
└────────────────────────────────────────────────────────────────────────┘
```

</details>

- **信任边界**——扩展页（可信）→ 内容脚本（36 种白名单消息）→ 模型输出（校验后才进界面）→ 网页 DOM（只以数据身份进入提示词）。
- **消息协议唯一事实源**——`extension/message-protocol.js` 登记全部 77 种消息与载荷解析器，契约测试保证路由表同步。
- **唯一的双语运行时**——`extension/i18n.js` 收录 1,784 个中英对齐键，扩展页与 Service Worker 共用；内容脚本加载由它生成的 `i18n-content.js`，运行时相同，词典只留网页侧用到的命名空间。
- **无状态 Service Worker**——跨调用状态落在 `chrome.storage` 与 IndexedDB；写操作串行化，长操作带看门狗。

完整工程规范见 [`SPEC.md`](roamcat-0.0.1/SPEC.md)。

## 🛠️ 开发

| 命令 | 用途 |
|---|---|
| `npm run build` · `npm run build:watch` | Vite 开发构建 → `dist/extension`（扩展 ID 固定） |
| `npm test` | 281 例单元测试（经 `tools/run-unit-tests.mjs` 调用 `node --test`） |
| `npm run verify` | 模块图门禁 R1–R11：加载契约、无环、分层方向、文件头、manifest 资源 |
| `npm run verify:build` | 构建产物门禁：字节比对 + 浏览器实际加载冒烟 |
| `npm run verify:ui` | 79 项全界面门禁：页面与挂件遍历、明暗主题、中英文断言，截图 → `preview/ui-audit/` |
| `npm run verify:pet` | 68 项伴读猫门禁：真实点击全部悬浮按钮 |
| `npm run verify:sites` | 站点档案端到端检查：fixture 按真实 URL 路由（`--live` 复核真站） |
| `npm run verify:options` | 设置页行为门禁：保存、失败回滚、重置、模型列表等 |
| `npm run verify:audit` | 30 项端到端审计：浏览器加载真实后台 + 本地假模型 |
| `npm run build:release` · `node tools/package-release.mjs` | 发布构建（不带开发 key）→ `dist/release/roamcat-<版本>-extension.zip` 与 `SHA256SUMS` |
| `npm run gen:tokens` · `npm run gen:i18n` · `node tools/check-dict.cjs` | 由 tokens.css 重新生成 `extension/design.js` · 重新生成内容脚本词典 `extension/i18n-content.js` · 中英字典对齐校验 |

浏览器门禁需要本机 [ego lite](https://lite.ego.app/) 和 Node.js 22+：`tools/lib/ego.mjs` 以临时配置另起一个无头 ego，经 Chrome DevTools Protocol 直接驱动（不用 Playwright）；ego 装在别处时设 `ROAMCAT_EGO` 指向 `ego.exe`。贡献前请读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告。

<details>
<summary><strong>仓库布局</strong></summary>

| 路径 | 内容 |
|------|------|
| [`roamcat-0.0.1/extension/`](roamcat-0.0.1/extension/) | 扩展源码层：background、内容脚本、`i18n.js`、领域模块、本地推理、icons / fonts / `_locales`，以及扩展页共用的 `ui/` 模块与样式 |
| [`roamcat-0.0.1/connector/`](roamcat-0.0.1/connector/) | Native Messaging 宿主与 Codex / Grok / Antigravity 适配 |
| [`src/`](src/) | Vite + Lit 页面应用与共享组件；`src/content-ui` 为页内 lit-html 渲染层 |
| [`build/`](build/) | 构建插件、design tokens 生成与 dev 扩展 key |
| [`tools/`](tools/) | 单元测试、静态与浏览器门禁、品牌与宣传片生成脚本 |
| `dist/extension/` | 构建产物（不入库），在浏览器里加载的就是它 |

</details>

## 🗺️ 路线图

以下为规划方向，可能随进展与反馈调整：

- 阅读中一键切换两种模式。
- 在 PDF / EPUB 阅读器与电子阅读器中提供阅读辅助（稀疏提示）。
- 权限收窄：`host_permissions` 由全站改为 `optional_host_permissions` 按需申请。
- 上架 Chrome Web Store 与 Microsoft Edge Add-ons（文案与权限理由已备于 [`CHROMEWEBSTORE.md`](roamcat-0.0.1/CHROMEWEBSTORE.md)）。

## 📖 文档

| 文档 | 内容 |
|------|------|
| [产品文档](roamcat-0.0.1/README.md) | 功能详情、安装、模型服务配置与隐私说明 |
| [工程规范](roamcat-0.0.1/SPEC.md) | 消息协议、存储模型、安全边界、测试门禁 |
| [设计系统](roamcat-0.0.1/docs/design-system.md) · [品牌方案](roamcat-0.0.1/docs/brand.md) · [品牌板](roamcat-0.0.1/docs/brand-board.html) | token、字体、材质、动效，以及标志与形象用法 |
| [隐私政策](roamcat-0.0.1/PRIVACY.md) | 数据处理与权限用途 |
| [上架清单](roamcat-0.0.1/CHROMEWEBSTORE.md) | 商店文案与逐权限理由 |
| [更新日志](CHANGELOG.md) | 版本变更记录（Keep a Changelog 格式） |
| [贡献指南](CONTRIBUTING.md) · [行为准则](CODE_OF_CONDUCT.md) · [安全政策](SECURITY.md) | 协作与披露流程 |

## 🙏 致谢

RoamCat 基于 [RelyLess](https://github.com/rockythink/relyless) 重构而来——本项目在其开源代码与产品理念之上做了重构、优化与修复（双模式引擎、Vite + Lit 页面构建链、整页双语翻译、订阅连接器等均为此基础上的工作）。感谢原作者 B 站 UP 主 **[停车拾穗](https://live.bilibili.com/392612)** 的开源工作。RelyLess 原仓库未附带许可声明，本仓库自有代码以 MPL-2.0 发布；若上游补充许可要求，本项目将遵循。

## 许可

自有代码采用 [MPL-2.0](LICENSE)。词频数据（CC BY-SA 4.0）、模型与运行时（Apache-2.0 / MIT）、图标（MIT）等第三方资产保留各自许可，见 [NOTICE.txt](roamcat-0.0.1/NOTICE.txt)。
