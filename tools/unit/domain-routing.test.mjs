/**
 * @file tools/unit/domain-routing.test.mjs
 * 文件职责：内置领域规则的路径范围——文档站命中 tech，GitHub/Reddit 等用户生成站点
 *   整站不预设领域。
 * 主要内容：文档路径命中、包页与问答路径命中、UGC 宿主拒绝、子域名开关、
 *   手动领域与用户规则优先于内置规则。
 * 模块边界：直接 import domain-routing.js，不启动浏览器。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRuleDomain} from '../../roamcat-0.0.1/extension/domain-routing.js';

const auto = {domain: 'auto', domainRules: []};
const rule = (href, settings = auto, pageDomain = 'auto') => resolveRuleDomain(new URL(href), settings, pageDomain);

test('文档站按路径归入 tech，用户生成站点整站不预设', () => {
  const tech = [
    'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster',
    'https://www.npmjs.com/package/left-pad',
    'https://docs.rs/serde/latest/serde/',
    'https://pkg.go.dev/net/http',
    'https://doc.rust-lang.org/std/vec/struct.Vec.html',
    'https://crates.io/crates/serde',
    'https://developer.chrome.com/docs/extensions/mv3/',
    'https://react.dev/reference/react',
    'https://react.dev/learn',
    'https://nodejs.org/api/fs.html',
    'https://nodejs.org/docs/latest/api/fs.html',
    'https://www.typescriptlang.org/docs/handbook/intro.html',
    'https://kubernetes.io/docs/concepts/overview/',
    'https://docs.gitlab.com/ee/ci/',
    'https://huggingface.co/docs/transformers',
    'https://requests.readthedocs.io/en/latest/',
    'https://developer.mozilla.org/en-US/docs/Web/API',
    'https://docs.github.com/en/rest'
  ];
  for (const href of tech) {
    const result = rule(href);
    assert.equal(result?.domain, 'tech', href);
    assert.equal(result?.source, 'site-built-in', href);
  }
  const untouched = [
    'https://github.com/microsoft/vscode',
    'https://github.com/microsoft/vscode/issues/1',
    'https://gist.github.com/abc',
    'https://www.reddit.com/r/programming/',
    'https://old.reddit.com/r/learnprogramming/comments/1/fixture/',
    'https://news.ycombinator.com/item?id=1',
    'https://stackoverflow.com/',
    'https://stackoverflow.com/users/1',
    'https://www.npmjs.com/',
    'https://react.dev/blog',
    'https://nodejs.org/',
    'https://huggingface.co/bert-base-uncased',
    'https://arxiv.org/abs/1706.03762',
    'https://gitlab.com/gitlab-org/gitlab/-/issues/1',
    'https://notreadthedocs.io/en/latest/',
    'https://readthedocs.io.evil.com/en/latest/'
  ];
  for (const href of untouched) assert.equal(rule(href), null, href);
});

test('手动领域和用户规则优先于内置文档站', () => {
  assert.deepEqual(rule('https://docs.rs/serde', auto, 'legal'), {domain: 'legal', source: 'manual'});
  const settings = {domain: 'auto', domainRules: [{host: 'docs.rs', pathPrefix: '/', includeSubdomains: false, domain: 'data'}]};
  assert.deepEqual(rule('https://docs.rs/serde/latest/serde/', settings), {domain: 'data', source: 'site-user'});
});
