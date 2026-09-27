/**
 * @file src/pages/options/sections/guide.js
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

export const guideSection = html`
<section id="guide" class="settings-section guide-section" aria-labelledby="guide-heading" hidden>
  <div class="section-intro">
    <h2 id="guide-heading" class="sr-only">${t('sec.guide.title')}</h2>
    <p>${t('sec.guide.intro')}</p>
  </div>
  <article class="paper-card guide-start welcome-revisit-banner" style="background: linear-gradient(135deg, var(--color-amber-soft), var(--color-brand-green-soft)); border: 1px solid var(--color-brand-green-border); margin-bottom: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
      <div>
        <span class="guide-eyebrow" style="color: var(--color-brand-green); font-weight: 700;">${t('sec.guide.onboardEyebrow')}</span>
        <h3 style="margin: 4px 0 6px 0;">${t('sec.guide.onboardTitle')}</h3>
        <p style="margin: 0; color: var(--color-text-secondary, #94a3b8); font-size: 13.5px;">${t('sec.guide.onboardDesc')}</p>
      </div>
      <button type="button" class="js-open-welcome primary-action" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: var(--radius-pill); font-weight: 600; font-size: 13px; cursor: pointer;">
        <span>${t('sec.guide.onboardBtn')}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    </div>
  </article>
  <article class="paper-card guide-start">
    <span class="guide-eyebrow">${t('sec.guide.guideEyebrow')}</span>
    <h3>${t('sec.guide.lede')}</h3>
    <p><strong>${t('sec.guide.ledeA')}</strong>${t('sec.guide.ledeDesc1')}<strong>${t('sec.guide.ledeB')}</strong>${t('sec.guide.ledeDesc2')}</p>
    <p>${t('sec.guide.firstUse1')}<a href="#service">${t('opt.nav.model')}</a>${t('sec.guide.firstUse2')}<a href="#sites">${t('opt.nav.sites')}</a>${t('sec.guide.firstUse3')}</p>
    <p>${t('sec.guide.keysLinkA')}<a href="#shortcuts">${t('opt.nav.shortcuts')}</a>${t('sec.guide.keysLinkB')}</p>
  </article>

  <article class="paper-card guide-scene" aria-labelledby="guide-annotation-heading">
    <span class="guide-eyebrow">${t('sec.guide.sec01')}</span>
    <h3 id="guide-annotation-heading">${t('sec.guide.sec01Title')}</h3>
    <p>${t('sec.guide.sec01Desc')}</p>
    <figure class="guide-demo">
      <p class="guide-example" lang="en">The cache reduces <ruby class="guide-word">latency<rt>delay</rt></ruby>.</p>
      <figcaption>${t('sec.guide.sec01Cap')}</figcaption>
    </figure>
    <ol class="guide-list">
      <li><strong>${t('sec.guide.liLookup')}</strong>${t('sec.guide.liLookupA')}<kbd data-lookup-key>D</kbd>${t('sec.guide.liLookupB')}</li>
      <li><strong>${t('sec.guide.liStyle')}</strong>${t('sec.guide.liStyleA')}<a href="#assistance">${t('opt.nav.assist')}</a>${t('sec.guide.liStyleB')}</li>
      <li><strong>${t('sec.guide.liMore')}</strong>${t('sec.guide.liMoreDesc')}</li>
    </ol>
    <p>${t('sec.guide.autoHint')}</p>
    <details class="guide-note">
      <summary>${t('sec.guide.faqMark')}</summary>
      <div>
        <p>${t('sec.guide.faqMarkA')}<strong>${t('sec.guide.faqMarkB')}</strong>${t('sec.guide.faqMarkC')}<strong>${t('sec.guide.faqMarkD')}</strong>${t('sec.guide.faqMarkE')}</p>
        <p>${t('sec.guide.faqRefA')}<a href="#appearance">${t('opt.nav.appearance')}</a>${t('sec.guide.faqRefB')}</p>
      </div>
    </details>
  </article>

  <article class="paper-card guide-scene guide-structure" aria-labelledby="guide-structure-heading">
    <span class="guide-eyebrow">${t('sec.guide.sec02')}</span>
    <h3 id="guide-structure-heading">${t('sec.guide.sec02Title')}</h3>
    <p>${t('sec.guide.sec02Desc')}</p>
    <figure class="guide-demo">
      <p class="guide-example" lang="en">When requests repeat, <strong>the cache reduces latency</strong>.</p>
      <figcaption>${t('sec.guide.sec02Cap')}</figcaption>
      <dl class="guide-definitions">
        <div><dt>${t('sec.guide.trunkTitle')}</dt><dd><span lang="en">The cache</span>${t('sec.guide.trunkD1')}<span lang="en">reduces</span>${t('sec.guide.trunkD2')}<span lang="en">latency</span>${t('sec.guide.trunkD3')}</dd></div>
        <div><dt>${t('sec.guide.condTitle')}</dt><dd><span lang="en">When requests repeat</span>${t('sec.guide.condDesc')}</dd></div>
      </dl>
    </figure>
    <ol class="guide-list">
      <li><strong>${t('sec.guide.liEnable')}</strong>${t('sec.guide.liEnableDesc')}</li>
      <li><strong>${t('sec.guide.liRead')}</strong>${t('sec.guide.liReadDesc')}</li>
      <li><strong>${t('sec.guide.liDensity')}</strong>${t('sec.guide.liDensityA')}<a href="#appearance">${t('opt.nav.appearance')}</a>${t('sec.guide.liDensityB')}</li>
    </ol>
    <p><strong>${t('sec.guide.notWords')}</strong>${t('sec.guide.notWordsDesc')}</p>
  </article>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>${t('sec.guide.sec03')}</summary>
    <div>
      <p>${t('sec.guide.sec03Desc')}</p>
      <figure class="memory-circuit-card" aria-label="${t('sec.guide.circuitAria')}">
        <div class="circuit-header">
          <div class="circuit-header-left">
            <span class="circuit-tag">${t('sec.guide.circuitTag')}</span>
            <span class="circuit-title">${t('sec.guide.circuitTitle')}</span>
          </div>
          <span class="circuit-meta-note">${t('sec.guide.circuitMeta')}</span>
        </div>
        <div class="circuit-rail" aria-hidden="true">
          <svg class="circuit-svg-wire" viewBox="0 0 600 20" preserveAspectRatio="none">
            <path d="M 0 10 L 600 10" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.5" stroke-dasharray="3 3"></path>
            <path d="M 0 10 L 600 10" stroke="currentColor" stroke-width="1.5" stroke-dasharray="10 44" opacity="0.9" stroke-linecap="round">
              <animate attributeName="stroke-dashoffset" from="54" to="0" dur="2.2s" repeatCount="indefinite"></animate>
            </path>
          </svg>
          <span class="rail-station" style="left:12.5%;"></span>
          <span class="rail-station" style="left:37.5%;opacity:0.75;"></span>
          <span class="rail-station" style="left:62.5%;opacity:0.55;"></span>
          <span class="rail-station" style="left:87.5%;"></span>
        </div>
        <div class="circuit-track-container">
          <div class="circuit-node node-stage-1" title="${t('sec.guide.n1Title')}">
            <div class="node-pin-row"><span class="node-pulse-dot"></span><span class="node-step-id">${t('sec.guide.n1Step')}</span></div>
            <div class="node-name">${t('sec.guide.n1Name')}</div>
            <div class="node-desc">${t('sec.guide.n1Desc')}</div>
            <div class="node-metric-pill">${t('sec.guide.n1Pill')}</div>
          </div>
          <div class="circuit-node node-stage-2" title="${t('sec.guide.n2Title')}">
            <div class="node-pin-row"><span class="node-pulse-dot" style="opacity:0.8;"></span><span class="node-step-id">${t('sec.guide.n2Step')}</span></div>
            <div class="node-name">${t('sec.guide.n2Name')}</div>
            <div class="node-desc">${t('sec.guide.n2Desc')}</div>
            <div class="node-metric-pill">${t('sec.guide.n2Pill')}</div>
          </div>
          <div class="circuit-node node-stage-3" title="${t('sec.guide.n3Title')}">
            <div class="node-pin-row"><span class="node-pulse-dot" style="opacity:0.6;"></span><span class="node-step-id">${t('sec.guide.n3Step')}</span></div>
            <div class="node-name">${t('sec.guide.n3Name')}</div>
            <div class="node-desc">${t('sec.guide.n3Desc')}</div>
            <div class="node-metric-pill">${t('sec.guide.n3Pill')}</div>
          </div>
          <div class="circuit-node node-stage-4" title="${t('sec.guide.n4Title')}">
            <div class="node-pin-row"><span class="node-pulse-dot"></span><span class="node-step-id">${t('sec.guide.n4Step')}</span></div>
            <div class="node-name">${t('sec.guide.n4Name')}</div>
            <div class="node-desc">${t('sec.guide.n4Desc')}</div>
            <div class="node-metric-pill">${t('sec.guide.n4Pill')}</div>
          </div>
        </div>
        <div class="circuit-loopback-row">
          <div class="loopback-trace">
            <span class="loopback-arrow">${t('sec.guide.loopback')}</span>
            <span>${t('sec.guide.loopbackDesc')}</span>
          </div>
          <span>${t('sec.guide.encounter')}</span>
        </div>
      </figure>
      <dl class="guide-definitions">
        <div><dt>${t('sec.guide.knownQ')}</dt><dd>${t('sec.guide.knownA1')}<a href="#personalization">${t('sec.guide.knownLink')}</a>${t('sec.guide.knownA2')}</dd></div>
        <div><dt>${t('sec.guide.quietQ')}</dt><dd>${t('sec.guide.quietA')}</dd></div>
        <div><dt>${t('sec.guide.manualQ')}</dt><dd>${t('sec.guide.manualA1')}<a href="#assistance">${t('opt.nav.assist')}</a>${t('sec.guide.manualA2')}</dd></div>
      </dl>
      <details class="guide-note">
        <summary>${t('sec.guide.fadeQ')}</summary>
        <div>
          <p>${t('sec.guide.fadeA1')}<strong>${t('sec.guide.fadeA2')}</strong>${t('sec.guide.fadeA3')}<strong>${t('sec.guide.fadeA4')}</strong>${t('sec.guide.fadeA5')}<strong>${t('sec.guide.fadeA6')}</strong>${t('sec.guide.fadeA7')}</p>
          <ol class="guide-list">
            <li>${t('sec.guide.fadeR1')}</li>
            <li>${t('sec.guide.fadeR2')}</li>
            <li>${t('sec.guide.fadeR3')}</li>
          </ol>
          <p>${t('sec.guide.fadeNote')}</p>
          <p>${t('sec.guide.fadeNote2a')}<a href="#personalization">${t('opt.nav.personalization')}</a>${t('sec.guide.fadeNote2b')}</p>
        </div>
      </details>
    </div>
  </details>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>${t('sec.guide.sec04')}</summary>
    <div>
      <p>${t('sec.guide.sec04Desc')}</p>
      <ol class="guide-list">
        <li><strong>${t('sec.guide.helpS1')}</strong>${t('sec.guide.helpS1d')}</li>
        <li data-video-feature hidden><strong>${t('sec.guide.helpS2')}</strong>${t('sec.guide.helpS2d')}</li>
        <li><strong>${t('sec.guide.helpS3')}</strong>${t('sec.guide.helpS3d')}</li>
      </ol>
      <p>${t('sec.guide.noHintA')}<a href="#diagnostics">${t('opt.nav.diagnostics')}</a>${t('sec.guide.noHintB')}</p>
    </div>
  </details>

  <details class="paper-card settings-disclosure guide-chapter">
    <summary>${t('sec.guide.sec05')}</summary>
    <div>
      <p><strong>${t('sec.guide.localFirst')}</strong>${t('sec.guide.localFirstDesc')}</p>
      <ul class="guide-list">
        <li><strong>${t('sec.guide.privacyQ1')}</strong>${t('sec.guide.privacyA1')}</li>
        <li><strong>${t('sec.guide.privacyQ2')}</strong>${t('sec.guide.privacyA2')}</li>
        <li><strong>${t('sec.guide.privacyQ3')}</strong>${t('sec.guide.privacyA3')}</li>
      </ul>
      <p>${t('sec.guide.privacyEndA')}<a href="#sites">${t('opt.nav.sites')}</a>${t('sec.guide.privacyEndB')}<a href="#privacy">${t('opt.nav.privacy')}</a>${t('sec.guide.privacyEndC')}</p>
    </div>
  </details>
</section>
`;
