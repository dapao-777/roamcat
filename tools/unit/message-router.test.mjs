/**
 * @file tools/unit/message-router.test.mjs
 * 文件职责：为后台消息路由与协议模块提供 node:test 单元测试——用可静态执行的断言替代浏览器审计，
 *   保证注册表完整性、重复注册防护、未知消息确定性与载荷解析规则不被单边改动破坏。
 * 主要内容：createMessageRouter 的构造期校验与派发语义（parse 先于 handle、上下文传递、异步等待）；
 *   message-protocol.js 的 MESSAGE_TYPES/CONTENT_ALLOWED_TYPES 不变量与三个载荷解析器；
 *   以及一项源码契约测试：直接读取 background.js 注册表文本，断言其类型集合与协议清单逐一对应。
 * 模块边界：只 import 被测纯模块并读取 background.js 源码文本，不启动浏览器、不 import background.js
 *   （其模块顶层依赖 chrome）；运行方式为在仓库根执行 node:test 自动发现本目录全部 .test.mjs。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createMessageRouter} from '../../roamcat-0.2.0/extension/message-router.js';
import {
  MESSAGE_TYPES,
  CONTENT_ALLOWED_TYPES,
  text,
  domain,
  parseDomainTest,
  parseFloatingPetPatch,
  parsePopupIntentTake,
} from '../../roamcat-0.2.0/extension/message-protocol.js';

const backgroundSource = readFileSync(fileURLToPath(new URL('../../roamcat-0.2.0/extension/background.js', import.meta.url)), 'utf8');

test('createMessageRouter 构造期拒绝重复类型与缺失 handle', () => {
  assert.throws(() => createMessageRouter([
    {type: 'STATE_GET', handle: () => 1},
    {type: 'STATE_GET', handle: () => 2},
  ]), /重复注册: STATE_GET/u);
  assert.throws(() => createMessageRouter([{type: 'STATE_GET'}]), /缺少 handle/u);
  assert.throws(() => createMessageRouter([{type: '', handle: () => 1}]), /缺少类型/u);
  assert.throws(() => createMessageRouter([{type: 'STATE_GET', handle: () => 1, parse: 'nope'}]), /parse 不是函数/u);
  assert.throws(() => createMessageRouter([]), /注册表为空/u);
});

test('createMessageRouter 派发时 parse 先于 handle 且替换 message', async () => {
  const seen = [];
  const router = createMessageRouter([{
    type: 'STATE_GET',
    parse: message => ({...message, parsed: true}),
    handle: async (message, context) => {
      seen.push({message, context});
      return {ok: true};
    },
  }]);
  const response = await router.dispatch({type: 'STATE_GET', raw: 1}, {sender: 's', trusted: true});
  assert.deepEqual(response, {ok: true});
  assert.equal(seen[0].message.parsed, true);
  assert.equal(seen[0].message.raw, 1);
  assert.deepEqual(seen[0].context, {sender: 's', trusted: true});
});

test('createMessageRouter 对未知消息抛出与旧 switch 一致的错误', async () => {
  const router = createMessageRouter([{type: 'STATE_GET', handle: () => 1}]);
  await assert.rejects(router.dispatch({type: 'NOT_A_TYPE'}, {}), /未知请求。/u);
  await assert.rejects(router.dispatch(undefined, {}), /未知请求。/u);
});

test('createMessageRouter 暴露类型清单与 has 查询', () => {
  const router = createMessageRouter([{type: 'STATE_GET', handle: () => 1}, {type: 'ANALYZE', handle: () => 2}]);
  assert.deepEqual([...router.types], ['STATE_GET', 'ANALYZE']);
  assert.equal(router.has('STATE_GET'), true);
  assert.equal(router.has('MISSING'), false);
});

test('MESSAGE_TYPES 是唯一且冻结的有序协议清单', () => {
  assert.equal(MESSAGE_TYPES.length, 71);
  assert.equal(new Set(MESSAGE_TYPES).size, 71);
  assert.ok(Object.isFrozen(MESSAGE_TYPES));
  for (const type of MESSAGE_TYPES) assert.match(type, /^[A-Z][A-Z0-9_]+$/u);
  // 关键消息必须存在：回归 switch 迁移时丢失任一类型都会被发现。
  for (const type of ['STATE_GET', 'STATE_PATCH', 'ASSIST', 'EMERGENCY_BEGIN', 'SUPPORT_BATCH', 'OPEN_OPTIONS']) {
    assert.ok(MESSAGE_TYPES.includes(type), '缺少消息类型 ' + type);
  }
});

test('CONTENT_ALLOWED_TYPES 是协议清单的子集且不含凭据邻域消息', () => {
  assert.ok(Object.isFrozen(CONTENT_ALLOWED_TYPES));
  assert.equal(new Set(CONTENT_ALLOWED_TYPES).size, CONTENT_ALLOWED_TYPES.length);
  for (const type of CONTENT_ALLOWED_TYPES) {
    assert.ok(MESSAGE_TYPES.includes(type), '白名单包含未注册类型 ' + type);
  }
  for (const type of ['API_MODELS_LIST', 'STATE_PATCH', 'DIAGNOSTICS_GET', 'HISTORY_EXPORT', 'SUBSCRIPTION_LOGIN']) {
    assert.ok(!CONTENT_ALLOWED_TYPES.includes(type), '白名单不应包含 ' + type);
  }
  // WORD_PREFERENCE_SET 由 handle 内按条件放行，不在静态白名单里。
  assert.ok(!CONTENT_ALLOWED_TYPES.includes('WORD_PREFERENCE_SET'));
  assert.ok(MESSAGE_TYPES.includes('WORD_PREFERENCE_SET'));
});

test('text 与 domain 校验器保持原有错误语义', () => {
  assert.equal(text(' laten ', '译名', 10), 'laten');
  assert.throws(() => text('   ', '译名', 10), /译名不能为空/u);
  assert.throws(() => text('x'.repeat(11), '译名', 10), /不能超过 10/u);
  assert.equal(text('', '正文', 10, false), '');
  assert.equal(domain('tech'), 'tech');
  assert.throws(() => domain('nope'), /不支持的领域。/u);
});

test('parseDomainTest 提取正文与可选标题', () => {
  assert.deepEqual(parseDomainTest({text: ' A relational database. ', title: ' Docs '}), {text: 'A relational database.', title: 'Docs'});
  assert.deepEqual(parseDomainTest({text: 'body'}), {text: 'body', title: ''});
  assert.throws(() => parseDomainTest({}), /测试正文不能为空/u);
  assert.throws(() => parseDomainTest({text: 'x'.repeat(40001)}), /不能超过 40000/u);
  assert.throws(() => parseDomainTest({text: 'body', title: 42}), /标题/u);
});

test('parseFloatingPetPatch 要求位置与主题至少一项且位置形状合法', () => {
  assert.deepEqual(parseFloatingPetPatch({position: {right: 10, bottom: 20}}), {position: {right: 10, bottom: 20}});
  assert.deepEqual(parseFloatingPetPatch({themeMode: 'dark'}), {themeMode: 'dark'});
  assert.deepEqual(parseFloatingPetPatch({position: {right: 1, bottom: 2}, themeMode: 'light'}), {position: {right: 1, bottom: 2}, themeMode: 'light'});
  assert.throws(() => parseFloatingPetPatch({}), /伴读猫位置无效。/u);
  assert.throws(() => parseFloatingPetPatch({themeMode: 5}), /伴读猫位置无效。/u);
  assert.throws(() => parseFloatingPetPatch({position: {right: 1}}), /伴读猫位置无效。/u);
  assert.throws(() => parseFloatingPetPatch({position: {right: 1, bottom: 2, left: 3}}), /伴读猫位置无效。/u);
  assert.throws(() => parseFloatingPetPatch({position: [1, 2]}), /伴读猫位置无效。/u);
});

test('parsePopupIntentTake 校验标签页与网址', () => {
  assert.deepEqual(parsePopupIntentTake({tabId: 7, url: 'https://example.com/'}), {tabId: 7, url: 'https://example.com/'});
  assert.throws(() => parsePopupIntentTake({tabId: '7', url: 'https://example.com/'}), /快捷键操作无效。/u);
  assert.throws(() => parsePopupIntentTake({tabId: 7}), /快捷键操作无效。/u);
});

test('源码契约：background.js 注册表与协议清单逐一对应且无 switch 残留', () => {
  const registryStart = backgroundSource.indexOf('const messageHandlers=[');
  const registryEnd = backgroundSource.indexOf('const messageRouter=');
  assert.ok(registryStart >= 0 && registryEnd > registryStart, '注册表未找到');
  const registry = backgroundSource.slice(registryStart, registryEnd);
  const registered = [...registry.matchAll(/\{type:'([A-Z_]+)'/gu)].map(match => match[1]);
  assert.equal(registered.length, MESSAGE_TYPES.length, '注册表条目数量与协议清单不符');
  assert.deepEqual([...registered].sort(), [...MESSAGE_TYPES].sort(), '注册表与协议清单存在差集');
  assert.equal(new Set(registered).size, registered.length, '注册表存在重复类型');
  // 旧的分派结构必须已完全移除。
  assert.ok(!backgroundSource.includes('switch(message.type)'), 'background.js 仍残留 switch 分派');
  assert.ok(!backgroundSource.includes('contentAllowed'), 'background.js 仍残留旧白名单常量');
  // 每个条目都必须是 {type,handle} 形态（parse 可选）。
  for (const entry of registry.split(/\r?\n\s*\{type:'/u).slice(1)) {
    assert.match(entry, /^[A-Z_]+',(parse:parse[A-Za-z]+,)?handle:/u, '条目缺少 handle: ' + entry.slice(0, 40));
  }
  // 信任判定仍由背景统一执行：内容脚本白名单必须来自协议模块。
  assert.match(backgroundSource, /CONTENT_ALLOWED_TYPES\.includes\(message\.type\)/u);
});
