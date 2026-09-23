/*
 * JSON3 event parsing adapted from youtube-caption-extractor 1.10.2:
 * https://github.com/devhims/youtube-caption-extractor/blob/f1ee7c25ae84fb9fcdd9c7b0b9dfb90d8ce626b6/src/index.ts#L260-L325
 * Copyright (c) 2024 Himanshu Gupta. MIT License; see
 * LICENSE.youtube-caption-extractor.txt in this directory.
 */
(() => {
  'use strict';

  if (globalThis.RoamCatYoutubeCaptionParser) return;

  function textFromSegments(segments) {
    const raw = segments.map(segment => typeof segment?.utf8 === 'string' ? segment.utf8 : '').join('');
    if (!raw) return '';
    const decoder = document.createElement('textarea');
    decoder.innerHTML = raw.replace(/<[^>]*>/g, '');
    return decoder.value.trim();
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
      cues.push({
        startTime: startMs / 1000,
        endTime: (startMs + durationMs) / 1000,
        text,
      });
    }
    return cues;
  }

  globalThis.RoamCatYoutubeCaptionParser = Object.freeze({parseJson3});
})();
