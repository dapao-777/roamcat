/**
 * @file extension/floating-pet.js
 * 文件职责：伴读猫挂件（classic script，禁 ESM 语法）——每页一只的 Shadow DOM 悬浮入口，承载 SVG 形象、
 *   拖拽贴边、菜单、文章摘要、状态气泡与左侧快捷按钮行，以及全局快捷键分发。
 * 主要内容：顶层主框架单例挂载与 MutationObserver 看护、bindGlobalEvents 一次注册、
 *   petShortcutBlocked 输入框抢键防护、位置持久化（FLOATING_PET_POSITION_SET）、摘要窗口与翻译进度。
 * 模块边界：window 级监听只注册一次；快捷键在可编辑区不触发；样式经 Shadow DOM 隔离；
 *   必须保持非 ESM（module-graph R1 强制），不直接读写受保护存储。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  // 伴读猫每标签页只挂一只：限定顶层主框架，避免每个可见 iframe 各挂一只相互重叠。
  if (window.top !== window) return;

  // manifest content_scripts 与 background injectPageUI 可能叠注入。
  // 旧实例的 init() 在 await 之后仍会继续建 DOM；用代数令过期的异步初始化直接退出。
  const bootId = (globalThis.__ROAMCAT_PET_GENERATION__ = (globalThis.__ROAMCAT_PET_GENERATION__ || 0) + 1);
  globalThis.__ROAMCAT_PET_BOOTING__ = true;
  if (typeof globalThis.RoamCatPet?.dispose === 'function') {
    globalThis.RoamCatPet.dispose();
  } else {
    document.querySelectorAll('#roamcat-pet-host').forEach(el => el.remove());
  }
  window.__ROAMCAT_PET_INSTALLED__ = true;

  let hostEl = null;
  let shadowRoot = null;
  let currentSettings = null;
  let isDragging = false;
  let dragMoved = false;
  let startX = 0, startY = 0;
  let initialRight = 24, initialBottom = 84;
  let currentRight = 24, currentBottom = 84;
  let isMenuOpen = false;
  let isSummaryOpen = false;
  let isDocked = false;
  let petState = 'idle'; // 'idle' | 'thinking' | 'success' | 'error'
  let cachedSummary = null;
  let cachedSummarySource = null;
  let currentArticleMeta = null;
  let readingEnabled = false;
  let detectedDomain = 'general';

  function domainName(key) {
    const map = {
      general: '通用阅读',
      tech: '软件与 AI',
      data: '数据工程',
      finance: '商业与金融',
      medical: '医学健康',
      legal: '法律与合规',
      design: '设计与产品'
    };
    return map[key] || '全篇精炼';
  }

  function domainIcon(key) {
    const map = {
      general: '🌐',
      tech: '💻',
      data: '📊',
      finance: '📈',
      medical: '🩺',
      legal: '⚖️',
      design: '🎨'
    };
    return map[key] || '✨';
  }

  // escapeHtml/formatHighlight 已由 content-ui 渲染层的文本绑定与 highlightParts 取代。

  // 在输入框或可编辑区域中操作时，全局快捷键不应抢走按键。
  function petShortcutBlocked(event) {
    if (document.designMode === 'on') return true;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.some(node => node && node.nodeType === Node.ELEMENT_NODE &&
      (node.isContentEditable || node.matches?.('input,textarea,select,[role="textbox"],[role="searchbox"],[role="combobox"]')));
  }

  function calculateReadingMeta(text) {
    if (!text) return { words: 0, minutes: 1 };
    const clean = text.trim();
    const enWords = (clean.match(/[a-zA-Z0-9_\-]+/g) || []).length;
    const cjkChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalWords = Math.max(enWords + Math.round(cjkChars * 0.6), 1);
    const minutes = Math.max(1, Math.ceil(totalWords / 220));
    return { words: totalWords, minutes };
  }

  function parseRgba(colorStr) {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') return null;
    const match = colorStr.match(/[\d.]+/g);
    if (!match || match.length < 3) return null;
    const [r, g, b, a] = match.map(Number);
    if (a !== undefined && a < 0.1) return null;
    return { r, g, b, a: a ?? 1 };
  }

  function getLuminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function getElementBg(el) {
    if (!el || !(el instanceof Element)) return null;
    let curr = el;
    while (curr) {
      try {
        const style = window.getComputedStyle(curr);
        const bg = parseRgba(style.backgroundColor);
        if (bg) return bg;
      } catch {}
      if (curr === document.documentElement) break;
      curr = curr.parentElement;
    }
    return null;
  }

  function detectPageTheme() {
    try {
      // 1. Explicit user preference override from settings
      const userPref = currentSettings?.floatingPet?.themeMode;
      if (userPref === 'dark' || userPref === 'light') return userPref;

      const html = document.documentElement;
      const body = document.body;

      // 2. High-confidence explicit theme attributes on html / body
      const attrChecks = [
        html?.getAttribute('data-theme'),
        html?.getAttribute('data-color-mode'),
        html?.getAttribute('theme'),
        html?.getAttribute('data-mode'),
        body?.getAttribute('data-theme'),
        body?.getAttribute('data-color-mode'),
        body?.getAttribute('theme'),
        body?.getAttribute('data-mode')
      ];
      for (const val of attrChecks) {
        if (typeof val === 'string') {
          const v = val.toLowerCase();
          if (v.includes('dark')) return 'dark';
          if (v.includes('light')) return 'light';
        }
      }

      // 3. ClassList indicators (Tailwind, Next.js, Shadcn, VS Code, GitHub, Bootstrap, Terminal, VitePress)
      const classStr = `${html?.className || ''} ${body?.className || ''}`.toLowerCase();
      if (/(^|\s)(dark|theme-dark|vscode-dark|dark-mode|bp-dark|night-mode|monaco-dark|tw-dark)(\s|$)/.test(classStr)) {
        return 'dark';
      }

      // 4. CSS color-scheme declaration on root / body
      try {
        const htmlCs = html ? window.getComputedStyle(html).colorScheme : '';
        const bodyCs = body ? window.getComputedStyle(body).colorScheme : '';
        if (htmlCs === 'dark' || bodyCs === 'dark') return 'dark';
        if (htmlCs === 'light' || bodyCs === 'light') return 'light';
      } catch {}

      // 5. Direct root background inspection (documentElement & body)
      const rootBg = (body && getElementBg(body)) || (html && getElementBg(html));
      if (rootBg) {
        const lum = getLuminance(rootBg.r, rootBg.g, rootBg.b);
        if (lum < 110) return 'dark';
        if (lum > 145) return 'light';
      }

      // 6. Check common SPA content containers (#root, #__next, main, article, pre, code)
      const mainContainer = document.querySelector('#__next, #root, #app, main, [role="main"], article, .app-container, .terminal, pre, code');
      if (mainContainer) {
        const bg = getElementBg(mainContainer);
        if (bg) {
          const lum = getLuminance(bg.r, bg.g, bg.b);
          if (lum < 110) return 'dark';
          if (lum > 145) return 'light';
        }
      }

      // 7. Text color contrast check across page content (bright/white text proves dark mode)
      const textSamples = document.querySelectorAll('p, h1, h2, h3, li, article, main, code, pre');
      let brightTextCount = 0;
      let darkTextCount = 0;
      let inspected = 0;
      for (const el of textSamples) {
        if (!el.textContent?.trim()) continue;
        try {
          const c = parseRgba(window.getComputedStyle(el).color);
          if (c) {
            const lum = getLuminance(c.r, c.g, c.b);
            if (lum > 165) brightTextCount++;
            else if (lum < 90) darkTextCount++;
            inspected++;
            if (inspected >= 15) break;
          }
        } catch {}
      }
      if (inspected >= 2) {
        if (brightTextCount > darkTextCount) return 'dark';
        if (darkTextCount > brightTextCount) return 'light';
      }

      // 8. Sample background color underneath the pet's actual screen position
      if (window.innerWidth && window.innerHeight) {
        try {
          const sampleX = Math.max(10, Math.min(window.innerWidth - (currentRight || 24) - 20, window.innerWidth - 10));
          const sampleY = Math.max(10, Math.min(window.innerHeight - (currentBottom || 84) - 20, window.innerHeight - 10));
          const elements = document.elementsFromPoint ? document.elementsFromPoint(sampleX, sampleY) : [];
          for (const el of elements) {
            if (el && el.id !== 'roamcat-pet-host' && !el.closest?.('#roamcat-pet-host')) {
              const bg = getElementBg(el);
              if (bg) {
                const lum = getLuminance(bg.r, bg.g, bg.b);
                if (lum < 110) return 'dark';
                if (lum > 145) return 'light';
              }
            }
          }
        } catch {}
      }

      // 9. Browser / System preference fallback
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {}
    return 'light';
  }

  // CSS for isolated Shadow DOM with Light & Dark support
  function getPetStyles() {
    const designTokens = globalThis.RoamCatDesign?.cssFor ? globalThis.RoamCatDesign.cssFor(':host') : '';
    return `
      ${designTokens}

      :host {
        display: block !important;
        position: fixed !important;
        width: 64px !important;
        height: 68px !important;
        overflow: visible !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color-scheme: light dark;
      }

      :host, :host([data-theme="light"]) {
        color-scheme: light;
        color: var(--pet-ink, #0f172a);
        --pet-cat-color: #1e293b;
        --pet-cat-hover: #d97706;
        --pet-cat-glow: drop-shadow(0 0 1px rgba(255, 255, 255, 0.9)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.18));
        --pet-cat-glow-hover: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95)) drop-shadow(0 4px 14px rgba(217, 119, 6, 0.4));
        --pet-primary: #d97706;
        --pet-primary-soft: #fffbeb;
        --pet-primary-hover: #b45309;
        --pet-accent: #0f172a;
        --pet-surface: #ffffff;
        --pet-surface-elevated: #ffffff;
        --pet-line: #e2e8f0;
        --pet-line-subtle: rgba(15, 23, 42, 0.06);
        --pet-ink: #0f172a;
        --pet-muted: #64748b;
        --pet-tag-bg: rgba(0, 0, 0, 0.04);
        --pet-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
        --pet-shadow-md: 0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04);
        --pet-shadow-lg: 0 16px 36px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.06);
      }

      :host([data-theme="dark"]) {
        color-scheme: dark;
        color: #f8fafc;
        --pet-cat-color: #f8fafc;
        --pet-cat-hover: #fbbf24;
        --pet-cat-glow: drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.8)) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 8px rgba(245, 158, 11, 0.35));
        --pet-cat-glow-hover: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95)) drop-shadow(0 4px 20px rgba(245, 158, 11, 0.65)) drop-shadow(0 0 14px rgba(251, 191, 36, 0.5));
        --pet-primary: #f59e0b;
        --pet-primary-soft: rgba(245, 158, 11, 0.16);
        --pet-primary-hover: #fbbf24;
        --pet-accent: #f8fafc;
        --pet-surface: #18181b;
        --pet-surface-elevated: #27272a;
        --pet-line: rgba(255, 255, 255, 0.12);
        --pet-line-subtle: rgba(255, 255, 255, 0.07);
        --pet-ink: #f8fafc;
        --pet-muted: #94a3b8;
        --pet-tag-bg: rgba(255, 255, 255, 0.08);
        --pet-shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.5);
        --pet-shadow-md: 0 12px 36px rgba(0, 0, 0, 0.6);
        --pet-shadow-lg: 0 20px 48px rgba(0, 0, 0, 0.7);
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme])) {
          color-scheme: dark;
          color: #f8fafc;
          --pet-cat-color: #f8fafc;
          --pet-cat-hover: #fbbf24;
          --pet-cat-glow: drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.8)) drop-shadow(0 2px 10px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 8px rgba(245, 158, 11, 0.35));
          --pet-cat-glow-hover: drop-shadow(0 0 2px rgba(255, 255, 255, 0.95)) drop-shadow(0 4px 20px rgba(245, 158, 11, 0.65)) drop-shadow(0 0 14px rgba(251, 191, 36, 0.5));
          --pet-primary: #f59e0b;
          --pet-primary-soft: rgba(245, 158, 11, 0.16);
          --pet-primary-hover: #fbbf24;
          --pet-accent: #f8fafc;
          --pet-surface: #18181b;
          --pet-surface-elevated: #27272a;
          --pet-line: rgba(255, 255, 255, 0.12);
          --pet-line-subtle: rgba(255, 255, 255, 0.07);
          --pet-ink: #f8fafc;
          --pet-muted: #94a3b8;
          --pet-tag-bg: rgba(255, 255, 255, 0.08);
          --pet-shadow-sm: 0 4px 14px rgba(0, 0, 0, 0.5);
          --pet-shadow-md: 0 12px 36px rgba(0, 0, 0, 0.6);
          --pet-shadow-lg: 0 20px 48px rgba(0, 0, 0, 0.7);
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
        width: 64px;
        height: 68px;
        z-index: 2147483640;
        pointer-events: auto;
        user-select: none;
        -webkit-user-drag: none;
        transition: transform 0.36s cubic-bezier(0.34, 1.3, 0.64, 1), opacity 0.2s ease;
      }

      .roamcat-pet-widget.dragging {
        transition: none;
      }

      /* Edge Docking - Dedicated Peeking Mascot Mode (贴边探头姿态) */
      .roamcat-pet-widget.docked {
        transform: translateX(18px);
      }

      .roamcat-pet-widget.docked:hover,
      .roamcat-pet-widget.docked.peek-out,
      .roamcat-pet-widget.docked.has-speech,
      .roamcat-pet-widget.docked:has(.cat-speech-bubble.speaking),
      .roamcat-pet-widget.docked:has(.roamcat-bubble-menu.open) {
        transform: translateX(-22px) !important;
      }

      .roamcat-pet-widget.is-left.docked {
        transform: translateX(-18px);
      }

      .roamcat-pet-widget.is-left .cat-mode-peeking {
        transform: scaleX(-1);
      }

      .roamcat-pet-widget.is-left.docked:hover,
      .roamcat-pet-widget.is-left.docked.peek-out,
      .roamcat-pet-widget.is-left.docked.has-speech,
      .roamcat-pet-widget.is-left.docked:has(.cat-speech-bubble.speaking),
      .roamcat-pet-widget.is-left.docked:has(.roamcat-bubble-menu.open) {
        transform: translateX(22px) !important;
      }


      /* Edge Tab (贴边吸附毛玻璃胶囊条) */
      .roamcat-edge-tab {
        position: absolute;
        top: 10px;
        right: 0;
        left: auto;
        width: 20px;
        height: 48px;
        border-radius: 12px 0 0 12px;
        background: var(--pet-surface-elevated, #ffffff);
        border: 1.5px solid var(--pet-line, #e2e8f0);
        border-right: none;
        box-shadow: -2px 3px 12px rgba(0, 0, 0, 0.08);
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 8;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.22s ease,
                    border-color 0.2s ease,
                    box-shadow 0.2s ease;
        padding: 0;
        user-select: none;
      }

      .roamcat-pet-widget.is-left .roamcat-edge-tab {
        left: 0;
        right: auto;
        border-radius: 0 12px 12px 0;
        border-left: none;
        border-right: 1.5px solid var(--pet-line, #e2e8f0);
        box-shadow: 2px 3px 12px rgba(0, 0, 0, 0.08);
      }

      .roamcat-pet-widget.docked .roamcat-edge-tab {
        display: flex;
        opacity: 0.92;
      }

      .roamcat-edge-tab:hover {
        border-color: var(--pet-primary, #f59e0b);
        box-shadow: 0 4px 16px rgba(245, 158, 11, 0.35);
      }

      /* 当悬停探出、发声说话、或打开菜单时，贴边胶囊平滑淡出隐藏，让猫猫身躯与功能清爽展露，绝不贴在猫身上！ */
      .roamcat-pet-widget.docked:hover .roamcat-edge-tab,
      .roamcat-pet-widget.docked.peek-out .roamcat-edge-tab,
      .roamcat-pet-widget.docked.has-speech .roamcat-edge-tab,
      .roamcat-pet-widget.docked:has(.cat-speech-bubble.speaking) .roamcat-edge-tab,
      .roamcat-pet-widget.docked:has(.roamcat-bubble-menu.open) .roamcat-edge-tab {
        opacity: 0 !important;
        pointer-events: none !important;
      }

      .edge-tab-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        pointer-events: none;
      }

      .edge-tab-paw {
        font-size: 11px;
        line-height: 1;
        color: var(--pet-primary, #f59e0b);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.12));
      }

      .edge-tab-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--pet-primary, #f59e0b);
        box-shadow: 0 0 6px var(--pet-primary, #f59e0b);
        animation: edge-dot-pulse 2.2s ease-in-out infinite;
      }

      @keyframes edge-dot-pulse {
        0%, 100% { opacity: 0.45; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1.25); }
      }

      /* =========================================================
         Satellite Orbit Quick Switch: 旋旋翻按钮 (Orbit / Flip Button)
         已并入 .roamcat-quick-dock 卫星带末端（离猫最近），定位与贴边
         隐藏/探出由 dock 统一接管。
         ========================================================= */
      .roamcat-flip-btn {
        position: relative;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--pet-surface-elevated, #ffffff);
        border: 1px solid var(--pet-line, #e2ded4);
        box-shadow: var(--pet-shadow-sm);
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
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }

      .roamcat-flip-btn:hover {
        transform: scale(1.08) translateY(-1px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16), 0 0 0 1px var(--pet-primary, #f59e0b);
        border-color: var(--pet-primary, #f59e0b);
      }

      .roamcat-flip-btn:focus-visible {
        outline: 2px solid var(--pet-primary, #f59e0b);
        outline-offset: 2px;
      }

      .roamcat-flip-btn:active {
        transform: scale(0.94) translateY(1px);
      }

      /* 3D Coin/Card Container */
      .flip-coin {
        width: 100%;
        height: 100%;
        position: relative;
        transform-style: preserve-3d;
        transition: transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Coin Faces */
      .coin-face {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      .coin-face-front {
        transform: rotateY(0deg);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        letter-spacing: -0.3px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .coin-glyph-bilingual {
        display: inline-flex;
        align-items: center;
        font-size: 10px;
        font-weight: 700;
      }

      .glyph-main {
        color: var(--pet-primary, #f59e0b);
        font-size: 11px;
      }

      .glyph-sep {
        font-size: 8px;
        color: var(--pet-muted, #9ca3af);
        opacity: 0.6;
        margin: 0 0.5px;
      }

      .glyph-sub {
        font-size: 9px;
        color: var(--pet-ink, #161511);
      }

      .coin-face-back {
        transform: rotateY(180deg);
        background: var(--pet-primary-soft, rgba(245, 158, 11, 0.14));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .coin-glyph-active-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      .coin-active-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--pet-primary, #f59e0b);
        box-shadow: 0 0 5px var(--pet-primary, #f59e0b);
      }

      .coin-glyph-active {
        font-size: 10px;
        font-weight: 700;
        color: var(--pet-primary, #f59e0b);
        letter-spacing: -0.2px;
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

      /* ACTIVE STATE (双语翻译已开启) */
      .roamcat-flip-btn.is-active {
        border-color: var(--pet-primary, #f59e0b);
        box-shadow: 0 0 0 1px var(--pet-primary, #f59e0b), var(--pet-shadow-sm);
      }

      .roamcat-flip-btn.is-active .flip-coin {
        transform: rotateY(180deg);
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

      /* Micro-flip trigger animation when clicked */
      .roamcat-flip-btn.flip-trigger {
        animation: flip-pop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes flip-pop {
        0% { transform: scale(1); }
        50% { transform: scale(1.14) rotate(180deg); }
        100% { transform: scale(1); }
      }

      /* Tooltip for the flip button：与 .quick-tooltip 一致，向带内方向弹出 */
      .flip-tooltip {
        position: absolute;
        right: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%) translateX(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #161511);
        border: 1px solid var(--pet-line, #e2ded4);
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
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

      .roamcat-pet-widget.dragging .flip-tooltip,
      .roamcat-pet-widget.menu-open .flip-tooltip {
        opacity: 0 !important;
        visibility: hidden;
      }

      /* =========================================================
         左侧快捷按钮行：阅读开关 / 摘要 / 设置 / 贴边
         位于猫的左下角、横向向左延伸（与上方旋旋翻不重叠）；贴边时随旋旋翻
         一起隐藏，悬停探出恢复；猫贴左屏时整行翻到右侧。
         ========================================================= */
      .roamcat-quick-dock {
        position: absolute;
        bottom: -8px;
        left: -8px;
        transform: translateX(-100%);
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        z-index: 11;
        transition: opacity 0.2s ease;
      }

      /* Pet 贴左屏时按钮行翻到右侧（始终朝向页面中心，避免超出视口）；
         row-reverse 让旋旋翻保持离猫最近，整排顺序镜像一致 */
      .roamcat-pet-widget.is-left .roamcat-quick-dock {
        left: auto;
        right: -8px;
        transform: translateX(100%);
        flex-direction: row-reverse;
      }

      /* 隐形悬停桥：盖住按钮排与猫身之间的 8px 缝隙，指针移向按钮时不掉 hover。
         按钮排隐藏时 pointer-events 继承为 none，不会拦截页面点击。 */
      .roamcat-quick-dock::before {
        content: "";
        position: absolute;
        top: -10px;
        bottom: -10px;
        right: -14px;
        width: 14px;
      }

      .roamcat-pet-widget.is-left .roamcat-quick-dock::before {
        right: auto;
        left: -14px;
      }

      /* 贴边时隐藏，悬停或探出时恢复；收起带 140ms 延迟（visibility 过渡保留
         延迟窗内的可点击性），快速滑过不闪断 */
      .roamcat-pet-widget.docked .roamcat-quick-dock {
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.18s ease 0.14s, visibility 0s 0.14s;
      }
      .roamcat-pet-widget.docked:hover .roamcat-quick-dock,
      .roamcat-pet-widget.docked.peek-out .roamcat-quick-dock {
        opacity: 1;
        visibility: visible;
        transition-delay: 0s;
      }

      .roamcat-quick-btn {
        position: relative;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--pet-surface-elevated, #ffffff);
        border: 1px solid var(--pet-line, #e2ded4);
        box-shadow: var(--pet-shadow-sm);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        outline: none;
        font-size: 14px;
        line-height: 1;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
                    box-shadow 0.2s ease,
                    border-color 0.2s ease,
                    background-color 0.2s ease,
                    opacity 0.2s ease;
        user-select: none;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }

      .roamcat-quick-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16), 0 0 0 1px var(--pet-primary, #f59e0b);
        border-color: var(--pet-primary, #f59e0b);
      }

      .roamcat-quick-btn:focus-visible {
        outline: 2px solid var(--pet-primary, #f59e0b);
        outline-offset: 2px;
      }

      .roamcat-quick-btn:active {
        transform: scale(0.92);
      }

      /* 开启态：阅读辅助生效时高亮 */
      .roamcat-quick-btn.is-active {
        background: var(--pet-primary-soft, #fef3c7);
        border-color: var(--pet-primary, #f59e0b);
      }

      .roamcat-quick-btn .quick-tooltip {
        position: absolute;
        right: calc(100% + 6px);
        top: 50%;
        transform: translateY(-50%) translateX(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #161511);
        border: 1px solid var(--pet-line, #e2ded4);
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
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

      .roamcat-pet-widget.dragging .quick-tooltip,
      .roamcat-pet-widget.menu-open .quick-tooltip {
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
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #111827);
        border: 1.5px solid var(--pet-line, #e5e7eb);
        border-radius: 12px;
        padding: 6px 10px;
        font-size: 11.5px;
        font-weight: 600;
        white-space: normal;
        overflow-wrap: anywhere;
        line-height: 1.35;
        text-align: left;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1), border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
        z-index: 15;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: max-content;
        max-width: min(260px, calc(100vw - 36px));
      }

      .cat-speech-bubble::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border-width: 5px;
        border-style: solid;
        border-color: var(--pet-surface-elevated, #ffffff) transparent transparent transparent;
        transition: border-color 0.2s ease;
      }

      .cat-speech-bubble.speaking {
        opacity: 1 !important;
        transform: translateX(-50%) translateY(0);
        pointer-events: auto !important;
        visibility: visible !important;
      }

      /* 针对右半屏或贴右边缘的对齐策略：气泡右对齐，向网页内侧展开，100% 避免超出视口！ */
      .roamcat-pet-widget:not(.is-left) .cat-speech-bubble {
        left: auto !important;
        right: 0 !important;
        transform: translateY(4px);
      }
      .roamcat-pet-widget:not(.is-left) .cat-speech-bubble::after {
        left: auto !important;
        right: 22px !important;
        transform: none !important;
      }
      .roamcat-pet-widget:not(.is-left) .cat-speech-bubble.speaking,
      .roamcat-pet-widget:not(.is-left) .roamcat-avatar-wrap:hover .cat-speech-bubble:not(.speaking) {
        transform: translateY(0) !important;
      }

      /* 针对左半屏或贴左边缘的对齐策略：气泡左对齐，向网页内侧展开，100% 避免超出视口！ */
      .roamcat-pet-widget.is-left .cat-speech-bubble {
        left: 0 !important;
        right: auto !important;
        transform: translateY(4px);
      }
      .roamcat-pet-widget.is-left .cat-speech-bubble::after {
        left: 22px !important;
        right: auto !important;
        transform: none !important;
      }
      .roamcat-pet-widget.is-left .cat-speech-bubble.speaking,
      .roamcat-pet-widget.is-left .roamcat-avatar-wrap:hover .cat-speech-bubble:not(.speaking) {
        transform: translateY(0) !important;
      }

      /* Speaking default state */
      .cat-speech-bubble.speaking {
        background: var(--pet-surface-elevated, #ffffff);
        color: var(--pet-ink, #161511) !important;
        border-color: var(--pet-line, #e5e7eb);
      }
      .cat-speech-bubble.speaking .speech-text {
        color: var(--pet-ink, #161511) !important;
      }
      .cat-speech-bubble.speaking::after {
        border-color: var(--pet-surface-elevated, #ffffff) transparent transparent transparent;
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
      .cat-speech-bubble.speaking.is-busy::after {
        border-color: #fffbeb transparent transparent transparent !important;
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
        border-color: #f59e0b !important;
        background: #1e2028 !important;
        color: #fef3c7 !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245, 158, 11, 0.3) !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-text {
        color: #fef3c7 !important;
        font-weight: 600 !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy::after {
        border-color: #1e2028 transparent transparent transparent !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-spinner {
        border: 2px solid rgba(245, 158, 11, 0.25);
        border-top-color: #f59e0b;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-close-btn {
        color: #f59e0b;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-busy .speech-close-btn:hover {
        color: #fbbf24;
        background: rgba(245, 158, 11, 0.15);
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy {
          border-color: #f59e0b !important;
          background: #1e2028 !important;
          color: #fef3c7 !important;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(245, 158, 11, 0.3) !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-text {
          color: #fef3c7 !important;
          font-weight: 600 !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy::after {
          border-color: #1e2028 transparent transparent transparent !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-spinner {
          border: 2px solid rgba(245, 158, 11, 0.25);
          border-top-color: #f59e0b;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-close-btn {
          color: #f59e0b;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-busy .speech-close-btn:hover {
          color: #fbbf24;
          background: rgba(245, 158, 11, 0.15);
        }
      }

      /* Error state - Light default */
      .cat-speech-bubble.speaking.is-error {
        border-color: #ef4444 !important;
        background: #fef2f2 !important;
        color: #991b1b !important;
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.16) !important;
      }
      .cat-speech-bubble.speaking.is-error .speech-text {
        color: #991b1b !important;
        font-weight: 600 !important;
      }
      .cat-speech-bubble.speaking.is-error::after {
        border-color: #fef2f2 transparent transparent transparent !important;
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
        border-color: #f87171 !important;
        background: #201315 !important;
        color: #fca5a5 !important;
        box-shadow: 0 4px 18px rgba(248, 113, 113, 0.25) !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-error .speech-text {
        color: #fca5a5 !important;
        font-weight: 600 !important;
      }
      :host([data-theme="dark"]) .cat-speech-bubble.speaking.is-error::after {
        border-color: #201315 transparent transparent transparent !important;
      }

      @media (prefers-color-scheme: dark) {
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error {
          border-color: #f87171 !important;
          background: #201315 !important;
          color: #fca5a5 !important;
          box-shadow: 0 4px 18px rgba(248, 113, 113, 0.25) !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error .speech-text {
          color: #fca5a5 !important;
          font-weight: 600 !important;
        }
        :host(:not([data-theme="light"])) .cat-speech-bubble.speaking.is-error::after {
          border-color: #201315 transparent transparent transparent !important;
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

      .speech-close-btn {
        display: none;
        background: transparent;
        border: none;
        color: var(--pet-muted, #6b7280);
        cursor: pointer;
        font-size: 10px;
        padding: 0;
        margin-left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background-color 0.15s;
        flex-shrink: 0;
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
        transform: translateX(-50%) translateY(0);
      }

      .roamcat-pet-widget.dragging .cat-speech-bubble,
      .roamcat-pet-widget.menu-open .cat-speech-bubble {
        opacity: 0 !important;
        visibility: hidden !important;
      }

      /* Official 2D Scanline Mascot Cat SVG & Breathing Animation */
      .cat-svg {
        width: 58px;
        height: 62px;
        color: var(--pet-cat-color, #1e293b);
        filter: var(--pet-cat-glow);
        transform-origin: 230px 450px;
        animation: cat-breathe 3.6s ease-in-out infinite;
        overflow: visible;
        display: block;
        pointer-events: none;
        transition: color 0.22s ease, filter 0.22s ease, transform 0.28s ease;
      }

      .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #d97706);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="dark"]) .cat-svg {
        color: var(--pet-cat-color, #f8fafc);
        filter: var(--pet-cat-glow);
      }

      :host([data-theme="dark"]) .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #fbbf24);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="light"]) .cat-svg {
        color: var(--pet-cat-color, #1e293b);
        filter: var(--pet-cat-glow);
      }

      :host([data-theme="light"]) .roamcat-avatar-wrap:hover .cat-svg {
        color: var(--pet-cat-hover, #d97706);
        filter: var(--pet-cat-glow-hover);
      }

      @keyframes cat-breathe {
        0%, 100% { transform: translateY(0) scaleY(1); }
        50% { transform: translateY(-2.2px) scaleY(1.025); }
      }

      /* 1. Tail Wagging Animation */
      .cat-tail {
        transform-origin: 395px 250px;
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
        transform-origin: 50px 50px;
        animation: cat-ear-twitch-left 6.8s ease-in-out infinite;
      }
      .cat-ear-right {
        transform-origin: 245px 50px;
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
        transform-origin: 125px 145px;
        animation: scan-blink 4.2s ease-in-out infinite;
        opacity: 1;
        transition: opacity 0.16s ease;
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
      .zzz-1 { font-size: 10px; right: 8px; animation-delay: 0s; }
      .zzz-2 { font-size: 13px; right: 2px; animation-delay: 1s; }
      .zzz-3 { font-size: 16px; right: -4px; animation-delay: 2s; }
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
        pointer-events: none;
        font-size: 16px;
        z-index: 25;
        animation: particle-rise 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
      }
      .cat-mode-peeking {
        display: none;
        width: 100%;
        height: 100%;
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
        color: var(--pet-cat-hover, #d97706);
        filter: var(--pet-cat-glow-hover);
      }

      :host([data-theme="dark"]) .roamcat-avatar-wrap:hover .cat-peeking-svg {
        color: var(--pet-cat-hover, #fbbf24);
        filter: var(--pet-cat-glow-hover);
      }

      /* Idle Subtle Breathing Sway in Peeking Mode */
      .roamcat-pet-widget.docked:not(.is-left) .cat-peeking-svg {
        animation: peeking-breathe-right 3.8s ease-in-out infinite;
      }
      @keyframes peeking-breathe-right {
        0%, 100% { transform: translateX(0) rotate(0deg); }
        50% { transform: translateX(-3.5px) rotate(-1.5deg); }
      }

      .roamcat-pet-widget.is-left.docked .cat-peeking-svg {
        animation: peeking-breathe-left 3.8s ease-in-out infinite;
      }
      @keyframes peeking-breathe-left {
        0%, 100% { transform: scaleX(-1) translateX(0) rotate(0deg); }
        50% { transform: scaleX(-1) translateX(-3.5px) rotate(-1.5deg); }
      }

      /* Peeking Eyes: Blinking & Happy Squint */
      .peeking-eyes-open {
        transform-origin: 80px 85px;
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
        transform-origin: 75px 55px;
        animation: peeking-ear-twitch 6.4s ease-in-out infinite;
      }
      @keyframes peeking-ear-twitch {
        0%, 88%, 94%, 100% { transform: rotate(0deg); }
        90% { transform: rotate(-7deg) translateY(-1px); }
        92% { transform: rotate(3deg); }
      }

      /* Peeking Whisker Micro-Vibration */
      .peeking-whiskers .whisker {
        transform-origin: 46px 100px;
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
        .roamcat-bubble-menu,
        .roamcat-summary-window {
          transition: none !important;
        }
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Bubble Action Menu */
      .roamcat-bubble-menu {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        left: auto;
        transform-origin: right bottom;
        width: 230px;
        background: var(--pet-surface);
        border: 1px solid var(--pet-line);
        border-radius: 16px;
        box-shadow: var(--pet-shadow-lg);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      /* When Pet is on Left Side of screen, menu opens towards right */
      .roamcat-pet-widget.is-left .roamcat-bubble-menu {
        right: auto;
        left: 0;
        transform-origin: left bottom;
      }

      .roamcat-bubble-menu.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .menu-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px 8px;
        border-bottom: 1px solid var(--pet-line-subtle);
        margin-bottom: 3px;
      }

      .menu-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--pet-ink);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .menu-pulse-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px #10b981;
      }

      .menu-header-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .menu-domain-tag {
        font-size: 10.5px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--pet-primary-soft);
        color: var(--pet-primary);
        font-weight: 500;
        border: 1px solid var(--pet-line-subtle);
        display: flex;
        align-items: center;
        gap: 3px;
      }

      .menu-theme-btn {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid var(--pet-line-subtle);
        background: var(--pet-tag-bg);
        color: var(--pet-ink);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11.5px;
        transition: all 0.15s ease;
        padding: 0;
      }

      .menu-theme-btn:hover {
        background: var(--pet-line);
        color: var(--pet-primary);
        transform: scale(1.08);
      }

      .menu-close-btn {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: none;
        background: transparent;
        color: var(--pet-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: background 0.15s, color 0.15s;
      }

      .menu-close-btn:hover {
        background: var(--pet-line-subtle);
        color: var(--pet-ink);
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--pet-ink);
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        width: 100%;
        transition: background-color 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
      }

      .menu-item:hover {
        background: var(--pet-tag-bg);
        transform: translateX(2px);
      }

      .roamcat-pet-widget.is-left .menu-item:hover {
        transform: translateX(-2px);
      }

      .menu-item:active {
        transform: scale(0.98);
      }

      /* Primary action button styling */
      .menu-item.primary-action {
        background: var(--pet-primary-soft);
        border-color: var(--pet-line-subtle);
      }

      .menu-item.primary-action:hover {
        background: var(--pet-primary-soft);
        border-color: var(--pet-primary);
      }

      .menu-item-icon {
        font-size: 16px;
        width: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: transform 0.15s ease;
      }

      .menu-item:hover .menu-item-icon {
        transform: scale(1.15);
      }

      .menu-item-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .menu-item-label {
        font-weight: 500;
        line-height: 1.25;
        color: var(--pet-ink);
      }

      .menu-item.primary-action .menu-item-label {
        font-weight: 600;
        color: var(--pet-primary);
      }

      .menu-item-sub {
        font-size: 10.5px;
        color: var(--pet-muted);
        margin-top: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .menu-item-badge {
        font-size: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--pet-line-subtle);
        color: var(--pet-muted);
        border: 1px solid var(--pet-line);
        flex-shrink: 0;
      }

      /* Interactive Switch Component in Menu */
      .menu-switch {
        position: relative;
        width: 32px;
        height: 18px;
        border-radius: 999px;
        background: var(--pet-line);
        transition: background-color 0.22s ease;
        flex-shrink: 0;
      }

      .menu-switch-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
      }

      .menu-switch.active {
        background: #10b981;
      }

      .menu-switch.active .menu-switch-thumb {
        transform: translateX(14px);
      }

      /* Summary Card Window */
      .roamcat-summary-window {
        position: fixed;
        width: 460px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 80px);
        background: var(--pet-surface);
        border: 1px solid var(--pet-line);
        border-radius: 18px;
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
        padding: 12px 18px;
        border-bottom: 1px solid var(--pet-line);
        background: var(--pet-surface-elevated);
      }

      .summary-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: var(--pet-ink);
      }

      .summary-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .summary-action-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid var(--pet-line-subtle);
        background: transparent;
        color: var(--pet-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: all 0.15s ease;
      }

      .summary-action-btn:hover {
        background: var(--pet-tag-bg);
        color: var(--pet-ink);
        border-color: var(--pet-line);
      }

      .summary-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--pet-muted);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.15s;
      }

      .summary-close-btn:hover {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }

      .summary-body {
        padding: 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-height: 62vh;
      }

      /* Article Meta Reading Strip */
      .summary-meta-strip {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px 12px;
        background: var(--pet-tag-bg);
        border: 1px solid var(--pet-line-subtle);
        border-radius: 8px;
        font-size: 11.5px;
        color: var(--pet-muted);
      }

      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .meta-sep {
        opacity: 0.4;
      }

      .meta-domain-pill {
        color: var(--pet-primary);
        font-weight: 600;
      }

      /* Core Takeaway Box */
      .takeaway-card {
        padding: 14px 16px;
        background: var(--pet-primary-soft);
        border: 1px solid rgba(138, 90, 23, 0.2);
        border-left: 4px solid var(--pet-primary);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: var(--pet-shadow-sm);
      }

      .takeaway-label {
        font-size: 11.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--pet-primary);
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .takeaway-text {
        font-size: 14.5px;
        font-weight: 600;
        line-height: 1.6;
        color: var(--pet-ink);
      }

      /* Highlight Points */
      .highlights-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .section-subtitle {
        font-size: 12px;
        font-weight: 600;
        color: var(--pet-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .highlight-list {
        display: flex;
        flex-direction: column;
        gap: 9px;
        list-style: none;
      }

      .highlight-item {
        display: flex;
        gap: 10px;
        font-size: 13.5px;
        line-height: 1.6;
        color: var(--pet-ink);
        background: var(--pet-surface-elevated);
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--pet-line);
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        transition: border-color 0.15s ease, transform 0.15s ease;
      }

      .highlight-item:hover {
        border-color: var(--pet-primary);
        transform: translateY(-1px);
      }

      .highlight-num {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--pet-primary-soft);
        color: var(--pet-primary);
        font-size: 11px;
        font-weight: 700;
        flex-shrink: 0;
        margin-top: 1px;
        border: 1px solid rgba(138, 90, 23, 0.2);
      }

      .highlight-content {
        flex: 1;
      }

      .highlight-content strong.hl-bold {
        color: var(--pet-primary);
        font-weight: 600;
      }

      /* Keywords Pills */
      .keywords-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .keyword-pill {
        font-size: 11.5px;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--pet-tag-bg);
        color: var(--pet-ink);
        border: 1px solid var(--pet-line);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .keyword-pill:hover {
        border-color: var(--pet-primary);
        color: var(--pet-primary);
        background: var(--pet-primary-soft);
        transform: translateY(-1px);
      }

      .keyword-pill.copied {
        background: #10b981 !important;
        color: #ffffff !important;
        border-color: #10b981 !important;
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
        font-size: 32px;
        animation: paw-bounce 1s ease-in-out infinite alternate;
      }

      @keyframes paw-bounce {
        from { transform: translateY(0); }
        to { transform: translateY(-10px); }
      }

      .loading-text {
        font-size: 13.5px;
        font-weight: 500;
        color: var(--pet-muted);
        max-width: 320px;
        line-height: 1.6;
      }

      /* Summary Error State */
      .summary-error {
        padding: 16px 18px;
        background: #fff3f2;
        border: 1px solid #fecdd3;
        border-radius: 12px;
        color: #b91c1c;
        font-size: 13.5px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      @media (prefers-color-scheme: dark) {
        .summary-error {
          background: #2a1515;
          border-color: #5c2020;
          color: #f87171;
        }
      }

      .summary-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        border-top: 1px solid var(--pet-line);
        background: var(--pet-surface-elevated);
      }

      .summary-footer-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .footer-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 13px;
        border-radius: 8px;
        border: 1px solid var(--pet-line);
        background: var(--pet-surface);
        color: var(--pet-ink);
        font-size: 12.5px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.15s ease;
      }

      .footer-btn:hover {
        border-color: var(--pet-primary);
        color: var(--pet-primary);
      }

      .footer-btn.primary {
        background: var(--pet-primary);
        color: #ffffff;
        border-color: var(--pet-primary);
      }

      .footer-btn.primary:hover {
        background: var(--pet-primary-hover);
        border-color: var(--pet-primary-hover);
      }

      .footer-btn.copied {
        background: #10b981;
        color: #fff;
        border-color: #10b981;
      }

      .summary-source-meta {
        font-size: 11px;
        color: var(--pet-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }
    `;
  }

  // Official Brand Mascot: RoamCat · 贴边探头姿态 (Peeking Mascot Mode)
  function renderPeekingCatSvg() {
    return `
      <svg class="cat-peeking-svg" viewBox="0 0 160 160" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <title>RoamCat · 贴边探头姿态</title>
        
        <!-- 1. Ambient Glow Silhouette -->
        <path class="peeking-base-silhouette" d="M160,20 C130,20 102,30 84,46 C68,58 48,70 38,88 C28,106 32,125 46,138 C64,150 94,156 128,158 C144,159 156,160 160,160 Z" opacity="0.08" />

        <!-- 2. Ears (Behind Head) -->
        <g class="peeking-ears">
          <!-- Back Ear (Near border) -->
          <g class="peeking-ear peeking-ear-back">
            <path d="M106,42 L132,8 C134,5 139,6 141,10 L148,38 Z" fill="currentColor" />
            <path d="M114,40 L132,15 L140,36 Z" fill="var(--pet-primary, #f59e0b)" opacity="0.9" />
          </g>
          
          <!-- Front Ear (Perky inner ear tilted forward into page) -->
          <g class="peeking-ear peeking-ear-front">
            <path d="M66,62 L48,22 C46,17 52,14 56,17 L86,48 Z" fill="currentColor" />
            <path d="M66,55 L54,26 L78,46 Z" fill="var(--pet-primary, #f59e0b)" opacity="0.95" />
          </g>
        </g>

        <!-- 3. Head & Cheek (Signature RoamCat Scanline Design) -->
        <g class="peeking-head">
          <!-- Soft Head Base Volume -->
          <path class="peeking-head-bg" d="M160,36 C136,36 108,44 90,56 C72,68 50,78 42,94 C34,109 38,124 50,135 C66,146 94,152 128,154 L160,154 Z" opacity="0.18" />

          <!-- Signature Scanline Bars (Forehead & Lower Cheek) -->
          <g class="peeking-scanlines">
            <!-- Forehead Bars -->
            <rect x="96" y="44" width="64" height="4.5" rx="2.2" />
            <rect x="84" y="52" width="76" height="4.5" rx="2.2" />
            <rect x="74" y="60" width="86" height="4.5" rx="2.2" />
            <rect x="116" y="68" width="44" height="4.5" rx="2.2" />
            <rect x="118" y="76" width="42" height="4.5" rx="2.2" />
            <rect x="118" y="84" width="42" height="4.5" rx="2.2" />
            <rect x="118" y="92" width="42" height="4.5" rx="2.2" />
            <!-- Cheek & Chin Lower Bars -->
            <rect x="42" y="104" width="118" height="4.5" rx="2.2" />
            <rect x="46" y="112" width="114" height="4.5" rx="2.2" />
            <rect x="54" y="120" width="106" height="4.5" rx="2.2" />
            <rect x="68" y="128" width="92" height="4.5" rx="2.2" />
            <rect x="88" y="136" width="72" height="4.5" rx="2.2" />
            <rect x="112" y="144" width="48" height="4.5" rx="2.2" />
          </g>

          <!-- Cute Blushing Cheeks (Warm amber/rose glow) -->
          <ellipse class="peeking-blush" cx="52" cy="110" rx="10" ry="5.5" fill="var(--pet-primary, #f59e0b)" opacity="0.5" />

          <!-- 4. Expressive Eyes Group (Crisp Solid Eyeballs) -->
          <g class="peeking-eyes-group">
            <!-- Open Eyes: Gazing with curiosity into the text -->
            <g class="peeking-eyes-open">
              <!-- Front Eye (Left, large & glossy) -->
              <ellipse cx="64" cy="86" rx="13" ry="16" fill="#ffffff" stroke="currentColor" stroke-width="2.2" />
              <ellipse cx="61.5" cy="86" rx="8.5" ry="12" fill="currentColor" />
              <!-- Double Glossy Catchlights (✨) -->
              <circle cx="58" cy="81" r="4" fill="#ffffff" />
              <circle cx="65" cy="91" r="2.2" fill="#ffffff" />

              <!-- Perspective Eye (Right, slightly smaller in perspective) -->
              <ellipse cx="98" cy="78" rx="10.5" ry="13.5" fill="#ffffff" stroke="currentColor" stroke-width="2" />
              <ellipse cx="95.5" cy="78" rx="7" ry="10" fill="currentColor" />
              <circle cx="93" cy="74" r="3.2" fill="#ffffff" />
              <circle cx="99" cy="82" r="1.8" fill="#ffffff" />
            </g>

            <!-- Squint Eyes: Happy (^ ^) when hovering or petted -->
            <g class="peeking-eyes-squint">
              <path d="M50,88 C58,74 72,74 80,88" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
              <path d="M88,80 C95,68 107,68 114,80" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" />
            </g>
          </g>

          <!-- 5. Snout & Mouth -->
          <g class="peeking-snout">
            <!-- Nose (Amber/Gold triangle) -->
            <path d="M72,97 L82,97 L77,103 Z" fill="var(--pet-primary, #f59e0b)" />
            <!-- W Mouth -->
            <path d="M68,103 Q73,108 77,104 Q81,108 85,103" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          </g>

          <!-- 6. Whiskers (Dynamic twitching) -->
          <g class="peeking-whiskers" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.85">
            <line x1="44" y1="94" x2="10" y2="88" class="whisker whisker-1" />
            <line x1="42" y1="102" x2="6" y2="102" class="whisker whisker-2" />
            <line x1="44" y1="110" x2="12" y2="118" class="whisker whisker-3" />
          </g>
        </g>

        <!-- =======================================================
             7. High-Contrast Paws Clinging on Edge (扒拉在边框上的肉垫猫爪 🐾)
             Anchored firmly at x=160 (The screen border!)
             ======================================================= -->
        <g class="peeking-paws">
          <!-- Upper Paw (上爪) -->
          <g class="peeking-paw paw-upper">
            <!-- Paw Arm / Base Wrapping over edge -->
            <path d="M160,54 C138,54 126,60 124,71 C123,81 131,89 144,91 C152,92 157,92 160,92 Z" fill="var(--pet-surface-elevated, #ffffff)" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" />
            <!-- Main Palm Pad (肉垫) -->
            <path d="M138,73 C138,67 148,67 148,73 C148,78 138,78 138,73 Z" fill="var(--pet-primary, #f59e0b)" />
            <!-- 3 Cute Rounded Toe Beans (爪尖肉垫) -->
            <circle cx="128" cy="63" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
            <circle cx="123" cy="73" r="5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
            <circle cx="128" cy="83" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          </g>

          <!-- Lower Paw (下爪) -->
          <g class="peeking-paw paw-lower">
            <path d="M160,102 C138,102 126,108 124,119 C123,129 131,137 144,139 C152,140 157,140 160,140 Z" fill="var(--pet-surface-elevated, #ffffff)" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" />
            <path d="M138,121 C138,115 148,115 148,121 C148,126 138,126 138,121 Z" fill="var(--pet-primary, #f59e0b)" />
            <circle cx="128" cy="111" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
            <circle cx="123" cy="121" r="5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
            <circle cx="128" cy="131" r="4.5" fill="var(--pet-primary, #f59e0b)" stroke="currentColor" stroke-width="1.2" />
          </g>
        </g>
      </svg>
    `;
  }

  // Official Brand Mascot: RoamCat · 扫描线漫游猫 (Exact match with official website & welcome page)
  function renderCatSvg() {
    return `
      <svg class="cat-svg" viewBox="0 0 460 490" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <title>RoamCat · 扫描线漫游猫</title>
        <!-- Soft Cat Base Silhouette -->
        <path d="M32,12L40,12L40,20L57,20L57,30L75,30L75,42L93,42L93,55L113,55L113,66L188,66L188,53L213,53L213,37L236,37L236,20L254,20L254,8L268,8L268,25L277,25L277,74L285,74L285,119L295,119L295,178L305,178L305,213L321,213L321,225L343,225L343,237L365,237L365,249L393,249L406,240L412,221L412,194L403,178L390,169L384,149L384,123L390,102L398,99L407,110L407,139L422,151L438,168L445,193L445,223L438,246L425,269L404,285L381,294L375,325L375,426L362,426L362,454L319,454L319,398L298,398L298,412L287,412L287,461L235,461L235,398L198,398L185,405L168,405L168,466L112,466L112,407L96,407L96,453L48,453L48,401L39,380L31,346L25,308L19,279L10,256L7,228L15,201L23,181L23,157L31,133L31,91L25,91L25,48L32,48Z" opacity=".09"/>
        
        <!-- Animated Wagging Tail -->
        <g class="cat-tail">
          <rect x="390.0" y="102" width="10.5" height="4.8"/>
          <rect x="387.4" y="111" width="19.6" height="4.8"/>
          <rect x="384.9" y="120" width="22.1" height="4.8"/>
          <rect x="384.0" y="129" width="23.0" height="4.8"/>
          <rect x="384.0" y="138" width="23.0" height="4.8"/>
          <rect x="384.0" y="147" width="33.0" height="4.8"/>
          <rect x="386.1" y="156" width="40.6" height="4.8"/>
          <rect x="388.8" y="165" width="46.4" height="4.8"/>
          <rect x="397.2" y="174" width="42.5" height="4.8"/>
          <rect x="405.8" y="183" width="36.4" height="4.8"/>
          <rect x="410.9" y="192" width="33.8" height="4.8"/>
          <rect x="412.0" y="201" width="33.0" height="4.8"/>
          <rect x="412.0" y="210" width="33.0" height="4.8"/>
          <rect x="412.0" y="219" width="33.0" height="4.8"/>
          <rect x="409.8" y="228" width="33.7" height="4.8"/>
          <rect x="406.9" y="237" width="33.8" height="4.8"/>
          <rect x="397.3" y="246" width="40.7" height="4.8"/>
        </g>

        <!-- Left Ear with Organic Twitch Animation -->
        <g class="cat-ear cat-ear-left">
          <rect x="32.0" y="12" width="8.0" height="4.8"/>
          <rect x="32.0" y="21" width="25.0" height="4.8"/>
          <rect x="32.0" y="30" width="43.0" height="4.8"/>
          <rect x="32.0" y="39" width="43.0" height="4.8"/>
          <rect x="25.0" y="48" width="68.0" height="4.8"/>
          <rect x="25.0" y="57" width="88.0" height="4.8"/>
          <path d="M70 42h16v9h16v9H70z"/>
        </g>

        <!-- Right Ear with Organic Twitch Animation -->
        <g class="cat-ear cat-ear-right">
          <rect x="254.0" y="12" width="14.0" height="4.8"/>
          <rect x="236.0" y="21" width="32.0" height="4.8"/>
          <rect x="236.0" y="30" width="41.0" height="4.8"/>
          <rect x="213.0" y="39" width="64.0" height="4.8"/>
          <rect x="213.0" y="48" width="64.0" height="4.8"/>
          <rect x="188.0" y="57" width="89.0" height="4.8"/>
          <path d="M224 44h36v9h9v21h-9V62h-35z"/>
        </g>

        <!-- Scanline Halftone Body Bars -->
        <g class="cat-scanlines">
          <rect x="25.0" y="66" width="252.0" height="4.8"/>
          <rect x="25.0" y="75" width="260.0" height="4.8"/>
          <rect x="25.0" y="84" width="260.0" height="4.8"/>
          <rect x="31.0" y="93" width="254.0" height="4.8"/>
          <rect x="31.0" y="102" width="254.0" height="4.8"/>
          <rect x="31.0" y="111" width="254.0" height="4.8"/>
          <rect x="31.0" y="120" width="264.0" height="4.8"/>
          <rect x="31.0" y="129" width="264.0" height="4.8"/>
          <rect x="29.3" y="138" width="265.7" height="4.8"/>
          <rect x="26.3" y="147" width="268.7" height="4.8"/>
          <rect x="23.3" y="156" width="271.7" height="4.8"/>
          <rect x="23.0" y="165" width="272.0" height="4.8"/>
          <rect x="23.0" y="174" width="272.0" height="4.8"/>
          <rect x="22.2" y="183" width="282.8" height="4.8"/>
          <rect x="18.6" y="192" width="286.4" height="4.8"/>
          <rect x="15.0" y="201" width="290.0" height="4.8"/>
          <rect x="12.3" y="210" width="292.7" height="4.8"/>
          <rect x="9.7" y="219" width="311.3" height="4.8"/>
          <rect x="7.0" y="228" width="336.0" height="4.8"/>
          <rect x="8.0" y="237" width="357.0" height="4.8"/>
          <rect x="8.9" y="246" width="356.1" height="4.8"/>
          <rect x="9.9" y="255" width="423.0" height="4.8"/>
          <rect x="13.1" y="264" width="414.7" height="4.8"/>
          <rect x="16.7" y="273" width="403.1" height="4.8"/>
          <rect x="19.6" y="282" width="388.3" height="4.8"/>
          <rect x="21.5" y="291" width="367.2" height="4.8"/>
          <rect x="23.3" y="300" width="356.5" height="4.8"/>
          <rect x="25.2" y="309" width="352.9" height="4.8"/>
          <rect x="26.6" y="318" width="349.8" height="4.8"/>
          <rect x="28.0" y="327" width="347.0" height="4.8"/>
          <rect x="29.4" y="336" width="345.6" height="4.8"/>
          <rect x="30.8" y="345" width="344.2" height="4.8"/>
          <rect x="32.9" y="354" width="342.1" height="4.8"/>
          <rect x="35.0" y="363" width="340.0" height="4.8"/>
          <rect x="37.1" y="372" width="337.9" height="4.8"/>
          <rect x="39.4" y="381" width="335.6" height="4.8"/>
          <rect x="43.3" y="390" width="331.7" height="4.8"/>
          <rect x="47.1" y="399" width="149.0" height="4.8"/>
          <rect x="235.0" y="399" width="63.0" height="4.8"/>
          <rect x="319.0" y="399" width="56.0" height="4.8"/>
          <rect x="48.0" y="408" width="48.0" height="4.8"/>
          <rect x="112.0" y="408" width="56.0" height="4.8"/>
          <rect x="235.0" y="408" width="63.0" height="4.8"/>
          <rect x="319.0" y="408" width="56.0" height="4.8"/>
          <rect x="48.0" y="417" width="48.0" height="4.8"/>
          <rect x="112.0" y="417" width="56.0" height="4.8"/>
          <rect x="235.0" y="417" width="52.0" height="4.8"/>
          <rect x="319.0" y="417" width="56.0" height="4.8"/>
          <rect x="48.0" y="426" width="48.0" height="4.8"/>
          <rect x="112.0" y="426" width="56.0" height="4.8"/>
          <rect x="235.0" y="426" width="52.0" height="4.8"/>
          <rect x="319.0" y="426" width="43.0" height="4.8"/>
          <rect x="48.0" y="435" width="48.0" height="4.8"/>
          <rect x="112.0" y="435" width="56.0" height="4.8"/>
          <rect x="235.0" y="435" width="52.0" height="4.8"/>
          <rect x="319.0" y="435" width="43.0" height="4.8"/>
          <rect x="48.0" y="444" width="48.0" height="4.8"/>
          <rect x="112.0" y="444" width="56.0" height="4.8"/>
          <rect x="235.0" y="444" width="52.0" height="4.8"/>
          <rect x="319.0" y="444" width="43.0" height="4.8"/>
          <rect x="112.0" y="453" width="56.0" height="4.8"/>
          <rect x="235.0" y="453" width="52.0" height="4.8"/>
          <rect x="319.0" y="453" width="43.0" height="4.8"/>
          <rect x="112.0" y="462" width="56.0" height="4.8"/>
        </g>
        
        <!-- Eyes Group: Natural Blink + Happy/Sleeping Squint (^ ^) -->
        <g class="cat-eyes-group">
          <g class="cat-eyes-open">
            <path d="M57 132h18v-9h20v8h-9v28h9v9H58v-9h-7v-18h6zM186 126h38v9h-8v31h9v8h-39v-9h-8v-28h8z"/>
          </g>
          <g class="cat-eyes-squint">
            <path d="M55 146 c 8 -16 26 -16 34 0" fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
            <path d="M184 146 c 8 -16 26 -16 34 0" fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
          </g>
        </g>
        
        <!-- Nose and Mouth -->
        <path class="cat-muzzle" d="M125 163h17v10h-17zM119 177h9v9h-9z"/>
        
        <!-- Ground Walking Scratch / Trail Lines -->
        <path class="cat-trail" d="M43 463h68m57 9h132m20-11h92m-201 19h19" fill="none" stroke="currentColor" stroke-width="2.5"/>
      </svg>
    `;
  }

  class RoamCatPetWidget {
    constructor() {
      // 先同步挂上猫，再异步读设置。STATE_GET 若等后台/连接器，页面上不能先空着。
      this.createDOM();
      this.bindGlobalEvents();
      this.bindEvents();
      this.startIdleActions();
      this.startSleepWatchdog();
      this._initialized = true;
      if (bootId === globalThis.__ROAMCAT_PET_GENERATION__) globalThis.__ROAMCAT_PET_BOOTING__ = false;
      this.init();
    }

    async init() {
      if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
      try {
        const response = await chrome.runtime.sendMessage({type:'STATE_GET'});
        if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
        if(!response?.ok)throw new Error(response?.error||'无法读取伴读猫设置');
        currentSettings = response.data.settings || {};
      } catch {
        if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
        currentSettings = {};
      }

      if (currentSettings?.floatingPet?.enabled === false) {
        if (hostEl) {
          hostEl.remove();
          hostEl = null;
          shadowRoot = null;
        }
        return;
      }
      if (hostEl) hostEl.style.display = '';

      initialRight = currentSettings?.floatingPet?.position?.right ?? currentRight;
      initialBottom = currentSettings?.floatingPet?.position?.bottom ?? currentBottom;
      currentRight = initialRight;
      currentBottom = initialBottom;
      this.clampPosition();
      this.updateReadingStatus();
    }

    createDOM() {
      document.querySelectorAll('#roamcat-pet-host').forEach(el => el.remove());
      hostEl = null;
      shadowRoot = null;

      hostEl = document.createElement('div');
      hostEl.id = 'roamcat-pet-host';
      hostEl.setAttribute('data-theme', detectPageTheme());
      hostEl.style.cssText = `position:fixed!important;right:${currentRight}px!important;bottom:${currentBottom}px!important;width:64px!important;height:68px!important;border:0!important;padding:0!important;margin:0!important;background:transparent!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;overflow:visible!important;color-scheme:light dark!important;`;
      hostEl.pet = this;
      hostEl.__pet = this;
      shadowRoot = hostEl.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = getPetStyles();
      shadowRoot.appendChild(style);

      // DOM 骨架由 content-ui 渲染层构建（lit-html 模板）；id/类名与原实现一致，
      // 后续状态更新继续经 shadowQuery 命令式驱动。
      const domainTag = `${domainIcon(detectedDomain)} ${domainName(detectedDomain)}`;
      const {container, edgeTab, flipBtn, quickDock, avatarWrap, bubbleMenu, summaryWindow} =
        globalThis.RoamCatContentUI.petWidget(shadowRoot, {
          domainTag,
          catSvg: renderCatSvg(),
          peekingCatSvg: renderPeekingCatSvg(),
          onEdgeTabClick: () => this.undock(),
        });

      const mountPet = () => {
        if (!hostEl) return;
        const target = document.documentElement || document.body;
        if (target && hostEl.parentElement !== target) {
          this._mounting = true;
          try { target.appendChild(hostEl); }
          finally { this._mounting = false; }
        }
      };

      if (document.documentElement || document.body) {
        mountPet();
      } else {
        window.addEventListener('DOMContentLoaded', mountPet, { once: true });
      }

      this.setupWatchdog();
      this.syncTheme();
      requestAnimationFrame(() => this.syncTheme());
      setTimeout(() => this.syncTheme(), 350);
      setTimeout(() => this.syncTheme(), 1200);

      this.container = container;
      this.edgeTab = edgeTab;
      this.flipBtn = flipBtn;
      this.quickDock = quickDock;
      this.avatarWrap = avatarWrap;
      this.bubbleMenu = bubbleMenu;
      this.summaryWindow = summaryWindow;
      this.clampPosition();
    }

    bindEvents() {
      // Orbit Flip Button Click & Hover
      if (this.flipBtn) this.flipBtn.draggable = false;
      this.flipBtn?.addEventListener('dragstart', (e) => e.preventDefault());
      this.flipBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleBilingual();
      });

      this.flipBtn?.addEventListener('pointerenter', () => {
        const bubble = this.shadowQuery('#cat-speech');
        const speechEl = this.shadowQuery('#cat-speech .speech-text');
        const st = window.__ROAMCAT_CONTENT__?.emergencyStatus?.();
        const isActive = Boolean(st?.active || st?.displayed);
        const isTranslating = st?.phase === 'translating';
        if (speechEl) {
          if (isTranslating) speechEl.textContent = '旋旋翻：正在逐段翻译 喵~';
          else if (isActive) speechEl.textContent = '旋旋翻：点击复原纯英文 喵~';
          else speechEl.textContent = '旋旋翻：一键双语对照 喵~';
        }
        bubble?.classList.add('speaking');
        this.container?.classList.add('has-speech');
      });

      this.flipBtn?.addEventListener('pointerleave', () => {
        const bubble = this.shadowQuery('#cat-speech');
        const speechEl = this.shadowQuery('#cat-speech .speech-text');
        bubble?.classList.remove('speaking');
        this.container?.classList.remove('has-speech');
        if (speechEl) speechEl.textContent = '漫游伴读 喵~';
      });

      // 左侧快捷按钮行：悬停播报 + 点击执行（与旋旋翻一致的反馈模式）
      const quickActions = [
        {id: '#quick-reading', hover: '阅读辅助：点击开合本页提示 喵~', run: () => this.toggleReadingMode()},
        {id: '#quick-summary', hover: '提炼整篇精华，喂我一下就好 喵~', run: () => this.requestArticleSummary()},
        {id: '#quick-options', hover: '打开扩展偏好设置 喵~', run: () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' })},
        {id: '#quick-dock', hover: '贴边折叠，需要时再戳我 喵~', run: () => this.toggleDock()},
      ];
      for (const action of quickActions) {
        const button = this.shadowQuery(action.id);
        if (!button) continue;
        button.draggable = false;
        button.addEventListener('dragstart', (e) => e.preventDefault());
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          action.run();
        });
        button.addEventListener('pointerenter', () => {
          const bubble = this.shadowQuery('#cat-speech');
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          if (speechEl) speechEl.textContent = action.hover;
          bubble?.classList.add('speaking');
          this.container?.classList.add('has-speech');
        });
        button.addEventListener('pointerleave', () => {
          const bubble = this.shadowQuery('#cat-speech');
          bubble?.classList.remove('speaking');
          this.container?.classList.remove('has-speech');
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          if (speechEl) speechEl.textContent = '漫游伴读 喵~';
        });
      }

      this.shadowQuery('#speech-close-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearStatusSpeech();
      });

      this.avatarWrap.draggable = false;
      this.avatarWrap.addEventListener('dragstart', (e) => e.preventDefault());
      this.avatarWrap.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      this.avatarWrap.addEventListener('lostpointercapture', (e) => this.releaseDrag(e));

      // Hover feedback when docked in peeking mode
      this.avatarWrap.addEventListener('pointerenter', () => {
        if (isDocked) {
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          const bubble = this.shadowQuery('#cat-speech');
          if (speechEl && !bubble?.classList.contains('speaking')) {
            speechEl.textContent = '探头伴读中 喵~ (点击唤醒)';
          }
        }
      });

      this.avatarWrap.addEventListener('pointerleave', () => {
        if (isDocked) {
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          const bubble = this.shadowQuery('#cat-speech');
          if (speechEl && !bubble?.classList.contains('speaking')) {
            speechEl.textContent = '漫游伴读 喵~';
          }
        }
      });

      // Double-click on cat avatar toggles docked state
      this.avatarWrap.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.toggleDock();
      });

      // Single click on cat avatar opens/closes Bubble Menu or undocks
      this.avatarWrap.addEventListener('click', (e) => {
        if (dragMoved) return;
        if (isDocked) {
          e.stopPropagation();
          this.undock();
          return;
        }
        e.stopPropagation();
        this.triggerClickReaction();
        this.toggleMenu();
      });

      // Actions in Bubble Menu
      this.shadowQuery('#btn-menu-close')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeMenu();
      });

      this.shadowQuery('#btn-summarize, #btn-summary')?.addEventListener('click', () => {
        this.closeMenu();
        this.requestArticleSummary();
      });

      this.shadowQuery('#btn-options')?.addEventListener('click', () => {
        this.closeMenu();
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      });

      this.shadowQuery('#btn-dock')?.addEventListener('click', () => {
        this.toggleDock();
      });

      // Summary Card Actions
      this.shadowQuery('#summary-close')?.addEventListener('click', () => {
        this.closeSummary();
      });

      this.shadowQuery('#summary-header-refresh')?.addEventListener('click', () => {
        this.requestArticleSummary();
      });

      this.shadowQuery('#summary-footer-refresh')?.addEventListener('click', () => {
        this.requestArticleSummary();
      });

      this.shadowQuery('#summary-copy-btn')?.addEventListener('click', () => {
        this.copySummaryText();
      });

      // Theme toggle button in Bubble Menu header
      this.shadowQuery('#btn-theme-toggle')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const modes = ['auto', 'dark', 'light'];
        const current = currentSettings?.floatingPet?.themeMode || 'auto';
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        
        if (!currentSettings.floatingPet) currentSettings.floatingPet = {};
        currentSettings.floatingPet.themeMode = next;
        
        this.syncTheme();
        
        const modeLabels = {
          auto: '随网页感知',
          dark: '暗色模式 (深色/黑底)',
          light: '亮色模式 (浅色/白底)'
        };
        this.speakStatus(`显示模式：${modeLabels[next]} 喵~`, { busy: false, duration: 2500 });
        
        try {
          await chrome.runtime.sendMessage({
            type: 'FLOATING_PET_POSITION_SET',
            themeMode: next
          });
        } catch {}
      });
      // window / document / chrome.runtime 级监听已移至 bindGlobalEvents，只注册一次。
    }

    // window / chrome.runtime 级监听只注册一次：关闭再开启伴读猫会重建 DOM，
    // 若随 bindEvents 重复注册，快捷键与点击会被触发两次。
    bindGlobalEvents() {
      if (this._globalBound) return;
      this._globalBound = true;
      this._abort?.abort();
      this._abort = new AbortController();
      const signal = this._abort.signal;

      // Drag & Drop
      window.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
      window.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
      window.addEventListener('pointercancel', (e) => this.releaseDrag(e), { signal });
      window.addEventListener('blur', () => this.releaseDrag(), { signal });

      // Click outside to dismiss menu
      window.addEventListener('click', (e) => {
        if (!isMenuOpen) return;
        if (!e.composedPath().includes(this.container)) {
          this.closeMenu();
        }
      }, { signal });

      // Esc 关菜单，Alt+Shift+M 提炼。Alt+Shift+T 交给扩展命令，避免和页面里再启动一次双语。
      // 页面仍监听一次，和命令共用同一次切换；输入框里不触发。
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (isSummaryOpen) {
            this.closeSummary();
            e.stopPropagation();
          } else if (isMenuOpen) {
            this.closeMenu();
            e.stopPropagation();
          }
          return;
        }

        if (e.altKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
          if (petShortcutBlocked(e)) return;
          e.preventDefault();
          if (isSummaryOpen) {
            this.closeSummary();
          } else {
            this.requestArticleSummary();
          }
        }

        if (e.altKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
          if (petShortcutBlocked(e)) return;
          e.preventDefault();
          this.toggleBilingual(true);
        }
      }, { signal });

      // Window resize bounds & theme check
      window.addEventListener('resize', () => {
        this.clampPosition();
        this.syncTheme();
      }, { signal });

      // Keep theme synced with document changes, system switches, or tab reactivation
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.syncTheme(), { signal });
      try {
        this._themeObserver?.disconnect();
        this._themeObserver = new MutationObserver(() => this.syncTheme());
        const filters = ['data-theme', 'class', 'style', 'data-color-mode', 'theme', 'color-scheme'];
        this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: filters });
        if (document.body) {
          this._themeObserver.observe(document.body, { attributes: true, attributeFilter: filters });
        }
      } catch {}
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') this.releaseDrag();
        else this.syncTheme();
      }, { signal });

      window.addEventListener('popstate', () => {
        setTimeout(() => this.syncTheme(), 100);
        setTimeout(() => this.syncTheme(), 500);
      }, { signal });

      try {
        if (this._onRuntimeMessage) chrome.runtime.onMessage.removeListener(this._onRuntimeMessage);
        this._onRuntimeMessage = (msg) => {
          if (msg?.type === 'SS_REFRESH' || msg?.type === 'SS_SETTINGS_UPDATED') {
            const apply = (settings) => { if (settings) this.updateSettings(settings); };
            if (msg.snapshot?.settings) apply(msg.snapshot.settings);
            else chrome.runtime.sendMessage({ type: 'STATE_GET' }).then(res => apply(res?.data?.settings || res?.settings)).catch(() => {});
          }
        };
        chrome.runtime?.onMessage?.addListener(this._onRuntimeMessage);
      } catch {}
    }

    setupWatchdog() {
      this._watchdog?.disconnect();
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = 0;
      this._watchdogRemounts = 0;
      this._watchdogWindow = 0;
      this._watchdogDelay = 1500;
      const remount = () => {
        if (this._disposed || this._mounting || currentSettings?.floatingPet?.enabled === false) return;
        if (!hostEl || hostEl.isConnected) return;
        const root = document.documentElement || document.body;
        if (!root) return;
        this._mounting = true;
        try { root.appendChild(hostEl); }
        finally { this._mounting = false; }
      };
      try {
        this._watchdog = new MutationObserver(() => {
          if (this._disposed || this._mounting || currentSettings?.floatingPet?.enabled === false) return;
          if (!hostEl || hostEl.isConnected) return;
          const now = Date.now();
          if (now - this._watchdogWindow > 2000) {
            this._watchdogWindow = now;
            this._watchdogRemounts = 0;
            this._watchdogDelay = 1500;
          }
          this._watchdogRemounts += 1;
          if (this._watchdogRemounts <= 4) {
            remount();
            return;
          }
          // 页面正在清空 html。先停住，隔一会儿再挂一次，避免互相删除把网页卡死，猫也会回来。
          if (this._watchdogTimer) return;
          const delay = this._watchdogDelay;
          this._watchdogDelay = Math.min(delay * 2, 8000);
          this._watchdogTimer = setTimeout(() => {
            this._watchdogTimer = 0;
            this._watchdogWindow = Date.now();
            this._watchdogRemounts = 0;
            remount();
          }, delay);
        });
        const root = document.documentElement;
        if (root) {
          this._watchdog.observe(root, { childList: true });
        } else {
          window.addEventListener('DOMContentLoaded', () => {
            if (document.documentElement && this._watchdog && !this._disposed) {
              this._watchdog.observe(document.documentElement, { childList: true });
            }
          }, { once: true });
        }
      } catch {}
    }

    syncTheme() {
      if (!hostEl) return;
      const theme = detectPageTheme();
      if (hostEl.getAttribute('data-theme') !== theme) {
        hostEl.setAttribute('data-theme', theme);
      }
      const themeBtn = this.shadowQuery('#btn-theme-toggle');
      if (themeBtn) {
        const mode = currentSettings?.floatingPet?.themeMode || 'auto';
        themeBtn.textContent = mode === 'dark' ? '🌙' : (mode === 'light' ? '☀️' : '🌓');
        themeBtn.title = `显示模式：${mode === 'auto' ? `自动感知 (当前为${theme === 'dark' ? '暗色' : '亮色'})` : (mode === 'dark' ? '已固定暗色' : '已固定亮色')} · 点击切换`;
      }
    }

    shadowQuery(selector) {
      return shadowRoot?.querySelector(selector);
    }

    onPointerDown(e) {
      if (e.button !== 0) return; // Only primary button
      if (e.target?.closest?.('.speech-close-btn')) return;
      e.preventDefault();
      isDragging = true;
      dragMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      initialRight = currentRight;
      initialBottom = currentBottom;
      this.container.classList.add('dragging');
      this._capturedPointerId = e.pointerId;
      this.avatarWrap.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        dragMoved = true;
      }

      if (dragMoved) {
        currentRight = initialRight + dx;
        currentBottom = initialBottom + dy;
        this.clampPosition();
      }
    }

    releaseDrag(e) {
      if (!isDragging && this._capturedPointerId == null) return;
      isDragging = false;
      this.container?.classList.remove('dragging');
      const id = e?.pointerId ?? this._capturedPointerId;
      try {
        if (id != null) this.avatarWrap?.releasePointerCapture(id);
      } catch {}
      this._capturedPointerId = null;
    }

    onPointerUp(e) {
      if (!isDragging) return;
      const moved = dragMoved;
      this.releaseDrag(e);

      if (!moved) {
        if (isDocked) {
          this.undock();
        } else {
          this.triggerClickReaction();
        }
      } else {
        // Magnetic Edge Snapping: if close to left or right screen edge, smoothly dock
        const screenW = window.innerWidth;
        const rightDockThreshold = 48;
        const leftDockThreshold = screenW - 100;

        if (currentRight <= rightDockThreshold) {
          this.dock('right');
        } else if (currentRight >= leftDockThreshold) {
          this.dock('left');
        } else if (isDocked) {
          this.undock();
        }

        this.clampPosition();
        this.savePosition();
        this.syncTheme();
      }
    }

    clampPosition() {
      const maxRight = Math.max(0, window.innerWidth - 64);
      const maxBottom = Math.max(8, window.innerHeight - 76);

      const minRight = isDocked ? 0 : 8;
      currentRight = Math.min(Math.max(minRight, currentRight), maxRight);
      currentBottom = Math.min(Math.max(8, currentBottom), maxBottom);

      const isLeftSide = isDocked ? this.container.classList.contains('is-left') : currentRight > (window.innerWidth / 2);
      if (isLeftSide) {
        this.container.classList.add('is-left');
      } else {
        this.container.classList.remove('is-left');
      }

      if (hostEl) {
        hostEl.style.right = `${currentRight}px`;
        hostEl.style.bottom = `${currentBottom}px`;
      }

      // Adaptive summary window positioning (keeps it anchored near the pet and fully on-screen)
      if (isSummaryOpen && this.summaryWindow) {
        if (isLeftSide) {
          const summaryLeft = Math.max(16, Math.min((window.innerWidth - currentRight) + 76, window.innerWidth - 480));
          this.summaryWindow.style.left = `${summaryLeft}px`;
          this.summaryWindow.style.right = 'auto';
        } else {
          const summaryRight = Math.max(16, Math.min(currentRight + 72, window.innerWidth - 480));
          this.summaryWindow.style.right = `${summaryRight}px`;
          this.summaryWindow.style.left = 'auto';
        }
        const summaryBottom = Math.max(20, Math.min(currentBottom - 20, window.innerHeight - 560));
        this.summaryWindow.style.bottom = `${summaryBottom}px`;
      }
    }

    async savePosition() {
      try {
        const response = await chrome.runtime.sendMessage({type:'FLOATING_PET_POSITION_SET',position:{right:Math.round(currentRight),bottom:Math.round(currentBottom)}});
        if(!response?.ok)throw new Error(response?.error||'伴读猫位置保存失败');
      } catch (err) {
        console.warn('Failed to save pet position', err);
      }
    }

    toggleMenu() {
      if (isMenuOpen) {
        this.closeMenu();
      } else {
        this.openMenu();
      }
    }

    openMenu() {
      this.syncTheme();
      isMenuOpen = true;
      this.container.classList.add('menu-open');
      this.bubbleMenu.classList.add('open');
      this.updateReadingStatus();
    }

    closeMenu() {
      isMenuOpen = false;
      this.container.classList.remove('menu-open');
      this.bubbleMenu.classList.remove('open');
    }

    dock(side = 'right') {
      isDocked = true;
      this.closeMenu();
      this.container?.classList.add('docked');
      if (side === 'left') {
        currentRight = Math.max(0, window.innerWidth - 64);
        this.container?.classList.add('is-left');
      } else {
        currentRight = 0;
        this.container?.classList.remove('is-left');
      }
      if (this.avatarWrap) {
        this.avatarWrap.title = '伴读猫正在贴边守护（悬停探出，点击唤醒）';
      }
      this.clampPosition();
    }

    undock() {
      if (!isDocked) return;
      isDocked = false;
      this.container?.classList.remove('docked');
      if (this.avatarWrap) {
        this.avatarWrap.title = 'RoamCat 随心阅伴读猫（点击展开快捷菜单，双击贴边收起，按住自由拖拽）';
      }
      const isLeftSide = currentRight > (window.innerWidth / 2);
      if (isLeftSide) {
        currentRight = Math.max(24, Math.min(currentRight, window.innerWidth - 88));
      } else {
        currentRight = Math.max(24, currentRight);
      }
      this.clampPosition();
      this.triggerClickReaction();
    }

    toggleDock() {
      if (isDocked) {
        this.undock();
      } else {
        const isLeft = currentRight > (window.innerWidth / 2);
        this.dock(isLeft ? 'left' : 'right');
      }
    }

    setPetState(state) {
      petState = state;
      if (this.avatarWrap) {
        this.avatarWrap.className = `roamcat-avatar-wrap state-${state}`;
        const existingBadge = this.avatarWrap.querySelector('.status-bubble');
        if (existingBadge) existingBadge.remove();
      }
    }

    startIdleActions() {
      clearTimeout(this._idleTimer);
      const scheduleNext = () => {
        if (this._disposed) return;
        const delay = 10000 + Math.random() * 12000; // 10~22s
        this._idleTimer = setTimeout(() => {
          if (!this._disposed && !isDragging && !isMenuOpen && !isSummaryOpen && !isDocked && petState === 'idle' && !this._isSleeping) {
            const actions = ['action-stretch', 'action-tilt', 'action-knead'];
            const chosen = actions[Math.floor(Math.random() * actions.length)];
            this.avatarWrap?.classList.add(chosen);
            setTimeout(() => {
              this.avatarWrap?.classList.remove(chosen);
            }, 2400);
          }
          scheduleNext();
        }, delay);
      };
      scheduleNext();
    }

    startSleepWatchdog() {
      this._lastActivityTime = Date.now();
      this._isSleeping = false;
      const onUserActivity = () => {
        this._lastActivityTime = Date.now();
        if (this._isSleeping) {
          this.wakeUp();
        }
      };

      const signal = this._abort?.signal;
      window.addEventListener('pointermove', onUserActivity, { signal, passive: true });
      window.addEventListener('pointerdown', onUserActivity, { signal, passive: true });
      window.addEventListener('keydown', onUserActivity, { signal, passive: true });
      window.addEventListener('wheel', onUserActivity, { signal, passive: true });
      window.addEventListener('scroll', onUserActivity, { signal, passive: true });

      clearInterval(this._sleepWatchdogInterval);
      this._sleepWatchdogInterval = setInterval(() => {
        if (this._disposed) return;
        const idleFor = Date.now() - this._lastActivityTime;
        if (idleFor > 35000 && !this._isSleeping && petState === 'idle' && !isDragging && !isMenuOpen && !isSummaryOpen && !isDocked) {
          this.fallAsleep();
        }
      }, 5000);
    }

    fallAsleep() {
      this._isSleeping = true;
      this.avatarWrap?.classList.add('state-sleeping');
    }

    wakeUp() {
      if (!this._isSleeping) return;
      this._isSleeping = false;
      this.avatarWrap?.classList.remove('state-sleeping');
      this.avatarWrap?.classList.add('action-wakeup');
      setTimeout(() => {
        this.avatarWrap?.classList.remove('action-wakeup');
      }, 1000);
    }

    triggerClickReaction() {
      if (!this.avatarWrap) return;
      this.avatarWrap.classList.remove('action-jelly');
      void this.avatarWrap.offsetWidth;
      this.avatarWrap.classList.add('action-jelly');
      setTimeout(() => this.avatarWrap?.classList.remove('action-jelly'), 550);

      // Spawn floating particle (heart or paw or sparkle)
      const particles = ['❤️', '🐾', '✨', '💖'];
      const pText = particles[Math.floor(Math.random() * particles.length)];
      const p = document.createElement('div');
      p.className = 'cat-particle';
      p.textContent = pText;
      this.avatarWrap.appendChild(p);
      setTimeout(() => p.remove(), 850);
    }

    setDomain(domain) {
      if (!domain) return;
      detectedDomain = domain;
      const tag = this.shadowQuery('#menu-domain');
      if (tag) {
        tag.textContent = `${domainIcon(domain)} ${domainName(domain)}`;
      }
      const badge = this.shadowQuery('#summary-domain-badge');
      if (badge) {
        badge.textContent = `${domainIcon(domain)} ${domainName(domain)}`;
      }
    }

    async updateReadingStatus() {
      try {
        if (window.__ROAMCAT_CONTENT__?.status) {
          const st = window.__ROAMCAT_CONTENT__.status();
          readingEnabled = Boolean(st?.enabled && !st?.paused);
          if (st?.emergency) {
            this.onEmergencyStatusChange(st.emergency);
          }
        } else {
          const res = await chrome.runtime.sendMessage({ type: 'STATE_GET' });
          readingEnabled = Boolean(res?.data?.settings?.assistanceMode === 'ambient');
        }
      } catch {
        readingEnabled = false;
      }

      const sw = this.shadowQuery('#reading-switch');
      if (sw) {
        sw.classList.toggle('active', readingEnabled);
      }
      const quickReading = this.shadowQuery('#quick-reading');
      if (quickReading) {
        quickReading.classList.toggle('is-active', readingEnabled);
        quickReading.title = readingEnabled ? '阅读辅助进行中 · 点击暂停' : '阅读辅助已暂停 · 点击开启';
      }
    }

    async ensurePageContent() {
      if (window.__ROAMCAT_CONTENT__?.isAlive?.()) return window.__ROAMCAT_CONTENT__;
      const response = await chrome.runtime.sendMessage({ type: 'ENSURE_PAGE_UI' });
      if (!response?.ok) throw new Error(response?.error || '阅读功能未能注入当前网页。');
      if (!window.__ROAMCAT_CONTENT__?.isAlive?.()) throw new Error('阅读功能未能启动，请刷新网页后重试。');
      return window.__ROAMCAT_CONTENT__;
    }

    async toggleReadingMode() {
      try {
        const content = await this.ensurePageContent();
        const next = !readingEnabled;
        await content.setManualEnabled(next);
        readingEnabled = next;
        this.updateReadingStatus();
      } catch (err) {
        console.error('Toggle reading mode error', err);
        this.speakStatus?.('阅读辅助没能启动，请刷新网页后再试 喵~', { busy: false, duration: 2800 });
      }
    }

    async toggleBilingual(fromShortcut = false) {
      this.triggerFlipEffect();
      const speechEl = this.shadowQuery('#cat-speech .speech-text');
      try {
        const content = await this.ensurePageContent();
        if (fromShortcut && content.toggleEmergencyShortcut) {
          const st = await content.toggleEmergencyShortcut();
          const on = Boolean(st?.active || st?.displayed);
          if (speechEl) speechEl.textContent = on ? '旋旋翻开动！正在双语对照 喵~' : '旋旋翻：已复原纯英文阅读 喵~';
          this.setPetState(on ? 'thinking' : 'idle');
          return;
        }
        const currentStatus = content.emergencyStatus?.();
        const isTurningOff = Boolean(currentStatus?.active || currentStatus?.displayed);
        if (isTurningOff) {
          if (speechEl) speechEl.textContent = '旋旋翻：已复原纯英文阅读 喵~';
        } else {
          if (speechEl) speechEl.textContent = '旋旋翻开动！正在双语对照 喵~';
          this.setPetState('thinking');
        }
        await content.toggleEmergencyTranslation();
      } catch (err) {
        console.error('Failed to toggle bilingual mode', err);
        const copy = /尚未连接|请先连接/.test(err?.message || '') ? '辅助服务还没连上。猫和本页辅助还在，去设置里连接后再翻 喵~' : '双语翻译启动失败，请检查服务连接 喵~';
        if (speechEl) speechEl.textContent = copy;
        this.setPetState('error');
      }
    }

    triggerFlipEffect() {
      if (!this.flipBtn) return;
      this.flipBtn.classList.remove('flip-trigger');
      void this.flipBtn.offsetWidth;
      this.flipBtn.classList.add('flip-trigger');
      setTimeout(() => this.flipBtn?.classList.remove('flip-trigger'), 460);
    }

    onEmergencyStatusChange(status) {
      if (!status) return;
      const isActive = Boolean(status.active || status.displayed);
      const isTranslating = status.phase === 'translating';

      // 1. Update Satellite Orbit Flip Button
      if (this.flipBtn) {
        this.flipBtn.classList.toggle('is-active', isActive);
        this.flipBtn.classList.toggle('is-translating', isTranslating);

        const tooltip = this.shadowQuery('#flip-tooltip');
        if (tooltip) {
          if (isTranslating) {
            tooltip.textContent = `旋旋翻 · 翻译中 (${status.completed}/${status.total || '?'}段)`;
          } else if (isActive && status.phase === 'error' && status.error) {
            tooltip.textContent = '旋旋翻 · 辅助服务未连接，附近段落已暂停';
          } else if (isActive) {
            tooltip.textContent = `旋旋翻 · 双语已开启 (${status.completed}段) · 点击复原`;
          } else {
            tooltip.textContent = `旋旋翻 · 一键切换双语对照 (Alt+Shift+T)`;
          }
        }
      }

      // 2. Update Bubble Menu Switch & Subtitle
      const bilingualSwitch = this.shadowQuery('#bilingual-switch');
      if (bilingualSwitch) {
        bilingualSwitch.classList.toggle('active', isActive);
      }

      const bilingualSub = this.shadowQuery('#bilingual-status-sub');
      if (bilingualSub) {
        if (isTranslating) {
          bilingualSub.textContent = `逐段对照中 (${status.completed}/${status.total || '?'} 段)...`;
        } else if (isActive) {
          bilingualSub.textContent = `双语对照就绪 (${status.completed} 段) · 点击复原`;
        } else {
          bilingualSub.textContent = `沉浸式双语对照阅读`;
        }
      }

      // 3. Update Mascot Pet state
      if (isTranslating) {
        if (petState !== 'thinking') this.setPetState('thinking');
      } else if (isActive && petState === 'thinking') {
        this.setPetState('success');
      } else if (!isActive && petState === 'thinking') {
        this.setPetState('idle');
      }
    }

    speakStatus(text, { key = '', busy = false, error = false, duration = 0 } = {}) {
      if (!text) return;
      this.syncTheme();
      const bubble = this.shadowQuery('#cat-speech');
      const textEl = this.shadowQuery('#speech-text');
      if (!bubble || !textEl) return;

      // Ensure friendly cat voice tone
      let formatted = text.trim();
      if (!formatted.endsWith('喵~') && !formatted.endsWith('喵') && formatted.length <= 24) {
        formatted += ' 喵~';
      }

      textEl.textContent = formatted;
      textEl.title = text;

      bubble.classList.remove('is-busy', 'is-error');
      if (busy) bubble.classList.add('is-busy');
      if (error) bubble.classList.add('is-error');
      bubble.classList.add('speaking');
      this.container?.classList.add('has-speech');

      // Update avatar facial/thinking pulse state
      if (busy) {
        this.setPetState('thinking');
      } else if (error) {
        this.setPetState('error');
      }

      clearTimeout(this._speechTimer);
      if (duration && duration > 0) {
        this._speechTimer = setTimeout(() => {
          this.clearStatusSpeech();
        }, duration);
      }
    }

    speak(text, options = {}) {
      return this.speakStatus(text, options);
    }

    clearStatusSpeech(key = '') {
      clearTimeout(this._speechTimer);
      const bubble = this.shadowQuery('#cat-speech');
      const textEl = this.shadowQuery('#speech-text');
      if (!bubble) return;

      this.container?.classList.remove('has-speech');

      // If was busy and finishing successfully, give a brief cheerful feedback
      if (bubble.classList.contains('is-busy')) {
        bubble.classList.remove('is-busy');
        if (textEl) textEl.textContent = '准备好啦 喵~';
        this.setPetState('success');
        this._speechTimer = setTimeout(() => {
          bubble.classList.remove('speaking');
          if (textEl) textEl.textContent = '漫游伴读 喵~';
          if (petState === 'success') this.setPetState('idle');
        }, 1800);
        return;
      }

      bubble.classList.remove('speaking', 'is-busy', 'is-error');
      if (textEl) textEl.textContent = '漫游伴读 喵~';
      if (petState !== 'idle') this.setPetState('idle');
    }

    isMounted() {
      return Boolean(hostEl && hostEl.isConnected && this.container);
    }

    dispose() {
      this._disposed = true;
      this._summaryRequest = null;
      this._summaryPending = false;
      cachedSummary = null;
      cachedSummarySource = null;
      this.releaseDrag();
      clearTimeout(this._idleTimer);
      clearInterval(this._sleepWatchdogInterval);
      try { this._abort?.abort(); } catch {}
      this._abort = null;
      this._watchdog?.disconnect();
      this._watchdog = null;
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = 0;
      this._themeObserver?.disconnect();
      this._themeObserver = null;
      this._globalBound = false;
      this._capturedPointerId = null;
      clearTimeout(this._speechTimer);
      try {
        if (this._onRuntimeMessage) chrome.runtime.onMessage.removeListener(this._onRuntimeMessage);
      } catch {}
      this._onRuntimeMessage = null;
      document.querySelectorAll('#roamcat-pet-host').forEach(el => el.remove());
      hostEl = null;
      shadowRoot = null;
      this.container = null;
      this.edgeTab = null;
      this.flipBtn = null;
      this.avatarWrap = null;
      this.bubbleMenu = null;
      this.summaryWindow = null;
      this._initialized = false;
      isDragging = false;
      isMenuOpen = false;
      isSummaryOpen = false;
      if (globalThis.RoamCatPet === this) globalThis.RoamCatPet = null;
    }

    isEnabled() {
      return currentSettings?.floatingPet?.enabled !== false;
    }

    async extractArticle() {
      if (typeof window.__ROAMCAT_CONTENT__?.getArticleSummarySource === 'function') {
        try {
          const res = await window.__ROAMCAT_CONTENT__.getArticleSummarySource();
          if (res?.text && res.text.trim().length > 50) return res;
        } catch {}
      }

      // Semantic HTML extraction
      const candidateSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.content', '#content'];
      let bestEl = null;
      let maxLen = 0;

      for (const sel of candidateSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const len = (el.innerText || '').trim().length;
          if (len > maxLen) {
            maxLen = len;
            bestEl = el;
          }
        }
      }

      const rawText = bestEl ? bestEl.innerText : document.body.innerText;
      const text = (rawText || '').slice(0, 15000);
      const meta = calculateReadingMeta(text);

      return {
        title: document.title || '',
        url: location.href,
        text,
        wordCount: meta.words,
        domain: detectedDomain || 'general'
      };
    }

    async requestArticleSummary() {
      if (this._disposed) return;
      if (this._summaryPending && this._summaryRequest?.url === location.href) { this.openSummary(); return; }
      const request = { url: location.href };
      this._summaryRequest = request;
      const isCurrent = () => !this._disposed && this._summaryRequest === request;
      this._summaryPending = true;
      cachedSummary = null;
      cachedSummarySource = null;
      this.openSummary();
      this.renderSummaryLoading();
      this.setPetState('thinking');

      try {
        const article = await this.extractArticle();
        if (!isCurrent()) return;
        if (location.href !== request.url || article.url !== request.url) throw new Error('页面已变化，请在当前页面重新提炼摘要。');
        if (!article.text || article.text.trim().length < 40) {
          throw new Error('当前页面没有检测到足够的正文内容供提炼摘要。');
        }

        currentArticleMeta = calculateReadingMeta(article.text);
        if (article.domain) this.setDomain(article.domain);

        const res = await chrome.runtime.sendMessage({
          type: 'PAGE_SUMMARY',
          title: article.title,
          text: article.text,
          url: article.url
        });

        if (!isCurrent()) return;
        if (location.href !== request.url) throw new Error('页面已变化，请在当前页面重新提炼摘要。');
        if (!res?.ok) {
          throw new Error(res?.error || '提取摘要失败，请检查当前模型连接状态与订阅配置。');
        }

        cachedSummary = res.data;
        cachedSummarySource = { title: article.title, url: article.url };
        if (res.data.domain) this.setDomain(res.data.domain);

        this.setPetState('success');
        this.renderSummaryContent(res.data);
      } catch (error) {
        if (!isCurrent()) return;
        this.setPetState('error');
        this.renderSummaryError(error.message || '提炼摘要失败');
      } finally {
        if (isCurrent()) {
          this._summaryPending = false;
          this._summaryRequest = null;
        }
      }
    }

    openSummary() {
      isSummaryOpen = true;
      this.clampPosition();
      this.summaryWindow.classList.add('open');
    }

    closeSummary() {
      isSummaryOpen = false;
      this.summaryWindow.classList.remove('open');
      this.setPetState('idle');
    }

    renderSummaryLoading() {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;
      globalThis.RoamCatContentUI.renderPetSummaryLoading(container);
    }

    renderSummaryError(errorMsg) {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;
      globalThis.RoamCatContentUI.renderPetSummaryError(container, {
        message: errorMsg,
        onRetry: () => this.requestArticleSummary(),
        onOpenSettings: () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }),
      });
    }

    renderSummaryContent(data) {
      const container = this.shadowQuery('#summary-content');
      if (!container) return;

      const words = currentArticleMeta?.words || 1200;
      const minutes = currentArticleMeta?.minutes || Math.max(1, Math.ceil(words / 220));
      const domainKey = data.domain || detectedDomain || 'general';

      globalThis.RoamCatContentUI.renderPetSummaryContent(container, {
        meta: {words, minutes, domainIcon: domainIcon(domainKey), domainName: domainName(domainKey)},
        takeaway: data.takeaway,
        highlights: data.highlights || [],
        keywords: data.keywords || [],
        onKeywordClick(pill, kw) {
          navigator.clipboard.writeText(kw).then(() => {
            const originalText = pill.textContent;
            pill.textContent = `${kw} ✓`;
            pill.classList.add('copied');
            setTimeout(() => {
              pill.textContent = originalText;
              pill.classList.remove('copied');
            }, 1600);
          });
        },
      });
    }

    copySummaryText() {
      if (!cachedSummary || !cachedSummarySource) return;
      const text = [
        `【${cachedSummarySource.title}】RoamCat 内容精华导读`,
        ``,
        `💡 核心结论：`,
        `${cachedSummary.takeaway}`,
        ``,
        `📌 核心要点：`,
        ...(cachedSummary.highlights || []).map((h, i) => `${i + 1}. ${h.replace(/\*\*/g, '')}`),
        ``,
        cachedSummary.keywords?.length ? `🏷️ 关键概念：${cachedSummary.keywords.join('、')}` : '',
        `来源：${cachedSummarySource.url}`
      ].filter(Boolean).join('\n');

      navigator.clipboard.writeText(text).then(() => {
        const btn = this.shadowQuery('#summary-copy-btn');
        const textSpan = this.shadowQuery('#copy-btn-text');
        if (btn && textSpan) {
          btn.classList.add('copied');
          textSpan.textContent = '已复制！';
          setTimeout(() => {
            btn.classList.remove('copied');
            textSpan.textContent = '复制摘要';
          }, 2500);
        }
      }).catch(err => {
        console.error('Failed to copy', err);
      });
    }

    updateSettings(newSettings) {
      currentSettings = newSettings || {};
      if (currentSettings.floatingPet?.enabled === false) {
        if (hostEl) {
          hostEl.remove();
          hostEl = null;
          shadowRoot = null;
        }
      } else {
        if (!hostEl && this._initialized) {
          this.createDOM();
          this.bindEvents();
          this.startIdleActions();
          this.startSleepWatchdog();
          this.updateReadingStatus();
        }
        if (hostEl) hostEl.style.display = '';
        if (currentSettings.floatingPet?.position) {
          currentRight = currentSettings.floatingPet.position.right ?? currentRight;
          currentBottom = currentSettings.floatingPet.position.bottom ?? currentBottom;
          this.clampPosition();
        }
        this.syncTheme();
      }
    }
  }

  // Mount global instance
  const widget = new RoamCatPetWidget();
  widget.detectPageTheme = detectPageTheme;
  widget.shadowQuery = (selector) => shadowRoot?.querySelector(selector);
  widget.getShadowRoot = () => shadowRoot;
  globalThis.RoamCatPet = widget;
  if (hostEl) {
    hostEl.pet = widget;
    hostEl.__pet = widget;
  }
})();
