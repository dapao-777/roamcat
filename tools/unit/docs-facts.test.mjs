/**
 * @file tools/unit/docs-facts.test.mjs
 * 文件职责：文档事实检查——README / 落地页 / llms.txt / SPEC / 设计文档里写到的数量、版本号、
 *   Node 要求和色值必须与代码一致，防止「文档写死的数字」再次漂移。
 * 主要内容：服务商数与协议数（api-providers.mjs）、消息总数与内容脚本白名单数（message-protocol.js）、
 *   SPEC §5.2 消息清单逐项对照、版本号（manifest.json / package.json）、Chrome 最低版本、
 *   Node 版本要求（package.json engines 与连接器安装器）、模块图规则数（module-graph.cjs）、
 *   README 与设计文档色板（tokens.css）。
 * 模块边界：node:test，只读文件，不启动浏览器；扩展里的纯函数模块经动态 import 取数，不改任何文件。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';
import {extractTokenSections} from '../../build/gen-design-tokens.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const extension = relative => import(pathToFileURL(path.join(root, 'roamcat-0.0.1', 'extension', relative)).href);

/** 对每个匹配断言捕获组等于期望值；返回匹配数，供「至少出现一次」的断言使用。 */
function expectEvery(file, text, pattern, expected, label, group = 1) {
  let count = 0;
  for (const match of text.matchAll(pattern)) {
    count += 1;
    assert.equal(Number(match[group]), expected, `${file}：${label}写的是 ${match[group]}（「${match[0]}」），代码里是 ${expected}`);
  }
  return count;
}

