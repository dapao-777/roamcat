/**
 * @file tools/lib/module-graph.cjs
 * 文件职责：为零构建的 RoamCat 提供可执行的模块图检查——把 SPEC.md 第 3、12 节宣称的
 *   分层与信任边界从文档约束变成 CI 可跑的断言，覆盖 content script 加载契约、ESM import 图、
 *   循环依赖、连接器共享闭包纯净性与领域层依赖方向。
 * 主要内容：扫描 extension/（排除 local-inference、vendor、fonts、icons）与 connector/ 下的
 *   .js/.mjs；解析相对 import 规格并建图；随后执行六条规则：
 *   R1 manifest content script 三件套契约（顺序、存在、非 ESM）+ 动态注册脚本同约束；
 *   R2 相对 import 必须能解析到真实文件；
 *   R3 全图无循环依赖；
 *   R4 连接器 import 闭包内的 extension 文件必须属于共享协议集且自身可在 Node 中安全 import
 *      （动态 import 顶层不触碰 chrome/document 等浏览器 API）；
 *   R5 共享协议文件只允许互相 import；领域层文件必须 import 安全且只依赖领域层、共享协议与静态资源；
 *   R6 extension 不得反向 import connector；
 *   R6 extension 不得反向 import connector；
 *   R7 全部参检源文件必须以文件级长注释开头（含 @file；connector/host.mjs 允许首行 shebang，次行起为文件头）；
 *   R8 扩展页面无重复元素 ID；R9 扩展页面无内联脚本/事件属性（CSP）；R10 manifest 引用资源全部存在；
 *   R11 classic content script 通过 node --check 语法门禁（ESM 模块由 R4/R5 动态 import 覆盖）。
 * 模块边界：只读文件系统并在本进程动态 import 被测模块，不启动浏览器、不写文件、不依赖 npm 包；
 *   规则清单与 SPEC.md 第 12 节一一对应；新增或修改规则必须同步修订 SPEC。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// SPEC.md 第 4.1/15 节：扩展与本机连接器共享的协议层文件，连接器在 Node 中直接 import。
// 修改本清单必须同步 SPEC 与 connector 侧引用。
const SHARED_PROTOCOL = Object.freeze([
  'gloss.mjs',
  'sentence-groups.mjs',
  'assistance-stream.mjs',
  'personalization.mjs',
  'diagnostics.mjs',
]);

// SPEC.md 第 4.1 节：纯函数优先、可单测的领域层；禁止引用浏览器层模块。
const DOMAIN = Object.freeze([
  'reading.js',
  'lexicon.js',
  'domain-routing.js',
  'shared.js',
  'api-providers.mjs',
  'api-transport.mjs',
  'message-protocol.js',
  'message-router.js',
  'activation.js',
]);

// 领域层允许依赖的静态资源与全局注入文件（无浏览器 API 顶层副作用）。
const DOMAIN_ASSETS = Object.freeze([
  'reading-style.js',
  'frequency/english-frequency.js',
]);

const EXCLUDED_DIRECTORIES = new Set(['local-inference', 'vendor', 'fonts', 'icons']);
const CONTENT_SCRIPT_ORDER = Object.freeze(['design.js', 'reading-style.js', 'content-ui.js', 'content.js']);
// 不经 manifest 静态声明、但始终以 classic 方式注入的页面脚本：伴读猫经
// chrome.scripting 按 floatingPet.enabled 动态注册，auto-start.js 按站点规则注册。
const CLASSIC_DYNAMIC_SCRIPTS = Object.freeze(['floating-pet.js', 'auto-start.js']);
const ESM_PATTERN = /^[ \t]*(?:import|export)[\s({'"]/m;
const IMPORT_PATTERNS = [
  /import\s+[\s\S]*?\s+from\s*['"]([^'"]+)['"]/g,
  /import\s+['"]([^'"]+)['"]/g,
];

/** 收集参与检查的源文件：extension/ 全部 .js/.mjs（排除资源目录）与 connector/ 全部 .mjs。 */
function collectSourceFiles(root) {
  const files = [];
  const walk = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.startsWith('.')) continue;
      const child = path.join(directory, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (relative === '' && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        walk(child, childRelative);
        continue;
      }
      if (!entry.isFile() || !/\.(?:js|mjs)$/u.test(entry.name)) continue;
      files.push({absolute: child, relative: childRelative});
    }
  };
  walk(path.join(root, 'extension'), '');
  walk(path.join(root, 'connector'), '');
  return files;
}

