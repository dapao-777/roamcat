/**
 * @file src/pages/options/sections/diagnostics.js
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

export const diagnosticsSection = html`
<section id="diagnostics" class="settings-section diagnostics-section" aria-labelledby="diagnostics-heading" hidden="">
      <div class="section-intro">
<h2 id="diagnostics-heading" class="sr-only">${t('sec.diag.title')}</h2>
<p>${t('sec.diag.desc')}</p>
</div>
      <p id="diagnostics-storage-error" class="notice error" role="alert" hidden="">${t('sec.diag.storageError')}</p>
      <div class="paper-card diagnostics-control-card">
        <div class="adaptive-setting">
<div>
<b>${t('sec.diag.record')}</b>
<p id="diagnostics-recording-note">${t('sec.diag.reading')}</p>
</div>
<label class="switch">
<input id="diagnostics-enabled" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">${t('sec.diag.record')}</span>
</label>
</div>
        <div class="diagnostics-native">
<span id="diagnostics-native-dot" class="connection-dot" aria-hidden="true">
</span>
<div>
<b id="diagnostics-native-state">${t('sec.diag.nativeCheck')}</b>
<p id="diagnostics-native-note">
</p>
</div>
</div>
      </div>
      <div class="diagnostics-metrics" aria-label="${t('sec.diag.overview')}">
        <div>
<span>${t('sec.diag.requests')}</span>
<strong id="diagnostics-requests">—</strong>
</div>
        <div>
<span>${t('sec.diag.failed')}</span>
<strong id="diagnostics-failures">—</strong>
</div>
        <div>
<span>${t('sec.diag.slow')}</span>
<strong id="diagnostics-slow">—</strong>
</div>
        <div>
<span>${t('sec.diag.running')}</span>
<strong id="diagnostics-pending">—</strong>
</div>
      </div>
      <div class="paper-card diagnostics-panel">
        <div class="diagnostics-panel-heading">
<div>
<h3>${t('sec.diag.issues')}</h3>
<p>${t('sec.diag.issuesDesc')}</p>
</div>
<span id="diagnostics-updated" class="muted" aria-live="polite">
</span>
</div>
        <div id="diagnostics-issues" class="diagnostics-issues">
</div>
        <p id="diagnostics-issues-empty" class="empty-state">${t('sec.diag.issuesEmpty')}</p>
      </div>
      <details class="preference-block disclosure-block">
<summary>
<span>${t('sec.diag.logs')}</span>
<small>${t('sec.diag.logsDesc')}</small>
</summary>
<div class="diagnostics-panel">
        
        <div id="diagnostics-events" class="diagnostics-events" aria-live="polite">
</div>
        <p id="diagnostics-events-empty" class="empty-state">${t('sec.diag.eventsEmpty')}</p>
      </div>
</details>
      <div class="paper-card diagnostics-actions-card">
        <div class="data-actions">
<button id="reload-extension" class="secondary-button" type="button" title="${t('sec.diag.reloadTitle')}">${t('sec.diag.reload')}</button>
<button id="export-diagnostics" class="secondary-button" type="button">${t('sec.diag.export')}</button>
<button id="clear-diagnostics" class="danger-button" type="button">${t('sec.diag.clear')}</button>
<span id="diagnostics-result" class="inline-message" aria-live="polite">
</span>
</div>
        <p class="field-help">${t('sec.diag.clearNote')}</p>
      </div>
    <details class="calculation-note">
<summary>${t('sec.diag.what')}</summary>
<p>${t('sec.diag.whatDesc')}</p>
</details>
</section>
`;
