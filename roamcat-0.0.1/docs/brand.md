# RoamCat 品牌方案（Brand Guidelines）

> 品牌叙事与对外视觉规范。工程实现细节见 `design-system.md`；
> 所有色值以 `src/styles/tokens.css` 为唯一事实源，本文只做语义命名与使用规则。

---

## 1. 品牌核心

| 项 | 内容 |
|---|---|
| 全称 | **RoamCat · 随心阅** |
| 简称 | RoamCat |
| 中文口号 | 少一点依赖，多一点直接读懂。 |
| 英文口号 | Roam the English web like a cat. |
| 一句话定位 | 面向英语阅读的浏览器扩展：双语对照随读随译，阅读辅助保留原文、按需给提示，本地优先。 |

**品牌人格**：像一只猫——好奇、独立、安静陪伴、不黏人。
落到产品上就是四个词：**漫游（roam）、克制（sparse）、诚实（bounded）、陪伴（companion）**。

**气质公式**：纸墨为底 + 数码温和（像素/边缘光）+ 物理控件（轻拟物）。

---

## 2. 标志系统

### 2.1 资产清单

| 资产 | 文件 | 用途 |
|---|---|---|
| 应用图标 | `extension/icons/roamcat.svg`、`icon-16..512.png` | 扩展图标、商店列表、README 头图（砚底版） |
| 亮色 logo | `extension/icons/roamcat-light.svg` | 亮色主题的扩展页（`.rc-logo-light`）与亮色网页上的页内挂件 |
| 麻薯猫单色标 | `extension/icons/roamcat-cat-ink.svg` | 品牌主图形，`fill="currentColor"` 随上下文取色，眼睛与嘴镂空 |
| 圆点波纹 | `extension/icons/dot-wave.svg`（暗版 `dot-wave-dark.svg`） | 页头/页脚装饰带、加载态 |
| 像素星芒 | `extension/icons/roamcat-spark.svg` | 角标、点缀、"AI/新功能"语义位 |

### 2.2 构成

主图形是一团**黑色麻薯猫**：尖耳略外斜、两个白点眼、ω 嘴，轮廓是白→粉→蓝→金的彩虹边缘光，
肚子下沿透出暖色反光，脚下一条发光地平线。它和页面里的伴读猫是同一个角色、同一套几何。

应用图标 = 砚底圆角砖（径向渐变 `#1f2433` → `#0b0e13`，底部微微提亮，radius 28/128）+ 边缘发光的麻薯猫。
亮色版 = 粉 → 淡紫 → 天蓝的对角晨光渐变圆角砖（`#ffdce9` → `#eadff9` → `#cfe6fb`，淡紫细描边）+ 奶白麻薯猫（深色点眼与 ω 嘴、粉蓝金柔光、加粗暖棕描边）；
晨光渐变呼应猫身上的彩虹边缘光，也避免奶白砖与亮色界面的暖白纸面糊成一片（早先的暖拿铁砖有对比但发闷），保证 26–38px 的小尺寸 logo 仍清楚。
扩展页同时放两张图，由 `ui.css` 的 `.rc-logo-dark/.rc-logo-light` 按 `data-theme` 或系统明暗只显示一张；
页内挂件按网页明暗取图（`content.js` 的 `brandIcon()`）。工具栏 PNG 只有砚底版。
全部 logo 资产（`roamcat.svg`、`roamcat-icon-src.svg`、`roamcat-cat-ink.svg`、`icon-16..512.png`、
`docs/assets/roamcat.svg`）与页面插图 `src/components/hero-art.js` 由 `node tools/make-brand-cat.mjs` 一次生成，勿手改。

### 2.3 使用规则

