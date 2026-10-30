/**
 * @file src/pages/options/sections/video.js
 * 文件职责：设置页「视频与直播」分区静态模板——YouTube 播放器入口与双语字幕、字幕样式（含仿播放画面的预览）、
 *   云端听写说明与当前订阅状态、Twitch 直播聊天翻译，集中在一处。
 * 主要内容：无绑定静态模板；控件值、预览与听写状态由 options-controller.js 的 optionsRenderVideo 填充，
 *   字幕样式与播放器「字幕设置」菜单读写同一份 settings.video（VIDEO_SETTINGS_PATCH），入口开关走 AUTOMATION_PATCH。
 *   单句循环、每句暂停、影院模式只对当前视频生效，仍只在播放器菜单里。
 * 模块边界：纯展示模板。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {html} from 'lit';
import {t} from '../../../i18n-runtime.js';

const choice = (name, value, label, extra = '') => html`<label class="choice-card-item">
<input type="radio" name=${name} value=${value}>
<div class="choice-card-content"><div class="choice-card-header"><span class="choice-card-title">${extra ? html`<i class="video-color-dot" data-color=${extra} aria-hidden="true"></i>` : ''}${label}</span></div></div>
</label>`;
const segmentRow = (name, label, desc, options) => html`<div class="opt-row opt-row-stack">
<div class="opt-row-text"><span class="opt-row-label" id="${name}-label">${label}</span>${desc ? html`<p class="opt-row-desc">${desc}</p>` : ''}</div>
<div class="choice-card-grid" role="radiogroup" aria-labelledby="${name}-label">${options.map(([value, text, extra]) => choice(name, value, text, extra))}</div>
</div>`;
const switchRow = (id, label, desc) => html`<div class="opt-row">
<div class="opt-row-text"><label for=${id} class="opt-row-label">${label}</label><p class="opt-row-desc">${desc}</p></div>
<div class="opt-row-control"><label class="switch"><input id=${id} type="checkbox"><span aria-hidden="true"></span><span class="sr-only">${label}</span></label></div>
</div>`;

export const videoSection = html`
<section id="video" class="settings-section" aria-labelledby="video-heading" hidden="">
<div class="section-intro">
<h2 id="video-heading" class="sr-only">${t('sec.video.title')}</h2>
<p>${t('sec.video.desc')}</p>
</div>
<div class="opt-group">
<div class="opt-group-head"><h2>${t('sec.video.gYoutube')}</h2><p>${t('sec.video.gYoutubeDesc')}</p></div>
<div class="opt-card">
${switchRow('automation-video-sites', t('sec.video.entry'), t('sec.video.entryDesc'))}
${switchRow('video-bilingual', t('sec.video.bilingual'), t('sec.video.bilingualDesc'))}
</div>
</div>
<div class="opt-group">
<div class="opt-group-head"><h2>${t('sec.video.gStyle')}</h2><p>${t('sec.video.gStyleDesc')}</p></div>
<div class="opt-card">
<div class="opt-row video-preview-row">
<div id="video-caption-preview" class="video-caption-preview" aria-label=${t('sec.video.preview')} role="img">
<div class="vcp-stack">
<p class="vcp-line vcp-translation"><span>${t('sec.video.sampleTranslation')}</span></p>
<p class="vcp-line vcp-original"><span><b data-said>A</b> <b data-said>little</b> <b data-now>help</b> <b>can</b> <b>make</b> <b>a</b> <b class="vcp-hard">difficult</b> <b>sentence</b> <b>clear.</b></span></p>
</div>
</div>
<p class="opt-row-desc video-preview-note">${t('sec.video.previewNote')}</p>
</div>
${segmentRow('video-display', t('sec.video.display'), '', [['bilingual', t('vid.mBilingual')], ['original', t('vid.mOriginal')], ['translation', t('vid.mTranslation')]])}
${segmentRow('video-translation-first', t('sec.video.order'), '', [['true', t('vid.mAbove')], ['false', t('vid.mBelow')]])}
${segmentRow('video-translation-color', t('sec.video.color'), '', [['white', t('vid.mWhite'), 'white'], ['yellow', t('vid.mYellow'), 'yellow'], ['cyan', t('vid.mCyan'), 'cyan']])}
${segmentRow('video-font-size', t('sec.video.size'), t('sec.video.sizeDesc'), [['16', t('vid.mSizeS')], ['20', t('vid.mSizeM')], ['24', t('vid.mSizeL')], ['28', t('vid.mSizeXL')]])}
${switchRow('video-karaoke', t('vid.mKaraoke'), t('sec.video.karaokeDesc'))}
${switchRow('video-blur', t('vid.mBlur'), t('sec.video.blurDesc'))}
<div class="opt-row">
<div class="opt-row-text"><label for="video-theme" class="opt-row-label">${t('sec.video.theme')}</label><p class="opt-row-desc">${t('sec.video.themeDesc')}</p></div>
<div class="opt-row-control"><div class="swiss-select-wrap opt-select-narrow"><select id="video-theme" class="swiss-select">
<option value="auto">${t('opt.themeAuto')}</option>
<option value="light">${t('opt.themeLight')}</option>
<option value="dark">${t('opt.themeDark')}</option>
</select><div class="swiss-select-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round"></path></svg></div></div></div>
</div>
<div class="opt-row" id="video-offset-row" hidden>
<div class="opt-row-text"><span class="opt-row-label">${t('sec.video.offset')}</span><p class="opt-row-desc">${t('sec.video.offsetDesc')}</p></div>
<div class="opt-row-control"><button id="video-reset-offset" class="secondary-button" type="button">${t('vid.mResetPosition')}</button></div>
</div>
</div>
</div>
<div class="opt-group">
<div class="opt-group-head"><h2>${t('sec.video.gDictation')}</h2><p>${t('sec.video.gDictationDesc')}</p></div>
<div class="opt-card">
<div class="opt-row">
<div class="opt-row-text"><span class="opt-row-label">${t('sec.video.dictationService')}</span><p id="video-dictation-status" class="opt-row-desc"></p></div>
<div class="opt-row-control"><a class="text-link-button" href="#service">${t('sec.video.toService')}</a></div>
</div>
<div class="opt-row">
<div class="opt-row-text"><span class="opt-row-label">${t('sec.video.dictationHow')}</span><p class="opt-row-desc">${t('sec.video.dictationHowDesc')}</p></div>
</div>
<div class="opt-row">
<div class="opt-row-text"><span class="opt-row-label">${t('sec.video.dictationData')}</span><p class="opt-row-desc">${t('sec.video.dictationDataDesc')}</p></div>
</div>
</div>
</div>
<div class="opt-group">
<div class="opt-group-head"><h2>${t('sec.video.gLive')}</h2><p>${t('sec.video.gLiveDesc')}</p></div>
<div class="opt-card">
${switchRow('video-live-chat', t('sec.video.liveChat'), t('sec.video.liveChatDesc'))}
<div class="opt-row">
<div class="opt-row-text"><span class="opt-row-label">${t('sec.video.liveLimits')}</span><p class="opt-row-desc">${t('sec.video.liveLimitsDesc')}</p></div>
</div>
</div>
</div>
</section>
`;
