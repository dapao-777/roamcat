# RoamCat 设计系统

RoamCat 的界面语言可以概括成一句话：**暖纸墨底、暖黑墨、克制的像素细节，再加一层扁平的控件**。

纸面不是纯白——亮色是暖白的 `#f7f6f3`，卡片是白色；墨色不是纯黑——是暖黑的 `#1c1b18`。
在这层安静的纸墨之上，品牌字标、数字与键帽字用 Silkscreen 像素体，
边缘光麻薯猫与圆点波纹给出「数码但温和」的气质；控件是 1px 描边的扁平卡片与按钮，
层级只靠边框和 `--elev-0/1/2` 三档阴影。早期的拟物材质（键帽裙边、铣槽瓷珠、
凹刻铭牌）在 0.1.0 压平，旧 token 名字保留、取值一律平面（见 §3.3）。

本文档是这套语言的完整说明：设计语汇 → token 管线 → 排版 → 色彩与材质 →
动效 → 组件语汇 → 页内隔离。

---

## 1. 唯一事实源与生成链

**所有视觉决策的唯一事实源是 `src/styles/tokens.css`。**

```
src/styles/tokens.css            ← 唯一手写处（common / light / dark 三个标记段）
        │  npm run gen:tokens
        ▼
extension/design.js              ← 生成物（RoamCatDesign.cssFor(selector)）
        │  供内容脚本 / Shadow DOM / 伴读猫消费
```

- 改任何 token 值只改 `tokens.css`，然后 `npm run gen:tokens`；
  `design-tokens.test.mjs` 断言两者同步，手改 `design.js` 会被 CI 拒绝。
- tokens.css 三个标记段：`common`（排版/间距/圆角/焦点/动效/材质 + 兼容别名）、
  `light`、`dark`。段内只允许 `--name: value;` 与 `color-scheme` 声明。
- `extension/ui/ui.css`（共享界面皮肤）、`refinement.css`（纸墨精修层）、
  `welcome.css`（欢迎沙盒）、`src/styles/motion.css`（动效层）
  全部是 token 的消费方，不定义新色值。

## 2. 命名与分层

| 层 | 位置 | 消费方 |
|---|---|---|
| Canonical `--rc-*` | `src/styles/tokens.css` 标记段 | 全部（页面 + 内容脚本 + Shadow DOM） |
| 兼容别名（`--paper`/`--sans`/`--color-*`/组件旧名） | `common` 段尾 | 迁移期既有代码；新代码禁止新增旧名引用 |
| 页面基线 | `extension/ui/ui.css` 顶部（选区色、细滚动条、等宽字体等全局细节） | 扩展页 |
| 动效 | `src/styles/motion.css`（@layer motion）+ 动效 token | 扩展页；Shadow DOM 组件内联同款协议 |

`--rc-<族>-<名>` 是唯一 canonical 前缀。族：`surface / ink / line / accent /
teal / violet / amber / emerald / action / green / danger / warning / reading /
shadow / card / choice / input / keycap / badge / btn-primary / nav / toolbar /
glow / type / leading / weight / space / radius / focus / dur / ease / spring /
stagger` 与材质族（`face / rim / edge-hi / inset / cast / press / well-shadow /
emboss / engrave / lacquer / key-* / brass / track / knob / grain`，取值已压平，见 §3.3）。

## 3. 设计语汇

### 3.1 表面与墨色

表面：

| token | 亮色 | 暗色 | 用在 |
|---|---|---|---|
| `--rc-canvas` | `#f7f6f3` | `#141312` | 页面底 |
| `--rc-paper` | `#f7f6f3` | `#181715` | 卡片底（亮色与画布同色，层次靠白色的 `--rc-surface` 卡片拉开） |
| `--rc-surface` / `--rc-surface-raised` | `#ffffff` / `#ffffff` | `#1d1c1a` / `#22211e` | 卡片、浮层 / 抬升面 |
| `--rc-surface-subtle` / `-hover` | `#f2f0ec` / `#ebe8e2` | `#191816` / `#272522` | 内嵌 / 悬停 |

文本墨色：

```
--rc-ink > --rc-ink-secondary > --rc-ink-tertiary（--rc-ink-dim、--rc-ink-faint 取同一值）
另有 --rc-ink-strong/-soft/-line（纯黑/雾面/描边）
```

弱化文字取同一值，在最亮与最暗的卡面上都 ≥ 4.5:1（WCAG AA 小字）。

### 3.2 主题

`color-scheme` + `[data-theme]` 双通道：`prefers-color-scheme` 决定 auto 默认，
`data-theme="light|dark"` 显式覆盖（`theme-init.js` 在绘制前写入，防闪烁）。
别名在 `common` 段以 `var(--rc-*)` 定义，use-site 解析自动跟随主题。