- **留白**：猫图形四周至少留图形高度的 1/4；应用图标圆角砖内猫体约占 70%。
- **最小尺寸**：图形版 ≥ 24px；应用图标 ≥ 16px（16/32px 用加粗简化版：去掉嘴、胡须与色散，边缘光加粗、眼睛放大）。
- **配色**：
  - 亮底：猫体用 `--rc-ink`（`#1c1b18`）；
  - 暗底：猫体用 `--rc-ink`（`#edebe6`），或强调态 `--rc-accent`（`#e8946a`）；
  - `currentColor` 资产直接继承文字色，不要写死；
  - 对外物料（README 头图、商店图、社交头图）用 3.1 的品牌锚点色。
- **禁止**：不拉伸变形、不去掉边缘光只留黑剪影（单色标除外）、不改彩虹光的色序、
  不把彩色版放在与猫体反差不足的纯黑底上而不加圆角砖、不旋转超过 ±15°。

---

## 3. 品牌色板

### 3.1 品牌锚点（对外物料）

| 角色 | 色名 | 值 | 语义 |
|---|---|---|---|
| 纸 | Paper | `#faf9f4` | 米白纸面，对外物料（README 头图、商店图、社交头图、落地页）的底色 |
| 墨 | Ink | `#161511` | 暖黑墨色，对外物料的正文与墨猫 |
| 琥 | Amber | `#f0a63c` | 琥珀金，深色物料的强调色 / 品牌点缀色 |

辅助品牌色：**赭石 `#c26a1b`**、**签名琥 `#d97a2b`**（圆点波纹与营销图形专用）。

> 这组锚点是对外物料的配色。**产品界面的色值一律以 `src/styles/tokens.css` 为准**：
> 自 0.2.0 起界面用「暖纸墨」配色（见 3.2 / 3.3，赭红 / 暖橙强调，不再是琥珀金），
> 两者不完全相同。

无论物料还是界面，强调色都只留给焦点、激活态与阅读标记，不做装饰——强调色出现越少越贵。

### 3.2 亮色主题 · 暖纸墨（产品界面）

| Token | 值 | 用途 |
|---|---|---|
| `--rc-canvas` / `--rc-paper` | `#f7f6f3` | 页面底（暖白）/ 卡片底 |
| `--rc-surface` / `-raised` | `#ffffff` | 卡片 / 浮层 |
| `--rc-surface-subtle` / `-hover` | `#f2f0ec` / `#ebe8e2` | 内嵌 / 悬停 |
| `--rc-ink` | `#1c1b18` | 主文字 |
| `--rc-ink-secondary` / `-tertiary` | `#57534b` / `#6a655c` | 文字阶梯（`-dim`、`-faint` 与 `-tertiary` 同值） |
| `--rc-line` / `-mid` | `#e6e3dc` / `#d5d1c8` | 分隔线 |
| `--rc-accent` | `#9f4d25` | 赭红强调（焦点环、导航激活点） |
| `--rc-amber` | `#b8652a` | 辅助暖色 |
| `--rc-teal` / `--rc-green` | `#2b7149` | 成功 / 稳定 |
| `--rc-violet` | `#6e4fa0` | 冷调对比色（慎用，仅语义位） |
| `--rc-danger` / `--rc-warning` | `#b42318` / `#9a5806` | 警示 / 提醒 |
| `--rc-reading-mark` | `#f6e8db` | 阅读高亮 |
| `--rc-action` / `--rc-on-action` | `#1c1b18` / `#f7f6f3` | 墨色主键 |

### 3.3 深色主题 · 暖炭黑（产品界面）

深色不是"反色"，是另一套情绪：暖炭黑底（非纯黑）+ 暖象牙字 + 暖橙强调。

