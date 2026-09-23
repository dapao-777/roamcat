/**
 * @file connector/diagnostics.mjs
 * 文件职责：连接器诊断镜像——jsonl轮转、TTL与权限。
 * 主要内容：≤256KB轮转、7天TTL、0600/0700权限。
 * 模块边界：Node侧；与扩展diagnostics.mjs事件互通。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { EventEmitter } from "node:events";
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeDiagnostic, DIAGNOSTIC_TTL } from "../extension/diagnostics.mjs";

export const DIAGNOSTIC_MAX_BYTES = 256 * 1024;
export const DIAGNOSTIC_BATCH_LIMIT = 32;

export class DiagnosticStore extends EventEmitter {
  static async create(dataDir) {
    const store = new DiagnosticStore(dataDir);
    try { await store.#initialize(); } catch { store.storageError = true; store.enabled = false; }
    return store;
  }

  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.path = join(dataDir, "diagnostics.jsonl");
    this.rotatedPath = `${this.path}.1`;
    this.configPath = join(dataDir, "diagnostics-config.json");
    this.enabled = true;
    this.storageError = false;
    this.queue = Promise.resolve();
  }

  async #initialize() {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await chmod(this.dataDir, 0o700);
    try {
      const value = JSON.parse(await readFile(this.configPath, "utf8"));
      this.enabled = value?.enabled !== false;
    } catch (error) {
      if (error?.code !== "ENOENT") { this.enabled = false; this.storageError = true; }
    }
    for (const path of [this.path,this.rotatedPath]) {
      let info;try { info=await stat(path); } catch(error) { if(error?.code==='ENOENT')continue;throw error; }
      if(info.size>DIAGNOSTIC_MAX_BYTES||info.mtimeMs<Date.now()-DIAGNOSTIC_TTL){await rm(path,{force:true});continue;}
      const text=await readFile(path,'utf8'),lines=[];
      for(const line of text.split('\n')){try{const raw=JSON.parse(line);if(!Number.isFinite(raw.at)||raw.at<Date.now()-DIAGNOSTIC_TTL)continue;const clean=sanitizeDiagnostic(raw);if(clean)lines.push(JSON.stringify(clean));}catch{}}
      const retained=lines.length?lines.join('\n')+'\n':'';if(retained!==text)await writeFile(path,retained,{mode:0o600});await chmod(path,0o600);
    }
  }

  append(record, { broadcast = true } = {}) {
    const clean = sanitizeDiagnostic(record);
    if (!clean || !this.enabled) return Promise.resolve(false);
    return this.#serialize(async () => {
      if (!this.enabled) return false;
      const line = Buffer.from(`${JSON.stringify(clean)}\n`, "utf8");
      let size = 0;
      try { size = (await stat(this.path)).size; } catch (error) { if (error?.code !== "ENOENT") throw error; }
      if (size + line.length > DIAGNOSTIC_MAX_BYTES) {
        await rm(this.rotatedPath, { force: true });
        try { await rename(this.path, this.rotatedPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
        try { await chmod(this.rotatedPath, 0o600); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      }
      const handle = await open(this.path, "a", 0o600);
      try { await handle.write(line); } finally { await handle.close(); }
      await chmod(this.path, 0o600);
      this.storageError = false;
      if (broadcast) this.emit("diagnostic", clean);
      return true;
    }).catch(() => {if(!this.storageError)this.emit('diagnostic',{at:Date.now(),operation:'CONNECTION',stage:'connection',status:'error',code:'STORAGE_ERROR'});this.storageError=true;return false;});
  }

  appendMany(records, options = {}) {
    if (!Array.isArray(records) || records.length > DIAGNOSTIC_BATCH_LIMIT) throw new Error("诊断事件批次无效");
    return Promise.all(records.map(record => this.append(record, options)));
  }

  clear() {
    return this.#serialize(async () => {
      await Promise.all([rm(this.path, { force: true }), rm(this.rotatedPath, { force: true })]);
      this.storageError = false;
    });
  }

  configure(enabled) {
    if (typeof enabled !== "boolean") throw new Error("诊断配置无效");
    return this.#serialize(async () => {
      const temporary = `${this.configPath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ enabled })}\n`, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, this.configPath);
      this.enabled = enabled;
      this.storageError = false;
    });
  }

  idle() { return this.queue.catch(() => {}); }

  #serialize(operation) {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => {});
    return next;
  }
}
