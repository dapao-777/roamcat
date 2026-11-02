/**
 * @file extension/local-classifier.js
 * 文件职责：本地分类网关——离屏文档生命周期管理与分类请求队列。
 * 主要内容：OFFSCREEN_URL按需创建、5分钟空闲销毁；网页不得直调；ensureOffscreenDocument 供 Chrome 本机翻译复用同一离屏文档。
 * 模块边界：应用层；经runtime消息走offscreen；被background调用。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;
const OFFSCREEN_URL = 'local-inference/offscreen.html';
const MAX_TEXT_LENGTH = 6000;
const MAX_TITLE_LENGTH = 240;

let creatingDocument;
let requestChain = Promise.resolve();

function bounded(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

async function hasOffscreenDocument() {
  if (chrome.offscreen.hasDocument) return chrome.offscreen.hasDocument();
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  creatingDocument ??= chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['WORKERS'],
    justification: M('运行本地 ONNX 领域分类 Worker，并复用文档执行浏览器本机翻译','Run the local ONNX domain-classification worker and reuse the document for browser on-device translation'),
  }).finally(() => { creatingDocument = undefined; });
  await creatingDocument;
}

async function performClassification(text, title) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: 'local-classifier',
    type: 'CLASSIFY_LOCAL',
    text: bounded(text, MAX_TEXT_LENGTH),
    title: bounded(title, MAX_TITLE_LENGTH),
  });
  if (!response?.ok) throw new Error(response?.error || M('本地领域识别没有返回结果','Local domain detection returned no result'));
  return response.data;
}

export function classifyLocal(text, title = '') {
  const run = requestChain.then(() => performClassification(text, title));
  requestChain = run.catch(() => {});
  return run;
}
