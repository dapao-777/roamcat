/**
 * @file extension/floating-pet-styles.js
 * 文件职责：伴读猫 Shadow DOM 样式表（classic script，禁 ESM 语法）——亮/暗双主题的 --pet-* 变量、
 *   猫体/贴边/快捷按钮/语音气泡/摘要窗等全部挂件样式。
 * 主要内容：globalThis.RoamCatPetParts.getPetStyles()，返回拼上 design token 的整段 CSS 文本。
 * 模块边界：只产出字符串，不触碰 DOM；伴读猫 --pet-* 深色变量在本文件两处（:host[data-theme] 与 @media 兜底），
 *   改色须同步；须排在 floating-pet.js 之前注入；必须保持非 ESM（module-graph R1 强制）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  const parts = (globalThis.RoamCatPetParts ||= {});

  // CSS for isolated Shadow DOM with Light & Dark support
  function getPetStyles() {
    const designTokens = globalThis.RoamCatDesign?.cssFor ? globalThis.RoamCatDesign.cssFor(':host') : '';
    return `
      ${designTokens}

      :host {
        display: block !important;
        position: fixed !important;
        width: calc(64px * var(--pet-scale, 1)) !important;
        height: calc(68px * var(--pet-scale, 1)) !important;
        overflow: visible !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
        font-size: var(--fs-3, 14px) !important;
        line-height: 1.5 !important;
        color-scheme: light dark;
      }

      :host, :host([data-theme="light"]) {
        color-scheme: light;
        color: var(--pet-ink, #0f172a);
        --pet-cat-color: #0b0a0e;
        /* 亮色伴读猫：奶白麻薯 + 粉蓝金柔光 + 暖棕细描边（SVG 配色变量，见 renderCatSvg）。 */
        --pet-cat-body: #fffaf3;
        --pet-cat-face: #3a2e26;
        --pet-cat-whisker: #9a8a7e;
        --pet-cat-whisker-under: transparent;
        --pet-cat-line: rgba(96, 72, 54, 0.55);
        --pet-cat-rim-0: #ffc2d8;
        --pet-cat-rim-1: #f9bfe0;
        --pet-cat-rim-2: #a9d6ff;
        --pet-cat-rim-3: #b8ecf5;
        --pet-cat-rim-4: #ffd08f;
        --pet-cat-under-0: #ffd2b0;
        --pet-cat-under-1: #e8d6ff;
        --pet-cat-under-2: #d2e8ff;
        --pet-cat-ear-0: #ffd3de;
        --pet-cat-ear-1: #fff4ef;
        --pet-cat-floor-0: #ead8ca;
        --pet-cat-floor-1: #dcc6b4;
        --pet-cat-floor-2: #e6d9cf;
        --pet-cat-bloom: 0.5;
        --pet-cat-chroma: 0.3;
        --pet-cat-hover: #9f4d25;
        --pet-cat-glow: drop-shadow(0 2px 5px rgba(90, 64, 40, 0.18));
        --pet-cat-glow-hover: drop-shadow(0 3px 10px rgba(249, 191, 224, 0.7));
        --pet-primary: #9f4d25;
        --pet-primary-soft: #f7ebe3;
        --pet-primary-hover: #8c421f;
        --pet-accent: #1c1b18;
        --pet-surface: #ffffff;
        --pet-surface-elevated: #ffffff;
        --pet-line: #e6e3dc;
        --pet-line-subtle: rgba(28, 27, 24, 0.06);
        --pet-ink: #1c1b18;
        --pet-muted: #6a655c;
        --pet-tag-bg: rgba(28, 27, 24, 0.04);
        --pet-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        --pet-shadow-md: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
        --pet-shadow-lg: 0 16px 36px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06);
        /* 扁平按钮（elev-2 浮层）：face=实色面；rim=1px 边线；inset/glow 置空；
           cast=浮于网页之上的柔和投影；active=主色实底 + 白色字形。 */
        --pet-btn-face: var(--pet-surface-elevated, #ffffff);
        --pet-btn-rim: rgba(28, 27, 24, 0.12);
        --pet-btn-inset: 0 0 0 0 transparent;
        --pet-btn-cast: 0 1px 2px rgba(28, 27, 24, 0.06), 0 4px 12px rgba(28, 27, 24, 0.1);
        --pet-btn-press: 0 1px 2px rgba(28, 27, 24, 0.1);
        --pet-btn-glow: 0 0 0 0 transparent;
        --pet-btn-hover-face: color-mix(in srgb, var(--pet-primary, #9f4d25) 10%, var(--pet-surface-elevated, #ffffff));
        --pet-btn-active-face: var(--pet-primary, #9f4d25);
        --pet-btn-active-ink: #ffffff;
        --pet-glyph: #3d3a34;
        --pet-glyph-emboss: none;
      }

      :host([data-theme="dark"]) {
        color-scheme: dark;
        color: #ece7d9;
        --pet-cat-color: #f5efeb;
        /* 深色伴读猫：近黑麻薯 + 白五官 + 彩虹边缘光。与下方 @media 兜底块同步。 */
        --pet-cat-body: #0b0a0e;
        --pet-cat-face: #fbfaff;
        --pet-cat-whisker: #fbfaff;
        --pet-cat-whisker-under: rgba(0, 0, 0, 0.38);
        --pet-cat-line: transparent;
        --pet-cat-rim-0: #ffffff;
        --pet-cat-rim-1: #ffe0ee;
        --pet-cat-rim-2: #bfe6ff;
        --pet-cat-rim-3: #d8f3ff;
        --pet-cat-rim-4: #ffd9a0;
        --pet-cat-under-0: #ffc79a;
        --pet-cat-under-1: #d9b8ff;
        --pet-cat-under-2: #8cc4ff;
        --pet-cat-ear-0: #d7c2cc;
        --pet-cat-ear-1: #3a3038;
        --pet-cat-floor-0: #ffe7d2;
        --pet-cat-floor-1: #ffffff;
        --pet-cat-floor-2: #d6ecff;
        --pet-cat-bloom: 0.55;
        --pet-cat-chroma: 0.5;
        --pet-cat-hover: #e8946a;
        --pet-cat-glow: drop-shadow(0 0 6px rgba(190, 220, 255, 0.22));
        --pet-cat-glow-hover: drop-shadow(0 0 12px rgba(255, 214, 236, 0.4));
        --pet-primary: #e8946a;
        --pet-primary-soft: rgba(232, 148, 106, 0.16);
        --pet-primary-hover: #f0aa86;
        --pet-accent: #edebe6;
        --pet-surface: #1d1c1a;
        --pet-surface-elevated: #272522;
        --pet-line: rgba(255, 250, 240, 0.12);
        --pet-line-subtle: rgba(255, 250, 240, 0.07);
        --pet-ink: #edebe6;
        --pet-muted: #959084;
        --pet-tag-bg: rgba(255, 250, 240, 0.08);
        --pet-shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.5);
        --pet-shadow-md: 0 12px 36px rgba(0, 0, 0, 0.6);
        --pet-shadow-lg: 0 20px 48px rgba(0, 0, 0, 0.7);
        /* 暗色扁平按钮：石墨实色面 + 浅色细边线，投影加深以从深色网页上浮起。 */
        --pet-btn-face: var(--pet-surface-elevated, #272522);
        --pet-btn-rim: rgba(255, 250, 240, 0.14);
        --pet-btn-inset: 0 0 0 0 transparent;
        --pet-btn-cast: 0 1px 2px rgba(0, 0, 0, 0.5), 0 6px 16px rgba(0, 0, 0, 0.45);
        --pet-btn-press: 0 1px 2px rgba(0, 0, 0, 0.5);
        --pet-btn-glow: 0 0 0 0 transparent;
        --pet-btn-hover-face: color-mix(in srgb, var(--pet-primary, #e8946a) 18%, var(--pet-surface-elevated, #272522));
        --pet-btn-active-face: var(--pet-primary, #e8946a);
        --pet-btn-active-ink: #1a1210;
        --pet-glyph: #edebe6;
        --pet-glyph-emboss: none;
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme])) {
          color-scheme: dark;
          color: #ece7d9;
          --pet-cat-color: #f5efeb;
          /* 深色伴读猫：与上方 :host([data-theme="dark"]) 块同步。 */
          --pet-cat-body: #0b0a0e;
          --pet-cat-face: #fbfaff;
          --pet-cat-whisker: #fbfaff;
          --pet-cat-whisker-under: rgba(0, 0, 0, 0.38);
          --pet-cat-line: transparent;
          --pet-cat-rim-0: #ffffff;
          --pet-cat-rim-1: #ffe0ee;
          --pet-cat-rim-2: #bfe6ff;
          --pet-cat-rim-3: #d8f3ff;
          --pet-cat-rim-4: #ffd9a0;
          --pet-cat-under-0: #ffc79a;
          --pet-cat-under-1: #d9b8ff;
          --pet-cat-under-2: #8cc4ff;
          --pet-cat-ear-0: #d7c2cc;
          --pet-cat-ear-1: #3a3038;
          --pet-cat-floor-0: #ffe7d2;
          --pet-cat-floor-1: #ffffff;
          --pet-cat-floor-2: #d6ecff;
          --pet-cat-bloom: 0.55;
          --pet-cat-chroma: 0.5;
          --pet-cat-hover: #e8946a;
          --pet-cat-glow: drop-shadow(0 0 6px rgba(190, 220, 255, 0.22));
          --pet-cat-glow-hover: drop-shadow(0 0 12px rgba(255, 214, 236, 0.4));
          --pet-primary: #e8946a;
          --pet-primary-soft: rgba(232, 148, 106, 0.16);
          --pet-primary-hover: #f0aa86;
          --pet-accent: #edebe6;
          --pet-surface: #1d1c1a;
          --pet-surface-elevated: #272522;
          --pet-line: rgba(255, 250, 240, 0.12);
          --pet-line-subtle: rgba(255, 250, 240, 0.07);
          --pet-ink: #edebe6;
          --pet-muted: #959084;
          --pet-tag-bg: rgba(255, 250, 240, 0.08);
          --pet-shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.5);
          --pet-shadow-md: 0 12px 36px rgba(0, 0, 0, 0.6);
          --pet-shadow-lg: 0 20px 48px rgba(0, 0, 0, 0.7);
          /* 暗色扁平按钮：石墨实色面 + 浅色细边线，投影加深以从深色网页上浮起。 */
          --pet-btn-face: var(--pet-surface-elevated, #272522);
          --pet-btn-rim: rgba(255, 250, 240, 0.14);
          --pet-btn-inset: 0 0 0 0 transparent;
          --pet-btn-cast: 0 1px 2px rgba(0, 0, 0, 0.5), 0 6px 16px rgba(0, 0, 0, 0.45);
          --pet-btn-press: 0 1px 2px rgba(0, 0, 0, 0.5);
          --pet-btn-glow: 0 0 0 0 transparent;
          --pet-btn-hover-face: color-mix(in srgb, var(--pet-primary, #e8946a) 18%, var(--pet-surface-elevated, #272522));
          --pet-btn-active-face: var(--pet-primary, #e8946a);
          --pet-btn-active-ink: #1a1210;
          --pet-glyph: #edebe6;
          --pet-glyph-emboss: none;
        }
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        -webkit-font-smoothing: antialiased;
        -webkit-user-drag: none;
        user-select: none;
      }

      .roamcat-pet-widget {
        position: relative;
        width: calc(64px * var(--pet-scale, 1));
        height: calc(68px * var(--pet-scale, 1));
        /* 猫身锚定在（放大后的）widget 底部中央 */
        display: flex;
        align-items: flex-end;
        justify-content: center;
        z-index: 2147483640;
        pointer-events: auto;
        user-select: none;
        -webkit-user-drag: none;
        transition: transform 0.36s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.2s ease;
      }

      .roamcat-pet-widget.dragging {
        transition: none;
      }

      /* 贴边探头姿态：探头 SVG 本身按"右缘 = 屏幕边"绘制（双爪扣在 x=160 的边上），
         挂件不再整体平移出屏——平移会把爪子和一只眼睛裁掉。悬停/说话时
         只以屏幕边为轴放大探出，爪子始终扣住边缘。左贴边由 .cat-mode-peeking 镜像。 */
      .roamcat-pet-widget.is-left .cat-mode-peeking {
        transform: scaleX(-1) scale(var(--pet-scale, 1));
      }

      .roamcat-pet-widget.docked .cat-peeking-svg {
        transform-origin: 100% 100%;
        transition: color 0.22s ease, filter 0.22s ease, scale 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .roamcat-pet-widget.docked:hover .cat-peeking-svg,
      .roamcat-pet-widget.docked.peek-out .cat-peeking-svg,
      .roamcat-pet-widget.docked.has-speech .cat-peeking-svg,
      .roamcat-pet-widget.docked:has(.cat-speech-bubble.speaking) .cat-peeking-svg {
        scale: 1.1;
      }

      /* 贴边唤醒标签：鼠标用户直接点探头的猫即可唤醒，标签仅作键盘入口——
         平时透明不占命中区，Tab 聚焦时才在猫朝向页面的一侧显出一颗爪印钮。 */
      .roamcat-edge-tab {
        position: absolute;
        top: 50%;
        right: calc(100% + 4px);
        left: auto;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--pet-btn-face, var(--pet-surface-elevated, #ffffff));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2e8f0));
        box-shadow: var(--pet-btn-cast, 0 4px 12px rgba(0, 0, 0, 0.1));
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 8;
        opacity: 0;
        pointer-events: none;
        translate: 0 -50%;
        transition: opacity 0.18s ease;
        padding: 0;
        user-select: none;
      }

      .roamcat-pet-widget.is-left .roamcat-edge-tab {
        right: auto;
        left: calc(100% + 4px);
      }

      .roamcat-pet-widget.docked .roamcat-edge-tab {
        display: flex;
      }

      .roamcat-pet-widget.docked .roamcat-edge-tab:focus-visible {
        opacity: 1;
        pointer-events: auto;
        outline: 2px solid var(--pet-primary, #d97757);
        outline-offset: 2px;
      }

      .edge-tab-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }

      .edge-tab-paw {
        line-height: 1;
        color: var(--pet-primary, #f59e0b);
        display: inline-flex;
        align-items: center;
      }
      .edge-tab-paw svg {
        display: block;
      }

      /* =========================================================
         Satellite Orbit Quick Switch: 旋旋翻按钮 (Orbit / Flip Button)
         已并入 .roamcat-quick-dock 卫星带末端（离猫最近），定位与贴边
         隐藏/探出由 dock 统一接管。
         ========================================================= */
      .roamcat-flip-btn {
        position: relative;
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        /* 与快捷钮同一象牙瓷扣面（曾为黄铜铣边币，已统一为同排按钮材质） */
        background: var(--pet-btn-face, var(--pet-surface-elevated, #ffffff));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2ded4));
        box-shadow: var(--pet-btn-inset, none), var(--pet-btn-cast, var(--pet-shadow-sm));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        outline: none;
        z-index: 12;
        transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1),
                    box-shadow 0.2s ease,
                    border-color 0.2s ease,
                    background-color 0.2s ease,
                    opacity 0.2s ease;
        user-select: none;
        perspective: 600px;
      }

      .roamcat-flip-btn:not(.is-active):hover {
        transform: translateY(-1px);
        background: var(--pet-btn-hover-face, var(--pet-primary-soft, #fbf3ef));
        border-color: color-mix(in srgb, var(--pet-primary, #d97757) 45%, transparent);
      }

      .roamcat-flip-btn:focus-visible {
        outline: 2px solid var(--pet-primary, #f59e0b);
        outline-offset: 2px;
      }

      .roamcat-flip-btn:active {
        transform: scale(0.94);
        box-shadow: var(--pet-btn-press, none);
      }

      /* 3D Coin/Card Container */
      .flip-coin {
        width: 100%;
        height: 100%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Coin Face：内层字形容器——币面材质已去除，与钮面同色，仅负责字形居中 */
      .coin-face {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .coin-face-front {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        letter-spacing: -0.6px;
        line-height: 1;
      }

      /* 中/En 字形按钮面图标处理：同色压印，与 quick-glyph svg 一致 */
      .coin-glyph-bilingual {
        display: inline-flex;
        align-items: center;
        font-size: var(--fs-1, 12px);
        font-weight: 700;
        filter: var(--pet-glyph-emboss, none);
      }

      .glyph-main {
        color: var(--pet-glyph, var(--pet-ink, #161511));
        font-size: var(--fs-1, 12px);
      }

      .glyph-sep {
        font-size: var(--fs-1, 12px);
        color: var(--pet-muted, #9ca3af);
        opacity: 0.6;
        margin: 0 -0.5px;
      }

      .glyph-sub {
        font-size: var(--fs-1, 12px);
        color: var(--pet-glyph, var(--pet-ink, #161511));
      }

      /* Orbit SVG Spinner Ring */
      .flip-orbit-ring {
        position: absolute;
        top: -2px;
        left: -2px;
        width: 34px;
        height: 34px;
        pointer-events: none;
        overflow: visible;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .orbit-bg {
        fill: none;
        stroke: var(--pet-line-subtle, rgba(255,255,255,0.08));
        stroke-width: 1.8;
      }

      .orbit-active {
        fill: none;
        stroke: var(--pet-primary, #f59e0b);
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-dasharray: 20 50;
        transform-origin: center;
      }

      /* ACTIVE STATE (双语翻译已开启)：与快捷钮同一开启态——琥珀釉面 +
         主色描边 + 右上角状态点；字形换深色墨 */
      .roamcat-flip-btn.is-active .coin-glyph-bilingual .glyph-main,
      .roamcat-flip-btn.is-active .coin-glyph-bilingual .glyph-sub {
        color: var(--pet-btn-active-ink, #5d3d0c);
      }

      .roamcat-flip-btn.is-active .coin-glyph-bilingual .glyph-sep {
        color: var(--pet-btn-active-ink, #5d3d0c);
        opacity: 0.55;
      }

      /* TRANSLATING STATE (正在逐段翻译中) */
      .roamcat-flip-btn.is-translating {
        border-color: var(--pet-primary, #f59e0b);
      }

      .roamcat-flip-btn.is-translating .flip-orbit-ring {
        opacity: 1;
        animation: orbit-spin 1.1s linear infinite;
      }

      @keyframes orbit-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Tooltip for the flip button：与 .quick-tooltip 一致，向带内方向弹出 */
      .flip-tooltip {
        position: absolute;
        right: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%) translateX(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-glyph, var(--pet-ink, #161511));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2ded4));
        border-radius: 999px;
        padding: 3px 9px;
        font-size: var(--fs-1, 12px);
        font-weight: 600;
        white-space: nowrap;
        box-shadow: var(--pet-btn-cast, 0 4px 12px rgba(0,0,0,0.12));
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1);
        z-index: 20;
      }

      /* Pet 贴左屏时提示翻到按钮右侧（朝向页面中心） */
      .roamcat-pet-widget.is-left .roamcat-flip-btn .flip-tooltip {
        right: auto;
        left: calc(100% + 6px);
        transform: translateY(-50%) translateX(-4px);
      }

      .roamcat-flip-btn:hover .flip-tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%) translateX(0);
      }

      .roamcat-pet-widget.dragging .flip-tooltip {
        opacity: 0 !important;
        visibility: hidden;
      }

      /* =========================================================
         快捷按钮 2×2 方阵：上排 .roamcat-cat-menu（提炼 / 设置），下排
         .roamcat-quick-dock（旋旋翻 / 阅读开关）。两排同列右对齐、同以猫脚
         为基线锚定，缩放猫时方阵不被拉散。贴边时整组隐藏（贴边态只探头，
         点猫唤醒）；猫贴左屏时整组翻到右侧。
         ========================================================= */
      .roamcat-quick-dock,
      .roamcat-cat-menu {
        position: absolute;
        right: calc(100% + 6px);
        left: auto;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        visibility: hidden;
        /* 容器在收起过渡结束后才隐藏（visibility 延迟衔接子按钮 160ms 收拢动画） */
        transition: visibility 0s 0.36s;
      }
      .roamcat-quick-dock {
        bottom: -2px;
        z-index: 11;
      }
      .roamcat-cat-menu {
        bottom: 34px;
        z-index: 13;
      }

      /* 悬停桥：盖住方阵与猫身之间的 6px 缝（上下各放 3px 接住两排间隙），
         指针从猫移向按钮时不掉 :hover。收起态随容器 visibility:hidden 失效。 */
      .roamcat-quick-dock::before,
      .roamcat-cat-menu::before {
        content: '';
        position: absolute;
        top: -3px;
        right: -8px;
        bottom: -3px;
        width: 8px;
      }

      .roamcat-pet-widget.is-left :is(.roamcat-quick-dock, .roamcat-cat-menu)::before {
        right: auto;
        left: -8px;
      }

      /* Pet 贴左屏时方阵翻到右侧（始终朝向页面中心，避免超出视口）。 */
      .roamcat-pet-widget.is-left :is(.roamcat-quick-dock, .roamcat-cat-menu) {
        right: auto;
        left: calc(100% + 6px);
      }

      /* 显隐两条路：点猫头 dock-open 常驻展开；悬停 widget 临时展开，
         移开后经 360ms visibility 延迟收起——窗口内按钮仍可命中，微抖动不闪断。 */
      .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) :is(.roamcat-quick-dock, .roamcat-cat-menu),
      .roamcat-pet-widget.dock-open .roamcat-zoom-controls {
        visibility: visible;
        transition-delay: 0s;
      }

      /* 子按钮逐个收放：opacity/translate/scale 三个独立属性动画
         （transform 留给 hover/active 等交互态，避免互相覆盖）。
         --i 为"离猫距离"序号：贴右边时阅读开关最近（--i:0），
         贴左边时旋旋翻最近。 */
      .roamcat-quick-dock > :nth-child(1) { --i: 1; }
      .roamcat-quick-dock > :nth-child(2) { --i: 0; }
      .roamcat-pet-widget.is-left .roamcat-quick-dock > :nth-child(1) { --i: 0; }
      .roamcat-pet-widget.is-left .roamcat-quick-dock > :nth-child(2) { --i: 1; }
      .roamcat-cat-menu > .roamcat-quick-btn {
        opacity: 0;
        translate: 14px 0;
        scale: 0.6;
        pointer-events: none;
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.2s ease,
          border-color 0.2s ease,
          background-color 0.2s ease,
          opacity 0.16s ease-in,
          translate 0.16s ease-in,
          scale 0.16s ease-in;
      }
      .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-cat-menu > .roamcat-quick-btn {
        opacity: 1;
        translate: 0 0;
        scale: 1;
        pointer-events: auto;
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.2s ease,
          border-color 0.2s ease,
          background-color 0.2s ease,
          opacity 0.18s ease,
          translate 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
          scale 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .roamcat-pet-widget .roamcat-quick-dock > * {
        opacity: 0;
        translate: 14px 0;
        scale: 0.6;
        pointer-events: none;
        /* 在此统一接管过渡列表（前 5 项为交互态，后 3 项为显隐动画），
           保证 opacity/translate/scale 的错峰延迟不被按钮自身 transition 重置。
           收起：160ms 收拢，最远端先动（反向错峰）。 */
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.2s ease,
          border-color 0.2s ease,
          background-color 0.2s ease,
          color 0.2s ease,
          opacity 0.16s ease-in calc((4 - var(--i, 0)) * 35ms),
          translate 0.16s ease-in calc((4 - var(--i, 0)) * 35ms),
          scale 0.16s ease-in calc((4 - var(--i, 0)) * 35ms);
      }
      .roamcat-pet-widget.is-left :is(.roamcat-quick-dock, .roamcat-cat-menu) > * {
        translate: -14px 0;
      }
      .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-quick-dock > * {
        opacity: 1;
        translate: 0 0;
        scale: 1;
        pointer-events: auto;
        /* 展开：translate/scale 320ms 回弹曲线，opacity 180ms，近猫端先动 */
        transition:
          transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.2s ease,
          border-color 0.2s ease,
          background-color 0.2s ease,
          color 0.2s ease,
          opacity 0.18s ease calc(var(--i, 0) * 35ms),
          translate 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--i, 0) * 35ms),
          scale 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--i, 0) * 35ms);
      }

      /* 悬停/聚焦的子按钮整体抬到兄弟之上：dock 子项各经 scale/translate 建立
         独立层叠上下文，其内部 tooltip 的 z-index 只在本按钮上下文内生效——
         不抬父级，向左弹出的提示会被相邻按钮（尤其 z-index:12 的旋旋翻币）盖住。 */
      .roamcat-quick-dock > *:is(:hover, :focus-within) {
        z-index: 16;
      }

      /* 快捷坞展开时气泡抬高，避开缩放胶囊 */
      .roamcat-pet-widget.dock-open {
        --zoom-offset: 34px;
      }

      /* 缩放控制胶囊：悬于猫头上方，与快捷坞同显同隐 */
      .roamcat-zoom-controls {
        position: absolute;
        top: -32px;
        left: 50%;
        /* --zoom-shift-x 由 fitZoomControls() 写入：猫贴视口左右边时把胶囊收进视口。 */
        transform: translateX(calc(-50% + var(--zoom-shift-x, 0px)));
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border-radius: 999px;
        background: var(--pet-btn-face, var(--pet-surface-elevated, #ffffff));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2ded4));
        box-shadow: var(--pet-btn-inset, none), var(--pet-btn-cast, var(--pet-shadow-sm));
        z-index: 12;
        visibility: hidden;
        opacity: 0;
        translate: 0 6px;
        scale: 0.8;
        transition:
          opacity 0.16s ease-in,
          translate 0.16s ease-in,
          scale 0.16s ease-in,
          visibility 0s 0.36s;
      }
      .roamcat-pet-widget.dock-open .roamcat-zoom-controls {
        opacity: 1;
        translate: 0 0;
        scale: 1;
        transition:
          opacity 0.18s ease,
          translate 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
          scale 0.32s cubic-bezier(0.34, 1.56, 0.64, 1),
          visibility 0s 0s;
      }
      .zoom-btn {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: var(--pet-glyph, var(--pet-muted, #6b7280));
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 0;
        transition: box-shadow 0.15s ease, color 0.15s ease;
      }
      .zoom-btn svg { display: block; filter: var(--pet-glyph-emboss, none); }
      .zoom-btn:hover:not(:disabled) {
        /* 悬停微凸：胶囊内再浮起一颗小瓷扣 */
        background: var(--pet-btn-face, var(--pet-tag-bg, rgba(0,0,0,0.05)));
        box-shadow: var(--pet-btn-inset, none), 0 1px 2px rgba(64, 48, 21, 0.18);
        color: var(--pet-primary, #f59e0b);
      }
      .zoom-btn:active:not(:disabled) {
        box-shadow: var(--pet-btn-press, none);
      }
      .zoom-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .zoom-btn:focus-visible {
        outline: 2px solid var(--pet-primary, #f59e0b);
        outline-offset: 1px;
      }
      .zoom-label {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: var(--fs-1, 12px);
        font-weight: 600;
        color: var(--pet-ink, #161511);
        min-width: 34px;
        text-align: center;
        user-select: none;
      }

      /* Sports Car Entrance — driveIn() 跑车入场彩蛋。
         停在猫的脚下、页面内侧一侧；约 1.3× 猫宽，随 --pet-scale 缩放。 */
      .pet-car {
        position: absolute;
        bottom: 0;
        right: calc(100% + 6px);
        width: calc(83px * var(--pet-scale, 1));
        pointer-events: none;
        z-index: 9;
        transform-origin: bottom center;
      }
      .roamcat-pet-widget.is-left .pet-car {
        right: auto;
        left: calc(100% + 6px);
      }
      .pet-car svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .roamcat-pet-widget.is-left .pet-car svg {
        transform: scaleX(-1);
      }
      .pet-car .car-wheel {
        transform-box: fill-box;
        transform-origin: center;
        animation: car-wheel-spin 0.3s linear infinite;
      }
      @keyframes car-wheel-spin {
        to { transform: rotate(360deg); }
      }
      .pet-car .speed-line {
        opacity: 0;
      }
      .pet-car.car-moving .speed-line {
        animation: speed-line-flash 0.45s linear infinite;
      }
      .pet-car .speed-line:nth-child(2) { animation-delay: 0.08s; }
      .pet-car .speed-line:nth-child(3) { animation-delay: 0.16s; }
      @keyframes speed-line-flash {
        0% { opacity: 0; transform: translateX(6px); }
        30% { opacity: 0.9; }
        100% { opacity: 0; transform: translateX(-10px); }
      }
      .pet-car .exhaust-puff {
        transform-box: fill-box;
        transform-origin: center;
        opacity: 0;
      }
      .pet-car.car-puff .exhaust-puff {
        animation: exhaust-puff 0.5s ease-out forwards;
      }
      @keyframes exhaust-puff {
        0% { opacity: 0.75; transform: translateX(0) scale(0.4); }
        100% { opacity: 0; transform: translateX(16px) scale(1.4); }
      }

      .roamcat-quick-btn {
        position: relative;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        /* 象牙瓷扣：凸面受光渐变 + 顶棱高光 + 底部接触暗边 + 双层投影 */
        background: var(--pet-btn-face, var(--pet-surface-elevated, #ffffff));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2ded4));
        box-shadow: var(--pet-btn-inset, none), var(--pet-btn-cast, var(--pet-shadow-sm));
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        outline: none;
        font-size: var(--fs-3, 14px);
        line-height: 1;
        color: var(--pet-glyph, var(--pet-muted, #6b7280));
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
                    box-shadow 0.2s ease,
                    border-color 0.2s ease,
                    background-color 0.2s ease,
                    opacity 0.2s ease;
        user-select: none;
      }

      /* 悬停：主色淡底 + 主色描边与字形，轻抬 1px */
      .roamcat-quick-btn:hover {
        transform: translateY(-1px);
        background: var(--pet-btn-hover-face, var(--pet-primary-soft, #fbf3ef));
        border-color: color-mix(in srgb, var(--pet-primary, #d97757) 45%, transparent);
        color: var(--pet-primary, #d97757);
      }

      .roamcat-quick-btn .quick-glyph {
        display: grid;
        place-items: center;
        line-height: 0;
      }
      /* 字形压印：亮色凸版 / 暗色凹版（由 --pet-glyph-emboss 决定） */
      .roamcat-quick-btn .quick-glyph svg {
        display: block;
        filter: var(--pet-glyph-emboss, none);
      }

      .roamcat-quick-btn:focus-visible {
        outline: 2px solid var(--pet-primary, #f59e0b);
        outline-offset: 2px;
      }

      .roamcat-quick-btn:active {
        transform: scale(0.94);
        box-shadow: var(--pet-btn-press, none);
      }

      /* 开启态（阅读辅助 / 双语翻译共用）：主色实底 + 反白字形，与关闭态一眼可分 */
      .roamcat-quick-btn.is-active,
      .roamcat-flip-btn.is-active {
        background: var(--pet-btn-active-face, var(--pet-primary, #d97757));
        border-color: var(--pet-btn-active-face, var(--pet-primary, #d97757));
        color: var(--pet-btn-active-ink, #ffffff);
      }

      .roamcat-quick-btn.is-active:hover,
      .roamcat-flip-btn.is-active:hover {
        transform: translateY(-1px);
        background: var(--pet-primary-hover, #c25e3e);
        border-color: var(--pet-primary-hover, #c25e3e);
        color: var(--pet-btn-active-ink, #ffffff);
      }

      /* 切换进行中：压暗 + 琥珀细环脉冲，并屏蔽连点 */
      .roamcat-quick-btn.is-pending {
        opacity: 0.55;
        pointer-events: none;
        box-shadow: var(--pet-btn-inset, none), 0 0 0 1px var(--pet-primary, #f59e0b);
      }

      .roamcat-quick-btn .quick-tooltip {
        position: absolute;
        right: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%) translateX(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-glyph, var(--pet-ink, #161511));
        border: 1px solid var(--pet-btn-rim, var(--pet-line, #e2ded4));
        border-radius: 999px;
        padding: 3px 9px;
        font-size: var(--fs-1, 12px);
        font-weight: 600;
        white-space: nowrap;
        box-shadow: var(--pet-btn-cast, 0 4px 12px rgba(0, 0, 0, 0.12));
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.18s ease;
        z-index: 13;
      }

      /* Pet 贴左屏时提示翻到按钮右侧（始终朝向页面中心，避免超出视口） */
      .roamcat-pet-widget.is-left .roamcat-quick-btn .quick-tooltip {
        right: auto;
        left: calc(100% + 6px);
        transform: translateY(-50%) translateX(-4px);
      }

      .roamcat-quick-btn:hover .quick-tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateY(-50%) translateX(0);
      }

      .roamcat-pet-widget.dragging .quick-tooltip {
        opacity: 0 !important;
        visibility: hidden;
      }

      /* Pure 2D Scanline Character Pet Container (NO BALL / NO CIRCLE BASE / TRANSPARENT) */
      .roamcat-avatar-wrap {
        position: relative;
        width: 64px;
        height: 68px;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        outline: none !important;
        transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .roamcat-avatar-wrap:hover {
        transform: scale(1.08) translateY(-3px);
      }

      .roamcat-avatar-wrap:active {
        cursor: grabbing;
        transform: scale(0.95) translateY(2px);
      }

      /* Speech Bubble (Hover & Speaking Notification) */
      .cat-speech-bubble {
        position: absolute;
        bottom: calc(100% + 8px + var(--zoom-offset, 0px));
        left: 50%;
        transform: translateX(calc(-50% + var(--bubble-shift-x, 0px))) translateY(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #111827);
        border: 1.5px solid var(--pet-btn-rim, var(--pet-line, #e5e7eb));
        border-radius: 12px;
        padding: 6px 10px;
        font-size: var(--fs-1, 12px);
        font-weight: 600;
        white-space: normal;
        overflow-wrap: anywhere;
        line-height: 1.35;
        text-align: left;
        box-shadow: var(--pet-btn-cast, 0 4px 16px rgba(0,0,0,0.12));
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
        z-index: 15;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: max-content;
        max-width: min(260px, calc(100vw - 16px));
      }

      /* fitSpeechBubble() 通过 --bubble-shift-x 水平收进视口、--bubble-tail-x
         保持尾巴指向猫；贴顶时加 .below 翻到猫下方、尾巴朝上。 */
      .cat-speech-bubble.below {
        bottom: auto;
        top: calc(100% + 8px);
      }

      .cat-speech-bubble::after {
        content: '';
        position: absolute;
        top: 100%;
        left: var(--bubble-tail-x, 50%);
        transform: translateX(-50%);
        border-width: 5px;
        border-style: solid;
        border-color: var(--tail-bg, var(--pet-surface-elevated, #ffffff)) transparent transparent transparent;
        transition: border-color 0.2s ease;
      }
      .cat-speech-bubble.below::after {
        top: auto;
        bottom: 100%;
        border-color: transparent transparent var(--tail-bg, var(--pet-surface-elevated, #ffffff)) transparent;
      }

      .cat-speech-bubble.speaking {
        opacity: 1 !important;
        transform: translateX(calc(-50% + var(--bubble-shift-x, 0px))) translateY(0);
        pointer-events: auto !important;
        visibility: visible !important;
      }

      /* 针对右半屏或贴右边缘的对齐策略：气泡右对齐，向网页内侧展开，100% 避免超出视口！ */
      .roamcat-pet-widget:not(.is-left) .cat-speech-bubble {
        left: auto !important;
        right: 0 !important;
        transform: translateX(var(--bubble-shift-x, 0px)) translateY(4px);
      }
      .roamcat-pet-widget:not(.is-left) .cat-speech-bubble.speaking,
      .roamcat-pet-widget:not(.is-left) .roamcat-avatar-wrap:hover .cat-speech-bubble:not(.speaking) {
        transform: translateX(var(--bubble-shift-x, 0px)) translateY(0) !important;
      }

      /* 针对左半屏或贴左边缘的对齐策略：气泡左对齐，向网页内侧展开，100% 避免超出视口！ */
      .roamcat-pet-widget.is-left .cat-speech-bubble {
        left: 0 !important;
        right: auto !important;
        transform: translateX(var(--bubble-shift-x, 0px)) translateY(4px);
      }
      .roamcat-pet-widget.is-left .cat-speech-bubble.speaking,
      .roamcat-pet-widget.is-left .roamcat-avatar-wrap:hover .cat-speech-bubble:not(.speaking) {
        transform: translateX(var(--bubble-shift-x, 0px)) translateY(0) !important;
      }

      /* Speaking default state */
      .cat-speech-bubble.speaking {
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #161511) !important;
        border-color: var(--pet-btn-rim, var(--pet-line, #e5e7eb));
      }
      .cat-speech-bubble.speaking .speech-text {
        color: var(--pet-ink, #161511) !important;
      }
      .cat-speech-bubble.speaking {
        --tail-bg: var(--pet-surface-elevated, #ffffff);
      }

      /* Busy / Loading status speaking (e.g. 正在解构正文 喵~) - Light default */
      .cat-speech-bubble.speaking.is-busy {
        border-color: #d97706 !important;
        background: #fffbeb !important;
        color: #78350f !important;
        box-shadow: 0 4px 16px rgba(217, 119, 6, 0.18) !important;
      }
      .cat-speech-bubble.speaking.is-busy .speech-text {
        color: #78350f !important;
        font-weight: 600 !important;
      }
      .cat-speech-bubble.speaking.is-busy {
        --tail-bg: #fffbeb;
      }
      .cat-speech-bubble.speaking.is-busy .speech-spinner {
        display: inline-block;
        border: 2px solid rgba(217, 119, 6, 0.25);
        border-top-color: #d97706;
      }
      .cat-speech-bubble.speaking.is-busy .speech-close-btn {
        color: #92400e;
      }
      .cat-speech-bubble.speaking.is-busy .speech-close-btn:hover {
        color: #78350f;
        background: rgba(217, 119, 6, 0.15);
      }

      /* Busy / Loading speaking - Dark theme (Relingo Obsidian + Warm Amber) */
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy {
        border-color: #f0a63c !important;
        background: #1c2531 !important;
        color: #f3e4c0 !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(240, 166, 60, 0.3) !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-text {
        color: #f3e4c0 !important;
        font-weight: 600 !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy {
        --tail-bg: #1c2531;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-spinner {
        border: 2px solid rgba(240, 166, 60, 0.25);
        border-top-color: #f0a63c;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-close-btn {
        color: #f0a63c;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-close-btn:hover {
        color: #f7bc55;
        background: rgba(240, 166, 60, 0.15);
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy {
          border-color: #f0a63c !important;
          background: #1c2531 !important;
          color: #f3e4c0 !important;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(240, 166, 60, 0.3) !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-text {
          color: #f3e4c0 !important;
          font-weight: 600 !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy {
          --tail-bg: #1c2531;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-spinner {
          border: 2px solid rgba(240, 166, 60, 0.25);
          border-top-color: #f0a63c;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-close-btn {
          color: #f0a63c;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-close-btn:hover {
          color: #f7bc55;
          background: rgba(240, 166, 60, 0.15);
        }
      }

      /* Error state - Light default */
      .cat-speech-bubble.speaking.is-error {
        border-color: #c8462e !important;
        background: #fef2f2 !important;
        color: #991b1b !important;
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.16) !important;
      }
      .cat-speech-bubble.speaking.is-error .speech-text {
        color: #991b1b !important;
        font-weight: 600 !important;
      }
      .cat-speech-bubble.speaking.is-error {
        --tail-bg: #fef2f2;
      }
      .cat-speech-bubble.speaking.is-error .speech-close-btn {
        color: #b91c1c;
      }
      .cat-speech-bubble.speaking.is-error .speech-close-btn:hover {
        color: #7f1d1d;
        background: rgba(239, 68, 68, 0.12);
      }

      /* Error state - Dark theme */
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-error {
        border-color: #f0756a !important;
        background: #251719 !important;
        color: #f7b3ad !important;
        box-shadow: 0 4px 18px rgba(240, 117, 106, 0.25) !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-error .speech-text {
        color: #f7b3ad !important;
        font-weight: 600 !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-error {
        --tail-bg: #251719;
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error {
          border-color: #f0756a !important;
          background: #251719 !important;
          color: #f7b3ad !important;
          box-shadow: 0 4px 18px rgba(240, 117, 106, 0.25) !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error .speech-text {
          color: #f7b3ad !important;
          font-weight: 600 !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error {
          --tail-bg: #251719;
        }
      }

      .speech-spinner {
        display: none;
        width: 11px;
        height: 11px;
        border: 2px solid rgba(217, 119, 6, 0.25);
        border-top-color: #d97706;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }

      .cat-speech-bubble.speaking.is-busy .speech-spinner {
        display: inline-block;
      }

      .speech-text {
        min-width: 0;
        overflow-wrap: anywhere;
        white-space: normal;
        line-height: 1.35;
      }

      /* 哲学语录气泡（.quote）：多行排版——中文句 + 英文小字 + 署名，关闭按钮对齐首行。 */
      .cat-speech-bubble.speaking.quote {
        align-items: flex-start;
      }
      .cat-speech-bubble.speaking.quote .speech-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .cat-speech-bubble .quote-zh {
        font-weight: 600;
      }
      .cat-speech-bubble .quote-en {
        font-size: var(--fs-1, 12px);
        font-weight: 500;
        line-height: 1.45;
        color: var(--pet-ink-subtle, var(--pet-muted, #64748b));
      }
      .cat-speech-bubble .quote-author {
        font-size: var(--fs-1, 12px);
        font-weight: 500;
        color: var(--pet-ink-subtle, var(--pet-muted, #64748b));
      }
      .cat-speech-bubble.speaking.quote .speech-close-btn {
        margin-top: 1px;
      }

      .speech-close-btn {
        display: none;
        background: transparent;
        border: none;
        color: var(--pet-muted, #6b7280);
        cursor: pointer;
        padding: 0;
        margin-left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        line-height: 0;
        transition: color 0.15s, background-color 0.15s;
        flex-shrink: 0;
      }
      .speech-close-btn svg {
        display: block;
      }

      .cat-speech-bubble.speaking .speech-close-btn {
        display: inline-flex;
      }

      .speech-close-btn:hover {
        color: var(--pet-ink, #111827);
        background: var(--pet-line-subtle);
      }

      .roamcat-avatar-wrap:hover .cat-speech-bubble:not(.speaking) {
        opacity: 1;
        transform: translateX(calc(-50% + var(--bubble-shift-x, 0px))) translateY(0);
      }

      .roamcat-pet-widget.dragging .cat-speech-bubble {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Official 2D Scanline Mascot Cat SVG & Breathing Animation */
        50% { transform: scale(1.15) rotate(4deg); }
      }

      .cat-svg {
        width: 58px;
        height: 62px;
        color: var(--pet-cat-color, #1e293b);
        filter: var(--pet-cat-glow);
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: cat-breathe 3.6s ease-in-out infinite;
        overflow: visible;
        display: block;
        pointer-events: none;
        transition: color 0.22s ease, filter 0.22s ease, transform 0.28s ease;
      }

      .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #d97757);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="dark"]) .cat-svg {
        color: var(--pet-cat-color, #f8fafc);
        filter: var(--pet-cat-glow);
      }

      :host([data-theme="dark"]) .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #e07a5f);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="light"]) .cat-svg {
        color: var(--pet-cat-color, #1e293b);
        filter: var(--pet-cat-glow);
      }

      :host([data-theme="light"]) .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #d97757);
        filter: var(--pet-cat-glow-hover);
      }

      @keyframes cat-breathe {
        0%, 100% { transform: translateY(0) scaleY(1); }
        50% { transform: translateY(-2.2px) scaleY(1.025); }
      }

      /* 1. Tail Wagging Animation */
      .cat-tail {
        transform-box: fill-box;
        transform-origin: 0% 70%;
        animation: cat-tail-wag 4.5s ease-in-out infinite;
      }
      @keyframes cat-tail-wag {
        0%, 100% { transform: rotate(0deg); }
        22% { transform: rotate(7.5deg) translateY(-2px); }
        45% { transform: rotate(-3deg); }
        68% { transform: rotate(9deg) translateY(-3px); }
        85% { transform: rotate(-1.5deg); }
      }

      .roamcat-avatar-wrap:hover .cat-tail,
      .roamcat-avatar-wrap.state-happy .cat-tail {
        animation: cat-tail-happy 1.5s ease-in-out infinite;
      }
      @keyframes cat-tail-happy {
        0%, 100% { transform: rotate(0deg); }
        30% { transform: rotate(14deg) translateY(-4px); }
        70% { transform: rotate(-6deg) translateY(1px); }
      }

      /* 2. Ear Twitching Animation */
      .cat-ear-left {
        transform-box: fill-box;
        transform-origin: 75% 100%;
        animation: cat-ear-twitch-left 6.8s ease-in-out infinite;
      }
      .cat-ear-right {
        transform-box: fill-box;
        transform-origin: 25% 100%;
        animation: cat-ear-twitch-right 7.5s ease-in-out infinite 2s;
      }
      @keyframes cat-ear-twitch-left {
        0%, 88%, 94%, 100% { transform: rotate(0deg); }
        90% { transform: rotate(-8.5deg) translateY(-1px); }
        92% { transform: rotate(3deg); }
      }
      @keyframes cat-ear-twitch-right {
        0%, 86%, 92%, 100% { transform: rotate(0deg); }
        88% { transform: rotate(7.5deg) translateY(-1px); }
        90% { transform: rotate(-3deg); }
      }

      /* 3. Eyes Expressions: Blinking & Squinting */
      .cat-eyes-open {
        transform-box: fill-box;
        transform-origin: center;
        animation: scan-blink 4.2s ease-in-out infinite;
        opacity: 1;
        transition: opacity 0.16s ease;
      }
      /* 瞳孔带着小眼点跟光标走。行程按 58px 猫脸里的余量。 */
      .cat-pupil-slot {
        transform-box: fill-box;
        transform-origin: center;
        transform: translate(calc(var(--eye-x, 0) * 2.2px), calc(var(--eye-y, 0) * 1.8px));
        transition: transform 0.28s ease-out;
      }
      .cat-eyes-squint {
        opacity: 0;
        transition: opacity 0.16s ease;
        pointer-events: none;
      }

      @keyframes scan-blink {
        0%, 94%, 98%, 100% { opacity: 1; transform: scaleY(1); }
        96% { opacity: 0.12; transform: scaleY(0.1); }
      }

      /* On Hover, Happy, or Sleeping: Switch to Happy Smile Squint Eyes */
      .roamcat-avatar-wrap:hover .cat-eyes-open,
      .roamcat-avatar-wrap.state-happy .cat-eyes-open,
      .roamcat-avatar-wrap.state-sleeping .cat-eyes-open {
        opacity: 0;
        animation: none;
      }
      .roamcat-avatar-wrap:hover .cat-eyes-squint,
      .roamcat-avatar-wrap.state-happy .cat-eyes-squint,
      .roamcat-avatar-wrap.state-sleeping .cat-eyes-squint {
        opacity: 1;
      }

      /* 探头猫整组眼睛跟光标；坐姿猫的眼点跟光标（见 .cat-pupil-slot）。 */
      .cat-peeking-svg .peeking-eyes-group {
        transform: translate(calc(var(--eye-x, 0) * 3px), calc(var(--eye-y, 0) * 2.2px));
        transition: transform 0.16s ease-out;
      }
      /* 贴左边时探头猫整体 scaleX(-1) 镜像，局部 +x 在屏幕上是 -x，需取反 */
      .roamcat-pet-widget.is-left .cat-peeking-svg .peeking-eyes-group {
        transform: translate(calc(var(--eye-x, 0) * -3px), calc(var(--eye-y, 0) * 2.2px));
      }

      /* Pressed Squash: 按住猫猫的果冻压感（scale 属性与 transform 关键帧可复合） */
      .roamcat-avatar-wrap.is-pressed .cat-mode-roaming,
      .roamcat-avatar-wrap.is-pressed .cat-mode-peeking {
        scale: 0.9 0.86;
      }

      /* 4. Idle Micro-actions */
      .roamcat-avatar-wrap.action-stretch .cat-svg {
        animation: cat-stretch-anim 2.4s cubic-bezier(0.34, 1.3, 0.64, 1) !important;
      }
      @keyframes cat-stretch-anim {
        0%, 100% { transform: translateY(0) scale(1); }
        25% { transform: translateY(-4px) scale(0.96, 1.08) rotate(-1deg); }
        55% { transform: translateY(3px) scale(1.1, 0.92) rotate(2deg); }
        78% { transform: translateY(-1px) scale(1.02, 0.98); }
      }

      .roamcat-avatar-wrap.action-tilt .cat-svg {
        animation: cat-tilt-anim 2.2s cubic-bezier(0.34, 1.3, 0.64, 1) !important;
      }
      @keyframes cat-tilt-anim {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        20%, 75% { transform: translateY(-2px) rotate(-9.5deg); }
      }

      .roamcat-avatar-wrap.action-knead .cat-svg {
        animation: cat-knead-anim 2.2s ease-in-out !important;
      }
      @keyframes cat-knead-anim {
        0%, 100% { transform: translateY(0); }
        20% { transform: translateY(-3px) scale(1.04, 0.96) rotate(1.5deg); }
        40% { transform: translateY(0) scale(0.97, 1.03) rotate(-1.5deg); }
        60% { transform: translateY(-3px) scale(1.04, 0.96) rotate(1.5deg); }
        80% { transform: translateY(0) scale(0.98, 1.02); }
      }

      /* 5. Click Jelly Bounce Feedback */
      .roamcat-avatar-wrap.action-jelly .cat-svg {
        animation: cat-jelly-anim 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }
      @keyframes cat-jelly-anim {
        0% { transform: scale(1, 1); }
        28% { transform: scale(1.22, 0.82) translateY(3px); }
        54% { transform: scale(0.86, 1.16) translateY(-5px); }
        76% { transform: scale(1.06, 0.95) translateY(-1px); }
        100% { transform: scale(1, 1); }
      }

      /* 6. Wake Up Animation */
      .roamcat-avatar-wrap.action-wakeup .cat-svg {
        animation: cat-wakeup-anim 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
      }
      @keyframes cat-wakeup-anim {
        0% { transform: scale(0.95) translateY(2px); }
        40% { transform: scale(1.12) translateY(-4px); }
        100% { transform: scale(1) translateY(0); }
      }

      /* 7. Sleeping State */
      .roamcat-avatar-wrap.state-sleeping .cat-svg {
        animation: cat-sleep-breathe 5.2s ease-in-out infinite !important;
        opacity: 0.88;
      }
      @keyframes cat-sleep-breathe {
        0%, 100% { transform: translateY(0) scale(0.98); }
        50% { transform: translateY(2px) scale(1.01, 0.97); }
      }

      /* 8. Floating zZ Particles */
      .cat-zzz-wrap {
        position: absolute;
        top: -12px;
        right: -6px;
        scale: var(--pet-scale, 1);
        transform-origin: bottom center;
        pointer-events: none;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Comic Sans MS", cursive, sans-serif;
        font-weight: 700;
        color: var(--pet-primary, #f59e0b);
        z-index: 10;
      }
      .roamcat-avatar-wrap.state-sleeping .cat-zzz-wrap {
        display: block;
      }
      .zzz-item {
        position: absolute;
        opacity: 0;
        animation: zzz-float 3s ease-in infinite;
      }
      .zzz-1 { font-size: var(--fs-1, 12px); right: 8px; animation-delay: 0s; }
      .zzz-2 { font-size: var(--fs-2, 13px); right: 2px; animation-delay: 1s; }
      .zzz-3 { font-size: var(--fs-4, 16px); right: -4px; animation-delay: 2s; }
      @keyframes zzz-float {
        0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
        25% { opacity: 0.9; transform: translate(-3px, -8px) scale(0.85); }
        75% { opacity: 0.65; transform: translate(4px, -20px) scale(1.1); }
        100% { opacity: 0; transform: translate(6px, -32px) scale(1.3); }
      }

      /* 9. Floating Heart / Sparkle Particle on Click */
      .cat-particle {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        scale: var(--pet-scale, 1);
        pointer-events: none;
        z-index: 25;
        color: var(--pet-primary, #f59e0b);
        animation: particle-rise 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .cat-particle svg {
        display: block;
      }
      .cat-particle[data-kind="heart"] {
        color: #f43f5e;
      }
      .cat-particle[data-kind="heart"] svg {
        fill: currentColor;
      }
      @keyframes particle-rise {
        0% { opacity: 0; transform: translateX(-50%) translateY(0) scale(0.5); }
        25% { opacity: 1; transform: translateX(-50%) translateY(-12px) scale(1.25); }
        100% { opacity: 0; transform: translateX(calc(-50% + 8px)) translateY(-38px) scale(1); }
      }

      /* Thinking State Pulse */
      .roamcat-avatar-wrap.state-thinking .cat-svg {
        animation: cat-pulse 1.3s ease-in-out infinite alternate !important;
        color: var(--pet-primary, #f59e0b);
      }

      /* =========================================================
         10. Peeking Mascot Mode (贴边探头姿态 · 软萌双爪扣边 · 灵动眨眼)
         ========================================================= */
      .cat-mode-roaming {
        display: block;
        width: 100%;
        height: 100%;
        transform: scale(var(--pet-scale, 1));
        transform-origin: bottom center;
        transition: opacity 0.2s ease, transform 0.25s ease, scale 0.16s cubic-bezier(0.34, 1.3, 0.64, 1);
      }
      .roamcat-pet-widget.pet-away .cat-mode-roaming {
        opacity: 0;
        transform: scale(calc(var(--pet-scale, 1) * 0.7));
      }
      .cat-mode-peeking {
        display: none;
        width: 100%;
        height: 100%;
        transform: scale(var(--pet-scale, 1));
        transform-origin: bottom center;
        transition: transform 0.25s ease, scale 0.16s cubic-bezier(0.34, 1.3, 0.64, 1);
      }

      .roamcat-pet-widget.docked .cat-mode-roaming {
        display: none !important;
      }
      .roamcat-pet-widget.docked .cat-mode-peeking {
        display: block !important;
      }

      .cat-peeking-svg {
        width: 64px;
        height: 68px;
        display: block;
        color: var(--pet-cat-color, #1e293b);
        filter: var(--pet-cat-glow);
        pointer-events: none;
        transition: color 0.22s ease, filter 0.22s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      :host([data-theme="dark"]) .cat-peeking-svg {
        color: var(--pet-cat-color, #f8fafc);
        filter: var(--pet-cat-glow);
      }

      .roamcat-avatar-wrap:hover .cat-peeking-svg {
        color: var(--pet-cat-hover, #d97757);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="dark"]) .roamcat-avatar-wrap:hover .cat-peeking-svg {
        color: var(--pet-cat-hover, #e07a5f);
        filter: var(--pet-cat-glow-hover);
      }

      /* 探头呼吸：以屏幕边（SVG 右下角）为轴轻点头，爪子不离边。
         左贴边时父级 .cat-mode-peeking 已镜像，这里两侧共用同一组关键帧
         （曾在左侧关键帧里再翻一次 scaleX(-1)，叠加后猫反向、爪子朝页面）。 */
      .roamcat-pet-widget.docked .cat-peeking-svg {
        animation: peeking-breathe 3.8s ease-in-out infinite;
      }
      @keyframes peeking-breathe {
        0%, 100% { transform: rotate(0deg); }
        50% { transform: rotate(-2.5deg); }
      }

      /* Peeking Eyes: Blinking & Happy Squint */
      .peeking-eyes-open {
        transform-box: fill-box;
        transform-origin: center;
        animation: peeking-blink 4.2s ease-in-out infinite;
        opacity: 1;
        transition: opacity 0.16s ease;
      }
      @keyframes peeking-blink {
        0%, 93%, 97%, 100% { transform: scaleY(1); opacity: 1; }
        95% { transform: scaleY(0.12); opacity: 0.15; }
      }

      .peeking-eyes-squint {
        opacity: 0;
        transition: opacity 0.16s ease;
        pointer-events: none;
      }

      .roamcat-pet-widget.docked:hover .peeking-eyes-open,
      .roamcat-pet-widget.docked.peek-out .peeking-eyes-open,
      .roamcat-pet-widget.docked.has-speech .peeking-eyes-open,
      .roamcat-pet-widget.docked:has(.cat-speech-bubble.speaking) .peeking-eyes-open,
      .roamcat-avatar-wrap:hover .peeking-eyes-open {
        opacity: 0 !important;
        animation: none;
      }

      .roamcat-pet-widget.docked:hover .peeking-eyes-squint,
      .roamcat-pet-widget.docked.peek-out .peeking-eyes-squint,
      .roamcat-pet-widget.docked.has-speech .peeking-eyes-squint,
      .roamcat-pet-widget.docked:has(.cat-speech-bubble.speaking) .peeking-eyes-squint,
      .roamcat-avatar-wrap:hover .peeking-eyes-squint {
        opacity: 1 !important;
      }

      /* Peeking Ear Twitch */
      .peeking-ear-front {
        transform-box: fill-box;
        transform-origin: 50% 100%;
        animation: peeking-ear-twitch 6.4s ease-in-out infinite;
      }
      @keyframes peeking-ear-twitch {
        0%, 88%, 94%, 100% { transform: rotate(0deg); }
        90% { transform: rotate(-7deg) translateY(-1px); }
        92% { transform: rotate(3deg); }
      }

      /* Peeking Whisker Micro-Vibration */
      .peeking-whiskers .whisker {
        transform-box: fill-box;
        transform-origin: 100% 50%;
        animation: peeking-whisker-twitch 5s ease-in-out infinite;
      }
      @keyframes peeking-whisker-twitch {
        0%, 75%, 85%, 100% { transform: rotate(0deg); }
        78% { transform: rotate(-3deg); }
        82% { transform: rotate(2deg); }
      }

      /* Paws Micro Grip Reflex */
      .roamcat-pet-widget.docked:hover .peeking-paw,
      .roamcat-pet-widget.docked.peek-out .peeking-paw {
        transform: scale(1.04);
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @media (prefers-reduced-motion: reduce) {
        .cat-peeking-svg,
        .peeking-eyes-open,
        .peeking-ear-front,
        .peeking-whiskers .whisker,
        .cat-svg,
        .cat-tail,
        .cat-ear-left,
        .cat-ear-right,
        .cat-eyes-open,
        .zzz-item,
        .roamcat-flip-btn.is-translating .flip-orbit-ring,
        .roamcat-avatar-wrap.state-thinking .cat-svg {
          animation: none !important;
        }
        .roamcat-pet-widget,
        .roamcat-edge-tab,
        .roamcat-flip-btn,
        .flip-coin,
        .cat-speech-bubble,
        .roamcat-summary-window,
        .cat-mode-roaming,
        .cat-mode-peeking,
        .cat-eyes-group,
        .cat-pupil-slot,
        .peeking-eyes-group,
        .pet-car,
        .pet-car * {
          transition: none !important;
        }
        /* 快捷坞显隐降级为纯透明度过渡：120ms、无错峰、无位移缩放 */
        .roamcat-pet-widget .roamcat-quick-dock > *,
        .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-quick-dock > * {
          opacity: var(--dock-opacity, 0);
          translate: none;
          scale: none;
          transition: opacity 0.12s ease !important;
        }
        .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-quick-dock > * {
          --dock-opacity: 1;
        }
        .roamcat-pet-widget .roamcat-cat-menu > .roamcat-quick-btn,
        .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-cat-menu > .roamcat-quick-btn {
          opacity: var(--dock-opacity, 0);
          translate: none;
          scale: none;
          transition: opacity 0.12s ease !important;
        }
        .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-cat-menu > .roamcat-quick-btn {
          --dock-opacity: 1;
        }
        .roamcat-quick-dock,
        .roamcat-pet-widget:is(.dock-open, :hover):not(.docked) .roamcat-quick-dock {
          transition: visibility 0s 0.13s !important;
        }
        .roamcat-zoom-controls,
        .roamcat-pet-widget.dock-open .roamcat-zoom-controls {
          translate: none;
          scale: none;
          transition: opacity 0.12s ease, visibility 0s 0.13s !important;
        }
        .pet-car .speed-line,
        .pet-car .car-wheel {
          animation: none !important;
        }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }


      /* 领域徽章基础样式（摘要窗头部 chip 继续使用该类名，HUD 观感由
         .summary-header .menu-domain-tag 作用域规则提供） */
      .menu-domain-tag {
        font-size: var(--fs-1, 12px);
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--pet-primary-soft);
        color: var(--pet-primary);
        font-weight: 500;
        border: 1px solid var(--pet-line-subtle);
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        flex: none;
        line-height: 1;
      }
      .menu-domain-tag svg {
        display: block;
        flex: none;
      }

      /* Summary Card Window — HUD 卡片风格（与查词卡/欢迎页 HUD 同源） */
      .roamcat-summary-window {
        position: fixed;
        width: 460px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 80px);
        background-color: var(--pet-surface);
        background-image: none;
        border: 1px solid var(--pet-line);
        border-radius: 12px;
        box-shadow: var(--pet-shadow-lg);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        opacity: 0;
        transform: translateY(16px) scale(0.96);
        pointer-events: none;
        transition: opacity 0.22s ease, transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        z-index: 2147483641;
      }

      .roamcat-summary-window.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .summary-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 16px 20px 10px;
      }

      .summary-title {
        font: 600 var(--fs-4, 16px)/1.3 var(--serif, Georgia, serif);
        color: var(--pet-ink);
        min-width: 0;
      }

      .summary-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }

      /* 领域徽章 → HUD 标签 chip（仅摘要页头作用域，不影响气泡菜单里的同名类） */
      .summary-header .menu-domain-tag {
        font: 500 var(--fs-1, 12px)/1.4 var(--ui, var(--sans, system-ui, sans-serif));
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--pet-tag-bg);
        border: 0;
        color: var(--pet-primary);
        white-space: nowrap;
      }
      .summary-header .menu-domain-tag svg {
        display: block;
        flex: none;
      }

      .summary-action-btn,
      .summary-close-btn {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--pet-muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 0;
        flex: none;
        transition: all 0.15s ease;
      }
      .summary-action-btn svg,
      .summary-close-btn svg {
        display: block;
      }

      .summary-action-btn:hover {
        color: var(--pet-ink);
        background: var(--pet-tag-bg);
      }

      .summary-close-btn {
        background: transparent;
      }
      .summary-close-btn:hover {
        background: rgba(200, 70, 46, 0.1);
        border-color: rgba(200, 70, 46, 0.4);
        color: #c8462e;
      }

      .summary-body {
        padding: 0 20px 14px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 62vh;
      }

      /* Article Meta Reading Strip */
      .summary-meta-strip {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font: 400 var(--fs-1, 12px)/1.4 var(--ui, var(--sans, system-ui, sans-serif));
        color: var(--pet-muted);
      }

      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .meta-item > span:first-child {
        display: inline-flex;
      }
      .meta-item svg {
        display: block;
      }

      .meta-sep {
        opacity: 0.4;
      }

      /* Core Takeaway Box — HUD context box */
      .takeaway-card {
        padding: 8px 12px;
        background: var(--pet-tag-bg);
        border-radius: 8px;
      }

      .takeaway-label {
        font-weight: 600;
        color: var(--pet-muted);
        margin-right: 4px;
        font-size: var(--fs-1, 12px);
      }

      .takeaway-text {
        font-size: var(--fs-3, 14px);
        font-weight: 500;
        line-height: 1.55;
        color: var(--pet-ink);
      }

      /* Highlight Points */
      .highlights-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .section-subtitle {
        font: 600 var(--fs-1, 12px)/1.5 var(--ui, var(--sans, system-ui, sans-serif));
        color: var(--pet-muted);
      }

      .highlight-list {
        display: flex;
        flex-direction: column;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .highlight-item {
        display: flex;
        gap: 10px;
        font-size: var(--fs-2, 13px);
        line-height: 1.6;
        color: var(--pet-ink);
        padding: 8px 0;
        border-top: 1px solid var(--pet-line-subtle);
      }
      .highlight-item:first-child {
        border-top: none;
        padding-top: 0;
      }

      .highlight-num {
        font: 700 var(--fs-1, 12px)/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: var(--pet-primary);
        flex: none;
      }

      .highlight-content {
        flex: 1;
        min-width: 0;
      }

      .highlight-content strong.hl-bold {
        color: var(--pet-ink);
        font-weight: 600;
        text-decoration: underline;
        text-decoration-color: var(--pet-primary);
        text-underline-offset: 3px;
      }

      /* Keywords Pills — HUD tag chips */
      .keywords-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .keyword-pill {
        font: 500 var(--fs-1, 12px)/1.4 var(--ui, var(--sans, system-ui, sans-serif));
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--pet-tag-bg);
        color: var(--pet-ink);
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .keyword-pill:hover {
        border-color: var(--pet-primary);
      }

      .keyword-pill.copied {
        background: var(--pet-primary-soft);
        border-color: var(--pet-primary);
      }

      /* Summary Loading State */
      .summary-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 42px 16px;
        gap: 16px;
        text-align: center;
      }

      .loading-cat-paws {
        color: var(--pet-primary, #f59e0b);
        animation: paw-bounce 1s ease-in-out infinite alternate;
      }
      .loading-cat-paws svg {
        display: block;
      }

      @keyframes paw-bounce {
        from { transform: translateY(0); }
        to { transform: translateY(-10px); }
      }

      .loading-text {
        font: 400 var(--fs-2, 13px)/1.6 var(--ui, var(--sans, system-ui, sans-serif));
        color: var(--pet-muted);
        max-width: 320px;
      }

      /* Summary Error State — HUD context box + danger bar */
      .summary-error {
        padding: 10px 14px;
        background: var(--pet-tag-bg);
        border: 1px solid var(--pet-line);
        border-left: 3px solid #c8462e;
        border-radius: 6px;
        color: var(--pet-muted-strong, var(--pet-ink));
        font-size: var(--fs-2, 13px);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .summary-error strong {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #c8462e;
      }
      .summary-error svg {
        display: block;
        flex: none;
      }

      .summary-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin: 0 20px;
        padding: 12px 0 16px;
        border-top: 1px solid var(--pet-line-subtle);
      }

      .summary-footer-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .footer-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 11px;
        border-radius: 6px;
        border: 1px solid var(--pet-line);
        background: transparent;
        color: var(--pet-muted-strong, var(--pet-ink));
        font-size: var(--fs-1, 12px);
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .footer-btn > span:first-child {
        display: inline-flex;
      }
      .footer-btn svg {
        display: block;
      }

      .footer-btn:hover {
        color: var(--pet-ink);
        background: var(--pet-tag-bg);
      }

      .footer-btn.copied {
        background: var(--pet-primary-soft);
        border-color: var(--pet-primary);
        color: var(--pet-primary);
      }

      .summary-source-meta {
        font: 400 var(--fs-1, 12px)/1.4 var(--ui, var(--sans, system-ui, sans-serif));
        color: var(--pet-muted);
      }
    `;
  }

  parts.getPetStyles = getPetStyles;
})();
