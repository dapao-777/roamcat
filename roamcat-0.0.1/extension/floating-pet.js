/**
 * @file extension/floating-pet.js
 * 文件职责：伴读猫挂件（classic script，禁 ESM 语法）——每页一只的 Shadow DOM 悬浮入口，承载 SVG 形象、
 *   拖拽贴边、菜单、文章摘要、状态气泡与左侧快捷按钮行，以及全局快捷键分发。
 * 主要内容：顶层主框架单例挂载与 MutationObserver 看护、bindGlobalEvents 一次注册、
 *   petShortcutBlocked 输入框抢键防护、位置持久化（FLOATING_PET_POSITION_SET）、翻译进度气泡。
 *   辅助函数/样式/SVG/语录气泡/摘要窗拆在 floating-pet-{helpers,styles,svg,quote-bubble,summary}.js，
 *   经 globalThis.RoamCatPetParts 取用，后两者的原型方法经 shared 读写本闭包状态。
 * 模块边界：window 级监听只注册一次；快捷键在可编辑区不触发；样式经 Shadow DOM 隔离；
 *   拆出的文件须与本文件同批注入且排在本文件之前（background.js PET_FILES）；
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

  const T = (k, v) => globalThis.RoamCatI18n?.t?.(k, v) ?? k;
  let hostEl = null;
  let shadowRoot = null;
  let currentSettings = null;
  let isDragging = false;
  let dragMoved = false;
  let startX = 0, startY = 0;
  let initialRight = 24, initialBottom = 84;
  let currentRight = 24, currentBottom = 84;
  // 实际显示的 right：落在站点固定侧栏（Twitch 聊天栏）里时挪到侧栏左边；用户在这一页拖过猫就按用户放的位置。
  let shownRight = 24, keepOutOff = false;
  let isDockOpen = false;
  let isSummaryOpen = false;
  let petScale = 1;
  const PET_SCALE_STEPS = [0.8, 1, 1.2, 1.4, 1.6];
  let isDocked = false;
  let petState = 'idle'; // 'idle' | 'thinking' | 'success' | 'error'
  let cachedSummary = null;
  let cachedSummarySource = null;
  let currentArticleMeta = null;
  let readingEnabled = false;
  let detectedDomain = 'general';

  // 纯函数、样式与 SVG 拆在 floating-pet-*.js，与本文件同批注入且先于本文件执行。
  const {domainName, petShortcutBlocked, parseRgba, getLuminance, getElementBg, hasKeepOut, keepOutRight, getPetStyles, renderPeekingCatSvg, renderCatSvg} = globalThis.RoamCatPetParts;

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
          const sampleX = Math.max(10, Math.min(window.innerWidth - (shownRight || 24) - 20, window.innerWidth - 10));
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

  class RoamCatPetWidget {
    constructor() {
      // 先同步挂上猫，再异步读设置。STATE_GET 若等后台/连接器，页面上不能先空着。
      this.createDOM();
      this.bindGlobalEvents();
      this.bindEvents();
      this.startIdleActions();
      this.startPageGlance();
      this.startSleepWatchdog();
      this.startQuoteTicker();
      this._initialized = true;
      if (bootId === globalThis.__ROAMCAT_PET_GENERATION__) globalThis.__ROAMCAT_PET_BOOTING__ = false;
      this.init();
    }

    async init() {
      if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
      try {
        const response = await chrome.runtime.sendMessage({type:'STATE_GET'});
        if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
        if(!response?.ok)throw new Error(response?.error||T('fp.settingsFail'));
        currentSettings = response.data.settings || {};
      } catch {
        if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__ || this._disposed) return;
        currentSettings = {};
      }

      if (currentSettings?.floatingPet?.enabled === false) {
        this.stopQuoteTicker();
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
      this.setScale(currentSettings?.floatingPet?.scale ?? 1, { persist: false });
      this.clampPosition();
      this.updateReadingStatus();
      // 设置就绪后按 quotes.enabled 启停语录定时器（构造时按默认开启先跑起来了）。
      this.syncQuoteTicker();
    }

    createDOM() {
      document.querySelectorAll('#roamcat-pet-host').forEach(el => el.remove());
      hostEl = null;
      shadowRoot = null;

      hostEl = document.createElement('div');
      hostEl.id = 'roamcat-pet-host';
      hostEl.setAttribute('data-theme', detectPageTheme());
      hostEl.style.cssText = `position:fixed!important;right:${currentRight}px!important;bottom:${currentBottom}px!important;width:${Math.round(64 * petScale)}px!important;height:${Math.round(68 * petScale)}px!important;border:0!important;padding:0!important;margin:0!important;background:transparent!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;overflow:visible!important;color-scheme:light dark!important;`;
      hostEl.style.setProperty('--pet-scale', petScale);
      hostEl.pet = this;
      hostEl.__pet = this;
      shadowRoot = hostEl.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = getPetStyles();
      shadowRoot.appendChild(style);

      // DOM 骨架由 content-ui 渲染层构建（lit-html 模板）；id/类名与原实现一致，
      // 后续状态更新继续经 shadowQuery 命令式驱动。
      const {container, edgeTab, flipBtn, quickDock, avatarWrap, zoomControls, summaryWindow} =
        globalThis.RoamCatContentUI.petWidget(shadowRoot, {
          domainKey: detectedDomain,
          domainName: domainName(detectedDomain),
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
      this.zoomControls = zoomControls;
      this.summaryWindow = summaryWindow;
      this.applyScaleVisuals();
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
        let hoverText = T('fp.hover.flip.idle');
        if (isTranslating) hoverText = T('fp.hover.flip.busy');
        else if (isActive) hoverText = T('fp.hover.flip.on');
        this.stashSpeechForHover(hoverText);
        if (speechEl) speechEl.textContent = hoverText;
        bubble?.classList.remove('quote');
        bubble?.classList.add('speaking');
        this.container?.classList.add('has-speech');
        this.fitSpeechBubble();
      });

      this.flipBtn?.addEventListener('pointerleave', () => this.restoreSpeechAfterHover());

      // 左侧快捷按钮行：悬停播报 + 点击执行（与旋旋翻一致的反馈模式）。
      // closeDock 标记的动作执行后收起快捷坞；阅读辅助/双语开关保持展开。
      const quickActions = [
        {id: '#quick-reading', hover: T('fp.hover.read'), run: () => this.toggleReadingMode()},
        {id: '#quick-summary', hover: T('fp.hover.sum'), closeDock: true, run: () => this.requestArticleSummary()},
        {id: '#quick-options', hover: T('fp.hover.opt'), closeDock: true, run: () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' })},
      ];
      for (const action of quickActions) {
        const button = this.shadowQuery(action.id);
        if (!button) continue;
        button.draggable = false;
        button.addEventListener('dragstart', (e) => e.preventDefault());
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          if (action.closeDock) this.closeQuickDock();
          action.run();
        });
        button.addEventListener('pointerenter', () => {
          this.stashSpeechForHover(action.hover);
          const bubble = this.shadowQuery('#cat-speech');
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          if (speechEl) speechEl.textContent = action.hover;
          bubble?.classList.remove('quote');
          bubble?.classList.add('speaking');
          this.container?.classList.add('has-speech');
          this.fitSpeechBubble();
        });
        button.addEventListener('pointerleave', () => this.restoreSpeechAfterHover());
      }

      // 缩放控制：步进 80%–160%，持久化到设置
      this.shadowQuery('#zoom-out')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomOut();
      });
      this.shadowQuery('#zoom-in')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomIn();
      });

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
            speechEl.textContent = T('fp.speekPeek');
          }
        }
      });

      this.avatarWrap.addEventListener('pointerleave', () => {
        if (isDocked) {
          const speechEl = this.shadowQuery('#cat-speech .speech-text');
          const bubble = this.shadowQuery('#cat-speech');
          if (speechEl && !bubble?.classList.contains('speaking')) {
            speechEl.textContent = T('pet.speechDefault');
          }
        }
      });

      // Double-click on cat avatar toggles docked state
      this.avatarWrap.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.toggleDock();
      });

      // Single click on cat avatar toggles the quick dock (or undocks when docked)
      this.avatarWrap.addEventListener('click', (e) => {
        if (dragMoved) return;
        if (isDocked) {
          e.stopPropagation();
          this.undock();
          return;
        }
        e.stopPropagation();
        this.triggerClickReaction();
        this.toggleQuickDock();
      });

      // 键盘可达：Enter / Space 同样开合快捷坞；贴边态下与单击一致，直接唤醒
      this.avatarWrap.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        if (isDocked) {
          this.undock();
          return;
        }
        this.triggerClickReaction();
        this.toggleQuickDock();
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

      // Gaze Tracking: 猫眼跟随光标（rAF 节流；减弱动效 / 睡眠 / 页面隐藏时静止）
      const gazeMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let gazeRaf = 0, gazeX = 0, gazeY = 0;
      const applyGaze = () => {
        gazeRaf = 0;
        if (this._disposed || this._isSleeping || !this.container) return;
        if (document.visibilityState !== 'visible' || gazeMotion.matches) return;
        const rect = this.avatarWrap?.getBoundingClientRect();
        if (!rect || !rect.width) return;
        const nx = Math.max(-1, Math.min(1, (gazeX - (rect.left + rect.width / 2)) / 240));
        const ny = Math.max(-1, Math.min(1, (gazeY - (rect.top + rect.height / 2)) / 200));
        this._gaze = {x: nx.toFixed(3), y: ny.toFixed(3)};
        this.container.style.setProperty('--eye-x', this._gaze.x);
        this.container.style.setProperty('--eye-y', this._gaze.y);
      };
      window.addEventListener('pointermove', (e) => {
        if (gazeMotion.matches) return;
        gazeX = e.clientX;
        gazeY = e.clientY;
        if (!gazeRaf) gazeRaf = requestAnimationFrame(applyGaze);
      }, { signal, passive: true });

      // Click outside to dismiss the quick dock
      window.addEventListener('click', (e) => {
        if (!isDockOpen) return;
        if (!e.composedPath().includes(this.container)) {
          this.closeQuickDock();
        }
      }, { signal });

      // Esc 关菜单，Alt+Shift+M 提炼。Alt+Shift+T 交给扩展命令，避免和页面里再启动一次双语。
      // 页面仍监听一次，和命令共用同一次切换；输入框里不触发。
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (isSummaryOpen) {
            this.closeSummary();
            e.stopPropagation();
          } else if (isDockOpen) {
            this.closeQuickDock();
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
        this.fitSpeechBubble();
      }, { signal });
      // 有固定侧栏的站点（Twitch）：侧栏是单页应用晚些才渲染、也会收起展开，定时重算一次避让位置。
      clearInterval(this._keepOutTimer);
      if (hasKeepOut()) this._keepOutTimer = setInterval(() => { if (!isDragging && hostEl) this.clampPosition(); }, 1500);

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
      // 从看到的位置开始拖（可能是避让后挪过的位置），不跳回保存的位置。
      initialRight = shownRight;
      initialBottom = currentBottom;
      this.container.classList.add('dragging');
      this.avatarWrap.classList.add('is-pressed');
      this._capturedPointerId = e.pointerId;
      this.avatarWrap.setPointerCapture(e.pointerId);
    }

    onPointerMove(e) {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        if (!dragMoved) this.closeQuickDock();
        dragMoved = true;
        keepOutOff = true;
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
      this.avatarWrap?.classList.remove('is-pressed');
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
      const petW = Math.round(64 * petScale);
      const petH = Math.round(68 * petScale);
      const maxRight = Math.max(0, window.innerWidth - petW);
      const maxBottom = Math.max(8, window.innerHeight - petH - 8);

      const minRight = isDocked ? 0 : 8;
      currentRight = Math.min(Math.max(minRight, currentRight), maxRight);
      currentBottom = Math.min(Math.max(8, currentBottom), maxBottom);

      shownRight = isDocked || isDragging || keepOutOff ? currentRight : keepOutRight(currentRight, currentBottom, petW, petH);
      const isLeftSide = isDocked ? this.container.classList.contains('is-left') : shownRight > (window.innerWidth / 2);
      if (isLeftSide) {
        this.container.classList.add('is-left');
      } else {
        this.container.classList.remove('is-left');
      }

      if (hostEl) {
        hostEl.style.right = `${shownRight}px`;
        hostEl.style.bottom = `${currentBottom}px`;
      }

      // Adaptive summary window positioning (keeps it anchored near the pet and fully on-screen)
      if (isSummaryOpen && this.summaryWindow) {
        const sideGap = petW + 12;
        if (isLeftSide) {
          const summaryLeft = Math.max(16, Math.min((window.innerWidth - shownRight) + sideGap, window.innerWidth - 480));
          this.summaryWindow.style.left = `${summaryLeft}px`;
          this.summaryWindow.style.right = 'auto';
        } else {
          const summaryRight = Math.max(16, Math.min(shownRight + sideGap, window.innerWidth - 480));
          this.summaryWindow.style.right = `${summaryRight}px`;
          this.summaryWindow.style.left = 'auto';
        }
        const summaryBottom = Math.max(20, Math.min(currentBottom - 20, window.innerHeight - 560));
        this.summaryWindow.style.bottom = `${summaryBottom}px`;
      }
    }

    async savePosition() {
      try {
        const response = await chrome.runtime.sendMessage({type:'FLOATING_PET_POSITION_SET',position:{right:Math.round(currentRight),bottom:Math.round(currentBottom)},scale:petScale});
        if(!response?.ok)throw new Error(response?.error||T('fp.posFail'));
      } catch (err) {
        console.warn('Failed to save pet position', err);
      }
    }

    toggleQuickDock() {
      if (isDockOpen) {
        this.closeQuickDock();
      } else {
        this.openQuickDock();
      }
    }

    openQuickDock() {
      if (isDocked || !this.container) return;
      isDockOpen = true;
      this.container.classList.add('dock-open');
      this.zoomControls?.removeAttribute('inert');
      // 卫星按钮与猫身上的提炼/设置随坞展开回到 Tab 序。
      for (const btn of this.quickDock?.children || []) btn.removeAttribute('tabindex');
      for (const btn of this.shadowQuery('#roamcat-cat-menu')?.querySelectorAll('button') || []) btn.removeAttribute('tabindex');
      this.avatarWrap?.setAttribute('aria-expanded', 'true');
      this.updateReadingStatus();
      this.fitSpeechBubble();
    }

    closeQuickDock() {
      if (!isDockOpen) return;
      isDockOpen = false;
      this.container?.classList.remove('dock-open');
      this.zoomControls?.setAttribute('inert', '');
      for (const btn of this.quickDock?.children || []) btn.setAttribute('tabindex', '-1');
      for (const btn of this.shadowQuery('#roamcat-cat-menu')?.querySelectorAll('button') || []) btn.setAttribute('tabindex', '-1');
      this.avatarWrap?.setAttribute('aria-expanded', 'false');
      this.fitSpeechBubble();
    }

    // 缩放胶囊居中在猫上方且比猫宽：猫贴着视口左右边时水平收进 8px 边距，避免被裁掉。
    // 用 offsetWidth 而非 getBoundingClientRect：展开动画的 scale 会让后者偏小。
    fitZoomControls() {
      const zoom = this.zoomControls, anchor = zoom?.offsetParent;
      if (!zoom || !anchor) return;
      const box = anchor.getBoundingClientRect(), half = zoom.offsetWidth / 2, center = box.left + box.width / 2, margin = 8;
      let shift = 0;
      if (center - half < margin) shift = margin - (center - half);
      else if (center + half > window.innerWidth - margin) shift = window.innerWidth - margin - (center + half);
      zoom.style.setProperty('--zoom-shift-x', `${Math.round(shift)}px`);
    }

    // 语音气泡视口自适配：水平收进 8px 边距、尾巴始终指向猫、贴顶翻转到猫下方。
    fitSpeechBubble() {
      this.fitZoomControls();
      const bubble = this.shadowQuery('#cat-speech');
      if (!bubble || !hostEl) return;
      const hostRect = hostEl.getBoundingClientRect();
      bubble.style.setProperty('--bubble-shift-x', '0px');
      bubble.classList.remove('below');
      const rect = bubble.getBoundingClientRect();
      const margin = 8;
      let shift = 0;
      if (rect.left < margin) shift = margin - rect.left;
      else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
      if (shift !== 0) bubble.style.setProperty('--bubble-shift-x', `${Math.round(shift)}px`);
      // 贴顶（含 dock-open 抬高后的位置）→ 翻到猫下方
      if (rect.top < margin) {
        bubble.classList.add('below');
      }
      // 尾巴对齐猫身水平中心，钳在气泡内 12px 缓冲区
      const catCenterX = hostRect.left + hostRect.width / 2;
      const tailX = Math.max(12, Math.min(rect.width - 12, catCenterX - rect.left - shift));
      bubble.style.setProperty('--bubble-tail-x', `${Math.round(tailX)}px`);
    }

    // 伴读猫缩放：仅缩放猫的视觉（漫游/探头/粒子/Zzz/跑车），UI 控件不缩放。
    setScale(scale, { persist = true } = {}) {
      const next = PET_SCALE_STEPS.includes(scale) ? scale : 1;
      petScale = next;
      if (currentSettings?.floatingPet) currentSettings.floatingPet.scale = next;
      this.applyScaleVisuals();
      this.clampPosition();
      this.fitSpeechBubble();
      if (persist) this.savePosition();
    }

    applyScaleVisuals() {
      // :host 规则以 var(--pet-scale) 计算宽高；只需更新自定义属性即可整体缩放。
      if (hostEl) {
        hostEl.style.setProperty('--pet-scale', petScale);
      }
      this.container?.style.setProperty('--pet-scale', petScale);
      const label = this.shadowQuery('#zoom-label');
      if (label) label.textContent = `${Math.round(petScale * 100)}%`;
      const outBtn = this.shadowQuery('#zoom-out');
      const inBtn = this.shadowQuery('#zoom-in');
      if (outBtn) outBtn.disabled = petScale <= PET_SCALE_STEPS[0];
      if (inBtn) inBtn.disabled = petScale >= PET_SCALE_STEPS[PET_SCALE_STEPS.length - 1];
    }

    zoomIn() {
      const idx = PET_SCALE_STEPS.indexOf(petScale);
      if (idx >= 0 && idx < PET_SCALE_STEPS.length - 1) this.setScale(PET_SCALE_STEPS[idx + 1]);
    }

    zoomOut() {
      const idx = PET_SCALE_STEPS.indexOf(petScale);
      if (idx > 0) this.setScale(PET_SCALE_STEPS[idx - 1]);
    }

    // 跑车入场彩蛋（约 2.6s）：猫身淡出 → 跑车从页面内侧驶入（速度线+转轮）
    // → 刹车压扁+小弹跳+尾气 → 停顿 → 猫果冻弹回、车驶离并移除。
    async driveIn() {
      if (this._disposed || this._driving || !this.container || isDocked) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this._driving = true;
      try {
        const car = document.createElement('div');
        car.className = 'pet-car car-moving';
        car.innerHTML = `
          <svg viewBox="0 0 100 44" aria-hidden="true">
            <g class="speed-lines" stroke="var(--pet-primary)" stroke-width="2" stroke-linecap="round">
              <line class="speed-line" x1="86" y1="14" x2="98" y2="14"/>
              <line class="speed-line" x1="88" y1="22" x2="99" y2="22"/>
              <line class="speed-line" x1="86" y1="30" x2="97" y2="30"/>
            </g>
            <ellipse class="exhaust-puff" cx="94" cy="36" rx="4" ry="3" fill="var(--pet-muted)"/>
            <path d="M6 34 C6 26 14 22 26 20 L34 12 C36 10 40 9 46 9 L60 9 C68 9 74 12 80 18 L88 24 C92 26 94 29 94 33 L94 36 L6 36 Z"
                  fill="var(--pet-primary)"/>
            <path d="M36 13 L44 11 L58 11 C64 11 69 13 74 17 L38 19 Z"
                  fill="var(--pet-surface-elevated)"/>
            <g class="car-driver">
              <circle cx="50" cy="14" r="4.2" fill="var(--pet-cat-color)"/>
              <path d="M46.5 11 L47.5 7.5 L50 10 Z" fill="var(--pet-cat-color)"/>
              <path d="M53.5 11 L52.5 7.5 L50 10 Z" fill="var(--pet-cat-color)"/>
            </g>
            <g class="car-wheel">
              <circle cx="24" cy="36" r="6" fill="#1f2937"/>
              <circle cx="24" cy="36" r="2.2" fill="#e5e7eb"/>
            </g>
            <g class="car-wheel">
              <circle cx="76" cy="36" r="6" fill="#1f2937"/>
              <circle cx="76" cy="36" r="2.2" fill="#e5e7eb"/>
            </g>
          </svg>`;
        this.container.appendChild(car);
        this.container.classList.add('pet-away');
        await new Promise(r => setTimeout(r, 200));
        if (this._disposed) { car.remove(); return; }

        const isLeft = this.container.classList.contains('is-left');
        // is-left 时 svg 已水平镜像，驶入方向随之反转
        const enterFrom = isLeft ? 140 : -140;
        await car.animate(
          [{ translate: `${enterFrom}% 0`, opacity: 0 }, { translate: '0 0', opacity: 1 }],
          { duration: 550, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
        ).finished;
        if (this._disposed) { car.remove(); return; }

        car.classList.remove('car-moving');
        await car.animate(
          [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.92)' }, { transform: 'scaleY(1.03) translateY(-2px)' }, { transform: 'scaleY(1)' }],
          { duration: 260, easing: 'ease-out' }
        ).finished;
        car.classList.add('car-puff');
        await new Promise(r => setTimeout(r, 400));
        if (this._disposed) { car.remove(); return; }

        this.container.classList.remove('pet-away');
        this.avatarWrap?.classList.add('action-jelly');
        setTimeout(() => this.avatarWrap?.classList.remove('action-jelly'), 550);
        await car.animate(
          [{ translate: '0 0', opacity: 1 }, { translate: `${-enterFrom}% 0`, opacity: 0 }],
          { duration: 600, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }
        ).finished;
        car.remove();
      } finally {
        this._driving = false;
      }
    }

    dock(side = 'right') {
      isDocked = true;
      this.closeQuickDock();
      this.container?.classList.add('docked');
      if (side === 'left') {
        currentRight = Math.max(0, window.innerWidth - Math.round(64 * petScale));
        this.container?.classList.add('is-left');
      } else {
        currentRight = 0;
        this.container?.classList.remove('is-left');
      }
      if (this.avatarWrap) {
        this.avatarWrap.title = T('fp.avatarDocked');
      }
      this.clampPosition();
      this.fitSpeechBubble();
    }

    undock() {
      if (!isDocked) return;
      isDocked = false;
      this.container?.classList.remove('docked');
      if (this.avatarWrap) {
        this.avatarWrap.title = T('pet.avatarTitle');
      }
      // 点击唤醒时指针仍停在猫上，pointerleave 已不再按贴边态复位——这里收回"探头（点击唤醒）"文案
      const speechEl = this.shadowQuery('#cat-speech .speech-text');
      if (speechEl && !this.shadowQuery('#cat-speech')?.classList.contains('speaking')) {
        speechEl.textContent = T('pet.speechDefault');
      }
      const isLeftSide = currentRight > (window.innerWidth / 2);
      if (isLeftSide) {
        currentRight = Math.max(24, Math.min(currentRight, window.innerWidth - Math.round(64 * petScale) - 24));
      } else {
        currentRight = Math.max(24, currentRight);
      }
      this.clampPosition();
      this.fitSpeechBubble();
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
      clearTimeout(this._driveTimer);
      const scheduleNext = () => {
        if (this._disposed) return;
        const delay = 10000 + Math.random() * 12000; // 10~22s
        this._idleTimer = setTimeout(() => {
          if (!this._disposed && !isDragging && !isDockOpen && !isSummaryOpen && !isDocked && petState === 'idle' && !this._isSleeping) {
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

      // 跑车彩蛋：独立调度，冷却随机 8–15 分钟，且加载满 3 分钟后才可能首次触发；
      // prefers-reduced-motion 下整体跳过（driveIn 内部同样有守卫）。
      this._petBornAt = this._petBornAt || Date.now();
      const scheduleDrive = () => {
        if (this._disposed) return;
        const cooldown = 480000 + Math.random() * 420000;
        this._driveTimer = setTimeout(() => {
          const eligible = !this._disposed && !isDragging && !isDockOpen && !isSummaryOpen && !isDocked
            && petState === 'idle' && !this._isSleeping && !this._driving
            && document.visibilityState === 'visible'
            && Date.now() - this._petBornAt >= 180000
            && !matchMedia('(prefers-reduced-motion: reduce)').matches
            && !this.shadowQuery('#cat-speech')?.classList.contains('speaking');
          if (eligible) this.driveIn();
          scheduleDrive();
        }, cooldown);
      };
      scheduleDrive();
    }

    // 空闲时瞳孔朝页面内侧看一眼再回到光标方向。贴右缘向左，贴左缘向右。
    startPageGlance() {
      clearTimeout(this._glanceTimer);
      clearTimeout(this._glanceReset);
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const schedule = () => {
        if (this._disposed) return;
        this._glanceTimer = setTimeout(() => {
          const quiet = !this._disposed && !isDragging && !this._isSleeping && !motion.matches
            && document.visibilityState === 'visible' && petState === 'idle' && this.container;
          if (quiet) {
            const lookLeft = !this.container.classList.contains('is-left');
            this.container.style.setProperty('--eye-x', lookLeft ? '-0.9' : '0.9');
            this.container.style.setProperty('--eye-y', '0.4');
            this._glanceReset = setTimeout(() => {
              if (!this.container || this._disposed) return;
              const gaze = this._gaze || {x: '0', y: '0'};
              this.container.style.setProperty('--eye-x', gaze.x);
              this.container.style.setProperty('--eye-y', gaze.y);
            }, 720);
          }
          schedule();
        }, 7000 + Math.random() * 6000);
      };
      schedule();
    }

    startSleepWatchdog() {
      this._lastActivityTime = Date.now();
      this._isSleeping = false;
      // 监听只绑一次：禁用→重开会再次走到这里，signal 仍是同一个，
      // 重复 addEventListener 会按次数叠加回调。
      if (!this._sleepBound) {
        this._sleepBound = true;
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
      }

      clearInterval(this._sleepWatchdogInterval);
      this._sleepWatchdogInterval = setInterval(() => {
        if (this._disposed) return;
        const idleFor = Date.now() - this._lastActivityTime;
        if (idleFor > 35000 && !this._isSleeping && petState === 'idle' && !isDragging && !isDockOpen && !isSummaryOpen && !isDocked) {
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
      const particles = ['heart', 'paw', 'sparkles', 'heart'];
      const kind = particles[Math.floor(Math.random() * particles.length)];
      const p = document.createElement('div');
      p.className = 'cat-particle';
      p.dataset.kind = kind;
      globalThis.RoamCatContentUI.renderPetParticle(p, kind);
      this.avatarWrap.appendChild(p);
      setTimeout(() => p.remove(), 850);
    }

    setDomain(domain) {
      if (!domain) return;
      detectedDomain = domain;
      const badge = this.shadowQuery('#summary-domain-badge');
      if (badge) {
        globalThis.RoamCatContentUI.renderPetDomainTag(badge, {domainKey: domain, domainName: domainName(domain)});
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
        quickReading.setAttribute('aria-pressed', String(readingEnabled));
        quickReading.title = readingEnabled ? T('fp.readingOn') : T('fp.readingOff');
      }
    }

    async ensurePageContent() {
      if (window.__ROAMCAT_CONTENT__?.isAlive?.()) return window.__ROAMCAT_CONTENT__;
      const response = await chrome.runtime.sendMessage({ type: 'ENSURE_PAGE_UI' });
      if (!response?.ok) throw new Error(response?.error || T('fp.injectFail'));
      if (!window.__ROAMCAT_CONTENT__?.isAlive?.()) throw new Error(T('fp.startFail'));
      return window.__ROAMCAT_CONTENT__;
    }

    async toggleReadingMode() {
      const quickReading = this.shadowQuery('#quick-reading');
      // rebuild 期间给 pending 态并屏蔽连点，避免按钮态长时间滞后且无反馈
      quickReading?.classList.add('is-pending');
      try {
        const content = await this.ensurePageContent();
        const next = !readingEnabled;
        await content.setManualEnabled(next);
        readingEnabled = next;
        this.updateReadingStatus();
      } catch (err) {
        console.error('Toggle reading mode error', err);
        this.speakStatus?.(T('pet.assistFailed'), { busy: false, duration: 2800 });
      } finally {
        quickReading?.classList.remove('is-pending');
      }
    }

    async toggleBilingual(fromShortcut = false) {
      const speechEl = this.shadowQuery('#cat-speech .speech-text');
      try {
        const content = await this.ensurePageContent();
        if (fromShortcut && content.toggleEmergencyShortcut) {
          const st = await content.toggleEmergencyShortcut();
          const on = Boolean(st?.active || st?.displayed);
          if (speechEl) speechEl.textContent = on ? T('fp.flipOn') : T('fp.flipOff');
          this.setPetState(on ? 'thinking' : 'idle');
          return;
        }
        const currentStatus = content.emergencyStatus?.();
        const isTurningOff = Boolean(currentStatus?.active || currentStatus?.displayed);
        if (isTurningOff) {
          if (speechEl) speechEl.textContent = T('fp.flipOff');
        } else {
          if (speechEl) speechEl.textContent = T('fp.flipOn');
          this.setPetState('thinking');
        }
        await content.toggleEmergencyTranslation();
      } catch (err) {
        console.error('Failed to toggle bilingual mode', err);
        const copy = err?.code === 'NOT_READY' || /尚未连接|请先连接|connect a service|not connected/i.test(err?.message || '') ? T('fp.flipNoSvc') : T('fp.flipFail');
        if (speechEl) speechEl.textContent = copy;
        this.setPetState('error');
      }
    }

    onEmergencyStatusChange(status) {
      if (!status) return;
      const isActive = Boolean(status.active || status.displayed);
      const isTranslating = status.phase === 'translating';

      // 1. Update Satellite Orbit Flip Button
      if (this.flipBtn) {
        this.flipBtn.classList.toggle('is-active', isActive);
        this.flipBtn.classList.toggle('is-translating', isTranslating);
        this.flipBtn.setAttribute('aria-pressed', String(isActive));

        const tooltip = this.shadowQuery('#flip-tooltip');
        if (tooltip) {
          if (isTranslating) {
            tooltip.textContent = T('fp.tipBusy',{done:status.completed,total:status.total || '?'});
          } else if (isActive && status.phase === 'error' && status.error) {
            tooltip.textContent = T('fp.tipNoSvc');
          } else if (isActive) {
            tooltip.textContent = T('fp.tipOn',{done:status.completed});
          } else {
            tooltip.textContent = T('fp.tipIdle');
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
          bilingualSub.textContent = T('fp.subBusy',{done:status.completed,total:status.total || '?'});
        } else if (isActive) {
          bilingualSub.textContent = T('fp.subReady',{done:status.completed});
        } else {
          bilingualSub.textContent = T('fp.subIdle');
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
      const meow = T('fp.meowSuffix');
      if (meow && !formatted.endsWith(meow.trim()) && formatted.length <= 24) {
        formatted += meow;
      }

      textEl.textContent = formatted;
      textEl.title = text;

      bubble.classList.remove('is-busy', 'is-error', 'quote');
      if (busy) bubble.classList.add('is-busy');
      if (error) bubble.classList.add('is-error');
      bubble.classList.add('speaking');
      this.container?.classList.add('has-speech');
      this.fitSpeechBubble();

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

    // 悬停播报存档/恢复：进入前记下当前气泡，离开时若气泡仍停在本次悬停文案
    // 就还原，避免路过快捷按钮把正在显示的状态/忙碌气泡清掉。
    stashSpeechForHover(hoverText) {
      if (this._hoverStash) { this._hoverStash.hoverText = hoverText; return; }
      const bubble = this.shadowQuery('#cat-speech');
      if (!bubble) return;
      const speechEl = this.shadowQuery('#cat-speech .speech-text');
      this._hoverStash = {
        cls: bubble.className,
        text: speechEl?.textContent || '',
        hasSpeech: this.container?.classList.contains('has-speech') || false,
        hoverText,
      };
    }

    restoreSpeechAfterHover() {
      const stash = this._hoverStash;
      this._hoverStash = null;
      const bubble = this.shadowQuery('#cat-speech');
      const speechEl = this.shadowQuery('#cat-speech .speech-text');
      if (!bubble) return;
      // 悬停期间有别处播报接管气泡，不能覆盖回去
      if (stash?.hoverText && speechEl && speechEl.textContent !== stash.hoverText) return;
      if (stash && stash.cls.includes('speaking')) {
        bubble.className = stash.cls;
        if (speechEl) speechEl.textContent = stash.text;
        this.container?.classList.toggle('has-speech', stash.hasSpeech);
      } else {
        bubble.classList.remove('speaking', 'quote');
        this.container?.classList.remove('has-speech');
        if (speechEl) speechEl.textContent = T('pet.speechDefault');
      }
      this.fitSpeechBubble();
    }

    clearStatusSpeech(key = '') {
      clearTimeout(this._speechTimer);
      const bubble = this.shadowQuery('#cat-speech');
      const textEl = this.shadowQuery('#speech-text');
      if (!bubble) return;

      this.container?.classList.remove('has-speech');

      // If was busy and finishing successfully, give a brief cheerful feedback
      if (bubble.classList.contains('is-busy')) {
        bubble.classList.remove('is-busy', 'quote');
        if (textEl) textEl.textContent = T('fp.ready');
        this.setPetState('success');
        this._speechTimer = setTimeout(() => {
          bubble.classList.remove('speaking');
          if (textEl) textEl.textContent = T('pet.speechDefault');
          if (petState === 'success') this.setPetState('idle');
        }, 1800);
        return;
      }

      bubble.classList.remove('speaking', 'is-busy', 'is-error', 'quote');
      if (textEl) textEl.textContent = T('pet.speechDefault');
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
      clearTimeout(this._glanceTimer);
      clearTimeout(this._glanceReset);
      clearInterval(this._sleepWatchdogInterval);
      clearInterval(this._keepOutTimer);
      this.stopQuoteTicker();
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
      this.quickDock = null;
      this.zoomControls = null;
      this.summaryWindow = null;
      this._initialized = false;
      this._driving = false;
      this._isSleeping = false;
      this._sleepBound = false;
      clearTimeout(this._driveTimer);
      isDragging = false;
      dragMoved = false;
      isDockOpen = false;
      isSummaryOpen = false;
      isDocked = false;
      petState = 'idle';
      if (globalThis.RoamCatPet === this) globalThis.RoamCatPet = null;
    }

    isEnabled() {
      return currentSettings?.floatingPet?.enabled !== false;
    }

    updateSettings(newSettings) {
      const prevQuotes = currentSettings?.floatingPet?.quotes;
      currentSettings = newSettings || {};
      if (currentSettings.floatingPet?.enabled === false) {
        this.stopQuoteTicker();
        this.releaseDrag();
        clearTimeout(this._idleTimer);
        clearTimeout(this._glanceTimer);
        clearTimeout(this._glanceReset);
        clearTimeout(this._driveTimer);
        clearTimeout(this._speechTimer);
        clearInterval(this._sleepWatchdogInterval);
        this._summaryRequest = null;
        this._summaryPending = false;
        this._hoverStash = null;
        this._isSleeping = false;
        this._driving = false;
        this._capturedPointerId = null;
        if (hostEl) {
          hostEl.remove();
          hostEl = null;
          shadowRoot = null;
        }
        // DOM 已移除，所有指向旧节点的引用与交互标志一并复位，
        // 否则重新启用时新 DOM 会继承悬空的贴边/展开/拖拽状态。
        this.container = null;
        this.edgeTab = null;
        this.flipBtn = null;
        this.avatarWrap = null;
        this.quickDock = null;
        this.zoomControls = null;
        this.summaryWindow = null;
        isDragging = false;
        dragMoved = false;
        isDockOpen = false;
        isSummaryOpen = false;
        isDocked = false;
        petState = 'idle';
      } else {
        if (!hostEl && this._initialized) {
          this.createDOM();
          this.bindEvents();
          this.startIdleActions();
          this.startPageGlance();
          this.startSleepWatchdog();
          this.syncQuoteTicker();
          this.updateReadingStatus();
        }
        // 语录开关/间隔经 STATE_PATCH 下发：变化时重置累计并按需启停定时器。
        const nextQuotes = currentSettings.floatingPet?.quotes;
        const quoteConfigChanged =
          (prevQuotes?.enabled !== false) !== (nextQuotes?.enabled !== false)
          || (prevQuotes?.intervalMin ?? 15) !== (nextQuotes?.intervalMin ?? 15);
        if (quoteConfigChanged) this.syncQuoteTicker();
        if (hostEl) hostEl.style.display = '';
        const scale = currentSettings.floatingPet?.scale;
        if (typeof scale === 'number' && scale !== petScale) {
          this.setScale(scale, { persist: false });
        }
        if (currentSettings.floatingPet?.position) {
          currentRight = currentSettings.floatingPet.position.right ?? currentRight;
          currentBottom = currentSettings.floatingPet.position.bottom ?? currentBottom;
          this.clampPosition();
        }
        this.syncTheme();
      }
    }
  }

  // 摘要窗与语录气泡的原型方法拆在 floating-pet-summary.js / floating-pet-quote-bubble.js，
  // 它们经 shared 读写本闭包内的状态变量。
  const shared = {
    get currentSettings() { return currentSettings; },
    get isDockOpen() { return isDockOpen; },
    get isSummaryOpen() { return isSummaryOpen; },
    set isSummaryOpen(value) { isSummaryOpen = value; },
    get isDragging() { return isDragging; },
    get isDocked() { return isDocked; },
    get petState() { return petState; },
    get cachedSummary() { return cachedSummary; },
    set cachedSummary(value) { cachedSummary = value; },
    get cachedSummarySource() { return cachedSummarySource; },
    set cachedSummarySource(value) { cachedSummarySource = value; },
    get currentArticleMeta() { return currentArticleMeta; },
    set currentArticleMeta(value) { currentArticleMeta = value; },
    get detectedDomain() { return detectedDomain; }
  };
  globalThis.RoamCatPetParts.installQuoteBubble(RoamCatPetWidget.prototype, shared);
  globalThis.RoamCatPetParts.installSummary(RoamCatPetWidget.prototype, shared);

  // Mount global instance
  const mountWidget = () => {
    const widget = new RoamCatPetWidget();
    widget.detectPageTheme = detectPageTheme;
    widget.shadowQuery = (selector) => shadowRoot?.querySelector(selector);
    widget.getShadowRoot = () => shadowRoot;
    globalThis.RoamCatPet = widget;
    if (hostEl) {
      hostEl.pet = widget;
      hostEl.__pet = widget;
    }
  };

  // 渲染层 content-ui.js / i18n.js 由 manifest 静态 content_scripts 提供；动态注册的
  // 伴读猫与静态脚本同 run_at 下先后顺序不受保证，故依赖未就绪时短暂等待，而不是在
  // 注册项里重复注入一份（那样每个网页都要把渲染层解析执行两遍）。
  const depsReady = () => Boolean(globalThis.RoamCatContentUI?.petWidget && globalThis.RoamCatI18n);
  if (depsReady()) {
    mountWidget();
  } else {
    let tries = 0;
    const waitDeps = () => {
      if (bootId !== globalThis.__ROAMCAT_PET_GENERATION__) return;
      if (depsReady()) mountWidget();
      else if (++tries < 100) setTimeout(waitDeps, 20);
      else globalThis.__ROAMCAT_PET_BOOTING__ = false;
    };
    setTimeout(waitDeps, 0);
  }
})();
