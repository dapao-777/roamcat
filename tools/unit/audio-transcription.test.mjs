/**
 * @file tools/unit/audio-transcription.test.mjs
 * 文件职责：音频信任边界、字幕时间戳与安装副本的回归验证。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAudio, normalizeTranscription, AUDIO_MAX_BYTES} from '../../roamcat-0.0.1/extension/audio-transcription.mjs';
const audio = {mimeType: 'audio/wav', duration: 5, base64: Buffer.from('RIFFxxxxWAVEdataxxxx').toString('base64')};
test('音频只接受有界、带音频容器头的 base64', () => {
  assert.deepEqual(normalizeAudio(audio), audio);
  for (const patch of [{mimeType:'text/plain'}, {duration:Infinity}, {duration:26}, {duration:0}, {base64:'file:///secret'}, {base64:'a'.repeat(Math.ceil(AUDIO_MAX_BYTES/3)*4+4)}, {base64:Buffer.from('execute code now').toString('base64')}]) assert.throws(() => normalizeAudio({...audio,...patch}));
});
test('听写允许静音，拒绝倒序、重叠、越界与过长文本', () => {
  const segment = {start:0.1,end:2,text:'Hello',translation:'你好'};
  assert.deepEqual(normalizeTranscription({segments:[]}, 5), {segments:[]});
  assert.equal(normalizeTranscription({segments:[segment]}, 5).segments[0].text, 'Hello');
  for (const segments of [[{...segment,end:8}], [{...segment,start:5.1,end:5.4}], [segment,segment], [{...segment,start:-1}], [{...segment,text:'x'.repeat(1601)}], [{...segment,translation:''}]]) assert.throws(() => normalizeTranscription({segments},5));
});
