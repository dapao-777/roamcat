/**
 * @file src/pages/options/sections/shortcuts.js
 * 文件职责：设置页「快捷键」分区模板——键盘地图可视化 + 按作用域分组的
 *   快捷键清单 + 改键入口。
 * 主要内容：无绑定静态模板；左侧 .kbd-map 用 data-combos 标注每个键参与的
 *   快捷键组合，右侧 .combo-item 用 data-combo 标识条目，悬停/聚焦条目时由
 *   ui.css 的 :has() 规则点亮对应键位（纯 CSS，无 JS）；查词键字母经
 *   data-lookup-key 由 options-controller 回填当前配置。
 * 模块边界：纯展示模板；「打开浏览器快捷键页」按钮由 options-controller 绑定。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';

const keycap = (label, combos = '', extra = '') =>
  html`<span class="keycap${extra ? ` ${extra}` : ''}${combos ? '' : ' is-ghost'}" data-combos="${combos}">${label}</span>`;

export const shortcutsSection = html`
<section id="shortcuts" class="settings-section guide-section shortcut-section" aria-labelledby="shortcuts-heading" hidden>
  <div class="section-intro">
    <h2 id="shortcuts-heading" class="sr-only">${t('sec.keys.title')}</h2>
    <p>${t('sec.keys.intro')}</p>
  </div>

  <article class="paper-card shortcut-lab-card" aria-labelledby="shortcut-map-heading">
    <span class="guide-eyebrow">${t('sec.keys.mapEyebrow')}</span>
    <h3 id="shortcut-map-heading">${t('sec.keys.mapTitle')}</h3>
    <p class="shortcut-map-desc">${t('sec.keys.mapDesc')}</p>

    <div class="shortcut-lab">
      <div class="kbd-map" role="img" aria-label="${t('sec.keys.mapAria')}">
        <div class="kbd-row">
          ${keycap('Esc', 'esc', 'keycap-wide')}
          <span class="kbd-flex-gap" aria-hidden="true"></span>
          <span class="keycap-slot">
            <span class="keycap keycap-lookup" data-combos="lookup" data-lookup-key>D</span>
            <span class="keycap-slot-tag">${t('sec.keys.slotLabel')}</span>
          </span>
        </div>
        <div class="kbd-row">
          ${keycap('Q')}${keycap('W')}${keycap('E')}${keycap('R')}${keycap('T', 'bilingual')}${keycap('Y')}${keycap('U')}${keycap('I')}${keycap('O')}${keycap('P')}
        </div>
        <div class="kbd-row kbd-row-indent">
          ${keycap('A')}${keycap('S', 'toggle')}${keycap('D')}${keycap('F')}${keycap('G')}${keycap('H')}${keycap('J')}${keycap('K')}${keycap('L')}
        </div>
        <div class="kbd-row">
          ${keycap('Shift', 'toggle bilingual pet', 'keycap-mod')}
          ${keycap('Z')}${keycap('X')}${keycap('C')}${keycap('V')}${keycap('B')}${keycap('N')}${keycap('M', 'pet')}
          ${keycap('Shift', 'toggle bilingual pet', 'keycap-mod')}
        </div>
        <div class="kbd-row">
          ${keycap('Ctrl', '', 'keycap-mod')}
          ${keycap('Alt', 'toggle bilingual pet', 'keycap-mod')}
          ${keycap('', '', 'keycap-space')}
          ${keycap('Alt', 'toggle bilingual pet', 'keycap-mod')}
          ${keycap('Ctrl', '', 'keycap-mod')}
        </div>
      </div>

      <ul class="combo-list">
        <li class="combo-item" data-combo="lookup" tabindex="0">
          <div class="combo-keycaps">
            <kbd class="keycap" data-lookup-key>D</kbd><span class="combo-plus">+</span><span class="combo-gesture">${t('sec.keys.click')}</span>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.lookupName')}</strong><span>${t('sec.keys.lookupDesc')}</span></div>
          <span class="combo-scope scope-page">${t('sec.keys.scopePage')}</span>
        </li>
        <li class="combo-item" data-combo="select" tabindex="0">
          <div class="combo-keycaps">
            <span class="combo-gesture">${t('sec.keys.drag')}</span>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.selectName')}</strong><span>${t('sec.keys.selectDesc')}</span></div>
          <span class="combo-scope scope-mouse">${t('sec.keys.scopeMouse')}</span>
        </li>
        <li class="combo-item" data-combo="esc" tabindex="0">
          <div class="combo-keycaps">
            <kbd class="keycap keycap-wide">Esc</kbd>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.escName')}</strong><span>${t('sec.keys.escDesc')}</span></div>
          <span class="combo-scope scope-page">${t('sec.keys.scopePage')}</span>
        </li>
        <li class="combo-item" data-combo="toggle" tabindex="0">
          <div class="combo-keycaps">
            <kbd class="keycap">Alt</kbd><span class="combo-plus">+</span><kbd class="keycap">Shift</kbd><span class="combo-plus">+</span><kbd class="keycap">S</kbd>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.toggleName')}</strong><span>${t('sec.keys.toggleDesc')}</span></div>
          <span class="combo-scope scope-global">${t('sec.keys.scopeGlobal')}</span>
        </li>
        <li class="combo-item" data-combo="bilingual" tabindex="0">
          <div class="combo-keycaps">
            <kbd class="keycap">Alt</kbd><span class="combo-plus">+</span><kbd class="keycap">Shift</kbd><span class="combo-plus">+</span><kbd class="keycap">T</kbd>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.bilingualName')}</strong><span>${t('sec.keys.bilingualDesc')}</span></div>
          <span class="combo-scope scope-global">${t('sec.keys.scopeGlobal')}</span>
        </li>
        <li class="combo-item" data-combo="pet" tabindex="0">
          <div class="combo-keycaps">
            <kbd class="keycap">Alt</kbd><span class="combo-plus">+</span><kbd class="keycap">Shift</kbd><span class="combo-plus">+</span><kbd class="keycap">M</kbd>
          </div>
          <div class="combo-info"><strong>${t('sec.keys.petName')}</strong><span>${t('sec.keys.petDesc')}</span></div>
          <span class="combo-scope scope-pet">${t('sec.keys.scopePet')}</span>
        </li>
      </ul>
    </div>

    <div class="lookup-flow" aria-hidden="true">
      <span class="lookup-flow-title">${t('sec.keys.flowTitle')}</span>
      <span class="lookup-flow-step"><kbd class="keycap" data-lookup-key>D</kbd> ${t('sec.keys.flowHold')}</span>
      <span class="lookup-flow-arrow">→</span>
      <span class="lookup-flow-step">${t('sec.keys.flowClick')}</span>
      <span class="lookup-flow-arrow">→</span>
      <span class="lookup-flow-step lookup-flow-result">${t('sec.keys.flowCard')}</span>
    </div>
  </article>

  <article class="paper-card guide-scene" aria-labelledby="shortcut-custom-heading">
    <span class="guide-eyebrow">${t('sec.keys.customEyebrow')}</span>
    <h3 id="shortcut-custom-heading">${t('sec.keys.customTitle')}</h3>
    <ol class="guide-list">
      <li><strong>${t('sec.keys.slotLabel')}：</strong>${t('sec.keys.lookupCustomA')}<kbd data-lookup-key>D</kbd>${t('sec.keys.lookupCustomB')}<a href="#assistance">${t('opt.nav.assist')}</a>${t('sec.keys.lookupCustomC')}</li>
      <li><strong>${t('sec.keys.customEyebrow')}：</strong>${t('sec.keys.browserDesc')}</li>
    </ol>
    <p>
      <button type="button" class="secondary-button js-open-shortcuts">${t('sec.keys.openBrowser')}</button>
    </p>
  </article>
</section>
`;
