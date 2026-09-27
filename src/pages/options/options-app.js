/**
 * @file src/pages/options/options-app.js
 * 文件职责：设置页 Lit 应用壳——12 分区 hash 路由（含 view transitions）、
 *   侧栏折叠、主题切换、宣言弹层、密码可见性切换、选择卡高亮委托。
 * 主要内容：渲染 shell.js + 12 个静态分区模板（light DOM 保留全部 id 契约）；
 *   首帧渲染完成后动态加载 options-controller.js 与 history.js，二者沿用原
 *   imperative DOM 契约填充动态内容；optionsSectionEnter 负责分区进入钩子。
 * 模块边界：扩展页受信上下文；路由与外壳状态唯一来源为本组件。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {LitElement, html} from 'lit';
import {t} from '../../i18n-runtime.js';
import {shellTop, mainToolbar, heroBlock, telemetryFooter, shellDialog} from './shell.js';
import {
  assistanceSection, appearanceSection, sitesSection, advancedSection,
  termsSection, personalizationSection, historySection, privacySection,
  serviceSection, diagnosticsSection, guideSection, shortcutsSection,
} from './sections/index.js';

const SECTIONS = ['assistance', 'appearance', 'sites', 'advanced', 'terms', 'personalization', 'history', 'privacy', 'service', 'diagnostics', 'shortcuts', 'guide'];
const SECTION_TEMPLATES = {
  assistance: assistanceSection, appearance: appearanceSection, sites: sitesSection,
  advanced: advancedSection, terms: termsSection, personalization: personalizationSection,
  history: historySection, privacy: privacySection, service: serviceSection,
  diagnostics: diagnosticsSection, shortcuts: shortcutsSection, guide: guideSection,
};
const LABELS = {
  assistance: 'opt.nav.assist', appearance: 'opt.nav.appearance', sites: 'opt.nav.sites', advanced: 'opt.nav.advanced',
  terms: 'opt.nav.terms', personalization: 'opt.nav.personalization', history: 'opt.nav.history',
  privacy: 'opt.nav.privacy', service: 'opt.nav.model', diagnostics: 'opt.nav.diagnostics',
  shortcuts: 'opt.nav.shortcuts', guide: 'opt.nav.guide',
};
const SECTION_META = {
  assistance: {title: 'opt.meta.assistance.title', category: 'opt.group.reading', stage: 'opt.meta.assistance.stage', desc: 'opt.meta.assistance.desc'},
  appearance: {title: 'opt.meta.appearance.title', category: 'opt.group.reading', stage: 'opt.meta.appearance.stage', desc: 'opt.meta.appearance.desc'},
  sites: {title: 'opt.meta.sites.title', category: 'opt.group.reading', stage: 'opt.meta.sites.stage', desc: 'opt.meta.sites.desc'},
  advanced: {title: 'opt.meta.advanced.title', category: 'opt.group.reading', stage: 'opt.meta.advanced.stage', desc: 'opt.meta.advanced.desc'},
  terms: {title: 'opt.meta.terms.title', category: 'opt.group.memory', stage: 'opt.meta.terms.stage', desc: 'opt.meta.terms.desc'},
  personalization: {title: 'opt.meta.personalization.title', category: 'opt.group.memory', stage: 'opt.meta.personalization.stage', desc: 'opt.meta.personalization.desc'},
  history: {title: 'opt.meta.history.title', category: 'opt.group.memory', stage: 'opt.meta.history.stage', desc: 'opt.meta.history.desc'},
  privacy: {title: 'opt.meta.privacy.title', category: 'opt.group.memory', stage: 'opt.meta.privacy.stage', desc: 'opt.meta.privacy.desc'},
  service: {title: 'opt.meta.service.title', category: 'opt.group.system', stage: 'opt.meta.service.stage', desc: 'opt.meta.service.desc'},
  diagnostics: {title: 'opt.meta.diagnostics.title', category: 'opt.group.system', stage: 'opt.meta.diagnostics.stage', desc: 'opt.meta.diagnostics.desc'},
  shortcuts: {title: 'opt.meta.shortcuts.title', category: 'opt.group.help', stage: 'opt.meta.shortcuts.stage', desc: 'opt.meta.shortcuts.desc'},
  guide: {title: 'opt.meta.guide.title', category: 'opt.group.help', stage: 'opt.meta.guide.stage', desc: 'opt.meta.guide.desc'},
};
const BREADCRUMBS = {
  assistance: ['opt.group.reading', 'opt.nav.assist'], appearance: ['opt.group.reading', 'opt.nav.appearance'],
  sites: ['opt.group.reading', 'opt.nav.sites'], advanced: ['opt.group.reading', 'opt.nav.advanced'],
  terms: ['opt.group.memory', 'opt.meta.terms.crumb'], personalization: ['opt.group.memory', 'opt.meta.personalization.crumb'],
  history: ['opt.group.memory', 'opt.nav.history'], privacy: ['opt.group.memory', 'opt.nav.privacy'],
  service: ['opt.group.system', 'opt.nav.model'], diagnostics: ['opt.group.system', 'opt.nav.diagnostics'],
  shortcuts: ['opt.group.help', 'opt.meta.shortcuts.crumb'],
  guide: ['opt.group.help', 'opt.meta.guide.crumb'],
};
const THEMES = ['auto', 'dark', 'light'];
const THEME_LABELS = {auto: 'opt.themeAuto', dark: 'opt.themeDark', light: 'opt.themeLight'};
const THEME_ICONS = {
  auto: '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>',
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
  light: '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
};

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };

class RoamcatOptions extends LitElement {
  createRenderRoot() { return this; }

  #section = '';
  #controller = null;
  #collapsed = localStorage.getItem('roamcat_sidebar_collapsed') === 'true';
  #theme = localStorage.getItem('roamcat_ui_theme') || 'auto';

  #onHashChange = () => this.#applyRoute();
  #onClick = event => {
    const collapseBtn = event.target.closest('#sidebar-collapse-btn');
    if (collapseBtn) { this.#setCollapsed(!this.#collapsed); return; }
    if (event.target.closest('#sidebar-brand-logo')) {
      if (this.#collapsed) this.#setCollapsed(false);
      return;
    }
    if (event.target.closest('#theme-toggle-btn')) { this.#cycleTheme(); return; }
    if (event.target.closest('#lang-toggle-btn')) { this.#cycleUiLang(); return; }
    const pwBtn = event.target.closest('.toggle-password-btn');
    if (pwBtn) { this.#togglePassword(pwBtn); return; }
    const stampCard = event.target.closest('#sidebar-stamp-card');
    if (stampCard) { event.preventDefault(); this.#openStampModal(); return; }
    const modal = $('stamp-manifesto-modal');
    if (modal) {
      if (event.target.closest?.('#stamp-modal-close') || event.target.closest?.('#stamp-modal-confirm') || event.target.id === 'stamp-modal-backdrop' || event.target === modal) {
        this.#closeStampModal();
        return;
      }
      if (event.target.closest('#stamp-modal-goto-pet')) {
        this.#closeStampModal();
        location.hash = '#assistance';
        setTimeout(() => {
          const petCard = $('setting-block-floating-pet') || $('floating-pet-enabled');
          if (petCard) {
            petCard.scrollIntoView({behavior: 'smooth', block: 'center'});
            petCard.classList.remove('pet-card-highlight');
            void petCard.offsetWidth;
            petCard.classList.add('pet-card-highlight');
          }
        }, 150);
      }
    }
  };
  #onKeydown = event => {
    const stampCard = event.target.closest('#sidebar-stamp-card');
    if (stampCard && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.#openStampModal();
    }
  };
  #onChange = event => {
    if (event.target.matches?.('input[type="radio"]')) this.#syncChoiceCards();
    if (event.target.matches?.('input[name="ui-lang"]')) this.#setUiLang(event.target.value);
  };

  render() {
    // <main> 与 .main-canvas-content 的开合标签必须位于同一模板内（lit 模板
    // 独立解析，未闭合标签会在片段末尾被自动闭合），故在此显式书写。
    return html`${shellTop}
    <main class="main-panel" data-purpose="settings-main-canvas">
      ${mainToolbar}
      <div class="main-canvas-content">
        ${heroBlock}
        ${SECTIONS.map(name => SECTION_TEMPLATES[name])}
      </div>
      ${telemetryFooter}
    </main>
    ${shellDialog}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#applyTheme(this.#theme);
    this.#setCollapsed(this.#collapsed, {silent: true});
    window.addEventListener('hashchange', this.#onHashChange);
    document.addEventListener('click', this.#onClick);
    document.addEventListener('keydown', this.#onKeydown);
    document.addEventListener('change', this.#onChange);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.#onHashChange);
    document.removeEventListener('click', this.#onClick);
    document.removeEventListener('keydown', this.#onKeydown);
    document.removeEventListener('change', this.#onChange);
    super.disconnectedCallback();
  }

  async firstUpdated() {
    this.#syncUiLangChoice();
    this.#applyRoute({initial: true});
    // 控制器与阅读记录模块在顶层执行 querySelector 契约绑定，必须在首帧渲染后加载。
    const [{optionsInit, optionsSectionEnter}] = await Promise.all([
      import('./options-controller.js'),
      import('@ext/ui/history.js'),
    ]);
    this.#controller = {optionsSectionEnter};
    await optionsInit(this.#section);
    optionsSectionEnter(this.#section, '');
  }

  #requestedSection() {
    const raw = location.hash.replace('#', '');
    return SECTIONS.includes(raw) ? raw : 'assistance';
  }

  #applyRoute({initial = false} = {}) {
    const requested = location.hash.replace('#', '');
    const section = this.#requestedSection();
    if (requested !== section) history.replaceState(null, '', `#${section}`);
    const previous = this.#section;
    if (section === previous && !initial) return;
    const mutate = () => {
      this.#section = section;
      for (const name of SECTIONS) { const el = $(name); if (el) el.hidden = name !== section; }
      this.#syncChrome(section);
      this.#resetScroll();
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!initial && typeof document.startViewTransition === 'function' && !reduced) {
      document.startViewTransition(mutate);
    } else {
      mutate();
    }
    if (!initial && previous) $('section-title')?.focus({preventScroll: true});
    this.#controller?.optionsSectionEnter(section, previous);
  }

  #syncChrome(section) {
    const meta = SECTION_META[section] || SECTION_META.assistance;
    setText('section-title', t(meta.title));
    setText('hero-category-badge', t(meta.category));
    setText('hero-stage-badge', t(meta.stage));
    setText('hero-desc', t(meta.desc));
    const [category, code] = BREADCRUMBS[section] || ['opt.toolbarRoot', 'opt.nav.assist'];
    setText('toolbar-category-title', t(category));
    setText('toolbar-breadcrumb-title', t(code));
    const readout = document.querySelector('.hero-right-card.reading-readout');
    if (readout) readout.hidden = section !== 'assistance';
    document.title = `${t('common.brand')} · ${t(LABELS[section])}`;
    document.querySelectorAll('[data-section]').forEach(link => {
      const active = link.dataset.section === section;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  #resetScroll() {
    const mainPanel = document.querySelector('.main-panel');
    if (mainPanel?.scrollTo) mainPanel.scrollTo({top: 0, behavior: 'instant'});
    else if (mainPanel) mainPanel.scrollTop = 0;
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  #syncChoiceCards() {
    document.querySelectorAll('.choice-card-item').forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio) card.classList.toggle('is-selected', radio.checked);
    });
  }

  #applyTheme(theme) {
    this.#theme = theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('roamcat_ui_theme', theme);
    const i18n = globalThis.RoamCatI18n;
    const themeLabel = i18n ? i18n.t(THEME_LABELS[theme] || 'opt.themeAuto') : theme;
    setText('theme-toggle-label', i18n ? i18n.t('opt.themeBtnLabel', {label: themeLabel}) : themeLabel);
    const svgEl = $('theme-icon-svg');
    if (svgEl && THEME_ICONS[theme]) svgEl.innerHTML = THEME_ICONS[theme];
    const btn = $('theme-toggle-btn');
    if (btn) btn.title = i18n ? i18n.t('opt.themeToggleTitle', { theme: themeLabel }) : themeLabel;
  }

  #cycleTheme() {
    this.#applyTheme(THEMES[(THEMES.indexOf(this.#theme) + 1) % THEMES.length]);
  }

  #syncUiLangChoice() {
    const i18n = globalThis.RoamCatI18n;
    const pref = i18n?.pref?.() || 'auto';
    document.querySelectorAll('input[name="ui-lang"]').forEach(input => {
      input.checked = input.value === pref;
    });
    const label = $('lang-toggle-label');
    const langName = i18n?.t(`common.lang${pref === 'auto' ? 'Auto' : pref === 'zh' ? 'Zh' : 'En'}`);
    if (label && i18n) label.textContent = i18n.t('opt.langBtnLabel', {label: langName});
    const langBtn = $('lang-toggle-btn');
    if (langBtn && i18n) langBtn.title = i18n.t('opt.langToggleTitle', { lang: langName || pref });
    this.#syncChoiceCards();
  }

  #cycleUiLang() {
    const i18n = globalThis.RoamCatI18n;
    if (!i18n) return;
    const order = ['auto', 'zh', 'en'];
    const next = order[(order.indexOf(i18n.pref()) + 1) % order.length];
    this.#setUiLang(next);
  }

  #setUiLang(value) {
    const i18n = globalThis.RoamCatI18n;
    if (!i18n || i18n.pref() === value) return;
    i18n.setPref(value);
    // 等 chrome.storage.local 异步写入落地后再刷新，保证其他界面同步到
    setTimeout(() => location.reload(), 120);
  }

  #setCollapsed(collapsed, {silent = false} = {}) {
    this.#collapsed = collapsed;
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (!silent) localStorage.setItem('roamcat_sidebar_collapsed', String(collapsed));
    else localStorage.setItem('roamcat_sidebar_collapsed', String(collapsed));
    const btn = $('sidebar-collapse-btn');
    if (btn) {
      const title = collapsed ? t('opt.expandSidebar') : t('opt.collapseSidebar');
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
  }

  #togglePassword(btn) {
    const targetId = btn.dataset.toggleTarget;
    const input = targetId ? $(targetId) : btn.parentElement?.querySelector('input,textarea');
    if (!input) return;
    let revealed;
    if (input.tagName === 'TEXTAREA') {
      // textarea 没有 type=password，用 -webkit-text-security 类遮罩。
      revealed = input.classList.toggle('key-pool-revealed');
    } else {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      revealed = isPassword;
    }
    const show = btn.querySelector('.eye-show');
    const hide = btn.querySelector('.eye-hide');
    if (show) show.hidden = revealed;
    if (hide) hide.hidden = !revealed;
    btn.title = revealed ? t('opt.hideKey') : t('opt.showKey');
    btn.setAttribute('aria-label', btn.title);
  }

  #openStampModal() {
    const modal = $('stamp-manifesto-modal');
    if (!modal) return;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  }

  #closeStampModal() {
    const modal = $('stamp-manifesto-modal');
    if (!modal) return;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  }
}

const ICON_MARKUP = {
  auto: '<rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line>',
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>',
  light: '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>',
};

customElements.define('roamcat-options', RoamcatOptions);
