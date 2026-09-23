/**
 * @file extension/video-subtitles.js
 * 文件职责：视频字幕支持（当前不可达）——播放器字幕捕获与求助入口。
 * 主要内容：VIDEO_SUPPORT_ENABLED=false时不加载；代码与许可保留待启用。
 * 模块边界：死码保留；启用前须同步SPEC 1.2与隐私披露。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  'use strict';

  const GLOBAL_NAME = 'RoamCatVideoSubtitles';
  if (globalThis[GLOBAL_NAME]) return;

  const YOUTUBE_REQUEST_EVENT = 'roamcat:youtube-captions-request';
  const YOUTUBE_RESPONSE_EVENT = 'roamcat:youtube-captions-response';
  const HOST_ATTRIBUTE = 'data-roamcat-ui';
  const SOURCE_REFRESH_MS = 1600;
  const RENDER_PAGE_SIZE = 100;
  const MAX_TARGET_LENGTH = 600;
  const MAX_CONTEXT_LENGTH = 2000;
  const DEFAULT_SETTINGS = Object.freeze({fontSize: 20, theme: 'auto'});
  const FONT_SIZES = new Set([16, 20, 24, 28]);
  const THEMES = new Set(['auto', 'light', 'dark']);

  let instance = null;

  function normalizedSettings(value) {
    return {
      fontSize: FONT_SIZES.has(value?.fontSize) ? value.fontSize : DEFAULT_SETTINGS.fontSize,
      theme: THEMES.has(value?.theme) ? value.theme : DEFAULT_SETTINGS.theme,
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
        :host{display:inline-flex;flex:0 0 auto;gap:var(--space-2);font-family:var(--sans)}
        button{min-height:36px;padding:var(--space-2) var(--space-3);border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);color:var(--accent);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--sans);cursor:pointer;white-space:nowrap}
        button:hover{background:var(--surface-hover);border-color:var(--accent-line)}
        button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}
        button[aria-pressed="true"]{background:var(--action);border-color:var(--action);color:var(--on-action)}
        :host([data-youtube="true"]){gap:0}
        :host([data-youtube="true"]) button{width:48px;height:var(--native-control-size,48px);min-height:var(--native-control-size,48px);padding:0 4px;border:0;border-radius:0;background:transparent;color:var(--on-action);font-size:var(--type-control)}
        :host([data-youtube="true"]) button:hover{background:var(--action)}
        :host([data-youtube="true"]) button[aria-pressed="true"]{box-shadow:inset 0 -3px var(--on-action)}
      </style>
      <button class="assist" type="button" aria-label="帮助理解当前字幕">这句</button>
      <button class="transcript" type="button" aria-label="展开英文原文稿" aria-pressed="false">原文</button>`;
    const assistButton = controlShadow.querySelector('.assist');
    const transcriptButton = controlShadow.querySelector('.transcript');

    const transcriptHost = document.createElement('section');
    transcriptHost.setAttribute(HOST_ATTRIBUTE, 'video-transcript');
    transcriptHost.style.setProperty('all', 'initial', 'important');
    transcriptHost.style.setProperty('display', 'none', 'important');
    transcriptHost.style.setProperty('width', '100%', 'important');
    transcriptHost.style.setProperty('box-sizing', 'border-box', 'important');
    const transcriptShadow = transcriptHost.attachShadow({mode: 'closed'});
    transcriptShadow.innerHTML = `
      <style data-theme-tokens>${tokens}</style><style>
        :host{display:block;width:100%;color:var(--ink);font-family:var(--sans);color-scheme:light dark}
        .panel{box-sizing:border-box;margin:var(--space-3) 0;border:1px solid var(--line);border-radius:var(--radius-panel);background:var(--surface);color:var(--ink);overflow:hidden}
        header{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--line);background:var(--surface)}
        h2{margin:0;font:var(--weight-medium) var(--type-body)/var(--leading-control) var(--sans)}
        .progress{margin-right:auto;color:var(--muted-strong);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--sans)}
        label{display:inline-flex;align-items:center;gap:6px;color:var(--muted-strong);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--sans)}
        select,.close{min-height:36px;border:1px solid var(--line);border-radius:var(--radius-control);background:var(--surface);color:var(--ink);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--sans)}
        select{padding:4px 24px 4px 8px}.close{padding:4px 10px;cursor:pointer}
        select:focus-visible,button:focus-visible{outline:var(--focus-ring);outline-offset:var(--focus-offset)}
        .notice{display:none;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--warning-soft);color:var(--warning);font:var(--weight-medium) var(--type-support)/var(--leading-support) var(--sans)}
        .notice[data-kind="error"]{background:var(--danger-soft);color:var(--danger)}
        .list{max-height:min(52vh,620px);overflow:auto;padding:4px 0;background:var(--paper)}
        .cue{display:grid;grid-template-columns:70px minmax(0,1fr);gap:12px;width:100%;box-sizing:border-box;border-bottom:1px solid var(--line);background:transparent;color:var(--ink)}
        .cue[data-active="true"]{background:var(--accent-soft)}
        .time,.text{border:0;background:transparent;color:inherit;cursor:pointer;text-align:left}
        .time{padding:12px 0 12px 16px;color:var(--accent);font:var(--weight-semibold) var(--type-support)/var(--leading-support) var(--mono)}
        .text{min-width:0;padding:10px 16px 10px 0;font:var(--weight-regular) var(--cue-size,20px)/1.5 var(--sans);overflow-wrap:anywhere}
        .time:hover,.text:hover{background:var(--surface-hover)}
        .more{display:block;margin:var(--space-3) auto;min-height:36px;padding:var(--space-2) var(--space-4);border:1px solid var(--line);border-radius:var(--radius-pill);background:var(--surface);color:var(--accent);font:var(--weight-medium) var(--type-control)/var(--leading-control) var(--sans);cursor:pointer}
        @media(max-width:640px){header{align-items:flex-start}.cue{grid-template-columns:56px minmax(0,1fr)}label{width:calc(50% - 8px)}}
      </style>
      <div class="panel"><header><h2>英文原文稿</h2><span class="progress">正在读取字幕…</span>
        <label>字号<select data-setting="fontSize"><option value="16">16</option><option value="20">20</option><option value="24">24</option><option value="28">28</option></select></label>
        <label>主题<select data-setting="theme"><option value="auto">跟随系统</option><option value="light">明亮</option><option value="dark">深色</option></select></label>
        <button class="close" type="button">关闭</button>
      </header><div class="notice" role="status" aria-live="polite"></div><div class="list"></div></div>`;
    const list = transcriptShadow.querySelector('.list');
    const progress = transcriptShadow.querySelector('.progress');
    const notice = transcriptShadow.querySelector('.notice');
    const themeStyles = [controlShadow, transcriptShadow].map(shadow => shadow.querySelector('[data-theme-tokens]'));

    let currentCallbacks = callbacks;
    let settings = normalizedSettings(callbacks.settings);
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
      return {startTime: Math.max(0, startTime), endTime: Math.max(startTime, endTime), text};
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
      for (const select of transcriptShadow.querySelectorAll('[data-setting]')) select.value = String(settings[select.dataset.setting]);
    }
    function showNotice(message, kind = '') {
      notice.textContent = message;
      notice.dataset.kind = kind;
      notice.style.display = message ? 'block' : 'none';
    }

    function visibleVideo() {
      let selected = null;
      let selectedArea = 0;
      for (const candidate of document.querySelectorAll('video')) {
        if (!candidate.isConnected) continue;
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
    function transcriptAnchor() {
      if (!video) return null;
      if (youtubeControls()) return video.closest('ytd-player') || video.closest('#player') || video.closest('.html5-video-player') || video;
      return video.closest('[data-player],.video-player,.player') || video;
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
      const after = row || transcriptAnchor();
      if (after?.parentElement && transcriptHost.previousElementSibling !== after) after.insertAdjacentElement('afterend', transcriptHost);
      const fullscreenParent = fullscreen && fullscreen.contains(video) ? fullscreen : null;
      if (fullscreenParent && transcriptOpen && transcriptHost.parentElement !== fullscreenParent) fullscreenParent.append(transcriptHost);
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
      const tracks = Array.from(video.textTracks).filter(track => (['subtitles', 'captions'].includes(track.kind) || !track.kind) && isEnglishLanguage(track.language));
      if (!tracks.length) return {state: 'none'};
      const track = tracks.find(item => item.mode === 'showing') || tracks.find(item => item.mode === 'hidden') || tracks[0];
      if (track.mode === 'disabled') {
        try {
          restoredTrack = {track, mode: track.mode, ownedMode: 'showing'};
          track.mode = 'showing';
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
        const timeout = setTimeout(() => { removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(null); }, 2200);
        function onResponse(event) {
          if (event.detail?.requestId !== requestId) return;
          clearTimeout(timeout); removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(event.detail);
        }
        addEventListener(YOUTUBE_RESPONSE_EVENT, onResponse);
        bridgeCleanup = () => { clearTimeout(timeout); removeEventListener(YOUTUBE_RESPONSE_EVENT, onResponse); bridgeCleanup = null; resolve(null); };
        dispatchEvent(new CustomEvent(YOUTUBE_REQUEST_EVENT, {detail: {requestId, command, ...(language ? {language} : {})}}));
      });
    }
    async function prepareYoutube() {
      if (youtubePrepared) return true;
      const detail = await bridgeRequest('prepare', 'en');
      youtubePrepared = detail?.prepared === true;
      return youtubePrepared;
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
        return url.href;
      } catch { return null; }
    }
    async function youtubeSource() {
      const expectedVideoId = videoIdFromLocation();
      if (!expectedVideoId) return {state: 'none'};
      if (!await prepareYoutube()) return {state: 'none'};
      const detail = await bridgeRequest('snapshot');
      if (!detail) return {state: 'bridge-unavailable'};
      if (detail.videoId !== expectedVideoId) return {state: 'loading'};
      if (!detail.track || !isEnglishLanguage(detail.track.languageCode)) return {state: 'none'};
      const captionUrl = safeYoutubeCaptionUrl(detail.track.baseUrl);
      if (!captionUrl || captionUrl === unavailableCaptionUrl) return {state: 'unavailable'};
      const key = `youtube:${expectedVideoId}:${String(detail.track.key || detail.track.languageCode || captionUrl)}`;
      if (source?.key === key) return source;
      captionAbort?.abort();
      const controller = new AbortController();
      captionAbort = controller;
      try {
        const response = await fetch(captionUrl, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal});
        if (!response.ok) throw new Error('caption request failed');
        const parsed = globalThis.RoamCatYoutubeCaptionParser?.parseJson3(await response.text());
        if (!Array.isArray(parsed)) throw new Error('caption format unavailable');
        const cues = parsed.map(normalizedCue).filter(Boolean).sort((a, b) => a.startTime - b.startTime);
        return cues.length ? {state: 'ready', key, cues} : {state: 'unavailable'};
      } catch (error) {
        if (error?.name === 'AbortError') return {state: 'loading'};
        unavailableCaptionUrl = captionUrl;
        return {state: 'unavailable'};
      } finally { if (captionAbort === controller) captionAbort = null; }
    }

    function sourceSignature(next) {
      let hash = 2166136261;
      for (const cue of next.cues) {
        const value = `${cue.startTime}\u0000${cue.endTime}\u0000${cue.text}`;
        for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
      }
      return `${next.key}:${next.cues.length}:${hash >>> 0}`;
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
    function installSource(next) {
      const signature = sourceSignature(next);
      if (source?.signature === signature) return false;
      sourceGeneration += 1;
      closeActiveAssist();
      source = {...next, signature};
      renderedCount = Math.min(RENDER_PAGE_SIZE, source.cues.length);
      return true;
    }
    function clearSource() {
      sourceGeneration += 1;
      closeActiveAssist();
      source = null;
      renderedCount = 0;
      captionAbort?.abort(); captionAbort = null;
      renderTranscript(true);
    }
    function applySource(next) {
      if (!next) next = htmlTrackSource();
      if (next.state !== 'ready') {
        if (source) clearSource();
        const messages = {none:['未找到可用英文字幕','warning'],loading:['正在读取英文字幕…',''],unavailable:['英文字幕时间轴不可获得','error'],'bridge-unavailable':['YouTube 字幕读取组件未就绪','error']};
        const [message, kind] = messages[next.state] || messages.unavailable;
        showNotice(message, kind);
        progress.textContent = message;
        return;
      }
      const changed = installSource(next);
      showNotice('');
      if (changed) renderTranscript(true);
      updateActiveCue();
    }
    async function refreshSource() {
      if (destroyed || refreshBusy || !video) return;
      refreshBusy = true;
      try {
        const generation = sessionGeneration;
        const next = isYoutube() ? await youtubeSource() : htmlTrackSource();
        if (!destroyed && generation === sessionGeneration) applySource(next);
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
    function requestAssist(index, anchor) {
      if (!source || !video || index < 0 || index >= source.cues.length) { showNotice('未找到可用英文字幕', 'warning'); return; }
      const cue = source.cues[index];
      const context = contextForCue(index);
      if (!context) { showNotice('请只选择一个句子或短段（最多 3 句、600 字符）', 'error'); return; }
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
      const target = {
        text: cue.text,
        context,
        kind: sentenceCount(cue.text) > 1 ? 'passage' : (cue.text.trim().split(/\s+/).length === 1 ? 'word' : 'phrase'),
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
        showNotice('暂时无法打开字幕帮助', 'error');
      }
    }

    function populateCue(row, index) {
      const cue = source.cues[index];
      row.querySelector('.time').textContent = formatTime(cue.startTime);
      row.querySelector('.text').textContent = cue.text;
      row.dataset.active = String(index === currentCueIndex());
    }
    function renderTranscript(reset = false) {
      if (!source) { list.replaceChildren(); progress.textContent = '正在读取字幕…'; return; }
      const previousScroll = list.scrollTop;
      if (reset) list.replaceChildren();
      const limit = Math.min(renderedCount || RENDER_PAGE_SIZE, source.cues.length);
      for (let index = list.querySelectorAll('.cue').length; index < limit; index += 1) {
        const row = document.createElement('div');
        row.className = 'cue'; row.dataset.index = String(index);
        row.innerHTML = '<button class="time" type="button" aria-label="跳转到字幕时间"></button><button class="text" type="button" aria-label="帮助理解这句字幕"></button>';
        populateCue(row, index); list.append(row);
      }
      let more = list.querySelector('.more');
      if (limit < source.cues.length) {
        if (!more) {
          more = document.createElement('button'); more.type = 'button'; more.className = 'more';
          more.addEventListener('click', () => { renderedCount = Math.min(source.cues.length, renderedCount + RENDER_PAGE_SIZE); renderTranscript(); });
        }
        more.textContent = `继续显示（剩余 ${source.cues.length - limit} 条）`; list.append(more);
      } else more?.remove();
      if (reset) list.scrollTop = previousScroll;
      progress.textContent = `${source.cues.length} 条英文字幕`;
    }
    function updateActiveCue() {
      if (!source) return;
      const active = currentCueIndex();
      for (const row of list.querySelectorAll('.cue')) row.dataset.active = String(Number(row.dataset.index) === active);
    }

    function restoreNativeState() { restoreHtmlTrack(); restoreYoutube(); }
    function markAssistIntervened() { if (activeAssist) activeAssist.intervened = true; }
    function detachVideo() {
      if (!video) return;
      closeActiveAssist();
      for (const [name, handler] of [['timeupdate',updateActiveCue],['emptied',onMediaChanged],['loadedmetadata',onMediaChanged],['play',markAssistIntervened],['seeking',markAssistIntervened],['seeked',markAssistIntervened],['ratechange',markAssistIntervened],['volumechange',markAssistIntervened]]) video.removeEventListener(name, handler);
      restoreNativeState();
      const row = controlHost.parentElement?.matches?.(`[${HOST_ATTRIBUTE}="video-subtitles-row"]`) ? controlHost.parentElement : null;
      if (row) row.remove(); else controlHost.remove();
      transcriptHost.remove(); video = null;
    }
    function attachVideo(next) {
      if (next === video) return;
      detachVideo(); clearSource(); video = next; sessionGeneration += 1;
      if (video) {
        for (const [name, handler] of [['timeupdate',updateActiveCue],['emptied',onMediaChanged],['loadedmetadata',onMediaChanged],['play',markAssistIntervened],['seeking',markAssistIntervened],['seeked',markAssistIntervened],['ratechange',markAssistIntervened],['volumechange',markAssistIntervened]]) video.addEventListener(name, handler);
      }
      placeUi(); if (video) void refreshSource();
    }
    function onMediaChanged() { sessionGeneration += 1; clearSource(); restoreNativeState(); if (video) void refreshSource(); }
    function setTranscriptOpen(next) {
      transcriptOpen = Boolean(next);
      transcriptButton.setAttribute('aria-pressed', String(transcriptOpen));
      transcriptButton.setAttribute('aria-label', transcriptOpen ? '收起英文原文稿' : '展开英文原文稿');
      transcriptHost.style.setProperty('display', transcriptOpen ? 'block' : 'none', 'important');
      placeUi(); if (transcriptOpen) { renderTranscript(true); void refreshSource(); }
    }

    assistButton.addEventListener('click', () => requestAssist(currentCueIndex(), assistButton));
    transcriptButton.addEventListener('click', () => setTranscriptOpen(!transcriptOpen));
    transcriptShadow.querySelector('.close').addEventListener('click', () => setTranscriptOpen(false));
    list.addEventListener('click', event => {
      const row = event.target.closest('.cue'); if (!row || !video || !source) return;
      const index = Number(row.dataset.index);
      if (event.target.closest('.time')) { video.currentTime = source.cues[index].startTime; updateActiveCue(); }
      else if (event.target.closest('.text')) requestAssist(index, event.target.closest('.text'));
    });
    for (const select of transcriptShadow.querySelectorAll('[data-setting]')) {
      select.addEventListener('change', async () => {
        const key = select.dataset.setting;
        const previous = settings;
        const candidate = normalizedSettings({...settings, [key]: key === 'fontSize' ? Number(select.value) : select.value});
        settings = candidate; applySettingsToUi(); showNotice('');
        if (typeof currentCallbacks.onSettingsChange !== 'function') { showNotice('设置仅在当前页面生效', 'warning'); return; }
        try {
          const result = await currentCallbacks.onSettingsChange({[key]: candidate[key]});
          settings = normalizedSettings(result?.video); applySettingsToUi();
        } catch {
          settings = previous; applySettingsToUi(); showNotice('设置保存失败，已恢复原设置', 'error');
        }
      });
    }

    const observer = new MutationObserver(() => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => { frameId = null; attachVideo(visibleVideo()); placeUi(); });
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    function periodicRefresh() {
      if (location.href !== lastUrl) { lastUrl = location.href; sessionGeneration += 1; clearSource(); restoreNativeState(); }
      attachVideo(visibleVideo()); placeUi(); if (video) void refreshSource();
    }
    function onFullscreenChange() { placeUi(); }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    attachVideo(visibleVideo()); applySettingsToUi(); refreshTimer = setInterval(periodicRefresh, SOURCE_REFRESH_MS);

    return {
      setCallbacks(nextCallbacks) {
        if (typeof nextCallbacks?.onAssist !== 'function') throw new TypeError('onAssist callback is required');
        currentCallbacks = nextCallbacks;
        if (nextCallbacks.settings) { settings = normalizedSettings(nextCallbacks.settings); applySettingsToUi(); }
      },
      unmount() {
        destroyed = true; sessionGeneration += 1; clearInterval(refreshTimer);
        if (frameId !== null) cancelAnimationFrame(frameId);
        observer.disconnect(); bridgeCleanup?.(); captionAbort?.abort(); closeActiveAssist(); restoreNativeState(); detachVideo();
        document.removeEventListener('fullscreenchange', onFullscreenChange);
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
