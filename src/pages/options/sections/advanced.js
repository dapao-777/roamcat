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

export const advancedSection = html`
<section id="advanced" class="settings-section" aria-labelledby="advanced-heading" hidden="">
<div class="section-intro">
<h2 id="advanced-heading" class="sr-only">领域识别</h2>
<p>一般保留本地识别即可。增强识别会发送有限摘录，可能产生模型费用。</p>
</div>
<div class="paper-card form-stack">
          <fieldset>
<legend>内容识别方式</legend>
<div class="choice-cards three recognition-choices">
            <label>
<input type="radio" name="domain-detection-mode" value="local">
<span>
<b>本地识别</b>
<small>不发送正文</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="chatgpt">
<span>
<b>ChatGPT 增强</b>
<small>本地不明确时发送摘录</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="grok">
<span>
<b>Grok 增强</b>
<small>本地不明确时发送摘录</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="antigravity">
<span>
<b>Google 增强</b>
<small>本地不明确时发送摘录</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="api">
<span>
<b>API 增强</b>
<small>使用单独或现有 API</small>
</span>
</label>
            <label>
<input type="radio" name="domain-detection-mode" value="jev">
<span>
<b>Jev 增强识别</b>
<small>Requesty 转发或 TypeSafe 原生判定</small>
</span>
</label>
          </div>
</fieldset>
          <div id="detection-chatgpt" hidden="">
<label class="field">
<span>识别模型</span>
<select id="detection-subscription-model">
</select>
</label>
</div>
          <div id="detection-api" class="form-stack" hidden="">
<label class="check-row">
<input id="detection-use-translation-api" type="checkbox">
<span>
<b>复用辅助 API</b>
<small>模型仍可单独填写。</small>
</span>
</label>
<label class="field">
<span>识别模型</span>
<input id="detection-api-model" autocomplete="off">
</label>
<div id="detection-api-fields" class="form-grid">
<label class="field">
<span>识别接口地址（Base URL）</span>
<input id="detection-api-url" type="url">
</label>
<label class="field">
<span>识别接口密钥（API Key）</span>
<div class="password-input-wrap">
  <input id="detection-api-key" type="password" autocomplete="new-password">
  <button type="button" class="toggle-password-btn" data-toggle-target="detection-api-key" title="显示或隐藏密钥" aria-label="显示或隐藏密钥">
    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
  </button>
</div>
<small id="detection-key-state">
</small>
</label>
</div>
<button id="clear-detection-key" class="danger-button narrow" type="button">清除识别密钥</button>
</div>
          <div id="detection-jev" class="form-stack" hidden="">
            <label class="field">
              <span>Jev 模型</span>
              <input id="detection-jev-model" autocomplete="off" placeholder="typesafe/jev-1.13.0">
            </label>
            <div id="detection-jev-fields" class="form-grid">
              <label class="field">
                <span>Jev 接口地址（Base URL）</span>
                <input id="detection-jev-url" type="url" placeholder="https://router.requesty.ai/v1">
              </label>
              <label class="field">
                <span>Jev 密钥（API Key） <a class="field-link" href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">TypeSafe</a> · <a class="field-link" href="https://app.requesty.ai" target="_blank" rel="noreferrer">Requesty</a></span>
                <div class="password-input-wrap">
                  <input id="detection-jev-key" type="password" autocomplete="new-password">
                  <button type="button" class="toggle-password-btn" data-toggle-target="detection-jev-key" title="显示或隐藏密钥" aria-label="显示或隐藏密钥">
                    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                  </button>
                </div>
                <small id="detection-jev-key-state"></small>
              </label>
            </div>
            <button id="clear-detection-jev-key" class="danger-button narrow" type="button">清除 Jev 密钥</button>
          </div>
          <div class="provider-actions">
<button id="save-recognition" class="primary-action narrow" type="button">保存识别设置</button>
</div>
          <details class="inline-disclosure">
<summary>测试内容识别</summary>
<div class="domain-test">
<label class="field">
<span>测试一段内容</span>
<textarea id="domain-test-text" rows="3" maxlength="6000">
</textarea>
</label>
<div class="provider-actions">
<button id="run-domain-test" class="secondary-button" type="button">测试识别</button>
<span id="domain-test-result" class="inline-message" aria-live="polite">
</span>
</div>
</div>
</details>
          
          
        </div>
</section>

`;
