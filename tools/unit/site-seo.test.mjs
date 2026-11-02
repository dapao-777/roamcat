/**
 * @file tools/unit/site-seo.test.mjs
 * 文件职责：落地页 SEO / GEO 门禁——head 元数据、JSON-LD 图谱、sitemap / robots / llms 文件、图片尺寸，
 *   以及「每次发版要一起改的版本与日期」必须自洽，防止收录相关的元数据悄悄漂移。
 * 主要内容：canonical / hreflang / OG 一致性与 OG 图实际尺寸；JSON-LD 解析、@id 引用闭合、FAQPage 与页面 FAQ
 *   逐题逐字一致；版本与日期（package.json / CHANGELOG / dateModified / sitemap lastmod / 页脚）；
 *   服务商名单对照 API_PROVIDERS；llms.txt 链接可达；llms-full.txt 的版本与数字；img 的 alt / width / height；
 *   CSP 友好（无外链脚本、无内联事件）；落地页调色板与 theme-color 对照 tokens.css（页面不能 import tokens，只能抄值）。
 * 模块边界：node:test，只读文件，不启动浏览器；数字类事实（服务商数、消息数、Node、Chrome 版本）
 *   归 docs-facts.test.mjs，这里只补它没覆盖的 llms-full.txt。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';
import {extractTokenSections} from '../../build/gen-design-tokens.mjs';

const root =path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docs = path.join(root, 'docs');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const ORIGIN = 'https://roamcat-dev.github.io/roamcat/';
const REPO_BLOB = 'https://github.com/roamcat-dev/roamcat/blob/main/';
const HREFLANG = {en: ORIGIN, 'zh-CN': `${ORIGIN}zh.html`, 'x-default': ORIGIN};

const PAGES = [
  {file: 'docs/index.html', lang: 'en', locale: 'en_US', url: ORIGIN, updated: 'Last updated', latest: 'Latest version'},
  {file: 'docs/zh.html', lang: 'zh-CN', locale: 'zh_CN', url: `${ORIGIN}zh.html`, updated: '最近更新', latest: '最新版本'},
];

const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const stripTags = html => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1].toLowerCase(), decode(match[2])]));
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
const metaContent = (html, key) => tagsOf(html, 'meta').find(tag => tag.name === key || tag.property === key)?.content;

/** 站内绝对地址 → docs 里的文件；站外地址返回 null。 */
function localFile(url) {
  return url.startsWith(ORIGIN) ? path.join(docs, url.slice(ORIGIN.length) || 'index.html') : null;
}
/** 页面里的 href / src（相对或站内绝对）→ docs 里的文件。 */
const resolveAsset = ref => (/^https?:/.test(ref) ? localFile(ref) : path.join(docs, ref));

function pngSize(file) {
  const buffer = readFileSync(file);
  assert.equal(buffer.toString('latin1', 1, 4), 'PNG', `${file} 不是 PNG`);
  return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)};
}

function graphOf(html, file) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(match => JSON.parse(match[1]));
  assert.equal(blocks.length, 1, `${file} 应只有一个 JSON-LD 块（单个 @graph）`);
  assert.ok(Array.isArray(blocks[0]['@graph']), `${file} 的 JSON-LD 应使用 @graph`);
  return blocks[0]['@graph'];
}
const nodeOf = (graph, type) => graph.find(node => [].concat(node['@type']).includes(type));

/** package.json 版本 + CHANGELOG 里该版本的发布日期；两者对不上说明发版文档没写完。 */
function release() {
  const {version} = JSON.parse(read('package.json'));
  const entry = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/m);
  assert.ok(entry, 'CHANGELOG.md 里没有带日期的版本条目');
  assert.equal(entry[1], version, `CHANGELOG 最新条目是 ${entry[1]}，package.json 是 ${version}`);
  return {version, date: entry[2]};
}

