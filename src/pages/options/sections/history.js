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

export const historySection = html`
<section id="history" class="settings-section history-section" aria-labelledby="history-heading" hidden="">
      <div class="section-intro"><h2 id="history-heading" class="sr-only">阅读记录</h2><p>仅在你明确开启后，本机保存查询例句、阅读摘要与客观统计，不保存整篇正文。</p></div>
      <p id="history-problem" class="notice error" role="alert" hidden=""></p><p id="history-operation-result" class="inline-message" aria-live="polite" hidden=""></p>
      <div class="section-tabs" role="tablist" aria-label="阅读记录页面"><button id="history-view-records-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-records" aria-controls="history-view-records" aria-selected="true">记录</button><button id="history-view-stats-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-stats" aria-controls="history-view-stats" aria-selected="false" tabindex="-1">统计</button><button id="history-view-settings-tab" type="button" role="tab" data-section-tab="history" data-target="history-view-settings" aria-controls="history-view-settings" aria-selected="false" tabindex="-1">记录设置</button></div><div class="history-toolbar" id="history-period-toolbar"><fieldset class="history-period" aria-label="统计范围"><legend class="sr-only">统计范围</legend><label><input type="radio" name="history-days" value="7"><span>近 7 天</span></label><label><input type="radio" name="history-days" value="30" checked=""><span>近 30 天</span></label><label><input type="radio" name="history-days" value="0"><span>累计</span></label></fieldset><span id="history-started" class="muted"></span></div>
      <div id="history-view-records" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-records-tab">
        <div id="history-first-use" class="paper-card first-use-card" hidden=""><div><b>尚未保存阅读记录</b><p>开启后才会从你允许的网站保存有限记录；不会补记过去内容。</p></div><button type="button" data-open-section-tab="history-view-settings">设置记录范围</button></div>
        <div id="history-record-content" class="history-browser paper-card">
          <div class="history-tabs" role="tablist" aria-label="记录类型"><button id="history-type-query" type="button" role="tab" data-history-tab="query" aria-controls="history-list" aria-selected="true">主动查询</button><button id="history-type-automatic" type="button" role="tab" data-history-tab="automatic" aria-controls="history-list" aria-selected="false" tabindex="-1">自动标注</button><button id="history-type-summary" type="button" role="tab" data-history-tab="summary" aria-controls="history-list" aria-selected="false" tabindex="-1">阅读摘要</button><button id="history-type-rule" type="button" role="tab" data-history-tab="rule" aria-controls="history-list" aria-selected="false" tabindex="-1">提示规则</button></div>
          <form id="history-filters" class="history-filters"><label class="field"><span>搜索词条</span><input id="history-search" type="search" autocomplete="off"></label><label class="field"><span>领域</span><select id="history-domain"><option value="">全部领域</option></select></label><label class="field"><span>来源</span><select id="history-source"><option value="">全部来源</option><option value="manual">主动求助</option><option value="history">个人历史词再遇</option><option value="system">系统候选</option><option value="model">模型生成</option><option value="legacy">历史导入</option></select></label><button type="submit">筛选</button></form>
          <div id="history-list" class="history-list" role="tabpanel" aria-labelledby="history-type-query" aria-live="polite"></div><p id="history-empty" class="empty-state">此范围内没有记录。</p>
          <div class="history-event-actions"><span id="history-range-note" class="field-help"></span><button id="history-more" type="button" hidden="">加载更多记录</button></div>
        </div>
      </div>
      <div id="history-view-stats" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-stats-tab" hidden="">
        <div id="history-stats-content" class="section-tab-stack">
          
          <div id="history-metrics" class="history-metrics" aria-label="阅读统计"><div><span>活跃阅读时长（估算）</span><strong id="metric-time">—</strong></div><div><span>浏览英文词数（估算）</span><strong id="metric-words">—</strong></div><div><span>主动查询词条</span><strong id="metric-terms">—</strong><small id="metric-query-note"></small></div><div><span>查阅例句</span><strong id="metric-sentences">—</strong></div></div>
          <div class="paper-card history-chart-card"><div class="history-chart-heading"><div><b>每日记录</b><p id="history-chart-unit" class="muted"></p></div><label class="field history-chart-select"><span>图表指标</span><select id="history-chart-metric"><option value="activeMs">活跃时长</option><option value="terms">查询词条</option><option value="sentences">查阅例句</option></select></label></div><div id="history-chart" class="history-chart" role="img" aria-label="每日阅读记录" aria-describedby="history-chart-description"></div><details class="calculation-note"><summary>查看每日数据</summary><p id="history-chart-description" class="field-help"></p></details><details class="calculation-note"><summary>统计条件与留存边界</summary><p>每日统计按 UTC 划分。只累计扩展启用、页面在前台且正文可见的活跃会话；静置 60 秒后暂停。词数是视口内稳定正文的去重估算，不代表读完。查询原句最多保留 1000 字符。</p></details></div>
        </div>
      </div>
      <div id="history-view-settings" class="section-tab-panel" role="tabpanel" aria-labelledby="history-view-settings-tab" hidden=""><div class="paper-card history-consent form-stack">
        <div class="adaptive-setting"><div><b>保存阅读记录</b><p>新增指标从开启时开始；站点访问权限不会自动授权历史留存。</p></div><label class="switch"><input id="history-enabled" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">保存阅读记录</span></label></div>
        <form id="history-origin-form" class="automation-site-form"><label class="field"><span>允许记录的网站</span><input id="history-origin" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" required=""><small>填写网站地址，不含文章路径；未添加网站时不会记录。</small></label><button type="submit">添加</button></form>
        <div id="history-origin-list" class="history-origin-list"></div><p id="history-origin-empty" class="empty-state">尚未允许任何网站。</p>
        <div class="adaptive-setting"><div><b>生成阅读摘要</b><p>会把授权范围内的有限内容发送给当前服务，可能产生模型费用；摘要可编辑或删除。</p></div><label class="switch"><input id="history-summaries" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">生成阅读摘要</span></label></div>
        <p id="history-config-result" class="inline-message" aria-live="polite"></p>
        <p class="field-help">导出或删除已有内容，请前往<a href="#privacy">数据与隐私</a>。</p>
      </div></div>
    </section>

`;
