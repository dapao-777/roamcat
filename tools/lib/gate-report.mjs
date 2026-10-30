/**
 * @file tools/lib/gate-report.mjs
 * 文件职责：门禁统一报告——逐项打印 PASS / FAIL，结束时打印一行固定格式的汇总
 *   「GATE <名字>: N 通过，M 失败」，写 preview/gates/<名字>.json 并设置退出码。
 * 主要内容：createGateReport(name) 返回 {check, finish}：check(标题, fn) 运行一项检查（抛错即失败，返回值作为说明），
 *   finish(附加字段) 写报告并打印汇总行；printGateSummary(name, passed, failed) 供自带报告格式的老门禁只补汇总行。
 *   tools/run-gates.mjs（npm run verify:all）按汇总行收集各门禁结果。
 * 模块边界：门禁脚本共用的 Node 模块；只写 preview/gates/，不碰扩展源码与 dist。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PREVIEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'preview', 'gates');
export const SUMMARY_PATTERN = /^GATE (\S+): (\d+) 通过，(\d+) 失败$/m;

export function printGateSummary(name, passed, failed) {
  console.log(`\nGATE ${name}: ${passed} 通过，${failed} 失败`);
}

export function createGateReport(name) {
  const report = {name, startedAt: new Date().toISOString(), checks: [], failures: []};
  const describe = detail => (detail === undefined || detail === null || detail === '' ? '' : ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
  return {
    report,
    async check(label, fn) {
      try {
        const detail = await fn();
        report.checks.push({name: label, ok: true, detail: detail ?? null});
        console.log(`PASS ${label}${describe(detail)}`);
        return detail;
      } catch (error) {
        report.checks.push({name: label, ok: false, error: error?.message || String(error)});
        report.failures.push({name: label, error: error?.stack || String(error)});
        console.error(`FAIL ${label}: ${error?.message || error}`);
        return undefined;
      }
    },
    finish(extra = {}) {
      Object.assign(report, extra, {finishedAt: new Date().toISOString()});
      fs.mkdirSync(PREVIEW, {recursive: true});
      fs.writeFileSync(path.join(PREVIEW, `${name}.json`), JSON.stringify(report, null, 2));
      const passed = report.checks.filter(item => item.ok).length;
      printGateSummary(name, passed, report.failures.length);
      if (report.failures.length) process.exitCode = 1;
      return report;
    },
  };
}