function parseImportSpecifiers(source) {
  const specifiers = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

function isEsm(source) {
  return ESM_PATTERN.test(source);
}

function resolveSpecifier(fromFile, specifier, known) {
  if (!specifier.startsWith('.')) return {kind: 'external', specifier};
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, path.join(base, 'index.js')]) {
    if (known.has(candidate)) return {kind: 'internal', absolute: candidate};
  }
  return {kind: 'unresolved', specifier, absolute: base};
}

function readGraph(root, files) {
  const known = new Set(files.map(file => file.absolute));
  const nodes = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file.absolute, 'utf8');
    const esm = isEsm(source);
    const edges = [];
    const unresolved = [];
    for (const specifier of parseImportSpecifiers(source)) {
      const resolved = resolveSpecifier(file.absolute, specifier, known);
      if (resolved.kind === 'internal') edges.push(resolved.absolute);
      else if (resolved.kind === 'unresolved') unresolved.push(specifier);
    }
    nodes.set(file.absolute, {file, esm, source, edges, unresolved});
  }
  return nodes;
}

/** 在本进程动态 import 每个 ESM 文件：顶层触碰 chrome/document 等浏览器 API 的模块会抛出，记为 import 不安全。 */
async function classifyImportSafety(nodes) {
  const unsafe = new Map();
  for (const node of nodes.values()) {
    if (!node.esm) continue;
    try {
      await import(`file://${node.file.absolute.replace(/\\/gu, '/')}`);
    } catch (error) {
      unsafe.set(node.file.absolute, String(error?.message || error).slice(0, 160));
    }
  }
  return unsafe;
}

function findCycles(nodes) {
  const cycles = [];
  const state = new Map();
  const stack = [];
  const visit = (absolute) => {
    const status = state.get(absolute);
    if (status === 'done') return;
    if (status === 'active') {
      const at = stack.indexOf(absolute);
      cycles.push([...stack.slice(at), absolute].map(file => path.basename(file)).join(' → '));
      return;
    }
    state.set(absolute, 'active');
    stack.push(absolute);
    for (const edge of nodes.get(absolute)?.edges || []) visit(edge);
    stack.pop();
    state.set(absolute, 'done');
  };
  for (const absolute of nodes.keys()) visit(absolute);
  return cycles;
}

function relativeExtensionPath(root, absolute) {
  return path.relative(path.join(root, 'extension'), absolute).replace(/\\/gu, '/');
}

/** 从 connector 全部入口出发，沿 import 边遍历，收集到达的 extension 文件。 */
function connectorClosure(root, nodes) {
  const reached = new Set();
  const queue = [];
  const connectorDirectory = path.join(root, 'connector');
  for (const absolute of nodes.keys()) {
    if (path.dirname(absolute) === connectorDirectory && path.extname(absolute) === '.mjs') queue.push(absolute);
  }
  const extensionRoot = path.join(root, 'extension');
  while (queue.length) {
    const current = queue.shift();
    for (const edge of nodes.get(current)?.edges || []) {
      if (reached.has(edge)) continue;
      reached.add(edge);
      queue.push(edge);
      if (edge.startsWith(`${extensionRoot}${path.sep}`)) reached.add(edge);
    }
  }
  return [...reached].filter(absolute => absolute.startsWith(`${extensionRoot}${path.sep}`));
}

/**
 * 执行全部模块图规则。
 * @param {{root:string}} options root 为包含 extension/ 与 connector/ 的项目目录。
 * @returns {Promise<{failures:Array<{rule:string,message:string}>,stats:object}>}
 */
