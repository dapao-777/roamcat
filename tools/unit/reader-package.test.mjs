/**
 * @file tools/unit/reader-package.test.mjs
 * 文件职责：阅读器解包层的单元测试——epub-package.mjs 的 ZIP/OPF/XHTML 链路
 *   与 pdf-blocks.mjs 的文本行重组、翻译批次契约。
 * 主要内容：合成最小 EPUB（fflate zipSync）断言 title/creator/chapters/blocks
 *   与实体解码、标题角色；合成 pdfjs textContent items 断言行聚类与段落切分；
 *   translationBatches 满足 normalizeEmergencyItems 契约（1–4 项、≤12000 字符）。
 * 模块边界：node:test，纯 ESM；不启动浏览器、不加载 pdfjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, strToU8} from 'fflate';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const {parseEpub, blocksFromXhtml, decodeEntities} = await import(pathToFileURL(path.join(repoRoot, 'src/pages/reader/epub-package.mjs')).href);
const {blocksFromTextItems, translationBatches} = await import(pathToFileURL(path.join(repoRoot, 'src/pages/reader/pdf-blocks.mjs')).href);

function epubBytes(overrides = {}) {
  const files = {
    'META-INF/container.xml': `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
    'OEBPS/content.opf': `<?xml version="1.0"?><package><metadata><dc:title>Test Book</dc:title><dc:creator>A Writer</dc:creator></metadata><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
    'OEBPS/ch1.xhtml': `<html><body><h1>Chapter One</h1><p>The cat sat on the mat &amp; slept.</p><p>Second paragraph here.</p></body></html>`,
    'OEBPS/ch2.xhtml': `<html><body><h1>Chapter Two</h1><p>Another line of text.</p><script>evil()</script><p>After script.</p></body></html>`,
    ...overrides
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, typeof content === 'string' ? strToU8(content) : content])));
}

test('decodeEntities() 解码命名与数字实体', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &#65; &#x42;'), 'a & b <c> A B');
});

test('blocksFromXhtml() 切分块级元素并剔除 script/style', () => {
  const blocks = blocksFromXhtml('<body><h2>Title</h2><p>One <b>two</b> three.</p><script>bad()</script><p>Four.</p></body>');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].role, 'h2');
  assert.equal(blocks[0].text, 'Title');
  assert.equal(blocks[1].text, 'One two three.');
  assert.ok(!blocks.some(block => block.text.includes('bad(')));
});

test('parseEpub() 走 container→OPF→spine 链路产出章节块', () => {
  const book = parseEpub(epubBytes());
  assert.equal(book.title, 'Test Book');
  assert.equal(book.creator, 'A Writer');
  assert.equal(book.chapters.length, 2);
  assert.equal(book.chapters[0].label, 'Chapter One');
  const firstTexts = book.chapters[0].blocks.map(block => block.text);
  assert.ok(firstTexts.includes('The cat sat on the mat & slept.'));
  assert.ok(book.chapters[1].blocks.some(block => block.text === 'After script.'));
});

test('parseEpub() 拒绝非 EPUB 数据', () => {
  assert.throws(() => parseEpub(strToU8('not a zip')));
  assert.throws(() => parseEpub(zipSync({'x.txt': strToU8('hi')})));
});

test('EPUB 忽略图片/字体的解压体积，只限制被读取的正文条目',()=>{
  const image=new Uint8Array(2*1024*1024);
  const book=parseEpub(epubBytes({'OEBPS/unused.png':image}),{maxEntryBytes:2048,maxTextBytes:4096});
  assert.equal(book.chapters.length,2);
  assert.throws(()=>parseEpub(epubBytes({'OEBPS/ch1.xhtml':'<body><p>'+'large '.repeat(1000)+'</p></body>'}),{maxEntryBytes:2048}),/解压后过大/);
  assert.throws(()=>parseEpub(epubBytes(),{maxTextBytes:500}),/解压后过大/);
});

test('blocksFromTextItems() 按基线聚行、按行距切块', () => {
  const item = (str, x, y, hasEOL = false) => ({str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10, hasEOL});
  const items = [
    item('First line wraps', 50, 700), item(' onto next.', 50, 686, true),
    item('Second paragraph.', 50, 660, true)
  ];
  const blocks = blocksFromTextItems(items, 1);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, 'First line wraps onto next.');
  assert.equal(blocks[1].text, 'Second paragraph.');
  assert.equal(blocks[0].page, 1);
});

test('blocksFromTextItems() 保留 pdfjs 拆出的空格项，hasEOL 行尾不切段', () => {
  // 仿 bitcoin.pdf：每行都带 hasEOL、行距 11.5 > 字高 9.3×1.45×0.8；句间空格是独立的 " " 项。
  const item = (str, x, y, width, hasEOL = false, height = 9.3) => ({str, transform: [height, 0, 0, height, x, y], width, height: str.trim() ? height : 0, hasEOL});
  const items = [
    item('Abstract.', 146, 579, 37), item(' ', 183, 579, 8), item('A purely peer-to-peer version of electronic cash would', 191, 579, 270, true),
    item('allow payments to be sent directly from one party to another', 146, 567.5, 315, true),
    item('without a bank.', 146, 556, 70, true),
    item('Next paragraph starts at the same line spacing and runs on', 146, 544.5, 315, true),
    item('to the right margin.', 146, 533, 90, true),
    item('Introduction', 108, 500, 77, true, 11.5),
    item('Commerce', 108, 486, 50), item('relies', 170, 486, 30, true)
  ];
  const blocks = blocksFromTextItems(items, 1);
  assert.deepEqual(blocks.map(block => block.role), ['p', 'p', 'h3', 'p']);
  assert.equal(blocks[0].text, 'Abstract. A purely peer-to-peer version of electronic cash would allow payments to be sent directly from one party to another without a bank.');
  assert.equal(blocks[1].text, 'Next paragraph starts at the same line spacing and runs on to the right margin.');
  // 没有空格项但水平间距明显时补空格。
  assert.equal(blocks[3].text, 'Commerce relies');
});

test('translationBatches() 满足后台 1–4 项/≤12000 字符契约', () => {
  const blocks = Array.from({length: 10}, (_, i) => ({id: 'b' + i, role: 'p', text: 'Sentence number ' + i + ' with some words.'}));
  const batches = translationBatches(blocks);
  assert.ok(batches.length >= 3);
  for (const batch of batches) {
    assert.ok(batch.length >= 1 && batch.length <= 4);
    assert.ok(batch.reduce((sum, item) => sum + item.text.length, 0) <= 12000);
    for (const item of batch) assert.deepEqual(Object.keys(item).sort(), ['id', 'text']);
  }
  const oversized = translationBatches([{id: 'b0', role: 'p', text: 'x'.repeat(5000)}]);
  assert.equal(oversized.length, 0, '超过 4000 字符的块应被跳过');
  // 图注、公式碎片、源码不送翻；单词标题照常翻译。
  const mixed = translationBatches([
    {id: 'a', role: 'p', text: 'Tx Tx ... Tx Tx ...'},
    {id: 'b', role: 'p', text: '1 if p≤q q ='},
    {id: 'c', role: 'p', text: '#include <math.h> double f(double q) { double p = 1.0 - q; return p; }'},
    {id: 'd', role: 'h3', text: '5. Network'},
    {id: 'e', role: 'p', text: 'The proof-of-work also solves the problem.'}
  ]);
  assert.deepEqual(mixed.flat().map(item => item.id), ['d', 'e']);
});