亮色主题是「暖纸墨」：暖白画布 + 白色卡片 + 墨黑字，强调色 `--rc-accent` 是赭红
`#9f4d25`；暗色主题是「暖炭黑」：`#141312` 暖炭底、`#edebe6` 暖象牙字，强调色提亮为
暖橙 `#e8946a`。两套主题都没有渐变材质，层级靠 1px 边框与 `--elev-*` 阴影。

### 3.3 材质层（已压平）

早期的拟物材质（象牙瓷面、键帽裙边、铣槽瓷珠、凹刻铭牌）在 0.1.0 压平。下面这些
token 仍保留名字、供组件引用，但取值一律平面（`tokens.css` 的「材质层（已压平）」段）。
**不要再给它们写回渐变或凸起阴影**；层级只用 `--elev-0/1/2`：页面卡片 0 档（只靠 1px
边框），浮在网页或页面之上的词卡 / 菜单 / 挂件 2 档。

| token | 现在的取值 |
|---|---|
| `--rc-face / -raised / -well / -panel`、`--rc-lacquer`、`--rc-brass`、`--rc-grain`、`--rc-key-face / -face-deep` | `none` |
| `--rc-edge-hi` | `transparent` |
| `--rc-inset / -soft`、`--rc-cast`、`--rc-well-shadow`、`--rc-emboss / --rc-engrave`、`--rc-track`、`--rc-key-skirt / -skirt-hover / -skirt-deep`、`--rc-lacquer-inset / -skirt` | 无阴影（`0 0 0 0 transparent`） |
| `--rc-press`、`--rc-key-press`、`--rc-lacquer-press` | 按下时一道浅内阴影 |
| `--rc-cast-hover` | `--rc-shadow-low`（悬停时的轻微抬升） |
| `--rc-rim / -soft` | 1px 描边色 |
| `--rc-knob` | 开关滑块的实色（亮 `#ffffff` / 暗 `#edebe6`） |

消费方可以继续写 `var(--face, none)`，取到的就是干净的扁平面。

## 4. 排版

| 角色 | 字体栈 | 尺寸 / 行距 | 用在 |
|---|---|---|---|
| 品牌/显示 `--rc-display` | **Silkscreen**（内置 `fonts/slk-400/700.woff2`）→ JetBrains Mono → Courier New | 随组件 | ROAMCAT 字标、数字读数、键帽字符、徽章码 |
| 界面功能字 `--rc-sans` / `--rc-ui`（别名 `--font-sans`） | Segoe UI → PingFang SC → Microsoft YaHei → Noto Sans SC | 控件 14px / 1.4，辅助 13px / 1.5 | 扩展页的控件、说明文字与标题 |
| 衬线 `--rc-serif`（别名 `--font-serif`） | Georgia → Times New Roman → Noto Serif SC → Source Han Serif SC → Songti SC → STSong → SimSun | 正文 15px / 1.6 | 阅读内容（词头、例句、预览、阅读器正文）、引导页标题、设置页品牌标题与印章数字 |
| 等宽 `--rc-mono` | ui-monospace → SFMono → Menlo → Consolas | 随组件 | HUD 标签、词性、诊断码、时间戳 |

衬线栈里**西文字体必须排在中文宋体前面**：中文字体里的 ’ “ ” 是全角字形，排前面会让英文
出现「day’ s」式空隙；中文字符 Georgia 没有，会自动回落到后面的宋体。界面其余文字一律无衬线。

字号档位：`--fs-1…6`（即 `--rc-fs-*`）= 12 / 13 / 14 / 16 / 20 / 28px，界面文字只用这 6 档
（`npm run verify` 的 R12 拦截写死的 px 字号）；例外只有阅读正文 `--rc-type-body`（15px）与展示字
（Logo、引导页大标题）。语义位：`--rc-type-page-title` = 20、`section-title` = 16、`word-head` = 20、
`control` = 14、`support` = 13。
行距：`title` 1.28 / `body` 1.6 / `control` 1.4 / `support` 1.5。
字重：400 / 500 / 600 / 700 四档。

间距阶梯：`--rc-space-1..12` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px。
圆角：`--rc-radius-1..5` = 3 / 5 / 7 / 9 / 12px，语义位 `control` 6 /
`panel` 9 / `pill` 999。

## 5. 色彩

