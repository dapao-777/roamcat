/**
 * @file extension/speech.js
 * 文件职责：TTS会话——一次一个英文语音，打断上一个。
 * 主要内容：createSpeechHandler(chrome.tts)；仅本地语音，无网络。
 * 模块边界：应用层；被background按端口装配。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
const terminalEvents=new Set(['end','interrupted','cancelled','error']);

export function createSpeechHandler(tts){
  let active=null;
  function emit(job,event){
    if(job.closed)return;
    try{job.port.postMessage(event);}
    catch{job.closed=true;if(active===job){active=null;tts.stop();}}
  }
  function finish(job,type,error=''){
    if(active!==job)return;
    active=null;emit(job,{type,error});
  }
  return port=>{
    const job={port,closed:false,started:false};
    port.onDisconnect.addListener(()=>{
      job.closed=true;
      if(active===job){active=null;tts.stop();}
    });
    port.onMessage.addListener(async message=>{
      if(job.started||job.closed)return;
      job.started=true;
      const text=message?.text;
      if(typeof text!=='string'||!text.trim()||text.length>2000){emit(job,{type:'error',error:'请选择不超过 2000 字符的英文词语或原句。'});return;}
      if(active){finish(active,'interrupted');tts.stop();}
      active=job;
      try{
        const voices=await tts.getVoices();
        if(active!==job||job.closed)return;
        const local=voices.filter(voice=>!voice.remote&&!voice.extensionId&&/^en(?:-|$)/i.test(voice.lang||'')&&voice.eventTypes?.includes('start')&&voice.eventTypes.includes('end'));
        // macOS lists novelty voices before its natural reading voices.
        const voice=local.find(voice=>voice.voiceName==='Samantha')||local.find(voice=>voice.voiceName==='Daniel')||local.find(voice=>voice.lang.toLowerCase()==='en-us')||local[0];
        if(!voice)throw new Error('没有可用的本地英文语音，请在系统设置中安装英文语音后重试。');
        await tts.speak(text.trim(),{voiceName:voice.voiceName,lang:voice.lang,requiredEventTypes:['start','end'],onEvent:event=>{
          if(active!==job||job.closed)return;
          if(event.type==='start')emit(job,{type:'start'});
          else if(terminalEvents.has(event.type))finish(job,event.type,event.errorMessage||'');
        }});
      }catch(error){finish(job,'error',error.message||'无法朗读，请检查系统语音设置。');}
    });
  };
}
