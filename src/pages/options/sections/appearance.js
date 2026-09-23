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

export const appearanceSection = html`
<section id="appearance" class="settings-section" aria-labelledby="appearance-heading" hidden="">
<div class="section-intro">
<h2 id="appearance-heading" class="sr-only">显示与解构</h2>
<p>一次调整一类显示。预览使用固定示例，不调用模型。</p>
</div>
<div class="paper-card reading-style-workspace">
<div class="section-tabs appearance-tabs" role="tablist" aria-label="调整显示内容">
<button id="appearance-tab-structure" type="button" role="tab" data-appearance-tab="structure" aria-controls="appearance-panel-structure" aria-selected="true" tabindex="0">句子结构</button>
<button id="appearance-tab-original" type="button" role="tab" data-appearance-tab="original" aria-controls="appearance-panel-original" aria-selected="false" tabindex="-1">原词</button>
<button id="appearance-tab-annotation" type="button" role="tab" data-appearance-tab="annotation" aria-controls="appearance-panel-annotation" aria-selected="false" tabindex="-1">词注</button>
<button id="appearance-tab-translation" type="button" role="tab" data-appearance-tab="translation" aria-controls="appearance-panel-translation" aria-selected="false" tabindex="-1">译文</button>
<button id="appearance-tab-video" type="button" role="tab" data-appearance-tab="video" aria-controls="appearance-panel-video" aria-selected="false" tabindex="-1" data-video-feature hidden>视频</button>
</div>
          
          <div class="reading-style-layout">
          <div class="reading-style-editor form-stack">
          
          
          
          
          
          <div id="appearance-panel-structure" role="tabpanel" aria-labelledby="appearance-tab-structure" data-appearance-panel="structure">
<section id="sentence-density-settings" class="reading-style-group sentence-structure-editor" aria-labelledby="sentence-density-heading">
            <h3 id="sentence-density-heading">句子结构</h3>
            
            <fieldset class="sentence-density" aria-describedby="sentence-density-help sentence-density-result">
<legend class="sr-only">解构粒度</legend>
<div class="sentence-density-options">
              <label>
<input type="radio" name="sentence-density" value="coarse">
<span>
<b>粗</b>
<small>突出大结构</small>
</span>
</label>
<label>
<input type="radio" name="sentence-density" value="medium">
<span>
<b>中</b>
<small>显示句子成分</small>
</span>
</label>
<label>
<input type="radio" name="sentence-density" value="fine">
<span>
<b>细</b>
<small>展示最多两层</small>
</span>
</label>
            </div>
</fieldset>
            <fieldset class="sentence-line-style" aria-describedby="sentence-density-help sentence-density-result">
<legend>下划线样式</legend>
<div class="sentence-density-options sentence-line-options">
              <label style="--sentence-line-style:solid">
<input type="radio" name="sentence-line-style" value="solid">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>实线</small>
</span>
</label>
<label style="--sentence-line-style:dashed">
<input type="radio" name="sentence-line-style" value="dashed">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>虚线</small>
</span>
</label>
<label style="--sentence-line-style:dotted">
<input type="radio" name="sentence-line-style" value="dotted">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>点线</small>
</span>
</label>
<label style="--sentence-line-style:wavy">
<input type="radio" name="sentence-line-style" value="wavy">
<span>
<b lang="en" aria-hidden="true">English</b>
<small>波浪线</small>
</span>
</label>
            </div>
</fieldset>
            <p id="sentence-density-help" class="field-help">颜色表示句子成分，线型只改变外观。粒度与线型立即生效，不会额外调用模型。</p>
<p id="sentence-density-result" class="inline-message" role="status" hidden="">
</p>
          <p class="field-help">在弹窗中为本页开启，或到 <a href="#sites">网站规则</a> 设置自动开启。</p>
</section>
</div>
<div id="appearance-panel-original" role="tabpanel" aria-labelledby="appearance-tab-original" data-appearance-panel="original" hidden="">
<fieldset class="reading-style-group" data-reading-layer="original">
<legend>被提示的原词</legend>
<div class="reading-style-controls">
<label class="field">
<span>样式</span>
<select id="reading-original-style">
<option value="default">默认</option>
<option value="plain">纯文本</option>
<option value="color">文字颜色</option>
<option value="dashed">虚线下划线</option>
<option value="background">背景色</option>
<option value="border">边框</option>
<option value="quote">引号强调</option>
</select>
</label>
<label class="field">
<span>字号</span>
<select id="reading-original-size">
<option value="80">80%</option>
<option value="100">100% · 默认</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>颜色</legend>
<div id="reading-original-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>自定义</span>
<input id="reading-original-color" type="color" aria-label="被标注的原文自定义颜色">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-annotation" role="tabpanel" aria-labelledby="appearance-tab-annotation" data-appearance-panel="annotation" hidden="">
<fieldset class="reading-style-group" data-reading-layer="annotation">
<legend>词语上方的释义</legend>
<div class="reading-style-controls">
<label class="field">
<span>样式</span>
<select id="reading-annotation-style">
<option value="default">默认</option>
<option value="plain">纯文本</option>
<option value="color">文字颜色</option>
<option value="dashed">虚线下划线</option>
<option value="background">背景色</option>
<option value="border">边框</option>
<option value="quote">引号强调</option>
</select>
</label>
<label class="field">
<span>字号</span>
<select id="reading-annotation-size">
<option value="80">80%</option>
<option value="100">100% · 默认</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>颜色</legend>
<div id="reading-annotation-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>自定义</span>
<input id="reading-annotation-color" type="color" aria-label="顶部标注自定义颜色">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-translation" role="tabpanel" aria-labelledby="appearance-tab-translation" data-appearance-panel="translation" hidden="">
<fieldset class="reading-style-group" data-reading-layer="translation">
<legend>段落译文</legend>
<div class="reading-style-controls">
<label class="field">
<span>样式</span>
<select id="reading-translation-style">
<option value="default">默认</option>
<option value="plain">纯文本</option>
<option value="color">文字颜色</option>
<option value="dashed">虚线下划线</option>
<option value="background">背景色</option>
<option value="border">边框</option>
<option value="quote">引用侧线</option>
</select>
</label>
<label class="field">
<span>字号</span>
<select id="reading-translation-size">
<option value="80">80%</option>
<option value="100">100% · 默认</option>
<option value="115">115%</option>
<option value="130">130%</option>
<option value="150">150%</option>
</select>
</label>
</div>
<fieldset class="reading-color-field">
<legend>颜色</legend>
<div id="reading-translation-palette" class="reading-color-presets">
</div>
<label class="reading-custom-color">
<span>自定义</span>
<input id="reading-translation-color" type="color" aria-label="段落译文自定义颜色">
</label>
</fieldset>
</fieldset>
</div>
<div id="appearance-panel-video" role="tabpanel" aria-labelledby="appearance-tab-video" data-appearance-panel="video" hidden="">
<div class="form-grid">
<label class="field">
<span>字号</span>
<select id="video-font-size">
<option value="16">16 px</option>
<option value="20">20 px</option>
<option value="24">24 px</option>
<option value="28">28 px</option>
</select>
</label>
<label class="field">
<span>主题</span>
<select id="video-theme">
<option value="auto">跟随系统</option>
<option value="light">浅色</option>
<option value="dark">深色</option>
</select>
</label>
</div>
</div>
<div class="provider-actions">
<button id="reset-reading-style" class="secondary-button" type="button">恢复标注默认样式</button>
<span class="field-help">仅恢复原词、词注和译文的样式。</span>
</div>
</div>
          <aside class="style-preview" aria-labelledby="reading-style-preview-heading">
<h3 id="reading-style-preview-heading">实时预览</h3>
            <section id="sentence-structure-preview" class="sentence-structure-preview" aria-labelledby="sentence-structure-preview-heading">
<h4 id="sentence-structure-preview-heading">阅读解构</h4>
<div class="sentence-preview-page">
<p id="sentence-preview-source" lang="en">Careful readers compare the evidence that each explanation provides before they reach a conclusion.</p>
</div>
<div class="structure-legend-row" aria-label="句子成分图例">
  <span class="structure-legend-item" data-role="subject"><i class="legend-dot"></i>主语</span>
  <span class="structure-legend-item" data-role="predicate"><i class="legend-dot"></i>谓语 (核心动词)</span>
  <span class="structure-legend-item" data-role="object"><i class="legend-dot"></i>宾语</span>
  <span class="structure-legend-item" data-role="attributive"><i class="legend-dot"></i>定语</span>
  <span class="structure-legend-item" data-role="adverbial"><i class="legend-dot"></i>状语</span>
</div>
<p class="field-help">固定示例，不调用模型；下划线颜色分层标注主谓宾主干与从句修饰，真实网页效果一致。</p>
</section>
            <iframe id="reading-style-preview" title="原词、词注与段译样式实时预览" sandbox="allow-same-origin" hidden="">
</iframe>
<p class="field-help" id="reading-preview-note">预览不改变网页，也不产生模型用量。</p>
          <section id="video-style-preview" hidden="" class="video-style-preview" aria-label="视频原文样式预览">
<p lang="en">A little help can make a difficult sentence clear.</p>
<small>视频原文稿示例</small>
</section>
</aside>
          </div>
        </div>
</section>

`;
