/**
 * @file tools/run-unit-tests.mjs
 * 文件职责：`npm test` 的入口——列出 tools/unit 下全部 *.test.mjs，再以显式文件参数调用 `node --test`。
 *   Node 20 的 `node --test` 不展开通配符（会报 Could not find 'tools/unit/*.test.mjs'），
 *   Node 21+ 才支持；显式列文件在 20/22/24 上行为一致，CI 矩阵三个版本都能跑到全部用例。
 * 主要内容：按文件名排序收集测试文件，透传额外参数（如 --test-reporter），继承子进程退出码。
 * 模块边界：零依赖构建期脚本，只读目录、不改文件。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {readdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const unitDir = join(dirname(fileURLToPath(import.meta.url)), 'unit');
const files = readdirSync(unitDir).filter(name => name.endsWith('.test.mjs')).sort().map(name => join(unitDir, name));
if (!files.length) {
  console.error('tools/unit 下没有找到 *.test.mjs');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], {stdio: 'inherit'});
process.exit(result.status ?? 1);