| Token | 值 | 用途 |
|---|---|---|
| `--rc-canvas` | `#141312` | 暖炭底 |
| `--rc-paper` / `--rc-surface` / `-raised` | `#181715` / `#1d1c1a` / `#22211e` | 层级靠明度阶梯 |
| `--rc-ink` | `#edebe6` | 暖象牙字 |
| `--rc-ink-secondary` / `-tertiary` | `#bab5ab` / `#959084` | 文字阶梯 |
| `--rc-accent` | `#e8946a` | **暖橙接管强调位** |
| `--rc-amber` / `--rc-warning` | `#e5a54b` | 辅助暖色 / 提醒 |
| `--rc-teal` / `--rc-green` / `--rc-emerald` | `#6cc596` | 成功 / 稳定 |
| `--rc-violet` | `#b3a4f0` | 冷调对比 |
| `--rc-danger` | `#f2836b` | 警示 |
| `--rc-reading-mark` | `rgba(232,148,106,.16)` | 阅读高亮 |
| `--rc-action` / `--rc-on-action` | `#edebe6` / `#1a1917` | 象牙主键 |

### 3.4 比例与规则

- **70 / 25 / 5**：约 70% 纸/炭底，25% 墨色文字与线，5% 强调色。
- 语义色（绿/红/黄/紫）只在语义位出现，不做装饰。
- 对外图形（README、商店图、社交头图）统一用：
  纸底 `#faf9f4` + 墨猫 `#161511` + 签名琥 `#d97a2b` 点缀。
- 色票编目号 `RC-xxx`（潘通式 chip 形制）：核心 RC-001 纸 / RC-002 墨 /
  RC-003 琥，浅色 RC-1xx、深色 RC-2xx、伴读猫 RC-3xx——完整对照见
  `brand-board.html`。编目号仅用于设计与对外沟通，工程引用仍以 token 为准。
- 伴读猫是品牌人格的实体化，有独立 `--pet-*` 变量组
  （亮：强调 `#9f4d25` + 界面墨 `#1c1b18`；暗：强调 `#e8946a` + 界面墨 `#edebe6`），
  深色变量在 `floating-pet-styles.js` 里内联两处（`:host([data-theme="dark"])` 与
  `prefers-color-scheme: dark` 兜底），改动须同步。伴读猫有明暗两版：深色是一团黑色麻薯（`#0b0a0e`、白点眼与 ω 嘴、白→粉→蓝→金彩虹边缘光），
  亮色是奶白麻薯（`#fffaf3`、深色五官 `#3a2e26`、粉蓝金柔光 + 暖棕细描边）。SVG 配色全走 `--pet-cat-*`（伴读猫）
  与 `--rc-cat-*`（页面插图，tokens.css 亮/暗两段）两组同名变量，取值必须一致（坐姿与贴边同一张脸）；应用图标与伴读猫是同一只猫。

---

## 4. 字体系统

| 角色 | 字栈 | 用在 |
|---|---|---|
| **品牌/显示** `--rc-display` | **Silkscreen**（内置 `slk-400/700.woff2`，SIL OFL 1.1）→ JetBrains Mono → Courier New | ROAMCAT 字标、数字读数、键帽字符、徽章码、HUD 大数字 |
| **阅读正文** `--rc-serif` | Georgia → Times New Roman → Noto Serif SC → Source Han Serif SC → Songti SC → STSong → SimSun | 词头、例句、预览、阅读器正文、引导页标题等"读"的文本 |
| **界面功能** `--rc-sans` | Segoe UI → PingFang SC → Microsoft YaHei → Noto Sans SC | 选项页/弹窗的控件、说明与标题 |
| **等宽** `--rc-mono` | ui-monospace → SFMono → Menlo → Consolas | HUD 标签、词性、诊断码、时间戳 |

字号只用 6 档（`--fs-1…6` = 12 / 13 / 14 / 16 / 20 / 28px）：页面标题 20 / 分区标题 16 / 词头 20 / 控件 14 / 辅助 13；阅读正文 15 是唯一例外。
行距：标题 1.28 / 正文 1.6 / 控件 1.4 / 辅助 1.5。字重只用 400/500/600/700。

**规则**：

- Silkscreen 只用在**短而响**的位置（字标、数字、单字符键帽）——它是像素体，
  不用来排段落，不排中文。
