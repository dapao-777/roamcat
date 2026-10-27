/**
 * @file extension/live-chat.js
 * 文件职责：Twitch 直播聊天的实时翻译——新消息进来时在原文下方补一行简体中文译文。
 * 主要内容：在聊天输入区放「译」开关（状态存进 settings.video.liveChat），观察聊天列表的新增消息，
 *   过滤表情/单词梗/已是中文的消息，按最新优先、每批至多 8 条经 LIVE_CHAT_TRANSLATE 送翻译；
 *   进队即显示「…」占位，后台流式进度（SS_LIVE_CHAT_PROGRESS）到一条显示一条。
 * 模块边界：只在 www.twitch.tv 的主框架运行，界面在隔离世界；不读历史聊天、不写阅读记录，
 *   积压过多时丢弃旧消息，只追当下正在滚动的那几条。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
(() => {
  'use strict';

  const GLOBAL_NAME = 'RoamCatLiveChat';
  if (globalThis[GLOBAL_NAME] || window.top !== window || location.hostname !== 'www.twitch.tv') return;

  const T = (k, v) => globalThis.RoamCatI18n?.t?.(k, v) ?? k;
  const runtime = chrome.runtime;
  const OWN = 'data-roamcat-ui';
  const MARK = 'data-roamcat-chat';
  // 消息列表与正文：直播间/弹出聊天用 chat-line，回放（VOD）用 vod-message。
  const CONTAINER_SELECTOR = '[data-test-selector="chat-scrollable-area__message-container"],.chat-scrollable-area__message-container,.video-chat__message-list-wrapper';
  const LINE_SELECTOR = '.chat-line__message,.vod-message';
  const BODY_SELECTOR = '[data-a-target="chat-line-message-body"],[data-a-target="chat-message-text"],.message';
  // 调度：每次请求不论条数都有约 10 秒固定开销（订阅通道要拉起 CLI），所以批要大：每批至多 8 条
  // （整页翻译协议上限），同时至多 3 批在路上；积压超过 24 条才丢掉最旧的。
  // API 通道一次往返快得多，后台按标签页限每分钟请求数，超额的批次退回来等窗口腾出再发。
  const SCAN_MS = 1500;
  const BATCH_DELAY_MS = 400;
  const BATCH_SIZE = 8;
  const MAX_QUEUE = 24;
  const MAX_INFLIGHT = 3;
  const PENDING_TEXT = '…';
  const MAX_TEXT = 500;
  const RETRY_AFTER_MS = 8000;
  const BACKFILL = 6;
  const CACHE_LIMIT = 300;

  const state = {enabled: false, ready: false, container: null, observer: null, toggle: null, queue: [], inflight: 0, timer: 0, pausedUntil: 0, error: '', note: '', seq: 0, flights: new Map()};
  const cache = new Map();

  function alive() { try { return Boolean(runtime?.id); } catch { return false; } }
  function request(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!alive()) { reject(new Error(T('c.extDead'))); return; }
      try {
        runtime.sendMessage({type, ...payload}, response => {
          if (runtime.lastError) { reject(new Error(runtime.lastError.message || T('c.disconnected2'))); return; }
          if (!response?.ok) { const error = new Error(response?.error || T('c.disconnected2')); error.code = response?.code; reject(error); return; }
          resolve(response.data);
        });
      } catch (error) { reject(error); }
    });
  }

  // 只取文字片段：表情是 <img>，跳过；@提及与链接保留原样。
  function messageText(body) {
    let text = '';
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {acceptNode: node => node.parentElement?.closest('[' + OWN + ']') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
    while (walker.nextNode()) text += walker.currentNode.nodeValue;
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  }

  // 值不值得翻：太短、只有一个拉丁词（Pog、KEKW、Gamba 这类梗和表情名）、同一个词刷屏、已经是中文的都跳过。
  function worthTranslating(text) {
    const core = text.replace(/https?:\/\/\S+/g, ' ').replace(/@\w+/g, ' ').trim();
    const letters = core.match(/\p{L}/gu)?.length || 0;
    if (letters < 2) return false;
    const han = core.match(/\p{Script=Han}/gu)?.length || 0;
    const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(core);
    if (!kana && han / letters > 0.3) return false;
    const words = core.split(/\s+/).filter(word => /\p{L}/u.test(word));
    if (new Set(words.map(word => word.toLowerCase())).size < 2 && /^[\p{Script=Latin}\d\p{P}\p{S}\s]+$/u.test(core)) return false;
    return true;
  }

  function translationNode(line) { return line.querySelector('[' + OWN + '="live-chat-translation"]'); }
  function paint(line, body, text, pending = false) {
    let node = translationNode(line);
    if (!node) {
      node = document.createElement('div');
      node.setAttribute(OWN, 'live-chat-translation');
      node.lang = 'zh-CN';
      node.style.cssText = 'display:block;margin-top:2px;font-size:.92em;line-height:1.4;white-space:normal;overflow-wrap:anywhere';
      body.after(node);
    }
    node.textContent = text;
    node.style.opacity = pending ? '.4' : '.78';
  }
  function unpaint(line) { translationNode(line)?.remove(); }
  function finish(item, translation) {
    if (!translation) { item.line.setAttribute(MARK, 'skip'); unpaint(item.line); return; }
    cache.set(item.text, translation);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    item.line.setAttribute(MARK, 'done');
    if (state.enabled && item.line.isConnected) paint(item.line, item.body, translation);
  }
  function clearTranslations() {
    document.querySelectorAll('[' + OWN + '="live-chat-translation"]').forEach(node => node.remove());
    document.querySelectorAll('[' + MARK + ']').forEach(node => node.removeAttribute(MARK));
  }

  function consider(line) {
    if (!state.enabled || line.hasAttribute(MARK)) return;
    const body = line.querySelector(BODY_SELECTOR);
    if (!body) return;
    const text = messageText(body);
    if (!text || !worthTranslating(text)) { line.setAttribute(MARK, 'skip'); return; }
    line.setAttribute(MARK, 'queued');
    if (cache.has(text)) { line.setAttribute(MARK, 'done'); paint(line, body, cache.get(text)); return; }
    const seq = ++state.seq;
    state.queue.push({id: 'lc-' + seq, seq, line, body, text});
    paint(line, body, PENDING_TEXT, true);
    trimQueue();
    schedule();
  }
  // 积压太多时丢旧留新：直播聊天看的是当下，追不上的旧消息不再翻。
  function trimQueue() {
    while (state.queue.length > MAX_QUEUE) { const dropped = state.queue.shift(); dropped.line.setAttribute(MARK, 'skip'); unpaint(dropped.line); }
  }
  // 被限速退回的一批按消息先后插回队列，仍在排队的保留「…」占位。
  function requeue(batch) {
    const waiting = batch.filter(item => state.enabled && item.line.isConnected && item.line.getAttribute(MARK) === 'queued');
    state.queue = [...state.queue, ...waiting].sort((a, b) => a.seq - b.seq);
    trimQueue();
  }
  function collect(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(LINE_SELECTOR)) consider(node);
    else node.querySelectorAll(LINE_SELECTOR).forEach(consider);
  }

  function schedule(delay = BATCH_DELAY_MS) {
    if (state.timer || !state.enabled) return;
    state.timer = setTimeout(() => { state.timer = 0; pump(); }, Math.max(delay, state.pausedUntil - Date.now()));
  }
  function pump() {
    if (!state.enabled || document.hidden) return;
    if (Date.now() < state.pausedUntil) { schedule(); return; }
    while (state.inflight < MAX_INFLIGHT && state.queue.length) {
      // 最新的先翻：从队尾取一批，按原顺序发出。
      const batch = state.queue.splice(-BATCH_SIZE).filter(item => item.line.isConnected);
      if (batch.length) void translate(batch);
    }
  }
  // 上下文只给频道名，让模型知道这是直播弹幕式的口语和梗；消息之间互不当作上下文。
  function chatContext() {
    const channel = (location.pathname.match(/^\/(?:popout\/)?([\w-]+)/)?.[1] || '').slice(0, 60);
    return {title: ('Twitch live chat' + (channel ? ' · ' + channel : '')).slice(0, 160), heading: '', before: '', after: ''};
  }
  async function translate(batch) {
    state.inflight++;
    const requestId = 'chat-' + crypto.randomUUID();
    state.flights.set(requestId, new Map(batch.map(item => [item.id, item])));
    try {
      const context = chatContext();
      const result = await request('LIVE_CHAT_TRANSLATE', {requestId, items: batch.map(({id, text}) => ({id, text, context}))});
      // API 通道每分钟有请求上限：超额时后台不发请求、直接退回，等到窗口腾出再接着翻。
      if (result?.throttled) {
        requeue(batch);
        const wait = Number.isFinite(result.retryAfterMs) && result.retryAfterMs > 0 ? result.retryAfterMs : RETRY_AFTER_MS;
        state.pausedUntil = Math.max(state.pausedUntil, Date.now() + wait);
        setNote(T('c.lc.throttled'));
        return;
      }
      const byId = new Map((result?.items || []).map(item => [item.id, item.translation]));
      for (const item of batch) finish(item, typeof byId.get(item.id) === 'string' ? byId.get(item.id).trim() : '');
      setError('');
      setNote('');
    } catch (error) {
      // 失败的这批不再重试（聊天早已滚走），只暂停一会儿再接新消息，并把原因写到开关提示里。
      for (const item of batch) if (item.line.getAttribute(MARK) !== 'done') { item.line.setAttribute(MARK, 'skip'); unpaint(item.line); }
      state.pausedUntil = Date.now() + RETRY_AFTER_MS;
      setError(error?.message || T('c.lc.failed'));
    } finally {
      state.flights.delete(requestId);
      state.inflight--;
      if (state.queue.length) schedule();
    }
  }
  // 流式进度：整批还没回完时，先把已经译好的那几条显示出来。
  function progress(requestId, items) {
    const flight = state.flights.get(requestId);
    if (!flight || !Array.isArray(items)) return;
    for (const value of items) {
      const item = flight.get(value?.id);
      const translation = typeof value?.translation === 'string' ? value.translation.trim() : '';
      if (item && translation && state.enabled && item.line.isConnected) paint(item.line, item.body, translation);
    }
  }

  function attachContainer() {
    const container = document.querySelector(CONTAINER_SELECTOR);
    if (container === state.container) return;
    state.observer?.disconnect();
    state.container = container;
    state.queue = [];
    if (!container) return;
    state.observer = new MutationObserver(records => { for (const record of records) record.addedNodes.forEach(collect); });
    state.observer.observe(container, {childList: true, subtree: true});
    if (state.enabled) backfill();
  }
  // 刚打开时只补最后几条，之前的历史不翻。
  function backfill() {
    const lines = [...(state.container?.querySelectorAll(LINE_SELECTOR) || [])];
    lines.slice(0, -BACKFILL).forEach(line => { if (!line.hasAttribute(MARK)) line.setAttribute(MARK, 'skip'); });
    lines.slice(-BACKFILL).forEach(consider);
  }

  // 「译」开关放在聊天设置按钮左边；Twitch 重绘输入区后由定时扫描补回。
  function createToggle() {
    const host = document.createElement('span');
    host.setAttribute(OWN, 'live-chat-toggle');
    host.style.setProperty('all', 'initial', 'important');
    host.style.setProperty('display', 'inline-flex', 'important');
    host.style.setProperty('align-items', 'center', 'important');
    host.style.setProperty('margin-inline-end', '4px', 'important');
    const shadow = host.attachShadow({mode: 'closed'});
    const tokens = globalThis.RoamCatDesign?.cssFor?.(':host') || '';
    shadow.innerHTML = `<style>${tokens}</style><style>
      button{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 var(--space-2,8px);border:1px solid transparent;border-radius:var(--radius-medium,6px);background:transparent;color:inherit;font:600 var(--fs-3,14px)/1 var(--ui,sans-serif);cursor:pointer}
      button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
      button:focus-visible{outline:2px solid var(--accent,#9b8cff);outline-offset:1px}
      button[aria-pressed="true"]{border-color:color-mix(in srgb,var(--accent,#9b8cff) 60%,transparent);color:var(--accent,#9b8cff)}
      button[data-error]{border-color:var(--danger,#e5484d)}
    </style><button type="button" part="button"></button>`;
    const button = shadow.querySelector('button');
    button.addEventListener('click', event => { if (event.isTrusted) void setEnabled(!state.enabled, true); });
    host.style.setProperty('color', 'inherit', 'important');
    state.toggle = {host, button};
    renderToggle();
    return host;
  }
  function renderToggle() {
    const button = state.toggle?.button;
    if (!button) return;
    button.textContent = T('c.lc.short');
    button.setAttribute('aria-pressed', String(state.enabled));
    const label = state.enabled ? T('c.lc.on') : T('c.lc.off');
    button.setAttribute('aria-label', label);
    const detail = state.error || state.note;
    button.title = detail ? label + '\n' + detail : label;
    button.toggleAttribute('data-error', Boolean(state.error));
  }
  function setError(message) { if (state.error !== message) { state.error = message; renderToggle(); } }
  function setNote(message) { if (state.note !== message) { state.note = message; renderToggle(); } }
  function placeToggle() {
    const anchor = document.querySelector('[data-a-target="chat-settings"]') || document.querySelector('[data-a-target="video-chat-settings"]');
    if (!anchor?.parentElement) return;
    const host = state.toggle?.host || createToggle();
    if (host.isConnected && host.nextElementSibling === anchor) return;
    anchor.parentElement.insertBefore(host, anchor);
  }

  async function setEnabled(enabled, persist) {
    if (state.enabled === enabled && !persist) return;
    state.enabled = enabled;
    state.error = '';
    state.note = '';
    renderToggle();
    if (!enabled) { state.queue = []; state.flights.clear(); clearTimeout(state.timer); state.timer = 0; clearTranslations(); }
    else backfill();
    if (!persist) return;
    try { await request('VIDEO_SETTINGS_PATCH', {patch: {liveChat: enabled}}); }
    catch (error) { setError(error?.message || T('c.lc.failed')); }
  }

  function scan() {
    if (!alive()) { stop(); return; }
    attachContainer();
    placeToggle();
  }
  let scanTimer = 0;
  function stop() {
    clearInterval(scanTimer);
    state.observer?.disconnect();
    clearTimeout(state.timer);
    state.toggle?.host.remove();
  }

  runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'SS_LIVE_CHAT_PROGRESS' && sender?.id === runtime.id) progress(message.requestId, message.items);
    else if (message?.type === 'SS_VIDEO_SETTINGS' && message.video) void setEnabled(message.video.liveChat === true, false);
    else if (message?.type === 'SS_REFRESH' && message.snapshot?.settings?.video) void setEnabled(message.snapshot.settings.video.liveChat === true, false);
    return false;
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.queue.length) schedule(); });
  globalThis.RoamCatI18n?.onChange?.(renderToggle);

  globalThis[GLOBAL_NAME] = {isMounted: () => Boolean(state.toggle?.host.isConnected), enabled: () => state.enabled, worthTranslating};
  request('STATE_GET').then(snapshot => { scan(); void setEnabled(snapshot?.settings?.video?.liveChat === true, false); }).catch(() => {});
  scanTimer = setInterval(scan, SCAN_MS);
  scan();
})();
