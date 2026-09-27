/**
 * @file src/pages/options/sections/advanced.js
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

export const advancedSection = html`
<section id="advanced" class="settings-section" aria-labelledby="advanced-heading" hidden="">
<div class="section-intro">
<h2 id="advanced-heading" class="sr-only">${t('sec.adv.title')}</h2>
<p>${t('sec.adv.desc')}</p>
</div>
<div class="paper-card form-stack">
          <fieldset>
<legend>${t('sec.adv.mode')}</legend>
<div class="choice-cards three recognition-choices">
            <label>
<input type="radio" name="domain-detection-mode" value="local">
<span>
<b>${t('sec.adv.local')}</b>
<small>${t('sec.adv.localDesc')}</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="chatgpt">
<span>
<b>${t('sec.adv.chatgpt')}</b>
<small>${t('sec.adv.enhancedDesc')}</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="grok">
<span>
<b>${t('sec.adv.grok')}</b>
<small>${t('sec.adv.enhancedDesc')}</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="antigravity">
<span>
<b>${t('sec.adv.google')}</b>
<small>${t('sec.adv.enhancedDesc')}</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="api">
<span>
<b>${t('sec.adv.api')}</b>
<small>${t('sec.adv.apiDesc')}</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="jev">
<span>
<b>${t('sec.adv.jev')}</b>
<small>${t('sec.adv.jevDesc')}</small>
</span>
</label>
          </div>
</fieldset>
          <div id="detection-chatgpt" hidden="">
<label class="field">
<span>${t('sec.adv.model')}</span>
<select id="detection-subscription-model">
</select>
</label>
</div>
          <div id="detection-api" class="form-stack" hidden="">
<label class="check-row">
<input id="detection-use-translation-api" type="checkbox">
<span>
<b>${t('sec.adv.reuse')}</b>
<small>${t('sec.adv.reuseDesc')}</small>
</span>
</label>
<label class="field">
<span>${t('sec.adv.model')}</span>
<input id="detection-api-model" autocomplete="off">
</label>
<div id="detection-api-fields" class="form-grid">
<label class="field">
<span>${t('sec.adv.baseUrl')}</span>
<input id="detection-api-url" type="url">
</label>
<label class="field">
<span>${t('sec.adv.apiKey')}</span>
<div class="password-input-wrap">
  <input id="detection-api-key" type="password" autocomplete="new-password">
  <button type="button" class="toggle-password-btn" data-toggle-target="detection-api-key" title="${t('sec.adv.toggleKey')}" aria-label="${t('sec.adv.toggleKey')}">
    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
  </button>
</div>
<small id="detection-key-state">
</small>
</label>
</div>
<button id="clear-detection-key" class="danger-button narrow" type="button">${t('sec.adv.clearKey')}</button>
</div>
          <div id="detection-jev" class="form-stack" hidden="">
            <label class="field">
              <span>${t('sec.adv.jevModel')}</span>
              <input id="detection-jev-model" autocomplete="off" placeholder="typesafe/jev-1.13.0">
            </label>
            <div id="detection-jev-fields" class="form-grid">
              <label class="field">
                <span>${t('sec.adv.jevUrl')}</span>
                <input id="detection-jev-url" type="url" placeholder="https://router.requesty.ai/v1">
              </label>
              <label class="field">
                <span>${t('sec.adv.jevKey')} <a class="field-link" href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">TypeSafe</a> · <a class="field-link" href="https://app.requesty.ai" target="_blank" rel="noreferrer">Requesty</a></span>
                <div class="password-input-wrap">
                  <input id="detection-jev-key" type="password" autocomplete="new-password">
                  <button type="button" class="toggle-password-btn" data-toggle-target="detection-jev-key" title="${t('sec.adv.toggleKey')}" aria-label="${t('sec.adv.toggleKey')}">
                    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  </button>
                </div>
                <small id="detection-jev-key-state"></small>
              </label>
            </div>
            <button id="clear-detection-jev-key" class="danger-button narrow" type="button">${t('sec.adv.clearJevKey')}</button>
          </div>
          <div class="provider-actions">
<button id="save-recognition" class="primary-action narrow" type="button">${t('sec.adv.save')}</button>
</div>
          <details class="inline-disclosure">
<summary>${t('sec.adv.test')}</summary>
<div class="domain-test">
<label class="field">
<span>${t('sec.adv.testInput')}</span>
<textarea id="domain-test-text" rows="3" maxlength="6000">
</textarea>
</label>
<div class="provider-actions">
<button id="run-domain-test" class="secondary-button" type="button">${t('sec.adv.testBtn')}</button>
<span id="domain-test-result" class="inline-message" aria-live="polite">
</span>
</div>
</div>
</details>
          
          
        </div>
</section>

`;
