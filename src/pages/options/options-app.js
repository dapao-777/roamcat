/**
 * @file src/pages/options/options-app.js
 * 文件职责：设置页 Lit 应用壳——11 分区 hash 路由（含 view transitions）、
 *   侧栏折叠、主题切换、宣言弹层、密码可见性切换、选择卡高亮委托。
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
import {shellTop, mainToolbar, heroBlock, telemetryFooter, shellDialog} from './shell.js';
import {
  assistanceSection, appearanceSection, sitesSection, advancedSection,
  termsSection, personalizationSection, historySection, privacySection,
  serviceSection, diagnosticsSection, guideSection,
} from './sections/index.js';

const SECTIONS = ['assistance', 'appearance', 'sites', 'advanced', 'terms', 'personalization', 'history', 'privacy', 'service', 'diagnostics', 'guide'];
const SECTION_TEMPLATES = {
  assistance: assistanceSection, appearance: appearanceSection, sites: sitesSection,
  advanced: advancedSection, terms: termsSection, personalization: personalizationSection,
  history: historySection, privacy: privacySection, service: serviceSection,
  diagnostics: diagnosticsSection, guide: guideSection,
};
const LABELS = {
  assistance: '阅读偏好', appearance: '显示与解构', sites: '网站规则', advanced: '领域识别',
  terms: '生词记忆矩阵', personalization: '已认识词与自适应', history: '阅读记录',
  privacy: '数据与隐私', service: '模型服务', diagnostics: '运行诊断', guide: '快捷键与使用手册',
};
const SECTION_META = {
  assistance: {title: '阅读偏好设置', category: '阅读设置', stage: '按你的节奏阅读', desc: '少一点打断，多一点理解。选择适合你的提示方式，留住阅读的节奏。'},
  appearance: {title: '显示与解构', category: '阅读设置', stage: '视觉定制', desc: '设定原词标注、顶部词注、句子解构及译文的呈现样式与视觉层级。'},
  sites: {title: '网站规则', category: '阅读设置', stage: '网站策略', desc: '决定下次访问时是否自动开启。暂停本页不会修改这里的规则。'},
  advanced: {title: '领域识别', category: '阅读设置', stage: '领域识别', desc: '智能识别学术、技术、商业等专业领域，为生词匹配最契合的语境。'},
  terms: {title: '生词记忆矩阵', category: '词汇与记忆', stage: '生词记忆', desc: '保存你希望沿用的参考译法与生词本，按领域建立个性化词汇资产。'},
  personalization: {title: '已认识词与自适应', category: '词汇与记忆', stage: '自适应调整', desc: '管理已认识词汇与自适应渐退节奏，避免熟悉词反复打扰，不进行任何用户画像。'},
  history: {title: '阅读记录', category: '词汇与记忆', stage: '阅读积累', desc: '安全留存查词上下文与阅读轨迹，完全储存在本机，不包含整篇正文。'},
  privacy: {title: '数据与隐私', category: '词汇与记忆', stage: '数据与隐私', desc: '个人词档案只保存在本机，不含原句或来源网址。支持一键导出、清理与权限管理。'},
  service: {title: '模型服务', category: '服务与诊断', stage: '模型与连接', desc: '配置 Codex 订阅或第三方 AI 模型接口，驱动高质量上下文理解与重组。'},
  diagnostics: {title: '运行诊断', category: '服务与诊断', stage: '运行状态', desc: '查看运行异常并导出排查信息。诊断只保存在本机，不包含原文或密钥。'},
  guide: {title: '快捷键与使用手册', category: '帮助与说明', stage: '使用手册', desc: '从你读不顺的地方开始，不必先记住一套功能名。掌握解构、词注与母语脱敏流。'},
};
const BREADCRUMBS = {
  assistance: ['阅读设置', '阅读偏好'], appearance: ['阅读设置', '显示与解构'],
  sites: ['阅读设置', '网站规则'], advanced: ['阅读设置', '领域识别'],
  terms: ['词汇与记忆', '生词记忆'], personalization: ['词汇与记忆', '自适应偏好'],
  history: ['词汇与记忆', '阅读记录'], privacy: ['词汇与记忆', '数据与隐私'],
  service: ['服务与诊断', '模型服务'], diagnostics: ['服务与诊断', '运行诊断'],
  guide: ['帮助与说明', '使用手册'],
};
const THEMES = ['auto', 'dark', 'light'];
const THEME_LABELS = {auto: '跟随系统', dark: '深色模式', light: '浅色模式'};
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
    setText('section-title', meta.title);
    setText('hero-category-badge', meta.category);
    setText('hero-stage-badge', meta.stage);
    setText('hero-desc', meta.desc);
    const [category, code] = BREADCRUMBS[section] || ['设置', '偏好'];
    setText('toolbar-category-title', category);
    setText('toolbar-breadcrumb-title', code);
    const readout = document.querySelector('.hero-right-card.reading-readout');
    if (readout) readout.hidden = section !== 'assistance';
    document.title = `RoamCat · 随心阅 · ${LABELS[section]}`;
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
    setText('theme-toggle-label', THEME_LABELS[theme] || theme);
    const svgEl = $('theme-icon-svg');
    if (svgEl && THEME_ICONS[theme]) svgEl.innerHTML = THEME_ICONS[theme];
    const btn = $('theme-toggle-btn');
    if (btn) btn.title = `当前主题: ${THEME_LABELS[theme]} (点击切换)`;
  }

  #cycleTheme() {
    this.#applyTheme(THEMES[(THEMES.indexOf(this.#theme) + 1) % THEMES.length]);
  }

  #setCollapsed(collapsed, {silent = false} = {}) {
    this.#collapsed = collapsed;
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (!silent) localStorage.setItem('roamcat_sidebar_collapsed', String(collapsed));
    else localStorage.setItem('roamcat_sidebar_collapsed', String(collapsed));
    const btn = $('sidebar-collapse-btn');
    if (btn) {
      const title = collapsed ? '展开侧边栏' : '折叠侧边栏';
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
  }

  #togglePassword(btn) {
    const targetId = btn.dataset.toggleTarget;
    const input = targetId ? $(targetId) : btn.parentElement?.querySelector('input');
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const show = btn.querySelector('.eye-show');
    const hide = btn.querySelector('.eye-hide');
    if (show) show.hidden = isPassword;
    if (hide) hide.hidden = !isPassword;
    btn.title = isPassword ? '隐藏密钥' : '显示密钥';
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
