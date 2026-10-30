/**
 * @file tools/run-gates.mjs
 * 文件职责：一键跑全部门禁（npm run verify:all）——静态检查失败即停，只构建一次，再跑浏览器门禁，最后打印汇总表。
 * 主要内容：静态段 npm test / 模块图 / 字典 / 死代码；构建 npm run build；浏览器段按固定顺序跑各门禁（生产构建门禁
 *   会重新构建，放最后单独跑）。每个门禁的完整输出写 preview/gates/logs/<名字>.log，按汇总行
 *   「GATE <名字>: N 通过，M 失败」（tools/lib/gate-report.mjs）取计数，汇总写 preview/gates/summary.json，有失败退出码为 1。
 * 用法：npm run verify:all [-- --quick] [-- --only=video,livechat] [-- --skip=sites] [-- --jobs=2] [-- --keep-going]
 *   --quick 跳过站点档案与生产构建门禁、性能门禁不等后台休眠；--jobs=2 让浏览器门禁两路并行（各自独立的临时 ego 配置）；
 *   --keep-going 静态检查失败也继续。
 * 模块边界：只编排已有命令，不改门禁本身；需本机 ego lite（浏览器门禁）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SUMMARY_PATTERN} from './lib/gate-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = path.join(ROOT, 'preview', 'gates', 'logs');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const list = name => args.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3).split(',').filter(Boolean) || [];
const quick = flag('quick'), keepGoing = flag('keep-going');
const jobs = Number(args.find(item => item.startsWith('--jobs='))?.slice(7) ?? 1);
const only = list('only'), skip = list('skip');

const STATIC = [
  {name: 'unit', cmd: ['npm', 'test']},
  {name: 'graph', cmd: ['node', 'tools/verify-module-graph.cjs']},
  {name: 'dict', cmd: ['node', 'tools/check-dict.cjs']},
  {name: 'deadcode', cmd: ['node', 'tools/verify-deadcode.cjs']},
];
const BROWSER = [
  {name: 'build', cmd: ['node', 'tools/verify-build.mjs']},
  {name: 'service', cmd: ['node', 'tools/verify-connector-service.mjs']},
  {name: 'options', cmd: ['node', 'tools/verify-options.mjs']},
  {name: 'dictation', cmd: ['node', 'tools/verify-video-dictation.mjs']},
  {name: 'video', cmd: ['node', 'tools/verify-video-ui.mjs']},
  {name: 'livechat', cmd: ['node', 'tools/verify-live-chat.mjs']},
  {name: 'sites', cmd: ['node', 'tools/verify-dev-sites.mjs'], slow: true},
  {name: 'performance', cmd: ['node', 'tools/verify-performance.mjs', ...(quick ? ['--skip-idle'] : [])]},
  {name: 'reader', cmd: ['node', 'tools/verify-reader.mjs']},
  {name: 'pet', cmd: ['node', 'tools/verify-pet-buttons.mjs']},
  {name: 'ui', cmd: ['node', 'tools/verify-ui-all.mjs']},
  {name: 'audit', cmd: ['node', 'tools/audit-extension.mjs']},
];
// 生产构建门禁会重新构建 dist（结束时恢复开发构建），不能和读 dist 的门禁并行，放最后单独跑。
const RELEASE = {name: 'release', cmd: ['node', 'tools/verify-release.mjs'], slow: true};
const allGates = [...STATIC, ...BROWSER, RELEASE];
const gateNames = new Set(allGates.map(gate => gate.name));
const usage = `用法：npm run verify:all -- [--quick] [--only=名字,名字] [--skip=名字] [--jobs=正整数] [--keep-going]\n可用门禁：${[...gateNames].join(', ')}`;
const argumentError = message => { console.error(`${message}\n${usage}`); process.exit(1); };
if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }
const unknownArgs = args.filter(arg => !['--quick', '--keep-going'].includes(arg) && !/^--(?:only|skip|jobs)=/u.test(arg));
if (unknownArgs.length) argumentError(`未知参数：${unknownArgs.join(', ')}`);
for (const name of ['only', 'skip']) {
  if (args.some(arg => arg.startsWith(`--${name}=`) && !arg.slice(name.length + 3).split(',').every(Boolean))) argumentError(`--${name} 必须列出非空门禁名称`);
}
const unknownGates = [...only, ...skip].filter(name => !gateNames.has(name));
if (unknownGates.length) argumentError(`未知门禁：${unknownGates.join(', ')}`);
if (!Number.isSafeInteger(jobs) || jobs < 1) argumentError('--jobs 必须是正整数');
const wanted = gate => (!only.length || only.includes(gate.name)) && !skip.includes(gate.name) && !(quick && gate.slow);
if (!allGates.some(wanted)) argumentError('没有可运行的门禁，请检查 --only、--skip 与 --quick 的组合');

fs.mkdirSync(LOGS, {recursive: true});
const results = [];
function runStep(step) {
  return new Promise(resolve => {
    const started = Date.now();
    const [command, ...rest] = step.cmd;
    const child = spawn(command === 'node' ? process.execPath : command, rest, {cwd: ROOT, shell: command !== 'node', env: process.env});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    console.log(`▶ ${step.name}`);
    child.on('close', code => {
      fs.writeFileSync(path.join(LOGS, `${step.name}.log`), output);
      const summary = SUMMARY_PATTERN.exec(output);
      const unit = /ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/.exec(output);
      const passed = summary ? Number(summary[2]) : unit ? Number(unit[1]) : null;
      const failed = summary ? Number(summary[3]) : unit ? Number(unit[2]) : null;
      const result = {name: step.name, ok: code === 0 && !failed, code, passed, failed, seconds: Math.round((Date.now() - started) / 100) / 10};
      results.push(result);
      console.log(`${result.ok ? '✓' : '✗'} ${step.name}  ${result.seconds}s${passed !== null ? `  ${passed} 通过 / ${failed} 失败` : ''}${result.ok ? '' : `  （退出码 ${code}，日志 preview/gates/logs/${step.name}.log）`}`);
      resolve(result);
    });
  });
}
async function runPool(steps, width) {
  let next = 0;
  await Promise.all(Array.from({length: Math.min(width, steps.length)}, async () => { while (next < steps.length) await runStep(steps[next++]); }));
}

const started = Date.now();
let stopped = '';
const staticSteps = STATIC.filter(wanted);
for (const step of staticSteps) {
  const result = await runStep(step);
  if (!result.ok && !keepGoing) { stopped = `静态检查 ${step.name} 失败，后面的门禁没有运行（加 --keep-going 继续）`; break; }
}
const browserSteps = BROWSER.filter(wanted);
const release = wanted(RELEASE) ? RELEASE : null;
if (!stopped && (browserSteps.length || release)) {
  const build = await runStep({name: 'compile', cmd: ['npm', 'run', 'build']});
  if (!build.ok) stopped = '开发构建失败，浏览器门禁没有运行';
  else {
    await runPool(browserSteps, jobs);
    if (release) await runStep(release);
  }
}

const seconds = Math.round((Date.now() - started) / 1000);
const failed = results.filter(result => !result.ok);
console.log(`\n${'门禁'.padEnd(12)}${'结果'.padEnd(6)}${'用时'.padStart(8)}  通过 / 失败`);
for (const result of results) console.log(`${result.name.padEnd(14)}${(result.ok ? '通过' : '失败').padEnd(6)}${(result.seconds + 's').padStart(8)}  ${result.passed ?? '-'} / ${result.failed ?? '-'}`);
if (stopped) console.log(`\n${stopped}`);
console.log(`\n合计 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒，${results.length - failed.length} 项通过，${failed.length} 项失败${jobs > 1 ? `（浏览器门禁 ${jobs} 路并行）` : ''}。`);
fs.writeFileSync(path.join(ROOT, 'preview', 'gates', 'summary.json'), JSON.stringify({finishedAt: new Date().toISOString(), seconds, jobs, quick, stopped, results}, null, 2));
process.exitCode = failed.length || stopped ? 1 : 0;
