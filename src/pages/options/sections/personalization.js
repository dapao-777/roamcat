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

export const personalizationSection = html`
<section id="personalization" class="settings-section personalization-section" aria-labelledby="personalization-heading" hidden="">
      <div class="section-intro"><h2 id="personalization-heading" class="sr-only">提示偏好</h2><p>管理已认识词和可选分析。分析只使用你授权保留的有限证据，不生成能力等级或敏感画像。</p></div><p id="personalization-problem" class="notice error" role="alert" hidden=""></p><span id="personalization-result" class="inline-message" aria-live="polite"></span>
      <div class="section-tabs" role="tablist" aria-label="提示偏好页面"><button id="personalization-preferences-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-preferences" aria-controls="personalization-preferences" aria-selected="true">分析偏好</button><button id="personalization-known-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-known" aria-controls="personalization-known" aria-selected="false" tabindex="-1">已认识词</button><button id="personalization-adjustments-tab" type="button" role="tab" data-section-tab="personalization" data-target="personalization-adjustments" aria-controls="personalization-adjustments" aria-selected="false" tabindex="-1">调整记录</button></div>
      <div id="personalization-preferences" class="section-tab-panel section-tab-stack" role="tabpanel" aria-labelledby="personalization-preferences-tab"><div class="paper-card form-stack compact-settings-card">
        <div class="adaptive-setting"><div><b>允许个性化分析</b><p>分析会调用所选服务并可能产生费用；关闭后不发出新请求，已发送请求可能仍产生费用。</p></div><label class="switch"><input id="personalization-enabled" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">允许个性化分析</span></label></div>
        <div class="adaptive-setting"><div><b>自动应用低风险调整</b><p>仅优先词条可自动应用；其他变化均需确认，不修改站点规则。</p></div><label class="switch"><input id="personalization-auto-apply" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">自动应用低风险调整</span></label></div>
        <div class="personalization-service"><span>所选服务</span><b id="personalization-service-label">未连接</b></div>
        <div class="provider-actions"><button id="personalization-analyze" class="primary-action" type="button">立即分析</button><button id="personalization-reset" class="danger-button" type="button">恢复默认</button></div>
        <details class="calculation-note"><summary>分析范围与频率</summary><p>每次最多使用近 30 天的 40 条查询例句或主题摘要、客观统计与 40 条手动规则。达到 3 个有效会话或 10 次查询后才可开始；自动分析最多每周一次，手动间隔至少 60 秒。</p></details>
      </div><div id="personalization-status" class="paper-card personalization-status"></div><div id="personalization-pending" class="paper-card personalization-pending" hidden=""></div></div>
      <div id="personalization-known" class="section-tab-panel" role="tabpanel" aria-labelledby="personalization-known-tab" hidden=""><div id="history-known-words" class="paper-card known-words-card" tabindex="-1"><div><b>已认识的词</b><p class="field-help">这些词不会再被自动提示，但仍可主动查询。它独立于阅读记录和个性化分析。</p></div><div id="known-word-list" class="known-word-list" aria-live="polite"></div><p id="known-word-empty" class="empty-state">尚未标记已认识的词。</p><p id="known-word-result" class="inline-message" aria-live="polite"></p></div></div>
      <div id="personalization-adjustments" class="section-tab-panel section-tab-stack" role="tabpanel" aria-labelledby="personalization-adjustments-tab" hidden=""><div class="paper-card personalization-overrides"><div><b>当前调整与手动覆盖</b><p class="field-help">手动锁定优先于自动策略；每项调整都可恢复。</p></div><div id="personalization-override-list" class="override-list"></div><p id="personalization-overrides-empty" class="empty-state">当前没有已生效调整。</p></div><details class="paper-card settings-disclosure personalization-versions"><summary>查看调整历史</summary><div><div id="personalization-version-list" class="version-list"></div><p id="personalization-versions-empty" class="empty-state">尚无调整版本。</p></div></details></div>
    </section>
`;
