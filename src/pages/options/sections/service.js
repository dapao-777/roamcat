/**
 * @file src/pages/options/sections/service.js
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

export const serviceSection = html`
<section id="service" class="settings-section" aria-labelledby="service-heading" hidden="">
      <div class="section-intro">
<h2 id="service-heading" class="sr-only">模型服务</h2>
<p>连接一个模型服务即可使用。API 调用可能由服务商收费。</p>
</div>
      <!-- 兼容保留底层服务单选单态，保持核心逻辑与测试用例透明兼容 -->
      <fieldset class="provider-picker" style="display: none !important;">
        <legend>服务来源</legend>
        <div class="choice-cards three provider-choices">
          <label><input type="radio" name="provider-kind" value="chatgpt"></label>
          <label><input type="radio" name="provider-kind" value="grok"></label>
          <label><input type="radio" name="provider-kind" value="antigravity"></label>
          <label><input type="radio" name="provider-kind" value="api"></label>
        </div>
      </fieldset>

      <!-- FluentRead 风格 Service Catalog 双栏工作区 -->
      <div class="service-catalog-workspace">
        <div class="catalog-layout">
          <!-- 左栏：Service Rail 服务目录导航 -->
          <aside class="service-rail" aria-label="模型服务目录">
            <div class="rail-heading">
              <div>
                <strong>模型服务</strong>
                <span class="service-count" id="catalog-service-count">33</span>
              </div>
              <button type="button" class="service-add-button" id="catalog-add-btn" title="添加自定义 API 服务">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>自定义服务</span>
              </button>
            </div>

            <label class="catalog-search" for="catalog-search-input">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
              <input type="search" id="catalog-search-input" placeholder="搜索所有模型服务..." autocomplete="off">
            </label>

            <div class="service-groups" id="catalog-directory-list">
              <!-- 服务列表由 options-service-catalog.js 渲染 -->
            </div>
          </aside>

          <!-- 右栏：Service Detail 服务配置详情面板 -->
          <section class="service-detail" aria-label="当前模型服务配置">
            <div class="detail-hero">
              <div class="detail-hero-left">
                <div class="detail-hero-icon-box" id="catalog-hero-icon">
                  <img class="detail-hero-icon" src="../icons/providers/openai.svg" alt="" width="30" height="30">
                </div>
                <div class="detail-heading">
                  <div class="detail-title-row">
                    <h4 id="catalog-hero-title">ChatGPT 订阅</h4>
                    <span class="catalog-active-badge" id="catalog-hero-active-badge">当前默认</span>
                    <button type="button" class="catalog-set-default-btn" id="catalog-hero-set-default" hidden>设为默认使用</button>
                    <a id="catalog-hero-website" class="service-website-link" href="#" target="_blank" rel="noopener noreferrer" hidden>
                      <span>获取密钥 / 官方说明</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>
                    </a>
                  </div>
                  <p id="catalog-hero-desc" class="catalog-hero-desc">使用账户可用的 Codex 权益，通过本机连接器免 API Key 运行</p>
                </div>
              </div>
              <div class="hero-connection-action">
                <button type="button" class="catalog-check-btn" id="catalog-check-conn-btn">
                  <svg class="check-spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
                  <span id="catalog-check-btn-label">检查连接</span>
                </button>
              </div>
            </div>

            <div class="detail-content-body">
              <div id="subscription-panel" class="provider-panel">
<div class="paper-card subscription-card">
<div class="subscription-summary">
<div>
<span id="subscription-dot" class="connection-dot" aria-hidden="true">
</span>
<b id="subscription-state">正在检查连接…</b>
<p id="subscription-detail">
</p>
</div>
<button id="refresh-subscription" class="secondary-button" type="button">刷新账户与模型</button>
</div>
<dl id="subscription-account" class="account-details" hidden="">
<div>
<dt>账户</dt>
<dd id="subscription-email">—</dd>
</div>
<div>
<dt>方案</dt>
<dd id="subscription-plan">—</dd>
</div>
</dl>
<label class="field" id="subscription-model-field">
<span>辅助模型</span>
<select id="subscription-model">
</select>
<small id="subscription-model-note">
</small>
</label>
<div class="provider-actions">
<button id="login-subscription" class="primary-action narrow" type="button">使用 ChatGPT 登录</button>
<button id="cancel-subscription" class="secondary-button" type="button" hidden="">取消登录</button>
<button id="logout-subscription" class="danger-button" type="button" hidden="">退出登录</button>
<button id="test-subscription" class="secondary-button" type="button">测试提示</button>
<span id="subscription-result" class="inline-message" aria-live="polite">
</span>
</div>
<p id="subscription-user-code" class="field-help" hidden=""></p>
</div>
<details id="connector-install" class="installation-note">
<summary>安装或修复本机连接器</summary>
<p id="install-prereq">安装 Node.js 20+ 与官方 Codex 后，在项目根目录运行：</p>
<div class="copy-command">
<code id="install-command">
</code>
<button id="copy-install-command" class="secondary-button" type="button">复制</button>
</div>
<p id="install-note">连接失效时重新运行安装命令并刷新，不需要重新选择账户。</p>
</details>
</div>
      <div id="api-panel" class="provider-panel" hidden="">
        <div class="paper-card form-stack api-service-card">
          <div class="service-selection">
<label class="field">
<span>已保存的 API 服务</span>
<select id="api-service-select">
</select>
</label>
<button id="new-api-service" class="secondary-button" type="button">新增服务</button>
</div>
          <p class="field-help">各服务的密钥和地址相互隔离；切换服务不会覆盖未选中的配置。</p>
          <div class="provider-actions">
<button id="test-provider" class="secondary-button" type="button">测试当前服务</button>
</div>
<details id="api-editor" class="service-editor">
<summary>编辑服务配置</summary>
<form id="provider-form" class="form-stack">
            <div class="form-grid">
<div class="field">
<label id="provider-label" for="provider-trigger">服务商</label>
<div class="provider-select">
<select id="provider-id" required="" hidden="">
</select>
<button id="provider-trigger" class="provider-select-trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="provider-options" aria-labelledby="provider-label provider-current-name">
<img class="provider-logo" width="24" height="24" alt="">
<span id="provider-current-name">
</span>
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
<path d="m5 7.5 5 5 5-5">
</path>
</svg>
</button>
<div id="provider-options" class="provider-options" role="listbox" aria-labelledby="provider-label" popover="auto">
</div>
</div>
</div>
<label class="field">
<span>服务名称</span>
<input id="provider-name" maxlength="60" required="" autocomplete="off">
</label>
</div>
            <label class="field">
<span>接口密钥（API Key） <a id="provider-key-link" class="field-link" href="#" target="_blank" rel="noreferrer" hidden="">获取密钥</a>
</span>
<div class="password-input-wrap">
  <input id="provider-key" type="password" autocomplete="new-password">
  <button type="button" class="toggle-password-btn" data-toggle-target="provider-key" title="显示或隐藏密钥" aria-label="显示或隐藏密钥">
    <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    <svg class="eye-hide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
  </button>
</div>
<small id="key-state">
</small>
</label>
            <div id="provider-fields" class="form-grid provider-fields">
</div>
            <div class="model-field">
<label class="field">
<span>模型</span>
<div class="model-picker">
<select id="provider-model-list" aria-label="可用模型">
<option value="">获取后选择</option>
</select>
<button id="list-provider-models" class="secondary-button" type="button">获取模型</button>
</div>
<small id="provider-model-note">也可直接填写模型 ID。</small>
</label>
<label class="field">
<span>模型 ID</span>
<input id="provider-model" required="" autocomplete="off" spellcheck="false">
</label>
</div>
            <details class="inline-disclosure">
<summary>高级设置</summary>
<div class="disclosure-content">
<label class="field">
<span>接口地址（Base URL）</span>
<input id="provider-url" type="url" required="" spellcheck="false">
<small>仅 HTTPS；localhost 可使用 HTTP。更换域名不会带入旧密钥。</small>
</label>
<label class="field">
<span>最大并发数</span>
<input id="provider-concurrency" type="number" min="1" max="10" step="1" value="2" required="">
<small>同时向该服务发送的请求上限。阶跃星辰 V0 仅 5 并发 / 每分钟 10 次，建议填 1–2；订阅套餐（Step Plan）走套餐额度，不受该表限制。</small>
</label>
</div>
</details>
            <div class="provider-actions">
<button class="primary-action narrow" type="submit">保存并使用</button>
<button id="cancel-api-service" class="secondary-button" type="button" hidden="">取消新增</button>
</div>
            
          <details class="inline-disclosure">
<summary>移除服务或密钥</summary>
<div class="provider-actions">
<button id="disconnect-provider" class="danger-button" type="button">清除此服务密钥</button>
<button id="delete-api-service" class="danger-button" type="button">删除此服务</button>
</div>
</details>
</form>
</details>
<p id="provider-result" class="inline-message" aria-live="polite">
</p>
        </div>
      </div>
      <aside class="privacy-note">
<b>发送哪些内容？</b>
<p>辅助会发送标题、章节及附近的有限上下文，不发送页面网址。</p>
<details class="calculation-note">
<summary>本页双语翻译的数据范围</summary>
<p>在扩展弹窗点「翻译本页」后立即开始，英文保持原位；只把读到附近的原文、页面标题、所在章节和有限相邻文本发送给所选服务。请求按服务规则计费，停止不能撤回已经发送的请求。</p>
</details>
</aside>
            </div> <!-- /.detail-content-body -->
          </section> <!-- /.service-detail -->
        </div> <!-- /.catalog-layout -->
      </div> <!-- /.service-catalog-workspace -->
    </section>

`;