for (const page of PAGES) {
  test(`${page.file}：标题、描述、canonical、hreflang 与社交卡片元数据自洽`, () => {
    const html = read(page.file);
    assert.ok(html.includes(`<html lang="${page.lang}">`), `${page.file} 的 <html lang> 应为 ${page.lang}`);
    const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]);
    assert.ok(title.length >= 20 && title.length <= 70, `标题长度 ${title.length}：${title}`);
    const description = metaContent(html, 'description');
    assert.ok(description.length >= 70 && description.length <= 170, `description 长度 ${description.length}`);
    assert.match(metaContent(html, 'robots'), /index,\s*follow/);

    const links = tagsOf(html, 'link');
    assert.equal(links.find(link => link.rel === 'canonical')?.href, page.url, 'canonical 应指向本页');
    const alternates = Object.fromEntries(links.filter(link => link.rel === 'alternate' && link.hreflang).map(link => [link.hreflang, link.href]));
    assert.deepEqual(alternates, HREFLANG, 'hreflang 三条（en / zh-CN / x-default）两页必须一致');
    assert.equal(metaContent(html, 'og:url'), page.url);
    assert.equal(metaContent(html, 'og:locale'), page.locale);
    assert.equal(metaContent(html, 'og:title'), title);
    assert.ok(metaContent(html, 'og:description'), '缺 og:description');
    assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image');

    const image = metaContent(html, 'og:image');
    assert.equal(metaContent(html, 'twitter:image'), image, 'twitter:image 应与 og:image 相同');
    assert.ok(metaContent(html, 'og:image:alt') && metaContent(html, 'twitter:image:alt'), '社交卡片图要有 alt');
    const imageFile = localFile(image);
    assert.ok(imageFile && existsSync(imageFile), `og:image 应指向 docs 里存在的文件：${image}`);
    const size = pngSize(imageFile);
    assert.equal(Number(metaContent(html, 'og:image:width')), size.width, 'og:image:width 与文件实际宽度不符');
    assert.equal(Number(metaContent(html, 'og:image:height')), size.height, 'og:image:height 与文件实际高度不符');

    for (const link of links.filter(item => /icon|preload/.test(item.rel))) {
      const target = resolveAsset(link.href);
      assert.ok(target && existsSync(target), `${page.file}：<link rel="${link.rel}"> 指向的文件不存在：${link.href}`);
    }
    // CSP 是 script-src 'none' / 无外链资源：外链脚本、样式表和内联事件属性都会被拦，也不该出现
    assert.ok(!/<script\b[^>]*\bsrc=/i.test(html), `${page.file} 不应有外链脚本`);
    assert.ok(!/<link\b[^>]*rel="stylesheet"/i.test(html), `${page.file} 不应有外链样式表`);
    assert.ok(!/\son[a-z]+="/i.test(html), `${page.file} 不应有内联事件属性`);
  });

  test(`${page.file}：JSON-LD 图谱节点齐全、@id 引用闭合，并与 head 元数据一致`, () => {
    const html = read(page.file);
    const graph = graphOf(html, page.file);
    const ids = new Set();
    for (const node of graph) {
      if (!node['@id']) continue;
      assert.ok(!ids.has(node['@id']), `@id 重复：${node['@id']}`);
      ids.add(node['@id']);
    }
    const refs = [];
    JSON.stringify(graph, (key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && '@id' in value) refs.push(value['@id']);
      return value;
    });
    assert.ok(refs.length > 0, '图谱里应有节点间的 @id 引用');
    for (const ref of refs) assert.ok(ids.has(ref), `${page.file}：引用了图谱里不存在的 @id ${ref}`);
    for (const type of ['WebSite', 'WebPage', 'SoftwareApplication', 'SoftwareSourceCode', 'Person', 'FAQPage']) {
      assert.ok(nodeOf(graph, type), `${page.file} 的 JSON-LD 缺 ${type} 节点`);
    }
    // 没有真实评分与评价，标记里就不能出现——捏造的评分会被搜索引擎当作垃圾结构化数据
    assert.ok(!/aggregateRating|"review"/.test(JSON.stringify(graph)), '没有真实评分 / 评价数据，不要加 aggregateRating / review');

    const webPage = nodeOf(graph, 'WebPage');
    assert.equal(webPage.url, page.url);
    assert.equal(webPage.inLanguage, page.lang);
    assert.equal(webPage.name, decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]), 'WebPage.name 应等于 <title>');
    assert.equal(webPage.description, metaContent(html, 'description'), 'WebPage.description 应等于 meta description');

    const software = nodeOf(graph, 'SoftwareApplication');
    assert.equal(software.softwareVersion, release().version, 'softwareVersion 应等于 package.json 版本');
    assert.equal(software.dateModified, webPage.dateModified, 'SoftwareApplication 与 WebPage 的 dateModified 应一致');
    assert.equal(software.applicationCategory, 'BrowserApplication');
    assert.equal(software.isAccessibleForFree, true);
    assert.equal(software.offers.price, '0');
    assert.ok(software.featureList.length >= 8, 'featureList 至少 8 条');
    assert.ok(software.downloadUrl.startsWith('https://github.com/roamcat-dev/roamcat/releases'));
    for (const shot of software.screenshot) {
      const file = localFile(shot.url);
      assert.ok(file && existsSync(file), `screenshot 文件不存在：${shot.url}`);
      const size = pngSize(file);
      assert.deepEqual([shot.width, shot.height], [size.width, size.height], `screenshot 尺寸与文件不符：${shot.url}`);
    }
  });

  test(`${page.file}：FAQPage 与页面里的 FAQ 逐题逐字一致`, () => {
    const html = read(page.file);
    const faq = nodeOf(graphOf(html, page.file), 'FAQPage');
    const section = html.slice(html.indexOf('<section id="faq">'), html.indexOf('</section>', html.indexOf('<section id="faq">')));
    const visible = [...section.matchAll(/<details[^>]*><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map(match => ({name: stripTags(match[1]), text: stripTags(match[2])}));
    assert.ok(visible.length >= 12, `页面 FAQ 只有 ${visible.length} 题`);
    assert.deepEqual(
      faq.mainEntity.map(item => ({name: item.name, text: item.acceptedAnswer.text})),
      visible,
      'FAQPage 的问题与答案必须和页面可见的 FAQ 逐题逐字一致（搜索引擎要求标记内容在页面上可见）',
    );
  });

  test(`${page.file}：发版要一起改的版本与日期自洽（页面、JSON-LD、sitemap、页脚）`, () => {
    const html = read(page.file);
    const {version, date} = release();
    const modified = nodeOf(graphOf(html, page.file), 'WebPage').dateModified;
    assert.match(modified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(modified >= date, `dateModified ${modified} 早于 ${version} 的发布日期 ${date}`);
    const latest = html.match(new RegExp(`<dt>${page.latest}</dt><dd>[^<]*<time datetime="([^"]+)">`));
    assert.equal(latest?.[1], date, `「${page.latest}」行的日期应是 ${version} 的发布日期 ${date}`);
    const footer = html.match(new RegExp(`${page.updated} <time datetime="([^"]+)">[^<]*</time> · v(\\d+\\.\\d+\\.\\d+) · `));
    assert.ok(footer, `${page.file} 页脚应有「${page.updated} … · v版本 · 」`);
    assert.equal(footer[1], modified, '页脚日期应等于 dateModified');
    assert.equal(footer[2], version, '页脚版本应等于 package.json 版本');
    const sitemap = read('docs/sitemap.xml');
    const entry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].find(match => match[1].includes(`<loc>${page.url}</loc>`));
    assert.equal(entry?.[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1], modified, `sitemap 里 ${page.url} 的 lastmod 应等于 dateModified`);
  });
}

test('sitemap.xml：覆盖全部可索引页面、hreflang 与页面一致、不含 404', () => {
  const sitemap = read('docs/sitemap.xml');
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({
    loc: match[1].match(/<loc>([^<]+)<\/loc>/)[1],
    alternates: Object.fromEntries([...match[1].matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map(link => [link[1], link[2]])),
  }));
  assert.deepEqual(entries.map(entry => entry.loc), PAGES.map(page => page.url));
  for (const entry of entries) assert.deepEqual(entry.alternates, HREFLANG, `${entry.loc} 的 hreflang 与页面不一致`);
  const indexable = readdirSync(docs).filter(name => name.endsWith('.html') && name !== '404.html').sort();
  assert.deepEqual(indexable, PAGES.map(page => path.basename(page.file)).sort(), 'docs 里新增的 html 页面要登记进 sitemap（或改名为 404.html 之外的非索引页）');
  assert.ok(!sitemap.includes('404'), 'sitemap 不该收录 404 页');
});

test('404.html：noindex，且图片与站内链接可达', () => {
  const html = read('docs/404.html');
  assert.match(metaContent(html, 'robots'), /noindex/);
  for (const link of html.matchAll(/href="(https:\/\/roamcat-dev\.github\.io\/roamcat\/[^"]*)"/g)) {
    assert.ok(existsSync(localFile(link[1])), `404.html 链接的站内文件不存在：${link[1]}`);
  }
});

