# RoamCat 设计系统

**唯一事实源：`src/tokens.css`**。所有视觉决策（颜色、排版、间距、圆角、阴影、动效）
先改 tokens.css，再运行 `npm run gen:tokens` 重新生成 `extension/design.js`；
单元测试 `design-tokens.test.mjs` 会断言两者同步，手工编辑 design.js 会被 CI 拒绝。

## 分层

| 层 | 位置 | 消费方 |
|---|---|---|
| Canonical `--rc-*` | `src/tokens.css` 三个标记段 | 全部（页面 + 内容脚本 + Shadow DOM） |
| 旧名别名（`--paper`/`--sans`/`--color-*`/组件旧名） | tokens.css `common` 段尾 | 迁移期既有代码；新代码禁止新增旧名引用 |
| 页面基线 | `src/styles/base.css`（@layer reset/base） | 扩展页 |
| 动效 | `src/styles/motion.css`（@layer motion）+ tokens.css 动效 token | 扩展页；Shadow DOM 组件内联同款协议 |

## 命名

- `--rc-<族>-<名>`：唯一 canonical 前缀。族：surface/ink/line/accent/teal/violet/amber/
  emerald/action/green/danger/warning/reading/shadow/card/choice/input/keycap/badge/
  btn-primary/nav/toolbar/glow/type/leading/weight/space/radius/focus/dur/ease/spring/stagger。
- 文本墨色四阶：`--rc-ink` > `--rc-ink-secondary` > `--rc-ink-tertiary` > `--rc-ink-faint`，
  另有 `--rc-ink-dim`（次级辅助）、`--rc-ink-strong/-soft/-line`（强/雾/描边）。
- 表面五阶：`--rc-canvas`（页面底）< `--rc-surface-raised`（侧栏）< `--rc-paper`（卡片）
  < `--rc-surface`（浮层）< `--rc-surface-subtle/-hover`（内嵌/悬停）。

## 主题

- `color-scheme` + `[data-theme]` 双通道：`prefers-color-scheme` 决定 auto，
  `data-theme="light|dark"` 显式覆盖（theme-init.js 早期写入，防闪烁）。
- 别名在 `common` 段以 `var(--rc-*)` 定义，use-site 解析自动跟随主题，无需重复。

## 动效

- 时长：`--rc-dur-instant/fast/med/slow`（80/160/280/440ms）；交错 `--rc-stagger-step`。
- 缓动：`--rc-ease-standard/-out/-in` + `linear()` 弹簧 `--rc-spring-soft/-pop`。
- 顶层弹层协议：`allow-discrete` + `overlay` + `@starting-style`（见 motion.css 注释）。
- `prefers-reduced-motion`：全局收缩，弹层保留 80ms 淡入（motion.css 末尾）。

## 页面内 UI 与网站隔离

内容脚本不引用本文件的 `:root` 输出；`design.js` 通过 `RoamCatDesign.cssFor(selector)`
把同一套 token 生成到任意选择器/Shadow host 上，保证网站根节点零污染。