const PROVIDER_PATTERNS = [
  /(\d+)\s*家(?:自备\s*API|服务商)/g,
  /自备\s*API\s*×\s*(\d+)\s*家/g,
  /(\d+)\s+(?:bring-your-own(?:\s+API)?|BYOK(?:\s+(?:model|AI))?)\s+providers/gi,
  /BYOK\s*×\s*(\d+)\s*PROVIDERS/gi,
  /(\d+)\s+providers\s+across\s+\d+\s+protocols/gi,
];
const PROTOCOL_PATTERNS = [/(\d+)\s*种协议/g, /across\s+(\d+)\s+protocols/gi];
const MESSAGE_TOTAL_PATTERNS = [
  /(\d+)\s*种消息路由/g,
  /登记全部\s*(\d+)\s*种消息/g,
  /(\d+)\s+message\s+(?:routes|types)\b/gi,
  /(\d+)\s+internal\s+message\s+types\b/gi,
  /MESSAGE_TYPES`（(\d+) 种）/g,
  /消息分组（(\d+) 种/g,
];
const ALLOWED_PATTERNS = [
  /(\d+)\s*种白名单(?:消息|类型)/g,
  /(\d+)\s+whitelisted\s+message(?:s|\s+types)/gi,
  /(\d+)\s+of\s+\d+\s+internal\s+message\s+types\b/gi,
  /`contentAllowed`，(\d+) 种/g,
  /白名单\s*(\d+)\s*种消息/g,
];

test('机器翻译服务数与独立目录一致', async () => {
  const {MT_PROVIDERS} = await extension('mt-providers.mjs');
  for (const file of ['README.md','README.en.md','docs/index.html','docs/zh.html','docs/llms.txt','docs/llms-full.txt','roamcat-0.0.1/README.md','roamcat-0.0.1/MACHINE_TRANSLATION.md']) {
    assert.ok(expectEvery(file,read(file),/(\d+)\s*(?:种机器翻译服务|machine-translation services)/g,MT_PROVIDERS.length,'机器翻译服务数')>0,file+' 应列出机翻服务数');
  }
});

test('文档里的自备 API 服务商数与协议数和 API_PROVIDERS 一致', async () => {
  const {API_PROVIDERS} = await extension('api-providers.mjs');
  const providers = API_PROVIDERS.length;
  const protocols = new Set(API_PROVIDERS.map(provider => provider.protocol)).size;
  const mustMention = ['README.md', 'README.en.md', 'docs/index.html', 'docs/zh.html', 'docs/llms.txt', 'roamcat-0.0.1/README.md', 'roamcat-0.0.1/SPEC.md'];
  for (const file of mustMention) {
    const text = read(file);
    let mentions = 0;
    for (const pattern of PROVIDER_PATTERNS) mentions += expectEvery(file, text, pattern, providers, '服务商数');
    for (const pattern of PROTOCOL_PATTERNS) expectEvery(file, text, pattern, protocols, '协议数');
    assert.ok(mentions > 0, `${file} 应写明自备 API 服务商数（当前 ${providers}）；若改成不带数字的说法，请同步从这份清单里移除该文件`);
  }
});

test('文档里的消息总数与内容脚本白名单数和 message-protocol.js 一致', async () => {
  const {MESSAGE_TYPES, CONTENT_ALLOWED_TYPES} = await extension('message-protocol.js');
  const total = MESSAGE_TYPES.length;
  const allowed = CONTENT_ALLOWED_TYPES.length ?? CONTENT_ALLOWED_TYPES.size;
  const files = ['README.md', 'README.en.md', 'docs/index.html', 'docs/zh.html', 'docs/llms.txt', 'docs/llms-full.txt', 'roamcat-0.0.1/SPEC.md'];
  const mentions = new Map(files.map(file => [file, 0]));
  for (const file of files) {
    const text = read(file);
    let count = 0;
    for (const pattern of MESSAGE_TOTAL_PATTERNS) count += expectEvery(file, text, pattern, total, '消息总数');
    for (const pattern of ALLOWED_PATTERNS) count += expectEvery(file, text, pattern, allowed, '内容脚本白名单数');
    // 「N 种消息中的 M 种白名单」与「M whitelisted message types out of N」两种合写
    for (const match of text.matchAll(/(\d+)\s*种(?:内部)?消息中的\s*\**(\d+)\s*种(?:白名单)?/g)) {
      count += 1;
      assert.equal(Number(match[1]), total, `${file}：消息总数写的是 ${match[1]}，代码里是 ${total}`);
      assert.equal(Number(match[2]), allowed, `${file}：白名单数写的是 ${match[2]}，代码里是 ${allowed}`);
    }
    for (const match of text.matchAll(/(\d+)\s+whitelisted\s+message\s+types\**\s+out\s+of\s+(\d+)/gi)) {
      count += 1;
      assert.equal(Number(match[1]), allowed, `${file}：白名单数写的是 ${match[1]}，代码里是 ${allowed}`);
      assert.equal(Number(match[2]), total, `${file}：消息总数写的是 ${match[2]}，代码里是 ${total}`);
    }
    mentions.set(file, count);
  }
  for (const [file, count] of mentions) assert.ok(count > 0, `${file} 应写明消息数 / 白名单数；若改成不带数字的说法，请同步从这份清单里移除该文件`);
});

test('SPEC §5.2 的消息清单与 MESSAGE_TYPES 逐项一致', async () => {
  const {MESSAGE_TYPES} = await extension('message-protocol.js');
  const spec = read('roamcat-0.0.1/SPEC.md');
  const start = spec.indexOf('### 5.2');
  const end = spec.indexOf('### 5.3');
  assert.ok(start > 0 && end > start, '找不到 SPEC §5.2');
  const listed = new Set();
  let declared = 0;
  for (const line of spec.slice(start, end).split('\n')) {
    const match = line.match(/^\| .*?（(\d+)）\s*\|(.*)\|\s*$/u);
    if (!match) continue;
    const names = [...match[2].matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map(item => item[1]);
    assert.equal(names.length, Number(match[1]), `SPEC §5.2 分组声明 ${match[1]} 种，实际列了 ${names.length} 种：${line.slice(0, 40)}`);
    declared += Number(match[1]);
    for (const name of names) listed.add(name);
  }
  const all = new Set(MESSAGE_TYPES);
  assert.deepEqual([...all].filter(name => !listed.has(name)), [], 'MESSAGE_TYPES 里有消息没写进 SPEC §5.2');
  assert.deepEqual([...listed].filter(name => !all.has(name)), [], 'SPEC §5.2 里有消息已不在 MESSAGE_TYPES');
  assert.equal(declared, MESSAGE_TYPES.length, 'SPEC §5.2 各分组数量之和应等于消息总数');
});

test('文档里的版本号与 manifest.json / package.json 一致', () => {
  const version = JSON.parse(read('roamcat-0.0.1/extension/manifest.json')).version;
  assert.equal(JSON.parse(read('package.json')).version, version, 'package.json 与 manifest.json 版本不一致');
  const checks = [
    ['README.md', [/version-(\d+\.\d+\.\d+)-blue/g, /roamcat-(\d+\.\d+\.\d+)-extension\.zip/g, /^> \*\*(\d+\.\d+\.\d+)：/gm]],
    ['README.en.md', [/version-(\d+\.\d+\.\d+)-blue/g, /roamcat-(\d+\.\d+\.\d+)-extension\.zip/g, /^> \*\*(\d+\.\d+\.\d+) —/gm]],
    ['docs/index.html', [/"softwareVersion":\s*"(\d+\.\d+\.\d+)"/g, /margin-top:18px">(\d+\.\d+\.\d+) —/g]],
    ['docs/zh.html', [/margin-top:18px">(\d+\.\d+\.\d+)——/g]],
    ['docs/llms.txt', [/releases\): (\d+\.\d+\.\d+) extension package/g]],
    ['roamcat-0.0.1/CHROMEWEBSTORE.md', [/当前源码版本为 \*\*(\d+\.\d+\.\d+)\*\*/g, /当前版本 (\d+\.\d+\.\d+)；首次商店提交/g, /package\.json 版本均为 (\d+\.\d+\.\d+)/g]],
  ];
  for (const [file, patterns] of checks) {
    const text = read(file);
    let count = 0;
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        count += 1;
        assert.equal(match[1], version, `${file}：版本号写的是 ${match[1]}（「${match[0]}」），manifest.json 是 ${version}`);
      }
    }
    assert.ok(count > 0, `${file} 里没找到版本号；发版时它应写明当前版本 ${version}`);
  }
});

test('文档里的 Chrome / Edge 最低版本与 manifest 一致', () => {
  const minimum = Number(JSON.parse(read('roamcat-0.0.1/extension/manifest.json')).minimum_chrome_version);
  for (const file of ['README.md', 'README.en.md', 'docs/index.html', 'docs/zh.html', 'docs/llms.txt']) {
    const text = read(file);
    const count = expectEvery(file, text, /(?:Chrome|Edge)(?:\s*\/\s*Edge)?[^0-9\n]{0,6}(\d{3})\+/gi, minimum, 'Chrome / Edge 最低版本')
      + expectEvery(file, text, /Edge-(\d{3})%2B/g, minimum, 'Chrome / Edge 最低版本');
    assert.ok(count > 0, `${file} 应写明 Chrome / Edge ${minimum}+`);
  }
});

test('文档里的 Node 要求与 package.json engines 和连接器安装器一致', () => {
  const engine = JSON.parse(read('package.json')).engines.node.match(/(\d+)\.(\d+)/);
  const installer = read('roamcat-0.0.1/connector/install.mjs').match(/split\('\.'\)\[0\]\)\s*<\s*(\d+)/);
  assert.ok(installer, '找不到安装器里的 Node 主版本校验');
  const connectorMajor = Number(installer[1]);
  const docs = [
    'README.md', 'README.en.md', 'CONTRIBUTING.md', 'AGENTS.md', 'docs/index.html', 'docs/zh.html',
    'roamcat-0.0.1/README.md', 'roamcat-0.0.1/SPEC.md', 'roamcat-0.0.1/CHROMEWEBSTORE.md',
  ];
  for (const file of docs) {
    for (const match of read(file).matchAll(/Node(?:\.js)?\s*\**(\d+)\.(\d+)\+?/g)) {
      const [, major, minor] = match.map(Number);
      if (major === Number(engine[1])) assert.equal(minor, Number(engine[2]), `${file}：「${match[0]}」与 package.json engines（${engine[0]}）不一致`);
      if (major === connectorMajor) assert.fail(`${file}：「${match[0]}」——连接器只校验主版本 ≥ ${connectorMajor}，文档统一写「Node.js ${connectorMajor}+」`);
    }
  }
});

test('文档里的模块图规则范围与 module-graph.cjs 一致', () => {
  const ids = [...new Set([...read('tools/lib/module-graph.cjs').matchAll(/fail\('R(\d+)'/g)].map(match => Number(match[1])))].sort((a, b) => a - b);
  const last = ids.at(-1);
  assert.deepEqual(ids, Array.from({length: last}, (_, index) => index + 1), '模块图规则编号应从 R1 连续到最后一条');
  for (const file of ['README.md', 'README.en.md', 'CONTRIBUTING.md']) {
    assert.ok(expectEvery(file, read(file), /R1[–-]R(\d+)/g, last, '模块图规则范围') > 0, `${file} 应写明模块图规则范围 R1–R${last}`);
  }
  // AGENTS.md / SPEC 里还有「R1–R11 只扫…」「R1–R7 列在下表」这类合法的子范围，只核对总范围与总条数的说法
  expectEvery('AGENTS.md', read('AGENTS.md'), /模块图静态门禁（R1[–-]R(\d+)/g, last, '模块图规则范围');
  const spec = read('roamcat-0.0.1/SPEC.md');
  expectEvery('roamcat-0.0.1/SPEC.md', spec, /模块图规则 R1[–-]R(\d+)/g, last, '模块图规则范围');
  expectEvery('roamcat-0.0.1/SPEC.md', spec, /（(\d+) 条规则：/g, last, '模块图规则条数');
});

/** 把 tokens.css 的声明段解析成 {--name: value}；色值统一去空格、补前导 0，便于和文档比对。 */
const normalize = value => value.toLowerCase().replace(/\s+/g, '').replace(/(\D)\.(\d)/g, '$10.$2');
function declarations(section) {
  return Object.fromEntries([...section.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gi)].map(match => [match[1], normalize(match[2])]));
}

test('README 与设计文档里的色值和 tokens.css 一致', () => {
  const {light, dark} = extractTokenSections(read('src/styles/tokens.css'));
  const tokens = {light: declarations(light), dark: declarations(dark)};

  // README 设计规格表：画布 / 墨 / 强调（两个主题）
  for (const file of ['README.md', 'README.en.md']) {
    const text = read(file).toLowerCase();
    for (const theme of ['light', 'dark']) {
      for (const name of ['--rc-canvas', '--rc-ink', '--rc-accent']) {
        const value = tokens[theme][name];
        assert.ok(value && value.startsWith('#'), `tokens.css 的 ${theme} 段里没有 ${name} 的色值`);
        assert.ok(text.includes(value), `${file} 的设计规格里应写明 ${theme} 主题的 ${name} = ${value}`);
      }
    }
  }

  // 表格里「token 名 | 色值」的行：按顺序逐个比对；token 或色值数量不等时只比对前面能配上的
  const compareRows = (file, section, valueCells) => {
    let compared = 0;
    for (const line of section.split('\n')) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1);
      const names = [...(cells[0] ?? '').matchAll(/`(--rc-[a-z0-9-]+)`/g)].map(match => match[1]);
      if (!names.length) continue;
      for (const [theme, cellIndex] of valueCells) {
        const values = [...(cells[cellIndex] ?? '').matchAll(/`([^`]+)`/g)].map(match => normalize(match[1]));
        for (let index = 0; index < Math.min(names.length, values.length); index += 1) {
          const actual = tokens[theme][names[index]];
          if (!actual || actual.startsWith('var(')) continue;
          assert.equal(values[index], actual, `${file}：${theme} 主题的 ${names[index]} 写的是 ${values[index]}，tokens.css 是 ${actual}`);
          compared += 1;
        }
      }
    }
    assert.ok(compared > 0, `${file}：没有比对到任何色值，表格格式是否变了？`);
  };
  const between = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));
  const designSystem = read('roamcat-0.0.1/docs/design-system.md');
  compareRows('design-system.md §5', between(designSystem, '## 5. 色彩', '## 6. 动效'), [['light', 1], ['dark', 2]]);
  const brand = read('roamcat-0.0.1/docs/brand.md');
  compareRows('brand.md §3.2', between(brand, '### 3.2', '### 3.3'), [['light', 1]]);
  compareRows('brand.md §3.3', between(brand, '### 3.3', '### 3.4'), [['dark', 1]]);
});
