/** @file 长难句本地分析：英文句子切分 + 复杂度评分；content.js 纯逻辑模块。 */
(() => {
  'use strict';
  const SUBORDINATE_RE = /\b(that|which|who|whom|whose|where|when|although|though|because|since|if|unless|until|whereas|while|whether|despite|notwithstanding|provided|assuming|whereby|wherein|insofar|albeit)\b/giu;
  const DASH_RE = /[\u2014\u2013]|\s--\s/gu;
  const WORD_RE = /[A-Za-z][A-Za-z'-]*/gu;
  const TERMINAL_RE = /[.!?]+(?:['\u2019"\u201d)\]]+)?\s+(?=[A-Z0-9'"(\[\u201c])|\n{2,}|$/g;
  const COMPLEX_WORD_COUNT = 22, LONG_WORD_COUNT = 34, MAX_SCORE_WORDS = 60;
  // Splits English text into sentence spans with offsets; paragraph breaks force a boundary.
  function sentences(text) {
    if (typeof text !== 'string' || !text) return [];
    const spans = [];
    let start = 0;
    TERMINAL_RE.lastIndex = 0;
    let match;
    while ((match = TERMINAL_RE.exec(text))) {
      const end = match.index + match[0].length;
      if (end > start && /\S/.test(text.slice(start, end))) spans.push({start, end});
      start = end;
      if (start >= text.length) break;
      TERMINAL_RE.lastIndex = start;
    }
    if (start < text.length && /\S/.test(text.slice(start))) spans.push({start, end: text.length});
    return spans;
  }
  // Score one sentence: subordinate clauses, parentheticals and word count drive the mark.
  function scoreSentence(sentence) {
    if (typeof sentence !== 'string') return {score: 0, wordCount: 0, subordinateCount: 0, isComplex: false};
    const words = sentence.match(WORD_RE) || [];
    const wordCount = words.length;
    SUBORDINATE_RE.lastIndex = 0;
    const subordinateCount = (sentence.match(SUBORDINATE_RE) || []).length;
    const punctuationCount = (sentence.match(/[,;:]/gu) || []).length;
    const parenthetical = (sentence.match(/\([^)]{2,}\)|\u2014[^-\u2014]{2,}\u2014|\s--\s.{2,}?\s--\s/gu) || []).length;
    const score = Math.min(wordCount, MAX_SCORE_WORDS) + subordinateCount * 6 + punctuationCount * 1.5 + parenthetical * 4;
    const isComplex = wordCount >= LONG_WORD_COUNT || (wordCount >= COMPLEX_WORD_COUNT && (subordinateCount >= 1 || punctuationCount >= 3 || parenthetical >= 1));
    return {score, wordCount, subordinateCount, punctuationCount, parenthetical, isComplex};
  }
  // Returns sentence spans marked complex with their scores, sorted by position.
  function complexRanges(text) {
    return sentences(text).flatMap(({start, end}) => {
      const analysis = scoreSentence(text.slice(start, end));
      return analysis.isComplex ? [{start, end, wordCount: analysis.wordCount, subordinateCount: analysis.subordinateCount}] : [];
    });
  }
  globalThis.RoamCatComplexity = {sentences, scoreSentence, complexRanges, COMPLEX_WORD_COUNT};
})();

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
