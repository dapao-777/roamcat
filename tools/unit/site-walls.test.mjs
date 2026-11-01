/**
 * @file tools/unit/site-walls.test.mjs
 * 文件职责：为 tools/lib/site-walls.mjs 的墙页识别提供 node:test 单元测试——真站复核遇到验证页、限流页要记 SKIP，
 *   正常页面不能被误判成墙。
 * 主要内容：英文与中文系统上的 Cloudflare 验证页、Hacker News 限流页、登录墙地址都命中；真站档案里常见的正文
 *   （文章、文档、代码讨论，包括讲 captcha 之外的普通英文）不命中。
 * 模块边界：只 import 被测模块；纯函数，无浏览器依赖。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isBlockedPage} from '../lib/site-walls.mjs';

test('英文与中文系统上的 Cloudflare 验证页都识别为墙', () => {
  assert.equal(isBlockedPage({title: 'Just a moment...', sample: 'Verify you are human by completing the action below.'}), true);
  // 中文系统实测：标题「请稍候…」，正文「正在进行安全验证」。此前只认英文，这两个站被记成失败。
  assert.equal(isBlockedPage({title: '请稍候…', sample: 'stackoverflow.com 正在进行安全验证 此网站使用安全服务来防范恶意自动程序。'}), true);
  assert.equal(isBlockedPage({title: 'www.npmjs.com', sample: '验证您是真人 需要先检查您的连接是否安全'}), true);
  assert.equal(isBlockedPage({title: 'x', sample: '确认您是真人'}), true);
  assert.equal(isBlockedPage({title: 'Attention Required', sample: 'Please complete the captcha'}), true);
});

test('Hacker News 限流页、拒绝访问页与登录墙地址识别为墙', () => {
  assert.equal(isBlockedPage({title: '', sample: "Sorry, we're not able to serve your requests this quickly."}), true);
  assert.equal(isBlockedPage({title: 'Access Denied', sample: ''}), true);
  assert.equal(isBlockedPage({title: '', sample: '访问被拒绝'}), true);
  assert.equal(isBlockedPage({title: '', sample: '', url: 'https://www.instagram.com/accounts/login/?reason=1'}), true);
  assert.equal(isBlockedPage({title: 'Log in', sample: 'Welcome back', url: 'https://example.com/login'}), false, '普通登录页地址不算墙，只有被重定向来的 login/?reason= 才算');
});

test('真站正文不会被误判成墙', () => {
  assert.equal(isBlockedPage({title: 'Attention Is All You Need', sample: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.'}), false);
  assert.equal(isBlockedPage({title: 'Rate limiting in Express', sample: 'A rate limiter restricts how many requests a client may make.', url: 'https://example.com/docs'}), false);
  assert.equal(isBlockedPage({title: 'JavaScript Guide - MDN', sample: 'This Guide introduces you to JavaScript and gives an overview of the language.'}), false);
  assert.equal(isBlockedPage({}), false);
  assert.equal(isBlockedPage(), false);
});