- 中英混排的阅读文本里，西文走 Georgia、中文落到宋体栈（西文字体必须排在前面，否则中文字体的全角引号会在英文里撑出空隙）；数字读数走 Silkscreen/等宽；不加斜体（中文无斜体）。
- 品牌字标写法：**`ROAMCAT`**（Silkscreen 全大写）或 **`RoamCat · 随心阅`**；
  不写 "Roam Cat"、"roamcat" 全小写（代码与仓库名除外）。

---

## 5. 材质与图形语言

产品界面是**扁平**的：卡片是 1px 描边的卡面，按钮是实心或描边的扁平块，层级只靠边框与
`--elev-0/1/2` 三档阴影（页面卡片 0 档，浮在网页之上的词卡 / 菜单 / 挂件 2 档）。
早期的拟物材质（象牙瓷面、黑漆主键、键帽裙边、铣槽瓷珠、凹刻铭牌、纸纹）在 0.1.0 压平：
对应的 token（`face / lacquer / key-* / brass / track / knob / engrave / emboss / grain`）
保留名字、取值已压平，不要再写回渐变或凸起阴影（详见 `design-system.md` §3.3）。
`brand-board.html` 的「04 MATERIAL」只保留这些材质的历史样张。

**图形元素三件套**：边缘光（猫本体）、圆点波纹（dot-wave）、像素星芒（spark）。
彩虹边缘光只用在猫身上；界面控件仍拒绝玻璃拟态、霓虹渐变、3D 渲染贴图。

---

## 6. 动效语气

- 时长四档：80 / 160 / 280 / 440ms；交错入场步距 32ms。
- 弹簧优先：开关旋钮、卡片入场走 `linear()` 弹簧曲线（`spring-soft / spring-pop`），
  不用匀速 ease。
- 弹层协议统一 `allow-discrete` + `@starting-style`。
- `prefers-reduced-motion` 全局收缩，弹层保留 80ms 淡入——动效是礼貌，不是表演。

---

## 7. 图标

- 界面图标：`src/components/icons.js`，24 viewBox 描边 SVG（stroke 2 / 圆角端点），
  Lucide 风格，**替代 emoji**。
- 服务商图标：`icons/providers/*.svg`，LobeHub 图标集（MIT）。
- 页内 SVG 一律 `aria-hidden`，可访问名交给外层控件。

---

## 8. 语气与文案（Voice）

中英双语产品，语气一致：**诚实、克制、把选择权交给用户**。

- 说"提示会随阅读渐退"，不说"智能学习你的习惯"；
- 说"可能超时、失败或不完整"，不承诺效果；
- 中文是"退路不是禁区"，帮助"少打扰也保留选择"——文案照此口径。

| 写 | 不写 |
|---|---|
| 「翻译本页」「返回英文」 | 「一键全译」「AI 智能翻译」 |
| 「按需求助」「稀疏提示」 | 「沉浸式学习」「高效背单词」 |
| 「本地优先」「数据去向说清楚」 | 「完全离线」「绝对隐私」 |

---

## 9. 应用速查

| 场景 | 配方 |
|---|---|
| 商店/仓库头图 | 纸底 `#faf9f4` + `roamcat.svg` 圆角砖 + Silkscreen `ROAMCAT` 字标 + `· 随心阅` |
| 社交头像 | `roamcat.svg` 圆角砖原图（勿裁圆） |
| 深色物料 | 砚底 `#0b0e13` + 彩色边缘光麻薯猫（或象牙色单色标 `#ece7d9`）+ 琥 `#f0a63c` 点缀 |
| 徽章/贴纸 | 邮戳卡样式：卡面 + 描边 + 像素星芒 |
| 加载/过渡 | dot-wave 圆点波纹（墨 `#161511` + 签名琥 `#d97a2b`） |

落地约束（与工程链对齐）：新色只进 `tokens.css` 后 `npm run gen:tokens`；
页面样式不得覆写主题 token；伴读猫 `--pet-*` 深色变量在 `floating-pet-styles.js` 里内联两处，需同步改。
