/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
const scheduled=new Map();let timerId=0,listener,lastRequest;
const oldSetTimeout=globalThis.setTimeout,oldClearTimeout=globalThis.clearTimeout;
globalThis.setTimeout=(fn,ms)=>{const id=++timerId;scheduled.set(id,{fn,ms});return id;};
globalThis.clearTimeout=id=>scheduled.delete(id);
globalThis.chrome={runtime:{connectNative:()=>({onDisconnect:{addListener(){}},onMessage:{addListener(fn){listener=fn;}},postMessage(message){lastRequest=message;},disconnect(){}})}};
try{
 const {summarizeSubscription}=await import('../roamcat-0.0.1/extension/subscription.js');
 const pending=summarizeSubscription({text:'Controlled fixture text.'},undefined,'antigravity');
 assert.equal(lastRequest.type,'summarize');assert.equal([...scheduled.values()][0].ms,120000);
 const result={takeaway:'测试结论',highlights:['测试要点'],keywords:[],domain:'general'};
 listener({id:lastRequest.id,ok:true,data:result});assert.deepEqual(await pending,result);assert.equal(scheduled.size,0);
 const report={checks:['Summary transport allows the native 90-second request to finish and clears its deadline after success'],failures:[]};
 fs.writeFileSync(new URL('../preview/audit/transport-regression.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{globalThis.setTimeout=oldSetTimeout;globalThis.clearTimeout=oldClearTimeout;}
