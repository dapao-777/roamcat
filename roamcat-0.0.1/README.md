<p align="center">
  <img src="extension/icons/roamcat.svg" alt="RoamCat Logo" width="96" height="96">
</p>

<h1 align="center">RoamCat · 随心阅</h1>

<p align="center">少一点依赖，多一点直接读懂。</p>

RoamCat 是一个面向英语阅读的 Chrome / Edge 扩展，按双模式组织：

- **双语翻译（主模式）**：点「翻译本页」后立即开始，随阅读位置处理整页英文——正文、侧栏、导航、页脚等区域都纳入；正文段落原位插入对照译文，导航与页面构件区域以行内小字呈现译文，不破坏布局。
- **阅读辅助（副模式）**：保留网页上的真实英文，只在需要时给出稀疏的简明英文提示、局部中文说明和可选的阅读解构。

两个模式共用同一条本地优先的模型链路与同一套数据边界。自动辅助只面向能可靠识别的主要阅读区域；划词、选段翻译与查词卡片在全页（含侧栏与导航）可用，输入框、表单、代码块与交互控件不处理；结果仍取决于所选模型，可能超时、失败或不完整。

> 当前版本：`v0.0.1` prerelease。尚未发布到 Chrome Web Store 或 Microsoft Edge Add-ons。

## 产品理念

读英文有两种真实的时刻：想顺畅读完一篇，和想靠自己读下去。RoamCat 把这两种需要整理成两个可以按需切换的模式，而不是揉成一种折中体验。

**双语翻译是主模式：先把内容读完。** 原文保留、译文原位对照，随你的阅读位置推进；不后台预译整篇，失败段落可单独重试，随时返回英文。翻译是工具不是目的——读完后撤掉它，页面恢复原样。

**阅读辅助是副模式：试着少依赖一点。** 保留英文和阅读节奏，优先用简明英文解释当前语境中的难点；英文解释仍不够时，可以主动请求局部中文说明。支持可以是提示、仅标记或安静不展示——目标不是让你看更多提示，而是逐渐不再需要那么多提示。

**两个模式共享同一些边界。**

