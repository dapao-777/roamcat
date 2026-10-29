/**
 * @file audio-transcription.mjs
 * 文件职责：订阅音频听写的大小、格式与字幕时间戳契约；扩展和连接器共用的纯函数。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export const AUDIO_MAX_BYTES = 512 * 1024;
export function normalizeAudio(value) {
  const {base64, mimeType, duration} = value || {};
  if (!['audio/webm', 'audio/wav'].includes(mimeType)
    || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0.5 || duration > 25
    || typeof base64 !== 'string' || base64.length < 16 || base64.length > Math.ceil(AUDIO_MAX_BYTES / 3) * 4
    || base64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Invalid audio clip / 音频片段无效');
  // 只接受已知容器，禁止把任意文本文件交给 CLI 的文件工具。
  const header = atob(base64.slice(0, 16));
  if (mimeType === 'audio/webm' ? !header.startsWith('\x1a\x45\xdf\xa3') : !(header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE')) throw new Error('Invalid audio container / 音频格式无效');
  return {base64, mimeType, duration};
}
export const TRANSCRIPTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['segments'], properties: {
    segments: {type: 'array', maxItems: 80, items: {type: 'object', additionalProperties: false,
      required: ['start', 'end', 'text', 'translation'], properties: {
        start: {type: 'number'}, end: {type: 'number'}, text: {type: 'string'}, translation: {type: 'string'},
      }}},
  },
};
export function normalizeTranscription(value, duration) {
  if (!Array.isArray(value?.segments) || value.segments.length > 80) throw new Error('Invalid transcription / 听写结果无效');
  let previous = 0;
  return {segments: value.segments.map(item => {
    const {start, end, text, translation} = item || {};
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < previous || start < 0 || start >= duration || end <= start || end > duration + 0.5
      || typeof text !== 'string' || !text.trim() || text.length > 1600
      || typeof translation !== 'string' || !translation.trim() || translation.length > 1600) throw new Error('Invalid transcription timestamps / 听写时间戳无效');
    previous = end;
    return {start, end: Math.min(end, duration), text: text.trim(), translation: translation.trim()};
  })};
}