| 语义 | 亮色 | 暗色 |
|---|---|---|
| 页面底 `--rc-canvas` | `#f7f6f3` 暖白 | `#141312` 暖炭黑 |
| 卡片 `--rc-surface` | `#ffffff` | `#1d1c1a` |
| 主墨色 `--rc-ink` | `#1c1b18` 暖黑 | `#edebe6` 暖象牙 |
| 强调 `--rc-accent` | `#9f4d25` 赭红 | `#e8946a` 暖橙 |
| 辅助 `--rc-amber` | `#b8652a` | `#e5a54b` |
| 成功 / 稳定 `--rc-green`（= `--rc-teal`） | `#2b7149` | `#6cc596` |
| 紫 `--rc-violet` | `#6e4fa0` | `#b3a4f0` |
| 警示 `--rc-danger` | `#b42318` | `#f2836b` |
| 提醒 `--rc-warning` | `#9a5806` | `#e5a54b` |
| 阅读标记 `--rc-reading-mark` | `#f6e8db` | `rgba(232,148,106,.16)` |
| 主按钮 `--rc-action` / `--rc-on-action` | `#1c1b18` / `#f7f6f3` | `#edebe6` / `#1a1917` |

亮色下主按钮是墨色实心按钮，暗色下是象牙实心按钮；强调色 `--rc-accent` 用于焦点环、
导航激活点与阅读标记，其余语义色只出现在语义位（成功 / 警示 / 提醒）。

## 6. 动效

- 时长四档：`--rc-dur-instant/fast/med/slow` = 80 / 160 / 280 / 440ms；
  交错入场步距 `--rc-stagger-step` 32ms。
- 缓动：`--rc-ease-standard/-out/-in` + `linear()` 弹簧 `--rc-spring-soft/-pop`
  （开关旋钮、卡片入场用弹簧曲线，不走匀速 ease）。
- 顶层弹层协议：`allow-discrete` + `overlay` + `@starting-style`。
- `prefers-reduced-motion` 全局收缩，弹层保留 80ms 淡入兜底。

## 7. 组件语汇

| 组件 | 气质要点 |
|---|---|
| 词卡 / 帮助卡 | HUD 布局：词条头 + 内容区 + 操作底栏；扁平卡面（`--rc-surface`）+ 1px 描边 + 浮层阴影；`hud-slide-in` 入场 |
| 解构下划线 | 主谓宾等角色色条 + 可点开的详情卡（lit part 渲染） |
| 任务状态条 | 右上 pill；伴读猫在场时改由猫的气泡播 status（`speakStatus`） |
| 伴读猫 | Shadow DOM 悬浮件；快捷坞、菜单、摘要窗均走同一套 `--pet-*` 变量（扁平按钮 + 浮层阴影）；贴边态留爪印标签 |
| 弹窗 | 卡片流（当前页辅助 / 模型服务切换 / 解构 / 双语翻译），底部快捷键 hint + 版本号 |
| 选项页 | Swiss 侧栏 + 邮戳卡（stamp card，麻薯猫插图）+ 双栏服务目录 |
| 欢迎页 | 沙盒引导：banner 字标 + 功能胶囊 + 试玩词卡 |

阅读三层样式（原文 / 标注 / 译文层的样式、字号、颜色、色板）开放给用户自定义，
见 `extension/reading-style.js` 与选项页「显示与解构」。

## 8. 图标

- **界面图标**：`src/components/icons.js`——统一的 24 viewBox 描边 SVG
  （fill none / stroke currentColor / stroke-width 2 / 圆角端点），Lucide 风格，
  替代 emoji；`icon(name,{size,cls})` 输出 lit 模板，页内 IIFE 与页面应用共用。
- **服务商图标**：`extension/icons/providers/*.svg`，LobeHub 图标集（MIT）。
- **品牌资产**：`extension/icons/roamcat.svg`（砚底圆角砖上的边缘光麻薯猫）、
  `roamcat-light.svg`（粉蓝晨光砖上的奶白版）、`roamcat-cat-ink.svg`（麻薯猫单色标）、
  `dot-wave.svg` / `dot-wave-dark.svg`（圆点波纹）、`roamcat-spark.svg`、`icon-16..512.png`；
  前几项与 PNG 图标由 `tools/make-brand-cat.mjs` 生成，勿手改（详见 `brand.md`）。
- 页内所有 SVG 图标 `aria-hidden`，可访问名由外层控件提供。

## 9. 页内 UI 与网站隔离

内容脚本不引用本文件的 `:root` 输出；`design.js` 通过
`RoamCatDesign.cssFor(selector)` 把同一套 token 生成到任意选择器或
Shadow host 上，保证对宿主网站样式零污染——页内组件在 Shadow DOM 里渲染
（词卡、状态条等是 closed 模式，伴读猫是 open 模式），样式只进不出。
