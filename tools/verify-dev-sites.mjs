/**
 * @file tools/verify-dev-sites.mjs
 * 文件职责：站点档案端到端验收（npm run verify:sites）——把手工 fixture 按真实 URL 拦截回包，在无头 ego lite 里断言
 *   content.js 的 inspect() 阅读块 / 翻译单元分区符合站点档案预期。
 * 主要内容：各站点 fixture 用例、选择器合法性、example.com 负对照、github-issue 与 cli-commands 双语渲染冒烟
 *   （本机假模型接口）；--live 时改为复核真站（墙 / 登录页记 SKIP）。
 * 模块边界：普通 Node 运行，先 npm run build；每个测试页各自拦截请求，fixture 之外的外部请求一律拦掉；
 *   报告写 preview/sites/verify-dev-sites.json。用法：node tools/verify-dev-sites.mjs [--live]
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {DIST, REPO, extUrl, gateArgs, openBrowser, previewPath, sleep} from './lib/ego.mjs';
import {printGateSummary} from './lib/gate-report.mjs';

const LIVE = gateArgs().includes('--live');
const extensionDir = path.resolve(process.env.EXTENSION_DIR || DIST);
if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
  console.error(`扩展产物缺失：${extensionDir} —— 请先运行 npm run build`);
  process.exit(1);
}
const fixtureDir = path.join(REPO, 'tools', 'fixtures', 'sites');
const fixture = slug => fs.readFileSync(path.join(fixtureDir, slug + '.html'), 'utf8');
// 在目标 tab 的隔离世界里跑 content.js 的 inspect()（字面量 func，不依赖 eval）。
const inspectTab = async (extPage, tabId, limit = 5000, textLimit = 2000) => {
  await extPage.evaluate(tabId=>chrome.runtime.sendMessage({type:'PAGE_UI_INJECT',tabId}),tabId);
  return extPage.evaluate(({tabId, limit, textLimit}) => chrome.scripting.executeScript({
    target: {tabId},
    func: args => globalThis.__ROAMCAT_CONTENT__?.inspect?.(args.limit, args.textLimit),
    args: [{limit, textLimit}]
  }), {tabId, limit, textLimit}).then(frames => frames?.[0]?.result);
};
// 在目标 tab 的隔离世界里按选择器列表逐个 querySelector 校验合法性。
const checkSelectors = (extPage, tabId, selectors) =>
  extPage.evaluate(({tabId, selectors}) => chrome.scripting.executeScript({
    target: {tabId},
    func: sels => sels.filter(sel => { try { document.createDocumentFragment().querySelector(sel); return false; } catch { return true; } }),
    args: [selectors]
  }), {tabId, selectors}).then(frames => frames?.[0]?.result);
const readProfiles = async (extPage, tabId) => {
  await extPage.evaluate(tabId=>chrome.runtime.sendMessage({type:'PAGE_UI_INJECT',tabId}),tabId);
  return extPage.evaluate(tabId => chrome.scripting.executeScript({
    target: {tabId},
    func: () => (globalThis.RoamCatSites?.PROFILES || []).flatMap(p => [...(p.root || []), ...(p.skip || []), ...(p.chrome || [])])
  }), tabId).then(frames => frames?.[0]?.result || []);
};
const BLOCKED_RE = /just a moment|verify you are (a )?human|are you a (human|robot)|captcha|access denied|unusual traffic|login\/\?reason/i;

const cases = [
  {
    slug: 'github-issue', url: 'https://github.com/microsoft/vscode/issues/1', site: 'github',
    mustRead: ['open source license so that the community can study', 'modern open editor platform without reverse engineering', 'register commands, themes, and language features', 'conversation about where editor user interface'],
    mustNotRead: ['added a commit that references this issue', 'const editor = require', 'No one assigned sidebar wording'],
    mustNotTranslate: ['const editor = require'],
    chromeOnly: ['No one assigned sidebar wording', 'added a commit that references this issue', 'Sign up for free to join this conversation']
  },
  {
    slug: 'github-pr-files', url: 'https://github.com/nodejs/node/pull/22712/files', site: 'github',
    mustRead: ['human readable diagnostic reports whenever a fatal error'],
    mustNotRead: ['WriteReport', 'WriteString', 'fflush', 'node_report.cc', 'Reviewers'],
    mustNotTranslate: ['WriteReport', 'WriteString', 'fflush', 'node_report.cc', 'breadcrumbs'],
    chromeOnly: ['Sidebar reviewer wording', 'reviewer wording goes here']
  },
  {
    slug: 'github-code', url: 'https://github.com/nodejs/node/blob/main/lib/fs.js', site: 'github', allowNullRoot: true,
    mustRead: ['open source JavaScript runtime built on the V8 engine'],
    mustNotRead: ['lib/fs.js', "'fs'", 'readFileSync', 'nodejs / node / lib'],
    mustNotTranslate: ['lib/fs.js', "'fs'", 'readFileSync', 'nodejs / node / lib'],
    chromeOnly: ['about box wording']
  },
  {
    slug: 'github-readme', url: 'https://github.com/microsoft/vscode', site: 'github',
    mustRead: ['lightweight but powerful source code editor', 'rich ecosystem of extensions', 'core edit build debug cycle'],
    mustNotRead: ['Notifications', 'Fork', 'Star', 'src', 'bump dependencies', 'latest commit summary'],
    mustNotTranslate: ['Notifications', 'Fork', 'Star', 'bump dependencies', 'latest commit summary'],
    chromeOnly: ['notification settings wording', 'signed in to change notification']
  },
  {
    // 仓库列表：元信息行（语言/星标/证书/更新时间）是纯数据，整块译文会把行内 flex 撑散；
    // 仓库名是标识符不译，描述段照常进入阅读块与翻译单元。
    slug: 'github-repolist', url: 'https://github.com/octocat?tab=repositories', site: 'github',
    mustRead: ['deterministic SQL compilation', 'vectorized execution engine for analytical'],
    mustNotRead: ['MIT License', 'Apache-2.0'],
    mustNotTranslate: ['MIT License', 'Apache-2.0', 'Python', 'last week', 'Forge'],
    chromeOnly: []
  },
  {
    slug: 'github-actions', url: 'https://github.com/microsoft/vscode/actions/runs/1', site: 'github',
    mustRead: ['publishing release artifacts', 'leave the command log below'],
    mustNotRead: ['npm ERR! code E401', 'unexpected error occurred during publish'],
    mustNotTranslate: ['npm ERR! code E401', 'unexpected error occurred during publish']
  },
  {
    slug: 'github-wiki', url: 'https://github.com/microsoft/vscode/wiki/Architecture-notes', site: 'github',
    mustRead: ['language server keeps a snapshot', 'Diagnostics are published on a separate'],
    mustNotRead: ['Pages sidebar wording'],
    chromeOnly: ['Pages sidebar wording']
  },
  {
    slug: 'reddit-post', url: 'https://www.reddit.com/r/learnprogramming/comments/1wkbpei/fixture/', site: 'reddit',
    mustRead: ['share the small programming project they built', 'toy parser using a proper token stream', 'requestAnimationFrame timing actually behaves', 'comparing the two implementations taught me more'],
    mustNotRead: ['promoted bootcamp advertisement', 'community header wording', 'Posted by u/curiousstudent', 'reply award share'],
    mustNotTranslate: ['promoted bootcamp advertisement', 'Posted by u/curiousstudent', 'days ago', 'reply award share'],
    chromeOnly: ['reddit navigation chrome marker', 'community header wording', 'Community details sidebar']
  },
  {
    slug: 'reddit-shadow', url: 'https://www.reddit.com/r/programming/comments/1shadow/fixture/', site: 'reddit',
    mustRead: ['follow a long code review', 'prose around the change', 'shadow comment explains why the token stream'],
    mustNotRead: ['reply award share', '2 days ago'],
    mustNotTranslate: ['reply award share', '2 days ago'],
    articleUnits: ['shadow comment explains why the token stream']
  },
  {
    slug: 'oldreddit-post', url: 'https://old.reddit.com/r/learnprogramming/comments/1wkbpei/fixture/', site: 'reddit',
    mustRead: ['toy parser using a proper token stream', 'requestAnimationFrame timing actually behaves', 'comparing the two implementations taught me more'],
    mustNotRead: ['submitted 3 days ago', 'share save hide', 'sidebar wording with rules', 'footer wording sits here'],
    mustNotTranslate: ['submitted 3 days ago', 'days ago by', 'share save hide'],
    chromeOnly: ['sidebar wording with rules', 'footer wording sits here']
  },
  {
    slug: 'hn-item', url: 'https://news.ycombinator.com/item?id=49848269', site: 'hackernews',
    mustRead: ['tree walking evaluator can stay under five hundred lines', 'mark and sweep click for me', 'how little machinery a usable language'],
    mustNotRead: ['57 minutes ago', '105 points', 'new | past | comments', 'Guidelines | FAQ'],
    mustNotTranslate: ['57 minutes ago', '105 points'],
    chromeOnly: ['new | past | comments', 'Guidelines | FAQ']
  },
  {
    slug: 'so-question', url: 'https://stackoverflow.com/questions/11227809', site: 'stackexchange',
    mustRead: ['branch prediction rather than anything the sort itself', 'language or compiler anomaly', 'wrongly predicted conditional jump discards'],
    mustNotRead: ['Asked 14 years', 'Viewed 2.0m', 'Improve this question', 'Improve this answer', 'Over a year ago', '27000', 'branch-prediction', 'sidebar wording', 'footer wording'],
    mustNotTranslate: ['Asked 14 years', 'Viewed 2.0m', 'Improve this question', 'Improve this answer', 'Over a year ago', '27000', 'branch-prediction'],
    chromeOnly: ['top bar chrome wording', 'sidebar chrome wording', 'footer wording']
  },
  {
    slug: 'discourse-topic', url: 'https://discuss.python.org/t/fixture/109203', site: 'discourse',
    mustRead: ['interoperability between packaging tools should be treated', 'publish interim notes after every session', 'newcomers still struggle to choose'],
    mustNotRead: ['Council Chair', 'Packaging Authority', 'community banner announcement', 'Skip to main content', 'timeline'],
    mustNotTranslate: ['Council Chair', 'Packaging Authority', 'like reply bookmark', 'timeline'],
    chromeOnly: ['discourse header chrome wording', 'community banner announcement', 'Skip to main content', 'Suggested topic list wording', 'sidebar navigation wording']
  },
  {
    slug: 'devto-article', url: 'https://dev.to/devteam/fixture-18ml', site: 'forem',
    mustRead: ['benchmarking challenge that invites developers', 'shared evaluation harness', 'the systems this benchmark was designed to stress', 'common yardstick for comparing agent workflows', 'sandboxed tool calls to replay deterministically'],
    mustNotRead: ['Posted on', '#challenge', 'Promoted billboard wording', 'kaggle-bench'],
    mustNotTranslate: ['Posted on', '#challenge', 'Promoted billboard wording', 'kaggle-bench'],
    chromeOnly: ['header chrome wording', 'sidebar wording', 'footer wording']
  },
  {
    slug: 'lobsters-story', url: 'https://lobste.rs/s/68n22g/fixture', site: 'lobsters',
    mustRead: ['renaming the casual slang term for describing ai assisted coding', 'deliberate tool use and unquestioned generation', 'naming debates work best', 'moderation decisions on the site'],
    mustNotRead: ['joshka 14 hours ago', 'abhin4v 11 hours ago', '42', 'navigation chrome wording'],
    mustNotTranslate: ['joshka 14 hours ago', 'abhin4v 11 hours ago', 'MatheusRich 5 hours ago', 'chrismorgan 2 hours ago', 'ai meta'],
    chromeOnly: ['navigation chrome wording']
  },
  {
    slug: 'gitlab-issue', url: 'https://gitlab.com/gitlab-org/gitlab/-/issues/1', site: 'gitlab',
    mustRead: ['publish provenance with the package', 'writes the attestation into the release'],
    mustNotRead: ['2 days ago', 'const attestation', 'documentation label text', 'Assignee sidebar wording'],
    mustNotTranslate: ['2 days ago', 'const attestation', 'documentation label text'],
    chromeOnly: ['Assignee sidebar wording', 'GitLab navigation chrome marker']
  },
  {
    slug: 'npm-package', url: 'https://www.npmjs.com/package/left-pad', site: 'npm',
    mustRead: ['pads a string on the left', 'already long enough'],
    mustNotRead: ['Weekly downloads sidebar count', 'npm navigation chrome marker'],
    chromeOnly: ['Weekly downloads sidebar count', 'npm navigation chrome marker']
  },
  {
    slug: 'huggingface-model', url: 'https://huggingface.co/bert-base-uncased', site: 'huggingface',
    mustRead: ['contextual vectors', 'not a general purpose'],
    mustNotRead: ['from transformers', 'Model card sidebar wording'],
    mustNotTranslate: ['from transformers'],
    chromeOnly: ['Model card sidebar wording', 'Hugging Face navigation chrome marker']
  },
  {
    slug: 'arxiv-abs', url: 'https://arxiv.org/abs/1706.03762', site: 'arxiv',
    mustRead: ['dominant sequence transduction models', 'the Transformer, based solely'],
    mustNotRead: ['Ashish Vaswani', 'arxiv.org header chrome marker'],
    mustNotTranslate: ['Ashish Vaswani'],
    chromeOnly: ['arxiv.org header chrome marker']
  },
  {
    slug: 'readthedocs', url: 'https://requests.readthedocs.io/en/latest/index.html', site: 'readthedocs',
    mustRead: ['reuse the underlying connection', 'default waits indefinitely'],
    mustNotRead: ['requests.get', 'Documentation sidebar wording'],
    mustNotTranslate: ['requests.get'],
    chromeOnly: ['Documentation sidebar wording']
  },
  {
    slug: 'docs-rs', url: 'https://docs.rs/serde/latest/serde/', site: 'docsrs',
    mustRead: ['immutable client once build', 'distinct clients that share no mutable'],
    mustNotRead: ['impl Builder', 'Crate navigation sidebar wording'],
    mustNotTranslate: ['impl Builder'],
    chromeOnly: ['Crate navigation sidebar wording']
  },
  {
    // MDN 文档页：<main> 为 display:contents（自身无布局盒子），正文必须作为 article 单元进入翻译。
    slug: 'contents-main', url: 'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Fundamentals', site: 'mdn',
    articleUnits: ['Performance means efficiency in the context of web apps', 'user-perceived performance is the only performance', 'how the rendering engine contributes to performance'],
    mustNotTranslate: ['Hidden dropdown panel wording'],
    chromeOnly: ['Understanding latency sidebar wording', 'Table of contents aside wording']
  }
];
const urlKey = raw => { const u = new URL(raw); return u.host + u.pathname.replace(/\/$/, ''); };
const fixtureRoutes = new Map(cases.map(c => [urlKey(c.url), c.slug]));
const NEGATIVE_URL = 'https://example.com/pretend-github-pr-files';

const report = {checks: [], failures: []};
async function check(name, fn) {
  try { const detail = await fn(); report.checks.push({name, ...(detail ? {detail} : {})}); console.log('PASS ' + name + (detail ? ' · ' + detail : '')); }
  catch (error) { report.failures.push({name, error: error.message}); console.log('FAIL ' + name + ': ' + error.message); }
}
const haystack = list => list.map(item => item.text || '').join('\n');
const findMissing = (hay, phrases) => phrases.filter(p => !hay.includes(p));
const findPresent = (hay, phrases) => phrases.filter(p => hay.includes(p));

// 新开一个测试页（独立窗口）；route 给定时按它拦截这个页面的请求。页签 id 按最终网址在扩展页里查。
async function probeTab(run, extPage, url, route = null) {
  const page = await run.newPage();
  await page.setViewportSize({width: 1366, height: 900}, 1);
  if (route) await page.intercept(['*'], route);
  await page.goto(url, {timeout: 30000}).catch(() => {});
  await sleep(2500);
  const href = await page.url();
  const tabId = await extPage.evaluate(async target => (await chrome.tabs.query({})).find(tab => tab.url === target)?.id ?? null, href);
  if (!tabId) { await page.close(); throw new Error(`tab page not found: ${href}`); }
  return {page, tabId};
}
async function openSession() {
  const run = await openBrowser({extension: extensionDir});
  const extPage = await run.newPage();
  await extPage.goto(extUrl('ui/options.html'));
  return {run, extPage};
}

// ---- fixture 检查（含负对照与选择器合法性、双语冒烟） ----
async function runFixtures() {
  const {run, extPage} = await openSession();
  try {
    // 按真实 URL 回 fixture；本机假模型服务放行，其余外部请求一律拦掉。
    const route = request => {
      const u = new URL(request.url);
      const slug = fixtureRoutes.get(u.host + u.pathname.replace(/\/$/, ''));
      if (slug) return {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}, body: fixture(slug)};
      if (u.host === 'example.com' && u.pathname === '/cli-commands') return {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}, body: fixture('cli-commands')};
      if (u.host === 'example.com' && u.pathname === '/pretend-github-pr-files') return {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}, body: fixture('github-pr-files')};
      if (u.host === 'example.com') return {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}, body: '<!doctype html><title>Example Domain</title><p>Example domain placeholder page.</p>'};
      // 本机假模型服务（startMockApi）要放行，否则双语检查里的翻译请求全被拦掉，只剩失败提示。
      if (u.hostname === '127.0.0.1') return null;
      if (u.protocol.startsWith('http')) return {abort: true};
      return null;
    };
    for (const c of cases) {
      await check(`fixture ${c.slug}`, async () => {
        const {page, tabId} = await probeTab(run, extPage, c.url, route);
        try {
          const inspect = await inspectTab(extPage, tabId);
          assert.ok(inspect, 'inspect() 无结果（content script 未注入？）');
          assert.equal(inspect.site, c.site, `site=${inspect.site}`);
          if (!c.allowNullRoot) assert.ok(inspect.root, 'root 为空');
          // SITES_DEBUG=<slug> 时打印该夹具提取出的全部单元，便于排查用例为何没命中。
          if (process.env.SITES_DEBUG === c.slug) console.log(JSON.stringify(inspect.units, null, 1));
          const blockText = haystack(inspect.blocks || []), unitText = haystack(inspect.units || []);
          const chromeText = (inspect.units || []).filter(u => u.zone === 'chrome').map(u => u.text).join('\n');
          const misses = [
            ...findMissing(blockText, c.mustRead || []).map(p => `mustRead 未读到:${p}`),
            ...findPresent(blockText, c.mustNotRead || []).map(p => `mustNotRead 被读:${p}`),
            ...findPresent(unitText, c.mustNotTranslate || []).map(p => `mustNotTranslate 出现:${p}`),
            ...(c.articleUnits || []).filter(p => !(inspect.units || []).some(u => u.zone === 'article' && u.text.includes(p))).map(p => `articleUnits 未作为正文单元出现:${p}`),
            ...(c.chromeOnly || []).flatMap(p => {
              if (!chromeText.includes(p)) return [`chromeOnly 未出现在 chrome 单元:${p}`];
              if (blockText.includes(p)) return [`chromeOnly 出现在 blocks:${p}`];
              const nonChrome = (inspect.units || []).filter(u => u.zone !== 'chrome');
              return nonChrome.some(u => u.text.includes(p)) ? [`chromeOnly 越界:${p}`] : [];
            }),
          ];
          assert.equal(misses.length, 0, misses.join(' | '));
          return `root=${inspect.root} blocks=${inspect.blockCount} units=${inspect.unitCount}`;
        } finally { await page.close().catch(() => {}); }
      });
    }
    await check('负对照：同一 fixture 在 example.com 上 diff 行应进入 blocks', async () => {
      const {page, tabId} = await probeTab(run, extPage, NEGATIVE_URL, route);
      try {
        const inspect = await inspectTab(extPage, tabId);
        assert.ok(inspect, 'inspect() 无结果');
        assert.equal(inspect.site, null, `site=${inspect.site}`);
        const blockText = haystack(inspect.blocks || []);
        assert.ok(blockText.includes('WriteReport') || blockText.includes('WriteString'), 'diff 代码行未进入阅读块');
        return `blocks=${inspect.blockCount}`;
      } finally { await page.close().catch(() => {}); }
    });
    await check('所有档案选择器合法', async () => {
      const {page, tabId} = await probeTab(run, extPage, 'https://example.com/', route);
      try {
        const all = [...new Set(await readProfiles(extPage, tabId))];
        const invalid = await checkSelectors(extPage, tabId, all);
        assert.deepEqual(invalid, [], `非法选择器: ${invalid.join(', ')}`);
        return `${all.length} 个选择器全部合法`;
      } finally { await page.close().catch(() => {}); }
    });
    await check('github-issue 双语渲染不侵入代码/署名/侧栏', async () => {
      const origin = `http://127.0.0.1:${await startMockApi()}`;
      await extPage.evaluate(message => chrome.runtime.sendMessage(message), {type: 'STATE_PATCH', patch: {providerKind: 'api', assistanceMode: 'on-demand', domain: 'general'}});
      const resp = await extPage.evaluate(({message}) => chrome.runtime.sendMessage(message), {message: {type: 'STATE_PATCH', patch: {apiServices: [{id: 'audit', name: 'Local audit fixture', providerId: 'openai-compatible', baseUrl: origin + '/v1', model: 'audit-model', apiKey: 'audit-fixture-not-a-real-key', maxConcurrency: 2, options: {}}], activeApiServiceId: 'audit'}}});
      assert.ok(resp?.ok, resp?.error || 'STATE_PATCH 失败');
      const {page, tabId} = await probeTab(run, extPage, cases[0].url, route);
      try {
        await extPage.evaluate(({tabId}) => chrome.runtime.sendMessage({type: 'PAGE_UI_INJECT', tabId}), {tabId});
        const begun = await extPage.evaluate(({tabId, url}) => chrome.runtime.sendMessage({type: 'EMERGENCY_BEGIN', tabId, url}), {tabId, url: cases[0].url});
        assert.ok(begun?.ok || begun?.data?.token || begun?.token, JSON.stringify(begun));
        const token = begun.data?.token || begun.token;
        const started = await extPage.evaluate(({tabId, token}) => chrome.tabs.sendMessage(tabId, {type: 'SS_EMERGENCY_START', token, resume: false}, {frameId: 0}), {tabId, token});
        assert.ok(started?.ok, started?.error || '未能开始双语');
        await page.locator('[data-roamcat-ui="emergency-translation"]').first().waitFor({state: 'visible', timeout: 20000});
        await page.waitForTimeout(1500);
        const skipSels = ['pre', '.blob-code', 'table.diff-table', '[role="tree"]', '.file-header', 'a.author', '[data-testid="avatar-link"]', '[data-testid="actor-link"]', '[data-testid="issue-body-header-author"]', '[class*="AuthorLink-module"]', 'a[data-hovercard-type="user"]', 'relative-time', '.commit-ref', '[class*="BranchName"]', '.IssueLabel', '.Label', '.topic-tag', '[class*="TopicTag"]', '.Counter', '#repository-details-container', '[data-testid="breadcrumbs"]', '#file-name-id-wide', '#file-name-id'];
        const verdict = await page.evaluate(skipSels => {
          const panels = [...document.querySelectorAll('[data-roamcat-ui="emergency-translation"]')].filter(p => !p.querySelector('[role="status"]'));
          const bad = panels.filter(p => p.closest(skipSels.join(',')));
          const nearAuthor = panels.filter(p => p.closest('a.author,[data-testid="avatar-link"],[data-testid="actor-link"],a[data-hovercard-type="user"]') || p.querySelector('a.author,[data-testid="avatar-link"],[data-testid="actor-link"],a[data-hovercard-type="user"]'));
          const afterComment = panels.filter(p => p.closest('.comment-body') || p.previousElementSibling?.closest?.('.comment-body') || p.parentElement?.classList?.contains('comment-body'));
          return {total: panels.length, bad: bad.length, nearAuthor: nearAuthor.length, afterComment: afterComment.length};
        }, skipSels);
        assert.ok(verdict.total > 0, '没有渲染译文');
        assert.equal(verdict.bad, 0, `${verdict.bad} 个译文块落在 skip 区域内`);
        assert.equal(verdict.nearAuthor, 0, `${verdict.nearAuthor} 个译文块贴近署名`);
        assert.ok(verdict.afterComment > 0, '没有译文跟随评论正文');
        return `译文 ${verdict.total} 块，评论后 ${verdict.afterComment} 块`;
      } finally { await page.close().catch(() => {}); }
    });
    await check('cli-commands 命令格不翻译、行内代码原样保留、原样译文不显示', async () => {
      const url = 'https://example.com/cli-commands';
      const {page, tabId} = await probeTab(run, extPage, url, route);
      try {
        await extPage.evaluate(({tabId}) => chrome.runtime.sendMessage({type: 'PAGE_UI_INJECT', tabId}), {tabId});
        const begun = await extPage.evaluate(({tabId, url}) => chrome.runtime.sendMessage({type: 'EMERGENCY_BEGIN', tabId, url}), {tabId, url});
        const token = begun?.data?.token || begun?.token;
        assert.ok(token, JSON.stringify(begun));
        const started = await extPage.evaluate(({tabId, token}) => chrome.tabs.sendMessage(tabId, {type: 'SS_EMERGENCY_START', token, resume: false}, {frameId: 0}), {tabId, token});
        assert.ok(started?.ok, started?.error || '未能开始双语');
        await page.locator('#desc-plan [data-roamcat-ui="emergency-translation"]').waitFor({state: 'visible', timeout: 20000});
        await page.waitForTimeout(1500);
        const verdict = await page.evaluate(() => {
          const translated = node => node && !node.querySelector('[role="status"]') ? node : null;
          const panel = id => translated(document.querySelector(`#${id} [data-roamcat-ui="emergency-translation"]`));
          const panels = [...document.querySelectorAll('[data-roamcat-ui="emergency-translation"]')].filter(translated);
          const failed = document.querySelectorAll('[data-roamcat-ui="emergency-translation"] [role="status"]').length;
          const plan = panel('desc-plan');
          return {
            commandCells: ['cmd-settings', 'cmd-setup', 'cmd-plan', 'cmd-version'].filter(panel),
            described: ['desc-settings', 'desc-setup', 'desc-plan', 'desc-version'].filter(panel).length,
            echoedHeading: panels.some(item => /Docker Compose/.test(item.textContent)),
            leftoverMarkers: panels.filter(item => /⟦\d+⟧/.test(item.textContent)).length,
            failed,
            planCode: [...(plan?.querySelectorAll('code') || [])].map(code => code.textContent),
            planHtml: plan?.innerHTML.slice(0, 300) || '',
          };
        });
        assert.equal(verdict.failed, 0, `有 ${verdict.failed} 段翻译失败`);
        assert.deepEqual(verdict.commandCells, [], `命令格出现了译文：${verdict.commandCells.join(', ')}`);
        assert.equal(verdict.described, 4, '说明列应全部有译文');
        assert.equal(verdict.echoedHeading, false, '原样返回的标题不应再显示一遍');
        assert.equal(verdict.leftoverMarkers, 0, '译文里残留了 ⟦n⟧ 占位');
        assert.deepEqual(verdict.planCode, ['plan.enabled'], `说明句里的行内代码没有原样放回：${verdict.planHtml}`);
        return `说明 ${verdict.described} 格有译文，命令格 0 处，行内代码 ${verdict.planCode.join(', ')}`;
      } finally { await page.close().catch(() => {}); }
    });
  } finally { await run.close(); }
}

// ---- 假 OpenAI 服务（只回整页翻译所需的最小形态） ----
let mockServer = null;
function startMockApi() {
  if (mockServer) return Promise.resolve(mockServer.address().port);
  return new Promise(resolve => {
    mockServer = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') { res.writeHead(204, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}).end(); return; }
      if (req.url.endsWith('/models')) {
        res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
        res.end(JSON.stringify({data: [{id: 'audit-model'}]})); return;
      }
      let raw = ''; req.on('data', c => raw += c);
      req.on('end', () => {
        try {
          const body = JSON.parse(raw || '{}');
          const items = body?.messages?.at(-1)?.content;
          let list = [];
          try { const p = JSON.parse(items); if (Array.isArray(p.items)) list = p.items; } catch {}
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          // 像真模型一样：专名标题原样抄回；行内代码占位 ⟦n⟧ 照抄进译文。
          const translate = text => /Docker Compose/.test(text) ? text : '译文占位句' + ((text.match(/⟦\d+⟧/g) || []).map(marker => '，需要 ' + marker).join('')) + '。';
          res.end(JSON.stringify({choices: [{message: {content: JSON.stringify({items: list.map(i => ({id: i.id, translation: translate(String(i.text || ''))}))})}, finish_reason: 'stop'}]}));
        } catch (e) { res.writeHead(500).end(String(e)); }
      });
    });
    mockServer.listen(0, '127.0.0.1', () => resolve(mockServer.address().port));
  });
}

// ---- --live 真站复核 ----
const CODE_PARENT_SEL = 'pre,code,table.diff-table,td.blob-code,.react-code-lines,[role="tree"],.comhead,.subtext,shreddit-ad-post,.s-user-card,.byline';
const CODE_LIKE_RE = /^\s*(const|let|var|function|def|import|#include|return)\b|[;{}]\s*$/;
const liveSites = [
  {slug: 'github-readme', url: 'https://github.com/microsoft/vscode', contentPage: true},
  {slug: 'github-issue', url: 'https://github.com/microsoft/vscode/issues/93814', contentPage: true},
  {slug: 'github-pr', url: 'https://github.com/nodejs/node/pull/22712', contentPage: true},
  {slug: 'github-pr-files', url: 'https://github.com/nodejs/node/pull/22712/files'},
  {slug: 'github-code', url: 'https://github.com/nodejs/node/blob/main/lib/fs.js'},
  {slug: 'github-markdown-blob', url: 'https://github.com/nodejs/node/blob/main/README.md', contentPage: true},
  {slug: 'github-discussion', url: 'https://github.com/orgs/community/discussions/203416', contentPage: true},
  {slug: 'reddit-sub', url: 'https://www.reddit.com/r/programming/'},
  {slug: 'hn-front', url: 'https://news.ycombinator.com/'},
  {slug: 'hn-item', url: 'https://news.ycombinator.com/item?id=49848269', contentPage: true},
  {slug: 'so-question', url: 'https://stackoverflow.com/questions/11227809', contentPage: true},
  {slug: 'discourse-topic', url: 'https://discuss.python.org/t/notes-from-python-packaging-councils-first-meeting/109203', contentPage: true},
  {slug: 'devto-article', url: 'https://dev.to/devteam/join-the-kaggle-benchmarking-challenge-2500-in-prizes-for-five-winners-18ml', contentPage: true},
  {slug: 'lobsters-story', url: 'https://lobste.rs/s/68n22g/lobsters_rename_vibecoding_llms', contentPage: true},
  {slug: 'npm-package', url: 'https://www.npmjs.com/package/react', contentPage: true},
  {slug: 'mdn-guide', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', contentPage: true},
  {slug: 'arxiv-abs', url: 'https://arxiv.org/abs/1706.03762', contentPage: true},
  {slug: 'docs-rs', url: 'https://docs.rs/serde/latest/serde/', contentPage: true},
  {slug: 'readthedocs', url: 'https://requests.readthedocs.io/en/latest/', contentPage: true}
];
async function runLive() {
  const {run, extPage} = await openSession();
  try {
    for (const site of liveSites) {
      await check(`live ${site.slug}`, async () => {
        const {page, tabId} = await probeTab(run, extPage, site.url);
        try {
          await page.evaluate(() => scrollTo(0, document.body?.scrollHeight || 1e6)).catch(() => {});
          await sleep(1200);
          await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
          const title = await page.title().catch(() => '');
          const sample = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || '').catch(() => '');
          const url = await page.url();
          if (BLOCKED_RE.test(title) || BLOCKED_RE.test(sample) || BLOCKED_RE.test(url)) return `SKIP 墙/登录页 (${url})`;
            let inspect = await inspectTab(extPage, tabId);
            if (!inspect) { await sleep(3000); inspect = await inspectTab(extPage, tabId); }
            assert.ok(inspect, 'inspect() 无结果');
            const problem = [];
            if (site.contentPage) {
              if (!inspect.root) problem.push('root 为空');
              if ((inspect.blockCount || 0) < 3) problem.push(`blockCount=${inspect.blockCount}<3`);
            }
            const codeLike = (inspect.blocks || []).filter(b => CODE_LIKE_RE.test(b.text || ''));
            if (codeLike.length > 2) problem.push(`疑似代码块 ${codeLike.length} 个`);
            // 单元/块 containment：unit.path/block.path 首段即父元素，祖先链在 ' > ' 后；
            // 任一段命中 CODE_PARENT_SEL 的子选择器即视为落入 skip 区。
            const segMatch = (seg, sel) => {
              const m = sel.match(/^[a-zA-Z][\w-]*/), tag = m ? m[0].toLowerCase() : '';
              if (tag && !(seg === tag || seg.startsWith(tag + '#') || seg.startsWith(tag + '.') || seg.startsWith(tag + '['))) return false;
              for (const id of sel.match(/#([\w-]+)/g) || []) if (!seg.includes(id)) return false;
              for (const cls of sel.match(/\.([\w-]+)/g) || []) if (!seg.includes(cls)) return false;
              for (const attr of sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
                if (!seg.includes('[' + attr[1] + (attr[2] ? '=' + attr[2] : ''))) return false;
              }
              return Boolean(tag || (sel.match(/[#.[\\]]/) || [])[0]);
            };
            const inSkip = path => (path || '').split(' > ').some(seg => CODE_PARENT_SEL.split(',').some(sel => segMatch(seg, sel)));
            const badBlocks = (inspect.blocks || []).filter(b => inSkip(b.path));
            const badUnits = (inspect.units || []).filter(u => inSkip(u.path));
            if (badBlocks.length) problem.push(`skip 区阅读块:${badBlocks[0].path}`);
            if (badUnits.length) problem.push(`skip 区单元:${badUnits[0].path} :: ${(badUnits[0].text || '').slice(0, 40)}`);
            assert.equal(problem.length, 0, problem.join(' | '));
            return `root=${inspect.root} blocks=${inspect.blockCount} units=${JSON.stringify(inspect.unitsByZone)}`;
          } finally { await page.close().catch(() => {}); }
        });
      }
    } finally { await run.close(); }
}

if (!LIVE) await runFixtures();
else await runLive();
if (mockServer) mockServer.close();
fs.mkdirSync(previewPath('sites'), {recursive: true});
fs.writeFileSync(previewPath('sites', 'verify-dev-sites.json'), JSON.stringify(report, null, 2));
if (report.failures.length) process.exitCode = 1;
console.log(JSON.stringify({passed: report.checks.length, failures: report.failures}, null, 2));
printGateSummary('sites', report.checks.length, report.failures.length);
