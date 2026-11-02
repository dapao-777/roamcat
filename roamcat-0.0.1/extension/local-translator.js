/**
 * @file extension/local-translator.js
 * 文件职责：Chrome 本机翻译网关——把一批英文原文交给离屏文档里的浏览器 Translator API 译成简体中文。
 * 主要内容：translateLocal；复用领域识别的同一离屏文档；取消信号到达时立即放弃等待（离屏侧照常结束）。
 * 模块边界：应用层；只被 background 调用；文本不离开本机，语言包须先在设置页由用户手势准备。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {ensureOffscreenDocument} from './local-classifier.js';

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;

export async function translateLocal(texts, {signal} = {}) {
  signal?.throwIfAborted();
  await ensureOffscreenDocument();
  signal?.throwIfAborted();
  const pending = chrome.runtime.sendMessage({target: 'local-translator', type: 'TRANSLATE_LOCAL', texts});
  let stop;
  const aborted = new Promise((_, reject) => {
    if (!signal) return;
    stop = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, {once: true});
  });
  let response;
  try { response = await Promise.race([pending, aborted]); }
  finally { if(stop)signal.removeEventListener('abort',stop); }
  if (!response?.ok) throw Object.assign(new Error(response?.error || M('Chrome 本机翻译没有返回结果', 'Chrome on-device translation returned no result')), {code: response?.code || 'OUTPUT_INVALID'});
  return response.data;
}
