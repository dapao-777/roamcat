/**
 * @file src/pages/welcome/welcome-app.js
 * 文件职责：首次安装引导 Lit 应用——功能导览、三形态交互沙盒、快捷触发键选择、
 *   偏好初始化保存。
 * 主要内容：逻辑移植自 extension/ui/welcome.js（STATE_PATCH 优先、storage.local
 *   兜底、closeWelcomeGuide、speechSynthesis 试读保持不变）；light DOM 渲染保留
 *   既有 id 级测试钩子；滚动入场动画由 welcome.css 的 view() 时间线提供。
 * 模块边界：扩展页受信上下文；偏好写入仅经 request()/chrome.storage.local。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {LitElement, html, svg} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {request, closeWelcomeGuide} from '@ext/shared.js';
import {heroArt} from '../../components/hero-art.js';

const SANDBOX_WORDS = {
  compare: {word: 'compare', pos: 'v.', phonetic: '/kəmˈpeər/', def: '对比；对照衡量。在两件事物之间权衡异同以判别优劣。', context: '在下结论前比对各项客观依据与线索', rubyHint: '比对'},
  conclusion: {word: 'conclusion', pos: 'n.', phonetic: '/kənˈkluːʒn/', def: '结论；推论。经过审慎权衡后做出的最终决断。', context: '根据详实证据得出理性推论', rubyHint: '结论'},
  latency: {word: 'latency', pos: 'n. 计算机网络', phonetic: '/ˈleɪtnsi/', def: '延迟；响应时延。指数据在网络传输或系统处理中的往返时间差。', context: 'The cache reduces latency... (缓存机制用于降低系统耗时)', rubyHint: '延迟'},
  congestion: {word: 'congestion', pos: 'n.', phonetic: '/kənˈdʒestʃən/', def: '拥堵；拥塞。网络中报文传输量超过通道处理能力的瓶颈状态。', context: '当网络流量突增引发拥堵时', rubyHint: '拥堵'},
};

const THEMES = ['auto', 'dark', 'light'];
const THEME_LABELS = {auto: '跟随系统', dark: '深色模式', light: '浅色模式'};
const THEME_ICONS = {
  auto: svg`<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>`,
  dark: svg`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`,
  light: svg`<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`,
};

class RoamcatWelcome extends LitElement {
  createRenderRoot() { return this; }

  #key = 'D';
  #assistanceMode = 'ambient';
  #lookupDisplay = 'card';
  #sandboxMode = 'card';
  #selectedWord = 'latency';
  #known = false;
  #sentenceTransOpen = false;
  #theme = 'auto';
  #saving = false;
  #saveButtonText = '';
  #toastVisible = false;
  #toastMessage = '';
  #keyPulse = false;
  #pulseTimer = 0;

  #onKeydown = event => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key?.toUpperCase();
    if (key && /^[A-Z]$/u.test(key)) this.#setLookupKey(key);
  };

  connectedCallback() {
    super.connectedCallback();
    this.#theme = localStorage.getItem('roamcat_ui_theme') || 'auto';
    this.#applyTheme(this.#theme);
    window.addEventListener('keydown', this.#onKeydown);
    void this.#loadInitialSettings();
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.#onKeydown);
    clearTimeout(this.#pulseTimer);
    super.disconnectedCallback();
  }

  #applyTheme(theme) {
    this.#theme = theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('roamcat_ui_theme', theme);
    this.requestUpdate();
  }

  #cycleTheme() {
    const next = THEMES[(THEMES.indexOf(this.#theme) + 1) % THEMES.length];
    this.#applyTheme(next);
  }

  #selectWord(word) {
    if (!SANDBOX_WORDS[word]) return;
    this.#selectedWord = word;
    this.#known = false;
    this.#sentenceTransOpen = false;
    this.requestUpdate();
  }

  #setSandboxMode(mode) {
    this.#sandboxMode = mode;
    if (mode === 'card') this.#selectedWord = 'latency';
    this.#known = false;
    this.#sentenceTransOpen = false;
    this.requestUpdate();
  }

  #speakWord() {
    const word = SANDBOX_WORDS[this.#selectedWord]?.word || 'latency';
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  #setLookupKey(key) {
    if (!key || typeof key !== 'string') return;
    this.#key = key.toUpperCase().slice(0, 1);
    this.#keyPulse = true;
    clearTimeout(this.#pulseTimer);
    this.#pulseTimer = setTimeout(() => { this.#keyPulse = false; this.requestUpdate(); }, 140);
    this.requestUpdate();
  }

  async #loadInitialSettings() {
    try {
      if (!window.chrome?.storage?.local) return;
      const res = await chrome.storage.local.get(['settings']);
      const s = res?.settings;
      if (!s) return;
      if (s.lookupKey) this.#key = String(s.lookupKey).toUpperCase().slice(0, 1);
      if (s.assistanceMode) this.#assistanceMode = s.assistanceMode;
      if (s.lookupDisplay) this.#lookupDisplay = s.lookupDisplay;
      this.requestUpdate();
    } catch {
      // 读取失败时静默采用默认初始配置。
    }
  }

  async #savePreferences() {
    this.#saving = true;
    this.#saveButtonText = '正在保存偏好…';
    this.requestUpdate();
    const patch = {lookupKey: this.#key, assistanceMode: this.#assistanceMode, lookupDisplay: this.#lookupDisplay};
    try {
      try {
        await request('STATE_PATCH', {patch});
      } catch {
        if (window.chrome?.storage?.local) {
          const res = await chrome.storage.local.get(['settings']);
          const settings = {...(res?.settings || {}), ...patch};
          await chrome.storage.local.set({settings});
        }
      }
      this.#toastMessage = `偏好配置已保存 (触发键: ${this.#key} · 模式: ${this.#assistanceMode === 'ambient' ? 'Cloze' : '静默'})！`;
      this.#toastVisible = true;
      this.#saveButtonText = '✓ 偏好已保存！开启沉浸阅读';
      setTimeout(() => { this.#saving = false; this.requestUpdate(); }, 1200);
    } catch (error) {
      console.error('保存失败:', error);
      this.#saveButtonText = '保存失败，请重试';
      this.#saving = false;
    }
    this.requestUpdate();
  }

  #closeWelcome() {
    void closeWelcomeGuide().catch(error => console.error('关闭新手引导失败', error));
  }

  #renderSandboxParagraph() {
    const token = (word, hint) => html`<span class=${classMap({'sb-token': true, 'active-target': this.#selectedWord === word})} data-word=${word}
      @click=${() => this.#selectWord(word)}>${word}</span>`;
    if (this.#sandboxMode === 'ruby') {
      const ruby = (word, hint) => html`<ruby class=${classMap({'sb-token': true, 'active-target': this.#selectedWord === word})} data-word=${word}
        @click=${() => this.#selectWord(word)}>${word}<rt>${hint}</rt></ruby>`;
      return html`Careful readers ${ruby('compare', '比对')} the evidence that each explanation provides before they reach a ${ruby('conclusion', '结论')}. The cache reduces ${ruby('latency', '延迟')} significantly when network ${ruby('congestion', '拥堵')} spikes.`;
    }
    if (this.#sandboxMode === 'structure') {
      return html`<span class="syntax-subj" title="主语">Careful readers</span> <span class="syntax-pred" title="谓语">compare</span> <span class="syntax-obj" title="宾语">the evidence <span class="syntax-adv" title="定语从句">that each explanation provides</span></span> <span class="syntax-adv" title="时间状语">before they reach a conclusion</span>. <span class="syntax-subj" title="主语">The cache</span> <span class="syntax-pred" title="谓语">reduces</span> <span class="syntax-obj" title="宾语">latency</span> significantly <span class="syntax-adv" title="条件状语从句">when network congestion spikes</span>.`;
    }
    return html`Careful readers ${token('compare')} the evidence that each explanation provides before they reach a ${token('conclusion')}. The cache reduces ${token('latency')} significantly when network ${token('congestion')} spikes.`;
  }

  #renderModeButton(mode, selectedLabel) {
    const icons = {
      card: svg`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>`,
      ruby: svg`<path d="M4 7V4h16v3M9 20h6M12 4v16"/>`,
      structure: svg`<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
    };
    return html`<button type="button" class=${classMap({'sandbox-mode-btn': true, active: this.#sandboxMode === mode})}
      data-mode=${mode} role="tab" aria-selected=${this.#sandboxMode === mode ? 'true' : 'false'}
      @click=${() => this.#setSandboxMode(mode)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">${icons[mode]}</svg>
      <span>${selectedLabel}</span>
    </button>`;
  }

  #renderChoiceCard(group, value, title, badge, badgeClass, text) {
    const isAssistance = group === 'assistance';
    const checked = isAssistance ? this.#assistanceMode === value : this.#lookupDisplay === value;
    const body = html`<input type="radio" name=${isAssistance ? 'welcome-assistance-mode' : 'welcome-lookup-display'} value=${value} .checked=${checked}
        @change=${() => { if (isAssistance) this.#assistanceMode = value; else this.#lookupDisplay = value; this.requestUpdate(); }}>
      <div class="choice-card-body">
        <div class="choice-card-head">
          <span class="choice-title">${title}</span>
          <span class="choice-badge ${badgeClass}">${badge}</span>
        </div>
        <p class="choice-text">${text}</p>
      </div>`;
    const classes = classMap({'welcome-choice-card': true, 'is-selected': checked});
    return isAssistance
      ? html`<label class=${classes} data-mode=${value}>${body}</label>`
      : html`<label class=${classes} data-display=${value}>${body}</label>`;
  }

  render() {
    const word = SANDBOX_WORDS[this.#selectedWord];
    const hudHidden = this.#sandboxMode !== 'card';
    return html`
  <header class="welcome-header">
    <div class="welcome-header-inner">
      <div class="welcome-brand">
        <div class="brand-icon-box">
          <img src=${chrome.runtime.getURL('icons/roamcat.svg')} width="26" height="26" alt="RoamCat">
        </div>
        <div class="brand-meta">
          <div class="brand-name-row">
            <span class="brand-name">ROAMCAT</span>
            <span class="brand-version-pill">v${chrome.runtime.getManifest?.().version ?? '0.0.1'}</span>
            <span class="brand-status-dot" title="Local Engine Ready"></span>
          </div>
          <span class="brand-sub">随心阅 · FREE-ROAM READING</span>
        </div>
      </div>
      <div class="welcome-header-actions">
        <div class="theme-switch-wrap">
          <button type="button" id="theme-toggle-btn" class="theme-switch-btn" title="当前主题: ${THEME_LABELS[this.#theme]} (点击切换)" @click=${() => this.#cycleTheme()}>
            <svg id="theme-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">${THEME_ICONS[this.#theme]}</svg>
            <span id="theme-toggle-label">${THEME_LABELS[this.#theme]}</span>
          </button>
        </div>
        <button type="button" id="close-welcome-btn" class="welcome-options-link" @click=${() => this.#closeWelcome()}>关闭引导</button>
        <a href="options.html" class="welcome-options-link" title="前往完整设置中心">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33l.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          <span>设置中心</span>
        </a>
      </div>
    </div>
  </header>

  <main class="welcome-container">
    <section class="welcome-hero-card" aria-labelledby="welcome-hero-title">
      <div class="welcome-hero-main">
        <div class="welcome-tag-row">
          <span class="welcome-code-tag">SYSTEM READY // 首次安装就绪</span>
          <span class="welcome-matrix-tag">FREE-ROAM READING ENGINE</span>
        </div>
        <h1 id="welcome-hero-title" class="welcome-hero-title">
          <span class="hero-title-pixel">ROAMCAT</span>
          <span class="hero-title-serif">随心阅 · 漫游英文世界</span>
        </h1>
        <p class="welcome-hero-desc">
          打破“生词即全文机翻”的依赖惯性。RoamCat 像猫一样陪你在真实英文语境中随心漫步——只在认知阻断处落下脚印：适度提示、语境卡片与长难句骨架拆解；走过的地方，自然不再回头。
        </p>
        <div class="welcome-hero-cta">
          <a href="#step-sandbox" class="hero-cta-primary">开始体验</a>
          <a href="#step-preferences" class="hero-cta-ghost">看看怎么配置 <span aria-hidden="true">→</span></a>
        </div>
        <div class="welcome-feature-pills">
          <div class="feature-pill">
            <span class="pill-icon">⚡</span>
            <div class="pill-text"><strong>瞬时查词</strong><span>按住快捷键 + 单击即查</span></div>
          </div>
          <div class="feature-pill">
            <span class="pill-icon">🐾</span>
            <div class="pill-text"><strong>随心漫步</strong><span>不替换整段，保护语言心流</span></div>
          </div>
          <div class="feature-pill">
            <span class="pill-icon">🛡️</span>
            <div class="pill-text"><strong>本地优先</strong><span>词汇与阅读记录保存在本机</span></div>
          </div>
        </div>
      </div>
      <div class="welcome-hero-art" aria-hidden="true">
        ${heroArt()}
        <div class="hero-art-caption">SCANLINE // 01 · 漫游猫</div>
      </div>
    </section>

    <div class="welcome-wave-band" aria-hidden="true">
      <div class="wave-band-labels"><span>CRAFT, ENGINEERED.</span><span>DOT MATRIX / ROAM TRAIL</span></div>
      <img class="wave-light" src=${chrome.runtime.getURL('icons/dot-wave.svg')} alt="">
      <img class="wave-dark" src=${chrome.runtime.getURL('icons/dot-wave-dark.svg')} alt="">
    </div>

    <section class="welcome-step-card" id="step-sandbox" aria-labelledby="sandbox-heading">
      <div class="step-card-header">
        <div class="step-badge-row">
          <span class="step-num-badge">STEP 01</span>
          <span class="step-cat-badge">INTERACTIVE SANDBOX</span>
        </div>
        <h2 id="sandbox-heading" class="step-title">实时交互沙盒 · 体验 3 种阅读辅助形态</h2>
        <p class="step-desc">直接在下方的模拟网页中试玩！点击段落中的高亮词汇（例如 <code class="code-word">latency</code>），或切换顶部形态，感受零打扰的智能辅读体验。</p>
      </div>

      <div class="sandbox-toolbar">
        <div class="sandbox-mode-selector" role="tablist" aria-label="辅助呈现形态切换">
          ${this.#renderModeButton('card', '形态 A · 悬浮解释卡片 (HUD Card)')}
          ${this.#renderModeButton('ruby', '形态 B · 原词顶部词注 (Inline Ruby)')}
          ${this.#renderModeButton('structure', '形态 C · 句子解构 (Syntax Matrix)')}
        </div>
        <div class="sandbox-badge-info">
          <span class="live-pill">● LIVE PREVIEW</span>
        </div>
      </div>

      <div class="sandbox-browser-mockup">
        <div class="browser-address-bar">
          <div class="browser-dots" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="browser-url-input">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>https://developer.mozilla.org/en-US/docs/Web/Performance/Fundamentals</span>
          </div>
          <div class="browser-status-pill">英文正文</div>
        </div>

        <div class="browser-reading-area">
          <p class="sandbox-paragraph" id="sandbox-text">${this.#renderSandboxParagraph()}</p>

          <div class="sandbox-hud-card" id="sandbox-hud" ?hidden=${hudHidden}>
            <div class="hud-card-header">
              <div class="hud-term-group">
                <span class="hud-term" id="hud-term-text">${word.word}</span>
                <span class="hud-phonetic" id="hud-phonetic-text">${word.phonetic}</span>
                <button type="button" class="hud-audio-btn" id="hud-audio-btn" title="朗读发音" aria-label="朗读发音" @click=${() => this.#speakWord()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </button>
              </div>
              <span class="hud-tag" id="hud-pos-text">${word.pos}</span>
            </div>
            <div class="hud-card-body">
              <p class="hud-definition" id="hud-def-text">${word.def}</p>
              <div class="hud-context-box">
                <span class="hud-context-label">语境透视：</span>
                <span class="hud-context-content" id="hud-context-text">${word.context}</span>
              </div>
            </div>
            <div class="hud-card-footer">
              <div class="hud-actions-left">
                <button type="button" class=${classMap({'hud-action-btn': true, 'known-active': this.#known})} id="hud-known-btn"
                  @click=${() => { this.#known = !this.#known; this.requestUpdate(); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                  <span id="hud-known-text">${this.#known ? '已标记为已掌握 ✓' : '我已认识此词'}</span>
                </button>
                <button type="button" class="hud-action-btn" id="hud-sentence-btn"
                  @click=${() => { this.#sentenceTransOpen = !this.#sentenceTransOpen; this.requestUpdate(); }}>${this.#sentenceTransOpen ? '收起本句译文' : '展开本句译文'}</button>
              </div>
              <span class="hud-engine-chip">DS-V3 Context</span>
            </div>
            <div class="hud-sentence-translation" id="hud-sentence-trans" ?hidden=${!this.#sentenceTransOpen}>
              <p>“当网络拥堵突增时，高速缓存能够显著降低传输延迟。”</p>
            </div>
          </div>
        </div>

        <div class="sandbox-footer-tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>💡 网页实战技巧：按住查词快捷键（默认为 <kbd class="inline-kbd" data-lookup-key>${this.#key}</kbd>）并单击任意单词，即可在真实网页中秒级唤出上方卡片！</span>
        </div>
      </div>
    </section>

    <section class="welcome-step-card" id="step-preferences" aria-labelledby="preferences-heading">
      <div class="step-card-header">
        <div class="step-badge-row">
          <span class="step-num-badge">STEP 02</span>
          <span class="step-cat-badge">QUICK CONFIGURATION</span>
        </div>
        <h2 id="preferences-heading" class="step-title">核心偏好快速初始化 · 量身定制你的阅读体验</h2>
        <p class="step-desc">三项关键设定，决定 RoamCat 如何陪伴你的日常英文浏览。修改后将自动写入扩展存储：</p>
      </div>

      <div class="quick-config-grid">
        <div class="config-block">
          <div class="config-block-header">
            <span class="config-num">01</span>
            <div>
              <h3 class="config-title">查词快捷触发键</h3>
              <p class="config-desc">在任意网页中按住此键 + 鼠标单击单词即可查词。</p>
            </div>
          </div>
          <div class="hotkey-setup-box">
            <div class="keycap-preview-area">
              <div class=${classMap({'welcome-keycap-box': true, 'keycap-pressed': this.#keyPulse})} id="welcome-keycap-display" title="点击或按键盘测试"
                @click=${() => this.#setLookupKey(this.#key)}>
                <span id="welcome-keycap-char">${this.#key}</span>
              </div>
              <div class="keycap-instruction">
                <span class="keycap-state-label">当前按键：按住 <kbd id="keycap-label-name">${this.#key}</kbd> 键</span>
                <span class="keycap-state-sub">普通键盘输入打字时绝不干扰</span>
              </div>
            </div>
            <div class="hotkey-options-row" id="hotkey-selector-group">
              ${['D', 'F', 'S', 'A', 'E'].map(k => html`<button type="button" class=${classMap({'hotkey-choice-btn': true, active: this.#key === k})} data-key=${k}
                @click=${() => this.#setLookupKey(k)}>${k === 'D' ? 'D (默认推荐)' : k + ' 键'}</button>`)}
            </div>
          </div>
        </div>

        <div class="config-block">
          <div class="config-block-header">
            <span class="config-num">02</span>
            <div>
              <h3 class="config-title">辅读介入强度</h3>
              <p class="config-desc">控制页面开启辅助后是否主动标出生词线索。</p>
            </div>
          </div>
          <div class="choice-cards-container">
            ${this.#renderChoiceCard('assistance', 'ambient', '自动给少量提示 (Cloze 模式)', '系统推荐', 'recommended', '智能识别可能陌生的关键词汇，提供关键轻提示。掌握后自动渐退，平衡阅读连贯性与习得效果。')}
            ${this.#renderChoiceCard('assistance', 'on-demand', '只在主动求助时 (静默模式)', '零干扰', 'quiet', '页面完全不主动扫描与高亮，仅在你按下快捷键主动查词时呈现，还原纯净原生网页环境。')}
          </div>
        </div>

        <div class="config-block">
          <div class="config-block-header">
            <span class="config-num">03</span>
            <div>
              <h3 class="config-title">HUD 释义呈现形态</h3>
              <p class="config-desc">单词触发查词后在屏幕上的视觉呈现形式。</p>
            </div>
          </div>
          <div class="choice-cards-container">
            ${this.#renderChoiceCard('display', 'card', '悬浮解释卡片 (HUD Card)', '详尽剖析', 'popup', '弹出独立悬浮窗，展示音标、详释、当前句语境对照，支持一键加入生词矩阵或展开整句翻译。')}
            ${this.#renderChoiceCard('display', 'annotation', '原词顶部词注 (Inline Ruby)', '极简内联', 'ruby', '直接在英文单词正上方标注紧凑短释义，不遮挡正文视线，像原生读物注音一样自然流畅。')}
          </div>
        </div>
      </div>
    </section>

    <section class="welcome-step-card" id="step-cheatsheet" aria-labelledby="cheatsheet-heading">
      <div class="step-card-header">
        <div class="step-badge-row">
          <span class="step-num-badge">STEP 03</span>
          <span class="step-cat-badge">CHEATSHEET MATRIX</span>
        </div>
        <h2 id="cheatsheet-heading" class="step-title">常用快捷键与操作速查 · 随心掌控全局</h2>
        <p class="step-desc">随时调用、零延迟响应的快捷键组合，助你无需频繁打开弹窗菜单：</p>
      </div>

      <div class="cheatsheet-grid">
        <div class="cheatsheet-card">
          <div class="cheatsheet-keycaps">
            <kbd class="cs-kbd" data-lookup-key>${this.#key}</kbd>
            <span class="cs-plus">+</span>
            <span class="cs-mouse">鼠标单击单词</span>
          </div>
          <div class="cheatsheet-info">
            <h4 class="cs-title">智能查词与语境分析</h4>
            <p class="cs-desc">无感呼出当前单词的精准释义卡片或顶部词注，无需先复制再查词典。</p>
          </div>
        </div>

        <div class="cheatsheet-card">
          <div class="cheatsheet-keycaps">
            <kbd class="cs-kbd">Alt</kbd>
            <span class="cs-plus">+</span>
            <kbd class="cs-kbd">Shift</kbd>
            <span class="cs-plus">+</span>
            <kbd class="cs-kbd">S</kbd>
          </div>
          <div class="cheatsheet-info">
            <h4 class="cs-title">一键开启 / 暂停网页辅助</h4>
            <p class="cs-desc">快速切换当前标签页的辅读状态，也可在扩展弹窗中为该站点开启永久自启动。</p>
          </div>
        </div>

        <div class="cheatsheet-card">
          <div class="cheatsheet-keycaps">
            <kbd class="cs-kbd">Alt</kbd>
            <span class="cs-plus">+</span>
            <kbd class="cs-kbd">Shift</kbd>
            <span class="cs-plus">+</span>
            <kbd class="cs-kbd">T</kbd>
          </div>
          <div class="cheatsheet-info">
            <h4 class="cs-title">呼出本页双语智能对照</h4>
            <p class="cs-desc">保留英文排版，在段落旁按阅读视线就近展开高质量局部中文对照。</p>
          </div>
        </div>

        <div class="cheatsheet-card">
          <div class="cheatsheet-keycaps">
            <span class="cs-mouse">鼠标划选任意长难句</span>
          </div>
          <div class="cheatsheet-info">
            <h4 class="cs-title">划句选段精准解构</h4>
            <p class="cs-desc">选中复杂从句即可触发句法成分分析，标出主语、谓语、宾语与修饰成分。</p>
          </div>
        </div>
      </div>
    </section>

    <section class="welcome-step-card launch-card" id="step-launch" aria-labelledby="launch-heading">
      <div class="launch-inner">
        <div class="launch-icon-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 id="launch-heading" class="launch-title">准备就绪！保存偏好并开启沉浸阅读</h2>
        <p class="launch-desc">点击下方按钮保存刚刚的偏好配置。你也可以在之后随时进入设置中心连接 ChatGPT、Grok 或自定义 API 模型服务以获得更强大的语境推理能力。</p>

        <div class="launch-actions-wrap">
          <button type="button" id="save-and-launch-btn" class="launch-primary-btn" .disabled=${this.#saving} @click=${() => void this.#savePreferences()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
            <span id="save-btn-text">${this.#saveButtonText || '保存偏好并开启体验 (Save & Launch)'}</span>
          </button>
          <button type="button" id="finish-welcome-btn" class="launch-secondary-btn" @click=${() => this.#closeWelcome()}>完成并关闭</button>
          <a href="options.html" class="launch-secondary-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
            <span>完整设置中心 (Matrix Console)</span>
          </a>
        </div>

        <div id="save-status-toast" class="launch-toast" ?hidden=${!this.#toastVisible} role="status" aria-live="polite">
          <span class="toast-check">✓</span>
          <span id="toast-message">${this.#toastMessage}</span>
        </div>
      </div>
    </section>
  </main>

  <footer class="welcome-footer">
    <div class="footer-left">
      <span class="footer-brand">RoamCat Engine</span>
      <span class="footer-sep">·</span>
      <span>Anti-Dependency Matrix Architecture</span>
      <span class="footer-sep">·</span>
      <span>AES-256 GCM Local Protected</span>
    </div>
    <div class="footer-right">
      <a href="options.html#guide" class="footer-link">使用手册</a>
      <span class="footer-sep">|</span>
      <a href="options.html#service" class="footer-link">模型连接</a>
      <span class="footer-sep">|</span>
      <a href="options.html#privacy" class="footer-link">数据隐私</a>
    </div>
  </footer>`;
  }
}

customElements.define('roamcat-welcome', RoamcatWelcome);
