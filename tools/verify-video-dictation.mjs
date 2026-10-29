/**
 * @file tools/verify-video-dictation.mjs
 * 文件职责：ego lite 中用真实媒体采集验证无字幕听写、暂停续录、停止与字幕回看。
 * 模型使用确定性假响应；--speech-fixture=路径 可另存真实语音的 WebM 供订阅验证。
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {openBrowser, DIST, previewPath} from './lib/ego.mjs';
import {normalizeAudio} from '../roamcat-0.0.1/extension/audio-transcription.mjs';

// 足够长的确定性 WAV，真实 MediaRecorder 编码，不替换媒体 API。
const wav = Buffer.alloc(44 + 16000 * 2 * 30);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
const speech = process.argv.find(arg=>arg.startsWith('--speech-fixture='))?.slice(17);
const media = speech ? await fs.readFile(speech) : wav;
const run = await openBrowser({extension:null});
const errors = [], checks = [];
try {
  const page = run.page;
  page.on('pageerror', error=>errors.push(error.message));
  await page.intercept(['https://www.youtube.com/*'], async request => {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith('/fixture/')) return {headers:{'content-type':'text/javascript; charset=utf-8'},body:await fs.readFile(`${DIST}/${pathname.slice(9)}`)};
    return {headers:{'content-type':'text/html'},body:'<!doctype html><title>Audio fixture</title><div id="movie_player" class="html5-video-player"><video style="width:800px;height:450px" controls></video></div>'};
  });
  await page.goto('https://www.youtube.com/watch?v=asrfixture1');
  await page.evaluate(() => {
    window.shadows = [];
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {const root=attach.call(this,options);window.shadows.push(root);return root;};
    window.qa = {clips:[],status:[],settings:{bilingual:true},hold:false,pending:null};
    window.chrome = {runtime:{sendMessage(_m,cb){cb?.({ok:true,data:{uiLang:'zh'}});}},i18n:{getUILanguage:()=> 'zh'}};
  });
  for (const name of ['design.js','i18n-content.js','video-dictation.js','video-subtitles.js']) await page.addScriptTag({url:`https://www.youtube.com/fixture/${name}`});
  await page.evaluate(async base64 => {
    window.media = document.querySelector('video');
    const bytes = Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
    media.src = URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
    media.muted = true;
    await media.play();
    RoamCatVideoSubtitles.mount({settings:qa.settings,onAssist:()=>{},onPrepareBridge:async()=>{},
      onSettingsChange:async patch=>({video:qa.settings={...qa.settings,...patch}}),
      onTranscribe:async payload=>{
        if (payload.check) return {ready:true};
        qa.clips.push(payload.audio);
        if (qa.hold) await new Promise(resolve=>qa.pending=resolve);
        return {segments:[{start:0,end:Math.min(payload.audio.duration,1),text:'Fixture speech',translation:'测试译文'}]};
      },
    });
    window.button = action=>shadows.flatMap(root=>[...root.querySelectorAll(`[data-action="${action}"]`)]).find(Boolean);
    button('dictation').click();
  }, media.toString('base64'));
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>media.currentTime>=1.5);
  await page.evaluate(()=>media.pause());
  await page.waitForFunction(()=>qa.clips.length===1 && shadows.some(root=>root.textContent.includes('Fixture speech')));
  const clip = await page.evaluate(()=>qa.clips[0]); normalizeAudio(clip);
  await fs.mkdir(previewPath('audio-probe'),{recursive:true});
  await fs.writeFile(previewPath('audio-probe','captured.webm'),Buffer.from(clip.base64,'base64'));
  checks.push('真实 captureStream / WebM 编码，暂停提交字幕');
  await page.evaluate(async()=>{qa.hold=true;await media.play();});
  await page.waitForFunction(()=>media.currentTime>=3);
  await page.evaluate(()=>media.pause());
  await page.waitForFunction(()=>qa.clips.length===2 && qa.pending);
  await page.evaluate(()=>{button('dictation').click();qa.pending();});
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='false');
  assert.equal(await page.evaluate(()=>qa.clips.length),2);
  checks.push('恢复播放续录；手动停止忽略在途结果');
  await page.evaluate(()=>{media.currentTime=0.3;});
  await page.waitForFunction(()=>shadows.some(root=>root.querySelector('.translation span')?.textContent==='测试译文'));
  checks.push('停止后按原时间轴回看双语字幕');
  await page.evaluate(async()=>{await media.play();button('dictation').click();});
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>{media.currentTime=4;});
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='false');
  checks.push('拖动进度自动停止');
  // 播到结尾：仿 YouTube 自动连播倒计时（实测播完即出现「取消」按钮），1.5 秒内没人点就算连播到下一个视频。
  await page.evaluate(()=>{
    const cancel = Object.assign(document.createElement('button'),{className:'ytp-autonav-endscreen-upnext-cancel-button',textContent:'取消'});
    cancel.style.display = 'none';
    document.querySelector('#movie_player').append(cancel);
    qa.autoplay = {fired:0,canceled:0,timer:null};
    media.addEventListener('ended',()=>{cancel.style.display='';qa.autoplay.timer=setTimeout(()=>{cancel.style.display='none';qa.autoplay.fired++;},1500);});
    cancel.addEventListener('click',()=>{clearTimeout(qa.autoplay.timer);cancel.style.display='none';qa.autoplay.canceled++;});
  });
  await page.evaluate(async()=>{media.pause();media.currentTime=media.duration-1;await media.play();});
  await page.waitForFunction(()=>qa.autoplay.fired===1,undefined,{timeout:8000});
  assert.equal(await page.evaluate(()=>qa.autoplay.canceled),0);
  checks.push('没在听写时不干预 YouTube 自动连播');
  // 先等跳转落定再开启：迟到的 seeking 会被当成用户拖动而停止听写。
  await page.evaluate(()=>new Promise(resolve=>{media.addEventListener('seeked',resolve,{once:true});media.currentTime=media.duration-2.5;}));
  await page.evaluate(()=>{qa.hold=true;qa.pending=null;button('dictation').click();});
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='true');
  const clipsBefore = await page.evaluate(()=>qa.clips.length);
  await page.evaluate(()=>media.play());
  await page.waitForFunction(count=>qa.clips.length===count+1 && qa.pending,clipsBefore,{timeout:10000});
  await page.waitForFunction(()=>qa.autoplay.canceled===1,undefined,{timeout:5000});
  assert.ok(await page.evaluate(()=>shadows.some(root=>root.textContent.includes('已取消自动连播'))));
  await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(()=>qa.autoplay.fired),1);
  await page.evaluate(()=>qa.pending());
  await page.waitForFunction(()=>button('dictation').getAttribute('aria-pressed')==='false');
  assert.ok(await page.evaluate(()=>shadows.some(root=>root.querySelector('.asr-status')?.textContent.includes('听写完成'))));
  checks.push('听写最后一段在途时取消自动连播，等这一段完成');
  await page.evaluate(()=>RoamCatVideoSubtitles.unmount());
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,errors,clipBytes:Buffer.from(clip.base64,'base64').length},null,2));
  await fs.writeFile(previewPath('audio-probe','browser-report.json'),JSON.stringify({checks,errors},null,2));
} finally {await run.close();}
