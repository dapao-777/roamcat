/**
 * @file tools/unit/build-manifest.test.mjs
 * 文件职责：构建期 manifest 变换与扩展 ID 算法的单元测试。
 * 主要内容：transformManifest 的 dev/release 分支与不可变性；extensionIdFromKey
 *   输出格式；build/extension-key.json 中 key→id 的一致性回归。
 * 模块边界：node:test，只读 build/extension-key.json，不启动浏览器。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {extensionIdFromKey, transformManifest} from '../../build/manifest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const keyFile = JSON.parse(readFileSync(path.join(repoRoot, 'build', 'extension-key.json'), 'utf8'));

const sourceManifest = {
  manifest_version: 3,
  name: '__MSG_extName__',
  version: '0.0.1',
  minimum_chrome_version: '125',
};

test('extensionIdFromKey 输出 32 位 a-p 字符', () => {
  const id = extensionIdFromKey(keyFile.key);
  assert.equal(id.length, 32);
  assert.match(id, /^[a-p]{32}$/u);
});

test('extension-key.json 中 key 与 id 一致', () => {
  assert.equal(extensionIdFromKey(keyFile.key), keyFile.id);
});

test('transformManifest dev 模式注入 key', () => {
  const result = transformManifest(sourceManifest, {dev: true, key: keyFile.key});
  assert.equal(result.key, keyFile.key);
  assert.deepEqual({...result, key: undefined}, {...sourceManifest, key: undefined});
});

test('transformManifest release 模式不携带 key', () => {
  const result = transformManifest(sourceManifest, {dev: false, key: keyFile.key});
  assert.equal('key' in result, false);
  assert.deepEqual(result, sourceManifest);
});

test('transformManifest 不修改入参', () => {
  const input = {...sourceManifest};
  transformManifest(input, {dev: true, key: keyFile.key});
  assert.equal('key' in input, false);
});

test('transformManifest dev 缺 key 报错', () => {
  assert.throws(() => transformManifest(sourceManifest, {dev: true}), /manifest key/u);
});
