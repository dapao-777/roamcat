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

export const termsSection = html`
<section id="terms" class="settings-section" aria-labelledby="terms-heading" hidden="">
<div class="section-intro">
<h2 id="terms-heading" class="sr-only">固定术语</h2>
<p>保存你希望沿用的参考译法，按领域管理。</p>
</div>
<div class="paper-card">
<form id="term-form" class="inline-form">
<label class="field">
<span>英文术语</span>
<input id="term-source" required="" autocomplete="off">
</label>
<label class="field">
<span>参考译法</span>
<input id="term-translation" required="" autocomplete="off">
</label>
<label class="field">
<span>领域</span>
<select id="term-domain">
</select>
</label>
<button class="primary-action narrow" type="submit">添加术语</button>
</form>
<div id="term-list" class="term-list">
</div>
<div id="term-empty" class="empty-state compact-empty" hidden="">
<h3>还没有自定义术语</h3>
</div>
</div>
</section>

`;
