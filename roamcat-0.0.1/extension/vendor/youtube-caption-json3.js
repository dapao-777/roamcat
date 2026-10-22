/*
 * JSON3 event parsing adapted from youtube-caption-extractor 1.10.2:
 * https://github.com/devhims/youtube-caption-extractor/blob/f1ee7c25ae84fb9fcdd9c7b0b9dfb90d8ce626b6/src/index.ts#L260-L325
 * Copyright (c) 2024 Himanshu Gupta. MIT License; see
 * LICENSE.youtube-caption-extractor.txt in this directory.
 */
(() => {
  'use strict';

  if (globalThis.RoamCatYoutubeCaptionParser) return;

  let decoder = null;
  function decode(raw) {
    decoder ||= document.createElement('textarea');
    decoder.innerHTML = raw.replace(/<[^>]*>/g, '');
    return decoder.value;
  }

  function textFromSegments(segments) {
    const raw = segments.map(segment => typeof segment?.utf8 === 'string' ? segment.utf8 : '').join('');
    if (!raw) return '';
    return decode(raw).trim();
  }

  // RoamCat addition: auto-generated (ASR) captions carry a per-word offset (tOffsetMs) on each segment.
  // Keep those as word timings so the subtitle UI can highlight the word being spoken; manual captions
  // (one segment per event, no offsets) return null and the UI estimates timing instead.
  function wordsFromSegments(segments, startMs) {
    if (segments.length < 2 || !segments.some(segment => Number.isFinite(segment?.tOffsetMs))) return null;
    const words = [];
    for (const segment of segments) {
      if (typeof segment?.utf8 !== 'string') continue;
      const text = decode(segment.utf8).trim();
      if (!text) continue;
      const offset = Number.isFinite(segment.tOffsetMs) ? Math.max(0, segment.tOffsetMs) : 0;
      for (const part of text.split(/\s+/)) words.push({text: part, start: (startMs + offset) / 1000});
    }
    return words.length ? words : null;
  }

  function parseJson3(input) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data || !Array.isArray(data.events)) return [];

    const cues = [];
    for (const event of data.events) {
      if (!Array.isArray(event?.segs) || event.aAppend === 1) continue;
      const text = textFromSegments(event.segs);
      if (!text) continue;
      const startMs = Number.isFinite(event.tStartMs) ? Math.max(0, event.tStartMs) : 0;
      const durationMs = Number.isFinite(event.dDurationMs) ? Math.max(0, event.dDurationMs) : 0;
      const words = wordsFromSegments(event.segs, startMs);
      cues.push({
        startTime: startMs / 1000,
        endTime: (startMs + durationMs) / 1000,
        text,
        ...(words ? {words} : {}),
      });
    }
    return cues;
  }

  globalThis.RoamCatYoutubeCaptionParser = Object.freeze({parseJson3});
})();
