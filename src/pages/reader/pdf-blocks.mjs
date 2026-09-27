/** @file PDF 文本块重组：pdfjs getTextContent 的散行 → 阅读块；纯函数供阅读器与单测共用。 */

const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li']);

// pdfjs text item: {str, transform:[a,b,c,d,e,f], width, height, hasEOL}
// transform[5] 是基线 y、transform[4] 是 x；同基线聚为行，行距突增切成段落。
function linesFromItems(items) {
  const rows = new Map();
  for (const item of items || []) {
    if (!item || typeof item.str !== 'string' || !item.str.trim()) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
    const x = item.transform?.[4] ?? 0;
    const height = item.height || Math.abs(item.transform?.[3] ?? 0) || 10;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({x, str: item.str, height, eol: item.hasEOL === true});
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, cells]) => {
      cells.sort((a, b) => a.x - b.x);
      return {y, text: cells.map(cell => cell.str).join(''), height: Math.max(...cells.map(cell => cell.height)), eol: cells.at(-1)?.eol === true};
    })
    .filter(line => line.text.trim());
}

// 判定一行的“行距突增”：相邻两行的 y 差超过中位行高的 1.45 倍视为新块。
function gapThreshold(lines) {
  const heights = lines.map(line => line.height).sort((a, b) => a - b);
  return (heights[Math.floor(heights.length / 2)] || 10) * 1.45;
}

export function blocksFromTextItems(items, page = 0) {
  const lines = linesFromItems(items);
  if (!lines.length) return [];
  const blocks = [];
  let current = null;
  let prevY = null;
  const threshold = gapThreshold(lines);
  for (const line of lines) {
    const gap = prevY === null ? 0 : prevY - line.y;
    const newBlock = !current || gap > threshold || (current.eol && gap > threshold * 0.8);
    if (newBlock) {
      current = {page, role: roleFor(line), parts: [line.text.trim()], eol: line.eol};
      blocks.push(current);
    } else {
      current.parts.push(line.text.trim());
      current.eol = line.eol;
    }
    prevY = line.y;
  }
  return blocks.map(({parts, ...rest}) => ({...rest, text: joinLines(parts)})).filter(block => block.text.length >= 2);
}

function joinLines(parts) {
  return parts.join(' ').replace(/\s{2,}/gu, ' ').replace(/-\s([a-z])/gu, '-$1').trim();
}

function roleFor(line) {
  if (line.height >= 20) return 'h2';
  if (line.height >= 15) return 'h3';
  return 'p';
}

// 翻译批次契约与 normalizeEmergencyItems 一致：1–4 项、总字数 ≤12000、单项 ≤4000。
export function translationBatches(blocks, maxChars = 4000) {
  const pending = blocks.filter(block => typeof block.text === 'string' && block.text.trim() && block.text.length <= maxChars && BLOCK_TAGS.has(block.role || 'p'));
  const batches = [];
  let batch = [], total = 0;
  for (const block of pending) {
    if (batch.length >= 4 || total + block.text.length > 12000) {
      batches.push(batch);
      batch = [];
      total = 0;
    }
    batch.push({id: block.id, text: block.text});
    total += block.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
