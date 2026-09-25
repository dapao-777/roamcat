# RoamCat 设计系统

RoamCat 的界面语言可以概括成一句话：**纸墨底、暖黑墨、克制的像素细节，再加一层轻拟物的物理控件**。

纸面不是纯白——是米白的 `#faf9f4`；墨色不是纯黑——是暖黑的 `#161511`。
在这层安静的纸墨之上，品牌字标、数字与键帽字用 Silkscreen 像素体，
扫描线猫与圆点波纹给出「数码但温和」的气质；按钮是带底沿裙边的键帽，
开关是铣槽里的瓷珠，徽标是凹刻铭牌——物理质感来自 token 化的材质渐变，
而不是贴图。

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
  `welcome.css`（欢迎沙盒）、`src/styles/base.css` + `motion.css`（页面基线与动效层）
  全部是 token 的消费方，不定义新色值。

## 2. 命名与分层

| 层 | 位置 | 消费方 |
|---|---|---|
| Canonical `--rc-*` | `src/styles/tokens.css` 标记段 | 全部（页面 + 内容脚本 + Shadow DOM） |
| 兼容别名（`--paper`/`--sans`/`--color-*`/组件旧名） | `common` 段尾 | 迁移期既有代码；新代码禁止新增旧名引用 |
| 页面基线 | `src/styles/base.css`（@layer reset/base） | 扩展页 |
| 动效 | `src/styles/motion.css`（@layer motion）+ 动效 token | 扩展页；Shadow DOM 组件内联同款协议 |

`--rc-<族>-<名>` 是唯一 canonical 前缀。族：`surface / ink / line / accent /
teal / violet / amber / emerald / action / green / danger / warning / reading /
shadow / card / choice / input / keycap / badge / btn-primary / nav / toolbar /
glow / type / leading / weight / space / radius / focus / dur / ease / spring /
stagger` 与材质族（`face / rim / edge-hi / inset / cast / press / well-shadow /
emboss / engrave / lacquer / key-* / brass / track / knob / grain`）。

## 3. 设计语汇

### 3.1 表面与墨色

表面五阶（由底到浮层）：

```
--rc-canvas（页面底） < --rc-surface-raised（侧栏/工具栏） < --rc-paper（卡片）
                     < --rc-surface（浮层） < --rc-surface-subtle/-hover（内嵌/悬停）
```

文本墨色四级 + 辅助位：

```
--rc-ink > --rc-ink-secondary > --rc-ink-tertiary > --rc-ink-faint
另有 --rc-ink-dim（次级辅助）、--rc-ink-strong/-soft/-line（纯黑/雾面/描边）
```

### 3.2 主题

`color-scheme` + `[data-theme]` 双通道：`prefers-color-scheme` 决定 auto 默认，
`data-theme="light|dark"` 显式覆盖（`theme-init.js` 在绘制前写入，防闪烁）。
别名在 `common` 段以 `var(--rc-*)` 定义，use-site 解析自动跟随主题。

亮色主题是「纸墨」本体；暗色主题是「石墨漆面」——accent 从暖黑切换为琥珀金
`#f59e0b`，材质渐变随之换成近中性面 + 细高光刃口。

### 3.3 拟物材质层（可选装饰，缺省即退化为扁平）

材质全部是 CSS 渐变/阴影 token，零图片：

| token | 语义 |
|---|---|
| `--rc-face / -raised / -well` | 象牙瓷面 / 抬升面 / 凹井面（左上光源三段渐变） |
| `--rc-rim / -soft`、`--rc-edge-hi` | 沿口描边与受光棱线 |
| `--rc-inset / -soft`、`--rc-cast / -hover`、`--rc-press`、`--rc-well-shadow` | 内嵌高光、外投影、按下塌陷、刻井阴影 |
| `--rc-emboss / --rc-engrave` | 文字凸印 / 凹刻 |
| `--rc-lacquer / -inset / -skirt / -press` | 漆面主按钮（黑漆面或黄铜面） |
| `--rc-key-face / -skirt / -press / -face-deep / -skirt-deep` | 键帽控件：穹顶受光面 + 底沿裙边，按下裙边塌陷下沉 |
| `--rc-brass`、`--rc-track`、`--rc-knob` | 开关的黄铜激活面、铣槽轨道、瓷珠旋钮 |
| `--rc-grain` | 纸面纹理（1px 低透明度横纹） |

这些 token 允许消费方 `var(--face, none)` 退化——不支持或未定义时就是干净的扁平面。

## 4. 排版

