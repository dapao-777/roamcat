/**
 * @file src/pages/options/sections/appearance.js
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

export const appearanceSection = html`
<section id="appearance" class="settings-section" aria-labelledby="appearance-heading" hidden="">
<div class="section-intro">
<h2 id="appearance-heading" class="sr-only">${t('sec.ap.title')}</h2>
<p>${t('sec.ap.desc')}</p>
</div>
<div class="paper-card">
<div class="settings-group">
<h3>${t('common.language')}</h3>
<p class="group-desc">${t('sec.ap.langCard')}</p>
<fieldset class="sentence-density">
<legend class="sr-only">${t('common.language')}</legend>
<div class="sentence-density-options">
              <label>
<input type="radio" name="ui-lang" value="auto">
<span>
<b>${t('sec.ap.langAutoS')}</b>
<small>${t('sec.ap.langAutoD')}</small>
</span>
</label>
<label>
<input type="radio" name="ui-lang" value="zh">
<span>
<b>${t('common.langZh')}</b>
<small>${t('common.langZhDesc')}</small>
</span>
</label>
<label>
<input type="radio" name="ui-lang" value="en">
<span>
<b>${t('common.langEn')}</b>
<small>${t('common.langEnDesc')}</small>
</span>
</label>
            </div>
</fieldset>
</div>
</div>
<div class="paper-card reading-style-workspace">
<div class="section-tabs appearance-tabs" role="tablist" aria-label="${t('sec.ap.tabs')}">
<button id="appearance-tab-structure" type="button" role="tab" data-appearance-tab="structure" aria-controls="appearance-panel-structure" aria-selected="true" tabindex="0">${t('sec.ap.tabStructure')}</button>
<button id="appearance-tab-original" type="button" role="tab" data-appearance-tab="original" aria-controls="appearance-panel-original" aria-selected="false" tabindex="-1">${t('sec.ap.tabOriginal')}</button>
<button id="appearance-tab-annotation" type="button" role="tab" data-appearance-tab="annotation" aria-controls="appearance-panel-annotation" aria-selected="false" tabindex="-1">${t('sec.ap.tabAnnotation')}</button>
<button id="appearance-tab-translation" type="button" role="tab" data-appearance-tab="translation" aria-controls="appearance-panel-translation" aria-selected="false" tabindex="-1">${t('sec.ap.tabTranslation')}</button>
<button id="appearance-tab-video" type="button" role="tab" data-appearance-tab="video" aria-controls="appearance-panel-video" aria-selected="false" tabindex="-1" data-video-feature hidden>${t('sec.ap.tabVideo')}</button>
</div>
          
          <div class="reading-style-layout">
          <div class="reading-style-editor form-stack">
          
          
          
          
          
          <div id="appearance-panel-structure" role="tabpanel" aria-labelledby="appearance-tab-structure" data-appearance-panel="structure">
<section id="sentence-density-settings" class="reading-style-group sentence-structure-editor" aria-labelledby="sentence-density-heading">
            <h3 id="sentence-density-heading">${t('sec.ap.structure')}</h3>
            
            <fieldset class="sentence-density" aria-describedby="sentence-density-help sentence-density-result">
<legend class="sr-only">${t('sec.ap.density')}</legend>
<div class="sentence-density-options">
              <label>
<input type="radio" name="sentence-density" value="coarse">
<span>
<b>${t('sec.ap.coarse')}</b>
<small>${t('sec.ap.coarseDesc')}</small>
</span>
</label>
<label>
<input type="radio" name="sentence-density" value="medium">
<span>
<b>${t('sec.ap.medium')}</b>
<small>${t('sec.ap.mediumDesc')}</small>
</span>
</label>
<label>
<input type="radio" name="sentence-density" value="fine">
<span>
<b>${t('sec.ap.fine')}</b>
<small>${t('sec.ap.fineDesc')}</small>
</span>
</label>
            </div>
</fieldset>
            <fieldset class="sentence-line-style" aria-describedby="sentence-density-help sentence-density-result">
<legend>${t('sec.ap.lineStyle')}</legend>
<div class="sentence-density-options sentence-line-options">
              <label style="--sentence-line-style:solid">
<input type="radio" name="sentence-line-style" value="solid">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>${t('sec.ap.solid')}</small>
</span>
</label>
<label style="--sentence-line-style:dashed">
<input type="radio" name="sentence-line-style" value="dashed">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>${t('sec.ap.dashed')}</small>
</span>
</label>
<label style="--sentence-line-style:dotted">
<input type="radio" name="sentence-line-style" value="dotted">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>${t('sec.ap.dotted')}</small>
</span>
</label>
<label style="--sentence-line-style:wavy">
<input type="radio" name="sentence-line-style" value="wavy">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>${t('sec.ap.wavy')}</small>
</span>
</label>
            </div>
</fieldset>
            <p id="sentence-density-help" class="field-help">${t('sec.ap.densityHelp')}</p>
<p id="sentence-density-result" class="inline-message" role="status" hidden="">
</p>
          <p class="field-help">${t('sec.ap.enableHint')}<a href="#sites">${t('opt.nav.sites')}</a>${t('sec.ap.enableHintB')}</p>
</section>
</div>
<div id="appearance-panel-original" role="tabpanel" aria-labelledby="appearance-tab-original" data-appearance-panel="original" hidden="">
<fieldset class="reading-style-group" data-reading-layer="original">
<legend>${t('sec.ap.original')}</legend>
<div class="reading-style-controls">
<label class="field">
<span>${t('sec.ap.style')}</span>
<select id="reading-original-style">
<option value="default">${t('sec.ap.optDefault')}</option>
<option value="plain">${t('sec.ap.optPlain')}</option>
<option value="color">${t('sec.ap.optColor')}</option>
<option value="dashed">${t('sec.ap.optDashed')}</option>
<option value="background">${t('sec.ap.optBg')}</option>
<option value="border">${t('sec.ap.optBorder')}</option>
<option value="quote">${t('sec.ap.optQuote')}</option>
</select>
</label>
<label class="field">
<span>${t('sec.ap.fontSize')}</span>
<select id="reading-original-size">
<option value="80">80%</option>
<option value="100">${t('sec.ap.fsDefault')}</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>${t('sec.ap.color')}</legend>
<div id="reading-original-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>${t('sec.ap.custom')}</span>
<input id="reading-original-color" type="color" aria-label="${t('sec.ap.origColor')}">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-annotation" role="tabpanel" aria-labelledby="appearance-tab-annotation" data-appearance-panel="annotation" hidden="">
<fieldset class="reading-style-group" data-reading-layer="annotation">
<legend>${t('sec.ap.annotation')}</legend>
<div class="reading-style-controls">
<label class="field">
<span>${t('sec.ap.style')}</span>
<select id="reading-annotation-style">
<option value="default">${t('sec.ap.optDefault')}</option>
<option value="plain">${t('sec.ap.optPlain')}</option>
<option value="color">${t('sec.ap.optColor')}</option>
<option value="dashed">${t('sec.ap.optDashed')}</option>
<option value="background">${t('sec.ap.optBg')}</option>
<option value="border">${t('sec.ap.optBorder')}</option>
<option value="quote">${t('sec.ap.optQuote')}</option>
</select>
</label>
<label class="field">
<span>${t('sec.ap.fontSize')}</span>
<select id="reading-annotation-size">
<option value="80">80%</option>
<option value="100">${t('sec.ap.fsDefault')}</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>${t('sec.ap.color')}</legend>
<div id="reading-annotation-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>${t('sec.ap.custom')}</span>
<input id="reading-annotation-color" type="color" aria-label="${t('sec.ap.annoColor')}">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-translation" role="tabpanel" aria-labelledby="appearance-tab-translation" data-appearance-panel="translation" hidden="">
<fieldset class="reading-style-group" data-reading-layer="translation">
<legend>${t('sec.ap.translation')}</legend>
<div class="reading-style-controls">
<label class="field">
<span>${t('sec.ap.style')}</span>
<select id="reading-translation-style">
<option value="default">${t('sec.ap.optDefault')}</option>
<option value="plain">${t('sec.ap.optPlain')}</option>
<option value="color">${t('sec.ap.optColor')}</option>
<option value="dashed">${t('sec.ap.optDashed')}</option>
<option value="background">${t('sec.ap.optBg')}</option>
<option value="border">${t('sec.ap.optBorder')}</option>
<option value="quote">${t('sec.ap.optSide')}</option>
</select>
</label>
<label class="field">
<span>${t('sec.ap.fontSize')}</span>
<select id="reading-translation-size">
<option value="80">80%</option>
<option value="100">${t('sec.ap.fsDefault')}</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>${t('sec.ap.color')}</legend>
<div id="reading-translation-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>${t('sec.ap.custom')}</span>
<input id="reading-translation-color" type="color" aria-label="${t('sec.ap.transColor')}">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-video" role="tabpanel" aria-labelledby="appearance-tab-video" data-appearance-panel="video" hidden="">
<div class="form-grid">
<label class="field">
<span>${t('sec.ap.fontSize')}</span>
<select id="video-font-size">
<option value="16">16 px</option>
<option value="20">20 px</option>
<option value="24">24 px</option>
<option value="28">28 px</option>
</select>
</label>
<label class="field">
<span>${t('sec.ap.theme')}</span>
<select id="video-theme">
<option value="auto">${t('opt.themeAuto')}</option>
<option value="light">${t('opt.themeLight')}</option>
<option value="dark">${t('opt.themeDark')}</option>
</select>
</label>
</div>
</div>
<div class="provider-actions">
<button id="reset-reading-style" class="secondary-button" type="button">${t('sec.ap.reset')}</button>
<span class="field-help">${t('sec.ap.resetNote')}</span>
</div>
</div>
          <aside class="style-preview" aria-labelledby="reading-style-preview-heading">
<h3 id="reading-style-preview-heading">${t('sec.ap.preview')}</h3>
            <section id="sentence-structure-preview" class="sentence-structure-preview" aria-labelledby="sentence-structure-preview-heading">
<h4 id="sentence-structure-preview-heading">${t('widget.structure')}</h4>
<div class="sentence-preview-page">
<p id="sentence-preview-source" lang="en">Careful readers compare the evidence that each explanation provides before they reach a conclusion.</p>
</div>
<div class="structure-legend-row" aria-label="${t('sec.ap.legendAria')}">
  <span class="structure-legend-item" data-role="subject"><i class="legend-dot"></i>${t('sec.ap.subj')}</span>
  <span class="structure-legend-item" data-role="predicate"><i class="legend-dot"></i>${t('sec.ap.pred')}</span>
  <span class="structure-legend-item" data-role="object"><i class="legend-dot"></i>${t('sec.ap.obj')}</span>
  <span class="structure-legend-item" data-role="attributive"><i class="legend-dot"></i>${t('sec.ap.attr')}</span>
  <span class="structure-legend-item" data-role="adverbial"><i class="legend-dot"></i>${t('sec.ap.adv')}</span>
</div>
<p class="field-help">${t('sec.ap.previewHelp')}</p>
</section>
            <iframe id="reading-style-preview" title="${t('sec.ap.iframeTitle')}" sandbox="allow-same-origin" hidden="">
</iframe>
<p class="field-help" id="reading-preview-note">${t('sec.ap.previewNote')}</p>
          <section id="video-style-preview" hidden="" class="video-style-preview" aria-label="${t('sec.ap.videoPrev')}">
<p lang="en">A little help can make a difficult sentence clear.</p>
<small>${t('sec.ap.videoDemo')}</small>
</section>
</aside>
          </div>
        </div>
</section>

`;
