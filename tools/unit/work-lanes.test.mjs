/**
 * @file tools/unit/work-lanes.test.mjs
 * 文件职责：后台分道调度与服务并发闸门的回归测试。
 * 主要内容：不同场景互不排队、每道按服务并发设置放行、队列上限与过期清理；服务闸门限并发、可见交互插队、名额交接不超限。
 * 模块边界：只 import 纯模块 work-lanes.mjs，用可控的 Promise 模拟在途请求，不启动浏览器。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServiceGates, createWorkLanes, laneLimit} from '../../roamcat-0.0.1/extension/work-lanes.mjs';

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
// 可控的在途工作：start 记录开始顺序，finish(name) 让它结束。
function harness() {
  const started = [], pending = new Map();
  const job = name => () => new Promise(resolve => { started.push(name); pending.set(name, resolve); });
  const finish = name => { pending.get(name)(name); pending.delete(name); };
  return {started, job, finish, pending};
}
function enqueue(lanes, lane, limit, operation, extra = {}) {
  return new Promise((resolve, reject) => lanes.run({lane, limit, operation, resolve, reject, ...extra}));
}

test('并发设置取 1–10 的整数，缺省 2', () => {
  assert.equal(laneLimit(undefined), 2);
  assert.equal(laneLimit(0), 1);
  assert.equal(laneLimit(25), 10);
  assert.equal(laneLimit(6), 6);
  assert.equal(laneLimit('3'), 2);
});

// 回归：曾经所有后台批量工作共用 2 个名额、先来先放行，服务设成 10 也只能 2 路，当前字幕排在 6 个阅读器请求之后。
test('场景各自排队：阅读器积压时视频字幕立即放行，每道按服务并发设置放行', async () => {
  const lanes = createWorkLanes({check: async () => {}, busy: () => new Error('busy')});
  const {started, job, finish} = harness();
  const reader = Array.from({length: 6}, (_, i) => enqueue(lanes, 'reader', 2, job('reader' + i)));
  await settle();
  assert.deepEqual(started, ['reader0', 'reader1'], '设置为 2 时阅读器同时只放行 2 条');
  const video = enqueue(lanes, 'video', 2, job('video'));
  await settle();
  assert.deepEqual(started, ['reader0', 'reader1', 'video'], '视频字幕不排在阅读器积压的批次后面');
  finish('video');
  assert.equal(await video, 'video');
  finish('reader0'); await settle();
  assert.deepEqual(started.slice(3), ['reader2']);
  for (const name of ['reader1', 'reader2', 'reader3', 'reader4', 'reader5']) { finish(name); await settle(); }
  assert.deepEqual(await Promise.all(reader), ['reader0', 'reader1', 'reader2', 'reader3', 'reader4', 'reader5']);

  const wide = harness();
  const all = Array.from({length: 6}, (_, i) => enqueue(lanes, 'page', 10, wide.job('page' + i)));
  await settle();
  assert.equal(wide.started.length, 6, '服务并发设为 10 时 6 条同时在途');
  for (const name of [...wide.pending.keys()]) wide.finish(name);
  await Promise.all(all);
});

test('每道排队有上限，满了立即报繁忙；过期的排队工作被清掉、不占名额', async () => {
  let stale = new Set();
  const lanes = createWorkLanes({
    check: async work => { if (stale.has(work.name)) throw Object.assign(new Error('stale'), {code: 'STALE'}); },
    busy: () => Object.assign(new Error('busy'), {code: 'NOT_READY'}),
    waiterLimit: 2
  });
  const {started, job, finish} = harness();
  const first = enqueue(lanes, 'support', 1, job('first'), {name: 'first'});
  const queued = [enqueue(lanes, 'support', 1, job('a'), {name: 'a'}), enqueue(lanes, 'support', 1, job('b'), {name: 'b'})];
  await assert.rejects(enqueue(lanes, 'support', 1, job('c'), {name: 'c'}), {code: 'NOT_READY'});
  assert.deepEqual(lanes.snapshot().support, {active: 1, waiting: 2});
  stale = new Set(['a']);
  await lanes.prune();
  await assert.rejects(queued[0], {code: 'STALE'});
  assert.deepEqual(lanes.snapshot().support, {active: 1, waiting: 1});
  finish('first'); await first; await settle();
  assert.deepEqual(started, ['first', 'b'], '过期的 a 没有运行');
  finish('b'); assert.equal(await queued[1], 'b');
  // 放行前的校验失败同样不运行工作。
  stale = new Set(['late']);
  await assert.rejects(enqueue(lanes, 'support', 1, job('late'), {name: 'late'}), {code: 'STALE'});
  assert.ok(!started.includes('late'));
});

test('服务闸门按设置限并发，可见交互排到队首，名额直接交给等待者不超限', async () => {
  const gates = createServiceGates(), service = {id: 'api:fixture', maxConcurrency: 2};
  const order = [];
  await gates.acquire(service); await gates.acquire(service);
  const bulk = gates.acquire(service).then(() => order.push('bulk'));
  const urgent = gates.acquire(service, true).then(() => order.push('urgent'));
  assert.deepEqual(gates.snapshot(service.id), {active: 2, waiting: 2});
  gates.release(service);
  // 名额交出的同一轮里新来的请求不能插进来抢占：在途仍是 2。
  const late = gates.acquire(service).then(() => order.push('late'));
  await settle();
  assert.deepEqual(order, ['urgent']);
  assert.deepEqual(gates.snapshot(service.id), {active: 2, waiting: 2});
  gates.release(service); await settle();
  gates.release(service); await settle();
  await Promise.all([bulk, urgent, late]);
  assert.deepEqual(order, ['urgent', 'bulk', 'late']);
  for (let i = 0; i < 3; i++) gates.release(service);
  assert.deepEqual(gates.snapshot(service.id), {active: 0, waiting: 0});
  gates.release(service);
  assert.deepEqual(gates.snapshot(service.id), {active: 0, waiting: 0}, '多余的释放不会变成负数');
});

test('服务并发下调后先等在途数降到新上限，上调时立即放行已有等待者', async () => {
  const gates=createServiceGates(),wide={id:'changing',maxConcurrency:2},narrow={id:'changing',maxConcurrency:1};
  await gates.acquire(wide);await gates.acquire(wide);
  let started=false;
  const waiting=gates.acquire(narrow).then(()=>{started=true;});
  gates.release(wide);await settle();
  assert.equal(started,false,'下调为 1 后，仍有旧请求时不能放行新请求');
  assert.deepEqual(gates.snapshot('changing'),{active:1,waiting:1});
  gates.release(wide);await waiting;
  const order=[];
  const older=gates.acquire(narrow).then(()=>order.push('older'));
  const newer=gates.acquire(wide).then(()=>order.push('newer'));
  await settle();
  assert.deepEqual(order,['older'],'上调名额时先放行原有等待者');
  assert.deepEqual(gates.snapshot('changing'),{active:2,waiting:1});
  gates.release(wide);await Promise.all([older,newer]);
  gates.release(wide);gates.release(wide);
  assert.deepEqual(gates.snapshot('changing'),{active:0,waiting:0});
});
