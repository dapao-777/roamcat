/**
 * @file extension/video-subtitles.js
 * 文件职责：视频字幕——播放器上的原文稿、单句求助，以及跟着播放走的双语字幕。
 * 主要内容：读取 YouTube / HTML 字幕轨道；可主动开启 Google 订阅音频听写，显示延迟双语字幕。
 * 模块边界：界面在隔离世界；采集由 video-dictation.js 管理，订阅请求经后台验证。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  'use strict';

  const T=(k,v)=>globalThis.RoamCatI18n?.t?.(k,v)??k;

  const GLOBAL_NAME = 'RoamCatVideoSubtitles';
  if (globalThis[GLOBAL_NAME]) return;

  const YOUTUBE_REQUEST_EVENT = 'roamcat:youtube-captions-request';
  const YOUTUBE_RESPONSE_EVENT = 'roamcat:youtube-captions-response';
  const HOST_ATTRIBUTE = 'data-roamcat-ui';
  const SOURCE_REFRESH_MS = 1600;
  const RENDER_PAGE_SIZE = 100;
  const MAX_TARGET_LENGTH = 600;
  const MAX_CONTEXT_LENGTH = 2000;
  // 断句：一组字幕最多约两行（≤130 字符、≤20 词）。自动字幕没有标点，过长的组会在画面上堆成三四行，
  // 也和正在说的话对不上；够长时遇到逗号或连接词就断开，太短的碎片并到下一组。
  const MAX_GROUP_LENGTH = 130;
  const MAX_GROUP_WORDS = 20;
  const CLAUSE_BREAK_LENGTH = 60;
  const CONNECTIVE_BREAK_WORDS = 12;
  const MIN_GROUP_WORDS = 3;
  const CONNECTIVES = new Set(['and', 'but', 'so', 'because', 'which', 'who', 'when', 'where', 'while', 'if', 'or', 'although', 'though', 'then', 'that\'s', 'unless', 'until', 'since']);
  // 翻译调度：当前句优先，其余按时间往前预取 30 秒、每批至多 5 句；失败隔 8 秒再试，最多三次。
  const TRANSLATE_LOOK_AHEAD_SECONDS = 30;
  const TRANSLATE_BATCH_SIZE = 5;
  const RETRY_AFTER_MS = 8000;
  const MAX_TRANSLATE_ATTEMPTS = 3;
  // 译文往返慢（订阅通道每次要拉起 CLI，约 15 秒）时同时挂两批预取；快的 API 一批就够。
  const SLOW_TRANSLATE_MS = 6000;
  // 实测的译文往返时间（毫秒，指数平滑）；放在模块级，YouTube 站内换视频后沿用，不用重新摸索。
  let observedTranslateMs = 0;
  const EMPTY_NOTICE_MS = 6000;
  const TRANSCRIPT_FOLLOW_PAUSE_MS = 4000;
  const DEFAULT_SETTINGS = Object.freeze({fontSize: 20, theme: 'auto', bilingual: false, display: 'bilingual', translationFirst: true, translationColor: 'white', blur: false, offset: -1, karaoke: true});
  const FONT_SIZES = new Set([16, 20, 24, 28]);
  const THEMES = new Set(['auto', 'light', 'dark']);
  const DISPLAYS = new Set(['bilingual', 'original', 'translation']);
  const TRANSLATION_COLORS = Object.freeze({white: '#ffffff', yellow: '#ffe45c', cyan: '#8be9fd'});

  let instance = null;

  // 中文按词换行：浏览器默认允许在任意两个汉字之间折行，加上 text-wrap:balance 会把“漩涡”这种词拆到两行。
  // 用 Intl.Segmenter 切词，只在词与词之间放 <wbr>，配合 word-break:keep-all 就只会在词边界折行；
  // 收尾标点（，。！？等）不放断点，跟着前一个词走。不支持 Segmenter 的环境退回原样。
  const CLOSING_PUNCTUATION = /^[，。！？；：、）》」』”’…—,.!?;:)\]}]/u;
  const zhSegmenter = typeof Intl?.Segmenter === 'function' ? new Intl.Segmenter('zh', {granularity: 'word'}) : null;
  function phraseFragment(text) {
    const fragment = document.createDocumentFragment();
    const value = String(text || '');
    if (!zhSegmenter || !/\p{Script=Han}/u.test(value)) { fragment.append(value); return fragment; }
    let first = true;
    for (const {segment} of zhSegmenter.segment(value)) {
      if (!first && !CLOSING_PUNCTUATION.test(segment) && !/^\s/.test(segment)) fragment.append(document.createElement('wbr'));
      fragment.append(segment);
      first = false;
    }
    return fragment;
  }
  // 一句要占两行时，优先在中间附近的停顿（逗号、分号、冒号等）后面断开，像字幕组那样一行一个意群。
  // 返回断点在文本里的位置（停顿符号之后），找不到合适的停顿返回 -1。
  function clauseBreak(text) {
    const value = String(text || '');
    let best = -1;
    let bestDistance = Infinity;
    // 破折号“——”整体算一个停顿，只在它后面断，不把两半拆到两行。
    for (const match of value.matchAll(/[，；：、,;:](?:\s|$)?|—+\s?|[。！？](?=.)|[.!?](?=\s)/gu)) {
      const at = match.index + match[0].length;
      const ratio = at / value.length;
      if (ratio < 0.3 || ratio > 0.72) continue;
      const distance = Math.abs(ratio - 0.5);
      if (distance < bestDistance) { best = at; bestDistance = distance; }
    }
    return best;
  }
  function renderedLines(element) {
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 1;
    return Math.max(1, Math.round(element.getBoundingClientRect().height / lineHeight));
  }

  function normalizedSettings(value) {
    return {
      fontSize: FONT_SIZES.has(value?.fontSize) ? value.fontSize : DEFAULT_SETTINGS.fontSize,
      theme: THEMES.has(value?.theme) ? value.theme : DEFAULT_SETTINGS.theme,
      bilingual: value?.bilingual === true,
      display: DISPLAYS.has(value?.display) ? value.display : DEFAULT_SETTINGS.display,
      translationFirst: value?.translationFirst !== false,
      translationColor: Object.hasOwn(TRANSLATION_COLORS, value?.translationColor) ? value.translationColor : DEFAULT_SETTINGS.translationColor,
      blur: value?.blur === true,
      karaoke: value?.karaoke !== false,
      offset: Number.isInteger(value?.offset) && value.offset >= 0 && value.offset <= 80 ? value.offset : -1,
    };
  }

  function createInstance(callbacks) {
    if (typeof callbacks?.onAssist !== 'function') throw new TypeError('RoamCatVideoSubtitles.mount requires an onAssist callback');
    if (!globalThis.RoamCatDesign?.cssFor) throw new Error('RoamCatDesign must be loaded before RoamCatVideoSubtitles');

    const tokens = globalThis.RoamCatDesign.cssFor(':host');
    const controlHost = document.createElement('span');
    controlHost.setAttribute(HOST_ATTRIBUTE, 'video-subtitles-control');
    controlHost.style.setProperty('all', 'initial', 'important');
    controlHost.style.setProperty('display', 'inline-flex', 'important');
    controlHost.style.setProperty('vertical-align', 'middle', 'important');
    const controlShadow = controlHost.attachShadow({mode: 'closed'});
    controlShadow.innerHTML = `
      <style data-theme-tokens>${tokens}</style><style>
        :host{display:inline-flex;flex:0 0 auto;gap:var(--space-2);font-family:var(--ui,sans-serif)}
        button{min-height:36px;padding:var(--space-2) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);color:var(--accent);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--ui,sans-serif);cursor:pointer;white-space:nowrap}
        button:hover{background:var(--surface-hover);border-color:var(--accent-line)}
        button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}
        button[aria-pressed="true"]{background:var(--action);border-color:var(--action);color:var(--on-action)}
        :host([data-youtube="true"]){gap:0}
        :host(:not([data-youtube="true"])){gap:0;padding:2px;border-radius:var(--radius-pill);background:rgba(18,18,20,.72)}
        :host(:not([data-youtube="true"])) button{min-height:32px;padding:4px 12px;border:0;background:transparent;color:#f4f4f5}
        :host(:not([data-youtube="true"])) button:hover{background:rgba(255,255,255,.14);border:0}
        :host(:not([data-youtube="true"])) button[aria-pressed="true"]{background:#f4f4f5;color:#111}
        /* YouTube 控制栏永远是深色底：不随扩展主题取色，固定白字，按下用底边指示条。 */
        :host([data-youtube="true"]) button{width:48px;height:var(--native-control-size,48px);min-height:var(--native-control-size,48px);padding:0 4px;border:0;border-radius:0;background:transparent;color:#fff;font:600 var(--fs-2,13px)/1 var(--ui,sans-serif);opacity:.9}
        :host([data-youtube="true"]) button:hover{background:rgba(255,255,255,.12);opacity:1}
        :host([data-youtube="true"]) button[aria-pressed="true"]{opacity:1;box-shadow:inset 0 -3px #fff}
        .menu-toggle{display:inline-grid;place-items:center}
        /* 窄播放器只留“双语”和菜单，“这句”“原文”挪进菜单，免得挤掉 YouTube 的时间显示。 */
        :host([data-compact="true"]) .assist,:host([data-compact="true"]) .transcript{display:none}
        :host(:not([data-youtube="true"])) .menu-toggle{padding:4px 10px}
        :host([data-youtube="true"]) .menu-toggle[aria-expanded="true"]{opacity:1;box-shadow:inset 0 -3px #fff}
      </style>
      <button class="bilingual" type="button" aria-pressed="false" aria-label="${T('vid.bilingualAria')}">${T('vid.bilingualBtn')}</button>
      <button class="assist" type="button" aria-label="${T('vid.assistAria')}">${T('vid.assistBtn')}</button>
      <button class="transcript" type="button" aria-label="${T('vid.transcriptOpenAria')}" aria-pressed="false">${T('vid.transcriptBtn')}</button>
      <button class="menu-toggle" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="${T('vid.menuAria')}" title="${T('vid.menuAria')}"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg></button>`;
    const bilingualButton = controlShadow.querySelector('.bilingual');
    const assistButton = controlShadow.querySelector('.assist');
    const transcriptButton = controlShadow.querySelector('.transcript');
    const menuToggle = controlShadow.querySelector('.menu-toggle');

    const transcriptHost = document.createElement('section');
    transcriptHost.setAttribute(HOST_ATTRIBUTE, 'video-transcript');
    transcriptHost.style.setProperty('all', 'initial', 'important');
    transcriptHost.style.setProperty('display', 'none', 'important');
    transcriptHost.style.setProperty('width', '100%', 'important');
    transcriptHost.style.setProperty('box-sizing', 'border-box', 'important');
    const transcriptShadow = transcriptHost.attachShadow({mode: 'closed'});
    transcriptShadow.innerHTML = `
      <style data-theme-tokens>${tokens}</style><style>
        :host{display:block;width:100%;color:var(--ink);font-family:var(--ui,sans-serif);color-scheme:light dark}
        .panel{box-sizing:border-box;margin:var(--space-3) 0;border:1px solid var(--line);border-radius:var(--radius-panel);background:var(--surface);color:var(--ink);overflow:hidden}
        header{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--line);background:var(--surface)}
        h2{margin:0;font:var(--weight-medium) var(--type-body)/var(--leading-control) var(--ui,sans-serif)}
        .progress{margin-right:auto;color:var(--muted-strong);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--ui,sans-serif)}
        label{display:inline-flex;align-items:center;gap:6px;color:var(--muted-strong);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--ui,sans-serif)}
        select,.close{min-height:36px;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--surface);color:var(--ink);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--ui,sans-serif)}
        select{padding:4px 24px 4px 8px}.close{padding:4px 10px;cursor:pointer}
        select:focus-visible,button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}
        .notice{display:none;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--warning-soft);color:var(--warning);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--ui,sans-serif)}
        .notice[data-kind="error"]{background:var(--danger-soft);color:var(--danger)}
        .notice[data-kind="info"]{background:var(--accent-soft);color:var(--ink)}
        .list{max-height:min(52vh,620px);overflow:auto;padding:4px 0;background:var(--paper)}
        .cue{display:grid;grid-template-columns:70px minmax(0,1fr);gap:12px;width:100%;box-sizing:border-box;border-top:1px solid var(--line);background:transparent;color:var(--ink)}
        .cue:first-child,.cue[data-continues="true"]{border-top-color:transparent}
        .cue[data-continues="true"] .time,.cue[data-continues="true"] .text{padding-top:2px}
        .cue[data-active="true"]{background:var(--accent-soft)}
        .time,.text{border:0;background:transparent;color:inherit;cursor:pointer;text-align:left}
        .time{padding:12px 0 12px 16px;color:var(--accent);font:var(--weight-semibold) var(--type-support)/var(--leading-support) var(--mono)}
        .text{min-width:0;padding:10px 16px 10px 0;font:var(--weight-regular) var(--cue-size,20px)/1.5 var(--ui,sans-serif);overflow-wrap:anywhere}
        .text .translation{display:block;margin-top:4px;color:var(--muted-strong);font-size:.86em;word-break:keep-all;line-break:strict}
        .cue[data-continues="true"] .text{padding-bottom:10px}
        .text .translation[hidden]{display:none}
        .time:hover,.text:hover{background:var(--surface-hover)}
        .more{display:block;margin:var(--space-3) auto;min-height:36px;padding:var(--space-2) var(--space-4);border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);color:var(--accent);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--ui,sans-serif);cursor:pointer}
        .body{position:relative}
        .follow{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);min-height:32px;padding:4px 14px;border:0;border-radius:var(--radius-pill);background:var(--action);color:var(--on-action);font:var(--weight-semibold) var(--type-support)/1 var(--ui,sans-serif);box-shadow:var(--elev-2);cursor:pointer}
        .follow[hidden]{display:none}
        .download{min-height:36px;padding:4px 10px;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--surface);color:var(--ink);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--ui,sans-serif);cursor:pointer}
        /* 影院模式下原文稿浮在右侧，叠在压暗层之上。 */
        :host([data-theater="true"]) .panel{margin:0;height:100%;display:flex;flex-direction:column;box-shadow:var(--elev-2)}
        :host([data-theater="true"]) .body{flex:1;min-height:0}
        :host([data-theater="true"]) .list{max-height:none;height:100%}
        @media(max-width:640px){header{align-items:flex-start}.cue{grid-template-columns:56px minmax(0,1fr)}label{width:calc(50% - 8px)}}
      </style>
      <div class="panel"><header><h2>${T('vid.transcriptTitle')}</h2><span class="progress">${T('vid.readingCues')}</span>
        <label>${T('vid.fontSize')}<select data-setting="fontSize"><option value="16">16</option><option value="20">20</option><option value="24">24</option><option value="28">28</option></select></label>
        <label>${T('vid.theme')}<select data-setting="theme"><option value="auto">${T('vid.themeAuto')}</option><option value="light">${T('vid.themeLight')}</option><option value="dark">${T('vid.themeDark')}</option></select></label>
        <button class="download" type="button">${T('vid.mDownload')}</button>
        <button class="close" type="button">${T('vid.close')}</button>
      </header><div class="notice" role="status" aria-live="polite"></div><div class="body"><div class="list"></div><button class="follow" type="button" hidden>${T('vid.backToCurrent')}</button></div></div>`;
    const list = transcriptShadow.querySelector('.list');
    const followButton = transcriptShadow.querySelector('.follow');
    const progress = transcriptShadow.querySelector('.progress');
    const notice = transcriptShadow.querySelector('.notice');

    const overlayHost = document.createElement('div');
    overlayHost.setAttribute(HOST_ATTRIBUTE, 'video-bilingual');
    overlayHost.style.setProperty('all', 'initial', 'important');
    overlayHost.style.setProperty('position', 'fixed', 'important');
    overlayHost.style.setProperty('z-index', '2147483640', 'important');
    overlayHost.style.setProperty('pointer-events', 'none', 'important');
    overlayHost.style.setProperty('display', 'none', 'important');
    const overlayShadow = overlayHost.attachShadow({mode: 'closed'});
    overlayShadow.innerHTML = `
      <style data-theme-tokens>${tokens}</style><style>
        /* 中文在上、英文在下（字幕组惯例）：译文晚到时只在上方补一行，下面的英文不跳动。
           --sub-size 随视频高度缩放（见 placeOverlay），--sub-bottom 避开播放器控制栏。 */
        :host{display:block;width:100%;height:100%;pointer-events:none;font-family:var(--ui,sans-serif);--sub-size:20px;--sub-bottom:8%}
        .stack,.empty{position:absolute;left:50%;bottom:var(--sub-bottom);transform:translateX(-50%);width:min(90%,1000px);text-align:center;transition:bottom .18s ease}
        .stack{display:flex;flex-direction:column;align-items:center;gap:.12em;font-size:var(--sub-size)}
        .stack[hidden],.empty[hidden],.translation[hidden]{display:none}
        .line{display:block;margin:0;padding:0;max-width:100%;border:0;background:none;text-align:center;line-height:1.36;text-wrap:balance;overflow-wrap:anywhere}
        .line>span{padding:.06em .36em;border-radius:.18em;background:rgba(0,0,0,.7);-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:0 0 .12em rgba(0,0,0,.6)}
        .translation{color:#fff;font:600 1em/1.36 var(--ui,sans-serif);letter-spacing:.02em}
        .translation{order:1;color:var(--tr-color,#fff);word-break:keep-all;line-break:strict}
        .original{order:2;color:rgba(255,255,255,.9);font:500 .76em/1.4 var(--ui,sans-serif);cursor:pointer;pointer-events:auto}
        :host([data-translation-first="false"]) .translation{order:3}
        /* 译文失败原因：一行小字占在译文的位置，几秒后自己收起，长原因省略号截断（悬停看全文）。 */
        .notice{order:1;color:#ffd9a0;font:500 .62em/1.4 var(--ui,sans-serif);pointer-events:auto}
        .notice>span{display:inline-block;max-width:100%;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:bottom}
        :host([data-translation-first="false"]) .notice{order:3}
        .notice[hidden]{display:none}
        :host([data-display="original"]) .translation,:host([data-display="translation"]) .original{display:none}
        :host([data-display="translation"]) .translation{pointer-events:auto;cursor:pointer}
        /* 单词可点：点词查词，点词与词之间的空白求助整句。 */
        .w{border-radius:.15em;padding:0 .02em}
        .w:hover{background:rgba(255,255,255,.22);text-decoration:underline rgba(255,255,255,.75);text-underline-offset:.22em}
        .original:hover>span{background:rgba(0,0,0,.85)}
        /* 逐词高亮：还没说到的词稍暗，说过的全亮，正在说的词下面一道暖黄亮线。 */
        :host([data-karaoke="true"]) .tk{opacity:.55;transition:opacity .12s ease}
        :host([data-karaoke="true"]) .tk[data-said="true"],:host([data-karaoke="true"]) .tk[data-now="true"]{opacity:1}
        :host([data-karaoke="true"]) .tk[data-now="true"]{color:#fff;box-shadow:inset 0 -.14em #ffd166}
        /* 生词标注：难词橙色虚下划线，查过的词青色实下划线；和网页上的难词提示同一套含义。 */
        .tk.hard{color:#ffd9a0;text-decoration:underline dotted #ffb454;text-decoration-thickness:.14em;text-underline-offset:.24em}
        .tk.seen{color:#c8f4ff;text-decoration:underline solid #8be9fd;text-decoration-thickness:.1em;text-underline-offset:.24em}
        /* 逐词高亮把没说到的词调暗时，标注过的词保持清楚。 */
        :host([data-karaoke="true"]) .tk.hard,:host([data-karaoke="true"]) .tk.seen{opacity:.9}
        /* 模糊译文：先听再看，鼠标移到字幕上才显示。 */
        :host([data-blur="true"]) .translation span{filter:blur(.32em);transition:filter .15s ease}
        :host([data-blur="true"]) .stack:hover .translation span{filter:none}
        :host([data-blur="true"]) .translation{pointer-events:auto}
        /* 拖动把手：悬停在字幕上才出现，上下拖动改位置，双击回到自动位置。 */
        .grip{order:0;display:grid;place-items:center;width:2.2em;height:1em;margin-bottom:.1em;padding:0;border:0;border-radius:.3em;background:rgba(0,0,0,.7);color:#fff;font-size:var(--fs-1,12px);cursor:grab;opacity:0;transition:opacity .15s ease;pointer-events:auto;touch-action:none}
        .grip svg{width:14px;height:14px}
        .stack:hover .grip,.grip:focus-visible,:host([data-dragging="true"]) .grip{opacity:1}
        :host([data-dragging="true"]) .grip{cursor:grabbing}
        :host([data-dragging="true"]) .stack{transition:none}
        .chip{position:absolute;left:12px;top:12px;display:flex;gap:6px;pointer-events:none}
        .chip[hidden]{display:none}
        .chip span{padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;font:600 var(--fs-1,12px)/1.5 var(--ui,sans-serif)}
        /* 无字幕提示：一行、小卡片，窄画面里省略号截断，不再撑成大椭圆压住画面。 */
        .empty{display:flex;align-items:center;justify-content:center;gap:8px;width:max-content;max-width:min(90%,420px);box-sizing:border-box;padding:4px 4px 4px 12px;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;font:500 var(--fs-1,12px)/1.4 var(--ui,sans-serif);pointer-events:auto}
        .empty p{margin:0;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
        .empty button{flex:none;min-height:24px;padding:2px 10px;border:0;border-radius:999px;background:#fff;color:#111;font:600 var(--fs-1,12px)/1 var(--ui,sans-serif);cursor:pointer}
        .empty button:focus-visible{outline:2px solid #fff;outline-offset:2px}
        /* 播放器内的字幕菜单：深色浮层，固定深底白字，不随扩展主题变色。 */
        .menu{position:absolute;right:12px;bottom:var(--menu-bottom,56px);width:min(320px,calc(100% - 24px));max-height:calc(100% - var(--menu-bottom,56px) - 12px);overflow:auto;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:rgba(20,20,22,.94);color:#f4f4f5;font:500 var(--fs-2,13px)/1.4 var(--ui,sans-serif);pointer-events:auto;box-shadow:0 8px 28px rgba(0,0,0,.45)}
        .menu[hidden]{display:none}
        .menu .row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:34px}
        .menu .label{color:rgba(244,244,245,.78)}
        .menu kbd{margin-left:6px;padding:0 5px;border:1px solid rgba(255,255,255,.25);border-radius:4px;font:500 var(--fs-1,12px)/1.5 var(--ui,sans-serif);color:rgba(244,244,245,.7)}
        .menu hr{margin:6px 0;border:0;border-top:1px solid rgba(255,255,255,.12)}
        .seg{display:inline-flex;padding:2px;border-radius:8px;background:rgba(255,255,255,.08)}
        .seg button,.menu .action{min-height:28px;padding:2px 10px;border:0;border-radius:6px;background:transparent;color:#f4f4f5;font:inherit;cursor:pointer;white-space:nowrap}
        .seg button[aria-pressed="true"]{background:#f4f4f5;color:#111}
        .seg button:hover:not([aria-pressed="true"]),.menu .action:hover{background:rgba(255,255,255,.14)}
        .menu .action{border:1px solid rgba(255,255,255,.18)}
        .menu .actions{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0}
        .switch{position:relative;flex:none;width:36px;height:20px;padding:0;border:0;border-radius:999px;background:rgba(255,255,255,.22);cursor:pointer}
        .switch::after{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease}
        .switch[aria-checked="true"]{background:#4ade80}
        .switch[aria-checked="true"]::after{transform:translateX(16px)}
        .menu button:focus-visible{outline:2px solid #fff;outline-offset:2px}
        .hint{margin:6px 0 0;color:rgba(244,244,245,.6);font-size:var(--fs-1,12px)}
      </style>
      <div class="chip" hidden></div>
      <div class="stack" hidden>
        <button class="grip" type="button" aria-label="${T('vid.dragAria')}" title="${T('vid.dragTitle')}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="9" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="16" cy="9" r="1.6"/><circle cx="8" cy="15" r="1.6"/><circle cx="12" cy="15" r="1.6"/><circle cx="16" cy="15" r="1.6"/></svg></button>
        <p class="line translation" aria-live="polite" hidden><span></span></p>
        <p class="line notice" role="status" hidden><span></span></p>
        <p class="line original" title="${T('vid.originalHint')}"><span></span></p>
      </div>
      <div class="empty" role="status" hidden><p></p><button class="retry" type="button">${T('vid.retryCaptions')}</button></div>
      <div class="menu" role="dialog" aria-label="${T('vid.menuAria')}" hidden>
        <div class="row"><span class="label">${T('vid.mDisplay')}</span><div class="seg" data-setting="display"><button type="button" data-value="bilingual">${T('vid.mBilingual')}</button><button type="button" data-value="original">${T('vid.mOriginal')}</button><button type="button" data-value="translation">${T('vid.mTranslation')}</button></div></div>
        <div class="row"><span class="label">${T('vid.mOrder')}</span><div class="seg" data-setting="translationFirst"><button type="button" data-value="true">${T('vid.mAbove')}</button><button type="button" data-value="false">${T('vid.mBelow')}</button></div></div>
        <div class="row"><span class="label">${T('vid.mColor')}</span><div class="seg" data-setting="translationColor"><button type="button" data-value="white">${T('vid.mWhite')}</button><button type="button" data-value="yellow">${T('vid.mYellow')}</button><button type="button" data-value="cyan">${T('vid.mCyan')}</button></div></div>
        <div class="row"><span class="label">${T('vid.fontSize')}</span><div class="seg" data-setting="fontSize"><button type="button" data-value="16">${T('vid.mSizeS')}</button><button type="button" data-value="20">${T('vid.mSizeM')}</button><button type="button" data-value="24">${T('vid.mSizeL')}</button><button type="button" data-value="28">${T('vid.mSizeXL')}</button></div></div>
        <div class="row"><span class="label">${T('vid.mKaraoke')}</span><button class="switch" type="button" role="switch" data-setting="karaoke" aria-label="${T('vid.mKaraoke')}"></button></div>
        <div class="row"><span class="label">${T('vid.mBlur')}</span><button class="switch" type="button" role="switch" data-setting="blur" aria-label="${T('vid.mBlur')}"></button></div>
        <hr>
        <div class="row"><span class="label">${T('vid.mLoop')}<kbd>Alt+R</kbd></span><button class="switch" type="button" role="switch" data-action="loop" aria-label="${T('vid.mLoop')}"></button></div>
        <div class="row"><span class="label">${T('vid.mAutoPause')}<kbd>Alt+P</kbd></span><button class="switch" type="button" role="switch" data-action="autoPause" aria-label="${T('vid.mAutoPause')}"></button></div>
        <div class="row"><span class="label">${T('vid.mJump')}</span><div class="seg"><button type="button" data-action="prev" title="Alt+[">${T('vid.mPrev')}</button><button type="button" data-action="replay">${T('vid.mReplay')}</button><button type="button" data-action="next" title="Alt+]">${T('vid.mNext')}</button></div></div>
        <div class="row"><span class="label">${T('vid.mTheater')}<kbd>Alt+T</kbd></span><button class="switch" type="button" role="switch" data-action="theater" aria-label="${T('vid.mTheater')}"></button></div>
        <hr>
        <div class="actions"><button class="action" type="button" data-action="assist">${T('vid.assistBtn')}</button><button class="action" type="button" data-action="transcript">${T('vid.transcriptBtn')}</button><button class="action" type="button" data-action="download">${T('vid.mDownload')}</button><button class="action" type="button" data-action="resetPosition">${T('vid.mResetPosition')}</button></div>
        <section class="dictation"><hr><button class="action" type="button" data-action="dictation">${T('vid.asrStart')}</button><p class="hint">${T('vid.asrConsent')}</p><p class="hint asr-status" role="status"></p></section>
        <p class="hint">${T('vid.mShortcuts')}</p>
      </div>`;
    const overlayStack = overlayShadow.querySelector('.stack');
    const overlayGrip = overlayShadow.querySelector('.grip');
    const overlayChip = overlayShadow.querySelector('.chip');
    const overlayOriginal = overlayShadow.querySelector('.original');
    const overlayOriginalText = overlayOriginal.querySelector('span');
    const overlayTranslation = overlayShadow.querySelector('.translation');
    const overlayTranslationText = overlayTranslation.querySelector('span');
    const overlayNotice = overlayShadow.querySelector('.notice');
    const overlayEmpty = overlayShadow.querySelector('.empty');
    const overlayEmptyText = overlayShadow.querySelector('.empty p');
    const menu = overlayShadow.querySelector('.menu');

    // 影院模式：一个与视频等大的“镂空”框，用超大外阴影把视频以外的整页压暗，不改动网页自己的布局。
    const theaterHost = document.createElement('div');
    theaterHost.setAttribute(HOST_ATTRIBUTE, 'video-theater');
    theaterHost.style.setProperty('all', 'initial', 'important');
    theaterHost.style.setProperty('position', 'fixed', 'important');
    theaterHost.style.setProperty('z-index', '2147483639', 'important');
    theaterHost.style.setProperty('pointer-events', 'none', 'important');
    theaterHost.style.setProperty('box-shadow', '0 0 0 200vmax rgba(0,0,0,.86)', 'important');
    theaterHost.style.setProperty('border-radius', '4px', 'important');
    theaterHost.style.setProperty('transition', 'left .2s ease, top .2s ease, width .2s ease, height .2s ease', 'important');
    const themeStyles = [controlShadow, transcriptShadow, overlayShadow].map(shadow => shadow.querySelector('[data-theme-tokens]'));

    let currentCallbacks = callbacks;
    let settings = normalizedSettings(callbacks.settings);
    let confirmedSettings = settings;
    const settingsChanges = [];
    let settingsSaveQueue = Promise.resolve();
    let renderedTheme;
    let video = null;
    let source = null;
    let sourceGeneration = 0;
    let sessionGeneration = 0;
    let destroyed = false;
    let transcriptOpen = false;
    let refreshBusy = false;
    let captionAbort = null;
    let unavailableCaptionUrl = '';
    let lastUrl = location.href;
    let refreshTimer = null;
    let frameId = null;
    let requestSequence = 0;
    let bridgeCleanup = null;
    let renderedCount = 0;
    let restoredTrack = null;
    let youtubePrepared = false;
    let activeAssist = null;
    let bridgeInstalled = false;
    let bridgeFailed = false;
    let discoverAttemptedFor = '';
    let warmedVideoId = '';
    let failedVideoId = '';
    let refreshSkips = 0;
    let captionState = 'loading';
    let domCaptionText = '';
    let domCaptionTimer = null;
    let prefetchInFlight = 0;
    let translateQueue = Promise.resolve();
    let emptyTimer = null;
    let noticeTimer = null;
    let noticeShownFor = '';
    let emptyDismissedFor = '';
    let playFrame = null;
    let placeFrame = null;
    let renderedLine = '';
    let menuOpen = false;
    let loopOn = false;
    let autoPause = false;
    let theaterOn = false;
    let dragState = null;
    let loopGroupStart = null;
    let pausedAfterGroup = -1;
    let transcriptFollowPausedUntil = 0;
    let priorityRequest = null;
    const translations = new Map();
    let dictation = null, dictationStarting = false, dictationEpoch = 0, dictationDelay = null, dictationStatus = '', autoplayHoldTimer = null;
    const dictationActive = () => Boolean(dictation || dictationStarting);
    const subtitleTime = () => (video?.currentTime || 0) - (dictationActive() ? dictationDelay || 0 : 0);
    function stopDictation() {
      dictationEpoch += 1;
      dictationStarting = false;
      clearInterval(autoplayHoldTimer); autoplayHoldTimer = null;
      const current = dictation; dictation = null;
      current?.stop();
      dictationDelay = null;
      dictationStatus = T('vid.asrStopped');
      syncMenu();
    }
    // 听写中播到结尾时最后一段还在路上：YouTube 自动连播倒计时（实测约 7 秒）短于单段听写（约 15–20 秒），
    // 换到下一个视频会丢掉这一段和本视频的听写字幕。只点倒计时上的「取消」，等同用户点一次，不改自动播放开关。
    function holdAutoplayForDictation() {
      if (!dictationActive() || !isYoutube() || !video) return;
      clearInterval(autoplayHoldTimer);
      const epoch = dictationEpoch, root = video.closest('.html5-video-player') || document;
      let ticks = 0;
      const tick = () => {
        const cancel = root.querySelector('.ytp-autonav-endscreen-upnext-cancel-button');
        const shown = Boolean(cancel?.getClientRects().length);
        if (!shown && epoch === dictationEpoch && ++ticks < 40) return;
        clearInterval(autoplayHoldTimer); autoplayHoldTimer = null;
        if (!shown || epoch !== dictationEpoch) return;
        cancel.click();
        showOverlayHint(T('vid.asrAutoplayHeld'));
      };
      autoplayHoldTimer = setInterval(tick, 200);
      tick();
    }
    async function toggleDictation() {
      if (dictationActive()) { stopDictation(); renderOverlay(true); return; }
      if (!isYoutube() || !video || !globalThis.RoamCatVideoDictation || !currentCallbacks.onTranscribe) return;
      const epoch = ++dictationEpoch, media = video, url = location.href;
      dictationStarting = true; dictationStatus = T('vid.asrConnecting'); syncMenu();
      try {
        await currentCallbacks.onTranscribe({check: true});
        if (epoch !== dictationEpoch || destroyed || video !== media || url !== location.href) return;
        await setVideoSettings({bilingual: true});
        if (epoch !== dictationEpoch || destroyed || video !== media || url !== location.href) return;
        if (!settings.bilingual) throw new Error(T('vid.saveFailRevert'));
        clearSource(); captionState = 'loading'; dictationDelay = null;
        loopOn = false; autoPause = false;
        dictation = RoamCatVideoDictation.create({video: media,
          eligible: () => url === location.href && !document.querySelector('.html5-video-player.ad-showing'),
          transcribe: audio => currentCallbacks.onTranscribe({audio}),
          onSegments: (cues, start, end) => {
            if (epoch !== dictationEpoch) return;
            const existing = source?.kind === 'dictation' ? source.cues : [];
            if (existing.length + cues.length > 2000) { stopDictation(); showOverlayHint(T('vid.asrLimit')); return; }
            if (dictationDelay === null || subtitleTime() > end) dictationDelay = Math.max(0, media.currentTime - start);
            applySource({state: 'ready', kind: 'dictation', key: `dictation:${epoch}`, language: '', cues: [...existing, ...cues]});
          },
          onStatus: (message, stopped = false) => {
            if (epoch !== dictationEpoch) return;
            dictationStatus = message;
            if (stopped) { dictation = null; dictationStarting = false; dictationDelay = null; }
            syncMenu();
            if (stopped && message) showOverlayHint(message);
          },
        });
      } catch (error) {
        if (epoch === dictationEpoch) { dictationStatus = error.message || T('vid.asrFailed'); showOverlayHint(dictationStatus); }
      } finally {
        if (epoch === dictationEpoch) { dictationStarting = false; syncMenu(); renderOverlay(true); }
      }
    }

    function isYoutube() { return /(^|\.)youtube\.com$/.test(location.hostname); }
    function formatTime(seconds) {
      const value = Math.max(0, Math.floor(Number(seconds) || 0));
      const hours = Math.floor(value / 3600);
      const minutes = Math.floor(value % 3600 / 60);
      const secs = value % 60;
      return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
    }
    function normalizedCue(cue) {
      const startTime = Number(cue?.startTime);
      const endTime = Number(cue?.endTime);
      const text = String(cue?.text || '').replace(/\s+/g, ' ').trim();
      if (!text || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
      // 自动字幕带逐词时间（见 youtube-caption-json3.js）；词数和正文对不上就丢掉，改用估算。
      const words = Array.isArray(cue?.words) ? cue.words.filter(word => typeof word?.text === 'string' && word.text.trim() && Number.isFinite(word.start)).map(word => ({text: word.text.trim(), start: Math.max(startTime, word.start)})) : null;
      const fits = words && words.length === text.split(' ').length;
      return {startTime: Math.max(0, startTime), endTime: Math.max(startTime, endTime), text, ...(fits ? {words} : {})};
    }
    // 每个词开始说的时刻：有逐词时间就用；没有就按字数把这条字幕的时长分给各个词（人工字幕、网页字幕轨道）。
    function tokenTimes(group) {
      if (group.times) return group.times;
      const times = [];
      for (let index = group.cueIndex; index <= group.cueEnd; index += 1) {
        const cue = source.cues[index];
        if (!cue) continue;
        if (cue.words) { for (const word of cue.words) times.push(word.start); continue; }
        const tokens = cue.text.split(' ');
        const total = tokens.reduce((sum, token) => sum + token.length + 1, 0) || 1;
        const span = Math.max(0.01, cue.endTime - cue.startTime);
        let done = 0;
        for (const token of tokens) { times.push(cue.startTime + span * done / total); done += token.length + 1; }
      }
      group.times = times;
      return times;
    }
    function isEnglishLanguage(value) { return /^en(?:-|$)/i.test(String(value || '').trim()); }
    function sentenceCount(text) {
      const matches = String(text).match(/[^.!?]+(?:[.!?]+|$)/g);
      return matches ? matches.filter(part => part.trim()).length : 0;
    }
    function applySettingsToUi() {
      if (renderedTheme !== settings.theme) {
        const css = globalThis.RoamCatDesign.cssFor(':host', settings.theme);
        for (const host of [controlHost, transcriptHost]) host.style.setProperty('color-scheme', settings.theme === 'auto' ? 'light dark' : settings.theme, 'important');
        for (const style of themeStyles) style.textContent = css;
        renderedTheme = settings.theme;
      }
      transcriptHost.style.setProperty('--cue-size', `${settings.fontSize}px`);
      bilingualButton.setAttribute('aria-pressed', String(settings.bilingual));
      bilingualButton.setAttribute('aria-label', settings.bilingual ? T('vid.bilingualStopAria') : T('vid.bilingualAria'));
      bilingualButton.textContent = T('vid.bilingualBtn');
      for (const select of transcriptShadow.querySelectorAll('[data-setting]')) select.value = String(settings[select.dataset.setting]);
      overlayHost.dataset.display = settings.display;
      overlayHost.dataset.translationFirst = String(settings.translationFirst);
      overlayHost.dataset.blur = String(settings.blur);
      overlayHost.style.setProperty('--tr-color', TRANSLATION_COLORS[settings.translationColor]);
      syncMenu();
      renderOverlay(true);
      if (settings.bilingual) scheduleTranslation();
    }
    // 菜单与状态角标跟随当前设置和学习状态（循环 / 每句暂停 / 影院）。
    function syncMenu() {
      menu.querySelector('.dictation').hidden = !isYoutube();
      const dictationButton = menu.querySelector('[data-action="dictation"]');
      dictationButton.textContent = T(dictationActive() ? 'vid.asrStop' : 'vid.asrStart');
      dictationButton.setAttribute('aria-pressed', String(dictationActive()));
      menu.querySelector('.asr-status').textContent = dictationStatus;
      for (const group of menu.querySelectorAll('.seg[data-setting]')) {
        for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(String(settings[group.dataset.setting]) === button.dataset.value));
      }
      for (const key of ['blur', 'karaoke']) menu.querySelector(`[data-setting="${key}"]`).setAttribute('aria-checked', String(settings[key]));
      const learning = {loop: loopOn, autoPause, theater: theaterOn};
      for (const [action, on] of Object.entries(learning)) menu.querySelector(`[data-action="${action}"]`).setAttribute('aria-checked', String(on));
      menu.querySelector('[data-action="resetPosition"]').hidden = settings.offset < 0;
      syncDownload();
      menu.hidden = !menuOpen;
      menuToggle.setAttribute('aria-expanded', String(menuOpen));
      const chips = [loopOn && T('vid.chipLoop'), autoPause && T('vid.chipAutoPause'), dictationActive() && T('vid.asrDelayed')].filter(Boolean);
      overlayChip.replaceChildren(...chips.map(text => Object.assign(document.createElement('span'), {textContent: text})));
      overlayChip.hidden = !chips.length;
    }
    // 「下载双语字幕」只在有成段字幕时出现（直播和没读到字幕时没有东西可下）。
    function syncDownload() {
      const empty = !source?.groups?.length;
      menu.querySelector('[data-action="download"]').hidden = empty;
      transcriptShadow.querySelector('.download').hidden = empty;
    }
    // 字幕层在三种情况下要显示：开着双语、开着菜单、开着循环/每句暂停（角标提示）。
    function overlayActive() { return settings.bilingual || menuOpen || loopOn || autoPause; }
    function showNotice(message, kind = '') {
      notice.textContent = message;
      notice.dataset.kind = kind;
      notice.style.display = message ? 'block' : 'none';
    }

    // YouTube 首页、推荐栏、搜索结果里悬停缩略图会播一段静音预览，它也是 <video>，不能当成正片挂字幕。
    function isYoutubePreview(candidate) {
      if (!isYoutube()) return false;
      if (candidate.closest('ytd-video-preview, #video-preview, #inline-preview-player, ytd-thumbnail, ytd-rich-grid-media, ytd-moving-thumbnail-renderer')) return true;
      return !videoIdFromLocation() || !candidate.closest('#movie_player, #shorts-player, .html5-video-player');
    }
    function visibleVideo() {
      let selected = null;
      let selectedArea = 0;
      for (const candidate of document.querySelectorAll('video')) {
        if (!candidate.isConnected || isYoutubePreview(candidate)) continue;
        const rect = candidate.getBoundingClientRect();
        const area = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) * Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
        if (rect.width >= 180 && rect.height >= 100 && area > selectedArea) { selected = candidate; selectedArea = area; }
      }
      return selected;
    }
    function youtubeControls() {
      const player = video?.closest('.html5-video-player') || (isYoutube() ? document.getElementById('movie_player') : null);
      return player?.querySelector('.ytp-right-controls') || null;
    }
    function customControls() {
      if (!video || video.controls || youtubeControls()) return null;
      const player = video.closest('[data-player],.video-player,.player,[class*="player"]') || video.parentElement;
      if (!player) return null;
      const videoRect = video.getBoundingClientRect();
      for (const candidate of player.querySelectorAll('[data-controls],.video-controls,.player-controls,[class*="controls"]')) {
        if (candidate === controlHost || candidate.closest(`[${HOST_ATTRIBUTE}]`)) continue;
        const rect = candidate.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 20 && rect.height <= 100 && rect.top >= videoRect.top + videoRect.height * .55) return candidate;
      }
      return null;
    }
    // 原文稿面板的位置：YouTube 观看页放在标题区（#below）最前面——播放器外壳是绝对定位、固定高度的，
    // 插在 ytd-player 后面会溢出到标题区底下，被标题和频道栏盖住。其它页面放在播放器后面，并跳出绝对定位的外壳。
    function transcriptSlot() {
      if (!video) return null;
      if (youtubeControls()) {
        const below = video.closest('ytd-watch-flexy, ytd-watch-grid')?.querySelector('#below');
        if (below) return {first: below};
      }
      let anchor = youtubeControls() ? video.closest('ytd-player') || video.closest('.html5-video-player') || video : video.closest('[data-player],.video-player,.player') || video;
      while (anchor.parentElement && anchor.parentElement !== document.body && /^(absolute|fixed)$/.test(getComputedStyle(anchor.parentElement).position)) anchor = anchor.parentElement;
      return {after: anchor};
    }
    function placeUi() {
      if (!video?.isConnected) { controlHost.remove(); transcriptHost.remove(); return; }
      const fullscreen = document.fullscreenElement;
      if (fullscreen === video) controlHost.remove();
      else {
        const ytControls = youtubeControls();
        const custom = customControls();
        if (ytControls) {
          controlHost.dataset.youtube = 'true';
          controlHost.dataset.compact = String((video.getBoundingClientRect().width || 0) < 760);
          controlHost.style.setProperty('--native-control-size', `${Math.max(32, Math.min(48, ytControls.getBoundingClientRect().height || 48))}px`);
          const cc = ytControls.querySelector('.ytp-subtitles-button');
          if (cc && cc.nextElementSibling !== controlHost) cc.insertAdjacentElement('afterend', controlHost);
          else if (!cc && controlHost.parentElement !== ytControls) ytControls.prepend(controlHost);
        } else if (custom) {
          delete controlHost.dataset.youtube;
          if (controlHost.parentElement !== custom) custom.append(controlHost);
        } else if (video.controls) {
          delete controlHost.dataset.youtube;
          let row = video.nextElementSibling?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? video.nextElementSibling : null;
          if (!row) {
            row = document.createElement('div');
            row.setAttribute(HOST_ATTRIBUTE, 'video-subtitles-row');
            row.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;padding:8px 0;position:relative;z-index:1;';
            video.insertAdjacentElement('afterend', row);
          }
          if (controlHost.parentElement !== row) row.append(controlHost);
        } else controlHost.remove();
      }
      const row = controlHost.parentElement?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? controlHost.parentElement : null;
      const fullscreenParent = fullscreen && fullscreen.contains(video) ? fullscreen : null;
      const slot = fullscreenParent && transcriptOpen ? null : row ? {after: row} : transcriptSlot();
      if (!slot) { if (fullscreenParent && transcriptHost.parentElement !== fullscreenParent) fullscreenParent.append(transcriptHost); }
      else if (slot.first) { if (slot.first.firstElementChild !== transcriptHost) slot.first.prepend(transcriptHost); }
      else if (slot.after.parentElement && transcriptHost.previousElementSibling !== slot.after) slot.after.insertAdjacentElement('afterend', transcriptHost);
      if (overlayActive()) placeOverlay();
      placeTheater();
    }

    function restoreHtmlTrack() {
      if (!restoredTrack) return;
      const {track, mode, ownedMode} = restoredTrack;
      if (track.mode === ownedMode) {
        try { track.mode = mode; } catch { /* Detached tracks need no restoration. */ }
      }
      restoredTrack = null;
    }
    function htmlTrackSource() {
      if (!video?.textTracks) return {state: 'none'};
      const tracks = Array.from(video.textTracks).filter(track => ['subtitles', 'captions'].includes(track.kind) || !track.kind);
      if (!tracks.length) return {state: 'none'};
      const track = tracks.find(item => item.mode === 'showing') || tracks.find(item => isEnglishLanguage(item.language)) || tracks[0];
      if (track.mode === 'disabled') {
        try {
          restoredTrack = {track, mode: track.mode, ownedMode: 'hidden'};
          track.mode = 'hidden';
        } catch { restoredTrack = null; return {state: 'unavailable'}; }
      }
      if (!track.cues) return {state: 'loading'};
      const cues = Array.from(track.cues, normalizedCue).filter(Boolean).sort((a, b) => a.startTime - b.startTime);
      if (!cues.length) return {state: 'loading'};
      return {state: 'ready', key: `html:${tracks.indexOf(track)}:${track.language}:${track.label || ''}`, cues};
    }
    function videoIdFromLocation() {
      if (!isYoutube()) return '';
      const pathMatch = location.pathname.match(/^\/(?:shorts|embed|live)\/(?!videoseries\b|live_stream\b)([A-Za-z0-9_-]{6,})/);
      return pathMatch?.[1] || new URL(location.href).searchParams.get('v') || '';
    }
    function bridgeRequest(command, language) {
      return new Promise(resolve => {
        const requestId = `roamcat-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
        const timeoutMs = command === 'discover' || command === 'prepare' || command === 'caption' ? 9000 : 2200;
        const timeout = setTimeout(() => { removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(null); }, timeoutMs);
        function onResponse(event) {
          if (event.detail?.requestId !== requestId) return;
          clearTimeout(timeout); removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(event.detail);
        }
        addEventListener(YOUTUBE_RESPONSE_EVENT, onResponse);
        bridgeCleanup = () => { clearTimeout(timeout); removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(null); };
        dispatchEvent(new CustomEvent(YOUTUBE_REQUEST_EVENT, {detail: {requestId, command, ...(language ? {language} : {})}}));
      });
    }
    function restoreYoutube() {
      if (!youtubePrepared) return;
      youtubePrepared = false;
      void bridgeRequest('restore');
    }
    function safeYoutubeCaptionUrl(rawUrl) {
      try {
        const url = new URL(rawUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext') return null;
        url.searchParams.set('fmt', 'json3');
        url.hash = '';
        return url.href;
      } catch { return null; }
    }
    async function ensureBridge() {
      if (!isYoutube()) return false;
      if (bridgeInstalled) return true;
      if (bridgeFailed || typeof currentCallbacks.onPrepareBridge !== 'function') return false;
      try {
        await currentCallbacks.onPrepareBridge();
        bridgeInstalled = true;
        return true;
      } catch {
        bridgeFailed = true;
        return false;
      }
    }
    function cuesFromText(text) {
      if (typeof text !== 'string' || !text || text.trimStart().startsWith('<')) return null;
      try {
        const parsed = globalThis.RoamCatYoutubeCaptionParser?.parseJson3(text);
        if (!Array.isArray(parsed)) return null;
        const cues = parsed.map(normalizedCue).filter(Boolean).sort((a, b) => a.startTime - b.startTime);
        return cues.length ? cues : null;
      } catch { return null; }
    }
    async function loadCueText(captionUrl) {
      const safe = safeYoutubeCaptionUrl(captionUrl);
      if (!safe || safe === unavailableCaptionUrl || typeof currentCallbacks.onFetchCaption !== 'function') return null;
      try {
        const text = await currentCallbacks.onFetchCaption(safe);
        return cuesFromText(text);
      } catch { return null; }
    }
    async function youtubeSource() {
      const expectedVideoId = videoIdFromLocation();
      if (!expectedVideoId) return {state: 'none'};
      if (!await ensureBridge()) return {state: 'bridge-unavailable'};
      let detail = await bridgeRequest('snapshot');
      if (!detail) return {state: 'bridge-unavailable'};
      if (detail.videoId && detail.videoId !== expectedVideoId) return {state: 'loading'};
      if (!detail.track && discoverAttemptedFor !== expectedVideoId) {
        discoverAttemptedFor = expectedVideoId;
        const discovered = await bridgeRequest('discover');
        if (discovered?.track && (!discovered.videoId || discovered.videoId === expectedVideoId)) detail = discovered;
      }
      if (!detail.track) return {state: 'none'};
      const key = `youtube:${expectedVideoId}:${String(detail.track.languageCode || '')}:${String(detail.track.key || '')}`;
      if (source?.key === key && source.cues?.length) {
        const last = source.cues[source.cues.length - 1];
        const duration = Number(video?.duration);
        const live = !Number.isFinite(duration) || duration === Infinity;
        const mayGrow = live || (Number.isFinite(duration) && last.endTime < duration - 20);
        if (!mayGrow || !video || video.currentTime < last.endTime - 6) return source;
        const loaded = await bridgeRequest('caption');
        const grown = cuesFromText(loaded?.text);
        if (grown?.length) return {state: 'ready', key, cues: grown};
        return source;
      }
      let cues = null;
      if (warmedVideoId !== expectedVideoId) {
        warmedVideoId = expectedVideoId;
        const loaded = await bridgeRequest('caption');
        if (loaded?.track && (!loaded.videoId || loaded.videoId === expectedVideoId)) detail = loaded;
        cues = cuesFromText(loaded?.text);
      }
      if (!cues?.length) cues = await loadCueText(detail.track?.baseUrl);
      if (!cues?.length) {
        unavailableCaptionUrl = safeYoutubeCaptionUrl(detail.track.baseUrl) || unavailableCaptionUrl;
        return {state: 'unavailable'};
      }
      unavailableCaptionUrl = '';
      return {state: 'ready', key, cues};
    }

    function sourceSignature(next) {
      let hash = 2166136261;
      for (const cue of next.cues) {
        const value = `${cue.startTime}\u0000${cue.endTime}\u0000${cue.text}`;
        for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
      }
      return `${next.key}:${next.cues.length}:${hash >>> 0}`;
    }
    function groupCues(cues) {
      const groups = [];
      let bucket = null;
      const flush = () => { if (bucket) groups.push(bucket); bucket = null; };
      cues.forEach((cue, index) => {
        if (!bucket) {
          bucket = {startTime: cue.startTime, endTime: cue.endTime, text: cue.text, cueIndex: index, cueEnd: index};
          return;
        }
        const gap = cue.startTime - bucket.endTime;
        const combined = `${bucket.text} ${cue.text}`.trim();
        const bucketWords = wordCount(bucket.text);
        // 太短的碎片（“Yeah.”“So,”）并进下一组；[Music] 这类声音标记单独成组。
        const tooShort = bucketWords < MIN_GROUP_WORDS && gap <= 0.85 && !/^\[[^\]]+\]$/.test(bucket.text) && !/^\[[^\]]+\]$/.test(cue.text);
        const sentenceDone = /[.!?…]["'”’)]*$/u.test(bucket.text);
        const clauseDone = bucket.text.length >= CLAUSE_BREAK_LENGTH && /[,;:—–]["'”’)]*$/u.test(bucket.text);
        // 自动字幕没有标点：攒够一定词数后，下一条以连接词开头就在这里断开，读起来更像一句话。
        const connectiveBreak = bucketWords >= CONNECTIVE_BREAK_WORDS && CONNECTIVES.has(cue.text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, ''));
        const tooLong = combined.length > MAX_GROUP_LENGTH || wordCount(combined) > MAX_GROUP_WORDS;
        if (!tooShort && (gap > 0.85 || sentenceDone || clauseDone || connectiveBreak || tooLong)) {
          flush();
          bucket = {startTime: cue.startTime, endTime: cue.endTime, text: cue.text, cueIndex: index, cueEnd: index};
          return;
        }
        bucket.endTime = Math.max(bucket.endTime, cue.endTime);
        bucket.text = combined;
        bucket.cueEnd = index;
      });
      flush();
      return groups;
    }
    function wordCount(text) { return String(text).split(/\s+/).filter(word => /[A-Za-z0-9]/.test(word)).length; }
    function groupKey(group) { return `${group.startTime.toFixed(2)}\u0000${group.text}`; }
    function mostlyHan(text) {
      const chars = [...String(text || '').replace(/\s/g, '')];
      if (chars.length < 2) return false;
      const han = chars.filter(ch => /\p{Script=Han}/u.test(ch)).length;
      return han / chars.length >= 0.6;
    }
    function localCaption(text) {
      if (mostlyHan(text)) return text;
      const sound = String(text || '').match(/^\[(music|applause|laughter|silence)\]$/i);
      if (!sound) return '';
      return {music: '[音乐]', applause: '[掌声]', laughter: '[笑声]', silence: '[静音]'}[sound[1].toLowerCase()] || '';
    }
    function acceptableTranslation(sourceText, translation) {
      if (typeof translation !== 'string' || !translation.trim()) return false;
      if (/\p{Script=Han}/u.test(translation)) return true;
      const words = sourceText.split(/\s+/).filter(word => /[A-Za-z]/.test(word));
      return words.length > 0 && words.length < 6;
    }
    function currentGroupIndex(time = video?.currentTime || 0) {
      const groups = source?.groups || [];
      if (!groups.length || !video) return -1;
      let found = -1;
      for (let index = 0; index < groups.length; index += 1) {
        if (groups[index].startTime <= time + 0.2) found = index;
        else break;
      }
      return found;
    }
    function groupAt(time) {
      const groups = source?.groups || [];
      const index = currentGroupIndex(time);
      if (index < 0) return null;
      const group = groups[index];
      return time <= group.endTime + 0.35 ? group : null;
    }
    function groupForCue(index) {
      return (source?.groups || []).find(item => index >= item.cueIndex && index <= item.cueEnd) || null;
    }
    // 一组可能跨好几条字幕：译文只挂在组的第一条下面，后面几条标成“接上一条”，不再每行重复同一句译文。
    function translationForCue(index) {
      const group = groupForCue(index);
      if (!group || group.cueIndex !== index) return '';
      const cached = translations.get(groupKey(group));
      return cached?.status === 'ok' ? cached.text : '';
    }
    function needsTranslation(key) {
      const cached = translations.get(key);
      if (!cached) return true;
      return cached.status === 'error' && cached.attempts < MAX_TRANSLATE_ATTEMPTS && Date.now() - cached.at >= RETRY_AFTER_MS;
    }
    function setNativeCaptionHidden(hidden) {
      const id = 'roamcat-hide-native-captions';
      const existing = document.getElementById(id);
      if (!hidden) { existing?.remove(); return; }
      if (existing) return;
      const style = document.createElement('style');
      style.id = id;
      style.textContent = '.ytp-caption-window-container,.ytp-caption-window-rollup{opacity:0 !important}';
      document.documentElement.append(style);
    }
    function placeOverlay() {
      if (!overlayActive() || !video?.isConnected) {
        overlayHost.style.setProperty('display', 'none', 'important');
        return;
      }
      const fullscreen = document.fullscreenElement;
      const parent = fullscreen && fullscreen.contains(video) ? fullscreen : document.documentElement;
      if (overlayHost.parentElement !== parent) parent.append(overlayHost);
      const rect = video.getBoundingClientRect();
      // 字号跟着画面高度走：小窗不挡画面，全屏不显得太小；设置里的 16–28 作为相对 20 的倍率。
      const base = Math.max(14, Math.min(44, rect.height * 0.046));
      const size = Math.round(base * settings.fontSize / DEFAULT_SETTINGS.fontSize);
      const clearance = controlsClearance(rect);
      // 影院模式下视频下方有空间时，字幕移到画面下方，不再压在画面上。
      const below = theaterOn && settings.offset < 0 ? Math.min(innerHeight - rect.bottom - 8, size * 5) : 0;
      const extended = below >= size * 3;
      overlayHost.style.setProperty('display', 'block', 'important');
      overlayHost.style.setProperty('left', `${rect.left}px`, 'important');
      overlayHost.style.setProperty('top', `${rect.top}px`, 'important');
      overlayHost.style.setProperty('width', `${rect.width}px`, 'important');
      overlayHost.style.setProperty('height', `${rect.height + (extended ? below : 0)}px`, 'important');
      overlayHost.style.setProperty('--sub-size', `${size}px`);
      overlayHost.style.setProperty('--menu-bottom', `${Math.round(clearance + (extended ? below : 0) + 8)}px`);
      if (dragState) return;
      const bottom = settings.offset >= 0 ? rect.height * settings.offset / 100 : extended ? 8 : clearance;
      overlayHost.style.setProperty('--sub-bottom', `${Math.round(bottom)}px`);
    }
    function placeTheater() {
      const fullscreen = document.fullscreenElement;
      if (!theaterOn || !video?.isConnected || fullscreen) { theaterHost.remove(); placeTranscriptForTheater(); return; }
      if (theaterHost.parentElement !== document.documentElement) document.documentElement.append(theaterHost);
      const rect = video.getBoundingClientRect();
      const row = controlHost.parentElement?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? controlHost.parentElement.getBoundingClientRect() : null;
      const bottom = Math.max(rect.bottom, row?.bottom || 0);
      theaterHost.style.setProperty('left', `${rect.left}px`, 'important');
      theaterHost.style.setProperty('top', `${rect.top}px`, 'important');
      theaterHost.style.setProperty('width', `${rect.width}px`, 'important');
      theaterHost.style.setProperty('height', `${bottom - rect.top}px`, 'important');
      placeTranscriptForTheater();
    }
    // 影院模式里原文稿改为右侧浮层（压暗层之上），退出时还原成播放器下方的面板。
    function placeTranscriptForTheater() {
      const floating = theaterOn && transcriptOpen && !document.fullscreenElement;
      transcriptHost.dataset.theater = String(floating);
      const styles = floating
        ? {position: 'fixed', top: '16px', right: '16px', bottom: '16px', width: 'min(380px, 32vw)', 'z-index': '2147483641'}
        : {position: 'static', top: 'auto', right: 'auto', bottom: 'auto', width: '100%', 'z-index': 'auto'};
      for (const [name, value] of Object.entries(styles)) transcriptHost.style.setProperty(name, value, 'important');
    }
    // 播放器控制栏显示时字幕抬到它上面，自动隐藏后落回底部，避免压住进度条。
    function controlsClearance(rect) {
      const player = video?.closest('.html5-video-player');
      if (player) {
        const hidden = player.classList.contains('ytp-autohide') || player.classList.contains('ytp-hide-controls');
        const barHeight = player.querySelector('.ytp-chrome-bottom')?.getBoundingClientRect().height || 48;
        // 控制栏隐藏时也不落进它的区域：字幕可点，压在那里会挡住鼠标，YouTube 就唤不出控制栏。
        return hidden ? barHeight + 4 : barHeight + rect.height * 0.035;
      }
      return video?.controls ? Math.max(rect.height * 0.12, 52) : rect.height * 0.06;
    }
    function schedulePlaceOverlay() {
      if (placeFrame !== null || (!overlayActive() && !theaterOn)) return;
      placeFrame = requestAnimationFrame(() => { placeFrame = null; placeOverlay(); placeTheater(); });
    }
    // timeupdate 只有每秒约 4 次，换句和循环会慢半拍；播放时按帧检查，句子变了才重绘。
    function startPlayLoop() {
      if (playFrame !== null || !overlayActive()) return;
      const tick = () => {
        playFrame = null;
        if (!video || video.paused || !overlayActive() || destroyed) return;
        // 先占住下一帧再重绘：renderOverlay 里的 startPlayLoop 看到已排队就不会再排第二个。
        playFrame = requestAnimationFrame(tick);
        renderOverlay();
      };
      playFrame = requestAnimationFrame(tick);
    }
    function stopPlayLoop() {
      if (playFrame !== null) cancelAnimationFrame(playFrame);
      playFrame = null;
    }
    // 单句循环：播到这句末尾就跳回句首；每句暂停：每句播完停一次，再按播放继续。
    function enforceSentencePlayback() {
      const groups = source?.groups;
      if (!video || !groups?.length || video.paused) return;
      const time = video.currentTime;
      if (loopOn) {
        let group = loopGroupStart === null ? null : groups.find(item => item.startTime === loopGroupStart);
        if (!group) {
          group = groups[Math.max(0, currentGroupIndex())];
          loopGroupStart = group?.startTime ?? null;
        }
        if (group && time >= group.endTime + 0.05) seekTo(group.startTime);
        return;
      }
      // 真实字幕一句接一句、没有空档：按“从第 i 句跨进下一句”的那一刻暂停，而不是等句尾时间点
      // （句尾时刻可能已经被下一句占了）。检查频率低时一次跨过两句也算。
      const index = groupIndexAt(time);
      if (autoPause && playedGroup >= 0 && index > playedGroup && index - playedGroup <= 2 && pausedAfterGroup !== playedGroup) {
        pausedAfterGroup = playedGroup;
        playedGroup = index;
        video.pause();
        return;
      }
      playedGroup = index;
    }
    function groupIndexAt(time) {
      const groups = source?.groups || [];
      let found = -1;
      for (let index = 0; index < groups.length; index += 1) {
        if (groups[index].startTime <= time) found = index;
        else break;
      }
      return found;
    }
    let selfSeekUntil = 0;
    let playedGroup = -1;
    function seekTo(time) {
      if (!video) return;
      selfSeekUntil = Date.now() + 800;
      playedGroup = -1;
      video.currentTime = Math.max(0, time + 0.01);
    }
    // 用户自己拖进度条后，循环改为跟随新位置的那一句，每句暂停也重新计数。
    function onUserSeeked() {
      if (Date.now() < selfSeekUntil) return;
      loopGroupStart = null;
      pausedAfterGroup = -1;
      playedGroup = -1;
    }
    function jumpSentence(delta) {
      const groups = source?.groups;
      if (!video || !groups?.length) { showOverlayHint(T('vid.noCaptions')); return; }
      let index = Math.max(0, currentGroupIndex());
      const current = groups[index];
      // 句首 1.2 秒以后按“上一句”先回到本句开头，再按才是真正的上一句（和播放器的习惯一致）。
      if (delta < 0) index = current && video.currentTime - current.startTime > 1.2 ? index : index - 1;
      else if (delta > 0) index += 1;
      index = Math.max(0, Math.min(groups.length - 1, index));
      pausedAfterGroup = -1;
      if (loopOn) loopGroupStart = groups[index].startTime;
      seekTo(groups[index].startTime);
      if (delta === 0 && video.paused) void video.play().catch(() => {});
      renderOverlay(true);
    }
    function setLoop(next) {
      loopOn = Boolean(next);
      loopGroupStart = null;
      if (loopOn) autoPause = false;
      syncMenu(); renderOverlay(true);
    }
    function setAutoPause(next) {
      autoPause = Boolean(next);
      pausedAfterGroup = -1;
      if (autoPause) loopOn = false;
      syncMenu(); renderOverlay(true);
    }
    function setTheater(next) {
      theaterOn = Boolean(next) && Boolean(video);
      if (theaterOn) {
        try { video.scrollIntoView({block: 'center', behavior: 'smooth'}); } catch { /* Older engines ignore options. */ }
        setTimeout(schedulePlaceOverlay, 400);
      }
      syncMenu(); placeTheater(); renderOverlay(true);
    }
    let hintTimer = null;
    function showOverlayHint(message) {
      overlayEmptyText.textContent = message;
      overlayEmpty.dataset.kind = 'hint';
      overlayEmpty.hidden = false;
      overlayEmpty.querySelector('.retry').hidden = true;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { overlayEmpty.hidden = true; }, 2500);
    }
    function readDomCaption() {
      if (!isYoutube() || !video) return '';
      const root = video.closest('.html5-video-player') || document;
      return [...root.querySelectorAll('.ytp-caption-segment')].map(node => node.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
    }
    // YouTube 直播：时间显示带 ytp-live，或「直播」标记可见。带回看的直播 duration 是有限值，不能只看 Infinity；
    // 还没载入或播放出错时 duration 是 NaN，不算直播。
    function isLiveStream() {
      if (!video) return false;
      if (video.duration === Infinity) return true;
      const player = video.closest('.html5-video-player');
      const badge = player?.querySelector('.ytp-live-badge');
      return Boolean(player?.querySelector('.ytp-time-display.ytp-live') || (badge && getComputedStyle(badge).display !== 'none'));
    }
    // 直播读不到字幕轨道，双语字幕跟着播放器自己显示的 CC 走：CC 开着就安静等下一句，关着才提示去打开。
    function liveCaptionState() {
      const cc = video?.closest('.html5-video-player')?.querySelector('.ytp-subtitles-button');
      if (!cc || !cc.getClientRects().length) return 'live-none';
      return cc.getAttribute('aria-pressed') === 'true' ? 'live-waiting' : 'live-off';
    }
    // 原文稿面板和提示条按当前读取状态说明情况：[提示条文案, 样式, 标题行短文案]。直播没有可回看的原文稿，单独说明，
    // 标题行只放短标签，免得长说明把标题行挤成两行。
    function sourceStateMessage(state = captionState) {
      if (state !== 'loading' && state !== 'ready' && isLiveStream()) return [T('vid.liveTranscript'), 'info', T('vid.liveShort')];
      const messages = {none:[T('vid.noCaptions'),'warning'],loading:[T('vid.loadingCaptions'),''],ready:[T('vid.loadingCaptions'),''],unavailable:[T('vid.timelineUnavailable'),'error'],'bridge-unavailable':[T('vid.componentNotReady'),'error']};
      return messages[state] || messages.unavailable;
    }
    // 没有字幕可用时的提示只停留几秒，不长期压在画面上；同一种状态关掉后不再反复弹。
    function showEmptyNotice(state) {
      const messages = {'bridge-unavailable': T('vid.componentNotReady'), none: T('vid.noTrackBody'), 'live-off': T('vid.liveCcOff'), 'live-none': T('vid.liveNoCc')};
      const message = messages[state] || T('vid.timelineUnavailable');
      const id = `${lastUrl}\u0000${state}`;
      if (emptyDismissedFor === id) { overlayEmpty.hidden = true; return; }
      if (overlayEmpty.hidden || overlayEmptyText.textContent !== message) {
        overlayEmptyText.textContent = message;
        overlayEmpty.title = state === 'none' ? T('vid.noTrackDetail') : message;
        overlayEmpty.dataset.kind = 'empty';
        overlayEmpty.querySelector('.retry').hidden = state.startsWith('live-');
        overlayEmpty.hidden = false;
        clearTimeout(emptyTimer);
        emptyTimer = setTimeout(() => { emptyDismissedFor = id; overlayEmpty.hidden = true; }, EMPTY_NOTICE_MS);
      }
    }
    // 原文按词拆成可点的小块：点词查词，点词与词之间的空白求助整句。
    let karaokeIndex = -2;
    // 每个词一块（data-i 是第几个词，供逐词高亮对时间）；落在生词标注范围里的词加 hard / seen。
    // breakAt：在这个字符位置换行（由 layoutLines 按停顿选出），用 <br> 替换那里的空格。
    function renderOriginalWords(text, group = null, breakAt = -1) {
      const fragment = document.createDocumentFragment();
      const marks = group?.marks || [];
      let offset = 0;
      let index = 0;
      for (const part of String(text).split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { fragment.append(breakAt >= offset && breakAt <= offset + part.length ? document.createElement('br') : part); offset += part.length; continue; }
        const token = document.createElement('span');
        token.className = /[A-Za-z]/.test(part) ? 'tk w' : 'tk';
        token.textContent = part;
        token.dataset.i = String(index);
        if (token.classList.contains('w')) token.dataset.word = part.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
        const mark = marks.find(item => item.start < offset + part.length && item.end > offset);
        if (mark) token.classList.add(mark.seen ? 'seen' : 'hard');
        fragment.append(token);
        offset += part.length;
        index += 1;
      }
      overlayOriginalText.replaceChildren(fragment);
      karaokeIndex = -2;
    }
    function renderTranslationText(translated, breakAt = -1) {
      if (breakAt < 0) { overlayTranslationText.replaceChildren(phraseFragment(translated)); return; }
      overlayTranslationText.replaceChildren(phraseFragment(translated.slice(0, breakAt)), document.createElement('br'), phraseFragment(translated.slice(breakAt).trimStart()));
    }
    // 断行排版：哪一行折成了两行以上，就试着在中间附近的停顿处断开；断开后行数反而变多就退回自动折行。
    function layoutLines(text, group, translated) {
      if (overlayStack.hidden) return;
      if (translated && !overlayTranslation.hidden) {
        const lines = renderedLines(overlayTranslation);
        const cut = lines > 1 ? clauseBreak(translated) : -1;
        if (cut > 0) {
          renderTranslationText(translated, cut);
          if (renderedLines(overlayTranslation) > lines) renderTranslationText(translated);
        }
      }
      if (text && overlayHost.dataset.display !== 'translation') {
        const lines = renderedLines(overlayOriginal);
        const cut = lines > 1 ? clauseBreak(text) : -1;
        if (cut > 0) {
          renderOriginalWords(text, group, cut);
          if (renderedLines(overlayOriginal) > lines) renderOriginalWords(text, group);
        }
      }
    }
    // 逐词高亮：说过的词全亮、还没说到的稍暗、正在说的词下面有一道亮线；只在当前词变化时改 DOM。
    function updateKaraoke(group) {
      if (dictationActive()) return;
      const on = settings.karaoke && Boolean(group) && settings.display !== 'translation';
      overlayHost.dataset.karaoke = String(on);
      if (!on) return;
      const times = tokenTimes(group);
      const time = video.currentTime + 0.05;
      let current = -1;
      for (let index = 0; index < times.length; index += 1) { if (times[index] <= time) current = index; else break; }
      if (current === karaokeIndex) return;
      karaokeIndex = current;
      for (const token of overlayOriginalText.querySelectorAll('.tk')) {
        const index = Number(token.dataset.i);
        token.dataset.said = String(index < current);
        token.dataset.now = String(index === current);
      }
    }
    function renderOverlay(force = false) {
      if (!overlayActive() || !video?.isConnected) {
        overlayHost.style.setProperty('display', 'none', 'important');
        setNativeCaptionHidden(false);
        stopPlayLoop();
        renderedLine = '';
        placeTheater();
        return;
      }
      placeOverlay();
      placeTheater();
      if (!video.paused) startPlayLoop();
      enforceSentencePlayback();
      if (!settings.bilingual) {
        overlayStack.hidden = true;
        setNativeCaptionHidden(false);
        renderedLine = '';
        return;
      }
      if (source?.groups?.length && analyzedSignature !== source.signature) void analyzeSource();
      const group = source?.groups?.length ? groupAt(subtitleTime()) : null;
      const live = !source?.cues?.length ? domCaptionText : '';
      const text = group ? group.text : live;
      const cached = group ? translations.get(groupKey(group)) : live ? translations.get(`live:${live}`) : null;
      const translated = cached?.status === 'ok' ? cached.text : '';
      // 字幕已由我们接管时，句与句之间的空档也一直藏着平台字幕，免得原生字幕在换句时闪出来。
      setNativeCaptionHidden(captionState === 'ready' || Boolean(live));
      if (group && !translated) ensureCurrentTranslated();
      const lineKey = `${captionState}\u0000${text}\u0000${translated}\u0000${settings.display}`;
      if (!force && lineKey === renderedLine) { updateKaraoke(group); return; }
      renderedLine = lineKey;
      overlayStack.hidden = !text;
      // 只看译文时译文还没到，先显示英文垫着，不让画面空着。
      overlayHost.dataset.display = settings.display === 'translation' && !translated ? 'original' : settings.display;
      // 译文没到或没译出时只显示英文，不再用“翻译中…/没有译文”占住字幕位置。
      overlayTranslation.hidden = !translated;
      renderTranslationText(translated);
      renderOriginalWords(text, group);
      layoutLines(text, group, translated);
      updateKaraoke(group);
      const liveState = !text && captionState !== 'ready' && captionState !== 'loading' && isLiveStream() ? liveCaptionState() : '';
      if (text || captionState === 'ready' || captionState === 'loading' || liveState === 'live-waiting') {
        clearTimeout(emptyTimer);
        if (overlayEmpty.dataset.kind === 'empty') overlayEmpty.hidden = true;
      } else showEmptyNotice(liveState || captionState);
    }
    // 生词标注：整份字幕交给本地词库分析一次（ANALYZE：5 万词频 + 阅读记录，不调用模型；已认识的词不会出现）。
    // 每组最多标两个词，按词库给的优先级取前两个；查过的词标“seen”，其余难词标“hard”。
    // 网页阅读设为“只在主动求助时”时后台会拒绝分析，这里就不标，与网页上的行为一致。
    let analyzedSignature = '';
    async function analyzeSource() {
      const target = source;
      if (!target?.groups?.length || typeof currentCallbacks.onAnalyze !== 'function') return;
      analyzedSignature = target.signature;
      const starts = [];
      let text = '';
      for (const group of target.groups) {
        if (text.length + group.text.length + 1 > 200000) break;
        starts.push(text.length);
        text += `${group.text}\n`;
      }
      let result;
      try { result = await currentCallbacks.onAnalyze(text); } catch { return; }
      if (destroyed || source !== target) return;
      const groupAtOffset = offset => {
        let low = 0; let high = starts.length - 1; let found = -1;
        while (low <= high) { const middle = (low + high) >> 1; if (starts[middle] <= offset) { found = middle; low = middle + 1; } else high = middle - 1; }
        return found;
      };
      const marks = new Map();
      for (const term of Array.isArray(result?.terms) ? result.terms : []) {
        for (const occurrence of Array.isArray(term?.occurrences) ? term.occurrences : []) {
          const index = groupAtOffset(Number(occurrence?.start));
          if (index < 0) continue;
          const start = occurrence.start - starts[index];
          const end = occurrence.end - starts[index];
          if (!(end > start) || end > target.groups[index].text.length) continue;
          const list = marks.get(index) || [];
          if (list.length >= 2 || list.some(item => item.start < end && item.end > start)) continue;
          list.push({start, end, seen: term.reason === 'history'});
          marks.set(index, list);
        }
      }
      target.groups.forEach((group, index) => { group.marks = marks.get(index) || []; });
      renderOverlay(true);
    }
    function enqueueTranslate(job) {
      const run = translateQueue.then(job, job);
      translateQueue = run.then(() => {}, () => {});
      return run;
    }
    function failed(key) {
      const attempts = translations.get(key)?.attempts || 1;
      return {status: 'error', text: '', at: Date.now(), attempts};
    }
    // 译文失败时在字幕上说一句原因（余额不足、服务连不上等），同一视频同一原因只提示一次。
    function showTranslateFailure(error) {
      const reason = String(error?.message || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
      const id = `${lastUrl}\u0000${reason}`;
      if (!reason || noticeShownFor === id) return;
      noticeShownFor = id;
      overlayNotice.firstElementChild.textContent = T('vid.translateFailed', {reason});
      overlayNotice.title = String(error.message);
      overlayNotice.hidden = false;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(hideTranslateFailure, EMPTY_NOTICE_MS);
    }
    function hideTranslateFailure() { clearTimeout(noticeTimer); overlayNotice.hidden = true; }
    function wantsTranslation() { return source?.kind !== 'dictation' && settings.bilingual && settings.display !== 'original' && !destroyed; }
    function videoTitle() {
      const heading = isYoutube() ? document.querySelector('h1.ytd-watch-metadata, #title h1')?.textContent : '';
      return String(heading || document.title || '').replace(/\s*-\s*YouTube\s*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 160);
    }
    function clip(text, max, fromEnd = false) {
      const value = String(text || '').replace(/\s+/g, ' ').trim();
      return value.length <= max ? value : fromEnd ? value.slice(value.length - max) : value.slice(0, max);
    }
    // 每句带上视频标题和前后句作上下文：代词、省略句和半句话能译得更准；上下文本身不会被翻译。
    function translationContext(group) {
      const groups = source?.groups || [];
      const index = groups.indexOf(group);
      const before = index > 0 ? groups.slice(Math.max(0, index - 2), index).map(item => item.text).join(' ') : '';
      const after = index >= 0 && index + 1 < groups.length ? groups[index + 1].text : '';
      return {title: videoTitle(), heading: '', before: clip(before, 400, true), after: clip(after, 400)};
    }
    async function translateGroups(groups, generation) {
      for (const group of groups) {
        const key = groupKey(group);
        translations.set(key, {status: 'pending', text: '', attempts: (translations.get(key)?.attempts || 0) + 1});
      }
      renderOverlay(true);
      const remote = [];
      groups.forEach((group, index) => {
        const local = localCaption(group.text);
        if (local) translations.set(groupKey(group), {status: 'ok', text: local});
        else remote.push({group, id: `c${index + 1}`, text: group.text.slice(0, 4000)});
      });
      if (!remote.length || typeof currentCallbacks.onTranslate !== 'function') {
        if (remote.length) for (const item of remote) translations.set(groupKey(item.group), failed(groupKey(item.group)));
        renderOverlay(true);
        refreshTranscriptTranslations();
        return;
      }
      try {
        const payload = remote.map(item => ({id: item.id, text: item.text, context: translationContext(item.group)}));
        const started = performance.now();
        const result = await currentCallbacks.onTranslate(payload);
        const elapsed = performance.now() - started;
        observedTranslateMs = observedTranslateMs ? observedTranslateMs * 0.6 + elapsed * 0.4 : elapsed;
        // 关闭双语只停止新任务；同一字幕源的在途结果仍可缓存，重开时不能留下永久 pending。
        if (destroyed || generation !== sourceGeneration) return;
        const byId = new Map((result?.items || []).map(item => [item.id, item.translation]));
        for (const item of remote) {
          const key = groupKey(item.group);
          const translation = byId.get(item.id);
          translations.set(key, acceptableTranslation(item.text, translation) ? {status: 'ok', text: translation.trim()} : failed(key));
        }
        hideTranslateFailure();
      } catch (error) {
        if (destroyed || generation !== sourceGeneration) return;
        for (const item of remote) translations.set(groupKey(item.group), failed(groupKey(item.group)));
        showTranslateFailure(error);
      }
      renderOverlay(true);
      refreshTranscriptTranslations();
    }
    // 译文预计送到时播放到哪儿：暂停时就是当前位置；播放时往后推一个实测往返时间。
    function arrivalTime() {
      const now = video?.currentTime || 0;
      if (!video || video.paused || !observedTranslateMs) return now;
      return now + observedTranslateMs / 1000 * (video.playbackRate || 1);
    }
    // 当前句优先：没译的句子单独先发一条，不排在预取批次后面；同一时间只有一条插队请求。
    // 往返慢时，正在播的这句等译文回来早已播完，改为插队“译文到时正在播”的那句。
    function ensureCurrentTranslated() {
      if (!wantsTranslation() || priorityRequest) return;
      const groups = source?.groups || [];
      const current = currentGroupIndex();
      const landing = groupIndexAt(arrivalTime());
      const group = [groups[landing], groups[current]].find(item => item && needsTranslation(groupKey(item)));
      if (!group) return;
      const generation = sourceGeneration;
      const request = {};
      priorityRequest = request;
      void (async () => {
        try { await translateGroups([group], generation); } catch { /* 失败状态由批次处理。 */ }
        finally { if (priorityRequest === request) priorityRequest = null; }
      })();
    }
    // 预取窗口按时间算：从当前句起往后 30 秒内（往返慢时放宽到四个往返）、还没译的句子，每批至多 5 句。
    // 播放中、译文回来前就会播完的句子跳过，名额留给译文到时还在屏幕上的句子。
    function pendingAhead(limit) {
      const groups = source?.groups || [];
      const index = Math.max(0, currentGroupIndex());
      const now = video?.currentTime || 0;
      const horizon = now + Math.max(TRANSLATE_LOOK_AHEAD_SECONDS, observedTranslateMs / 1000 * 4);
      const arrival = arrivalTime();
      const todo = [];
      for (let cursor = index; cursor < groups.length && todo.length < limit; cursor += 1) {
        if (cursor > index && groups[cursor].startTime > horizon) break;
        if (groups[cursor].endTime < arrival) continue;
        if (needsTranslation(groupKey(groups[cursor]))) todo.push(groups[cursor]);
      }
      return todo;
    }
    function scheduleTranslation() {
      if (!wantsTranslation()) return;
      ensureCurrentTranslated();
      const maxInFlight = observedTranslateMs >= SLOW_TRANSLATE_MS ? 2 : 1;
      while (prefetchInFlight < maxInFlight) {
        const generation = sourceGeneration;
        const todo = pendingAhead(TRANSLATE_BATCH_SIZE);
        if (!todo.length) return;
        prefetchInFlight += 1;
        // 换了视频会把计数清零，旧视频还在路上的批次回来时不再占新视频的名额。
        void translateGroups(todo, generation).catch(() => {}).finally(() => {
          if (generation !== sourceGeneration) return;
          prefetchInFlight -= 1;
          if (wantsTranslation()) scheduleTranslation();
        });
      }
    }
    function noteDomCaption() {
      if (!settings.bilingual || source?.cues?.length) return;
      const text = readDomCaption();
      if (!text || text === domCaptionText) return;
      const generation = sourceGeneration, url = location.href;
      const current = () => !destroyed && generation === sourceGeneration && url === location.href && !source?.cues?.length;
      domCaptionText = text;
      clearTimeout(domCaptionTimer);
      domCaptionTimer = setTimeout(() => {
        const key = `live:${text}`;
        if (!current()) return;
        if (translations.has(key) || !settings.bilingual) { renderOverlay(); return; }
        const local = localCaption(text);
        if (local) { translations.set(key, {status: 'ok', text: local}); renderOverlay(); return; }
        void enqueueTranslate(async () => {
          if (!current() || translations.has(key) || !settings.bilingual) return;
          translations.set(key, {status: 'pending', text: ''});
          renderOverlay();
          try {
            const result = await currentCallbacks.onTranslate?.([{id: 'c1', text: text.slice(0, 4000)}]);
            if (!current()) return;
            const translation = result?.items?.find(item => item.id === 'c1')?.translation;
            translations.set(key, acceptableTranslation(text, translation) ? {status: 'ok', text: translation.trim()} : {status: 'error', text: ''});
          } catch { if (!current()) return; translations.set(key, {status: 'error', text: ''}); }
          renderOverlay();
        });
      }, 650);
      renderOverlay();
    }
    function retryCaptions() {
      failedVideoId = '';
      discoverAttemptedFor = '';
      warmedVideoId = '';
      refreshSkips = 0;
      bridgeFailed = false;
      unavailableCaptionUrl = '';
      sourceGeneration += 1;
      resetTranslationWork();
      translations.clear();
      captionState = 'loading';
      domCaptionText = '';
      emptyDismissedFor = '';
      noticeShownFor = '';
      hideTranslateFailure();
      renderOverlay(true);
      scheduleTranslation();
      void refreshSource();
    }
    function closeActiveAssist() {
      const assist = activeAssist;
      if (!assist) return;
      activeAssist = null;
      try { assist.controller?.close?.(); } catch { /* The shared card may already be gone. */ }
      finishAssist(assist);
    }
    function finishAssist(assist) {
      if (!assist || assist.finished) return;
      assist.finished = true;
      if (activeAssist === assist) activeAssist = null;
      if (assist.pausedByUs && !assist.intervened && video === assist.video && source?.key === assist.sourceKey && sourceGeneration === assist.generation && assist.video.isConnected && assist.video.paused) {
        try { void assist.video.play(); } catch { /* Autoplay policy may reject safe restoration. */ }
      }
    }
    function resetTranslationWork() {
      // 新源不等待旧源的在途请求；旧队列项执行前会核对代次，不再向模型发送。
      translateQueue = Promise.resolve();
      prefetchInFlight = 0;
      priorityRequest = null;
      clearTimeout(domCaptionTimer);
      domCaptionTimer = null;
    }
    function installSource(next) {
      const signature = sourceSignature(next);
      if (source?.signature === signature) return false;
      const sameTrack = source?.key === next.key;
      if (!sameTrack) {
        sourceGeneration += 1;
        resetTranslationWork();
        closeActiveAssist();
        translations.clear();
        domCaptionText = '';
      }
      const previous = new Map(translations);
      source = {...next, signature, groups: next.kind === 'dictation' ? next.cues.map((cue, index) => ({...cue, cueIndex: index, cueEnd: index})) : groupCues(next.cues)};
      renderedCount = Math.min(RENDER_PAGE_SIZE, source.cues.length);
      if (sameTrack) {
        translations.clear();
        for (const group of source.groups) {
          const key = groupKey(group);
          if (previous.has(key)) translations.set(key, previous.get(key));
        }
      }
      if (next.kind === 'dictation') for (const group of source.groups) translations.set(groupKey(group), {status: 'ok', text: group.translation});
      return true;
    }
    function clearSource() {
      sourceGeneration += 1;
      resetTranslationWork();
      closeActiveAssist();
      source = null;
      renderedCount = 0;
      translations.clear();
      domCaptionText = '';
      captionAbort?.abort(); captionAbort = null;
      renderTranscript(true);
      renderOverlay();
    }
    function applySource(next) {
      if (!next) next = htmlTrackSource();
      captionState = next.state || 'unavailable';
      if (next.state === 'ready') failedVideoId = '';
      else if (isYoutube() && (next.state === 'none' || next.state === 'unavailable')) failedVideoId = videoIdFromLocation();
      if (next.state !== 'ready') {
        if (source) clearSource();
        const [message, kind, short = message] = sourceStateMessage();
        showNotice(message, kind);
        progress.textContent = short;
        noteDomCaption();
        renderOverlay();
        return;
      }
      const changed = installSource(next);
      showNotice('');
      if (changed) renderTranscript(true);
      updateActiveCue();
      scheduleTranslation();
      renderOverlay();
    }
    async function refreshSource() {
      if (destroyed || refreshBusy || !video || dictationActive() || source?.kind === 'dictation') return;
      const youtubeId = isYoutube() ? videoIdFromLocation() : '';
      if (youtubeId && failedVideoId === youtubeId) {
        refreshSkips += 1;
        noteDomCaption();
        renderOverlay();
        if (refreshSkips < 8) return;
        refreshSkips = 0;
        failedVideoId = '';
        warmedVideoId = '';
        discoverAttemptedFor = '';
      }
      refreshBusy = true;
      try {
        const generation = sessionGeneration;
        const next = isYoutube() ? await youtubeSource() : htmlTrackSource();
        // 读轨道期间用户可能已开启听写：迟到的「无字幕」结果不能覆盖听写字幕。
        if (!destroyed && generation === sessionGeneration && !dictationActive() && source?.kind !== 'dictation') applySource(next);
      } finally { refreshBusy = false; }
    }

    function insertionIndex(time) {
      const cues = source?.cues || [];
      let low = 0; let high = cues.length;
      while (low < high) { const middle = (low + high) >> 1; if (cues[middle].startTime <= time) low = middle + 1; else high = middle; }
      return low - 1;
    }
    function currentCueIndex() {
      if (!source?.cues.length || !video) return -1;
      const index = insertionIndex(video.currentTime);
      if (index < 0) return 0;
      return Math.min(index, source.cues.length - 1);
    }
    function contextForCue(index) {
      const target = source.cues[index].text;
      if (target.length > MAX_TARGET_LENGTH || sentenceCount(target) > 3) return null;
      const parts = [target];
      if (index > 0 && source.cues[index - 1].text.length + 1 + target.length <= MAX_CONTEXT_LENGTH) parts.unshift(source.cues[index - 1].text);
      if (index + 1 < source.cues.length && parts.join(' ').length + 1 + source.cues[index + 1].text.length <= MAX_CONTEXT_LENGTH) parts.push(source.cues[index + 1].text);
      return parts.join(' ');
    }
    // 画面上显示的是合并后的一组：求助和查词都以整组为准，上下文是“上一组 + 本组 + 下一组”，
    // 保证被查的词一定落在上下文里（后台会拒绝上下文里找不到的查询）。
    function contextForGroup(group) {
      const groups = source?.groups || [];
      const index = groups.indexOf(group);
      if (index < 0 || group.text.length > MAX_TARGET_LENGTH || sentenceCount(group.text) > 3) return null;
      const parts = [group.text];
      if (index > 0 && groups[index - 1].text.length + 1 + group.text.length <= MAX_CONTEXT_LENGTH) parts.unshift(groups[index - 1].text);
      if (index + 1 < groups.length && parts.join(' ').length + 1 + groups[index + 1].text.length <= MAX_CONTEXT_LENGTH) parts.push(groups[index + 1].text);
      return parts.join(' ');
    }
    // word 存在时查这个词，否则求助整句；group 存在时按画面上的整组取句子和上下文，否则按原文稿里的单条字幕。
    function requestAssist(index, anchor, word = '', group = null) {
      if (!source || !video || index < 0 || index >= source.cues.length) { showNotice(T('vid.noCaptions'), 'warning'); showOverlayHint(T('vid.noCaptions')); return; }
      const cue = group ? {text: group.text} : source.cues[index];
      const context = group ? contextForGroup(group) : contextForCue(index);
      if (!context) { showNotice(T('vid.selTooLong'), 'error'); showOverlayHint(T('vid.selTooLong')); return; }
      closeActiveAssist();
      const assistVideo = video;
      const assistSourceKey = source.key;
      const assistGeneration = sourceGeneration;
      const pausedByUs = !assistVideo.paused;
      const assist = {video: assistVideo, sourceKey: assistSourceKey, generation: assistGeneration, pausedByUs, intervened: false, controller: null, finished: false};
      if (pausedByUs) {
        try { assistVideo.pause(); } catch { assist.pausedByUs = false; }
      }
      activeAssist = assist;
      const isValid = () => !destroyed && activeAssist === assist && video === assistVideo && assistVideo.isConnected && source?.key === assistSourceKey && sourceGeneration === assistGeneration;
      const text = word || cue.text;
      const target = {
        text,
        context,
        kind: word ? 'word' : sentenceCount(cue.text) > 1 ? 'passage' : (cue.text.trim().split(/\s+/).length === 1 ? 'word' : 'phrase'),
        anchorRect: anchor.getBoundingClientRect(),
        sourceKey: assistSourceKey,
        isValid,
        onClose: () => finishAssist(assist),
      };
      try {
        const controller = currentCallbacks.onAssist(target);
        assist.controller = controller && typeof controller.close === 'function' ? controller : null;
      } catch {
        finishAssist(assist);
        showNotice(T('vid.assistFail'), 'error');
      }
    }

    function populateCue(row, index) {
      const cue = source.cues[index];
      row.querySelector('.time').textContent = formatTime(cue.startTime);
      row.querySelector('.src').textContent = cue.text;
      const translated = translationForCue(index);
      const translation = row.querySelector('.translation');
      translation.replaceChildren(phraseFragment(translated));
      translation.hidden = !translated;
      row.dataset.continues = String(Boolean(groupForCue(index)) && groupForCue(index).cueIndex !== index);
      row.dataset.active = String(index === currentCueIndex());
    }
    function refreshTranscriptTranslations() {
      if (!source) return;
      for (const row of list.querySelectorAll('.cue')) {
        const index = Number(row.dataset.index);
        const translation = row.querySelector('.translation');
        if (!translation) continue;
        const translated = translationForCue(index);
        translation.replaceChildren(phraseFragment(translated));
        translation.hidden = !translated;
        row.dataset.continues = String(Boolean(groupForCue(index)) && groupForCue(index).cueIndex !== index);
      }
    }
    function renderTranscript(reset = false) {
      syncDownload();
      // 还没有字幕时按读取状态写明原因，别和下面的提示条说法相反（例如一边「正在读取」一边「未找到」）。
      if (!source) {
        const [message, kind, short = message] = sourceStateMessage();
        list.replaceChildren(); progress.textContent = short; showNotice(message, kind);
        return;
      }
      const previousScroll = list.scrollTop;
      if (reset) list.replaceChildren();
      const limit = Math.min(renderedCount || RENDER_PAGE_SIZE, source.cues.length);
      for (let index = list.querySelectorAll('.cue').length; index < limit; index += 1) {
        const row = document.createElement('div');
        row.className = 'cue'; row.dataset.index = String(index);
        row.innerHTML = `<button class="time" type="button" aria-label="${T('vid.seekAria')}"></button><button class="text" type="button" aria-label="${T('vid.cueAssistAria')}"><span class="src"></span><span class="translation" hidden></span></button>`;
        populateCue(row, index); list.append(row);
      }
      let more = list.querySelector('.more');
      if (limit < source.cues.length) {
        if (!more) {
          more = document.createElement('button'); more.type = 'button'; more.className = 'more';
          more.addEventListener('click', () => { renderedCount = Math.min(source.cues.length, renderedCount + RENDER_PAGE_SIZE); renderTranscript(); });
        }
        more.textContent = T('vid.moreCues',{n:source.cues.length - limit}); list.append(more);
      } else more?.remove();
      if (reset) list.scrollTop = previousScroll;
      progress.textContent = T('vid.cueCount',{n:source.cues.length});
    }
    // 原文稿跟着播放滚动；用户自己滚动后暂停跟随几秒，并给出“回到当前”。
    let programmaticScroll = false;
    function followActiveCue(force = false) {
      if (!transcriptOpen || !source) return;
      if (!force && Date.now() < transcriptFollowPausedUntil) return;
      const active = currentCueIndex();
      if (active < 0) return;
      if (active >= list.querySelectorAll('.cue').length) {
        renderedCount = Math.min(source.cues.length, Math.ceil((active + 1) / RENDER_PAGE_SIZE) * RENDER_PAGE_SIZE);
        renderTranscript();
      }
      const row = list.querySelector(`.cue[data-index="${active}"]`);
      if (!row) return;
      const top = row.offsetTop - list.clientHeight / 3;
      if (Math.abs(list.scrollTop - top) < 4) return;
      programmaticScroll = true;
      list.scrollTop = Math.max(0, top);
      requestAnimationFrame(() => { programmaticScroll = false; });
      followButton.hidden = true;
    }
    function updateActiveCue() {
      if (!source) { noteDomCaption(); renderOverlay(); return; }
      const active = currentCueIndex();
      for (const row of list.querySelectorAll('.cue')) row.dataset.active = String(Number(row.dataset.index) === active);
      followActiveCue();
      noteDomCaption();
      renderOverlay();
      scheduleTranslation();
    }

    function srtTime(seconds) {
      const ms = Math.max(0, Math.round(seconds * 1000));
      const pad = (value, size = 2) => String(value).padStart(size, '0');
      return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
    }
    // 下载 .srt：每段一句，已经译好的段落是“中文 + 英文”两行，没译到的只有英文。不另外发起整段翻译。
    function downloadSubtitles() {
      const groups = source?.groups || [];
      if (!groups.length) { showNotice(T('vid.noCaptions'), 'warning'); showOverlayHint(T('vid.noCaptions')); return; }
      const blocks = groups.map((group, index) => {
        const cached = translations.get(groupKey(group));
        const lines = [cached?.status === 'ok' ? cached.text : '', group.text].filter(Boolean);
        return `${index + 1}\n${srtTime(group.startTime)} --> ${srtTime(group.endTime)}\n${lines.join('\n')}\n`;
      });
      const name = (videoTitle() || 'subtitles').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'subtitles';
      const url = URL.createObjectURL(new Blob([blocks.join('\n')], {type: 'application/x-subrip;charset=utf-8'}));
      const link = document.createElement('a');
      link.href = url; link.download = `${name}.zh-en.srt`; link.style.display = 'none';
      document.documentElement.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const translated = groups.filter(group => translations.get(groupKey(group))?.status === 'ok').length;
      showOverlayHint(T('vid.downloaded', {done: translated, total: groups.length}));
    }

    function restoreNativeState() { restoreHtmlTrack(); restoreYoutube(); }
    function markAssistIntervened() { if (activeAssist) activeAssist.intervened = true; }
    const MEDIA_LISTENERS = [['timeupdate',updateActiveCue],['emptied',onMediaChanged],['loadedmetadata',onMediaChanged],['ended',holdAutoplayForDictation],['play',markAssistIntervened],['play',startPlayLoop],['pause',stopPlayLoop],['seeked',onUserSeeked],['seeked',updateActiveCue],['seeking',markAssistIntervened],['seeked',markAssistIntervened],['ratechange',markAssistIntervened],['volumechange',markAssistIntervened]];
    function detachVideo() {
      stopDictation();
      if (!video) return;
      closeActiveAssist();
      stopPlayLoop();
      for (const [name, handler] of MEDIA_LISTENERS) video.removeEventListener(name, handler);
      restoreNativeState();
      const row = controlHost.parentElement?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? controlHost.parentElement : null;
      if (row) row.remove(); else controlHost.remove();
      transcriptHost.remove(); theaterHost.remove(); video = null;
      theaterOn = false; loopOn = false; autoPause = false; menuOpen = false; syncMenu();
    }
    function attachVideo(next) {
      if (next === video) return;
      detachVideo(); clearSource(); video = next; sessionGeneration += 1;
      if (video) for (const [name, handler] of MEDIA_LISTENERS) video.addEventListener(name, handler);
      placeUi(); if (video) void refreshSource();
    }
    function onMediaChanged() {
      const dictating = dictationActive();
      stopDictation();
      // 换了视频，下面 clearSource 会清掉听写字幕，不能再提示「可回看」。
      if (dictating) { dictationStatus = T('vid.asrInterrupted'); syncMenu(); }
      sessionGeneration += 1;
      failedVideoId = '';
      discoverAttemptedFor = '';
      warmedVideoId = '';
      loopGroupStart = null;
      pausedAfterGroup = -1;
      clearSource();
      restoreNativeState();
      if (video) void refreshSource();
    }
    function setTranscriptOpen(next) {
      transcriptOpen = Boolean(next);
      transcriptButton.setAttribute('aria-pressed', String(transcriptOpen));
      transcriptButton.setAttribute('aria-label', transcriptOpen ? T('vid.collapseTranscript') : T('vid.transcriptOpenAria'));
      transcriptHost.style.setProperty('display', transcriptOpen ? 'block' : 'none', 'important');
      placeUi(); placeTranscriptForTheater();
      if (transcriptOpen) { renderTranscript(true); void refreshSource(); transcriptFollowPausedUntil = 0; requestAnimationFrame(() => followActiveCue(true)); }
    }

    function renderPendingSettings() {
      settings = normalizedSettings(Object.assign({}, confirmedSettings, ...settingsChanges.map(change => change.patch)));
      applySettingsToUi();
    }
    // 本页先预览所有未完成修改；保存按点击顺序执行，失败只移除自己的修改。
    function setVideoSettings(patch) {
      if (patch.bilingual === false) stopDictation();
      const owner = currentCallbacks;
      if (typeof owner.onSettingsChange !== 'function') {
        confirmedSettings = normalizedSettings({...confirmedSettings, ...patch});
        renderPendingSettings();
        if (patch.bilingual === true) void refreshSource();
        showNotice(T('vid.pageOnlySettings'), 'warning');
        return Promise.resolve();
      }
      const change = {patch}, previous = settingsSaveQueue;
      settingsChanges.push(change);
      renderPendingSettings();
      if (patch.bilingual === true) void refreshSource();
      const save = (async () => {
        try {
          await previous;
          // 已经由用户提交的设置继续保存；卸载后只停止界面更新，不丢掉排队的偏好。
          const result = await owner.onSettingsChange(patch);
          if (!destroyed) confirmedSettings = normalizedSettings(result?.video);
        } catch {
          if (!destroyed) {
            showNotice(T('vid.saveFailRevert'), 'error');
            showOverlayHint(T('vid.saveFailRevert'));
          }
        } finally {
          settingsChanges.splice(settingsChanges.indexOf(change), 1);
          if (!destroyed) renderPendingSettings();
        }
      })();
      settingsSaveQueue = save;
      return save;
    }
    function setBilingual(next) { return setVideoSettings({bilingual: next === true}); }
    function setMenuOpen(next) {
      menuOpen = Boolean(next) && Boolean(video);
      syncMenu(); renderOverlay(true);
    }

    // 拖动把手：只改距画面底部的百分比，松手后保存；双击回到自动位置（避开控制栏）。
    overlayGrip.addEventListener('pointerdown', event => {
      if (!video || event.button !== 0) return;
      event.preventDefault();
      const rect = video.getBoundingClientRect();
      const start = parseFloat(getComputedStyle(overlayHost).getPropertyValue('--sub-bottom')) || 0;
      dragState = {pointerId: event.pointerId, startY: event.clientY, start, height: rect.height, percent: settings.offset};
      overlayHost.dataset.dragging = 'true';
      overlayGrip.setPointerCapture(event.pointerId);
    });
    overlayGrip.addEventListener('pointermove', event => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const stackHeight = overlayStack.getBoundingClientRect().height;
      const bottom = Math.max(0, Math.min(dragState.height - stackHeight, dragState.start - (event.clientY - dragState.startY)));
      dragState.percent = Math.round(bottom / dragState.height * 100);
      overlayHost.style.setProperty('--sub-bottom', `${Math.round(bottom)}px`);
    });
    const endDrag = event => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const percent = Math.max(0, Math.min(80, dragState.percent));
      const moved = Math.abs(event.clientY - dragState.startY) > 3;
      dragState = null;
      delete overlayHost.dataset.dragging;
      if (moved) void setVideoSettings({offset: percent});
    };
    overlayGrip.addEventListener('pointerup', endDrag);
    overlayGrip.addEventListener('pointercancel', endDrag);
    overlayGrip.addEventListener('dblclick', () => { void setVideoSettings({offset: -1}); });
    overlayGrip.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const current = settings.offset >= 0 ? settings.offset : 8;
      void setVideoSettings({offset: Math.max(0, Math.min(80, current + (event.key === 'ArrowUp' ? 3 : -3)))});
    });

    // “这句”按画面上正在显示的整组求助；没有分组时退回单条字幕。
    assistButton.addEventListener('click', () => {
      const group = source?.groups?.length ? source.groups[Math.max(0, currentGroupIndex())] : null;
      requestAssist(group ? group.cueIndex : currentCueIndex(), assistButton, '', group);
    });
    bilingualButton.addEventListener('click', () => { void setBilingual(!settings.bilingual); });
    menuToggle.addEventListener('click', () => setMenuOpen(!menuOpen));
    overlayOriginal.addEventListener('click', event => {
      const group = source?.groups?.length ? groupAt(subtitleTime()) : null;
      if (!group) return;
      const word = event.target.closest?.('.w')?.dataset.word || '';
      requestAssist(group.cueIndex, word ? event.target.closest('.w') : overlayOriginal, word, group);
    });
    overlayTranslation.addEventListener('click', () => {
      if (settings.display !== 'translation') return;
      const group = source?.groups?.length ? groupAt(subtitleTime()) : null;
      if (group) requestAssist(group.cueIndex, overlayTranslation, '', group);
    });
    overlayShadow.querySelector('.retry').addEventListener('click', () => retryCaptions());
    menu.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      const group = button.closest('.seg[data-setting]');
      if (group) {
        const key = group.dataset.setting;
        const raw = button.dataset.value;
        const value = key === 'fontSize' ? Number(raw) : key === 'translationFirst' ? raw === 'true' : raw;
        void setVideoSettings({[key]: value});
        return;
      }
      if (button.dataset.setting === 'blur' || button.dataset.setting === 'karaoke') { const key = button.dataset.setting; void setVideoSettings({[key]: !settings[key]}); return; }
      const action = button.dataset.action;
      if (action === 'dictation') { void toggleDictation(); return; }
      if (action === 'loop') setLoop(!loopOn);
      else if (action === 'autoPause') setAutoPause(!autoPause);
      else if (action === 'theater') setTheater(!theaterOn);
      else if (action === 'prev') jumpSentence(-1);
      else if (action === 'replay') jumpSentence(0);
      else if (action === 'next') jumpSentence(1);
      else if (action === 'download') downloadSubtitles();
      else if (action === 'assist') { setMenuOpen(false); assistButton.click(); }
      else if (action === 'transcript') { setMenuOpen(false); setTranscriptOpen(!transcriptOpen); }
      else if (action === 'resetPosition') void setVideoSettings({offset: -1});
    });
    // 点菜单以外的地方关菜单（播放器按钮本身除外，它负责开关）。
    function onDocumentPointerDown(event) {
      if (!menuOpen) return;
      const path = event.composedPath();
      if (path.includes(overlayHost) || path.includes(controlHost)) return;
      setMenuOpen(false);
    }
    // 快捷键都带 Alt，避开 YouTube 自己的单键快捷键（J/K/L、C、←→ 等）；输入框里不响应。
    const SHORTCUTS = {KeyC: () => { void setBilingual(!settings.bilingual); }, KeyR: () => setLoop(!loopOn), KeyP: () => setAutoPause(!autoPause), BracketLeft: () => jumpSentence(-1), BracketRight: () => jumpSentence(1), KeyT: () => setTheater(!theaterOn)};
    function onKeyDown(event) {
      if (!video || event.defaultPrevented || event.isComposing) return;
      const target = event.composedPath()[0];
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (event.key === 'Escape' && (menuOpen || theaterOn)) {
        if (menuOpen) setMenuOpen(false); else setTheater(false);
        event.preventDefault(); event.stopPropagation();
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const action = SHORTCUTS[event.code];
      if (!action) return;
      event.preventDefault(); event.stopPropagation();
      action();
    }
    transcriptButton.addEventListener('click', () => setTranscriptOpen(!transcriptOpen));
    transcriptShadow.querySelector('.close').addEventListener('click', () => setTranscriptOpen(false));
    transcriptShadow.querySelector('.download').addEventListener('click', () => downloadSubtitles());
    followButton.addEventListener('click', () => { transcriptFollowPausedUntil = 0; followActiveCue(true); });
    list.addEventListener('scroll', () => {
      if (programmaticScroll) return;
      transcriptFollowPausedUntil = Date.now() + TRANSCRIPT_FOLLOW_PAUSE_MS;
      followButton.hidden = !source;
    }, {passive: true});
    list.addEventListener('click', event => {
      const row = event.target.closest('.cue'); if (!row || !video || !source) return;
      const index = Number(row.dataset.index);
      if (event.target.closest('.time')) { seekTo(source.cues[index].startTime); loopGroupStart = null; pausedAfterGroup = -1; updateActiveCue(); }
      else if (event.target.closest('.text')) requestAssist(index, event.target.closest('.text'));
    });
    for (const select of transcriptShadow.querySelectorAll('[data-setting]')) {
      select.addEventListener('change', () => {
        const key = select.dataset.setting;
        void setVideoSettings({[key]: key === 'fontSize' ? Number(select.value) : select.value});
      });
    }

    const observer = new MutationObserver(() => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => { frameId = null; attachVideo(visibleVideo()); placeUi(); });
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    function periodicRefresh() {
      if (location.href !== lastUrl) {
        stopDictation();
        lastUrl = location.href;
        sessionGeneration += 1;
        discoverAttemptedFor = '';
        warmedVideoId = '';
        failedVideoId = '';
        refreshSkips = 0;
        bridgeFailed = false;
        unavailableCaptionUrl = '';
        domCaptionText = '';
        loopGroupStart = null;
        pausedAfterGroup = -1;
        clearSource();
        restoreNativeState();
      }
      attachVideo(visibleVideo()); placeUi(); if (video) void refreshSource();
    }
    // 全屏和窗口缩放会改变每行能放几个字：下一帧按新宽度重新排断行。
    function onLayoutChange() { schedulePlaceOverlay(); requestAnimationFrame(() => renderOverlay(true)); }
    function onFullscreenChange() { placeUi(); placeTheater(); onLayoutChange(); }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    // 暂停时没有 timeupdate：滚动、缩放窗口时也要让字幕层跟住视频。
    addEventListener('scroll', schedulePlaceOverlay, {capture: true, passive: true});
    addEventListener('resize', onLayoutChange, {passive: true});
    addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    attachVideo(visibleVideo()); applySettingsToUi(); refreshTimer = setInterval(periodicRefresh, SOURCE_REFRESH_MS);

    return {
      setCallbacks(nextCallbacks) {
        if (typeof nextCallbacks?.onAssist !== 'function') throw new TypeError('onAssist callback is required');
        currentCallbacks = nextCallbacks;
        if (nextCallbacks.settings) { confirmedSettings = normalizedSettings(nextCallbacks.settings); renderPendingSettings(); }
      },
      unmount() {
        destroyed = true; sessionGeneration += 1; sourceGeneration += 1; resetTranslationWork(); clearInterval(refreshTimer);
        if (frameId !== null) cancelAnimationFrame(frameId);
        observer.disconnect(); bridgeCleanup?.(); captionAbort?.abort(); closeActiveAssist(); restoreNativeState(); detachVideo();
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        removeEventListener('scroll', schedulePlaceOverlay, {capture: true});
        removeEventListener('resize', onLayoutChange);
        removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('pointerdown', onDocumentPointerDown, true);
        if (placeFrame !== null) cancelAnimationFrame(placeFrame);
        stopPlayLoop();
        clearTimeout(emptyTimer);
        clearTimeout(hintTimer);
        clearTimeout(noticeTimer);
        clearTimeout(domCaptionTimer);
        setNativeCaptionHidden(false);
        overlayHost.remove();
        theaterHost.remove();
        controlHost.parentElement?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? controlHost.parentElement.remove() : controlHost.remove();
        transcriptHost.remove();
      },
    };
  }

  globalThis[GLOBAL_NAME] = Object.freeze({
    mount(callbacks) { if (instance) instance.setCallbacks(callbacks); else instance = createInstance(callbacks); },
    unmount() { instance?.unmount(); instance = null; },
  });
})();
