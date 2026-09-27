/**
 * @file src/pages/options/sections/service.js
 * 文件职责：设置页静态分区模板——由 build/split-options.mjs 从
 *   extension/ui/options.html 机械切片生成；id/控件契约与原页完全一致。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 命令式填充），
 *   分区可见性由 options-app 统一驱动。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';

export const serviceSection = html`
<section id="service" class="settings-section" aria-labelledby="service-heading" hidden="">
      <div class="section-intro">
<h2 id="service-heading" class="sr-only">${t('sec.svc.title')}</h2>
<p>${t('sec.svc.desc')}</p>
</div>
      <!-- 兼容保留底层服务单选单态，保持核心逻辑与测试用例透明兼容 -->
      <fieldset class="provider-picker" style="display: none !important;">
        <legend>${t('sec.svc.source')}</legend>
        <div class="choice-cards three provider-choices">
          <label><input type="radio" name="provider-kind" value="chatgpt"></label>
          <label><input type="radio" name="provider-kind" value="grok"></label>
          <label><input type="radio" name="provider-kind" value="antigravity"></label>
          <label><input type="radio" name="provider-kind" value="api"></label>
        </div>
      </fieldset>

      <!-- FluentRead 风格 Service Catalog 双栏工作区 -->
      <div class="service-catalog-workspace">
        <div class="catalog-layout">
          <!-- 左栏：Service Rail 服务目录导航 -->
          <aside class="service-rail" aria-label="${t('sec.svc.catalog')}">
            <div class="rail-heading">
              <div>
                <strong>${t('sec.svc.title')}</strong>
                <span class="service-count" id="catalog-service-count">33</span>
              </div>
              <button type="button" class="service-add-button" id="catalog-add-btn" title="${t('sec.svc.addCustom')}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>${t('sec.svc.custom')}</span>
              </button>
            </div>

            <label class="catalog-search" for="catalog-search-input">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
              <input type="search" id="catalog-search-input" placeholder="${t('sec.svc.search')}" autocomplete="off">
            </label>

            <div class="service-groups" id="catalog-directory-list">
              <!-- 服务列表由 options-service-catalog.js 渲染 -->
            </div>
          </aside>

          <!-- 右栏：Service Detail 服务配置详情面板 -->
          <section class="service-detail" aria-label="${t('sec.svc.detailAria')}">
            <div class="detail-hero">
              <div class="detail-hero-left">
                <div class="detail-hero-icon-box" id="catalog-hero-icon">
                  <img class="detail-hero-icon" src="../icons/providers/openai.svg" alt="" width="30" height="30">
                </div>
                <div class="detail-heading">
                  <div class="detail-title-row">
                    <h4 id="catalog-hero-title">${t('sec.svc.subName')}</h4>
                    <span class="catalog-active-badge" id="catalog-hero-active-badge">${t('sec.svc.currentDefault')}</span>
                    <button type="button" class="catalog-set-default-btn" id="catalog-hero-set-default" hidden>${t('sec.svc.setDefault')}</button>
                    <a id="catalog-hero-website" class="service-website-link" href="#" target="_blank" rel="noopener noreferrer" hidden>
                      <span>${t('sec.svc.getKey')}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>
                    </a>
                  </div>
                  <p id="catalog-hero-desc" class="catalog-hero-desc">${t('sec.svc.heroDesc')}</p>
                </div>
              </div>
              <div class="hero-connection-action">
                <button type="button" class="catalog-check-btn" id="catalog-check-conn-btn">
                  <svg class="check-spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
                  <span id="catalog-check-btn-label">${t('sec.svc.checkConn')}</span>
                </button>
              </div>
            </div>

            <div class="detail-content-body">
              <div id="subscription-panel" class="provider-panel">
<div class="paper-card subscription-card">
<div class="subscription-summary">
<div>
<span id="subscription-dot" class="connection-dot" aria-hidden="true">
</span>
<b id="subscription-state">${t('sec.svc.checking')}</b>
<p id="subscription-detail">
</p>
</div>
<button id="refresh-subscription" class="secondary-button" type="button">${t('sec.svc.refresh')}</button>
</div>
<dl id="subscription-account" class="account-details" hidden="">
<div>
<dt>${t('sec.svc.account')}</dt>
<dd id="subscription-email">—</dd>
</div>
<div>
<dt>${t('sec.svc.plan')}</dt>
<dd id="subscription-plan">—</dd>
</div>
</dl>
<label class="field" id="subscription-model-field">
<span>${t('sec.svc.assistModel')}</span>
<select id="subscription-model">
</select>
<small id="subscription-model-note">
</small>
</label>
<div class="provider-actions">
<button id="login-subscription" class="primary-action narrow" type="button">${t('sec.svc.login')}</button>
<button id="cancel-subscription" class="secondary-button" type="button" hidden="">${t('sec.svc.cancelLogin')}</button>
<button id="logout-subscription" class="danger-button" type="button" hidden="">${t('sec.svc.logout')}</button>
<button id="test-subscription" class="secondary-button" type="button">${t('sec.svc.testPrompt')}</button>
<span id="subscription-result" class="inline-message" aria-live="polite">
</span>
</div>
<p id="subscription-user-code" class="field-help" hidden=""></p>
</div>
<details id="connector-install" class="installation-note">
<summary>${t('sec.svc.connector')}</summary>
<p id="install-prereq">${t('sec.svc.prereq')}</p>
<div class="copy-command">
<code id="install-command">
</code>
<button id="copy-install-command" class="secondary-button" type="button">${t('sec.svc.copy')}</button>
</div>
<p id="install-note">${t('sec.svc.installNote')}</p>
</details>
</div>
      <div id="api-panel" class="provider-panel" hidden="">
        <div class="paper-card form-stack api-service-card">
          <div class="service-selection">
<label class="field">
<span>${t('sec.svc.savedApis')}</span>
<select id="api-service-select">
</select>
</label>
<button id="new-api-service" class="secondary-button" type="button">${t('sec.svc.newService')}</button>
</div>
          <p class="field-help">${t('sec.svc.isoNote')}</p>
          <div class="provider-actions">
<button id="test-provider" class="secondary-button" type="button">${t('sec.svc.testCurrent')}</button>
</div>
<details id="api-editor" class="service-editor">
<summary>${t('sec.svc.editConfig')}</summary>
<form id="provider-form" class="form-stack">
            <div class="form-grid">
<div class="field">
<label id="provider-label" for="provider-trigger">${t('sec.svc.provider')}</label>
<div class="provider-select">
<select id="provider-id" required="" hidden="">
</select>
<button id="provider-trigger" class="provider-select-trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="provider-options" aria-labelledby="provider-label provider-current-name">
<img class="provider-logo" width="24" height="24" alt="">
<span id="provider-current-name">
</span>
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
<path d="m5 7.5 5 5 5-5">
</path>
</svg>
</button>
<div id="provider-options" class="provider-options" role="listbox" aria-labelledby="provider-label" popover="auto">
</div>
</div>
</div>
<label class="field">
<span>${t('sec.svc.name')}</span>
<input id="provider-name" maxlength="60" required="" autocomplete="off">
</label>
</div>
            <label class="field">
<span>${t('sec.svc.apiKey')} <a id="provider-key-link" class="field-link" href="#" target="_blank" rel="noreferrer" hidden="">${t('sec.svc.getKeyLink')}</a>
</span>
<div class="password-input-wrap">
  <textarea id="provider-key" class="key-pool-input" rows="3" autocomplete="off" spellcheck="false"></textarea>
  <button type="button" class="toggle-password-btn" data-toggle-target="provider-key" title="${t('sec.svc.toggleKey')}" aria-label="${t('sec.svc.toggleKey')}">
    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
  </button>
</div>
<small id="key-state">
</small>
<small class="field-help">${t('sec.svc.keysHint')}</small>
</label>
            <div id="provider-fields" class="form-grid provider-fields">
</div>
            <div class="model-field">
<label class="field">
<span>${t('sec.svc.model')}</span>
<div class="model-picker">
<select id="provider-model-list" aria-label="${t('sec.svc.modelListAria')}">
<option value="">${t('sec.svc.modelEmpty')}</option>
</select>
<button id="list-provider-models" class="secondary-button" type="button">${t('sec.svc.listModels')}</button>
</div>
<small id="provider-model-note">${t('sec.svc.modelNote')}</small>
</label>
<label class="field">
<span>${t('sec.svc.modelId')}</span>
<input id="provider-model" required="" autocomplete="off" spellcheck="false">
</label>
</div>
            <details class="inline-disclosure">
<summary>${t('sec.svc.advanced')}</summary>
<div class="disclosure-content">
<label class="field">
<span>${t('sec.svc.baseUrl')}</span>
<input id="provider-url" type="url" required="" spellcheck="false">
<small>${t('sec.svc.baseUrlNote')}</small>
</label>
<label class="field">
<span>${t('sec.svc.concurrency')}</span>
<input id="provider-concurrency" type="number" min="1" max="10" step="1" value="2" required="">
<small>${t('sec.svc.concurrencyNote')}</small>
</label>
</div>
</details>
            <div class="provider-actions">
<button class="primary-action narrow" type="submit">${t('sec.svc.saveUse')}</button>
<button id="cancel-api-service" class="secondary-button" type="button" hidden="">${t('sec.svc.cancelNew')}</button>
</div>
            
          <details class="inline-disclosure">
<summary>${t('sec.svc.remove')}</summary>
<div class="provider-actions">
<button id="disconnect-provider" class="danger-button" type="button">${t('sec.svc.clearKey')}</button>
<button id="delete-api-service" class="danger-button" type="button">${t('sec.svc.delete')}</button>
</div>
</details>
</form>
</details>
<p id="provider-result" class="inline-message" aria-live="polite">
</p>
          <fieldset id="api-routing" class="task-routing" hidden="">
<legend>${t('sec.svc.routing')}</legend>
<p class="field-help">${t('sec.svc.routingNote')}</p>
<label class="field route-row">
<span>${t('sec.svc.routeAssist')}</span>
<select id="route-assist"></select>
</label>
<label class="field route-row">
<span>${t('sec.svc.routeSupport')}</span>
<select id="route-support"></select>
</label>
<label class="field route-row">
<span>${t('sec.svc.routeGroups')}</span>
<select id="route-groups"></select>
</label>
<label class="field route-row">
<span>${t('sec.svc.routeTranslate')}</span>
<select id="route-translate"></select>
</label>
<label class="field route-row">
<span>${t('sec.svc.routeSummary')}</span>
<select id="route-summary"></select>
</label>
          </fieldset>
          <fieldset class="task-routing usage-stats">
<legend>${t('sec.svc.usageTitle')}</legend>
<p class="field-help">${t('sec.svc.usageNote')}</p>
<div id="usage-stats-totals" class="usage-totals"></div>
<p id="usage-stats-empty" class="field-help" hidden="">${t('sec.svc.usageEmpty')}</p>
<div id="usage-stats-wrap" class="usage-table-wrap" hidden="">
<table class="usage-table">
<thead><tr><th>${t('sec.svc.usageColService')}</th><th>${t('sec.svc.usageColModel')}</th><th>${t('sec.svc.usageColRequests')}</th><th>${t('sec.svc.usageColIn')}</th><th>${t('sec.svc.usageColOut')}</th><th>${t('sec.svc.usageColFail')}</th></tr></thead>
<tbody id="usage-stats-body"></tbody>
</table>
</div>
<div class="provider-actions">
<button id="usage-stats-refresh" class="secondary-button" type="button">${t('sec.svc.usageRefresh')}</button>
<button id="usage-stats-clear" class="danger-button" type="button">${t('sec.svc.usageClear')}</button>
</div>
<p id="usage-stats-result" class="inline-message" aria-live="polite"></p>
          </fieldset>
        </div>
      </div>
      <aside class="privacy-note">
<b>${t('sec.svc.sentWhat')}</b>
<p>${t('sec.svc.sentDesc')}</p>
<details class="calculation-note">
<summary>${t('sec.svc.bilingualScope')}</summary>
<p>${t('sec.svc.bilingualDesc')}</p>
</details>
</aside>
            </div> <!-- /.detail-content-body -->
          </section> <!-- /.service-detail -->
        </div> <!-- /.catalog-layout -->
      </div> <!-- /.service-catalog-workspace -->
    </section>

`;
