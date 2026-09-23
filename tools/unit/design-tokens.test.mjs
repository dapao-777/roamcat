/**
 * @file tools/unit/design-tokens.test.mjs
 * 文件职责：设计 token 单一事实源测试——tokens.css 段提取、design.js 生成物与源树
 *   同步（防漂移）、生成文件的功能行为（cssFor 的 :host 主题变体与别名解析）。
 * 主要内容：extractTokenSections 去重/冲突/占位符防护；vm 沙箱执行生成文件断言
 *   RoamCatDesign.cssFor 输出包含 --rc-*、别名与 :host 主题变体。
 * 模块边界：node:test + node:vm，不启动浏览器；design.js 以 classic 方式求值。
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
import vm from 'node:vm';
import {buildDesignJs, extractTokenSections} from '../../build/gen-design-tokens.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tokensCss = readFileSync(path.join(repoRoot, 'src', 'styles', 'tokens.css'), 'utf8');

test('extractTokenSections 提取三段且仅含声明', () => {
  const {common, light, dark} = extractTokenSections(tokensCss);
  for (const section of [common, light, dark]) {
    assert.match(section, /--rc-/u);
    assert.ok(!section.includes('{'), '提取结果不应包含选择器包装');
  }
  assert.match(light, /color-scheme: light;/u);
  assert.match(dark, /color-scheme: dark;/u);
  assert.match(common, /--rc-spring-soft: linear/u);
});

test('extractTokenSections 拒绝冲突同名声明', () => {
  const bad = '/* >>> design-tokens:common */\n:root {\n  --a: 1;\n}\n/* >>> design-tokens:light */\n:root {\n  --a: 1;\n}\n:root[data-theme="light"] {\n  --a: 2;\n}\n/* >>> design-tokens:dark */\n:root {\n  --a: 1;\n}\n/* >>> design-tokens:end */';
  assert.throws(() => extractTokenSections(bad), /冲突取值/u);
});

test('extractTokenSections 拒绝模板占位符', () => {
  const bad = '/* >>> design-tokens:common */\n:root {\n  --a: `x`;\n}\n/* >>> design-tokens:light */\n:root {\n  --a: 1;\n}\n/* >>> design-tokens:dark */\n:root {\n  --a: 1;\n}\n/* >>> design-tokens:end */';
  assert.throws(() => extractTokenSections(bad), /占位符/u);
});

test('design.js 与 tokens.css 同步（无漂移）', () => {
  const committed = readFileSync(path.join(repoRoot, 'roamcat-0.2.0', 'extension', 'design.js'), 'utf8');
  assert.equal(committed, buildDesignJs(tokensCss), 'extension/design.js 与 src/tokens.css 不同步——请运行 npm run gen:tokens');
});

test('生成的 design.js 暴露完整 RoamCatDesign API', () => {
  const sandbox = {
    document: {currentScript: {hasAttribute: () => false}},
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(buildDesignJs(tokensCss), sandbox);
  const design = sandbox.RoamCatDesign;
  assert.ok(design?.cssFor, 'RoamCatDesign.cssFor 缺失');
  assert.ok(design.structureRoles && design.structureColors);

  const hostCss = design.cssFor(':host');
  assert.match(hostCss, /--rc-canvas: #efeee6/u, 'light 值缺失');
  assert.match(hostCss, /:host\(\[data-theme="dark"\]\)/u, ':host 主题变体缺失');
  assert.match(hostCss, /--paper: var\(--rc-paper\)/u, '旧名别名缺失');
  assert.match(hostCss, /--color-card-bg: var\(--rc-card-bg\)/u, '--color-* 别名缺失');
  assert.match(hostCss, /--rc-spring-soft: linear/u, '动效 token 缺失');

  const pageCss = design.cssFor('.roamcat-card', 'dark');
  assert.match(pageCss, /\.roamcat-card \{[\s\S]*--rc-canvas: #121316/u, 'dark 主题选择器错误');
});
