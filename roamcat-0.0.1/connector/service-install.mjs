/**
 * @file connector/service-install.mjs
 * 文件职责：本机常驻连接服务的安装 / 卸载——复制连接器源码、写 service.json、配置登录自启并立即启动。
 * 主要内容：Windows 用 HKCU\…\Run + 隐藏窗口的 VBScript 启动 node；macOS 用 LaunchAgent（RunAtLoad + KeepAlive）；
 *   Linux 用 systemd 用户服务（没有 systemctl 时直接后台启动并提示）。重装前按 pid 文件 + /v1/health 确认后停止旧服务；
 *   启动后轮询 /v1/health 确认可用。后端列表来自各订阅通道目录里已有的 config.json，登录数据仍留在原通道目录。
 *   每次安装换一个新的配对令牌（服务目录下的 pairing-token，0600），service.json 的 tokenFile 指向它；
 *   各通道 config.json 的 serviceTokenFile（install.mjs 写入）也指向同一个文件。
 * 模块边界：只由 install.mjs 调用；只写当前用户范围（不需要管理员权限）。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {access,chmod,copyFile,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {PAIRING_TOKEN_FILE, writePairingToken} from './pairing.mjs';

export const SERVICE_PORT = 47821;
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'RoamCatConnectorService';
const LAUNCH_LABEL = 'com.roamcat.connector';
const SYSTEMD_UNIT = 'roamcat-connector.service';
const SKIP = new Set(['install.mjs', 'service-install.mjs']);
const EXTENSION_DEPS = ['audio-transcription.mjs', 'gloss.mjs', 'assistance-stream.mjs', 'diagnostics.mjs', 'personalization.mjs', 'sentence-groups.mjs'];

// 把连接器源码（不含安装器）与它依赖的扩展侧共享模块复制到 root/connector、root/extension。
export async function copyConnectorSources(source, root) {
  const installed = join(root, 'connector');
  await mkdir(installed, {recursive: true, mode: 0o700});
  const files = (await readdir(source, {withFileTypes: true})).filter(entry => entry.isFile() && entry.name.endsWith('.mjs') && !SKIP.has(entry.name));
  for (const file of files) await copyFile(join(source, file.name), join(installed, file.name));
  await mkdir(join(root, 'extension'), {recursive: true, mode: 0o700});
  await Promise.all(EXTENSION_DEPS.map(name => copyFile(join(source, '../extension', name), join(root, 'extension', name))));
  return {installed, files: files.map(file => file.name)};
}

export function serviceRoot() {
  const home = homedir();
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(home, 'AppData/Local'), 'RoamCat Connector Service');
  if (process.platform === 'darwin') return join(home, 'Library/Application Support/RoamCat Connector Service');
  return join(process.env.XDG_DATA_HOME || join(home, '.local/share'), 'roamcat-connector-service');
}

// 配对令牌文件：浏览器连接器从这里读出令牌交给扩展，常驻服务用它校验握手。
export function serviceTokenFile() {
  return join(serviceRoot(), PAIRING_TOKEN_FILE);
}

const exists = path => access(path).then(() => true, () => false);
const sleep = ms => new Promise(done => setTimeout(done, ms));

async function health(port, timeoutMs = 1500) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/health`, {signal: AbortSignal.timeout(timeoutMs)});
    if (!response.ok) return null;
    const body = await response.json();
    return body?.service === 'roamcat-connector' ? body : null;
  } catch { return null; }
}

// 停掉正在运行的旧服务：只停 /v1/health 自报的那个 pid（确认是 RoamCat 连接服务），不按残留的 pid 文件误伤别的进程。
async function stopRunning(root, port) {
  const status = await health(port);
  if (!Number.isInteger(status?.pid)) { await rm(join(root, 'service.pid'), {force: true}).catch(() => {}); return false; }
  try { process.kill(status.pid); } catch { return false; }
  for (let i = 0; i < 20 && await health(port, 300); i++) await sleep(150);
  return true;
}

function windowsAutostart(root, nodePath) {
  const script = join(root, 'start-service.vbs');
  // VBScript 里 "" 是一个引号；cmd /c 会剥掉最外层一对引号，所以整条命令再包一层。
  const command = `cmd /c """"${nodePath}"" ""${join(root, 'connector', 'service.mjs')}"" --config ""${join(root, 'service.json')}"" >> ""${join(root, 'service.log')}"" 2>&1""`;
  return {script, body: `' RoamCat 连接服务：登录时以隐藏窗口启动\r\nCreateObject("WScript.Shell").Run "${command}", 0, False\r\n`};
}

async function enableAutostart(root, nodePath) {
  const serviceFile = join(root, 'connector', 'service.mjs');
  const configFile = join(root, 'service.json');
  const logFile = join(root, 'service.log');
  if (process.platform === 'win32') {
    const {script, body} = windowsAutostart(root, nodePath);
    await writeFile(script, body);
    const value = `wscript.exe "${script}"`;
    const result = spawnSync('reg', ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', value, '/f'], {encoding: 'utf8', windowsHide: true});
    if (result.status !== 0) throw new Error(`无法写入登录自启项：${(result.stderr || result.stdout || '').trim()}`);
    spawn('wscript.exe', [script], {detached: true, stdio: 'ignore', windowsHide: true}).unref();
    return `登录自启：${RUN_KEY}\\${RUN_VALUE}`;
  }
  if (process.platform === 'darwin') {
    const agents = join(homedir(), 'Library/LaunchAgents');
    const plist = join(agents, `${LAUNCH_LABEL}.plist`);
    const xml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await mkdir(agents, {recursive: true});
    await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LAUNCH_LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>${xml(serviceFile)}</string><string>--config</string><string>${xml(configFile)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>${xml(logFile)}</string>
</dict></plist>
`);
    const uid = process.getuid?.() ?? 501;
    spawnSync('launchctl', ['bootout', `gui/${uid}`, plist], {stdio: 'ignore'});
    const loaded = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plist], {encoding: 'utf8'});
    if (loaded.status !== 0) spawnSync('launchctl', ['load', '-w', plist], {stdio: 'ignore'});
    return `登录自启：${plist}`;
  }
  const unitDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'systemd/user');
  const unit = join(unitDir, SYSTEMD_UNIT);
  const quoteArg = value => `"${value.replace(/(["\\])/g, '\\$1')}"`;
  await mkdir(unitDir, {recursive: true});
  await writeFile(unit, `[Unit]\nDescription=RoamCat connector service\n\n[Service]\nExecStart=${quoteArg(nodePath)} ${quoteArg(serviceFile)} --config ${quoteArg(configFile)}\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n`);
  const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], {encoding: 'utf8'});
  const enable = reload.status === 0 ? spawnSync('systemctl', ['--user', 'enable', '--now', SYSTEMD_UNIT], {encoding: 'utf8'}) : reload;
  if (enable.status !== 0) {
    spawn(nodePath, [serviceFile, '--config', configFile], {detached: true, stdio: 'ignore'}).unref();
    return `未能启用 systemd 用户服务，已直接在后台启动；下次登录需重新运行安装命令（${unit}）`;
  }
  return `登录自启：systemd 用户服务 ${SYSTEMD_UNIT}`;
}

async function disableAutostart() {
  if (process.platform === 'win32') {
    spawnSync('reg', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f'], {stdio: 'ignore', windowsHide: true});
    return;
  }
  if (process.platform === 'darwin') {
    const plist = join(homedir(), 'Library/LaunchAgents', `${LAUNCH_LABEL}.plist`);
    spawnSync('launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}`, plist], {stdio: 'ignore'});
    await rm(plist, {force: true});
    return;
  }
  spawnSync('systemctl', ['--user', 'disable', '--now', SYSTEMD_UNIT], {stdio: 'ignore'});
  await rm(join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'systemd/user', SYSTEMD_UNIT), {force: true});
}

// backendRoots：{chatgpt: root, grok: root, antigravity: root}（各订阅通道的安装目录，只收已有 config.json 的）。
export async function installService({source, nodePath, origins, backendRoots, port = SERVICE_PORT}) {
  const root = serviceRoot();
  const backends = {};
  for (const [kind, dir] of Object.entries(backendRoots)) {
    if (dir && await exists(join(dir, 'config.json'))) backends[kind] = join(dir, 'config.json');
  }
  if (!Object.keys(backends).length) throw new Error('没有可交给常驻服务的订阅通道。');
  await stopRunning(root, port);
  await mkdir(root, {recursive: true, mode: 0o700});
  await chmod(root, 0o700).catch(() => {});
  await copyConnectorSources(source, root);
  const tokenFile = serviceTokenFile();
  await writePairingToken(tokenFile);
  const config = {port, allowedOrigins: origins, backends, pidFile: join(root, 'service.pid'), tokenFile};
  await writeFile(join(root, 'service.json'), JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
  const autostart = await enableAutostart(root, nodePath);
  let status = null;
  for (let i = 0; i < 40 && !status; i++) { await sleep(250); status = await health(port); }
  return {root, port, backends: Object.keys(backends), autostart, running: Boolean(status)};
}

export async function uninstallService({port = SERVICE_PORT} = {}) {
  const root = serviceRoot();
  await disableAutostart();
  const stopped = await stopRunning(root, port);
  await rm(root, {recursive: true, force: true});
  return {root, stopped};
}
