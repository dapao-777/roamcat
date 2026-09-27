/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// 站点侦察：在真实程序员站点上调用 content.js 的只读 inspect() 探针，
// 输出阅读根、eligible blocks 与整页 units 的分区统计，为站点适配层设计供数据。
// 结果写入 preview/sites/probe-<slug>.{json,png}（不入库）。
// 运行：PLAYWRIGHT_CORE_PATH=<playwright-core 路径> node tools/probe-dev-sites.cjs
const fs = require('node:fs'), path = require('node:path');
const { launchExtension } = require('./lib/edge-extension.cjs');
const source = path.resolve(process.env.EXTENSION_DIR || path.join(__dirname, '../roamcat-0.0.1/extension'));
const outDir = path.resolve(__dirname, '../preview/sites');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BLOCKED_RE = /just a moment|verify you are (a )?human|are you a (human|robot)|captcha|access denied|attention required|you('ve| have) been blocked|error code:?\s*403|403 forbidden|unusual traffic/i;

const sites = [
  { slug: 'github-readme', url: 'https://github.com/microsoft/vscode' },
  { slug: 'github-issue', url: 'https://github.com/microsoft/vscode/issues/1' },
  { slug: 'github-pr', url: 'https://github.com/nodejs/node/pull/22712' },
  { slug: 'github-pr-files', url: 'https://github.com/nodejs/node/pull/22712/files' },
  { slug: 'github-code', url: 'https://github.com/nodejs/node/blob/main/lib/fs.js' },
  { slug: 'github-markdown-blob', url: 'https://github.com/nodejs/node/blob/main/README.md' },
  {
    slug: 'github-discussion',
    resolve: async page => {
      await page.goto('https://github.com/orgs/community/discussions', { waitUntil: 'domcontentloaded' });
      return page.evaluate(() => document.querySelector('a[href*="/orgs/community/discussions/"]')?.href || null);
    },
  },
  { slug: 'reddit-sub', url: 'https://www.reddit.com/r/programming/' },
  {
    slug: 'reddit-post',
    resolve: async page => {
      for (const host of ['www.reddit.com', 'old.reddit.com']) {
        await page.goto(`https://${host}/r/learnprogramming/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        const url = await page.evaluate(() => [...document.querySelectorAll('a[href*="/r/learnprogramming/comments/"]')]
          .map(a => a.href).find(h => !/read_me|wiki|faq|new_read/i.test(h)) || null);
        if (url) return url.replace('old.reddit.com', 'www.reddit.com');
      }
      return null;
    },
  },
  { slug: 'oldreddit-post', derive: results => results['reddit-post']?.finalUrl?.replace('www.reddit.com', 'old.reddit.com') },
  { slug: 'hn-front', url: 'https://news.ycombinator.com/' },
  {
    slug: 'hn-item',
    resolve: async page => {
      await page.goto('https://news.ycombinator.com/', { waitUntil: 'domcontentloaded' });
      return page.evaluate(() => { const row = document.querySelector('tr.athing'); return row ? 'https://news.ycombinator.com/item?id=' + row.id : null; });
    },
  },
  { slug: 'so-question', url: 'https://stackoverflow.com/questions/11227809' },
  {
    slug: 'discourse-topic',
    resolve: async page => {
      await page.goto('https://discuss.python.org/latest', { waitUntil: 'domcontentloaded' });
      return page.evaluate(() => document.querySelector('a.title[href*="/t/"]')?.href || document.querySelector('a[href*="/t/"]')?.href || null);
    },
  },
  {
    slug: 'devto-article',
    resolve: async page => {
      await page.goto('https://dev.to/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      return page.evaluate(() => document.querySelector('a.crayons-story__hidden-navigation-link')?.href || document.querySelector('a[href^="/"][href*="-"]')?.href || null);
    },
  },
  {
    slug: 'lobsters-story',
    resolve: async page => {
      await page.goto('https://lobste.rs/', { waitUntil: 'domcontentloaded' });
      return page.evaluate(() => document.querySelector('a[href*="/s/"]')?.href || null);
    },
  },
];

const launch = headless => launchExtension({ headless, extensionDir: source });

async function probe(context, extPage, slug, url, mode) {
  const record = { slug, requestedUrl: url, mode, blocked: false };
  const before = new Set(context.pages());
  const tabId = await extPage.evaluate(u => chrome.tabs.create({ url: u }).then(t => t.id), url);
  record.tabId = tabId;
  let page = null;
  for (let attempt = 0; attempt < 30 && !page; attempt++) {
    await sleep(300);
    page = context.pages().find(p => !before.has(p) && !p.url().startsWith('chrome-extension://')) || null;
  }
  if (!page) { record.error = 'tab page not found'; return record; }
  try {
    await page.waitForLoadState('load', { timeout: 45000 }).catch(() => {});
    await sleep(2000);
    await page.evaluate(() => { scrollTo(0, document.body?.scrollHeight || 1e6); }).catch(() => {});
    await sleep(1000);
    await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
    await sleep(1000);
    record.finalUrl = page.url();
    record.title = await page.title().catch(() => '');
    const sample = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '').catch(() => '');
    record.blocked = BLOCKED_RE.test(record.title) || BLOCKED_RE.test(sample);
    const frames = await extPage.evaluate(t => chrome.scripting.executeScript({ target: { tabId: t }, func: () => globalThis.__ROAMCAT_CONTENT__?.inspect?.() }), tabId).catch(error => ({ error: error.message }));
    record.inspect = frames?.[0]?.result ?? null;
    if (!record.inspect) record.inspectError = frames?.error || JSON.stringify(frames) || 'no result';
    await page.screenshot({ path: path.join(outDir, `probe-${slug}.png`) }).catch(error => { record.screenshotError = error.message; });
  } catch (error) {
    record.error = error.message;
  } finally {
    await page.close().catch(() => {});
  }
  return record;
}

const results = {};
(async () => {
  const phases = [{ headless: true, mode: 'headless' }, { headless: false, mode: 'headed' }];
  let pending = sites.map(site => site.slug);
  for (const phase of phases) {
    if (!pending.length) break;
    const todo = sites.filter(site => pending.includes(site.slug));
    let session = null;
    try {
      session = await launch(phase.headless);
      const { context, extPage } = session;
      for (const site of todo) {
        let url = site.url || null;
        if (!url) {
          const scratch = await context.newPage();
          try {
            url = site.resolve ? await site.resolve(scratch) : site.derive?.(results);
          } catch (error) {
            results[site.slug] = { slug: site.slug, mode: phase.mode, error: 'resolve: ' + error.message };
          }
          await scratch.close().catch(() => {});
          if (!url) {
            results[site.slug] ??= { slug: site.slug, mode: phase.mode, error: 'resolve returned no url' };
            if (!site.derive) continue;
          }
        }
        if (site.derive && !url) continue;
        console.log(`[${phase.mode}] ${site.slug} -> ${url}`);
        const record = await probe(context, extPage, site.slug, url, phase.mode);
        if (record.finalUrl && record.finalUrl !== url) record.substitutedOrRedirected = record.finalUrl;
        results[site.slug] = record;
        fs.writeFileSync(path.join(outDir, `probe-${site.slug}.json`), JSON.stringify(record, null, 2));
      }
    } catch (error) {
      console.log(`[${phase.mode}] launch failed: ${error.message}`);
      for (const site of todo) results[site.slug] ??= { slug: site.slug, mode: phase.mode, error: 'launch: ' + error.message };
    } finally {
      if (session) await session.close();
    }
    pending = pending.filter(slug => { const r = results[slug]; return r?.blocked || r?.error || r?.inspectError || (r && !r.inspect); });
  }
  fs.writeFileSync(path.join(outDir, 'probe-index.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([slug, r]) => [slug, { url: r.finalUrl, blocked: r.blocked, mode: r.mode, root: r.inspect?.root, blockCount: r.inspect?.blockCount, unitsByZone: r.inspect?.unitsByZone, error: r.error || r.inspectError }])), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
