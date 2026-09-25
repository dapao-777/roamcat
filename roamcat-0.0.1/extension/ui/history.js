/**
 * @file extension/ui/history.js
 * 文件职责：设置页阅读记录分区——记录列表、导出清理与摘要编辑。
 * 主要内容：经request()走白名单消息；无密钥触碰。
 * 模块边界：扩展页受信上下文。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import {DOMAINS, request} from '../shared.js';

const byId = id => document.getElementById(id);
const els = Object.fromEntries([
  'history-enabled','history-origin-form','history-origin','history-origin-list','history-origin-empty','history-summaries','history-config-result','history-started','history-metrics','metric-time','metric-words','metric-terms','metric-query-note','metric-sentences','history-chart-metric','history-chart','history-chart-unit','history-chart-description','history-filters','history-search','history-domain','history-source','history-list','history-empty','history-export','history-clear','history-action-result','personalization-enabled','personalization-auto-apply','personalization-service-label','personalization-analyze','personalization-reset','personalization-result','personalization-status','personalization-pending','personalization-override-list','personalization-overrides-empty','personalization-version-list','personalization-versions-empty'
].map(id => [id.replace(/-([a-z])/g,(_match,c)=>c.toUpperCase()),byId(id)]));
els.historyProblem=byId('history-problem');
els.historyMore=byId('history-more');els.historyRangeNote=byId('history-range-note');
Object.assign(els,{historyFirstUse:byId('history-first-use'),historyRecordContent:byId('history-record-content'),historyStatsContent:byId('history-stats-content')});
Object.assign(els,{knownWordList:byId('known-word-list'),knownWordEmpty:byId('known-word-empty'),knownWordResult:byId('known-word-result')});

const HISTORY_PAGE_SIZE=300;
const historyState={days:30,tab:'query',snapshot:null,personalization:null,sequence:0,nextCursor:null};
const stageLabels = {hint:'短注',mark:'仅标记原词',quiet:'暂不自动提示'};
const sourceLabels = {manual:'主动求助',personal:'个人历史词再遇',history:'个人历史词再遇',system:'系统候选',model:'模型生成',legacy:'历史导入',adaptive:'自动策略',default:'默认策略'};
const typeMap = {query:'query',automatic:'annotation',summary:'summary'};
const dateTime = value => value ? new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '未记录';
const dateOnly = value => value ? new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium'}).format(new Date(value)) : '未记录';
const text = value => typeof value === 'string' ? value : '';
const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const setResult = (element,message,error=false) => { element.textContent=message;element.hidden=!message;element.classList.toggle('error',error); };
const errorText = error => error instanceof Error ? error.message : String(error);

function make(tag,className,content) {
  const element=document.createElement(tag);
  if(className) element.className=className;
  if(content!==undefined) element.textContent=content;
  return element;
}
function actionButton(label,handler,className='secondary-button') {
  const button=make('button',className,label);button.type='button';button.addEventListener('click',handler);return button;
}
function formatDuration(ms) {
  const minutes=Math.round(count(ms)/60000);
  if(minutes<60) return `${minutes} 分钟`;
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
function domainName(value) { return DOMAINS[value] || value || '通用'; }
function parseOrigin(value) {
  let parsed;
  try { parsed=new URL(value.trim()); } catch { throw new Error('请输入完整的网站 origin。'); }
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash) throw new Error('网站必须是协议 + 主机，可含端口但不能含路径。');
  return parsed.origin;
}
async function patchConfig(patch,message) {
  resetHistoryPaging();
  const feedback='personalization' in patch||'autoApply' in patch?els.personalizationResult:els.historyConfigResult;
  try {
    await request('HISTORY_CONFIG',{patch});
    await loadHistory();
    if(message) setResult(feedback,message);
  } catch(error) { setResult(feedback,errorText(error),true);renderHistory(); }
}
function resetHistoryPaging(){historyState.nextCursor=null;historyState.sequence++;}
function appendHistoryPage(snapshot){
  const events=[...(historyState.snapshot?.events||[])],ids=new Set(events.map(event=>event?.id).filter(id=>id!=null));
  for(const event of snapshot.events||[]) { if(event?.id!=null&&ids.has(event.id))continue;events.push(event);if(event?.id!=null)ids.add(event.id); }
  return {...historyState.snapshot,...snapshot,events};
}
async function loadHistory({append=false}={}){
  const cursor=append?historyState.nextCursor:null;
  if(append&&!cursor)return;
  const sequence=++historyState.sequence;els.historyMore.disabled=true;
  try{const snapshot=await request('HISTORY_GET',{days:historyState.days,search:els.historySearch.value.trim(),domain:els.historyDomain.value,eventType:typeMap[historyState.tab]||'',limit:HISTORY_PAGE_SIZE,cursor});if(sequence!==historyState.sequence)return;historyState.snapshot=append?appendHistoryPage(snapshot):snapshot;historyState.nextCursor=snapshot.nextCursor||null;renderHistory();}
  catch(error){if(sequence===historyState.sequence){setResult(els.historyProblem,errorText(error),true);setResult(byId('personalization-problem'),errorText(error),true);if(visibleSection()==='privacy')setResult(els.historyActionResult,errorText(error),true);}}
  finally{if(sequence===historyState.sequence)els.historyMore.disabled=false;}
}

function renderConfig() {
  const config=historyState.snapshot?.config||{};
  els.historyEnabled.checked=config.enabled===true;
  els.historySummaries.checked=config.summaries===true;
  els.historySummaries.disabled=!els.historyEnabled.checked;
  els.historyOriginList.replaceChildren();
  for(const origin of config.origins||[]) {
    const row=make('div','history-origin-row');row.append(make('code','',origin),actionButton('移除',()=>void patchConfig({origins:(config.origins||[]).filter(item=>item!==origin)},'允许网站已更新。'),'delete-button'));els.historyOriginList.append(row);
  }
  els.historyOriginEmpty.hidden=Boolean((config.origins||[]).length);
  const snapshot=historyState.snapshot||{};
  const hasData=['events','rules','summaries','daily'].some(key=>snapshot[key]?.length);
  const firstUse=config.enabled!==true&&!snapshot.startedAt&&!config.startedAt&&!hasData;
  els.historyFirstUse.hidden=!firstUse;
  els.historyRecordContent.hidden=firstUse;
  els.historyStatsContent.hidden=firstUse;
  const statsTab=byId('history-view-stats-tab');statsTab.hidden=firstUse;
  if(firstUse&&statsTab.getAttribute('aria-selected')==='true')activateSectionTab(byId('history-view-records-tab'));
  byId('history-period-toolbar').hidden=firstUse||byId('history-view-settings-tab').getAttribute('aria-selected')==='true';
}
function renderKnownWords(){
  const words=Array.isArray(historyState.snapshot?.knownWords)?historyState.snapshot.knownWords:[];els.knownWordList.replaceChildren();
  for(const word of words){
    const row=make('div','known-word-row'),copy=make('div',''),term=make('b','',text(word.term)||word.wordId),date=make('span','muted','不再自动提示 · '+dateTime(word.knownAt));copy.append(term,date);
    const restore=actionButton('恢复自动提示',async()=>{restore.disabled=true;setResult(els.knownWordResult,'');try{await request('WORD_PREFERENCE_SET',{wordId:word.wordId,known:false});setResult(els.knownWordResult,'已恢复“'+(text(word.term)||word.wordId)+'”的自动提示。');await loadHistory();}catch(error){restore.disabled=false;setResult(els.knownWordResult,errorText(error),true);}});
    row.append(copy,restore);els.knownWordList.append(row);
  }
  els.knownWordEmpty.hidden=Boolean(words.length);
}
function renderMetrics() {
  const snapshot=historyState.snapshot||{},metrics=snapshot.metrics||{};
  const enabled=snapshot.config?.enabled===true;
  if(snapshot.problem) { els.metricTime.textContent='不可用';els.metricWords.textContent='不可用';els.metricTerms.textContent='不可用';els.metricQueryNote.textContent='';els.metricSentences.textContent='不可用';els.historyStarted.textContent='统计暂不可用';return; }
  const available=enabled||Boolean(snapshot.config?.startedAt);
  els.metricTime.textContent=available?formatDuration(metrics.activeMs):'未开启';
  els.metricWords.textContent=available?`${count(metrics.words).toLocaleString('zh-CN')} 词`:'未开启';
  els.metricTerms.textContent=available?count(metrics.terms).toLocaleString('zh-CN'):'未开启';
  els.metricQueryNote.textContent=available?`完成 ${count(metrics.queries).toLocaleString('zh-CN')} 次，含短语`:'';
  els.metricSentences.textContent=available?count(metrics.sentences).toLocaleString('zh-CN'):'未开启';
  const started=snapshot.startedAt||snapshot.config?.startedAt;
  els.historyStarted.textContent=started?`统计始于 ${dateOnly(started)} · 明细保留 ${count(snapshot.retentionDays)||90} 天`:'尚未开始统计';
}
function chartValue(day,key) { return count(day?.[key]); }
function chartReadable(value,key) { return key==='activeMs'?formatDuration(value):`${value.toLocaleString('zh-CN')} ${key==='terms'?'词条':'例句'}`; }
function renderChart() {
  const snapshot=historyState.snapshot||{},daily=Array.isArray(snapshot.daily)?snapshot.daily:[],key=els.historyChartMetric.value;
  const labels={activeMs:'活跃时长',terms:'查询词条',sentences:'查阅例句'},unit=key==='activeMs'?'分钟':key==='terms'?'词条':'例句';
  els.historyChartUnit.textContent=`${labels[key]} · 单位：${unit}`;
  els.historyChart.replaceChildren();
    const timestamp=Date.now(),today=new Date(timestamp).toISOString().slice(0,10),dayMs=86400000,first=historyState.days?new Date(Date.parse(today)-(historyState.days-1)*dayMs).toISOString().slice(0,10):daily[0]?.day||today;
    const byDay=new Map(daily.map(day=>[day.day,day])),series=[];for(let date=Date.parse(first);date<=Date.parse(today);date+=dayMs){const day=new Date(date).toISOString().slice(0,10);series.push(byDay.get(day)||{day});}
    const values=series.map(item=>chartValue(item,key)),max=Math.max(0,...values);
    for(let index=0;index<series.length;index++){const item=series[index],value=values[index],bar=make('div','history-bar');bar.style.setProperty('--bar-size',value>0?`${Math.max(2,value/max*100)}%`:'0%');bar.setAttribute('aria-hidden','true');bar.title=`${item.day}：${byDay.has(item.day)?chartReadable(value,key):'无记录'}`;els.historyChart.append(bar);}
    els.historyChart.scrollLeft=els.historyChart.scrollWidth;
  if(snapshot.problem) els.historyChartDescription.textContent='存储发生错误，每日统计暂不可用。';
  else if(!snapshot.config?.enabled&&!daily.length) els.historyChartDescription.textContent='阅读记录未开启，暂无每日统计。';
  else if(!daily.length) els.historyChartDescription.textContent='所选范围内暂无每日统计。';
  else els.historyChartDescription.textContent=`${first} — ${today}。有记录的日期：`+daily.map(item=>item.day+' '+chartReadable(chartValue(item,key),key)).join('；');
}
function matchesSource(item) {
  const filter=els.historySource.value;
  if(!filter) return true;
  if(filter==='manual')return item.type==='query'&&!item.legacy;
  if(filter==='model') return item.modelGenerated===true;
  if(filter==='legacy') return item.legacy===true;
  return filter==='history'?item.type==='annotation'&&item.source==='personal':item.source===filter;
}
function eventTitle(event){return text(event.term)||(event.type==='summary'?'阅读摘要':event.kind==='passage'?'段落查阅':'单句查阅');}
async function mutateHistory(type,payload,message) {
  resetHistoryPaging();
  const feedback=type==='HISTORY_CLEAR'?els.historyActionResult:byId('history-operation-result');
  try { await request(type,payload);setResult(feedback,message);await loadHistory(); }
  catch(error) { setResult(feedback,errorText(error),true); }
}
function renderEventDetails(container,event) {
  const details=make('div','history-event-details');
  if(event.sentence) { details.append(make('b','','保存的原句'),make('p','history-quote',event.sentence)); }
  if(event.explanation) { details.append(make('b','','当时的解释'),make('p','',event.explanation)); }
  if(event.translation) { details.append(make('b','','本句译文'),make('p','',event.translation)); }
  if(!event.sentence&&!event.explanation&&!event.translation) details.append(make('p','muted',event.kind==='passage'?'段落请求只保存数量，不保留原文或译文。':'此记录没有保存原句。'));
  container.append(details);
}
function renderQuery(event) {
  const records=event.records||[event],queryCount=event.legacy?Math.max(1,count(event.helpCount)):records.length,details=document.createElement('details');details.className='history-event';
  const rule=(historyState.snapshot?.rules||[]).find(rule=>rule.term===event.term&&rule.domain===event.domain&&rule.senseKey===event.senseKey);
  const summary=document.createElement('summary'),main=make('div','history-event-main'),term=make('b','',eventTitle(event)),meaning=make('span','',event.legacy?'历史导入 · 既有词聚合不含例句':text(event.sense)||text(event.meaning)||text(event.explanation)||'未保存简短释义');
  main.append(term,meaning);
  const meta=make('div','history-event-meta');meta.append(make('span','',domainName(event.domain)),make('span','',queryCount+' 次查询'),make('span','',`最近 ${dateTime(event.at)}`),make('span','',rule?stageLabels[rule.stage]:(event.stage?'当时 '+stageLabels[event.stage]:'未设内联提示')));
  summary.append(main,meta);details.append(summary);
  if(event.legacy) details.append(make('p','history-event-details muted','此词来自旧版有限聚合，无法补齐逐次查询、精确指标或保存的例句。'));
  else for(const record of records) { const recordBlock=make('div','history-query-record');renderEventDetails(recordBlock,record);const actions=make('div','history-event-actions');actions.append(actionButton('删除这次记录',()=>{if(confirm('确定删除这次记录并同步更新相关统计吗？'))void mutateHistory('HISTORY_DELETE',{id:record.id},'记录已删除。');},'delete-button'));recordBlock.append(actions);details.append(recordBlock); }
  return details;
}
function renderAnnotation(event) {
  const row=make('article','history-event compact'),main=make('div','history-event-main');main.append(make('b','',eventTitle(event)),make('span','',`${sourceLabels[event.source]||event.source||'自动标注'} · ${stageLabels[event.stage]||'未设内联提示'}`));
  const meta=make('div','history-event-meta');meta.append(make('span','',domainName(event.domain)),make('span','',dateTime(event.at)));row.append(main,meta,actionButton('删除',()=>{if(confirm('确定删除这条实际显示记录吗？'))void mutateHistory('HISTORY_DELETE',{id:event.id},'记录已删除。');},'delete-button'));return row;
}
function renderSummary(event) {
  const article=make('article','history-summary-item'),head=make('div','history-summary-head');head.append(make('div','',event.status==='error'?'摘要未生成':event.modelGenerated?'模型生成的阅读摘要':'已更正的阅读摘要'),make('span','muted',dateTime(event.at)));
  const textarea=make('textarea','');textarea.value=text(event.summary);textarea.rows=3;textarea.disabled=event.status==='error';textarea.setAttribute('aria-label','编辑阅读摘要');
  const actions=make('div','provider-actions');actions.append(actionButton('保存更正',()=>void mutateHistory('HISTORY_SUMMARY_EDIT',{id:event.id,summary:textarea.value.trim()},'摘要已更正。')),actionButton('删除',()=>{if(confirm('确定删除这条阅读摘要吗？'))void mutateHistory('HISTORY_DELETE',{id:event.id},'摘要已删除。');},'delete-button'));
  article.append(head,textarea,actions);return article;
}
function renderRule(rule) {
  const row=make('article','history-rule-item'),head=make('div','history-rule-head');head.append(make('b','',text(rule.term)||'未命名词条'),make('span','muted',`${domainName(rule.domain)} · ${text(rule.sense)||'当前义项'}`));
  const reason=make('p','field-help',`${rule.origin==='manual'?'手动设置':rule.origin==='adaptive'?'自动策略':'默认策略'} · ${text(rule.reason)||'未记录原因'}${rule.expiresAt?` · ${dateOnly(rule.expiresAt)} 到期`:''}`);
  const form=make('div','history-rule-controls'),select=document.createElement('select');select.setAttribute('aria-label',`${text(rule.term)}的内联提示深度`);
  for(const [value,label] of [['hint','短注'],['mark','仅标记原词'],['quiet','暂不自动提示'],['','恢复自适应']]) select.append(new Option(label,value));select.value=rule.stage||'';
  const lock=document.createElement('label');lock.className='check-row';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=rule.locked===true;lock.append(checkbox,make('span','','锁定手动选择'));
  const save=actionButton('应用',async()=>{try{await request('HISTORY_RULE_SET',{wordId:rule.wordId,senseKey:rule.senseKey,stage:select.value||null,locked:select.value?checkbox.checked:false});setResult(byId('history-operation-result'),'提示规则已更新。');await loadHistory();}catch(error){setResult(byId('history-operation-result'),errorText(error),true);}});
  form.append(select,lock,save);row.append(head,reason,form);return row;
}
function renderHistoryList() {
  els.historyList.replaceChildren();
  let items=[];
  if(historyState.tab==='rule') items=(historyState.snapshot?.rules||[]).filter(rule=>!els.historyDomain.value||rule.domain===els.historyDomain.value);
  else {
    items=(historyState.snapshot?.events||[]).filter(item=>item.type===typeMap[historyState.tab]&&matchesSource(item));
    if(historyState.tab==='query') {
      const grouped=new Map();
      for(const item of items) { const key=[item.term,item.domain,item.senseKey].join('::'),group=grouped.get(key);if(group)group.records.push(item);else grouped.set(key,{...item,records:[item]}); }
      items=[...grouped.values()];
      for(const legacy of historyState.snapshot?.legacyWords||[]) { const item={...legacy,type:'query',legacy:true,source:'legacy',at:legacy.requestedAt,records:[]},search=els.historySearch.value.trim().toLocaleLowerCase(),domain=els.historyDomain.value;if(matchesSource(item)&&(!search||eventTitle(item).toLocaleLowerCase().includes(search))&&(!domain||item.domain===domain))items.push(item); }
      items.sort((a,b)=>count(b.at)-count(a.at));
    }
  }
  const snapshot=historyState.snapshot||{},loaded=snapshot.events?.length||0;els.historyMore.hidden=historyState.tab==='rule'||!historyState.nextCursor;els.historyRangeNote.textContent=els.historyMore.hidden?'':`已载入 ${loaded} / ${snapshot.total} 条记录；当前查询次数仅汇总已载入部分。`;
  for(const item of items) els.historyList.append(historyState.tab==='query'?renderQuery(item):historyState.tab==='automatic'?renderAnnotation(item):historyState.tab==='summary'?renderSummary(item):renderRule(item));
  els.historyEmpty.hidden=Boolean(items.length);
  els.historyEmpty.textContent=historyState.tab==='rule'?'尚无提示规则。':historyState.snapshot?.config?.enabled===false?'阅读记录未开启。':'此范围内没有记录。';
}
function renderHistory() { const problem=text(historyState.snapshot?.problem);setResult(els.historyProblem,problem,true);setResult(byId('personalization-problem'),problem,true);renderConfig();renderKnownWords();renderMetrics();renderChart();renderHistoryList();if(problem)els.historyEmpty.hidden=true; }

function displayValue(value) {
  if(Array.isArray(value)) return value.map(item=>typeof item==='object'?(item.label||item.title||item.id||JSON.stringify(item)):item).join('、');
  if(value&&typeof value==='object') return value.label||value.title||value.value||JSON.stringify(value);
  if(value===true) return '开启';if(value===false) return '关闭';return value==null||value===''?'未设置':String(value);
}
function labeledRows(object,skip=[]) {
  const fragment=document.createDocumentFragment();
  for(const [key,value] of Object.entries(object||{})) { if(skip.includes(key)) continue;const row=make('div','personalization-row');row.append(make('span','',key),make('b','',displayValue(value)));fragment.append(row); }
  return fragment;
}
function policyRows(policy) {
  const value=policy||{},annotation=value.annotation||{},translation=value.translation||{};
  return labeledRows({
    '标注密度':annotation.density==='sparse'?'较少':'标准',
    '优先词条':Array.isArray(annotation.priorityTerms)&&annotation.priorityTerms.length?annotation.priorityTerms.join('、'):'无',
    '提示显示方式':stageLabels[annotation.depth]||'短注',
    '领域倾向':domainName(value.domainBias),
    '解释长度':translation.detail==='concise'?'简洁':'标准',
    '术语处理':translation.terminology==='consistent'?'保持一致':'依语境调整',
    '上下文侧重':translation.focus==='usage'?'用法':'含义'
  });
}
async function personalizationAction(type,payload,message) {
  try { historyState.personalization=await request(type,payload);setResult(els.personalizationResult,message);renderPersonalization();await loadHistory(); }
  catch(error) { setResult(els.personalizationResult,errorText(error),true); }
}
function renderPersonalization() {
  const state=historyState.personalization||{},config=state.config||historyState.snapshot?.config||{};
  els.personalizationEnabled.checked=config.personalization===true;
  els.personalizationAutoApply.checked=config.autoApply===true;els.personalizationAutoApply.disabled=!els.personalizationEnabled.checked;
  els.personalizationServiceLabel.textContent=text(state.serviceLabel)||'未选择服务';
  const personalizationEnabled=config.personalization===true;
  els.personalizationAnalyze.disabled=!personalizationEnabled;
  els.personalizationStatus.replaceChildren();
  const analysisError=text(state.analysisError),insufficient=/至少|证据|查询或摘要/.test(analysisError),pending=state.pending;
  const status={
    '授权状态':config.personalization?'已授权分析':'未授权，不会分析或应用调整',
    '证据状态':!config.enabled||!(config.origins||[]).length?'未授权采集':insufficient?'证据不足':state.lastAnalysisAt?'已有已分析证据':'待积累证据',
    '调整状态':pending?'待确认，尚未生效':state.profile?'已应用':'未应用，当前为默认配置',
    '最近分析':state.lastAnalysisAt?dateTime(state.lastAnalysisAt):'尚未分析',
    '最近尝试':Math.max(state.lastAttemptAt||0,state.lastManualAttemptAt||0)?dateTime(Math.max(state.lastAttemptAt||0,state.lastManualAttemptAt||0)):'尚无尝试',
    '分析结果':!config.personalization?'已关闭':analysisError||'无错误'
  };
  const effective=state.profile?.after||{annotation:{density:'standard',priorityTerms:[],depth:'hint'},domainBias:'general',translation:{detail:'standard',terminology:'contextual',focus:'meaning'}};
  const effectiveHeading=make('div','history-chart-heading');effectiveHeading.append(make('div','',state.profile?'实际生效的辅助调整':'实际生效值（默认）'));
  if(personalizationEnabled){
    const summary=make('div','personalization-off-state');
    summary.append(make('b','',pending?'有调整等待确认':state.profile?'辅助调整已生效':'已允许分析'),make('p','field-help',analysisError||(!config.enabled||!(config.origins||[]).length?'请先在阅读记录中开启采集，并添加允许记录的网站。':state.lastAnalysisAt?'最近分析：'+dateTime(state.lastAnalysisAt):'先积累 3 个有效会话或 10 次查询，再开始分析。')));
    const details=make('details','calculation-note');details.append(make('summary','','查看分析详情'),labeledRows(status),effectiveHeading,policyRows(effective));
    els.personalizationStatus.append(summary,details);
  }
  else {
    const copy=make('div','personalization-off-state');
    copy.append(make('b','','分析未开启'),make('p','field-help','不会发送阅读证据，也不会自动应用调整。需要时先开启授权，再手动开始分析。'));
    els.personalizationStatus.append(copy);
  }
  els.personalizationPending.hidden=!pending||!personalizationEnabled;els.personalizationPending.replaceChildren();
  if(pending&&personalizationEnabled) {
    const id=pending.id||pending.proposalId,heading=make('div','history-chart-heading');heading.append(make('div','',pending.title||'待确认的个性化提案'));
    const summary=make('p','field-help',text(pending.summary)||text(pending.reason)||'此调整需要你确认后才会生效。');
    const changes=make('div','override-list');changes.append(policyRows(pending.after));if((pending.evidenceIds||[]).length)changes.append(make('p','field-help',`依据记录：${pending.evidenceIds.join('、')}`));
    const actions=make('div','provider-actions');actions.append(actionButton('应用提案',()=>void personalizationAction('PERSONALIZATION_APPLY',{id},'提案已应用。'),'primary-action'),actionButton('拒绝',()=>void personalizationAction('PERSONALIZATION_DISMISS',{},'提案已拒绝。')));els.personalizationPending.append(heading,summary,changes,actions);
  }
  els.personalizationOverrideList.replaceChildren();
  const overrides=Array.isArray(state.overrides)?state.overrides:[];
  for(const item of overrides) { const row=make('div','personalization-row'),label=item.label||item.key||item.wordId||item.scope||'调整',value=item.stage?`${stageLabels[item.stage]||item.stage}${item.locked?' · 已锁定':''}`:displayValue(item.value??item.after??item.setting);row.append(make('span','',label),make('b','',value));els.personalizationOverrideList.append(row); }
  if(state.profile?.after&&Object.keys(state.profile.after).length) { const row=make('div','personalization-profile');row.append(make('b','','当前辅助配置'),policyRows(state.profile.after));els.personalizationOverrideList.append(row); }
  els.personalizationOverridesEmpty.hidden=Boolean(overrides.length||state.profile?.after&&Object.keys(state.profile.after).length);
  els.personalizationVersionList.replaceChildren();
  for(const version of state.versions||[]) {
    const row=make('article','personalization-version'),info=make('div','');info.append(make('b','',version.label||version.title||`版本 ${version.id}`),make('p','field-help',`${({applied:'已应用',rolledBack:'已撤销',dismissed:'已拒绝',expired:'已过期',invalidated:'依据已更改'})[version.status]||version.status} · ${dateTime(version.at)}${version.expiresAt?` · ${dateOnly(version.expiresAt)} 到期`:''}`));
    if(version.after&&Object.keys(version.after).length)info.append(policyRows(version.after));if((version.evidenceIds||[]).length)info.append(make('p','field-help',`依据记录：${version.evidenceIds.join('、')}`));row.append(info);if(version.status==='applied')row.append(actionButton('撤销这次调整',()=>{if(confirm('确定撤销这次调整，恢复到该次调整之前的配置吗？'))void personalizationAction('PERSONALIZATION_ROLLBACK',{id:version.id},'已回滚个性化调整。');}));els.personalizationVersionList.append(row);
  }
  els.personalizationVersionsEmpty.hidden=Boolean((state.versions||[]).length);
}
async function loadPersonalization() {
  try { historyState.personalization=await request('PERSONALIZATION_GET');renderPersonalization(); }
  catch(error) { setResult(els.personalizationResult,errorText(error),true); }
}
function downloadJson(data,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}
function activateTab(button) {
  for(const tab of document.querySelectorAll('[data-history-tab]')) { const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1; }
  historyState.tab=button.dataset.historyTab;els.historyList.setAttribute('aria-labelledby',button.id);resetHistoryPaging();els.historySearch.disabled=historyState.tab==='rule';els.historyDomain.disabled=false;els.historySource.disabled=historyState.tab==='rule';void loadHistory();
}
function activateSectionTab(button,{focus=false}={}) {
  const group=button.dataset.sectionTab,tabs=[...document.querySelectorAll('[data-section-tab="'+group+'"]')];
  for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;byId(tab.dataset.target).hidden=!active;}
  if(group==='history')byId('history-period-toolbar').hidden=!els.historyFirstUse.hidden||button.dataset.target==='history-view-settings';
  if(focus)button.focus();
}
function visibleSection() { return location.hash.slice(1); }
function loadVisibleSection() {
  const section=visibleSection();
  if(section==='history'||section==='privacy') void loadHistory();
  else if(section==='personalization') void Promise.all([loadHistory(),loadPersonalization()]);
}

for(const [value,label] of Object.entries(DOMAINS)) if(value!=='auto') els.historyDomain.append(new Option(label,value));
els.historyEnabled.addEventListener('change',()=>void patchConfig({enabled:els.historyEnabled.checked},els.historyEnabled.checked?'阅读记录已开启。':'阅读记录已关闭；已有数据仍保留。'));
els.historySummaries.addEventListener('change',()=>void patchConfig({summaries:els.historySummaries.checked},els.historySummaries.checked?'模型摘要已开启。':'模型摘要已关闭。'));
els.historyOriginForm.addEventListener('submit',event=>{event.preventDefault();try{const origin=parseOrigin(els.historyOrigin.value),origins=[...new Set([...(historyState.snapshot?.config?.origins||[]),origin])];void patchConfig({origins},'允许网站已更新。');event.target.reset();}catch(error){setResult(els.historyConfigResult,errorText(error),true);}});
document.querySelectorAll('input[name="history-days"]').forEach(input=>input.addEventListener('change',()=>{historyState.days=Number(input.value);resetHistoryPaging();void loadHistory();}));
els.historyChartMetric.addEventListener('change',renderChart);els.historyFilters.addEventListener('submit',event=>{event.preventDefault();resetHistoryPaging();void loadHistory();});els.historySource.addEventListener('change',()=>{resetHistoryPaging();void loadHistory();});
els.historyMore.addEventListener('click',()=>void loadHistory({append:true}));
document.querySelectorAll('[data-history-tab]').forEach(button=>{button.addEventListener('click',()=>activateTab(button));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-history-tab]')],index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();tabs[next].focus();activateTab(tabs[next]);});});
document.querySelectorAll('[data-section-tab]').forEach(button=>{button.addEventListener('click',()=>activateSectionTab(button));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-section-tab="'+button.dataset.sectionTab+'"]')].filter(tab=>!tab.hidden),index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();activateSectionTab(tabs[next],{focus:true});});});
document.querySelectorAll('[data-open-section-tab]').forEach(button=>button.addEventListener('click',()=>{const target=button.dataset.openSectionTab,tab=document.querySelector('[data-target="'+target+'"]');if(tab)activateSectionTab(tab,{focus:true});}));
els.historyExport.addEventListener('click',async()=>{try{const data=await request('HISTORY_EXPORT');downloadJson(data,`roamcat-history-${new Date().toISOString().slice(0,10)}.json`);setResult(els.historyActionResult,'完整记录已导出。');}catch(error){setResult(els.historyActionResult,errorText(error),true);}});
els.historyClear.addEventListener('click',()=>{if(confirm('确定清空全部阅读记录、统计、摘要和个性化版本吗？此操作无法撤销。'))void mutateHistory('HISTORY_CLEAR',{},'阅读记录与个性化数据已清空。');});
els.personalizationEnabled.addEventListener('change',()=>void patchConfig({personalization:els.personalizationEnabled.checked},els.personalizationEnabled.checked?'个性化分析已开启。':'个性化分析已关闭。').then(loadPersonalization));
els.personalizationAutoApply.addEventListener('change',()=>void patchConfig({autoApply:els.personalizationAutoApply.checked},els.personalizationAutoApply.checked?'低风险调整可自动应用。':'调整将等待确认。').then(loadPersonalization));
els.personalizationAnalyze.addEventListener('click',()=>void personalizationAction('PERSONALIZATION_ANALYZE',{},'分析已完成。'));
els.personalizationReset.addEventListener('click',()=>{if(confirm('确定恢复默认配置并清除手动规则吗？此操作会留下可追溯的重置版本。'))void personalizationAction('PERSONALIZATION_RESET',{},'个性化配置已恢复默认。');});
window.addEventListener('hashchange',loadVisibleSection);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadVisibleSection();});
loadVisibleSection();
