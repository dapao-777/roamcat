/**
 * @file tools/unit/connector-error-i18n.test.mjs
 * 文件职责：为 extension/subscription.js 的 localizeConnectorError 提供 node:test 单元测试——
 *   订阅连接器的已分类错误（“中文提示（category; …）”）须随界面语言回译。
 * 主要内容：中文档原样还原连接器文案；英文档不含中文且保留类别细节；未分类/未知类别原样返回；
 *   三个连接器源码里出现的每个 category 都在 i18n 双语典里有对应键。
 * 模块边界：加载真实 i18n.js 运行时，不启动连接器进程。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

globalThis.chrome = {runtime: {lastError: null}, i18n: {getUILanguage: () => 'zh-CN'}};
await import('../../roamcat-0.0.1/extension/i18n.js');
const {localizeConnectorError} = await import('../../roamcat-0.0.1/extension/subscription.js');
const i18n = globalThis.RoamCatI18n;
const CJK = /[一-鿿]/;

test('中文档：回译结果与连接器原文一致', () => {
  i18n.setPref('zh');
  const codex = 'ChatGPT 登录已失效，请重新连接。（authentication; account/read; unauthorized; HTTP 401）';
  assert.equal(localizeConnectorError(codex, 'chatgpt'), codex);
  const agy = 'Google 登录已失效，请在终端运行 agy 重新登录。（authentication）';
  assert.equal(localizeConnectorError(agy, 'antigravity'), agy);
});

test('英文档：不含中文，保留类别细节，按通道区分文案', () => {
  i18n.setPref('en');
  const codex = localizeConnectorError('ChatGPT 登录已失效，请重新连接。（authentication; account/read）', 'chatgpt');
  assert.equal(codex, 'ChatGPT sign-in has expired — please reconnect. (authentication; account/read)');
  const grok = localizeConnectorError('Grok 登录已失效，请重新连接。（authentication）', 'grok');
  assert.match(grok, /^Grok sign-in has expired/);
  const agy = localizeConnectorError('Google 登录已失效，请在终端运行 agy 重新登录。（authentication）', 'antigravity');
  assert.match(agy, /run agy/);
  assert.match(localizeConnectorError('Codex 请求失败，请根据错误代码检查服务或连接器。（request_failed; turn/start; RPC -32000）', 'chatgpt'), /^Codex request failed/);
  for (const text of [codex, grok, agy]) assert.doesNotMatch(text, CJK);
  i18n.setPref('zh');
});

test('未分类或未知类别原样返回', () => {
  i18n.setPref('en');
  assert.equal(localizeConnectorError('请先连接 ChatGPT 订阅。', 'chatgpt'), '请先连接 ChatGPT 订阅。');
  assert.equal(localizeConnectorError('提示（no_such_category）', 'grok'), '提示（no_such_category）');
  assert.equal(localizeConnectorError(null, 'grok'), null);
  i18n.setPref('zh');
});

test('连接器源码中的每个错误类别都有双语典键，且中文档与连接器原文一致', () => {
  i18n.setPref('zh');
  for (const [file, kind] of [['codex.mjs', 'chatgpt'], ['grok.mjs', 'grok'], ['antigravity.mjs', 'antigravity']]) {
    const source = readFileSync(new URL(`../../roamcat-0.0.1/connector/${file}`, import.meta.url), 'utf8');
    const pairs = [...source.matchAll(/category = '([a-z_]+)', message = '([^']+)'|category = '([a-z_]+)'; message = '([^']+)'/g)]
      .map(m => [m[1] || m[3], m[2] || m[4]]);
    assert.ok(pairs.length > 0, file);
    for (const [category, message] of pairs) {
      const key = [`conn.err.${category}.${kind}`, `conn.err.${category}`].find(k => i18n.dicts.zh[k] && i18n.dicts.en[k]);
      assert.ok(key, `${file}: ${category}`);
      assert.equal(localizeConnectorError(`${message}（${category}）`, kind), `${message}（${category}）`, `${file}: ${category}`);
    }
  }
});
