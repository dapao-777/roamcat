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

export const diagnosticsSection = html`
<section id="diagnostics" class="settings-section diagnostics-section" aria-labelledby="diagnostics-heading" hidden="">
      <div class="section-intro">
<h2 id="diagnostics-heading" class="sr-only">诊断</h2>
<p>查看运行异常并导出排查信息。诊断只保存在本机，不包含原文或密钥。</p>
</div>
      <p id="diagnostics-storage-error" class="notice error" role="alert" hidden="">诊断记录无法写入本机存储。当前显示可能不完整；可先导出现有记录后重试。</p>
      <div class="paper-card diagnostics-control-card">
        <div class="adaptive-setting">
<div>
<b>记录开发诊断</b>
<p id="diagnostics-recording-note">正在读取本机诊断状态…</p>
</div>
<label class="switch">
<input id="diagnostics-enabled" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">记录开发诊断</span>
</label>
</div>
        <div class="diagnostics-native">
<span id="diagnostics-native-dot" class="connection-dot" aria-hidden="true">
</span>
<div>
<b id="diagnostics-native-state">正在检查连接器状态…</b>
<p id="diagnostics-native-note">
</p>
</div>
</div>
      </div>
      <div class="diagnostics-metrics" aria-label="诊断概览">
        <div>
<span>请求</span>
<strong id="diagnostics-requests">—</strong>
</div>
        <div>
<span>失败</span>
<strong id="diagnostics-failures">—</strong>
</div>
        <div>
<span>慢请求</span>
<strong id="diagnostics-slow">—</strong>
</div>
        <div>
<span>进行中</span>
<strong id="diagnostics-pending">—</strong>
</div>
      </div>
      <div class="paper-card diagnostics-panel">
        <div class="diagnostics-panel-heading">
<div>
<h3>最近异常</h3>
<p>按异常分类汇总，不展示服务原始错误。</p>
</div>
<span id="diagnostics-updated" class="muted" aria-live="polite">
</span>
</div>
        <div id="diagnostics-issues" class="diagnostics-issues">
</div>
        <p id="diagnostics-issues-empty" class="empty-state">暂未发现异常。</p>
      </div>
      <details class="preference-block disclosure-block">
<summary>
<span>最近日志</span>
<small>查看最新 50 条结构化记录</small>
</summary>
<div class="diagnostics-panel">
        
        <div id="diagnostics-events" class="diagnostics-events" aria-live="polite">
</div>
        <p id="diagnostics-events-empty" class="empty-state">暂无诊断记录。</p>
      </div>
</details>
      <div class="paper-card diagnostics-actions-card">
        <div class="data-actions">
<button id="reload-extension" class="secondary-button" type="button" title="重载扩展后台与内容脚本；本页未保存的界面状态会重置，设置改动已即时保存">重新加载扩展</button>
<button id="export-diagnostics" class="secondary-button" type="button">导出诊断 JSON</button>
<button id="clear-diagnostics" class="danger-button" type="button">清空诊断记录</button>
<span id="diagnostics-result" class="inline-message" aria-live="polite">
</span>
</div>
        <p class="field-help">清空只删除诊断记录，不会影响个人词档案、阅读记忆、账户连接或网站权限。</p>
      </div>
    <details class="calculation-note">
<summary>诊断记录包含什么？</summary>
<p>诊断默认只保存在本机。扩展最多保留 500 条、7 天；连接器文件按大小轮转。记录仅含阶段、耗时、结构元数据和匿名指纹，不保存原始正文、完整模型响应、网址、密钥或账户信息。</p>
</details>
</section>
`;
