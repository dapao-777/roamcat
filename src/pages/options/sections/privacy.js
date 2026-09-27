/**
 * @file src/pages/options/sections/privacy.js
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

export const privacySection = html`
<section id="privacy" class="settings-section data-section" aria-labelledby="privacy-heading" hidden="">
      <div class="section-intro"><h2 id="privacy-heading" class="sr-only">${t('sec.privacy.title')}</h2><p>${t('sec.privacy.desc')}</p></div>
      <p id="data-problem" class="notice error" role="alert" hidden=""></p>
      <div class="paper-card compact-settings-card form-stack">
        <div class="adaptive-setting"><div><b>${t('sec.privacy.remember')}</b><p>${t('sec.privacy.rememberDesc')}</p></div><label class="switch"><input id="remember-support" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.privacy.remember')}</span></label></div>
        <div class="data-actions"><button id="export-data" class="secondary-button" type="button">${t('sec.privacy.export')}</button></div><span id="data-result" class="inline-message" aria-live="polite"></span>
      </div>
      <div class="paper-card compact-settings-card history-data-actions"><div><b>${t('sec.privacy.dataTitle')}</b><p class="field-help">${t('sec.privacy.dataDesc')}</p></div><div class="data-actions"><button id="history-export" type="button">${t('sec.privacy.exportHistory')}</button><button id="history-clear" class="danger-button" type="button">${t('sec.privacy.clearHistory')}</button><span id="history-action-result" class="inline-message" aria-live="polite"></span></div><p class="field-help">${t('sec.privacy.clearNote')}</p></div>
      <details class="paper-card settings-disclosure"><summary>${t('sec.privacy.perms')}</summary><div><p class="field-help">${t('sec.privacy.permsDesc')}</p><button id="open-extension-manager" class="secondary-button" type="button">${t('sec.privacy.openMgr')}</button></div></details>
    <details class="paper-card settings-disclosure"><summary>${t('sec.privacy.clearAll')}</summary><div><p class="field-help">${t('sec.privacy.clearAllDesc')}</p><button id="clear-memory" class="danger-button" type="button">${t('sec.privacy.clearAll')}</button></div></details></section>
`;
