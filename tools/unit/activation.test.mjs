/**
 * @file tools/unit/activation.test.mjs
 * 文件职责：为领域层 extension/activation.js 的自动化策略纯函数提供 node:test 单元测试——
 *   SPEC 第 4.1 节声称这些函数「纯函数优先，可单测」，本文件把该承诺变为可执行断言。
 * 主要内容：pageOrigin 的协议与凭据约束、sitePattern 的完整 origin 要求、
 *   validateAutomation 的白名单/类型/唯一性/数量规则与默认值保持、validateVideo 的枚举与合并语义。
 * 模块边界：只 import 被测模块；被测模块无浏览器与 Node 依赖（由模块图 lint 的领域层规则保证）；
 *   运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_SCRIPT_ID,
  ALL_HOSTS,
  VIDEO_HOSTS,
  VIDEO_SUPPORT_ENABLED,
  pageOrigin,
  sitePattern,
  validateAutomation,
  validateVideo,
} from '../../roamcat-0.0.1/extension/activation.js';

test('常量导出保持稳定', () => {
  assert.equal(AUTO_SCRIPT_ID, 'ss-auto-start');
  assert.deepEqual(ALL_HOSTS, ['http://*/*', 'https://*/*']);
  assert.deepEqual(VIDEO_HOSTS, ['https://www.youtube.com/*', 'https://m.youtube.com/*']);
  assert.equal(VIDEO_SUPPORT_ENABLED, false);
});

test('pageOrigin 只接受无凭据的 HTTP(S) origin', () => {
  assert.equal(pageOrigin('https://example.com'), 'https://example.com');
  assert.equal(pageOrigin('http://example.com:8080/path?q=1'), 'http://example.com:8080');
  assert.equal(pageOrigin('https://user:pass@example.com'), null);
  assert.equal(pageOrigin('ftp://example.com'), null);
  assert.equal(pageOrigin('chrome-extension://abcdef'), null);
  assert.equal(pageOrigin('not a url'), null);
  assert.equal(pageOrigin(new URL('https://example.com/docs')), 'https://example.com');
});

test('sitePattern 要求完整 origin 且不吞掉路径', () => {
  assert.equal(sitePattern('https://example.com'), 'https://example.com/*');
  assert.equal(sitePattern('http://example.com:8080'), 'http://example.com:8080/*');
  assert.throws(() => sitePattern('https://example.com/'), /完整的 HTTP 或 HTTPS origin/u);
  assert.throws(() => sitePattern('example.com'), /完整的 HTTP 或 HTTPS origin/u);
  assert.throws(() => sitePattern('ftp://example.com'), /完整的 HTTP 或 HTTPS origin/u);
});

test('validateAutomation 执行白名单与类型校验', () => {
  const base = {allSites: false, sentenceGroupsAllSites: false, sites: [], videoSites: false};
  assert.throws(() => validateAutomation(null, base), /无效的自动开启设置。/u);
  assert.throws(() => validateAutomation([], base), /无效的自动开启设置。/u);
  assert.throws(() => validateAutomation({unknown: true}, base), /未知的自动开启设置。/u);
  assert.throws(() => validateAutomation({allSites: 'yes'}, base), /无效的全部网站设置。/u);
  assert.throws(() => validateAutomation({videoSites: 1}, base), /无效的视频网站设置。/u);
  assert.throws(() => validateAutomation({sentenceGroupsAllSites: 'yes'}, base), /无效的全部网站阅读解构设置。/u);
  assert.deepEqual(validateAutomation({allSites: true}, base), {...base, allSites: true});
  assert.deepEqual(validateAutomation({sentenceGroupsAllSites: true}, base), {...base, sentenceGroupsAllSites: true});
});

test('validateAutomation 的站点规则要求唯一完整 origin 与布尔开关', () => {
  const base = {allSites: false, sentenceGroupsAllSites: false, sites: [], videoSites: false};
  assert.deepEqual(validateAutomation({sites: [{origin: 'https://a.com', enabled: true}]}, base).sites, [{origin: 'https://a.com', enabled: true}]);
  assert.throws(() => validateAutomation({sites: 'nope'}, base), /无效的站点规则。/u);
  assert.throws(() => validateAutomation({sites: Array.from({length: 501}, () => ({origin: 'https://a.com', enabled: true}))}, base), /无效的站点规则。/u);
  assert.throws(() => validateAutomation({sites: [{origin: 'a.com', enabled: true}]}, base), /站点规则必须使用唯一且完整的/u);
  assert.throws(() => validateAutomation({sites: [{origin: 'https://a.com/', enabled: true}]}, base), /站点规则必须使用唯一且完整的/u);
  // 端口是 origin 的合法组成部分（pageOrigin 保留端口），区别于域名规则的禁端口约束。
  assert.deepEqual(validateAutomation({sites: [{origin: 'https://a.com:8443', enabled: true}]}, base).sites, [{origin: 'https://a.com:8443', enabled: true}]);
  assert.throws(() => validateAutomation({sites: [{origin: 'https://a.com', enabled: 'yes'}]}, base), /站点规则必须使用唯一且完整的/u);
  assert.throws(() => validateAutomation({sites: [{origin: 'https://a.com', enabled: true}, {origin: 'https://a.com', enabled: false}]}, base), /站点规则必须使用唯一且完整的/u);
  assert.throws(() => validateAutomation({sites: [{origin: 'https://a.com', enabled: true, extra: 1}]}, base), /无效的站点规则。/u);
});

test('validateVideo 校验枚举并合并当前值', () => {
  const base = {fontSize: 20, theme: 'auto'};
  assert.throws(() => validateVideo(null, base), /无效的视频设置。/u);
  assert.throws(() => validateVideo({unknown: 1}, base), /未知的视频设置。/u);
  for (const size of [16, 20, 24, 28]) assert.deepEqual(validateVideo({fontSize: size}, base), {...base, fontSize: size});
  assert.throws(() => validateVideo({fontSize: 18}, base), /无效的字幕字号。/u);
  for (const theme of ['auto', 'light', 'dark']) assert.deepEqual(validateVideo({theme}, base), {...base, theme});
  assert.throws(() => validateVideo({theme: 'solar'}, base), /无效的字幕主题。/u);
  // 未提供的键保持当前值，而不是回落到默认值。
  assert.deepEqual(validateVideo({theme: 'dark'}, {fontSize: 28, theme: 'light'}), {fontSize: 28, theme: 'dark'});
});
