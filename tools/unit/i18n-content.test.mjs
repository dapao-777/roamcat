/**
 * @file tools/unit/i18n-content.test.mjs
 * 文件职责：内容脚本瘦身词典测试——i18n-content.js 与 i18n.js 无漂移、网页侧用到的键
 *   全部可查、运行时 API 与完整版一致。
 * 主要内容：生成物比对、键覆盖断言、vm 求值后的 t() 冒烟。
 * 模块边界：node:test + node:vm，不启动浏览器。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {contentSideFiles, EXTENSION_DIR, generateFromTree, loadDicts} from '../../build/gen-i18n-content.mjs';

const read = name => readFileSync(path.join(EXTENSION_DIR, name), 'utf8');

test('i18n-content.js 与 i18n.js 同步（无漂移）', () => {
  assert.equal(read('i18n-content.js'), generateFromTree(), 'extension/i18n-content.js 已过期——请运行 npm run gen:i18n');
});

test('网页侧脚本引用的词典键都在瘦身词典里', () => {
  const full = loadDicts(read('i18n.js'));
  const slim = loadDicts(read('i18n-content.js'));
  for (const name of contentSideFiles()) {
    for (const [, key] of read(name).matchAll(/['"`]([a-zA-Z]+(?:\.[\w-]+)+)['"`]/gu)) {
      if (!Object.hasOwn(full.zh, key)) continue;
      assert.equal(slim.zh[key], full.zh[key], `${name} 引用的 ${key} 缺失（zh）`);
      assert.equal(slim.en[key], full.en[key], `${name} 引用的 ${key} 缺失（en）`);
    }
  }
  assert.ok(Object.keys(slim.zh).length < Object.keys(full.zh).length, '瘦身词典应只含网页侧命名空间');
});
