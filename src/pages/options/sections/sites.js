/**
 * @file src/pages/options/sections/sites.js
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

export const sitesSection = html`
<section id="sites" class="settings-section" aria-labelledby="sites-heading" hidden="">
<div class="section-intro">
<h2 id="sites-heading" class="sr-only">网站规则</h2>
<p>决定下次访问时是否自动开启。暂停本页不会修改这里的规则。</p>
</div>
<div class="paper-card form-stack">
          <div class="adaptive-setting">
<div>
<b>全部网站自动辅助</b>
<p>需要所有 HTTP / HTTPS 网站权限；仅处理可靠正文附近的有限上下文。</p>
</div>
<label class="switch">
<input id="automation-all-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">全部网站自动辅助</span>
</label>
</div>
<div class="adaptive-setting">
<div>
<b>所有网站自动显示句子结构</b>
<p>需要网站访问权限；会调用模型并可能产生费用。遵守网站例外和本页暂停。</p>
</div>
<label class="switch">
<input id="sentence-groups-all-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">所有网站自动显示句子结构</span>
</label>
</div>
          <form id="automation-site-form" class="automation-site-form">
<label class="field">
<span>指定网站</span>
<input id="automation-site-origin" type="url" required="" inputmode="url" autocomplete="off" placeholder="https://docs.example.com">
<small>填写网站地址，不含文章路径。只申请这个网站的访问权限。</small>
</label>
<button class="primary-action narrow" type="submit">添加网站</button>
</form>
          <p id="automation-result" class="inline-message" role="alert" hidden="">
</p>
          <div id="automation-site-list" class="automation-site-list">
</div>
          <div id="automation-site-empty" class="empty-state compact-empty" hidden="">
<h3>尚未添加网站</h3>
<p>也可在扩展弹窗中授权当前网站。</p>
</div>
          <div class="adaptive-setting" data-video-feature hidden>
<div>
<b>视频网站入口</b>
<p>单独授权 YouTube 后显示“这句”和“原文”入口；展开、滚动与播放不会自动处理整段字幕。</p>
</div>
<label class="switch">
<input id="automation-video-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">视频网站入口</span>
</label>
</div>
        </div>
<details class="preference-block disclosure-block">
<summary>网站领域规则</summary>
<div class="disclosure-content form-stack">
<form id="domain-rule-form" class="rule-form">
<label class="field">
<span>主机名</span>
<input id="rule-host" required="" placeholder="docs.example.com">
</label>
<label class="field">
<span>路径前缀</span>
<input id="rule-path" required="" value="/">
</label>
<label class="field">
<span>领域</span>
<select id="rule-domain">
</select>
</label>
<label class="check-row compact-check">
<input id="rule-subdomains" type="checkbox">
<span>包含子域名</span>
</label>
<button class="primary-action narrow" type="submit">添加规则</button>
</form>
<p id="domain-rule-result" class="inline-message" hidden="">
</p>
<div id="domain-rule-list" class="rule-list">
</div>
<div id="domain-rule-empty" class="empty-state compact-empty" hidden="">
<h3>还没有个人站点规则</h3>
</div>
</div>
</details>
</section>

`;
