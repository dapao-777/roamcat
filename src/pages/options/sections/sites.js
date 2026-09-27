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
import {t} from '../../../i18n-runtime.js';

export const sitesSection = html`
<section id="sites" class="settings-section" aria-labelledby="sites-heading" hidden="">
<div class="section-intro">
<h2 id="sites-heading" class="sr-only">${t('sec.sites.title')}</h2>
<p>${t('sec.sites.desc')}</p>
</div>
<div class="paper-card form-stack">
          <div class="adaptive-setting">
<div>
<b>${t('sec.sites.allAssist')}</b>
<p>${t('sec.sites.allAssistDesc')}</p>
</div>
<label class="switch">
<input id="automation-all-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">${t('sec.sites.allAssist')}</span>
</label>
</div>
<div class="adaptive-setting">
<div>
<b>${t('sec.sites.allStruct')}</b>
<p>${t('sec.sites.allStructDesc')}</p>
</div>
<label class="switch">
<input id="sentence-groups-all-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">${t('sec.sites.allStruct')}</span>
</label>
</div>
          <form id="automation-site-form" class="automation-site-form">
<label class="field">
<span>${t('sec.sites.specific')}</span>
<input id="automation-site-origin" type="url" required="" inputmode="url" autocomplete="off" placeholder="https://docs.example.com">
<small>${t('sec.sites.specificHint')}</small>
</label>
<button class="primary-action narrow" type="submit">${t('sec.sites.addSite')}</button>
</form>
          <p id="automation-result" class="inline-message" role="alert" hidden="">
</p>
          <div id="automation-site-list" class="automation-site-list">
</div>
          <div id="automation-site-empty" class="empty-state compact-empty" hidden="">
<h3>${t('sec.sites.empty')}</h3>
<p>${t('sec.sites.emptyHint')}</p>
</div>
          <div class="adaptive-setting" data-video-feature hidden>
<div>
<b>${t('sec.sites.video')}</b>
<p>${t('sec.sites.videoDesc')}</p>
</div>
<label class="switch">
<input id="automation-video-sites" type="checkbox">
<span aria-hidden="true">
</span>
<span class="sr-only">${t('sec.sites.video')}</span>
</label>
</div>
        </div>
<details class="preference-block disclosure-block">
<summary>${t('sec.sites.domainRules')}</summary>
<div class="disclosure-content form-stack">
<form id="domain-rule-form" class="rule-form">
<label class="field">
<span>${t('sec.sites.host')}</span>
<input id="rule-host" required="" placeholder="docs.example.com">
</label>
<label class="field">
<span>${t('sec.sites.pathPrefix')}</span>
<input id="rule-path" required="" value="/">
</label>
<label class="field">
<span>${t('sec.sites.domain')}</span>
<select id="rule-domain">
</select>
</label>
<label class="check-row compact-check">
<input id="rule-subdomains" type="checkbox">
<span>${t('sec.sites.subdomain')}</span>
</label>
<button class="primary-action narrow" type="submit">${t('sec.sites.addRule')}</button>
</form>
<p id="domain-rule-result" class="inline-message" hidden="">
</p>
<div id="domain-rule-list" class="rule-list">
</div>
<div id="domain-rule-empty" class="empty-state compact-empty" hidden="">
<h3>${t('sec.sites.rulesEmpty')}</h3>
</div>
</div>
</details>
</section>

`;
