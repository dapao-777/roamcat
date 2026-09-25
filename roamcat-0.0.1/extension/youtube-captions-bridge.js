/**
 * @file extension/youtube-captions-bridge.js
 * 文件职责：YouTube字幕桥（MAIN world）——JSON3字幕事件解析，改编自第三方MIT代码。
 * 主要内容：只在VIDEO_SUPPORT_ENABLED时由后台注入；详见vendor许可。
 * 模块边界：不可达保留；第三方归属见NOTICE与vendor LICENSE。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
/*
 * Native timedtext Resource Timing capture adapted from yt-dual-subs:
 * https://github.com/Gythiro/yt-dual-subs/blob/5657c8a18ca30c84b5d4662bca58e3e9214ffdff/inject.js
 * Copyright (c) 2026 Gythiro. MIT License; see vendor/LICENSE.yt-dual-subs.txt.
 */
(() => {
  'use strict';

  const GLOBAL_NAME = 'RoamCatYoutubeCaptionsBridge';
  const REQUEST_EVENT = 'roamcat:youtube-captions-request';
  const RESPONSE_EVENT = 'roamcat:youtube-captions-response';
  const DISPOSE_EVENT = 'roamcat:youtube-captions-dispose';
  if (globalThis[GLOBAL_NAME]) return;
  if (location.protocol !== 'https:' || !['www.youtube.com', 'm.youtube.com'].includes(location.hostname)) return;

  let disposed = false;
  let performanceObserver = null;
  let capturedTrack = null;
  let originalFetch = null;
  let wrappedFetch = null;
  let originalXhrOpen = null;
  let wrappedXhrOpen = null;
  let originalXhrSend = null;
  let wrappedXhrSend = null;
  let preparedState = null;
  const xhrUrls = new WeakMap();

  function stringValue(value, maxLength = 256) { return typeof value === 'string' ? value.slice(0, maxLength) : ''; }
  function displayText(value) {
    if (typeof value === 'string') return value;
    if (typeof value?.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value?.runs)) return value.runs.map(run => stringValue(run?.text)).join('');
    return '';
  }
  function videoIdFromLocation() {
    const pathMatch = location.pathname.match(/^\/(?:shorts|embed|live)\/(?!videoseries\b|live_stream\b)([A-Za-z0-9_-]{6,})/);
    return pathMatch?.[1] || new URL(location.href).searchParams.get('v') || '';
  }
  function safeCaptionUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
      return url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext' ? url.href : '';
    } catch { return ''; }
  }
  function noteTimedtext(rawUrl) {
    if (disposed) return;
    const safeUrl = safeCaptionUrl(rawUrl);
    if (!safeUrl) return;
    const url = new URL(safeUrl);
    const currentVideoId = videoIdFromLocation();
    const capturedVideoId = url.searchParams.get('v') || currentVideoId;
    if (!currentVideoId || capturedVideoId !== currentVideoId) return;
    url.searchParams.delete('tlang');
    capturedTrack = {videoId: currentVideoId, url: url.href, languageCode: url.searchParams.get('lang') || '', kind: url.searchParams.get('kind') || ''};
  }
  function scanResources(entries) {
    for (const entry of entries) if (typeof entry?.name === 'string' && entry.name.includes('/api/timedtext')) noteTimedtext(entry.name);
  }
  function currentPlayer() {
    const playerId = location.pathname.startsWith('/shorts/') ? 'shorts-player' : 'movie_player';
    const player = document.getElementById(playerId);
    return player && typeof player.getPlayerResponse === 'function' ? player : null;
  }
  function responseTracks(player) {
    let response = null;
    try { response = player?.getPlayerResponse?.(); } catch { response = null; }
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  }
  function trackIdentity(track) {
    return `${stringValue(track?.vssId || track?.vss_id)}\u0000${stringValue(track?.languageCode || track?.language_code)}\u0000${stringValue(track?.kind)}`;
  }
  function readSelectedTrack(player, tracks) {
    let selected = null;
    try { selected = player.getOption?.('captions', 'track') || null; } catch { selected = null; }
    const identity = trackIdentity(selected);
    return tracks.find(track => trackIdentity(track) === identity)
      || tracks.find(track => stringValue(selected?.vss_id || selected?.vssId) && stringValue(track?.vssId) === stringValue(selected?.vss_id || selected?.vssId))
      || tracks.find(track => stringValue(selected?.languageCode || selected?.language_code) && stringValue(track?.languageCode) === stringValue(selected?.languageCode || selected?.language_code))
      || null;
  }
  function captionsVisible(player, selectedTrack) {
    try { if (typeof player?.isSubtitlesOn === 'function') return player.isSubtitlesOn() === true; } catch { /* Fall through to control state. */ }
    const button = player?.querySelector?.('.ytp-subtitles-button') || document.querySelector('.ytp-subtitles-button');
    if (button) return button.getAttribute('aria-pressed') === 'true';
    return Boolean(selectedTrack);
  }
  function isEnglish(track) { return /^en(?:-|$)/i.test(stringValue(track?.languageCode)); }
  function chooseEnglishTrack(tracks, selected) {
    if (selected && isEnglish(selected)) return selected;
    return tracks.find(track => isEnglish(track) && stringValue(track.kind) !== 'asr')
      || tracks.find(track => isEnglish(track) && stringValue(track.kind) === 'asr')
      || null;
  }
  function playerTrackValue(track) {
    return {languageCode: stringValue(track?.languageCode, 32), kind: stringValue(track?.kind, 32), vss_id: stringValue(track?.vssId || track?.vss_id, 128)};
  }
  function capturedUrlFor(videoId, track) {
    if (!capturedTrack || capturedTrack.videoId !== videoId) return '';
    if (track?.languageCode && capturedTrack.languageCode && track.languageCode !== capturedTrack.languageCode) return '';
    const expectedKind = track?.kind === 'asr' ? 'asr' : '';
    return capturedTrack.kind === expectedKind ? capturedTrack.url : '';
  }
  function snapshot() {
    const player = currentPlayer();
    if (!player) return {videoId: '', captionVisible: false, track: null};
    let videoData = null;
    let response = null;
    try { videoData = player.getVideoData?.(); } catch { videoData = null; }
    try { response = player.getPlayerResponse?.(); } catch { response = null; }
    const videoId = stringValue(videoData?.video_id || response?.videoDetails?.videoId, 32);
    const tracks = responseTracks(player);
    const selected = readSelectedTrack(player, tracks);
    const chosen = selected && isEnglish(selected) ? selected : null;
    const baseUrl = safeCaptionUrl(capturedUrlFor(videoId, chosen) || chosen?.baseUrl);
    return {
      videoId,
      captionVisible: captionsVisible(player, selected),
      track: chosen && baseUrl ? {
        key: stringValue(chosen.vssId || chosen.languageCode || chosen.kind, 128),
        languageCode: stringValue(chosen.languageCode, 32),
        label: stringValue(displayText(chosen.name), 128),
        baseUrl,
      } : null,
    };
  }
  function clickCaptionButton(player) {
    const button = player?.querySelector?.('.ytp-subtitles-button') || document.querySelector('.ytp-subtitles-button');
    if (!(button instanceof HTMLElement)) return false;
    try { button.click(); return true; } catch { return false; }
  }
  function setTrack(player, track) {
    if (typeof player?.setOption !== 'function') return false;
    try { player.setOption('captions', 'track', playerTrackValue(track)); return true; } catch { return false; }
  }
  function sameSelectedTrack(player, expected) {
    const selected = readSelectedTrack(player, responseTracks(player));
    return Boolean(selected && trackIdentity(selected) === trackIdentity(expected));
  }
  function sleep(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

  function restoreCaptions() {
    const state = preparedState;
    preparedState = null;
    if (!state?.player?.isConnected || videoIdFromLocation() !== state.videoId) return;
    if (state.switchedTrack && sameSelectedTrack(state.player, state.englishTrack) && state.previousTrack) setTrack(state.player, state.previousTrack);
    if (state.toggledVisibility && captionsVisible(state.player, readSelectedTrack(state.player, responseTracks(state.player)))) clickCaptionButton(state.player);
  }
  async function prepareCaptions(language) {
    if (language !== 'en') return false;
    const player = currentPlayer();
    const videoId = videoIdFromLocation();
    if (!player || !videoId) return false;
    if (preparedState?.player === player && preparedState.videoId === videoId && sameSelectedTrack(player, preparedState.englishTrack)) return true;
    restoreCaptions();
    const tracks = responseTracks(player);
    const previousTrack = readSelectedTrack(player, tracks);
    const englishTrack = chooseEnglishTrack(tracks, previousTrack);
    if (!englishTrack) return false;
    const wasVisible = captionsVisible(player, previousTrack);
    const switchedTrack = !previousTrack || trackIdentity(previousTrack) !== trackIdentity(englishTrack);
    if (switchedTrack && !setTrack(player, englishTrack)) return false;
    let selected = !switchedTrack || sameSelectedTrack(player, englishTrack);
    for (let elapsed = 0; !selected && elapsed < 1500; elapsed += 150) {
      await sleep(150);
      if (disposed || player !== currentPlayer() || videoId !== videoIdFromLocation()) return false;
      selected = sameSelectedTrack(player, englishTrack);
    }
    if (!selected) {
      if (previousTrack && sameSelectedTrack(player, englishTrack)) setTrack(player, previousTrack);
      return false;
    }
    let toggledVisibility = false;
    if (!wasVisible) toggledVisibility = clickCaptionButton(player);
    preparedState = {player, videoId, previousTrack, englishTrack, switchedTrack, toggledVisibility};
    return true;
  }
  async function onRequest(event) {
    const requestId = event.detail?.requestId;
    if (typeof requestId !== 'string' || requestId.length > 96 || !/^roamcat-[a-z0-9-]+$/.test(requestId)) return;
    const command = event.detail?.command || 'snapshot';
    if (!['snapshot', 'prepare', 'restore'].includes(command)) return;
    let prepared = false;
    if (command === 'prepare') prepared = await prepareCaptions(event.detail?.language);
    else if (command === 'restore') restoreCaptions();
    dispatchEvent(new CustomEvent(RESPONSE_EVENT, {detail: {requestId, prepared, ...snapshot()}}));
  }

  function installNetworkObservers() {
    try {
      originalFetch = globalThis.fetch;
      if (typeof originalFetch === 'function') {
        wrappedFetch = function (input) {
          try { noteTimedtext(typeof input === 'string' ? input : input?.url); } catch { /* Preserve page fetch behavior. */ }
          return originalFetch.apply(this, arguments);
        };
        globalThis.fetch = wrappedFetch;
      }
    } catch { originalFetch = null; wrappedFetch = null; }
    try {
      const prototype = XMLHttpRequest.prototype;
      originalXhrOpen = prototype.open;
      originalXhrSend = prototype.send;
      wrappedXhrOpen = function (_method, url) {
        try { xhrUrls.set(this, url); } catch { /* Preserve page XHR behavior. */ }
        return originalXhrOpen.apply(this, arguments);
      };
      wrappedXhrSend = function () {
        try { noteTimedtext(xhrUrls.get(this)); } catch { /* Preserve page XHR behavior. */ }
        return originalXhrSend.apply(this, arguments);
      };
      prototype.open = wrappedXhrOpen;
      prototype.send = wrappedXhrSend;
    } catch { /* Partial installation is safely restored below. */ }
  }
  function dispose() {
    disposed = true;
    restoreCaptions();
    removeEventListener(REQUEST_EVENT, onRequest);
    removeEventListener(DISPOSE_EVENT, dispose);
    performanceObserver?.disconnect(); performanceObserver = null;
    if (wrappedFetch && globalThis.fetch === wrappedFetch) globalThis.fetch = originalFetch;
    const xhrPrototype = globalThis.XMLHttpRequest?.prototype;
    if (xhrPrototype && wrappedXhrOpen && xhrPrototype.open === wrappedXhrOpen) xhrPrototype.open = originalXhrOpen;
    if (xhrPrototype && wrappedXhrSend && xhrPrototype.send === wrappedXhrSend) xhrPrototype.send = originalXhrSend;
    capturedTrack = null;
    delete globalThis[GLOBAL_NAME];
  }

  try {
    scanResources(performance.getEntriesByType('resource'));
    if (typeof PerformanceObserver === 'function') {
      performanceObserver = new PerformanceObserver(list => scanResources(list.getEntries()));
      performanceObserver.observe({type: 'resource', buffered: true});
    }
  } catch { performanceObserver = null; }
  installNetworkObservers();
  addEventListener(REQUEST_EVENT, onRequest);
  addEventListener(DISPOSE_EVENT, dispose);
  globalThis[GLOBAL_NAME] = Object.freeze({dispose});
})();
