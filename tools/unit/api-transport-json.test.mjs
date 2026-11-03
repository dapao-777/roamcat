/**
 * @file tools/unit/api-transport-json.test.mjs
 * 文件职责：锁住 api-transport.mjs 的 JSON 解析边界——默认整段必须就是一个 JSON 对象，
 *   只有调用方显式传 lenientJson（本页翻译）时才从代码围栏或前后说明里取对象。
 * 主要内容：以 Ollama 非流式分支为样本，fetch 用 globalThis 桩替代，断言严格/宽松两条路径。
 * 模块边界：只 import 被测纯模块；不发真实网络请求。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performProviderRequest} from '../../roamcat-0.0.1/extension/api-transport.mjs';

const service = {
  id: 'ollama-test', name: 'Ollama', providerId: 'ollama', baseUrl: 'http://localhost:11434/api', model: 'gemma3:4b', apiKey: '', options: {}, maxConcurrency: 2,
};
const FENCED = 'Here is the result:\n```json\n{"items":[{"id":"one","translation":"你好"}]}\n```';

async function withReply(content, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, status: 200, json: async () => ({message: {content}, done: true, done_reason: 'stop'})});
  try { return await run(); } finally { globalThis.fetch = original; }
}

test('默认严格：围栏或前后说明包着的对象按 INVALID_JSON 拒绝', async () => {
  await withReply(FENCED, () => assert.rejects(
    performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'}),
    error => error.code === 'INVALID_JSON',
  ));
});

test('lenientJson 时从围栏里取出对象', async () => {
  const value = await withReply(FENCED, () => performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'}, {lenientJson: true}));
  assert.deepEqual(value, {items: [{id: 'one', translation: '你好'}]});
});

test('整段就是 JSON 对象时两种模式都接受', async () => {
  const body = '{"items":[]}';
  assert.deepEqual(await withReply(body, () => performProviderRequest(service, {items: []}, 'Translate.', {type: 'object'})), {items: []});
});

test('Anthropic 流式用量只更新输出量时保留输入量与缓存计数，真实的零值仍生效', async () => {
  const original = globalThis.fetch;
  const usage = [];
  const events = [
    ['message_start', {message:{usage:{input_tokens:100,cache_creation_input_tokens:20,cache_read_input_tokens:3,output_tokens:1}}}],
    ['content_block_delta', {delta:{type:'text_delta',text:'{"items":[]}'}}],
    ['message_delta', {delta:{stop_reason:'end_turn'},usage:{output_tokens:7}}],
    ['message_delta', {delta:{stop_reason:'end_turn'},usage:{output_tokens:0}}],
    ['message_stop', {}],
  ];
  globalThis.fetch = async () => new Response(events.map(([event,data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), {headers:{'content-type':'text/event-stream'}});
  try {
    const value = await performProviderRequest({...service,providerId:'anthropic',baseUrl:'https://api.example.com/v1',model:'claude-sonnet-4-6',apiKey:'fake-key'}, {}, 'Reply.', {type:'object'}, {onContent() {},onUsage:value => usage.push(value)});
    assert.deepEqual(value, {items:[]});
    assert.deepEqual(usage, [
      {inputTokens:123,outputTokens:1},
      {inputTokens:123,outputTokens:7},
      {inputTokens:123,outputTokens:0},
    ]);
  } finally { globalThis.fetch = original; }
});

test('Chat 正文 stop 后继续读取独立 usage 帧，[DONE] 与正常 EOF 都保留用量', async () => {
  const original=globalThis.fetch;
  try {
    for(const end of ['done','eof']) {
      const usage=[],content=[];
      globalThis.fetch=async(_url,init)=>{
        const body=JSON.parse(init.body),probe=body.response_format?.json_schema?.schema?.properties?.probe?.enum?.[0];
        if(probe)return Response.json({choices:[{message:{content:JSON.stringify({probe})},finish_reason:'stop'}]});
        assert.deepEqual(body.stream_options,{include_usage:true});
        const events=[{choices:[{delta:{content:'{"items":[]}'},finish_reason:null}]},{choices:[{delta:{},finish_reason:'stop'}]},{choices:[],usage:{prompt_tokens:123,completion_tokens:45,total_tokens:168}}];
        const bytes=new TextEncoder().encode(events.map(value=>'data: '+JSON.stringify(value)+'\r\n\r\n').join('')+(end==='done'?'data: [DONE]\r\n\r\n':''));
        return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
      };
      const value=await performProviderRequest({...service,providerId:'openai-compatible',baseUrl:'https://'+end+'.example/v1',model:'fixture',apiKey:'fake-key'}, {}, 'Reply.', {type:'object'}, {onContent:value=>content.push(value),onUsage:value=>usage.push(value)});
      assert.deepEqual(value,{items:[]});assert.deepEqual(content,['{"items":[]}']);assert.deepEqual(usage,[{inputTokens:123,outputTokens:45}]);
    }
  } finally {globalThis.fetch=original;}
});

test('Chat 缺少结束帧的流仍报中断；stop 后的服务错误仍传播', async () => {
  const original=globalThis.fetch;
  try {
    for(const withError of [false,true]) {
      globalThis.fetch=async(_url,init)=>{
        const body=JSON.parse(init.body),probe=body.response_format?.json_schema?.schema?.properties?.probe?.enum?.[0];
        if(probe)return Response.json({choices:[{message:{content:JSON.stringify({probe})},finish_reason:'stop'}]});
        const events=[{choices:[{delta:{content:'{"items":[]}'},finish_reason:withError?'stop':null}]}];
        if(withError)events.push({error:{message:'fixture stream failed'}});
        return new Response(events.map(value=>'data: '+JSON.stringify(value)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
      };
      await assert.rejects(performProviderRequest({...service,providerId:'openai-compatible',baseUrl:'https://error-'+withError+'.example/v1',model:'fixture',apiKey:'fake-key'}, {}, 'Reply.', {type:'object'}, {onContent(){}}),error=>error.code===(withError?'PROVIDER_ERROR':'INVALID_RESPONSE'));
    }
  } finally {globalThis.fetch=original;}
});
