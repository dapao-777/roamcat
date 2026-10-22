/**
 * @file src/pages/options/sections/privacy.js
 * 文件职责：设置页「数据与隐私」分区模板——词档案 / 阅读与提示数据 / 权限与彻底清理三组。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 与 history.js 命令式填充），
 *   每个操作占一行：左侧说明影响范围、右侧按钮；清空类操作由控制器二次确认。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';

export const privacySection = html`
<section id="privacy" class="settings-section data-section" aria-labelledby="privacy-heading" hidden="">
      <div class="section-intro"><h2 id="privacy-heading" class="sr-only">${t('sec.privacy.title')}</h2><p>${t('sec.privacy.desc')}</p></div>
      <p id="data-problem" class="notice error" role="alert" hidden=""></p>
      <div class="opt-group">
        <div class="opt-group-head"><h2>${t('sec.privacy.gProfile')}</h2></div>
        <div class="opt-card">
          <div class="opt-row">
            <div class="opt-row-text"><label for="remember-support" class="opt-row-label">${t('sec.privacy.remember')}</label><p class="opt-row-desc">${t('sec.privacy.rememberDesc')}</p></div>
            <div class="opt-row-control"><label class="switch"><input id="remember-support" type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${t('sec.privacy.remember')}</span></label></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.export')}</span><p class="opt-row-desc">${t('sec.privacy.exportDesc')}</p><span id="data-result" class="inline-message" aria-live="polite"></span></div>
            <div class="opt-row-control"><button id="export-data" class="secondary-button" type="button">${t('sec.privacy.exportBtn')}</button></div>
          </div>
        </div>
      </div>
      <div class="opt-group history-data-actions">
        <div class="opt-group-head"><h2>${t('sec.privacy.dataTitle')}</h2><p>${t('sec.privacy.dataDesc')}</p></div>
        <div class="opt-card">
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.exportHistory')}</span><p class="opt-row-desc">${t('sec.privacy.exportHistoryDesc')}</p></div>
            <div class="opt-row-control"><button id="history-export" class="secondary-button" type="button">${t('sec.privacy.exportBtn')}</button></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.clearHistory')}</span><p class="opt-row-desc">${t('sec.privacy.clearNote')}</p><span id="history-action-result" class="inline-message" aria-live="polite"></span></div>
            <div class="opt-row-control"><button id="history-clear" class="danger-button" type="button">${t('sec.privacy.clearBtn')}</button></div>
          </div>
        </div>
      </div>
      <div class="opt-group">
        <div class="opt-group-head"><h2>${t('sec.privacy.gDanger')}</h2></div>
        <div class="opt-card">
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.reset')}</span><p class="opt-row-desc">${t('sec.privacy.resetDesc')}</p></div>
            <div class="opt-row-control"><button id="reset-config" class="secondary-button" type="button">${t('sec.privacy.resetBtn')}</button></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.perms')}</span><p class="opt-row-desc">${t('sec.privacy.permsDesc')}</p></div>
            <div class="opt-row-control"><button id="open-extension-manager" class="secondary-button" type="button">${t('sec.privacy.openMgr')}</button></div>
          </div>
          <div class="opt-row">
            <div class="opt-row-text"><span class="opt-row-label">${t('sec.privacy.clearAll')}</span><p class="opt-row-desc">${t('sec.privacy.clearAllDesc')}</p></div>
            <div class="opt-row-control"><button id="clear-memory" class="danger-button" type="button">${t('sec.privacy.clearAllBtn')}</button></div>
          </div>
        </div>
      </div>
</section>
`;
