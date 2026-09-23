/**
 * @file tools/unit/assistance-stream.test.mjs
 * 文件职责：流式译文进度。本页批次带封闭上下文，完整 JSON 不能走选段的 1–4 项校验。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTranslationProgress, translationProgress} from '../../roamcat-0.2.0/extension/assistance-stream.mjs';

const pageItems = [
  {id: 'one', text: 'The database uses an index.', context: {title: '', heading: '', before: '', after: ''}},
  {id: 'two', text: 'A cache reduces latency.', context: {title: '', heading: '', before: '', after: ''}},
];

test('本页翻译流式进度在句子写完时先交出，完整 JSON 也保留上下文条目', () => {
  const partial = translationProgress('{"items":[{"id":"one","translation":"数据库使用索引。"},{"id":"two","translation":"缓', pageItems);
  assert.equal(partial.items[0].id, 'one');
  assert.equal(partial.items[0].translation, '数据库使用索引。');
  assert.equal(partial.items[1].translation, '缓');
  const done = translationProgress('{"items":[{"id":"one","translation":"数据库使用索引。"},{"id":"two","translation":"缓存降低延迟。"}]}', pageItems);
  assert.deepEqual(done.items.map(item => item.translation), ['数据库使用索引。', '缓存降低延迟。']);
});

test('选段翻译的完整进度仍走 1–4 项协议', () => {
  const passage = [{id: 'one', text: 'Hello there friend.'}];
  const done = translationProgress('{"items":[{"id":"one","translation":"你好。"}]}', passage);
  assert.equal(done.items[0].translation, '你好。');
});

test('进度快照最多 8 项', () => {
  const eight = Array.from({length: 8}, (_, index) => ({id: `i${index}`, text: 'x', context: {title: '', heading: '', before: '', after: ''}}));
  assert.equal(normalizeTranslationProgress({items: [{id: 'i0', translation: '好。'}]}, eight).items.length, 1);
  const nine = Array.from({length: 9}, (_, index) => ({id: `i${index}`, text: 'x', context: {title: '', heading: '', before: '', after: ''}}));
  assert.equal(normalizeTranslationProgress({items: [{id: 'i0', translation: '好。'}]}, nine), null);
});