- **少打扰，也保留选择。** 辅助由你开关，也可以由你主动求助；不把每次阅读变成背词、打卡或掌握度考试。
- **中文是退路，不是禁区。** 先读懂眼前的内容，比坚持某种“正确”的学习方式更重要。
- **帮助有边界，数据也一样。** 本地优先不等于完全离线；模型请求的数据去向应当说清楚，阅读记录、摘要与远程个性化分析由你明确开启。具体范围见[数据与隐私](#数据与隐私)。

我们更看重：你是否读完了真正想读的内容，以及下一次能否少求助一点。这是产品的设计方向，不是对学习效果的保证。

安装后可在 **设置 → 使用说明** 按阅读场景查看指南：词义不确定时用注释，长句读不顺时用阅读解构，提示太多时调整帮助，需要大意时请求局部翻译。标记与词注、渐退与恢复、模型请求及数据隐私的说明融入对应场景；查词按键会跟随当前设置。

网页中的查词卡片、阅读解构卡片、翻译操作条和状态反馈均带有 RoamCat 来源标识；原文标记、顶部词注和结构下划线不添加 Logo，也不新增常驻悬浮入口。

## 主要能力

- 本页双语翻译按阅读位置推进：保留英文、译文原位插入；表格和卡片原位对应，失败段落可单独重试，随时返回英文。
- 阅读辅助保留英文原文，在词、短语和句子附近提供有限提示；需要时可主动请求局部中文说明。
- 可配置提示密度、查词方式、显示样式、领域识别、固定术语和网站规则。
- 阅读记录、摘要与远程个性化分析需明确开启；本地求助词档案默认开启，可关闭或清理。
- 模型服务可选择 26 家自备 API 之一，或通过本机连接器使用官方 Codex CLI 可访问的 ChatGPT 订阅权益、官方 Grok CLI 可访问的 SuperGrok / X Premium+ 订阅权益，以及官方 Antigravity CLI（agy）可访问的 Google AI Pro / Ultra 订阅权益。
- 内置本地领域识别模型，随扩展提供，不需要首次运行时另行下载。

模型输出不是事实保证。网络、额度、权限、模型兼容性、内容安全策略和响应格式都可能导致请求失败；失败时不应把未确认结果当作可靠翻译。

### 使用本页双语翻译

工具栏弹窗的 **本页双语翻译 → 翻译本页** 会立即开始翻译。`Alt+Shift+T` 打开同一入口并直接开始；浏览器不支持自动打开时，请点击工具栏图标。快捷键可在浏览器扩展快捷键页修改，原有 `Alt+Shift+S` 不变。

进度按正文单元计数，区分已译、待阅读、失败和跳过。只处理视口附近正文，不后台预译整篇；无法安全原位插入的特殊布局保留英文并报告跳过。失败段落只在手动重试时重新请求，已成功部分不会重发。停止保留已有译文，点「继续」即可接着未完成段落；返回英文只移除扩展插入物，不回滚站点更新。已发出的请求可能继续计费。

使用 ChatGPT 订阅连接器时，扩展与连接器须一起更新，并重新运行连接器安装程序；本次全文协议不兼容旧连接器。

## 路线图

以下为规划中的方向，可能随实现进展与反馈调整，不构成承诺：

- **双模式切换交互**：产品已按「双语翻译主模式 + 阅读辅助副模式」组织；在阅读中一键切换两个模式的交互正在实现。
- **界面层现代化**：扩展页面迁移到 Vite + Lit 与设计 token 体系（popup / options / welcome 已迁移，页内 UI 进行中）。
- **阅读辅助覆盖更多载体**（副模式方向）：
  - PDF 阅读支持；
  - 电子阅读器支持。
- **权限收敛与上架**：`host_permissions` 改为按需申请；Chrome Web Store / Edge Add-ons 上架。

## 从 Release 安装

要求 Chrome 或 Edge **125 及以上版本**。

1. 从 GitHub Releases 下载 `roamcat-0.0.1.zip`。
2. 解压后会得到 `roamcat-0.0.1/`，其中包含：
   - `extension/`（`npm run build:release` 产物重命名）
   - `connector/`
   - `README.md`
   - `LICENSE`
   - `NOTICE.txt`
3. 打开扩展管理页：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
4. 开启“开发者模式”。
5. 选择“加载已解压的扩展”，指向解压后的 **`extension/` 目录**。

Release 包已经包含运行所需文件和本地模型，不包含源码开发依赖；使用 API 模式时无需安装 npm 依赖，也无需构建。

请把解压后的目录放在一个长期不变的位置。未打包扩展的 ID 与目录位置相关：移动目录可能改变扩展 ID，并使本机连接器失效。升级时应保持现有目录路径不变，在原位置替换版本内容，然后在扩展管理页重新加载。

## 配置模型服务

在扩展设置的“模型服务”中选择一种服务来源。

### 自备 API

填写服务商、API Key、模型 ID 和必要的 Base URL，并按界面提示授予对应服务域名的访问权限。API Key 和服务配置保存在浏览器扩展的本机存储中；调用时，密钥和请求内容会直接发送给你配置的服务端点。

API 的账户、费用、额度、地区可用性、数据处理条款和所需权限均由你与服务商负责。RoamCat 不附带 API 额度，也不承诺第三方服务免费、持续可用或不留存数据。

Windows 上可以使用浏览器扩展的 API 路径，以及 ChatGPT / Grok / Google（Antigravity）订阅连接器。ChatGPT 连接器在 Windows 上通过 `codex.cmd` 经 shell 启动；若安装程序找不到 Codex，可用 `--codex` 指定完整路径。

### Grok 订阅连接器（macOS / Linux / Windows）

连接器要求：

- macOS、Linux 或 Windows；
- Node.js 20 或更新版本；
- 官方 [Grok CLI](https://x.ai/cli)，且 `grok --version` 可正常运行。

可先安装 Grok CLI：

```sh
npm install -g @xai-official/grok
```

Windows 也可用：

```powershell
irm https://x.ai/cli/install.ps1 | iex
```

然后在解压包根目录运行安装程序。必须把下面的占位符换成扩展管理页显示的、**你自己的实际扩展 ID**：

```sh
node connector/install.mjs --extension-id <YOUR_ACTUAL_EXTENSION_ID> --backend grok
```

默认会为 Chrome 和 Edge 注册连接器。安装后重新加载扩展，在“模型服务”中选择 **Grok 订阅**，点击“刷新账户与模型”，并按需完成 Grok 登录。登录走官方 `auth.x.ai` 设备码流程，使用 SuperGrok 或 X Premium+ 的订阅权益，而不是 xAI API 按量计费。

Grok 订阅是否包含可用 CLI 权益、可选模型和调用额度由 xAI 账户状态决定，订阅不等于无限或保证可用。

### Google 订阅连接器（macOS / Linux / Windows）

连接器要求：

- macOS、Linux 或 Windows；
- Node.js 20 或更新版本；
- 官方 Antigravity CLI（`agy`），且 `agy --version` 可正常运行。

可先安装 Antigravity CLI：

macOS / Linux：

```sh
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Windows（PowerShell）：

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

先在终端运行 `agy`，按提示用你的 Google 账号（Google AI Pro / Ultra 订阅）完成登录。登录态保存在系统钥匙串中，连接器直接复用，不在扩展内走网页登录。

然后在解压包根目录运行安装程序。必须把下面的占位符换成扩展管理页显示的、**你自己的实际扩展 ID**：

```sh
node connector/install.mjs --extension-id <YOUR_ACTUAL_EXTENSION_ID> --backend antigravity
```

默认会为 Chrome 和 Edge 注册连接器。安装后重新加载扩展，在“模型服务”中选择 **Google 订阅**，点击“刷新账户与模型”即可使用；模型列表来自 `agy models`（如 Gemini 3.8 Flash、Gemini 3.1 Pro、Claude Sonnet / Opus 4.6、GPT-OSS 120B 等，以你的订阅配额为准）。

说明：扩展内的“登录”按钮对 Google 订阅只会给出指引，不会打开登录页；登录与退出（`agy` 内输入 `/logout`）都请在终端里完成。Google 订阅的可用模型与调用额度（周配额 / 5 小时配额）由 Google 账户状态决定，订阅不等于无限或保证可用。

### ChatGPT 订阅连接器（macOS / Linux / Windows）

连接器要求：

- macOS、Linux 或 Windows；
- Node.js 20 或更新版本；
- 官方 [OpenAI Codex CLI](https://github.com/openai/codex)，且 `codex --version` 可正常运行。Windows 上 npm 全局安装落盘为 `codex.cmd`，安装程序会自动查找 `codex.exe` / `codex.cmd` / `codex.bat`，找不到时可用 `--codex` 指定完整路径。

可先安装 Codex CLI：

```sh
npm install -g @openai/codex
```

然后在解压包根目录运行安装程序。必须把下面的占位符换成扩展管理页显示的、**你自己的实际扩展 ID**：

```sh
node connector/install.mjs --extension-id <YOUR_ACTUAL_EXTENSION_ID>
```

不要复制他人的扩展 ID，也不要把任何特定电脑上的 ID 写进脚本或公开配置。默认会为 Chrome 和 Edge 注册连接器；可用 `--browser chrome`、`--browser edge` 或逗号分隔的列表限制目标浏览器（另支持 `chromium`、`chrome-beta`、`chrome-testing`，仅注册显式指定的浏览器；`--extension-id` 支持逗号分隔的多个 ID）。安装后重新加载扩展，在“模型服务”中点击“刷新账户与模型”，并按需完成 ChatGPT 登录。

移动扩展目录后，浏览器可能生成新 ID；此时必须使用新的实际 ID 重新安装连接器。更稳妥的升级方式是始终保留原目录位置。连接器安装程序实现了 macOS / Linux / Windows 的 Native Messaging 注册，目前以 macOS 实测为主；Linux 仍需更多验证，Windows 上 ChatGPT 连接器为新增支持（经 `codex.cmd` + shell 启动），如遇启动失败请用 `--codex` 指定完整路径后重试。重装/更新不会覆盖连接器已有的登录态（`auth.json` 仅缺失时才从 `~/.codex` 复制）。

ChatGPT 订阅是否包含可用 Codex 权益、可选模型和调用额度由 OpenAI 账户状态决定，订阅不等于无限或保证可用。

## 数据与隐私

“本地优先”不等于“所有处理都离线”。本地领域识别和本机记录不需要把整页上传到 RoamCat 自有服务器；项目本身不提供中转云服务。但使用 API、ChatGPT 订阅连接器、Grok 订阅连接器、Google（Antigravity）订阅连接器或 Jev（Requesty）判定服务时，完成任务所需的内容会发送给你选择的模型服务商：

- 普通辅助会发送目标词句及适用的页面标题、章节信息和上下文；自动预备的文章上下文最多 12,000 字符，较短文章可能整体包含在内。请求同时包含任务指令与结构化输出约束。
- 选择远程领域识别（订阅连接器、自定义 API 或 Jev 增强判定）时，会发送标题和经过长度限制的正文样本；默认本地领域识别不需要该远程请求。Jev 自定义密钥与接口地址保存在本机。
- 主动翻译选段时，会发送所选片段及有限上下文。视频字幕支持暂时隐藏，不挂载播放器入口；已有视频偏好保留。
- 本页双语翻译仅在确认后发送附近正文及有限上下文：标题、所在章节各最多 160 字符，相邻正文前后各最多 400 字符。每批最多四项、源文本合计最多 4,000 字符，源文本加上下文最多 12,000 字符；不读取输入框、隐藏正文或视频字幕。不会因此额外生成摘要、写入全文阅读事件或个人词档案；成功译文仅进入五分钟、最多 256 项的后台内存缓存。
- 如果明确开启阅读摘要，会发送长度受限的阅读样本；如果进一步开启个性化分析，会发送近 30 天内有限的查询、例句、摘要和客观活动统计证据。

请求载荷不主动包含页面网址，但服务商仍可获得正常网络请求元数据，并可能按照其自身条款记录请求、账户和内容。RoamCat 无法承诺第三方或自建 API 服务端不留存数据；请在使用前检查所选服务商的隐私与保留政策。

扩展设置中的边界如下：

- “记住求助词与支持偏好”默认开启；关闭后，不再读取或更新个人词档案；原有档案会保留，除非在“数据与隐私”中清理。
- “阅读记录”需要明确开启并添加允许的网站；关闭采集不会自动删除已有记录。
- 阅读摘要和个性化分析是阅读记录之上的独立开关，没有授权时不会运行。
- 预备解释和有限上下文缓存只保留在当前浏览器会话；个人词档案不保存原句、标题或来源网址。
- 无痕页面不采集阅读记录。可在“数据与隐私”中导出或清理本机数据。

## 从源码开发

仓库根目录包含本目录（产品包 `roamcat-0.0.1/`）、`src/` 页面应用层、`build/` 构建脚本、`tools/` 验证脚本和单元测试，检出体积约 48 MB。`package.json` 保持 `private: true` 是为了防止误发布到 npm，不影响 GitHub 源码公开。

要求 Node.js **20.11 或更新版本**（Node 24 已验证）。静态检查与单元测试均为零依赖；浏览器加载请先构建：

```sh
git clone https://github.com/dapao-777/roamcat.git
cd roamcat
npm ci
npm run build         # Vite 构建 → dist/extension（dev 注入固定 key，扩展 ID 固定）
npm run verify        # 模块图静态门禁
npm test              # 单元测试（node --test tools/unit/**/*.test.mjs）
npm run verify:build  # 构建产物门禁 + Edge 实际加载冒烟
```

开发时在 `chrome://extensions` 加载 **`dist/extension`**；也可以免构建直接加载 `roamcat-0.0.1/extension`（页面为被构建替代前的经典实现，ID 随目录路径变化）。

本机浏览器回归脚本（Playwright + 本机 Edge）在 `tools/` 下，需先 `npm ci` 安装 `playwright-core`（或设置 `PLAYWRIGHT_CORE_PATH`）；截图与 JSON 报告输出到 `preview/`（不入库）。

目录概览：

- `roamcat-0.0.1/extension/`：Manifest V3 扩展源层、本地模型与运行时资源、Lit 应用共用的 `ui/` 模块与样式。
- `roamcat-0.0.1/connector/`：ChatGPT / Grok / Antigravity 订阅 Native Messaging 连接器。
- `src/`：Vite + Lit 页面应用与共享组件；设计 token 唯一事实源 `src/tokens.css`。
- `build/`：构建期脚本与 dev 扩展 key。
- `tools/`：模块图门禁、单元测试、构建产物门禁、浏览器回归脚本。

词频数据与本地模型的生成脚本、Release 打包工具目前在维护者的源码工作区中，尚未纳入本仓库；Release ZIP 与 `roamcat-0.0.1/` 内容对应（`extension/` 为 `npm run build:release` 产物，另含 `connector/` 与说明/许可文件）。

## 许可与第三方材料

项目自有代码采用 [Mozilla Public License 2.0](LICENSE)。Copyright 2026 fenghua。

仓库和 Release 包含采用 CC BY-SA 4.0、Apache-2.0、MIT 等不同许可的词频数据、模型、运行时、图标和适配代码；它们不会因与本项目一起分发而改按 MPL-2.0 许可。汇总见 [NOTICE.txt](NOTICE.txt)，完整第三方声明随对应资源保留在 `extension/` 子目录中。