test('robots.txt：放行、声明 sitemap、不屏蔽任何路径', () => {
  const robots = read('docs/robots.txt');
  assert.match(robots, /^Sitemap: https:\/\/roamcat-dev\.github\.io\/roamcat\/sitemap\.xml$/m);
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(robots), 'robots.txt 不应屏蔽整站');
  const agents = [...robots.matchAll(/^User-agent:\s*(.+)$/gim)].map(match => match[1].trim());
  for (const agent of ['*', 'Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']) {
    assert.ok(agents.includes(agent), `robots.txt 应显式放行 ${agent}`);
  }
  assert.ok(existsSync(path.join(docs, '.nojekyll')), 'docs/.nojekyll 缺失会让 GitHub Pages 用 Jekyll 处理文件');
});

const markdownLinks = text => [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map(match => match[1]);

test('llms.txt：结构符合约定，站内与仓库链接都能落到真实文件', () => {
  const text = read('docs/llms.txt');
  assert.match(text, /^# RoamCat · 随心阅\n\n> /, 'llms.txt 应以 H1 + 引用块摘要开头');
  assert.ok(text.includes('\n## Optional\n'), 'llms.txt 应有 ## Optional 小节');
  const links = markdownLinks(text);
  assert.ok(links.includes(`${ORIGIN}llms-full.txt`), 'llms.txt 应指向 llms-full.txt');
  for (const url of links) {
    if (url.startsWith(REPO_BLOB)) assert.ok(existsSync(path.join(root, url.slice(REPO_BLOB.length))), `llms.txt 链接的仓库文件不存在：${url}`);
    else if (url.startsWith(ORIGIN)) assert.ok(existsSync(localFile(url)), `llms.txt 链接的站内文件不存在：${url}`);
  }
});

/** 英文 / 中文服务商名（api-providers.mjs 的 M() 按 RoamCatI18n.lang() 取名，加 query 让两种语言各导入一份）。 */
async function providerNames(lang) {
  globalThis.RoamCatI18n = {lang: () => lang};
  try {
    const url = pathToFileURL(path.join(root, 'roamcat-0.0.1', 'extension', 'api-providers.mjs')).href;
    return (await import(`${url}?lang=${lang}`)).API_PROVIDERS.map(provider => provider.name);
  } finally {
    delete globalThis.RoamCatI18n;
  }
}
const bareName = name => name.split(' · ')[0].replace(/^(?:Custom|自定义)\s+/i, '').trim().toLowerCase();

function expectNames(label, names, haystack) {
  const text = haystack.toLowerCase();
  const missing = names.filter(name => !text.includes(bareName(name)));
  assert.deepEqual(missing, [], `${label} 的服务商清单缺少：${missing.join('、')}（增删服务商后要同步清单）`);
}

test('落地页与 llms-full.txt 的服务商清单覆盖 API_PROVIDERS 的每一项', async () => {
  const english = await providerNames('en');
  const chinese = await providerNames('zh');
  const provList = file => stripTags(read(file).match(/<details class="prov">([\s\S]*?)<\/details>/)[1]);
  expectNames('docs/index.html', english, provList('docs/index.html'));
  expectNames('docs/zh.html', chinese, provList('docs/zh.html'));
  const full = read('docs/llms-full.txt');
  expectNames('docs/llms-full.txt', english, full.slice(full.indexOf('### Bring-your-own API'), full.indexOf('### Local models with Ollama')));
});

test('llms-full.txt：版本、日期与数字和代码一致', async () => {
  const {version, date} = release();
  const text = read('docs/llms-full.txt');
  assert.match(text, /^# RoamCat · 随心阅 — full reference\n\n> /);
  const modified = nodeOf(graphOf(read('docs/index.html'), 'docs/index.html'), 'WebPage').dateModified;
  const pick = (pattern, label) => {
    const match = text.match(pattern);
    assert.ok(match, `llms-full.txt 里找不到${label}`);
    return match;
  };
  assert.deepEqual(pick(/Version (\d+\.\d+\.\d+), released (\d{4}-\d{2}-\d{2})/, '版本与发布日期').slice(1), [version, date]);
  assert.equal(pick(/last updated (\d{4}-\d{2}-\d{2})/, '更新日期')[1], modified, 'llms-full.txt 的更新日期应等于落地页 dateModified');
  assert.deepEqual(pick(/Latest version: (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)/, '「Latest version」').slice(1), [version, date]);
  assert.deepEqual(pick(/^- (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\):/m, '版本历史第一条').slice(1), [version, date], '版本历史的第一条应是当前版本');

  const {API_PROVIDERS} = await import(pathToFileURL(path.join(root, 'roamcat-0.0.1', 'extension', 'api-providers.mjs')).href);
  const {MESSAGE_TYPES, CONTENT_ALLOWED_TYPES} = await import(pathToFileURL(path.join(root, 'roamcat-0.0.1', 'extension', 'message-protocol.js')).href);
  const minimum = Number(JSON.parse(read('roamcat-0.0.1/extension/manifest.json')).minimum_chrome_version);
  const expectAll = (pattern, expected, label, group = 1) => {
    const matches = [...text.matchAll(pattern)];
    assert.ok(matches.length > 0, `llms-full.txt 应写明${label}`);
    for (const match of matches) assert.equal(Number(match[group]), expected, `${label}写的是 ${match[group]}（「${match[0]}」），代码里是 ${expected}`);
  };
  expectAll(/(\d+)\s+bring-your-own\s+(?:API\s+)?providers/gi, API_PROVIDERS.length, '服务商数');
  expectAll(/across\s+(\d+)\s+protocols/gi, new Set(API_PROVIDERS.map(provider => provider.protocol)).size, '协议数');
  expectAll(/(\d+)\s+whitelisted\s+message\s+types\s+out\s+of\s+(\d+)/gi, CONTENT_ALLOWED_TYPES.length, '内容脚本白名单数');
  expectAll(/(\d+)\s+whitelisted\s+message\s+types\s+out\s+of\s+(\d+)/gi, MESSAGE_TYPES.length, '消息总数', 2);
  expectAll(/(\d+)\s*家自备\s*API/g, API_PROVIDERS.length, '中文摘要里的服务商数');
  expectAll(/(\d+)\s*种消息中的\s*(\d+)\s*种白名单/g, MESSAGE_TYPES.length, '中文摘要里的消息总数');
  expectAll(/(\d+)\s*种消息中的\s*(\d+)\s*种白名单/g, CONTENT_ALLOWED_TYPES.length, '中文摘要里的白名单数', 2);
  expectAll(/Chrome\s*\/\s*Edge\s+(\d{3})\+/g, minimum, 'Chrome / Edge 最低版本');
});

test('落地页图片：alt、width、height 齐全且与文件实际尺寸一致', () => {
  for (const file of ['docs/index.html', 'docs/zh.html', 'docs/404.html']) {
    const images = tagsOf(read(file), 'img');
    assert.ok(images.length > 0, `${file} 没找到 <img>`);
    for (const img of images) {
      assert.ok(img.alt, `${file}：<img src="${img.src}"> 缺 alt`);
      assert.ok(Number(img.width) > 0 && Number(img.height) > 0, `${file}：<img src="${img.src}"> 缺 width / height（会造成布局抖动）`);
      const target = resolveAsset(img.src);
      assert.ok(target && existsSync(target), `${file}：图片文件不存在 ${img.src}`);
      if (target.endsWith('.png')) {
        const size = pngSize(target);
        assert.deepEqual([Number(img.width), Number(img.height)], [size.width, size.height], `${file}：${img.src} 的 width / height 与文件实际尺寸不符`);
      }
    }
  }
});

/** tokens.css 声明段 → {--name: value}；色值去空格、补前导 0，便于和页面里手写的 CSS 比对。 */
const normalizeColor = value => value.toLowerCase().replace(/\s+/g, '').replace(/(\D)\.(\d)/g, '$10.$2');
const declarations = section => Object.fromEntries([...section.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)].map(match => [match[1], normalizeColor(match[2])]));

// 落地页是独立静态页、不能 import tokens，只能抄值：页面变量 → 产品 tokens.css 里对应的 token
const PALETTE = {
  '--paper': '--rc-canvas', '--card': '--rc-surface', '--paper-2': '--rc-surface-subtle',
  '--ink': '--rc-ink', '--ink-soft': '--rc-ink-secondary', '--line': '--rc-line-mid', '--amber': '--rc-accent',
};

test('落地页调色板与 tokens.css 一致，theme-color 等于页面底色', () => {
  const {light, dark} = extractTokenSections(read('src/styles/tokens.css'));
  const tokens = {light: declarations(light), dark: declarations(dark)};
  for (const file of ['docs/index.html', 'docs/zh.html', 'docs/404.html']) {
    const html = read(file);
    const blocks = [...html.matchAll(/:root\{([^}]*)\}/g)].map(match => declarations(match[1]));
    assert.equal(blocks.length, 2, `${file} 应有亮色与暗色两段 :root`);
    for (const [index, theme] of ['light', 'dark'].entries()) {
      const palette = blocks[index];
      assert.ok(palette['--paper'], `${file} 的 ${theme} 段缺 --paper`);
      for (const [name, token] of Object.entries(PALETTE)) {
        if (palette[name] === undefined) continue; // 404 页只用到其中几个变量
        assert.equal(palette[name], tokens[theme][token], `${file}：${theme} 主题的 ${name} 是 ${palette[name]}，tokens.css 的 ${token} 是 ${tokens[theme][token]}`);
      }
      const themeColor = tagsOf(html, 'meta').find(tag => tag.name === 'theme-color' && tag.media?.includes(theme));
      assert.ok(themeColor, `${file} 缺 ${theme} 主题的 theme-color`);
      assert.equal(normalizeColor(themeColor.content), palette['--paper'], `${file}：${theme} 主题的 theme-color 应等于页面底色 --paper`);
    }
  }
});