| 角色 | 字体栈 | 尺寸 / 行距 | 用在 |
|---|---|---|---|
| 品牌/显示 `--rc-display` | **Silkscreen**（内置 `fonts/slk-400/700.woff2`）→ JetBrains Mono → Courier | 随组件 | ROAMCAT 字标、数字读数、键帽字符、徽章码 |
| 正文/阅读 `--rc-sans` | Noto Serif SC → Source Han Serif → 宋体/SimSun → Georgia | 15px / 1.6 | 扩展页正文；页内词卡、提示等阅读向文本 |
| 界面功能字 `--font-sans`（refinement 层覆盖） | Segoe UI → PingFang SC → Microsoft YaHei | 14px / 1.4（control） | 选项页/弹窗的控件与说明文字 |
| 标题 `--font-serif` | Noto Serif SC 系 | 18–30px / 1.28–1.35 | 选项页 hero 与各分区标题 |
| 等宽 `--rc-mono` | ui-monospace → SFMono → Menlo → Consolas | 随组件 | HUD 标签、词性、诊断码、时间戳 |

字号阶梯：`--rc-type-page-title` 22 / `section-title` 18 / `word-head` 20 /
`body` 15 / `control` 14 / `support` 13。
行距：`title` 1.28 / `body` 1.6 / `control` 1.4 / `support` 1.5。
字重：400 / 500 / 600 / 700 四档。

间距阶梯：`--rc-space-1..12` = 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48px。
圆角：`--rc-radius-1..5` = 3 / 5 / 7 / 9 / 12px，语义位 `control` 6 /
`panel` 9 / `pill` 999。

## 5. 色彩

| 语义 | 亮色 | 暗色 |
|---|---|---|
| 页面底 `--rc-canvas` | `#efeee6` 米灰 | `#0f0f10` |
| 卡片 `--rc-paper` | `#faf9f4` 米白 | `#1b1b1d` |
| 主墨色 `--rc-ink` | `#161511` 暖黑 | `#f2f1ee` |
| 主 accent | `#161511`（墨色即强调） | `#f59e0b` 琥珀金 |
| 辅助强调 `--rc-amber / teal` | `#c26a1b` 赭石 | `#f59e0b` |
| 成功 `--rc-green` | `#8a5a17` | `#10b981` |
| 警示 `--rc-danger` | `#b3261e` | `#f87171` |
| 阅读标记 `--rc-reading-mark` | `#f0e8d2` 纸色高亮 | `rgba(245,158,11,.18)` |

亮色下「墨色即强调」是有意选择：主按钮是漆面黑键，琥珀/赭石只留给
阅读标记、激活态与数据点缀。

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
| 词卡 / 帮助卡 | HUD 布局：词条头 + 内容区 + 操作底栏；瓷面 `face-raised` + accent 微光描边；`hud-slide-in` 入场 |
| 解构下划线 | 主谓宾等角色色条 + 可点开的详情卡（lit part 渲染） |
| 任务状态条 | 右上 pill；伴读猫在场时改由猫的气泡播 status（`speakStatus`） |
| 伴读猫 | Shadow DOM 悬浮件；快捷坞、菜单、摘要窗均走同一套材质 token；贴边态留爪印标签 |
| 弹窗 | 卡片流（当前页辅助 / 模型服务切换 / 解构 / 双语翻译），底部快捷键 hint + 版本号 |
| 选项页 | Swiss 侧栏 + 邮戳卡（stamp card，扫描线悬停动效）+ 双栏服务目录 |
| 欢迎页 | 沙盒引导：banner 字标 + 功能胶囊 + 试玩词卡 |

阅读三层样式（原文 / 标注 / 译文层的样式、字号、颜色、色板）开放给用户自定义，
见 `extension/reading-style.js` 与选项页「显示与解构」。

## 8. 图标

- **界面图标**：`src/components/icons.js`——统一的 24 viewBox 描边 SVG
  （fill none / stroke currentColor / stroke-width 2 / 圆角端点），Lucide 风格，
  替代 emoji；`icon(name,{size,cls})` 输出 lit 模板，页内 IIFE 与页面应用共用。
- **服务商图标**：`extension/icons/providers/*.svg`，LobeHub 图标集（MIT）。
- **品牌资产**：`extension/icons/roamcat.svg`（圆点波纹猫）、
  `roamcat-cat-ink.svg`（扫描线猫）、`icon-16..512.png`。
- 页内所有 SVG 图标 `aria-hidden`，可访问名由外层控件提供。

## 9. 页内 UI 与网站隔离

内容脚本不引用本文件的 `:root` 输出；`design.js` 通过
`RoamCatDesign.cssFor(selector)` 把同一套 token 生成到任意选择器或
Shadow host 上，保证对宿主网站样式零污染——页内组件（词卡、状态条、伴读猫）
在 closed Shadow DOM 里渲染，样式只进不出。
