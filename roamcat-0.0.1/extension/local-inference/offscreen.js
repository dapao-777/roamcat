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
