/**
 * @file src/pages/options/sections/diagnostics.js
 * 文件职责：设置页静态分区模板——最初从
 *   extension/ui/options.html 机械切片生成（切片脚本已移除）；id/控件契约与原页完全一致。
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
      <div class="opt-group">
        <div class="opt-group-head"><h2>${t('sec.diag.gRecord')}</h2></div>
        <div class="opt-card">
          <div class="opt-row">
            <div class="opt-row-text"><label for="diagnostics-enabled" class="opt-row-label">${t('sec.diag.record')}</label><p id="diagnostics-recording-note" class="opt-row-desc">${t('sec.diag.reading')}</p></div>
            <div class="opt-row-control"><label class="switch"><input id="diagnostics-enabled" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.diag.record')}</span></label></div>
          </div>
          <div class="opt-row diagnostics-native">
            <div class="opt-row-text"><span class="opt-row-label"><span id="diagnostics-native-dot" class="connection-dot" aria-hidden="true"></span> <b id="diagnostics-native-state">${t('sec.diag.nativeCheck')}</b></span><p id="diagnostics-native-note" class="opt-row-desc"></p></div>
          </div>
        </div>
      </div>
      <div class="opt-group">
        <div class="opt-group-head"><h2>${t('sec.diag.overview')}</h2></div>
        <div class="diagnostics-metrics" aria-label="${t('sec.diag.overview')}">
          <div><span>${t('sec.diag.requests')}</span><strong id="diagnostics-requests">—</strong></div>
          <div><span>${t('sec.diag.failed')}</span><strong id="diagnostics-failures">—</strong></div>
          <div><span>${t('sec.diag.slow')}</span><strong id="diagnostics-slow">—</strong></div>
          <div><span>${t('sec.diag.running')}</span><strong id="diagnostics-pending">—</strong></div>
        </div>
        <div class="opt-card diagnostics-panel">
          <div class="opt-row diagnostics-panel-heading">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.diag.issues')}</span><p class="opt-row-desc">${t('sec.diag.issuesDesc')}</p></div>
            <span id="diagnostics-updated" class="muted" aria-live="polite"></span>
          </div>
          <div class="opt-row opt-row-stack">
            <div id="diagnostics-issues" class="diagnostics-issues"></div>
            <p id="diagnostics-issues-empty" class="empty-state">${t('sec.diag.issuesEmpty')}</p>
          </div>
        </div>
        <details class="paper-card settings-disclosure">
          <summary>${t('sec.diag.logs')} · ${t('sec.diag.logsDesc')}</summary>
          <div class="disclosure-content diagnostics-panel">
            <div id="diagnostics-events" class="diagnostics-events" aria-live="polite"></div>
            <p id="diagnostics-events-empty" class="empty-state">${t('sec.diag.eventsEmpty')}</p>
          </div>
        </details>
      </div>
      <div class="opt-group">
        <div class="opt-group-head"><h2>${t('sec.diag.gActions')}</h2></div>
        <div class="opt-card">
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.diag.export')}</span><p class="opt-row-desc">${t('sec.diag.exportDesc')}</p><span id="diagnostics-result" class="inline-message" aria-live="polite"></span></div>
            <div class="opt-row-control"><button id="export-diagnostics" class="secondary-button" type="button">${t('sec.privacy.exportBtn')}</button></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.diag.reload')}</span><p class="opt-row-desc">${t('sec.diag.reloadTitle')}</p></div>
            <div class="opt-row-control"><button id="reload-extension" class="secondary-button" type="button">${t('sec.diag.reloadBtn')}</button></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.diag.clear')}</span><p class="opt-row-desc">${t('sec.diag.clearNote')}</p></div>
            <div class="opt-row-control"><button id="clear-diagnostics" class="danger-button" type="button">${t('sec.privacy.clearBtn')}</button></div>
          </div>
        </div>
        <details class="paper-card settings-disclosure">
          <summary>${t('sec.diag.what')}</summary>
          <div class="disclosure-content"><p class="field-help">${t('sec.diag.whatDesc')}</p></div>
        </details>
      </div>
</section>
`;
