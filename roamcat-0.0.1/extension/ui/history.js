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

const M=(zh,en)=>globalThis.RoamCatI18n?.lang?.()==='en'?en:zh;
const UILOCALE=()=>M('zh-CN','en-US');

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
const stageLabels = {hint:M('短注','Brief hint'),mark:M('仅标记原词','Mark word only'),quiet:M('暂不自动提示','No auto hints')};
const sourceLabels = {manual:M('主动求助','Manual lookup'),personal:M('个人历史词再遇','Re-encountered word'),history:M('个人历史词再遇','Re-encountered word'),system:M('系统候选','System candidate'),model:M('模型生成','Model-generated'),legacy:M('历史导入','Legacy import'),adaptive:M('自动策略','Adaptive'),default:M('默认策略','Default')};
const typeMap = {query:'query',automatic:'annotation',summary:'summary'};
const dateTime = value => value ? new Intl.DateTimeFormat(UILOCALE(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : M('未记录','Not recorded');
const dateOnly = value => value ? new Intl.DateTimeFormat(UILOCALE(),{dateStyle:'medium'}).format(new Date(value)) : M('未记录','Not recorded');
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
  if(minutes<60) return M(`${minutes} 分钟`,`${minutes} min`);
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return rest ? M(`${hours} 小时 ${rest} 分钟`,`${hours} h ${rest} min`) : M(`${hours} 小时`,`${hours} h`);
}
function domainName(value) { return globalThis.RoamCatI18n?.t?.('domain.'+value) ?? (DOMAINS[value] || value || M('通用','General')); }
function parseOrigin(value) {
  let parsed;
  try { parsed=new URL(value.trim()); } catch { throw new Error(M('请输入完整的网站 origin。','Please enter a complete site origin.')); }
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash) throw new Error(M('网站必须是协议 + 主机，可含端口但不能含路径。','The site must be scheme + host; a port is allowed, but no path.'));
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
    const row=make('div','history-origin-row');row.append(make('code','',origin),actionButton(M('移除','Remove'),()=>void patchConfig({origins:(config.origins||[]).filter(item=>item!==origin)},M('允许网站已更新。','Allowed sites updated.')),'delete-button'));els.historyOriginList.append(row);
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
    const row=make('div','known-word-row'),copy=make('div',''),term=make('b','',text(word.term)||word.wordId),date=make('span','muted',M('不再自动提示 · ','Stop auto-hinting · ')+dateTime(word.knownAt));copy.append(term,date);
    const restore=actionButton(M('恢复自动提示','Resume auto-hints'),async()=>{restore.disabled=true;setResult(els.knownWordResult,'');try{await request('WORD_PREFERENCE_SET',{wordId:word.wordId,known:false});setResult(els.knownWordResult,M('已恢复“','Resumed auto-hints for “')+(text(word.term)||word.wordId)+M('”的自动提示。','”.'));await loadHistory();}catch(error){restore.disabled=false;setResult(els.knownWordResult,errorText(error),true);}});
    row.append(copy,restore);els.knownWordList.append(row);
  }
  els.knownWordEmpty.hidden=Boolean(words.length);
}
function renderMetrics() {
  const snapshot=historyState.snapshot||{},metrics=snapshot.metrics||{};
  const enabled=snapshot.config?.enabled===true;
  if(snapshot.problem) { els.metricTime.textContent=M('不可用','N/A');els.metricWords.textContent=M('不可用','N/A');els.metricTerms.textContent=M('不可用','N/A');els.metricQueryNote.textContent='';els.metricSentences.textContent=M('不可用','N/A');els.historyStarted.textContent=M('统计暂不可用','Stats unavailable');return; }
  const available=enabled||Boolean(snapshot.config?.startedAt);
  els.metricTime.textContent=available?formatDuration(metrics.activeMs):M('未开启','Off');
  els.metricWords.textContent=available?M(`${count(metrics.words).toLocaleString(UILOCALE())} 词`,`${count(metrics.words).toLocaleString(UILOCALE())} words`):M('未开启','Off');
  els.metricTerms.textContent=available?count(metrics.terms).toLocaleString(UILOCALE()):M('未开启','Off');
  els.metricQueryNote.textContent=available?M(`完成 ${count(metrics.queries).toLocaleString(UILOCALE())} 次，含短语`,`${count(metrics.queries).toLocaleString(UILOCALE())} lookups incl. phrases`):'';
  els.metricSentences.textContent=available?count(metrics.sentences).toLocaleString(UILOCALE()):M('未开启','Off');
  const started=snapshot.startedAt||snapshot.config?.startedAt;
  els.historyStarted.textContent=started?M(`统计始于 ${dateOnly(started)} · 明细保留 ${count(snapshot.retentionDays)||90} 天`,`Stats since ${dateOnly(started)} · details kept ${count(snapshot.retentionDays)||90} days`):M('尚未开始统计','Stats not started yet');
}
function chartValue(day,key) { return count(day?.[key]); }
function chartReadable(value,key) { return key==='activeMs'?formatDuration(value):`${value.toLocaleString(UILOCALE())} ${key==='terms'?M('词条','terms'):M('例句','sentences')}`; }
function renderChart() {
  const snapshot=historyState.snapshot||{},daily=Array.isArray(snapshot.daily)?snapshot.daily:[],key=els.historyChartMetric.value;
  const labels={activeMs:M('活跃时长','Active time'),terms:M('查询词条','Terms looked up'),sentences:M('查阅例句','Sentences viewed')},unit=key==='activeMs'?M('分钟','min'):key==='terms'?M('词条','terms'):M('例句','sentences');
  els.historyChartUnit.textContent=`${labels[key]}${M(' · 单位：',' · unit: ')}${unit}`;
  els.historyChart.replaceChildren();
    const timestamp=Date.now(),today=new Date(timestamp).toISOString().slice(0,10),dayMs=86400000,first=historyState.days?new Date(Date.parse(today)-(historyState.days-1)*dayMs).toISOString().slice(0,10):daily[0]?.day||today;
    const byDay=new Map(daily.map(day=>[day.day,day])),series=[];for(let date=Date.parse(first);date<=Date.parse(today);date+=dayMs){const day=new Date(date).toISOString().slice(0,10);series.push(byDay.get(day)||{day});}
    const values=series.map(item=>chartValue(item,key)),max=Math.max(0,...values);
    for(let index=0;index<series.length;index++){const item=series[index],value=values[index],bar=make('div','history-bar');bar.style.setProperty('--bar-size',value>0?`${Math.max(2,value/max*100)}%`:'0%');bar.setAttribute('aria-hidden','true');bar.title=`${item.day}: ${byDay.has(item.day)?chartReadable(value,key):M('无记录','no record')}`;els.historyChart.append(bar);}
    els.historyChart.scrollLeft=els.historyChart.scrollWidth;
  if(snapshot.problem) els.historyChartDescription.textContent=M('存储发生错误，每日统计暂不可用。','A storage error occurred; daily stats are unavailable.');
  else if(!snapshot.config?.enabled&&!daily.length) els.historyChartDescription.textContent=M('阅读记录未开启，暂无每日统计。','Reading history is off; no daily stats yet.');
  else if(!daily.length) els.historyChartDescription.textContent=M('所选范围内暂无每日统计。','No daily stats in the selected range.');
  else els.historyChartDescription.textContent=`${first} — ${today}${M('。有记录的日期：','. Days with records: ')}`+daily.map(item=>item.day+' '+chartReadable(chartValue(item,key),key)).join('；');
}
function matchesSource(item) {
  const filter=els.historySource.value;
  if(!filter) return true;
  if(filter==='manual')return item.type==='query'&&!item.legacy;
  if(filter==='model') return item.modelGenerated===true;
  if(filter==='legacy') return item.legacy===true;
  return filter==='history'?item.type==='annotation'&&item.source==='personal':item.source===filter;
}
function eventTitle(event){return text(event.term)||(event.type==='summary'?M('阅读摘要','Reading summary'):event.kind==='passage'?M('段落查阅','Passage lookup'):M('单句查阅','Sentence lookup'));}
async function mutateHistory(type,payload,message) {
  resetHistoryPaging();
  const feedback=type==='HISTORY_CLEAR'?els.historyActionResult:byId('history-operation-result');
  try { await request(type,payload);setResult(feedback,message);await loadHistory(); }
  catch(error) { setResult(feedback,errorText(error),true); }
}
function renderEventDetails(container,event) {
  const details=make('div','history-event-details');
  if(event.sentence) { details.append(make('b','',M('保存的原句','Saved sentence')),make('p','history-quote',event.sentence)); }
  if(event.explanation) { details.append(make('b','',M('当时的解释','Explanation at the time')),make('p','',event.explanation)); }
  if(event.translation) { details.append(make('b','',M('本句译文','Sentence translation')),make('p','',event.translation)); }
  if(!event.sentence&&!event.explanation&&!event.translation) details.append(make('p','muted',event.kind==='passage'?M('段落请求只保存数量，不保留原文或译文。','Passage requests only keep counts, not source text or translations.'):M('此记录没有保存原句。','This record has no saved sentence.')));
  container.append(details);
}
function renderQuery(event) {
  const records=event.records||[event],queryCount=event.legacy?Math.max(1,count(event.helpCount)):records.length,details=document.createElement('details');details.className='history-event';
  const rule=(historyState.snapshot?.rules||[]).find(rule=>rule.term===event.term&&rule.domain===event.domain&&rule.senseKey===event.senseKey);
  const summary=document.createElement('summary'),main=make('div','history-event-main'),term=make('b','',eventTitle(event)),meaning=make('span','',event.legacy?M('历史导入 · 既有词聚合不含例句','Legacy import · aggregated entries have no example sentences'):text(event.sense)||text(event.meaning)||text(event.explanation)||M('未保存简短释义','No short definition saved'));
  main.append(term,meaning);
  const meta=make('div','history-event-meta');meta.append(make('span','',domainName(event.domain)),make('span','',queryCount+M(' 次查询',' lookups')),make('span','',M(`最近 ${dateTime(event.at)}`,`Last seen ${dateTime(event.at)}`)),make('span','',rule?stageLabels[rule.stage]:(event.stage?M('当时 ','then: ')+stageLabels[event.stage]:'未设内联提示')));
  summary.append(main,meta);details.append(summary);
  if(event.legacy) details.append(make('p','history-event-details muted',M('此词来自旧版有限聚合，无法补齐逐次查询、精确指标或保存的例句。','This word comes from legacy aggregated data; per-query records, exact metrics, and saved sentences cannot be reconstructed.')));
  else for(const record of records) { const recordBlock=make('div','history-query-record');renderEventDetails(recordBlock,record);const actions=make('div','history-event-actions');actions.append(actionButton(M('删除这次记录','Delete this record'),()=>{if(confirm(M('确定删除这次记录并同步更新相关统计吗？','Delete this record and update related stats?')))void mutateHistory('HISTORY_DELETE',{id:record.id},M('记录已删除。','Record deleted.'));},'delete-button'));recordBlock.append(actions);details.append(recordBlock); }
  return details;
}
function renderAnnotation(event) {
  const row=make('article','history-event compact'),main=make('div','history-event-main');main.append(make('b','',eventTitle(event)),make('span','',`${sourceLabels[event.source]||event.source||M('自动标注','auto-annotated')} · ${stageLabels[event.stage]||M('未设内联提示','no inline hint')}`));
  const meta=make('div','history-event-meta');meta.append(make('span','',domainName(event.domain)),make('span','',dateTime(event.at)));row.append(main,meta,actionButton(M('删除','Delete'),()=>{if(confirm(M('确定删除这条实际显示记录吗？','Delete this shown record?')))void mutateHistory('HISTORY_DELETE',{id:event.id},M('记录已删除。','Record deleted.'));},'delete-button'));return row;
}
function renderSummary(event) {
  const article=make('article','history-summary-item'),head=make('div','history-summary-head');head.append(make('div','',event.status==='error'?M('摘要未生成','Summary not generated'):event.modelGenerated?M('模型生成的阅读摘要','Model-generated reading summary'):M('已更正的阅读摘要','Corrected reading summary')),make('span','muted',dateTime(event.at)));
  const textarea=make('textarea','');textarea.value=text(event.summary);textarea.rows=3;textarea.disabled=event.status==='error';textarea.setAttribute('aria-label',M('编辑阅读摘要','Edit reading summary'));
  const actions=make('div','provider-actions');actions.append(actionButton(M('保存更正','Save correction'),()=>void mutateHistory('HISTORY_SUMMARY_EDIT',{id:event.id,summary:textarea.value.trim()},M('摘要已更正。','Summary corrected.'))),actionButton(M('删除','Delete'),()=>{if(confirm(M('确定删除这条阅读摘要吗？','Delete this reading summary?')))void mutateHistory('HISTORY_DELETE',{id:event.id},M('摘要已删除。','Summary deleted.'));},'delete-button'));
  article.append(head,textarea,actions);return article;
}
function renderRule(rule) {
  const row=make('article','history-rule-item'),head=make('div','history-rule-head');head.append(make('b','',text(rule.term)||M('未命名词条','Unnamed entry')),make('span','muted',`${domainName(rule.domain)} · ${text(rule.sense)||M('当前义项','current sense')}`));
  const reason=make('p','field-help',`${rule.origin==='manual'?M('手动设置','manual'):rule.origin==='adaptive'?M('自动策略','Adaptive'):M('默认策略','Default')} · ${text(rule.reason)||M('未记录原因','no reason recorded')}${rule.expiresAt?` · ${M('到期：','expires ')}${dateOnly(rule.expiresAt)}`:''}`);
  const form=make('div','history-rule-controls'),select=document.createElement('select');select.setAttribute('aria-label',M(`${text(rule.term)}的内联提示深度`,`Inline hint depth for ${text(rule.term)}`));
  for(const [value,label] of [['hint',M('短注','Brief hint')],['mark',M('仅标记原词','Mark word only')],['quiet',M('暂不自动提示','No auto hints')],['',M('恢复自适应','Restore adaptive')]]) select.append(new Option(label,value));select.value=rule.stage||'';
  const lock=document.createElement('label');lock.className='check-row';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=rule.locked===true;lock.append(checkbox,make('span','',M('锁定手动选择','Lock manual choice')));
  const save=actionButton(M('应用','Apply'),async()=>{try{await request('HISTORY_RULE_SET',{wordId:rule.wordId,senseKey:rule.senseKey,stage:select.value||null,locked:select.value?checkbox.checked:false});setResult(byId('history-operation-result'),M('提示规则已更新。','Hint rule updated.'));await loadHistory();}catch(error){setResult(byId('history-operation-result'),errorText(error),true);}});
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
  const snapshot=historyState.snapshot||{},loaded=snapshot.events?.length||0;els.historyMore.hidden=historyState.tab==='rule'||!historyState.nextCursor;els.historyRangeNote.textContent=els.historyMore.hidden?'':M(`已载入 ${loaded} / ${snapshot.total} 条记录；当前查询次数仅汇总已载入部分。`,`Loaded ${loaded} / ${snapshot.total} records; query counts cover only the loaded part.`);
  for(const item of items) els.historyList.append(historyState.tab==='query'?renderQuery(item):historyState.tab==='automatic'?renderAnnotation(item):historyState.tab==='summary'?renderSummary(item):renderRule(item));
  els.historyEmpty.hidden=Boolean(items.length);
  els.historyEmpty.textContent=historyState.tab==='rule'?M('尚无提示规则。','No hint rules yet.'):historyState.snapshot?.config?.enabled===false?M('阅读记录未开启。','Reading history is off.'):M('此范围内没有记录。','No records in this range.');
}
function renderHistory() { const problem=text(historyState.snapshot?.problem);setResult(els.historyProblem,problem,true);setResult(byId('personalization-problem'),problem,true);renderConfig();renderKnownWords();renderMetrics();renderChart();renderHistoryList();if(problem)els.historyEmpty.hidden=true; }

