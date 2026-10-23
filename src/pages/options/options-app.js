/**
 * @file src/pages/options/options-app.js
 * 文件职责：设置页 Lit 应用壳——五个分组、11 个分区的 hash 路由（组内用标签切换；旧 #advanced 重定向至 #sites）（含 view transitions）、
 *   侧栏折叠（中等宽度自动收为图标栏）、主题切换、宣言弹层、密码可见性切换、选择卡高亮委托。
 * 主要内容：渲染 shell.js + 11 个静态分区模板（light DOM 保留全部 id 契约）；
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
import {shellTop, mainToolbar, heroBlock, nowStatus, shellDialog} from './shell.js';
import {
  assistanceSection, appearanceSection, sitesSection,
  termsSection, personalizationSection, historySection, privacySection,
  serviceSection, diagnosticsSection, guideSection, shortcutsSection,
} from './sections/index.js';

const SECTIONS = ['assistance', 'appearance', 'sites', 'service', 'terms', 'personalization', 'history', 'privacy', 'shortcuts', 'guide', 'diagnostics'];
// 已并入其他分区的旧锚点：hash → [分区, 分区内滚动目标]
const SECTION_ALIASES = {advanced: ['sites', 'domain-detection']};
const SECTION_TEMPLATES = {
  assistance: assistanceSection, appearance: appearanceSection, sites: sitesSection,
  terms: termsSection, personalization: personalizationSection,
  history: historySection, privacy: privacySection, service: serviceSection,
  diagnostics: diagnosticsSection, shortcuts: shortcutsSection, guide: guideSection,
};
const LABELS = {
  assistance: 'opt.nav.assist', appearance: 'opt.nav.appearance', sites: 'opt.nav.sites',
  terms: 'opt.nav.terms', personalization: 'opt.nav.personalization', history: 'opt.nav.history',
  privacy: 'opt.nav.privacy', service: 'opt.nav.model', diagnostics: 'opt.nav.diagnostics',
  shortcuts: 'opt.nav.shortcuts', guide: 'opt.nav.guide',
};
// 侧栏只有五个分组；组内有几个分区时，页头下方用标签切换。hash 仍是分区名（#terms、#diagnostics …），
// 弹窗、伴读猫和文档里的旧链接不用改。
const GROUPS = [
  {id: 'reading', label: 'opt.group5.reading', desc: 'opt.group5.readingDesc', sections: ['assistance', 'appearance']},
  {id: 'sites', label: 'opt.group5.sites', desc: 'opt.group5.sitesDesc', sections: ['sites']},
  {id: 'service', label: 'opt.group5.service', desc: 'opt.group5.serviceDesc', sections: ['service']},
  {id: 'vocab', label: 'opt.group5.vocab', desc: 'opt.group5.vocabDesc', sections: ['terms', 'personalization', 'history']},
  {id: 'more', label: 'opt.group5.more', desc: 'opt.group5.moreDesc', sections: ['privacy', 'shortcuts', 'guide', 'diagnostics']},
];
const SECTION_GROUP = Object.fromEntries(GROUPS.flatMap(group => group.sections.map(section => [section, group])));
const TAB_LABELS = {assistance: 'opt.tab.assist'};
const groupTabs = html`<nav class="group-tabs" aria-label=${t('opt.settingsNav')}>
  ${GROUPS.filter(group => group.sections.length > 1).flatMap(group => group.sections.map(section => html`<a href="#${section}" class="group-tab" data-section=${section} data-tab-group=${group.id}>${t(TAB_LABELS[section] || LABELS[section])}</a>`))}
</nav>`;
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
  // 中等宽度（761–1023px）自动收成图标栏；此时手动展开只在本次窄屏内有效，不改写保存的偏好。
  #narrowQuery = matchMedia('(min-width: 761px) and (max-width: 1023px)');
  #narrowExpanded = false;
  #onNarrowChange = () => { this.#narrowExpanded = false; this.#applyCollapsed(); };
  #theme = localStorage.getItem('roamcat_ui_theme') || 'auto';

  #onHashChange = () => this.#applyRoute();
  #onClick = event => {
    const collapseBtn = event.target.closest('#sidebar-collapse-btn');
    if (collapseBtn) { this.#setCollapsed(!this.#isCollapsed()); return; }
    if (event.target.closest('#sidebar-brand-logo')) {
      if (this.#isCollapsed()) this.#setCollapsed(false);
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
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      const field = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (field && field.id !== 'sidebar-search') return;
      event.preventDefault();
      if (this.#isCollapsed()) this.#setCollapsed(false);
      const search = $('sidebar-search');
      search?.focus();
      search?.select();
      return;
    }
    const stampCard = event.target.closest('#sidebar-stamp-card');
    if (stampCard && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.#openStampModal();
    }
  };
  #onInput = event => {
    if (event.target?.id === 'sidebar-search') this.#filterNav(event.target.value);
  };
  #filterNav(raw) {
    const query = raw.trim().toLowerCase();
    let matches = 0;
    document.querySelectorAll('.sidebar-nav-menu .nav-group').forEach(group => {
      let visible = 0;
      group.querySelectorAll('.cyber-nav-item').forEach(item => {
        const text = item.querySelector('.nav-text')?.textContent || '';
        const show = !query || text.toLowerCase().includes(query);
        item.hidden = !show;
        if (show) visible += 1;
      });
      group.hidden = visible === 0;
      matches += visible;
    });
    const empty = $('sidebar-search-empty');
    if (empty) empty.hidden = !query || matches > 0;
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
        ${groupTabs}
        ${nowStatus}
        ${SECTIONS.map(name => SECTION_TEMPLATES[name])}
      </div>
    </main>
    ${shellDialog}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#applyTheme(this.#theme);
    this.#applyCollapsed();
    this.#narrowQuery.addEventListener('change', this.#onNarrowChange);
    window.addEventListener('hashchange', this.#onHashChange);
    document.addEventListener('click', this.#onClick);
    document.addEventListener('keydown', this.#onKeydown);
    document.addEventListener('input', this.#onInput);
    document.addEventListener('change', this.#onChange);
    const kbd = document.querySelector('.sidebar-search-kbd');
    if (kbd) kbd.textContent = /Mac|iPhone|iPad/u.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl+K';
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this.#onHashChange);
    this.#narrowQuery.removeEventListener('change', this.#onNarrowChange);
    document.removeEventListener('click', this.#onClick);
    document.removeEventListener('keydown', this.#onKeydown);
    document.removeEventListener('input', this.#onInput);
    document.removeEventListener('change', this.#onChange);
    super.disconnectedCallback();
  }

  async firstUpdated() {
    const version = chrome.runtime.getManifest?.().version;
    const tag = document.querySelector('.brand-pro-tag');
    if (tag && version) tag.textContent = `v${version}`;
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
    if (SECTION_ALIASES[raw]) return SECTION_ALIASES[raw][0];
    return SECTIONS.includes(raw) ? raw : 'assistance';
  }

  #applyRoute({initial = false} = {}) {
    const requested = location.hash.replace('#', '');
    const section = this.#requestedSection();
    if (requested !== section) history.replaceState(null, '', `#${section}`);
    const anchor = SECTION_ALIASES[requested]?.[1];
    if (anchor) setTimeout(() => $(anchor)?.scrollIntoView({block: 'start'}), 150);
    const previous = this.#section;
    if (section === previous && !initial) return;
    // 先同步记下目标分区：视图过渡的回调是异步的，连续切换时只渲染最后一次的目标。
    this.#section = section;
    const mutate = () => {
      const current = this.#section;
      for (const name of SECTIONS) { const el = $(name); if (el) el.hidden = name !== current; }
      this.#syncChrome(current);
      this.#resetScroll();
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!initial && typeof document.startViewTransition === 'function' && !reduced) {
      document.startViewTransition(mutate);
      // 过渡回调要等下一帧；后台或被遮挡的窗口可能迟迟不出帧，到点仍未切换就直接切（mutate 可重复执行）。
      setTimeout(() => { if ($(this.#section)?.hidden) mutate(); }, 120);
    } else {
      mutate();
    }
    if (!initial && previous) $('section-title')?.focus({preventScroll: true});
    this.#controller?.optionsSectionEnter(section, previous);
  }

  #syncChrome(section) {
    const group = SECTION_GROUP[section] || GROUPS[0];
    const tabLabel = t(TAB_LABELS[section] || LABELS[section]);
    // 页头写分组名和一行说明；面包屑是「分组 / 当前标签」，单分区分组只写分组名。
    setText('section-title', t(group.label));
    setText('hero-desc', t(group.desc));
    setText('toolbar-category-title', t(group.label));
    setText('toolbar-breadcrumb-title', group.sections.length > 1 ? tabLabel : t(group.label));
    document.querySelector('.toolbar-breadcrumb')?.toggleAttribute('data-single', group.sections.length < 2);
    document.body.dataset.group = group.id;
    document.title = `${t('common.brand')} · ${group.sections.length > 1 ? `${t(group.label)} · ${tabLabel}` : t(group.label)}`;
    document.querySelectorAll('[data-tab-group]').forEach(tab => { tab.hidden = tab.dataset.tabGroup !== group.id; });
    document.querySelectorAll('[data-section]').forEach(link => {
      const active = link.dataset.section === section;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-group]').forEach(link => {
      const active = link.dataset.group === group.id;
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

  #isCollapsed() {
    return this.#narrowQuery.matches ? !this.#narrowExpanded : this.#collapsed;
  }

  #setCollapsed(collapsed) {
    if (this.#narrowQuery.matches) this.#narrowExpanded = !collapsed;
    else {
      this.#collapsed = collapsed;
      localStorage.setItem('roamcat_sidebar_collapsed', String(collapsed));
    }
    this.#applyCollapsed();
  }

  #applyCollapsed() {
    const collapsed = this.#isCollapsed();
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
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
