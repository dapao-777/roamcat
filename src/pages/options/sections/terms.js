/**
 * @file src/pages/options/sections/terms.js
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

export const termsSection = html`
<section id="terms" class="settings-section" aria-labelledby="terms-heading" hidden="">
<div class="section-intro">
<h2 id="terms-heading" class="sr-only">${t('sec.terms.title')}</h2>
<p>${t('sec.terms.desc')}</p>
</div>
<div class="paper-card">
<form id="term-form" class="inline-form">
<label class="field">
<span>${t('sec.terms.en')}</span>
<input id="term-source" required="" autocomplete="off">
</label>
<label class="field">
<span>${t('sec.terms.gloss')}</span>
<input id="term-translation" required="" autocomplete="off">
</label>
<label class="field">
<span>${t('sec.terms.domain')}</span>
<select id="term-domain">
</select>
</label>
<button class="primary-action narrow" type="submit">${t('sec.terms.add')}</button>
</form>
<div id="term-list" class="term-list">
</div>
<div id="term-empty" class="empty-state compact-empty" hidden="">
<h3>${t('sec.terms.empty')}</h3>
</div>
</div>
</section>

`;
