/**
 * @file src/pages/options/sections/personalization.js
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

export const personalizationSection = html`
<section id="personalization" class="settings-section personalization-section" aria-labelledby="personalization-heading" hidden="">
      <div class="section-intro"><h2 id="personalization-heading" class="sr-only">${t('sec.perso.title')}</h2><p>${t('sec.perso.desc')}</p></div><p id="personalization-problem" class="notice error" role="alert" hidden=""></p><span id="personalization-result" class="inline-message" aria-live="polite"></span>
      <div class="section-tabs" role="tablist" aria-label="${t('sec.perso.tabs')}"><button id="personalization-preferences-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-preferences" aria-controls="personalization-preferences" aria-selected="true">${t('sec.perso.tabPrefs')}</button><button id="personalization-known-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-known" aria-controls="personalization-known" aria-selected="false" tabindex="-1">${t('sec.perso.tabKnown')}</button><button id="personalization-adjustments-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-adjustments" aria-controls="personalization-adjustments" aria-selected="false" tabindex="-1">${t('sec.perso.tabAdj')}</button></div>
      <div id="personalization-preferences" class="section-tab-panel section-tab-stack" role="tabpanel" aria-labelledby="personalization-preferences-tab"><div class="paper-card form-stack compact-settings-card">
        <div class="adaptive-setting"><div><b>${t('sec.perso.enabled')}</b><p>${t('sec.perso.enabledDesc')}</p></div><label class="switch"><input id="personalization-enabled" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.perso.enabled')}</span></label></div>
        <div class="adaptive-setting"><div><b>${t('sec.perso.autoApply')}</b><p>${t('sec.perso.autoApplyDesc')}</p></div><label class="switch"><input id="personalization-auto-apply" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.perso.autoApply')}</span></label></div>
        <div class="personalization-service"><span>${t('sec.perso.service')}</span><b id="personalization-service-label">${t('sec.perso.notConnected')}</b></div>
        <div class="provider-actions"><button id="personalization-analyze" class="primary-action" type="button">${t('sec.perso.analyze')}</button><button id="personalization-reset" class="danger-button" type="button">${t('sec.perso.reset')}</button></div>
        <details class="calculation-note"><summary>${t('sec.perso.scope')}</summary><p>${t('sec.perso.scopeDesc')}</p></details>
      </div><div id="personalization-status" class="paper-card personalization-status"></div><div id="personalization-pending" class="paper-card personalization-pending" hidden=""></div></div>
      <div id="personalization-known" class="section-tab-panel" role="tabpanel" aria-labelledby="personalization-known-tab" hidden=""><div id="history-known-words" class="paper-card known-words-card" tabindex="-1"><div><b>${t('sec.perso.known')}</b><p class="field-help">${t('sec.perso.knownDesc')}</p></div><div id="known-word-list" class="known-word-list" aria-live="polite"></div><p id="known-word-empty" class="empty-state">${t('sec.perso.knownEmpty')}</p><p id="known-word-result" class="inline-message" aria-live="polite"></p></div></div>
      <div id="personalization-adjustments" class="section-tab-panel section-tab-stack" role="tabpanel" aria-labelledby="personalization-adjustments-tab" hidden=""><div class="paper-card personalization-overrides"><div><b>${t('sec.perso.overrides')}</b><p class="field-help">${t('sec.perso.overridesDesc')}</p></div><div id="personalization-override-list" class="override-list"></div><p id="personalization-overrides-empty" class="empty-state">${t('sec.perso.overridesEmpty')}</p></div><details class="paper-card settings-disclosure personalization-versions"><summary>${t('sec.perso.versions')}</summary><div><div id="personalization-version-list" class="version-list"></div><p id="personalization-versions-empty" class="empty-state">${t('sec.perso.versionsEmpty')}</p></div></details></div>
    </section>
`;
