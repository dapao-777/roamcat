/**
 * @file tools/unit/local-translator-offscreen.test.mjs
 * 文件职责：离屏本机翻译的信任边界与生命周期回归；使用浏览器 API 桩，绝不下载真实语言包。
 * 主要内容：网页发送者拒绝、未准备的语言包不自动下载、共享翻译器在全部请求结束后才空闲释放。
 * 模块边界：在隔离 vm 中执行实际 offscreen.js，并通过其真实消息监听器请求；不访问 chrome 用户配置。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../roamcat-0.0.1/extension/local-inference/offscreen.js',import.meta.url),'utf8');
function harness(Translator){
  const listeners=[],timers=new Map();let nextTimer=0;
  vm.runInNewContext(source,{Translator,chrome:{runtime:{id:'fixture-extension',onMessage:{addListener:listener=>listeners.push(listener)}}},setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const request=(texts,sender={id:'fixture-extension'})=>new Promise(resolve=>{
    const message={target:'local-translator',type:'TRANSLATE_LOCAL',texts};
    for(const listener of listeners)listener(message,sender,value=>resolve(JSON.parse(JSON.stringify(value))));
  });
  return {request,timers};
}

test('网页和外部扩展不能绕过后台直接调用离屏翻译',async()=>{
  let calls=0;const h=harness({availability:async()=>{calls++;return 'available';},create:async()=>{throw new Error('must not run');}});
  assert.equal((await h.request(['hello'],{id:'fixture-extension',tab:{id:1}})).ok,false);
  assert.equal((await h.request(['hello'],{id:'another-extension'})).ok,false);
  assert.equal(calls,0);
});

test('离屏文档只使用已就绪语言包，不在后台触发下载',async()=>{
  for(const status of ['downloadable','downloading','unavailable']){
    let created=0;const h=harness({availability:async options=>{assert.equal(options.sourceLanguage,'en');assert.equal(options.targetLanguage,'zh');return status;},create:async()=>{created++;}});
    const result=await h.request(['hello']);assert.equal(result.ok,false);assert.equal(result.code,'NOT_READY');assert.equal(created,0);
  }
  assert.equal((await harness(undefined).request(['hello'])).code,'NOT_READY');
});

test('并发消息共享翻译器，全部结束后才安排并执行空闲释放',async()=>{
  let created=0,destroyed=0,started,finish;
  const entered=new Promise(resolve=>{started=resolve;});
  const h=harness({availability:async()=> 'available',create:async()=>{created++;return {translate:async text=>{if(text==='slow'){started();await new Promise(resolve=>{finish=resolve;});}return '译文 '+text;},destroy(){destroyed++;}};}});
  const pending=h.request(['slow']);await entered;
  const fast=await h.request(['fast']);assert.deepEqual(fast,{ok:true,data:['译文 fast']});assert.equal(created,1);assert.equal(h.timers.size,0);assert.equal(destroyed,0);
  finish();assert.equal((await pending).ok,true);assert.equal(h.timers.size,1);
  const timer=[...h.timers.values()][0];assert.equal(timer.ms,5*60*1000);await timer.callback();assert.equal(destroyed,1);
});
