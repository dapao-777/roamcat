/** @file PDF 文本块重组：pdfjs getTextContent 的散行 → 阅读块；纯函数供阅读器与单测共用。 */

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li']);

// pdfjs text item: {str, transform:[a,b,c,d,e,f], width, height, hasEOL}
// transform[5] 是基线 y、transform[4] 是 x；同基线聚为行，行距突增或短行收句切成段落。
// pdfjs 把词间空格常拆成独立的 " " 项，必须保留；没有空格项时按水平间距补空格。
function linesFromItems(items) {
  const rows = new Map();
  for (const item of items || []) {
    if (!item || typeof item.str !== 'string' || !item.str) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
    const x = item.transform?.[4] ?? 0;
    const height = item.height || Math.abs(item.transform?.[3] ?? 0) || 0;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({x, right: x + (item.width || 0), str: item.str, height});
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => {
      cells.sort((a, b) => a.x - b.x);
      const height = Math.max(...cells.map(cell => cell.height)) || 10;
      let text = '', right = null;
      for (const cell of cells) {
        if (right !== null && cell.x - right > height * 0.2 && !/\s$/u.test(text) && !/^\s/u.test(cell.str)) text += ' ';
        text += cell.str;
        right = Math.max(right ?? cell.right, cell.right);
      }
      const inked = cells.filter(cell => cell.str.trim());
      return {y, text, height, left: inked[0]?.x ?? 0, right: Math.max(...inked.map(cell => cell.right), 0)};
    })
    .filter(line => line.text.trim());
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// 段落切分阈值：有足够行时取“常规行距”（相邻行 y 差的中位数）的 1.3 倍，行太少时退回中位字高的 1.45 倍。
function gapThreshold(lines) {
  const gaps = lines.slice(1).map((line, index) => lines[index].y - line.y).filter(gap => gap > 0);
  if (gaps.length >= 3) return median(gaps) * 1.3;
  return (median(lines.map(line => line.height)) || 10) * 1.45;
}

export function blocksFromTextItems(items, page = 0) {
  const lines = linesFromItems(items);
  if (!lines.length) return [];
  const blocks = [];
  let current = null;
  let prev = null;
  const threshold = gapThreshold(lines);
  const textRight = Math.max(...lines.map(line => line.right));
  const body = median(lines.map(line => line.height)) || 10;
  for (const line of lines) {
    const gap = prev ? prev.y - line.y : 0;
    // 上一行明显没写到右边距、又以句末标点收尾：段落已在那里结束（行距不变的排版也能切开）。
    const closed = prev && textRight - prev.right > (textRight - prev.left) * 0.15 && /[.!?:。！？：]["”’)]?$/u.test(prev.text.trim());
    const newBlock = !current || gap > threshold || closed || Math.abs(line.height - prev.height) > 2;
    if (newBlock) {
      current = {page, role: roleFor(line, body), parts: [line.text.trim()]};
      blocks.push(current);
    } else {
      current.parts.push(line.text.trim());
    }
    prev = line;
  }
  return blocks.map(({parts, ...rest}) => ({...rest, text: joinLines(parts)})).filter(block => block.text.length >= 2);
}

function joinLines(parts) {
  return parts.join(' ').replace(/\s{2,}/gu, ' ').replace(/-\s([a-z])/gu, '-$1').trim();
}

// 标题按相对正文字号判定：论文标题常只比正文大 30–40%，绝对磅值阈值会漏掉。
function roleFor(line, body) {
  if (line.height >= body * 1.3) return 'h2';
  if (line.height >= body * 1.1) return 'h3';
  return 'p';
}

// 值得送翻的正文：至少两个不同的实词（3 个字母以上；标题一个即可），且不是代码——PDF 里的图注（“Tx Tx ...”）、
// 公式碎片和源码常被模型漏掉或原样吐回，混进批次会让整批因条目数不符被拒。
export function isProse(text, role = 'p') {
  const words = new Set((text.match(/[A-Za-z]{3,}/gu) || []).map(word => word.toLowerCase()));
  if (words.size < (/^h\d$/u.test(role) ? 1 : 2)) return false;
  const symbols = (text.match(/[{};=<>#]/gu) || []).length;
  return symbols / text.length < 0.04;
}

// 优先在后半段的句末/空白处切分；没有边界的长词也不拆开 UTF-16 代理对。
function splitTranslationText(text, maxChars) {
  const parts = [];
  let start = 0;
  while (text.length - start > maxChars) {
    let end = start + maxChars;
    if (/[\uD800-\uDBFF]/u.test(text[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[end])) end--;
    const slice = text.slice(start, end);
    const floor = Math.floor(maxChars / 2);
    const sentences = [...slice.matchAll(/[.!?。！？]["'”’)]*\s+/gu)];
    const sentence = sentences.at(-1);
    if (sentence && sentence.index + sentence[0].length >= floor) end = start + sentence.index + sentence[0].length;
    else {
      const spaces = [...slice.matchAll(/\s+/gu)];
      const space = spaces.at(-1);
      if (space && space.index + space[0].length >= floor) end = start + space.index + space[0].length;
    }
    parts.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

// 内部批次附带 blockId/part/parts 以便合并原段落；发送后台时只取 id/text。
// 协议仍为 1–4 项、总字数 ≤12000、单项 ≤4000，正文资格按原块判定，不能再过滤末尾短片。
export function translationBatches(blocks, maxChars = 4000) {
  if (!Number.isInteger(maxChars) || maxChars < 2 || maxChars > 4000) throw new RangeError('Translation chunk size must be between 2 and 4000.');
  const pending = blocks
    .filter(block => typeof block.text === 'string' && block.text.trim() && BLOCK_TAGS.has(block.role || 'p') && isProse(block.text, block.role))
    .flatMap(block => {
      const texts = splitTranslationText(block.text, maxChars);
      return texts.map((text, part) => ({id: texts.length === 1 ? block.id : `${block.id}_part${part + 1}`, text, blockId: block.id, part, parts: texts.length}));
    });
  const batches = [];
  let batch = [], total = 0;
  for (const block of pending) {
    if (batch.length >= 4 || total + block.text.length > 12000) {
      batches.push(batch);
      batch = [];
      total = 0;
    }
    batch.push(block);
    total += block.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
