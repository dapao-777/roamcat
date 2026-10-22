/**
 * @file src/pages/options/sections/assistance.js
 * 文件职责：设置页「阅读偏好」分区模板——查词 / 伴读猫 / 阅读增强三组设置。
 * 主要内容：无绑定静态模板（动态内容由 options-controller.js 命令式填充），
 *   每组 = 组标题 + 一张 opt-card，卡内逐行 opt-row（左说明、右控件）；
 *   控件 id/name 与控制器契约保持不变。默认领域已移到「领域识别」，
 *   句子解构粒度只在「显示与解构」调整。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';

const selectArrow = html`<div class="swiss-select-arrow">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
    <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
</div>`;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const assistanceSection = html`
        <section id="assistance" class="settings-section" aria-labelledby="section-title">
          <!-- 查词：触发方式与显示方式 -->
          <div class="opt-group" data-purpose="setting-block-assistance">
            <div class="opt-group-head">
              <h2>${t('sec.assist.gLookup')}</h2>
              <p>${t('sec.assist.gLookupDesc')}</p>
            </div>
            <div class="opt-card">
              <div class="opt-row opt-row-stack">
                <div class="opt-row-text">
                  <span class="opt-row-label">${t('sec.assist.mode')}</span>
                  <p class="opt-row-desc">${t('sec.assist.modeDesc')}</p>
                </div>
                <div class="choice-card-grid two-col">
                  <label class="choice-card-item is-selected">
                    <input type="radio" name="assistance-mode" value="ambient" checked>
                    <div class="choice-card-content"><span class="choice-illustration art-ambient" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                      <div class="choice-card-header"><span class="choice-card-title">${t('sec.assist.auto')}</span></div>
                      <p class="choice-card-desc">${t('sec.assist.autoDesc')}</p>
                    </div>
                  </label>
                  <label class="choice-card-item">
                    <input type="radio" name="assistance-mode" value="on-demand">
                    <div class="choice-card-content"><span class="choice-illustration art-demand" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                      <div class="choice-card-header"><span class="choice-card-title">${t('sec.assist.manual')}</span></div>
                      <p class="choice-card-desc">${t('sec.assist.manualDesc')}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="opt-row opt-row-stack" data-purpose="setting-block-display-mode">
                <div class="opt-row-text">
                  <span class="opt-row-label">${t('sec.assist.hud')}</span>
                  <p class="opt-row-desc">${t('sec.assist.hudDesc')}</p>
                </div>
                <div class="choice-card-grid two-col">
                  <label class="choice-card-item is-selected">
                    <input type="radio" name="lookup-display" value="card" checked>
                    <div class="choice-card-content"><span class="choice-illustration art-card" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                      <div class="choice-card-header"><span class="choice-card-title">${t('sec.assist.card')}</span></div>
                      <p class="choice-card-desc">${t('sec.assist.cardDesc')}</p>
                    </div>
                  </label>
                  <label class="choice-card-item">
                    <input type="radio" name="lookup-display" value="annotation">
                    <div class="choice-card-content"><span class="choice-illustration art-annotation" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><b></b></span>
                      <div class="choice-card-header"><span class="choice-card-title">${t('sec.assist.ruby')}</span></div>
                      <p class="choice-card-desc">${t('sec.assist.rubyDesc')}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div class="opt-row" data-purpose="setting-block-hotkey">
                <div class="opt-row-text">
                  <label for="lookup-key" class="opt-row-label">${t('sec.assist.key')}</label>
                  <p class="opt-row-desc">${t('sec.assist.keyDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <div id="keycap-badge" class="keycap-box" data-lookup-key title="${t('sec.assist.keyTitle')}" aria-hidden="true">D</div>
                  <div class="swiss-select-wrap opt-select-narrow">
                    <select id="lookup-key" class="swiss-select">
                      ${LETTERS.map(letter => html`<option ?selected=${letter === 'D'}>${letter}</option>`)}
                    </select>
                    ${selectArrow}
                  </div>
                </div>
              </div>

              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="help-language" class="opt-row-label">${t('sec.assist.lang')}</label>
                  <p class="opt-row-desc">${t('sec.assist.langDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <div class="swiss-select-wrap">
                    <select id="help-language" class="swiss-select">
                      <option value="zh">${t('sec.assist.langZh')}</option>
                      <option value="en">${t('sec.assist.langEn')}</option>
                    </select>
                    ${selectArrow}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 伴读猫 -->
          <div id="setting-block-floating-pet" class="opt-group" data-purpose="setting-block-floating-pet">
            <div class="opt-group-head">
              <h2>${t('sec.assist.pet')}</h2>
              <p>${t('sec.assist.petDesc')}</p>
            </div>
            <div class="opt-card">
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="floating-pet-enabled" class="opt-row-label">${t('sec.assist.petEnable')}</label>
                  <p class="opt-row-desc">${t('sec.assist.petEnableDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <label class="switch" title="${t('sec.assist.petSwitch')}">
                    <input id="floating-pet-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.petEnable')}</span>
                  </label>
                </div>
              </div>
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="floating-pet-theme" class="opt-row-label">${t('sec.assist.petTheme')}</label>
                  <p class="opt-row-desc">${t('sec.assist.petThemeDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <div class="swiss-select-wrap">
                    <select id="floating-pet-theme" class="swiss-select">
                      <option value="auto">${t('sec.assist.petAuto')}</option>
                      <option value="dark">${t('sec.assist.petDark')}</option>
                      <option value="light">${t('sec.assist.petLight')}</option>
                    </select>
                    ${selectArrow}
                  </div>
                </div>
              </div>
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="floating-pet-quotes-enabled" class="opt-row-label">${t('sec.assist.petQuotes')}</label>
                  <p class="opt-row-desc">${t('sec.assist.petQuotesDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <div class="swiss-select-wrap opt-select-narrow">
                    <select id="floating-pet-quotes-interval" class="swiss-select" title="${t('sec.assist.petQuotesInterval')}" aria-label="${t('sec.assist.petQuotesInterval')}">
                      <option value="15">${t('sec.assist.pet15')}</option>
                      <option value="30">${t('sec.assist.pet30')}</option>
                      <option value="60">${t('sec.assist.pet60')}</option>
                    </select>
                    ${selectArrow}
                  </div>
                  <label class="switch" title="${t('sec.assist.petQuotesSwitch')}">
                    <input id="floating-pet-quotes-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.petQuotes')}</span>
                  </label>
                </div>
              </div>
              <div class="opt-row">
                <div class="opt-row-text">
                  <span class="opt-row-label">${t('sec.assist.petResetLabel')}</span>
                  <p class="opt-row-desc">${t('sec.assist.petResetHint')}</p>
                </div>
                <div class="opt-row-control">
                  <button type="button" id="floating-pet-reset-pos" class="secondary-button">${t('sec.assist.petReset')}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 阅读增强：长难句 / 公式 / PDF·电子书 -->
          <div class="opt-group" data-purpose="setting-block-reading-boost">
            <div class="opt-group-head">
              <h2>${t('sec.assist.enhance')}</h2>
              <p>${t('sec.assist.enhanceDesc')}</p>
            </div>
            <div class="opt-card">
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="complex-assist-enabled" class="opt-row-label">${t('sec.assist.hard')}</label>
                  <p class="opt-row-desc">${t('sec.assist.hardDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <label class="switch" title="${t('sec.assist.hardSwitch')}">
                    <input id="complex-assist-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.hard')}</span>
                  </label>
                </div>
              </div>
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="formula-assist-enabled" class="opt-row-label">${t('sec.assist.formula')}</label>
                  <p class="opt-row-desc">${t('sec.assist.formulaDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <label class="switch" title="${t('sec.assist.formulaSwitch')}">
                    <input id="formula-assist-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.formula')}</span>
                  </label>
                </div>
              </div>
              <div class="opt-row">
                <div class="opt-row-text">
                  <label for="pdf-reader-enabled" class="opt-row-label">${t('sec.assist.reader')}</label>
                  <p class="opt-row-desc">${t('sec.assist.readerDesc')}</p>
                </div>
                <div class="opt-row-control">
                  <a class="text-link-button" href="reader.html" target="_blank" rel="noopener">${t('sec.assist.readerOpen')}</a>
                  <label class="switch" title="${t('sec.assist.readerSwitch')}">
                    <input id="pdf-reader-enabled" type="checkbox" checked>
                    <span aria-hidden="true"></span>
                    <span class="sr-only">${t('sec.assist.reader')}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

`;
