/**
 * @file src/pages/options/sections/history.js
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

export const historySection = html`
<section id="history" class="settings-section history-section" aria-labelledby="history-heading" hidden="">
      <div class="section-intro"><h2 id="history-heading" class="sr-only">${t('sec.history.title')}</h2><p>${t('sec.history.desc')}</p></div>
      <p id="history-problem" class="notice error" role="alert" hidden=""></p><p id="history-operation-result" class="inline-message" aria-live="polite" hidden=""></p>
      <div class="section-tabs" role="tablist" aria-label="${t('sec.history.tabs')}"><button id="history-view-records-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-records" aria-controls="history-view-records" aria-selected="true">${t('sec.history.tabRecords')}</button><button id="history-view-stats-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-stats" aria-controls="history-view-stats" aria-selected="false" tabindex="-1">${t('sec.history.tabStats')}</button><button id="history-view-settings-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-settings" aria-controls="history-view-settings" aria-selected="false" tabindex="-1">${t('sec.history.tabSettings')}</button></div><div class="history-toolbar" id="history-period-toolbar"><fieldset class="history-period" aria-label="${t('sec.history.period')}"><legend class="sr-only">${t('sec.history.period')}</legend><label><input type="radio" name="history-days" value="7"><span>${t('sec.history.d7')}</span></label><label><input type="radio" name="history-days" value="30" checked=""><span>${t('sec.history.d30')}</span></label><label><input type="radio" name="history-days" value="0"><span>${t('sec.history.all')}</span></label></fieldset><span id="history-started" class="muted"></span></div>
      <div id="history-view-records" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-records-tab">
        <div id="history-first-use" class="paper-card first-use-card" hidden=""><div><b>${t('sec.history.firstUse')}</b><p>${t('sec.history.firstUseDesc')}</p></div><button type="button" data-open-section-tab="history-view-settings">${t('sec.history.firstUseBtn')}</button></div>
        <div id="history-record-content" class="history-browser paper-card">
          <div class="history-tabs" role="tablist" aria-label="${t('sec.history.types')}"><button id="history-type-query" type="button" role="tab" data-history-tab="query" aria-controls="history-list" aria-selected="true">${t('sec.history.typeQuery')}</button><button id="history-type-automatic" type="button" role="tab" data-history-tab="automatic" aria-controls="history-list" aria-selected="false" tabindex="-1">${t('sec.history.typeAuto')}</button><button id="history-type-summary" type="button" role="tab" data-history-tab="summary" aria-controls="history-list" aria-selected="false" tabindex="-1">${t('sec.history.typeSummary')}</button><button id="history-type-rule" type="button" role="tab" data-history-tab="rule" aria-controls="history-list" aria-selected="false" tabindex="-1">${t('sec.history.typeRule')}</button></div>
          <form id="history-filters" class="history-filters"><label class="field"><span>${t('sec.history.search')}</span><input id="history-search" type="search" autocomplete="off"></label><label class="field"><span>${t('sec.history.domain')}</span><select id="history-domain"><option value="">${t('sec.history.allDomains')}</option></select></label><label class="field"><span>${t('sec.history.source')}</span><select id="history-source"><option value="">${t('sec.history.allSources')}</option><option value="manual">${t('sec.history.srcManual')}</option><option value="history">${t('sec.history.srcHistory')}</option><option value="system">${t('sec.history.srcSystem')}</option><option value="model">${t('sec.history.srcModel')}</option><option value="legacy">${t('sec.history.srcLegacy')}</option></select></label><button type="submit">${t('sec.history.filter')}</button></form>
          <div id="history-list" class="history-list" role="tabpanel" aria-labelledby="history-type-query" aria-live="polite"></div><p id="history-empty" class="empty-state">${t('sec.history.empty')}</p>
          <div class="history-event-actions"><span id="history-range-note" class="field-help"></span><button id="history-more" type="button" hidden="">${t('sec.history.more')}</button></div>
        </div>
      </div>
      <div id="history-view-stats" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-stats-tab" hidden="">
        <div id="history-stats-content" class="section-tab-stack">
          
          <div id="history-metrics" class="history-metrics" aria-label="${t('sec.history.metrics')}"><div><span>${t('sec.history.metricTime')}</span><strong id="metric-time">—</strong></div><div><span>${t('sec.history.metricWords')}</span><strong id="metric-words">—</strong></div><div><span>${t('sec.history.metricTerms')}</span><strong id="metric-terms">—</strong><small id="metric-query-note"></small></div><div><span>${t('sec.history.metricSentences')}</span><strong id="metric-sentences">—</strong></div></div>
          <div class="paper-card history-chart-card"><div class="history-chart-heading"><div><b>${t('sec.history.daily')}</b><p id="history-chart-unit" class="muted"></p></div><label class="field history-chart-select"><span>${t('sec.history.chartMetric')}</span><select id="history-chart-metric"><option value="activeMs">${t('sec.history.mActive')}</option><option value="terms">${t('sec.history.mTerms')}</option><option value="sentences">${t('sec.history.mSentences')}</option></select></label></div><div id="history-chart" class="history-chart" role="img" aria-label="${t('sec.history.chartAria')}" aria-describedby="history-chart-description"></div><details class="calculation-note"><summary>${t('sec.history.dailyData')}</summary><p id="history-chart-description" class="field-help"></p></details><details class="calculation-note"><summary>${t('sec.history.boundary')}</summary><p>${t('sec.history.boundaryDesc')}</p></details></div>
        </div>
      </div>
      <div id="history-view-settings" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-settings-tab" hidden=""><div class="paper-card history-consent form-stack">
        <div class="adaptive-setting"><div><b>${t('sec.history.save')}</b><p>${t('sec.history.saveDesc')}</p></div><label class="switch"><input id="history-enabled" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.history.save')}</span></label></div>
        <form id="history-origin-form" class="automation-site-form"><label class="field"><span>${t('sec.history.allowSite')}</span><input id="history-origin" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" required=""><small>${t('sec.history.allowSiteHint')}</small></label><button type="submit">${t('sec.history.add')}</button></form>
        <div id="history-origin-list" class="history-origin-list"></div><p id="history-origin-empty" class="empty-state">${t('sec.history.originEmpty')}</p>
        <div class="adaptive-setting"><div><b>${t('sec.history.summaries')}</b><p>${t('sec.history.summariesDesc')}</p></div><label class="switch"><input id="history-summaries" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.history.summaries')}</span></label></div>
        <p id="history-config-result" class="inline-message" aria-live="polite"></p>
        <p class="field-help">${t('sec.history.gotoPrivacy')}<a href="#privacy">${t('opt.nav.privacy')}</a>。</p>
      </div></div>
    </section>

`;
