/**
 * @file extension/work-lanes.mjs
 * 文件职责：后台批量工作的调度——按场景分道排队，再按服务限并发，可见交互在服务闸门里插队。
 * 主要内容：createWorkLanes({check, busy, waiterLimit}) 返回 run/prune/snapshot：每个场景（整页、选区、阅读器、
 *   视频字幕、直播聊天、释义、解构、领域识别）一条道，各道互不阻塞，每道同时放行的条数取这批工作所用服务的并发设置；
 *   createServiceGates() 返回 acquire/release：按服务计的 FIFO 信号量，urgent 排到队首。
 * 模块边界：领域层纯调度，可 Node 安全 import；不触碰 chrome，工作内容、过期校验与繁忙错误都由调用方注入。
 *   状态只在内存里，Service Worker 回收后从零开始。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/** 服务并发设置的取值范围：默认 2，可设 1–10。 */
export function laneLimit(value, fallback = 2) {
  return Number.isInteger(value) ? Math.min(10, Math.max(1, value)) : fallback;
}

/**
 * 场景分道：同一道里先来先放行，不同道互不排队。放行前先过 check（过期、换页、换服务的工作直接拒掉，不占名额）。
 * @param {{check:(work:object)=>Promise<void>, busy:()=>Error, waiterLimit?:number}} options
 */
export function createWorkLanes({check, busy, waiterLimit = 16}) {
  const lanes = new Map();
  const laneOf = name => {
    let lane = lanes.get(name);
    if (!lane) { lane = {active: 0, waiters: []}; lanes.set(name, lane); }
    return lane;
  };
  function drain(name) {
    const lane = laneOf(name);
    // 每条工作带着自己那一刻的服务并发设置；队首按它判断能否放行，设置改小后已在跑的自然跑完。
    while (lane.waiters.length && lane.active < lane.waiters[0].limit) {
      const work = lane.waiters.shift();
      lane.active++;
      void (async () => {
        try { await check(work); work.resolve(await work.operation()); }
        catch (error) { work.reject(error); }
        finally { lane.active--; drain(name); }
      })();
    }
  }
  /** work：{lane, limit, operation, resolve, reject, …}；队列已满时立即以 busy() 拒绝。 */
  function run(work) {
    const lane = laneOf(work.lane);
    work.limit = laneLimit(work.limit);
    if (lane.active >= work.limit && lane.waiters.length >= waiterLimit) { work.reject(busy()); return; }
    lane.waiters.push(work);
    drain(work.lane);
  }
  /** 清掉排队中已过期的工作（check 抛错的），不影响已在跑的。 */
  async function prune() {
    await Promise.all([...lanes.values()].flatMap(lane => lane.waiters.slice().map(async work => {
      try { await check(work); }
      catch (error) {
        const index = lane.waiters.indexOf(work);
        if (index >= 0) { lane.waiters.splice(index, 1); work.reject(error); }
      }
    })));
  }
  const snapshot = () => Object.fromEntries([...lanes].map(([name, lane]) => [name, {active: lane.active, waiting: lane.waiters.length}]));
  return {run, prune, snapshot};
}

/** 按服务计的并发闸门：service = {id, maxConcurrency}；urgent 的等待者排到队首。 */
export function createServiceGates() {
  const slots = new Map();
  function drain(slot) {
    // 先预留名额再唤醒等待者，避免同一轮的新请求抢占；下调上限时让已有请求自然结束。
    while (slot.active < slot.limit && slot.waiters.length) {
      slot.active++;
      slot.waiters.shift()();
    }
  }
  async function acquire(service, urgent = false) {
    const limit = laneLimit(service?.maxConcurrency);
    let slot = slots.get(service.id);
    if (!slot) { slot = {active: 0, limit, waiters: []}; slots.set(service.id, slot); }
    slot.limit = limit;
    await new Promise(resolve => {
      if (urgent) slot.waiters.unshift(resolve); else slot.waiters.push(resolve);
      drain(slot);
    });
  }
  function release(service) {
    const slot = slots.get(service?.id);
    if (!slot || slot.active <= 0) return;
    slot.active--;
    drain(slot);
  }
  const snapshot = id => { const slot = slots.get(id); return {active: slot?.active || 0, waiting: slot?.waiters.length || 0}; };
  return {acquire, release, snapshot};
}
