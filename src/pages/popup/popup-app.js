/**
 * @file src/pages/popup/popup-app.js
 * 文件职责：工具栏弹窗 Lit 应用——本页开关、自动开启、解构、双语翻译即时启动与服务告警。
 * 主要内容：逻辑与消息协议移植自 extension/ui/popup.js（PAGE_UI_INJECT、EMERGENCY、
 *   SENTENCE_GROUPS、AUTOMATION、STATE 系列与 SS_ 页内消息保持不变）；light DOM 渲染
 *   保留既有 id 级测试钩子；无确认面板，翻译立即开始；intent 焦点直调 emergencyStart。
 * 模块边界：扩展页受信上下文；仅经 request()/chrome.tabs.sendMessage 与后台、页面通信。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {LitElement, html} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {request} from '@ext/shared.js';
import {CATALOG_TEMPLATES} from '@ext/ui/options-service-catalog.js';
import {icon} from '../../components/icons.js';
import '../../components/rc-switch.js';
import {t} from '../../i18n-runtime.js';

const EMERGENCY_PHASES = new Set(['off', 'translating', 'waiting', 'complete', 'partial', 'stopped', 'error']);

function emergencySnapshot(value = {}) {
  const count = name => Number.isInteger(value[name]) && value[name] >= 0 ? value[name] : 0;
  return {
    active: Boolean(value.active),
    displayed: Boolean(value.displayed),
    phase: EMERGENCY_PHASES.has(value.phase) ? value.phase : 'off',
    total: count('total'), completed: count('completed'), failed: count('failed'),
    pending: count('pending'), skipped: count('skipped'),
    error: typeof value.error === 'string' ? value.error : '',
  };
}

const errorText = error => error instanceof Error ? error.message : String(error);

class RoamcatPopup extends LitElement {
  createRenderRoot() { return this; }

  #state = null;
  #automation = null;
  #tab = null;
  #enabled = false;
  #page = null;
  #sentenceGroups = {enabled: false, density: 'medium', status: 'off', error: '', processed: 0};
  #sentenceGroupsLoaded = false;
  #busy = false;
  #emergency = emergencySnapshot();
  #errors = {action: '', siteAuto: '', sentenceGroups: '', service: ''};
  #serviceMenuOpen = false;
  #emergencyResult = {text: '', error: false};
  #suggestionVisible = false;
  #watchTimer = 0;
  #onStorageChanged = (changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    void request('STATE_GET').then(state => { this.#state = state; this.requestUpdate(); }).catch(() => {});
  };

  get #supported() { return Boolean(this.#tab?.id && /^https?:\/\//iu.test(this.#tab.url || '')); }
  get #origin() { try { return this.#supported ? new URL(this.#tab.url).origin : ''; } catch { return ''; } }
  get #hostname() { try { return this.#supported ? new URL(this.#tab.url).hostname : t('pop.thisTab'); } catch { return t('pop.thisTab'); } }
  get #lookupKey() {
    const key = this.#state?.settings?.lookupKey;
    return typeof key === 'string' && /^[A-Z]$/u.test(key) ? key : 'D';
  }
  get #siteConfigured() { return Boolean(this.#automation?.siteRule ?? this.#automation?.automation?.allSites); }
  get #serviceProblem() {
    return this.#state?.providerError
      || (['chatgpt', 'grok', 'antigravity'].includes(this.#state?.settings?.providerKind) ? this.#state?.subscription?.error : '')
      || (!this.#state?.providerConfigured ? t('pop.noProvider') : '');
  }

  #onMenuDismiss = (e) => {
    if (!this.#serviceMenuOpen) return;
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'pointerdown' && e.composedPath().some(n => n?.id === 'service-menu' || n?.id === 'service-menu-toggle')) return;
    this.#serviceMenuOpen = false;
    if (e.type === 'keydown') this.querySelector('#service-menu-toggle')?.focus();
    this.requestUpdate();
  };

  connectedCallback() {
    super.connectedCallback();
    document.title = t('pop.brandTitle');
    chrome.storage.onChanged.addListener(this.#onStorageChanged);
    document.addEventListener('pointerdown', this.#onMenuDismiss);
    document.addEventListener('keydown', this.#onMenuDismiss);
    void this.#init().then(() => { this.#watchTimer = setTimeout(() => void this.#watchPage(), 1000); });
  }

  disconnectedCallback() {
    chrome.storage.onChanged.removeListener?.(this.#onStorageChanged);
    document.removeEventListener('pointerdown', this.#onMenuDismiss);
    document.removeEventListener('keydown', this.#onMenuDismiss);
    clearTimeout(this.#watchTimer);
    super.disconnectedCallback();
  }

  async #init() {
    try {
      [this.#tab] = await chrome.tabs.query({active: true, currentWindow: true});
      [this.#state, this.#automation] = await Promise.all([request('STATE_GET'), request('AUTOMATION_GET', {tabId: this.#tab?.id})]);
      try {
        await this.#getSentenceGroups();
      } catch (error) {
        this.#sentenceGroupsLoaded = false;
        this.#errors.sentenceGroups = t('pop.sgReadFail',{err:errorText(error)});
      }
      await this.#getPageStatus();
      this.requestUpdate();
      const intent = this.#supported ? await request('POPUP_INTENT_TAKE', {tabId: this.#tab.id, url: this.#tab.url}).catch(() => ({focus: false})) : {focus: false};
      if (intent?.focus) {
        if (this.#emergency.phase !== 'off') {
          await this.updateComplete;
          this.querySelector('#emergency-panel')?.focus();
        } else {
          void this.#emergencyStart();
        }
      }
      if (this.#state?.settings?.assistanceMode === 'ambient') {
        const suggestion = await request('ON_DEMAND_SUGGESTION');
        this.#suggestionVisible = Boolean(suggestion?.show);
      }
      this.requestUpdate();
    } catch (error) {
      this.#errors.action = errorText(error);
      this.requestUpdate();
    }
  }

  async #watchPage() {
    try {
      if (!this.#busy && (this.#enabled || this.#sentenceGroups.enabled || this.#emergency.phase !== 'off') && document.visibilityState === 'visible') {
        await this.#getPageStatus();
        this.requestUpdate();
      }
    } catch (error) {
      this.#errors.sentenceGroups = errorText(error);
      this.requestUpdate();
    } finally {
      if (this.isConnected) this.#watchTimer = setTimeout(() => void this.#watchPage(), 1000);
    }
  }

  async #getPageStatus() {
    if (!this.#supported) return;
    const snapshot = this.#sentenceGroups;
    const result = await chrome.tabs.sendMessage(this.#tab.id, {type: 'SS_STATUS'}, {frameId: 0}).catch(() => null);
    if (snapshot !== this.#sentenceGroups || !result?.ok) return;
    this.#enabled = Boolean(result.data?.enabled);
    this.#page = result.data;
    if (result.data?.sentenceGroups) this.#sentenceGroups = {...this.#sentenceGroups, ...result.data.sentenceGroups};
    if (result.data?.emergency) this.#emergency = emergencySnapshot(result.data.emergency);
  }

  async #getSentenceGroups() {
    const result = await request('SENTENCE_GROUPS_GET', {tabId: this.#tab?.id});
    const density = ['coarse', 'medium', 'fine'].includes(result?.density) ? result.density : 'medium';
    this.#sentenceGroups = {enabled: Boolean(result?.enabled), density, status: result?.enabled ? 'idle' : 'off', error: '', processed: 0};
    this.#sentenceGroupsLoaded = true;
  }

  async #toggleSite(event) {
    const control = event.target;
    const enabled = control.checked;
    if (!this.#supported || this.#busy || !this.#automation) return;
    this.#busy = true;
    this.#errors.siteAuto = '';
    this.requestUpdate();
    try {
      if (enabled && !await chrome.permissions.request({origins: [this.#origin + '/*']})) {
        throw new Error(t('pop.permSite'));
      }
      const sites = this.#automation.automation.sites.filter(site => site.origin !== this.#origin);
      sites.push({origin: this.#origin, enabled});
      this.#automation = await request('AUTOMATION_PATCH', {patch: {sites}, tabId: this.#tab.id});
      await this.#getPageStatus();
    } catch (error) {
      this.#errors.siteAuto = errorText(error);
      control.checked = this.#siteConfigured;
    } finally {
      this.#busy = false;
      this.requestUpdate();
    }
  }

  async #togglePage() {
    if (!this.#supported || this.#busy) return;
    this.#busy = true;
    this.#errors.action = '';
    this.requestUpdate();
    try {
      await request('PAGE_UI_INJECT', {tabId: this.#tab.id});
      const result = await chrome.tabs.sendMessage(this.#tab.id, {type: 'SS_SET_ENABLED', enabled: !this.#enabled});
      if (!result?.ok) throw new Error(result?.error || t('pop.refreshRetry'));
      this.#enabled = Boolean(result.data?.enabled);
      this.#automation = await request('AUTOMATION_GET', {tabId: this.#tab.id});
    } catch (error) {
      this.#errors.action = t('pop.actionFail',{err:errorText(error)});
    } finally {
      this.#busy = false;
      this.requestUpdate();
    }
  }

  async #toggleSentenceGroups(event) {
    const control = event.target;
    const enabled = control.checked;
    if (!this.#supported || this.#busy || !this.#sentenceGroupsLoaded) return;
    this.#busy = true;
    this.#errors.sentenceGroups = '';
    this.requestUpdate();
    try {
      await request('PAGE_UI_INJECT', {tabId: this.#tab.id});
      await request('SENTENCE_GROUPS_SET', {tabId: this.#tab.id, enabled});
      const result = await chrome.tabs.sendMessage(this.#tab.id, {type: 'SS_SET_SENTENCE_GROUPS', enabled}, {frameId: 0});
      if (!result?.ok) throw new Error(result?.error || t('pop.sgApplyFail'));
      this.#sentenceGroups = {...this.#sentenceGroups, ...result.data?.sentenceGroups};
      this.#enabled = Boolean(result.data?.enabled);
      this.#automation = await request('AUTOMATION_GET', {tabId: this.#tab.id});
    } catch (error) {
      try { await this.#getSentenceGroups(); } catch {}
      this.#errors.sentenceGroups = t('pop.sgUpdateFail',{err:errorText(error)});
      control.checked = this.#sentenceGroups.enabled;
    } finally {
      this.#busy = false;
      this.requestUpdate();
    }
  }

  async #chooseOnDemand() {
    try {
      this.#state = await request('STATE_PATCH', {patch: {assistanceMode: 'on-demand'}});
      this.#suggestionVisible = false;
      if (this.#supported) {
        const result = await chrome.tabs.sendMessage(this.#tab.id, {type: 'SS_REFRESH'}).catch(() => null);
        if (result?.ok) this.#enabled = Boolean(result.data.enabled);
      }
      this.requestUpdate();
    } catch (error) {
      this.#errors.action = errorText(error);
      this.requestUpdate();
    }
  }

  // 快捷切换模型服务：订阅通道（chatgpt/grok/antigravity）+ 已保存的 API 服务；
  // 切换即 STATE_PATCH，后台负责缓存失效与广播，密钥字段不进入渲染。
  get #serviceCurrent() {
    const settings = this.#state?.settings;
    if (!settings) return null;
    if (settings.providerKind === 'api') {
      const service = settings.apiServices?.find(value => value.id === settings.activeApiServiceId);
      if (!service) return null;
      const template = CATALOG_TEMPLATES.find(value => value.id === service.providerId);
      return {key: 'api:' + service.id, name: service.name, model: service.model, icon: template?.icon || 'custom-api'};
    }
    const template = CATALOG_TEMPLATES.find(value => value.id === settings.providerKind);
    if (!template) return null;
    return {key: settings.providerKind, name: template.name, model: settings.subscriptionModel || t('pop.defaultModel'), icon: template.icon};
  }

  get #serviceChoices() {
    const subscriptions = CATALOG_TEMPLATES.filter(value => value.category === 'subscription')
      .map(value => ({key: value.id, name: value.name, icon: value.icon, note: t('pop.subNote')}));
    const services = (this.#state?.settings?.apiServices || []).map(service => {
      const template = CATALOG_TEMPLATES.find(value => value.id === service.providerId);
      return {key: 'api:' + service.id, name: service.name, icon: template?.icon || 'custom-api', note: service.model};
    });
    return [...subscriptions, ...services];
  }

  async #pickService(key) {
    if (this.#busy || !this.#state) return;
    this.#serviceMenuOpen = false;
    if (key === this.#serviceCurrent?.key) { this.requestUpdate(); return; }
    this.#busy = true;
    this.#errors.service = '';
    this.requestUpdate();
    try {
      const patch = key.startsWith('api:') ? {providerKind: 'api', activeApiServiceId: key.slice(4)} : {providerKind: key};
      this.#state = await request('STATE_PATCH', {patch});
    } catch (error) {
      this.#errors.service = errorText(error);
    } finally {
      this.#busy = false;
      this.requestUpdate();
    }
  }

  #canResumeEmergency() { return !this.#emergency.active && this.#emergency.total > 0 && ['stopped', 'error'].includes(this.#emergency.phase); }

  async #emergencyStart(resume = false) {
    if (this.#busy || !this.#supported) return;
    if (!this.#state?.providerConfigured) {
      this.#emergencyResult = {text: t('pop.noProviderTranslate'), error: true};
      this.requestUpdate();
      await this.updateComplete;
      this.querySelector('#repair-service')?.focus();
      return;
    }
    resume = Boolean(resume) && this.#canResumeEmergency();
    this.#busy = true;
    this.#emergencyResult = {text: '', error: false};
    this.requestUpdate();
    let token;
    try {
      const current = await chrome.tabs.get(this.#tab.id);
      if (current.url !== this.#tab.url) throw new Error(t('pop.tabChanged'));
      await request('PAGE_UI_INJECT', {tabId: this.#tab.id});
      ({token} = await request('EMERGENCY_BEGIN', {tabId: this.#tab.id, url: this.#tab.url}));
      const result = await chrome.tabs.sendMessage(this.#tab.id, {type: 'SS_EMERGENCY_START', token, resume}, {frameId: 0});
      if (!result?.ok) throw new Error(result?.error || t('pop.startFail'));
      this.#emergency = emergencySnapshot(result.data?.emergency || {active: true, displayed: resume, phase: 'translating'});
      this.#emergencyResult = {text: resume ? t('pop.resumed') : t('pop.started'), error: false};
    } catch (error) {
      if (token) await request('EMERGENCY_END', {tabId: this.#tab.id, token}).catch(() => {});
      this.#emergencyResult = {text: errorText(error), error: true};
    } finally {
      this.#busy = false;
      this.requestUpdate();
      await this.updateComplete;
      this.#focusEmergency();
    }
  }

  async #emergencyAction(type) {
    if (this.#busy || !this.#supported) return;
    this.#busy = true;
    this.#emergencyResult = {text: '', error: false};
    this.requestUpdate();
    try {
      const result = await chrome.tabs.sendMessage(this.#tab.id, {type}, {frameId: 0});
      if (!result?.ok) throw new Error(result?.error || t('pop.opFail'));
      this.#emergency = emergencySnapshot(result.data?.emergency || {});
      this.#emergencyResult = {
        text: type === 'SS_EMERGENCY_STOP' ? t('pop.stopped')
          : type === 'SS_EMERGENCY_RETRY' ? (this.#emergency.phase === 'error' && this.#emergency.failed === 0 ? t('pop.continuing') : t('pop.retrying'))
          : t('pop.reverted'),
        error: false,
      };
    } catch (error) {
      this.#emergencyResult = {text: errorText(error), error: true};
    } finally {
      this.#busy = false;
      this.requestUpdate();
      await this.updateComplete;
      this.#focusEmergency();
    }
  }

  #focusEmergency() {
    const button = this.#emergency.active ? this.querySelector('#emergency-stop')
      : !this.querySelector('#emergency-resume')?.hidden ? this.querySelector('#emergency-resume')
      : this.#emergency.phase === 'off' ? this.querySelector('#emergency-open')
      : this.querySelector('#emergency-clear');
    if (button && !button.disabled) button.focus();
  }

  #emergencyPhaseText() {
    if (!this.#supported) return t('pop.phase.unsupported');
    if (!this.#state?.providerConfigured) return t('pop.phase.noProvider');
    const text = {
      translating: t('pop.phase.translating'),
      waiting: t('pop.phase.waiting'),
      complete: t('pop.phase.complete'),
      partial: t('pop.phase.partial'),
      stopped: t('pop.phase.stopped'),
      error: this.#emergency.error || t('pop.phase.error'),
    };
    return text[this.#emergency.phase] || t('pop.phase.idle');
  }

  #langName() {
    const pref = globalThis.RoamCatI18n?.pref?.() || 'auto';
    return t(`common.lang${pref === 'auto' ? 'Auto' : pref === 'zh' ? 'Zh' : 'En'}`);
  }

  #langShort() {
    const pref = globalThis.RoamCatI18n?.pref?.() || 'auto';
    return t(pref === 'auto' ? 'pop.langAuto' : pref === 'zh' ? 'pop.langZh' : 'pop.langEn');
  }

  #cycleUiLang() {
    const i18n = globalThis.RoamCatI18n;
    if (!i18n) return;
    const order = ['auto', 'zh', 'en'];
    i18n.setPref(order[(order.indexOf(i18n.pref()) + 1) % order.length]);
    this.requestUpdate();
  }

  #openOptions(section = '') {
    chrome.runtime.openOptionsPage(() => {
      if (section) chrome.tabs.query({url: chrome.runtime.getURL('ui/options.html*')}, tabs => {
        const tab = tabs.at(-1);
        if (tab?.id) chrome.tabs.update(tab.id, {url: chrome.runtime.getURL('ui/options.html#' + section)});
      });
    });
  }

  render() {
    const supported = this.#supported;
    const configured = this.#siteConfigured;
    const allSites = Boolean(this.#automation?.automation?.allSites);
    const serviceProblem = this.#serviceProblem;
    const serviceCurrent = this.#serviceCurrent;
    const serviceChoices = this.#serviceChoices;
    const serviceIconUrl = iconName => chrome.runtime.getURL(`icons/providers/${iconName || 'custom-api'}.svg`);
    const emergencyVisible = Boolean(this.#emergency.active || this.#emergency.displayed || this.#emergency.phase !== 'off');
    const resumable = this.#canResumeEmergency();
    const retryable = this.#emergency.active && (this.#emergency.failed > 0 || this.#emergency.phase === 'error');
    const emergencyPct = this.#emergency.total ? Math.min(100, Math.round(this.#emergency.completed / this.#emergency.total * 100)) : 0;

    let statusText = t('pop.status.idle');
    let toggleText = t('pop.toggle.on');
    let pageNote = t('pop.note.idle');
    if (!supported) {
      statusText = t('pop.status.unsupported'); toggleText = t('pop.toggle.unsupported'); pageNote = t('pop.note.unsupported');
    } else if (this.#enabled) {
      statusText = t('pop.status.on'); toggleText = t('pop.toggle.off');
      const page = this.#page;
      if (this.#state?.settings?.assistanceMode === 'on-demand') pageNote = t('pop.note.ondemand');
      else if (page?.noReadingRoot) pageNote = t('pop.note.noRoot');
      else if (page?.failed) pageNote = t('pop.note.failed');
      else if (page && !page.automaticReady) pageNote = t('pop.note.scanning');
      else if (page?.providerConfigured && page.count > 0) pageNote = t('pop.note.marked',{n:page.count});
      else if (page?.providerConfigured) pageNote = t('pop.note.none');
      else pageNote = t('pop.note.support');
    } else if (this.#automation?.paused) {
      statusText = t('pop.status.paused'); toggleText = t('pop.toggle.resume');
    }

    let siteAutoNote = configured ? t('pop.siteOn') : t('pop.siteOff');
    if (!supported) siteAutoNote = t('pop.siteUnsupported');
    else if (this.#automation?.paused && configured) siteAutoNote = t('pop.sitePaused');
    else if (allSites && this.#automation?.siteRule === false) siteAutoNote = t('pop.siteExcluded');
    else if (allSites) siteAutoNote = t('pop.siteAll');

    let sgNote = t('pop.sg.off');
    if (!supported) sgNote = t('pop.sg.unsupported');
    else if (!this.#state?.providerConfigured) {
      sgNote = this.#sentenceGroups.enabled ? t('pop.sg.noProvOn') : t('pop.sg.noProvOff');
    } else if (this.#sentenceGroups.status === 'queued') sgNote = t('pop.sg.queued');
    else if (this.#sentenceGroups.status === 'analyzing') sgNote = t('pop.sg.analyzing');
    else if (this.#sentenceGroups.status === 'error') sgNote = t('pop.sg.error');
    else if (this.#sentenceGroups.status === 'paused') sgNote = t('pop.sg.paused');
    else if (this.#sentenceGroups.enabled) {
      sgNote = this.#sentenceGroups.processed ? t('pop.sg.processed',{n:this.#sentenceGroups.processed}) : t('pop.sg.waiting');
    }

    return html`
  <main class="popup-shell" aria-labelledby="brand-title">
    <header class="popup-header">
      <div class="brand-lockup">
        <img class="brand-icon" src=${chrome.runtime.getURL('icons/roamcat.svg')} width="24" height="24" alt="RoamCat">
        <div class="brand-text-col">
          <span id="brand-title" class="popup-brand-name">ROAMCAT</span>
          <span class="popup-brand-badge">${t('pop.brand')}</span>
        </div>
      </div>
      <button id="lang-toggle-btn" class="popup-header-btn" type="button" title=${t('opt.langToggleTitle',{lang:this.#langName()})} @click=${() => this.#cycleUiLang()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4 10z"></path>
        </svg>
        <span>${this.#langShort()}</span>
      </button>
      <button id="open-options" class="popup-header-btn" type="button" title=${t('pop.openOptions')} @click=${() => this.#openOptions()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>${t('pop.options')}</span>
      </button>
    </header>

    <div class="popup-content-body rc-stagger">
      <section id="service-warning" class="popup-alert-card" ?hidden=${!serviceProblem}>
        <div class="popup-alert-icon">${icon('alert', {size: 18})}</div>
        <div class="popup-alert-info">
          <b>${t('pop.svcDown')}</b>
          <p id="service-warning-copy">${serviceProblem || ''}</p>
          <button id="repair-service" class="popup-btn-warning" type="button" @click=${() => this.#openOptions('service')}>${t('pop.svcFix')}</button>
        </div>
      </section>

      <section class="popup-card service-switch-panel" aria-labelledby="service-switch-title">
        <div class="feature-card-header">
          <div class="feature-card-title-wrap">
            <div class="feature-icon-badge service-provider-badge">
              ${serviceCurrent ? html`<img src=${serviceIconUrl(serviceCurrent.icon)} width="15" height="15" alt="" aria-hidden="true">` : icon('zap', {size: 15})}
            </div>
            <div>
              <h2 id="service-switch-title">${t('pop.svcTitle')}</h2>
              <p id="service-current-note" aria-live="polite">${serviceCurrent ? serviceCurrent.name + (serviceCurrent.model ? ' · ' + serviceCurrent.model : '') : t('pop.svcNone')}</p>
            </div>
          </div>
          <button id="service-menu-toggle" class="secondary-button popup-service-btn" type="button"
            aria-expanded=${this.#serviceMenuOpen ? 'true' : 'false'} aria-controls="service-menu"
            .disabled=${this.#busy || !this.#state}
            @click=${() => { this.#serviceMenuOpen = !this.#serviceMenuOpen; this.requestUpdate(); }}>${this.#serviceMenuOpen ? t('pop.svcCollapse') : t('pop.svcSwitch')}</button>
        </div>
        <div id="service-menu" class="service-menu" role="listbox" aria-label=${t('pop.svcMenuLabel')} ?hidden=${!this.#serviceMenuOpen}>
          ${serviceChoices.map(choice => html`
            <button type="button" role="option" aria-selected=${choice.key === serviceCurrent?.key ? 'true' : 'false'}
              class=${classMap({'service-menu-item': true, active: choice.key === serviceCurrent?.key})}
              .disabled=${this.#busy} @click=${() => void this.#pickService(choice.key)}>
              <img class="service-menu-icon" src=${serviceIconUrl(choice.icon)} width="15" height="15" alt="" aria-hidden="true">
              <span class="service-menu-name">${choice.name}</span>
              <span class="service-menu-note">${choice.note}</span>
              ${choice.key === serviceCurrent?.key ? html`<span class="service-menu-check">${icon('check', {size: 12})}</span>` : ''}
            </button>`)}
          <button type="button" class="service-menu-item service-menu-manage" @click=${() => this.#openOptions('service')}>
            ${icon('settings', {size: 14, cls: 'service-menu-gear'})}
            <span class="service-menu-name">${t('pop.svcManage')}</span>
            <span class="service-menu-note">${t('pop.options')}</span>
          </button>
        </div>
        <p id="service-switch-error" class="inline-message error" role="alert" ?hidden=${!this.#errors.service}>${this.#errors.service}</p>
      </section>

      <section class="popup-card activation-panel" aria-labelledby="activation-title">
        <div class="page-context">
          <div class="site-host-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" class="site-host-icon"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
            <span id="site-hostname">${this.#hostname}</span>
          </div>
          <span id="page-status" class=${classMap({'status-chip': true, active: this.#enabled})} aria-live="polite">${statusText}</span>
        </div>

        <div class="activation-control-row">
          <div class="activation-heading">
            <h2 id="activation-title">${t('pop.assistTitle')}</h2>
            <p id="page-note" class="muted">${pageNote}</p>
          </div>
          <button id="toggle-page" class="primary-action popup-master-btn" type="button" .disabled=${this.#busy || !supported} @click=${() => void this.#togglePage()}>
            <span id="toggle-label">${toggleText}</span>
          </button>
        </div>
        <p id="action-error" class="inline-message error" role="alert" ?hidden=${!this.#errors.action}>${this.#errors.action}</p>

        <div class="site-auto-panel">
          <div class="site-auto-copy">
            <h3 id="site-auto-title">${t('pop.siteAuto')}</h3>
            <p id="site-auto-note">${siteAutoNote}</p>
          </div>
          <rc-switch id="site-auto" .checked=${Boolean(supported && configured)} .disabled=${this.#busy || !supported || !this.#automation}
            label=${t('pop.siteAuto')} @change=${event => void this.#toggleSite(event)}></rc-switch>
        </div>
        <p id="site-auto-error" class="inline-message error" role="alert" ?hidden=${!this.#errors.siteAuto}>${this.#errors.siteAuto}</p>
      </section>

      <section class="popup-card sentence-groups-panel" aria-labelledby="sentence-groups-title">
        <div class="feature-card-header">
          <div class="feature-card-title-wrap">
            <div class="feature-icon-badge">${icon('layers', {size: 16})}</div>
            <div>
              <h2 id="sentence-groups-title">${t('pop.sgTitle')}</h2>
              <p id="sentence-groups-note" aria-live="polite">${sgNote}</p>
            </div>
          </div>
          <rc-switch id="sentence-groups" .checked=${Boolean(this.#sentenceGroupsLoaded && this.#sentenceGroups.enabled)}
            .disabled=${this.#busy || !supported || !this.#sentenceGroupsLoaded}
            describedby="sentence-groups-note sentence-structure-key sentence-groups-error"
            label=${t('pop.sgTitle')} @change=${event => void this.#toggleSentenceGroups(event)}></rc-switch>
        </div>
        <p id="sentence-structure-key" class="sentence-structure-key">${t('pop.sgKey')}</p>
        <p id="sentence-groups-error" class="inline-message error" role="alert" ?hidden=${!this.#errors.sentenceGroups}>${this.#errors.sentenceGroups}</p>
      </section>

      <section id="emergency-panel" class="popup-card emergency-panel" aria-labelledby="emergency-title" tabindex="-1">
        <div class="emergency-heading">
          <div class="feature-card-title-wrap">
            <div class="feature-icon-badge">${icon('languages', {size: 16})}</div>
            <div>
              <h2 id="emergency-title">${t('pop.emTitle')}</h2>
              <p id="emergency-status" aria-live="polite">${this.#emergencyPhaseText()}</p>
            </div>
          </div>
          <button id="emergency-open" class="secondary-button popup-emergency-btn" type="button"
            ?hidden=${emergencyVisible} .disabled=${this.#busy || !supported}
            @click=${() => void this.#emergencyStart()}>${t('pop.emStart')}</button>
        </div>

        <div id="emergency-progress" class="emergency-progress" ?hidden=${!emergencyVisible}>
          <strong id="emergency-progress-copy">${t('pop.emProgress',{done:this.#emergency.completed,total:this.#emergency.total})}</strong>
          <div id="emergency-progress-bar" class="emergency-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${emergencyPct} aria-labelledby="emergency-progress-copy">
            <span id="emergency-progress-fill" class="emergency-progress-fill" style=${styleMap({width: emergencyPct + '%'})}></span>
          </div>
          <span id="emergency-counts">${t('pop.emCounts',{pending:this.#emergency.pending,failed:this.#emergency.failed,skipped:this.#emergency.skipped})}</span>
        </div>

        <div id="emergency-actions" class="provider-actions" role="group" aria-label=${t('pop.emGroup')} ?hidden=${!emergencyVisible}>
          <button id="emergency-stop" class="secondary-button" type="button" ?hidden=${!this.#emergency.active}
            .disabled=${this.#busy || !this.#emergency.active} @click=${() => void this.#emergencyAction('SS_EMERGENCY_STOP')}>${t('pop.emStop')}</button>
          <button id="emergency-resume" class="primary-action" type="button" ?hidden=${!resumable}
            .disabled=${this.#busy || !resumable} @click=${() => void this.#emergencyStart(true)}>${t('pop.emResume')}</button>
          <button id="emergency-retry" class="secondary-button" type="button" ?hidden=${!retryable}
            .disabled=${this.#busy || !retryable} @click=${() => void this.#emergencyAction('SS_EMERGENCY_RETRY')}>${this.#emergency.phase === 'error' && this.#emergency.failed === 0 ? t('pop.emContinue') : t('pop.emRetry')}</button>
          <button id="emergency-clear" class="icon-text-button emergency-clear-btn" type="button"
            .disabled=${this.#busy || !emergencyVisible} @click=${() => void this.#emergencyAction('SS_EMERGENCY_END')}>${t('pop.emEnd')}</button>
        </div>
        <p id="emergency-result" class=${classMap({'inline-message': true, error: this.#emergencyResult.error})} role="status" aria-live="polite" ?hidden=${!this.#emergencyResult.text}>${this.#emergencyResult.text}</p>
      </section>

      <section id="on-demand-suggestion" class="popup-card suggestion-panel" ?hidden=${!this.#suggestionVisible}>
        <b>${t('pop.quietTitle')}</b>
        <p>${t('pop.quietBodyA')} <span data-lookup-key>${this.#lookupKey}</span> ${t('pop.quietBodyB')}</p>
        <button id="choose-on-demand" class="secondary-button" type="button" @click=${() => void this.#chooseOnDemand()}>${t('pop.quietBtn')}</button>
      </section>
    </div>

    <footer class="popup-footer">
      <div class="popup-footer-hint">
        <span class="popup-footer-dot"></span>
        <span>${t('pop.footerA')} <kbd class="popup-keycap" data-lookup-key>${this.#lookupKey}</kbd> ${t('pop.footerB')}</span>
      </div>
      <span class="popup-footer-ver">v${chrome.runtime.getManifest?.().version ?? '0.0.1'}</span>
    </footer>
  </main>`;
  }
}

customElements.define('roamcat-popup', RoamcatPopup);