async function verifyModuleGraph({root}) {
  const failures = [];
  const fail = (rule, message) => failures.push({rule, message});
  const files = collectSourceFiles(root);
  const nodes = readGraph(root, files);
  const unsafe = await classifyImportSafety(nodes);
  const byRelative = new Map(files.map(file => [file.relative, nodes.get(file.absolute)]));

  // R1：manifest content script 三件套契约——顺序固定、文件存在、且必须是 classic script；
  // 动态注册的页面脚本（伴读猫、自动启动）同样禁止 ESM。
  const manifestPath = path.join(root, 'extension', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const declared = manifest.content_scripts?.[0]?.js || [];
  if (JSON.stringify(declared) !== JSON.stringify([...CONTENT_SCRIPT_ORDER])) {
    fail('R1', `manifest content_scripts 顺序或成员必须固定为 ${CONTENT_SCRIPT_ORDER.join(' → ')}，当前为 ${declared.join(' → ') || '(空)'}`);
  }
  for (const name of [...CONTENT_SCRIPT_ORDER, ...CLASSIC_DYNAMIC_SCRIPTS]) {
    const entry = byRelative.get(name);
    if (!entry) { fail('R1', `classic content script 不存在: ${name}`); continue; }
    if (isEsm(entry.source)) fail('R1', `content script 不允许包含 ESM 语法（manifest/动态注册均未声明 type:module）: ${name}`);
  }

  // R2：相对 import 必须解析到真实文件。
  for (const node of nodes.values()) {
    for (const specifier of node.unresolved) {
      fail('R2', `${node.file.relative} 的 import '${specifier}' 解析不到真实文件`);
    }
  }

  // R3：全图无循环依赖。
  for (const cycle of findCycles(nodes)) fail('R3', `存在循环依赖: ${cycle}`);

  // R4：连接器闭包内的 extension 文件必须属于共享协议集，且 import 安全。
  const closure = connectorClosure(root, nodes);
  for (const absolute of closure) {
    const relative = relativeExtensionPath(root, absolute);
    if (!SHARED_PROTOCOL.includes(relative)) {
      fail('R4', `连接器 import 了共享协议集之外的 extension 文件: ${relative}；`
        + `如需新增共享文件，必须同步 tools/lib/module-graph.cjs、SPEC.md 第 4.1/15 节与 connector 引用`);
    }
    if (unsafe.has(absolute)) fail('R4', `连接器闭包内的 ${relative} 无法在 Node 中安全 import: ${unsafe.get(absolute)}`);
  }

  // R5：共享协议只许互相引用；领域层必须 import 安全且只依赖领域层、共享协议与静态资源。
  const sharedSet = new Set(SHARED_PROTOCOL);
  for (const node of nodes.values()) {
    const relative = path.relative(root, node.file.absolute).replace(/\\/gu, '/').replace(/^extension\//u, '');
    if (!sharedSet.has(relative)) continue;
    for (const edge of node.edges) {
      const target = relativeExtensionPath(root, edge);
      if (!sharedSet.has(target)) fail('R5', `共享协议文件 ${relative} 不允许 import ${target}`);
    }
  }
  const domainSet = new Set(DOMAIN);
  const assetSet = new Set(DOMAIN_ASSETS);
  for (const name of DOMAIN) {
    const node = byRelative.get(name);
    if (!node) { fail('R5', `领域层清单中的文件不存在: ${name}`); continue; }
    if (unsafe.has(node.absolute)) fail('R5', `领域层文件 ${name} 无法在 Node 中安全 import: ${unsafe.get(node.absolute)}`);
    for (const edge of node.edges) {
      const target = relativeExtensionPath(root, edge);
      if (!domainSet.has(target) && !assetSet.has(target) && !sharedSet.has(target)) {
        fail('R5', `领域层文件 ${name} 不允许 import 非领域依赖 ${target}`);
      }
    }
  }

  // R6：extension 不得反向依赖 connector。
  for (const node of nodes.values()) {
    if (!node.file.absolute.startsWith(`${path.join(root, 'extension')}${path.sep}`)) continue;
    for (const edge of node.edges) {
      if (edge.startsWith(`${path.join(root, 'connector')}${path.sep}`)) {
        fail('R6', `extension 文件 ${node.file.relative} 不允许 import connector 文件`);
      }
    }
  }

  // R8–R10：扩展页面静态契约（SPEC 第 12 节声称的静态检查，在此落地为可执行门禁）。
  // 页面源已迁至 src/ui/，dist 产物由 Vite 生成；extension/ui/ 下不再保留页面源文件。
  const extensionPages = ['ui/popup.html', 'ui/options.html', 'ui/welcome.html'];
  const synthesizedPages = new Map(extensionPages.map(page => [page, path.join(root, '..', 'src', page)]));
  for (const page of extensionPages) {
    const html = fs.readFileSync(synthesizedPages.get(page), 'utf8');
    // R8：重复元素 ID 会让 getElementById 行为不确定。
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    const duplicated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicated.length) fail('R8', `${page} 存在重复元素 ID: ${duplicated.join(', ')}`);
    // R9：CSP script-src 'self' 禁止内联脚本与事件属性。
    const withoutComments = html.replace(/<!--[\s\S]*?-->/gu, '');
    if (/<script(?![^>]*\bsrc=)[^>]*>/iu.test(withoutComments)) fail('R9', `${page} 存在内联 <script>（违反 CSP）`);
    if (/\son[a-z]+\s*=/iu.test(withoutComments)) fail('R9', `${page} 存在内联事件属性（违反 CSP）`);
  }
  // R10：manifest 引用的脚本、样式、图标与可访问资源必须存在。
  const manifestResources = [
    ...(manifest.content_scripts || []).flatMap(entry => [...(entry.js || []), ...(entry.css || [])]),
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...(manifest.web_accessible_resources || []).flatMap(entry => entry.resources || []),
  ].filter(Boolean);
  for (const resource of manifestResources) {
    const candidate = synthesizedPages.get(resource) ?? path.join(root, 'extension', resource);
    if (!fs.existsSync(candidate)) fail('R10', `manifest 引用的资源不存在: ${resource}`);
  }

  // R11：classic content script 必须通过 node --check。ESM 模块已由 R4/R5 的动态 import 覆盖，
  // 但 manifest 以经典脚本加载的 content script 没有 import 路径，语法错误只能靠本门禁发现。
  // （node --check 对无 package.json type:module 的 ESM 不可靠，故只检查经典脚本。）
  const {execFileSync} = require('node:child_process');
  for (const node of nodes.values()) {
    if (node.esm) continue;
    if (!node.file.absolute.startsWith(`${path.join(root, 'extension')}${path.sep}`)) continue;
    try {
      execFileSync(process.execPath, ['--check', node.file.absolute], {stdio: 'pipe'});
    } catch (error) {
      fail('R11', `classic 脚本语法错误: ${node.file.relative}: ${String(error.stderr || error.message).split('\n').find(line => /Error/.test(line)) || '未知错误'}`);
    }
  }

  // R7：文件级长注释门禁（SPEC 第 4.5 节）——每个手写源文件必须从首字符起为 /** @file … */ 块；
  // 例外有二：connector/host.mjs 首行 shebang（文件头紧随其后）；frequency/ 等生成产物
  // （以 // Generated by 开头的来源声明代替手写文件头，重跑生成器时会被覆写）。
  for (const node of nodes.values()) {
    const source = node.source;
    const withoutShebang = source.startsWith('#!') ? source.slice(source.indexOf('\n') + 1) : source;
    if (withoutShebang.startsWith('// Generated by')) continue;
    if (!withoutShebang.startsWith('/**') || !withoutShebang.includes('@file')) {
      fail('R7', `缺少文件级长注释（@file）：${node.file.relative}；须按 SPEC 4.5 写明职责/主要内容/模块边界`);
    }
  }

  return {
    failures,
    stats: {
      files: files.length,
      esmFiles: [...nodes.values()].filter(node => node.esm).length,
      edges: [...nodes.values()].reduce((total, node) => total + node.edges.length, 0),
      importUnsafe: [...unsafe.keys()].map(absolute => path.basename(absolute)),
      connectorClosure: closure.map(absolute => relativeExtensionPath(root, absolute)),
    },
  };
}

module.exports = {verifyModuleGraph, SHARED_PROTOCOL, DOMAIN, DOMAIN_ASSETS, CONTENT_SCRIPT_ORDER};