function displayValue(value) {
  if(Array.isArray(value)) return value.map(item=>typeof item==='object'?(item.label||item.title||item.id||JSON.stringify(item)):item).join('、');
  if(value&&typeof value==='object') return value.label||value.title||value.value||JSON.stringify(value);
  if(value===true) return M('开启','On');if(value===false) return M('关闭','Off');return value==null||value===''?M('未设置','Unset'):String(value);
}
function labeledRows(object,skip=[]) {
  const fragment=document.createDocumentFragment();
  for(const [key,value] of Object.entries(object||{})) { if(skip.includes(key)) continue;const row=make('div','personalization-row');row.append(make('span','',key),make('b','',displayValue(value)));fragment.append(row); }
  return fragment;
}
function policyRows(policy) {
  const value=policy||{},annotation=value.annotation||{},translation=value.translation||{};
  return labeledRows({
    [M('标注密度','Annotation density')]:annotation.density==='sparse'?M('较少','Fewer'):M('标准','Standard'),
    [M('优先词条','Priority terms')]:Array.isArray(annotation.priorityTerms)&&annotation.priorityTerms.length?annotation.priorityTerms.join('、'):M('无','None'),
    [M('提示显示方式','Hint display')]:stageLabels[annotation.depth]||M('短注','Brief hint'),
    [M('领域倾向','Domain bias')]:domainName(value.domainBias),
    [M('解释长度','Explanation length')]:translation.detail==='concise'?M('简洁','Concise'):M('标准','Standard'),
    [M('术语处理','Term handling')]:translation.terminology==='consistent'?M('保持一致','Keep consistent'):M('依语境调整','Adapt to context'),
    [M('上下文侧重','Context focus')]:translation.focus==='usage'?M('用法','Usage'):M('含义','Meaning')
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
  els.personalizationServiceLabel.textContent=text(state.serviceLabel)||M('未选择服务','No service selected');
  const personalizationEnabled=config.personalization===true;
  els.personalizationAnalyze.disabled=!personalizationEnabled;
  els.personalizationStatus.replaceChildren();
  const analysisError=text(state.analysisError),insufficient=/至少|证据|查询或摘要/.test(analysisError),pending=state.pending;
  const status={
    [M('授权状态','Authorization')]:config.personalization?M('已授权分析','Authorized to analyze'):M('未授权，不会分析或应用调整','Not authorized; nothing is analyzed or applied'),
    [M('证据状态','Evidence status')]:!config.enabled||!(config.origins||[]).length?M('未授权采集','Collection not authorized'):insufficient?M('证据不足','Not enough evidence'):state.lastAnalysisAt?M('已有已分析证据','Analyzed evidence exists'):M('待积累证据','Evidence pending'),
    [M('调整状态','Adjustment status')]:pending?M('待确认，尚未生效','Pending confirmation, not in effect'):state.profile?M('已应用','Applied'):M('未应用，当前为默认配置','Not applied; default config in use'),
    [M('最近分析','Last analysis')]:state.lastAnalysisAt?dateTime(state.lastAnalysisAt):M('尚未分析','Not analyzed yet'),
    [M('最近尝试','Last attempt')]:Math.max(state.lastAttemptAt||0,state.lastManualAttemptAt||0)?dateTime(Math.max(state.lastAttemptAt||0,state.lastManualAttemptAt||0)):M('尚无尝试','No attempts yet'),
    [M('分析结果','Analysis result')]:!config.personalization?M('已关闭','Off'):analysisError||M('无错误','No errors')
  };
  const effective=state.profile?.after||{annotation:{density:'standard',priorityTerms:[],depth:'hint'},domainBias:'general',translation:{detail:'standard',terminology:'contextual',focus:'meaning'}};
  const effectiveHeading=make('div','history-chart-heading');effectiveHeading.append(make('div','',state.profile?M('实际生效的辅助调整','Effective assist adjustments'):M('实际生效值（默认）','Effective value (default)')));
  if(personalizationEnabled){
    const summary=make('div','personalization-off-state');
    summary.append(make('b','',pending?M('有调整等待确认','An adjustment awaits confirmation'):state.profile?M('辅助调整已生效','Assist adjustment in effect'):M('已允许分析','Analysis allowed')),make('p','field-help',analysisError||(!config.enabled||!(config.origins||[]).length?M('请先在阅读记录中开启采集，并添加允许记录的网站。','Enable collection in reading history and add allowed sites first.'):state.lastAnalysisAt?M('最近分析：','Last analysis: ')+dateTime(state.lastAnalysisAt):M('先积累 3 个有效会话或 10 次查询，再开始分析。','Gather 3 valid sessions or 10 lookups before analysis.'))));
    const details=make('details','calculation-note');details.append(make('summary','',M('查看分析详情','View analysis details')),labeledRows(status),effectiveHeading,policyRows(effective));
    els.personalizationStatus.append(summary,details);
  }
  else {
    const copy=make('div','personalization-off-state');
    copy.append(make('b','',M('分析未开启','Analysis is off')),make('p','field-help',M('不会发送阅读证据，也不会自动应用调整。需要时先开启授权，再手动开始分析。','No reading evidence is sent and no adjustments are auto-applied. Authorize first, then start analysis manually.')));
    els.personalizationStatus.append(copy);
  }
  els.personalizationPending.hidden=!pending||!personalizationEnabled;els.personalizationPending.replaceChildren();
  if(pending&&personalizationEnabled) {
    const id=pending.id||pending.proposalId,heading=make('div','history-chart-heading');heading.append(make('div','',pending.title||M('待确认的个性化提案','Personalization proposals pending confirmation')));
    const summary=make('p','field-help',text(pending.summary)||text(pending.reason)||M('此调整需要你确认后才会生效。','This adjustment takes effect only after your confirmation.'));
    const changes=make('div','override-list');changes.append(policyRows(pending.after));if((pending.evidenceIds||[]).length)changes.append(make('p','field-help',`${M('依据记录：','Evidence: ')}${pending.evidenceIds.join(', ')}`));
    const actions=make('div','provider-actions');actions.append(actionButton(M('应用提案','Apply proposal'),()=>void personalizationAction('PERSONALIZATION_APPLY',{id},M('提案已应用。','Proposal applied.')),'primary-action'),actionButton(M('拒绝','Reject'),()=>void personalizationAction('PERSONALIZATION_DISMISS',{},M('提案已拒绝。','Proposal rejected.'))));els.personalizationPending.append(heading,summary,changes,actions);
  }
  els.personalizationOverrideList.replaceChildren();
  const overrides=Array.isArray(state.overrides)?state.overrides:[];
  for(const item of overrides) { const row=make('div','personalization-row'),label=item.label||item.key||item.wordId||item.scope||M('调整','adjustment'),value=item.stage?`${stageLabels[item.stage]||item.stage}${item.locked?' · 已锁定':''}`:displayValue(item.value??item.after??item.setting);row.append(make('span','',label),make('b','',value));els.personalizationOverrideList.append(row); }
  if(state.profile?.after&&Object.keys(state.profile.after).length) { const row=make('div','personalization-profile');row.append(make('b','',M('当前辅助配置','Current assist config')),policyRows(state.profile.after));els.personalizationOverrideList.append(row); }
  els.personalizationOverridesEmpty.hidden=Boolean(overrides.length||state.profile?.after&&Object.keys(state.profile.after).length);
  els.personalizationVersionList.replaceChildren();
  for(const version of state.versions||[]) {
    const row=make('article','personalization-version'),info=make('div','');info.append(make('b','',version.label||version.title||M(`版本 ${version.id}`,`Version ${version.id}`)),make('p','field-help',`${({applied:M('已应用','Applied'),rolledBack:M('已撤销','Rolled back'),dismissed:M('已拒绝','Rejected'),expired:M('已过期','Expired'),invalidated:M('依据已更改','Evidence changed')})[version.status]||version.status} · ${dateTime(version.at)}${version.expiresAt?` · ${dateOnly(version.expiresAt)} 到期`:''}`));
    if(version.after&&Object.keys(version.after).length)info.append(policyRows(version.after));if((version.evidenceIds||[]).length)info.append(make('p','field-help',`${M('依据记录：','Evidence: ')}${version.evidenceIds.join(', ')}`));row.append(info);if(version.status==='applied')row.append(actionButton(M('撤销这次调整','Roll back this adjustment'),()=>{if(confirm(M('确定撤销这次调整，恢复到该次调整之前的配置吗？','Roll back this adjustment and restore the previous configuration?')))void personalizationAction('PERSONALIZATION_ROLLBACK',{id:version.id},M('已回滚个性化调整。','Personalization adjustment rolled back.'));}));els.personalizationVersionList.append(row);
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
els.historyEnabled.addEventListener('change',()=>void patchConfig({enabled:els.historyEnabled.checked},els.historyEnabled.checked?M('阅读记录已开启。','Reading history enabled.'):M('阅读记录已关闭；已有数据仍保留。','Reading history disabled; existing data is kept.')));
els.historySummaries.addEventListener('change',()=>void patchConfig({summaries:els.historySummaries.checked},els.historySummaries.checked?M('模型摘要已开启。','Model summaries enabled.'):M('模型摘要已关闭。','Model summaries disabled.')));
els.historyOriginForm.addEventListener('submit',event=>{event.preventDefault();try{const origin=parseOrigin(els.historyOrigin.value),origins=[...new Set([...(historyState.snapshot?.config?.origins||[]),origin])];void patchConfig({origins},M('允许网站已更新。','Allowed sites updated.'));event.target.reset();}catch(error){setResult(els.historyConfigResult,errorText(error),true);}});
document.querySelectorAll('input[name="history-days"]').forEach(input=>input.addEventListener('change',()=>{historyState.days=Number(input.value);resetHistoryPaging();void loadHistory();}));
els.historyChartMetric.addEventListener('change',renderChart);els.historyFilters.addEventListener('submit',event=>{event.preventDefault();resetHistoryPaging();void loadHistory();});els.historySource.addEventListener('change',()=>{resetHistoryPaging();void loadHistory();});
els.historyMore.addEventListener('click',()=>void loadHistory({append:true}));
document.querySelectorAll('[data-history-tab]').forEach(button=>{button.addEventListener('click',()=>activateTab(button));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-history-tab]')],index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();tabs[next].focus();activateTab(tabs[next]);});});
document.querySelectorAll('[data-section-tab]').forEach(button=>{button.addEventListener('click',()=>activateSectionTab(button));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-section-tab="'+button.dataset.sectionTab+'"]')].filter(tab=>!tab.hidden),index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();activateSectionTab(tabs[next],{focus:true});});});
document.querySelectorAll('[data-open-section-tab]').forEach(button=>button.addEventListener('click',()=>{const target=button.dataset.openSectionTab,tab=document.querySelector('[data-target="'+target+'"]');if(tab)activateSectionTab(tab,{focus:true});}));
els.historyExport.addEventListener('click',async()=>{try{const data=await request('HISTORY_EXPORT');downloadJson(data,`roamcat-history-${new Date().toISOString().slice(0,10)}.json`);setResult(els.historyActionResult,M('完整记录已导出。','Full records exported.'));}catch(error){setResult(els.historyActionResult,errorText(error),true);}});
els.historyClear.addEventListener('click',()=>{if(confirm(M('确定清空全部阅读记录、统计、摘要和个性化版本吗？此操作无法撤销。','Clear all reading records, stats, summaries, and personalization versions? This cannot be undone.')))void mutateHistory('HISTORY_CLEAR',{},M('阅读记录与个性化数据已清空。','Reading history and personalization data cleared.'));});
els.personalizationEnabled.addEventListener('change',()=>void patchConfig({personalization:els.personalizationEnabled.checked},els.personalizationEnabled.checked?M('个性化分析已开启。','Personalized analysis enabled.'):M('个性化分析已关闭。','Personalized analysis disabled.')).then(loadPersonalization));
els.personalizationAutoApply.addEventListener('change',()=>void patchConfig({autoApply:els.personalizationAutoApply.checked},els.personalizationAutoApply.checked?M('低风险调整可自动应用。','Low-risk adjustments can auto-apply.'):M('调整将等待确认。','Adjustments will wait for confirmation.')).then(loadPersonalization));
els.personalizationAnalyze.addEventListener('click',()=>void personalizationAction('PERSONALIZATION_ANALYZE',{},M('分析已完成。','Analysis finished.')));
els.personalizationReset.addEventListener('click',()=>{if(confirm(M('确定恢复默认配置并清除手动规则吗？此操作会留下可追溯的重置版本。','Restore default config and clear manual rules? This leaves a traceable reset version.')))void personalizationAction('PERSONALIZATION_RESET',{},M('个性化配置已恢复默认。','Personalization config restored to defaults.'));});
window.addEventListener('hashchange',loadVisibleSection);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadVisibleSection();});
loadVisibleSection();
