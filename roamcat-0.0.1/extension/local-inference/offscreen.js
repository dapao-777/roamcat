/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const MAX_PENDING = 8;
const MAX_TEXT_LENGTH = 6000;
const MAX_TITLE_LENGTH = 240;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const pending = new Map();
let worker;
let idleTimer;
let nextRequestId = 1;

function bounded(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function releaseWhenIdle() {
  clearTimeout(idleTimer);
  if (pending.size) return;
  // 离屏文档持有计时器；MV3 后台休眠不会让模型一直占用内存。
  idleTimer = setTimeout(() => {
    if (pending.size) return;
    worker?.terminate();
    worker = undefined;
  }, IDLE_TIMEOUT_MS);
}

function getWorker() {
  if (worker) return worker;
  const instance = new Worker('./classifier-worker.js', { type: 'module', name: 'roamcat-local-classifier' });
  worker = instance;
  instance.addEventListener('message', ({ data }) => {
    const request = pending.get(data?.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.ok) request.resolve(data.data);
    else request.reject(new Error(data.error || '本地领域识别失败'));
    releaseWhenIdle();
  });
  instance.addEventListener('error', (event) => {
    if (worker !== instance) return;
    const error = new Error(event.message || '本地领域识别 Worker 异常');
    instance.terminate();
    worker = undefined;
    clearTimeout(idleTimer);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });
  return instance;
}

function classify(text, title) {
  if (pending.size >= MAX_PENDING) return Promise.reject(new Error('本地领域识别队列已满'));
  clearTimeout(idleTimer);
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const activeWorker = getWorker();
    pending.set(id, { resolve, reject });
    activeWorker.postMessage({
      type: 'classify',
      id,
      text: bounded(text, MAX_TEXT_LENGTH),
      title: bounded(title, MAX_TITLE_LENGTH),
    });
  });
}

// Chrome 本机翻译（Translator API，Chrome 138+ 桌面版）：语言包必须先在设置页用用户手势下载，
// 这里只在 availability 为 available 时创建翻译器，空闲 5 分钟后释放。
const TRANSLATOR_OPTIONS = { sourceLanguage: 'en', targetLanguage: 'zh' };
const MAX_TRANSLATE_ITEMS = 32;
const MAX_TRANSLATE_LENGTH = 8000;
let translatorPromise;
let translatorTimer;
let translatorPending=0;

function notReady(message) {
  return Object.assign(new Error(message), { code: 'NOT_READY' });
}

async function localTranslator() {
  const api = globalThis.Translator;
  if (typeof api?.availability !== 'function' || typeof api?.create !== 'function') throw notReady('当前浏览器没有 Translator API');
  if (await api.availability(TRANSLATOR_OPTIONS) !== 'available') throw notReady('英译中语言包尚未准备好');
  translatorPromise ??= api.create(TRANSLATOR_OPTIONS).catch((error) => { translatorPromise = undefined; throw error; });
  return translatorPromise;
}

function releaseTranslatorWhenIdle() {
  clearTimeout(translatorTimer);
  translatorTimer = setTimeout(async () => {
    const current = translatorPromise;
    translatorPromise = undefined;
    try { (await current)?.destroy?.(); } catch {}
  }, IDLE_TIMEOUT_MS);
}

async function translateTexts(texts) {
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_TRANSLATE_ITEMS
    || texts.some((text) => typeof text !== 'string' || !text.trim() || text.length > MAX_TRANSLATE_LENGTH)) throw new Error('本机翻译请求无效');
  clearTimeout(translatorTimer);
  translatorPending++;
  try {
    const translator = await localTranslator();
    const results = [];
    for (const text of texts) results.push(await translator.translate(text));
    return results;
  } finally {
    if (--translatorPending===0) releaseTranslatorWhenIdle();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'local-translator' || message?.type !== 'TRANSLATE_LOCAL') return false;
  if (sender.id !== chrome.runtime.id || sender.tab) {
    sendResponse({ ok: false, error: '不允许网页直接调用本机翻译' });
    return false;
  }
  translateTexts(message.texts).then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, code: error?.code === 'NOT_READY' ? 'NOT_READY' : 'OUTPUT_INVALID', error: error?.message || String(error) }),
  );
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'local-classifier' || message?.type !== 'CLASSIFY_LOCAL') return false;
  if (sender.id !== chrome.runtime.id || sender.tab) {
    sendResponse({ ok: false, error: '不允许网页直接调用本地领域模型' });
    return false;
  }
  classify(message.text, message.title).then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, error: error?.message || String(error) }),
  );
  return true;
});
