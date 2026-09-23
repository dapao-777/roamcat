/**
 * @file extension/lexicon.js
 * 文件职责：词法领域层——词频/术语/词形还原/已知词过滤与本地参考义。
 * 主要内容：analyze/analyzeBatch/isKnownTerm/localReferenceFor；50k词频+自定义术语。
 * 模块边界：领域层纯函数；依赖shared与sentence-groups分词；可单测。
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.

 */
import { wordId, DOMAINS } from './shared.js';
import { sourceTokens } from './sentence-groups.mjs';

// 词频表是 440KB 的生成文件：改为按需动态 import，Service Worker 因非阅读事件
// （STATE_GET、订阅状态、标签切换等）唤醒时不再付出解析与建表成本。
// 静态图检查不解析动态 import；正确性由调用侧门禁与 rankTable() 的显式失败保证。
let frequencyRank = null;
export async function ensureLexicon() {
  if (!frequencyRank) {
    const module = await import('./frequency/english-frequency.js');
    frequencyRank = module.ENGLISH_FREQUENCY_RANK;
  }
}
function rankTable() {
  if (!frequencyRank) throw new Error('词频表尚未加载：调用方须先 await ensureLexicon()。');
  return frequencyRank;
}

// A deliberately bounded offline glossary, not a claim to cover every industry.
// Ambiguous words exist only inside their domain; longest phrases win during rendering.
const ROWS = {
  tech: [
    ['large language model','大语言模型','从大规模文本中学习语言规律的模型。'],
    ['retrieval augmented generation','检索增强生成','生成回答前先检索相关资料，常简称 RAG。'],
    ['machine learning','机器学习'],['neural network','神经网络'],['fine-tuning','微调','在预训练模型上继续训练，使其适应特定任务。'],
    ['inference','推理','模型利用已学参数产生预测或输出；不是训练。'],['training','训练'],['token','模型文本单位','模型处理文本的基本单位，不一定是一个完整单词；整段翻译中通常保留英文 token。'],
    ['context window','上下文窗口'],['attention','注意力机制','此处是模型对输入信息分配权重的机制。'],['embedding','嵌入向量'],['hallucination','幻觉','模型生成不符合事实或缺乏依据的内容。'],
    ['deployment','部署'],['latency','延迟'],['throughput','吞吐量'],['concurrency','并发'],['dependency','依赖'],['runtime','运行时'],['compiler','编译器'],['callback','回调'],['promise','Promise 异步结果','编程语境，不是日常用语中的承诺。'],['garbage collection','垃圾回收'],['race condition','竞态条件'],['overfitting','过拟合'],['benchmark','基准测试'],['open source','开源'],
  ],
  data: [
    ['change data capture','变更数据捕获','捕获数据库中的增量变更，常简称 CDC。'],['stream processing','流处理'],['batch processing','批处理'],['data warehouse','数据仓库'],['data lake','数据湖'],['data lineage','数据血缘'],['data pipeline','数据管道'],['materialized view','物化视图'],['primary key','主键'],['foreign key','外键'],['event time','事件时间'],['processing time','处理时间'],
    ['exactly-once','精确一次语义','需结合系统、状态和外部写入的保证范围理解。'],['watermark','水位线','流处理中衡量事件时间进度的机制，不是图片水印。'],['checkpoint','检查点','用于故障恢复的状态快照或一致性位置。'],['backpressure','背压','下游处理能力不足向上游传递的流量压力。'],['schema','模式','描述数据的结构、字段及类型。'],['partition','分区'],['sharding','分片'],['replication','复制'],['cardinality','基数','通常指集合中不同值的数量。'],['join','连接','关联两个数据集的操作。'],['transaction','事务','一组作为逻辑整体执行的数据库操作。'],['normalization','规范化'],['denormalization','反规范化'],['idempotency','幂等性'],['consistency','一致性'],['query','查询'],['index','索引'],['pipeline','数据管道'],
  ],
  finance: [
    ['cash flow','现金流'],['balance sheet','资产负债表'],['income statement','利润表'],['interest rate','利率'],['market capitalization','市值'],['return on investment','投资回报率'],['compound interest','复利'],['capital expenditure','资本性支出'],['gross margin','毛利率'],['net income','净利润'],['earnings per share','每股收益'],['free cash flow','自由现金流'],
    ['yield','收益率','金融语境中指投资收益相对于价格或本金的比率。'],['equity','权益／股权','需按股东权益、股权投资等具体上下文区分。'],['bond','债券'],['liquidity','流动性'],['leverage','杠杆'],['portfolio','投资组合'],['hedge','对冲'],['derivative','衍生品'],['maturity','到期日／期限'],['dividend','股息'],['valuation','估值'],['volatility','波动率'],['revenue','营收'],['liability','负债'],['asset','资产'],['depreciation','折旧'],
  ],
  medical: [
    ['clinical trial','临床试验'],['adverse event','不良事件','不一定与治疗存在因果关系。'],['randomized controlled trial','随机对照试验'],['confidence interval','置信区间'],['primary endpoint','主要终点'],['statistical significance','统计显著性'],['double-blind','双盲'],['placebo','安慰剂'],['efficacy','疗效'],['contraindication','禁忌证'],['diagnosis','诊断'],['prognosis','预后'],['prevalence','患病率'],['incidence','发病率'],['cohort','队列'],['biomarker','生物标志物'],['pathogen','病原体'],['antibody','抗体'],['dose','剂量'],['remission','缓解'],['endpoint','终点','研究预先规定的结局指标，不是接口地址。'],['sensitivity','敏感度'],['specificity','特异度'],
  ],
  legal: [
    ['intellectual property','知识产权'],['burden of proof','举证责任'],['due diligence','尽职调查'],['force majeure','不可抗力'],['breach of contract','违约'],['governing law','准据法'],['class action','集体诉讼'],['statute of limitations','诉讼时效'],['jurisdiction','管辖权'],['liability','法律责任','法律语境，不等同于会计中的负债。'],['consideration','对价','普通法合同语境中的交换价值。'],['tort','侵权行为'],['injunction','禁令'],['indemnity','赔偿／补偿责任'],['arbitration','仲裁'],['litigation','诉讼'],['plaintiff','原告'],['defendant','被告'],['precedent','判例'],['statute','成文法'],['waiver','权利放弃'],['remedy','救济'],['covenant','约定／契约条款'],
  ],
  design: [
    ['design system','设计系统'],['user experience','用户体验'],['user interface','用户界面'],['information architecture','信息架构'],['visual hierarchy','视觉层级'],['cognitive load','认知负荷'],['progressive disclosure','渐进式披露','按需展现复杂功能，而非一次展示全部选项。'],['white space','留白'],['affordance','示能性','对象可供使用者执行哪些操作的性质。'],['accessibility','无障碍'],['usability','可用性'],['prototype','原型'],['wireframe','线框图'],['typography','字体排印'],['kerning','字偶距'],['leading','行距'],['baseline','基线'],['contrast','对比度'],['onboarding','上手引导'],['heuristic','启发式原则'],['persona','用户画像'],['responsive','响应式'],['interaction','交互'],['retention','留存'],
  ],
  general: [
    ['trade-off','权衡'],['underlying','底层的；潜在的'],['approach','方法；路径'],['constraint','约束'],['implication','影响；隐含意义'],['subtle','微妙的'],['robust','稳健的'],['feasible','可行的'],['mitigate','减轻；缓解'],['inherently','固有地'],['ambiguous','有歧义的'],['subsequent','随后的'],['nevertheless','尽管如此'],['comprehensive','全面的'],['crucial','至关重要的'],['assumption','假设'],['threshold','阈值；门槛'],['empirical','实证的'],['unprecedented','前所未有的'],['paradigm','范式'],['nuance','细微差别'],['pragmatic','务实的'],['diminish','减少；减弱'],['consecutive','连续的'],['arbitrary','任意的'],['explicit','明确的'],['implicit','隐含的'],['sufficient','充分的'],['sustainable','可持续的'],['insight','洞察'],
  ],
};
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function termPattern(term, flags = 'i') {
  return new RegExp(`(?<![a-zA-Z0-9_])${escape(term).replace(/\s+/g, '\\s+')}(?![a-zA-Z0-9_])`, flags);
}
export const LEXICON = Object.entries(ROWS).flatMap(([domain, rows]) => rows.map(([term,translation,note='']) => ({term,translation,note,domain,level:domain === 'general' ? 2 : 3})));
const patterns = new Map(LEXICON.map(entry => [entry.term,termPattern(entry.term)]));

// Frequency is a nomination prior, not a CEFR classification.
const BASE_QUERY_LOG_RANK = Math.log(2500), BASE_QUERY_SPREAD = Math.log(4);
const STOPWORDS = new Set(`a an and are as at be been being but by can could did do does doing done for from had has have having he her hers herself him himself his how i if in into is it its itself may me might mine more most much must my myself no nor not of on once only or other ought our ours ourselves out over own same shall she should so some such than that the their theirs them themselves then there these they this those through to too under until up us very was we were what when where which while who whom whose why will with would you your yours yourself yourselves also am because before both during each either else ever every few many neither off perhaps quite rather since still though throughout thus unless upon via whether whilst within without yet`.split(/\s+/));
const FUNCTION_WORDS = new Set(['the','and','of','to','is','are','that','with']);
const IRREGULAR = new Map(Object.entries({children:'child',men:'man',women:'woman',people:'person',mice:'mouse',teeth:'tooth',feet:'foot',geese:'goose',went:'go',gone:'go',ran:'run',written:'write',wrote:'write',better:'good',best:'good',worse:'bad',worst:'bad'}));

function selectedDomain(settings, resolvedDomain) {
  const selected = resolvedDomain || settings.domain;
  return selected && selected !== 'auto' && Object.hasOwn(DOMAINS,selected) ? selected : 'general';
}

function glossaryEntries(text, settings, domain) {
  const terms = new Map();
  for (const entry of LEXICON) {
    if (entry.domain !== domain && entry.domain !== 'general') continue;
    if (patterns.get(entry.term).test(text)) terms.set(entry.term.toLowerCase(),entry);
  }
  for (const scope of ['general',...(domain === 'general' ? [] : [domain])]) {
    for (const entry of settings.customTerms || []) {
      if (entry.domain === scope && termPattern(entry.term).test(text)) {
        terms.set(entry.term.toLowerCase(),{...entry,note:'你的术语译法',level:3,custom:true});
      }
    }
  }
  return [...terms.values()];
}

function morphologyCandidates(word, derivations = true) {
  const candidates = [];
  const add = value => { if (value?.length > 2 && !candidates.includes(value)) candidates.push(value); };
  add(IRREGULAR.get(word));
  if (word.endsWith("'s")) add(word.slice(0,-2));
  if (word.endsWith('ies') && word.length > 4) add(word.slice(0,-3) + 'y');
  if (word.endsWith('ves') && word.length > 4) { add(word.slice(0,-3) + 'f'); add(word.slice(0,-3) + 'fe'); }
  if (word.endsWith('ied') && word.length > 4) add(word.slice(0,-3) + 'y');
  for (const suffix of ['ing','ed']) {
    if (!word.endsWith(suffix) || word.length <= suffix.length + 2) continue;
    const base = word.slice(0,-suffix.length);
    add(base); add(base + 'e');
    if (/([b-df-hj-np-tv-z])\1$/.test(base)) add(base.slice(0,-1));
  }
  if (word.endsWith('es') && word.length > 4) { add(word.slice(0,-2)); add(word.slice(0,-1)); }
  else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) add(word.slice(0,-1));
  if (derivations && word.endsWith('ly') && word.length > 4) { add(word.slice(0,-2)); add(word.slice(0,-2) + 'y'); }
  if (derivations && word.endsWith('ness') && word.length > 6) { add(word.slice(0,-4)); add(word.slice(0,-4) + 'y'); }
  return candidates;
}

function frequency(word) {
  const table = rankTable();
  const exact = table.get(word);
  let best = exact ? {rank:exact,lemma:word} : undefined;
  for (const lemma of morphologyCandidates(word)) {
    const rank = table.get(lemma);
    if (rank && (!best || rank < best.rank)) best = {rank,lemma};
  }
  return best || {};
}

function tokensIn(text, parts = sourceTokens(text)) {
  const urls = [...text.matchAll(/\b(?:https?:\/\/|www\.)\S+/gi)].map(match => [match.index,match.index + match[0].length]);
  const tokens = [];
  for (const match of parts) {
    if (urls.some(([start,end]) => match.index >= start && match.index < end)) continue;
    const surface = match[0];
    if (!/^[A-Za-z]+(?:['’\u2010\u2011-][A-Za-z]+)*$/.test(surface)) continue;
    tokens.push({surface,normalized:normalizedTerm(surface),index:match.index,proper:/^[A-Z]/.test(surface)});
  }
  return tokens;
}

function normalizedTerm(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase().replace(/[’\u2019]/g,"'").replace(/[\u2010\u2011]/g,'-')
    : '';
}
function wordDomain(word) {
  if (word.domain) return word.domain;
  const split = typeof word.id === 'string' ? word.id.indexOf(':') : -1;
  return split > 0 ? word.id.slice(0,split) : 'general';
}

function requestedRecord(word) {
  return Number(word?.helpCount) > 0 || Number(word?.requestedAt) > 0;
}

function historyRecords(words, domain) {
  const scopes = new Map([[domain,new Map()]]);
  if (domain !== 'general') scopes.set('general',new Map());
  for (const word of words || []) {
    if (!word?.term || !word.id || (word.kind !== 'word' && word.kind !== 'phrase')) continue;
    const scope = wordDomain(word);
    const records = scopes.get(scope);
    if (!records) continue;
    const term = normalizedTerm(word.term);
    if (!term) continue;
    const current = records.get(term);
    if (!current || (requestedRecord(word) && !requestedRecord(current))
      || (requestedRecord(word) === requestedRecord(current) && String(word.id) < String(current.id))) {
      records.set(term,word);
    }
  }
  return scopes;
}

function wordIndexes(records) {
  const exact = new Map();
  const reverseForms = new Map();
  for (const [term,word] of records) {
    if (term.includes(' ') || word.kind === 'phrase') continue;
    exact.set(term,word);
    for (const form of morphologyCandidates(term)) {
      const terms = reverseForms.get(form) || new Set();
      terms.add(term);
      reverseForms.set(form,terms);
    }
  }
  return {exact,reverseForms};
}

function matchingTerms(surface, index) {
  if (index.exact.has(surface)) return new Set([surface]);
  const matches = new Set(index.reverseForms.get(surface) || []);
  const forms = new Set(morphologyCandidates(surface));
  const lemma = frequency(surface).lemma;
  if (lemma) forms.add(lemma);
  for (const form of forms) if (index.exact.has(form)) matches.add(form);
  return matches;
}

function resolvedHistory(surface, domain, indexedScopes) {
  const normalizedSurface = normalizedTerm(surface);
  if (!normalizedSurface || normalizedSurface.includes(' ')) return null;
  for (const scope of [domain,...(domain === 'general' ? [] : ['general'])]) {
    const indexed = indexedScopes.get(scope);
    if (!indexed) continue;
    const matches = matchingTerms(normalizedSurface,indexed.index);
    if (matches.size === 1) {
      const canonicalTerm = [...matches][0];
      return {word:indexed.records.get(canonicalTerm),canonicalTerm,sameDomain:scope === domain};
    }
    if (matches.size > 1) return null;
  }
  return null;
}

function indexedHistory(words, domain) {
  return new Map([...historyRecords(words,domain)].map(([scope,records]) => [scope,{records,index:wordIndexes(records)}]));
}
// Word exclusions share inflections, never derived words or substrings.
function knownTermKey(surface) {
  const term = normalizedTerm(surface);
  if (term.includes(' ')) return term;
  const forms = morphologyCandidates(term,false).filter(form => rankTable().has(form));
  // Ambiguous stems (rated → rat/rate) must not silence an unrelated word.
  return forms.length === 1 ? forms[0] : term;
}

export function isKnownTerm(surface, words = []) {
  const key = knownTermKey(surface);
  return Boolean(key) && words.some(word => Number(word?.knownAt) > 0 && knownTermKey(word.term) === key);
}

function vocabularyProfile(words, domain, now = Date.now()) {
  const day = 86400000, samples = new Map();
  for (const word of words) {
    if (word?.kind !== 'word' || word.knownAt > 0 || !requestedRecord(word)) continue;
    const scope = wordDomain(word);
    if (scope !== domain && scope !== 'general') continue;
    let at = Number(word.requestedAt) || 0;
    for (const sense of word.senses || []) at = Math.max(at,Number(sense.lastHelpAt) || 0);
    if (!Number.isFinite(at) || at <= 0 || at > now || now-at > 90*day) continue;
    const fact = frequency(normalizedTerm(word.term));
    if (!fact.rank) continue;
    // One lexical family is one observation; repeated clicks cannot manufacture confidence.
    const weight = 2 ** (-(now-at)/(30*day)) * (scope === domain ? 1 : .65) * (word.helpCount > 0 ? 1 : .35);
    const previous = samples.get(fact.lemma);
    if (!previous || weight > previous.weight) samples.set(fact.lemma,{term:fact.lemma,at,weight,rank:Math.log(fact.rank)});
  }
  const recent = [...samples.values()].sort((a,b)=>b.at-a.at || a.term.localeCompare(b.term)).slice(0,60);
  if (recent.length < 3) return {weight:0};
  recent.sort((a,b)=>a.rank-b.rank);
  const mass = recent.reduce((sum,sample)=>sum+sample.weight,0);
  const quantile = fraction => {
    const target = mass*fraction;
    let accumulated = 0, previousPosition = 0, previousRank = recent[0].rank;
    // Interpolate weighted midpoints so tiny timing/weight differences do not jump a whole rank interval.
    for (const sample of recent) {
      const position = accumulated + sample.weight/2;
      if (position >= target) return previousRank + (sample.rank-previousRank)*(target-previousPosition)/(position-previousPosition);
      accumulated += sample.weight; previousPosition = position; previousRank = sample.rank;
    }
    return recent.at(-1).rank;
  };
  const lower = quantile(.25), upper = quantile(.75);
  // This is a support boundary estimated from selected queries, not a measured vocabulary size.
  return {center:Math.max(Math.log(500),Math.min(Math.log(20000),lower)),
    spread:Math.max(Math.log(2),upper-lower),weight:.35*mass/(mass+8)};
}

function vocabularySupport(rank, profile) {
  const difficulty = Math.log(rank), baseline = 1/(1+Math.exp((BASE_QUERY_LOG_RANK-difficulty)/BASE_QUERY_SPREAD));
  if (!profile.weight) return baseline;
  const personal = 1/(1+Math.exp((profile.center-difficulty)/profile.spread));
  return (1-profile.weight)*baseline + profile.weight*personal;
}

export function resolveCanonicalTerm(surface, domain, words = []) {
  const normalizedSurface = normalizedTerm(surface);
  if (!normalizedSurface) return '';
  const resolvedDomain = Object.hasOwn(DOMAINS,domain) && domain !== 'auto' ? domain : 'general';
  if (normalizedSurface.includes(' ')) return normalizedSurface;
  return resolvedHistory(normalizedSurface,resolvedDomain,indexedHistory(words,resolvedDomain))?.canonicalTerm || normalizedSurface;
}

function collectHistoryMatches(source, resolvedDomain, scopes) {
  const matches = [];
  const phraseTerms = new Set();
  for (const {records} of scopes.values()) {
    for (const [term,word] of records) if (term.includes(' ') || word.kind === 'phrase') phraseTerms.add(term);
  }
  const parts = sourceTokens(source), starts = new Map(), ends = new Map();
  if (phraseTerms.size) for (const [index,token] of parts.entries()) { starts.set(token.index,index); ends.set(token.index + token[0].length,index); }
  const urlRanges = [...source.matchAll(/\b(?:https?:\/\/|www\.)\S+/gi)]
    .map(match => [match.index,match.index + match[0].length]);
  const overlapsUrl = (start,end) => urlRanges.some(([urlStart,urlEnd]) => start < urlEnd && end > urlStart);
  const requestedIntent=(term,selected)=>requestedRecord(selected)||resolvedDomain!=='general'&&requestedRecord(scopes.get('general')?.records.get(term));
  for (const term of phraseTerms) {
    let selected = scopes.get(resolvedDomain)?.records.get(term);
    const sameDomain = Boolean(selected);
    if (!selected && resolvedDomain !== 'general') selected = scopes.get('general')?.records.get(term);
    if (!selected) continue;
    for (const found of source.matchAll(termPattern(term,'gi'))) {
      const start = found.index;
      const end = start + found[0].length;
      const first = starts.get(start), last = ends.get(end);
      if (first !== undefined && last !== undefined && last - first < 8 && found[0].length <= 100 && !overlapsUrl(start,end)) matches.push({word:selected,text:found[0],start,end,sameDomain,requested:requestedIntent(term,selected)});
    }
  }
  for (const token of tokensIn(source,parts)) {
    if (token.surface.length > 100) continue;
    const selected = resolvedHistory(token.normalized,resolvedDomain,scopes);
    if (!selected) continue;
    matches.push({word:selected.word,text:token.surface,start:token.index,end:token.index + token.surface.length,
      sameDomain:selected.sameDomain,requested:requestedIntent(selected.canonicalTerm,selected.word)});
  }
  return matches.sort((a,b) => a.start-b.start || b.end-a.end || String(a.word.id).localeCompare(String(b.word.id)));
}

export function historyMatches(text, domain, words = []) {
  const source = typeof text === 'string' ? text : '';
  const resolvedDomain = Object.hasOwn(DOMAINS,domain) && domain !== 'auto' ? domain : 'general';
  return collectHistoryMatches(source,resolvedDomain,indexedHistory(words,resolvedDomain));
}

export function localReferenceFor(text, domain, settings = {}) {
  const target = normalizedTerm(text);
  if (!target) return null;
  const resolvedDomain = Object.hasOwn(DOMAINS,domain) && domain !== 'auto' ? domain : 'general';
  const exactCustom = scope => [...(settings.customTerms || [])].reverse()
    .find(entry => entry?.domain === scope && normalizedTerm(entry.term) === target && typeof entry.translation === 'string' && entry.translation.trim());
  const exactStatic = scope => LEXICON.find(entry => entry.domain === scope && normalizedTerm(entry.term) === target && entry.translation);
  const entry = exactCustom(resolvedDomain)
    || (resolvedDomain === 'general' ? null : exactCustom('general'))
    || exactStatic(resolvedDomain)
    || (resolvedDomain === 'general' ? null : exactStatic('general'));
  if (!entry) return null;
  return {term:entry.term,translation:entry.translation,domain:entry.domain,...(entry.note ? {note:entry.note} : {}),
    custom:Boolean((settings.customTerms || []).includes(entry))};
}

export function englishTokenStats(text) {
  const values = tokensIn(typeof text === 'string' ? text : '').map(token => token.normalized);
  return {
    tokens:values.length,
    recognized:values.reduce((count,token) => count + Number(Boolean(frequency(token).rank)),0),
    functionWords:new Set(values.filter(token => FUNCTION_WORDS.has(token))).size,
  };
}

function analysisPreparation(settings, words, domain, now, shared = {}) {
  return {
    settings,domain,
    history:indexedHistory(words,domain),
    known:shared.known || new Set(words.filter(word => Number(word?.knownAt) > 0).map(word => knownTermKey(word.term))),
    priorities:shared.priorities || new Set((settings.annotationPolicy?.priorityTerms || []).map(knownTermKey)),
    profile:vocabularyProfile(words,domain,now),
  };
}

function analyzePrepared(text, preparation) {
  const source = typeof text === 'string' ? text : '';
  const {settings,domain,history,known,priorities,profile} = preparation;
  const tokenFacts = tokensIn(source).map(token => ({...token,...frequency(token.normalized)}));
  const candidates = new Map();
  const add = (key,candidate) => {
    const lemma = knownTermKey(key);
    if (known.has(lemma)) return;
    if (priorities.has(lemma)) candidate.priority = 4;
    else if (candidate.reason === 'custom') candidate.priority = 2.5;
    else if (candidate.reason !== 'history') {
      const rank = candidate.rank || frequency(key).rank;
      const score = (rank && candidate.kind !== 'phrase' ? vocabularySupport(rank,profile) : .65) + (candidate.contextWeight || 0);
      if (score < .5) return;
      candidate.priority = 1 + Math.min(1,score);
      candidate.rank = rank || 0;
    }
    const current = candidates.get(key);
    if (!current || candidate.priority > current.priority) candidates.set(key,candidate);
  };

  const historyGroups = new Map();
  for (const match of collectHistoryMatches(source,domain,history)) {
    const term = normalizedTerm(match.text);
    const canonicalTerm = normalizedTerm(match.word.term);
    const key = [term,canonicalTerm,match.sameDomain ? 'same' : 'general'].join('\0');
    const group = historyGroups.get(key) || {...match,term,canonicalTerm,occurrences:[]};
    group.occurrences.push({text:match.text,start:match.start,end:match.end});
    historyGroups.set(key,group);
  }
  for (const match of historyGroups.values()) {
    add(match.term,{
      term:match.term,canonicalTerm:match.canonicalTerm,
      id:match.sameDomain ? match.word.id : wordId(match.canonicalTerm,domain),domain,
      kind:match.word.kind,priority:match.requested ? 3 : 1.5,reason:match.requested ? 'history' : 'suggested',
      position:match.start,occurrences:match.occurrences,
    });
  }

  for (const entry of glossaryEntries(source,settings,domain)) {
    const found = [...source.matchAll(termPattern(entry.term,'gi'))];
    if (!found.length) continue;
    const phrase = /[ -]/.test(entry.term);
    const fact = phrase ? {} : frequency(normalizedTerm(entry.term));
    if (!entry.custom && !phrase && entry.domain === 'general' && !fact.rank) continue;
    const key = normalizedTerm(found[0][0]);
    add(key,{term:key,canonicalTerm:normalizedTerm(entry.term),id:wordId(entry.term,domain),domain,
      kind:phrase ? 'phrase' : 'word',priority:2,reason:entry.custom ? 'custom' : 'domain',position:found[0].index,rank:fact.rank,contextWeight:entry.domain === 'general' ? .1 : .25,
      occurrences:found.map(match => ({text:match[0],start:match.index,end:match.index + match[0].length}))});
  }

  const frequencyGroups = new Map();
  for (const fact of tokenFacts) {
    const sentenceInitial = fact.proper && /(?:^|[.!?]\s+|\n\s*)$/.test(source.slice(0,fact.index));
    if ((fact.proper && (!sentenceInitial || !/^[A-Z][a-z]+$/.test(fact.surface))) || STOPWORDS.has(fact.normalized) || !fact.rank) continue;
    const canonicalTerm = resolvedHistory(fact.normalized,domain,history)?.canonicalTerm || fact.normalized;
    const group = frequencyGroups.get(fact.normalized) || {term:fact.normalized,canonicalTerm,position:fact.index,rank:fact.rank,occurrences:[]};
    group.occurrences.push({text:fact.surface,start:fact.index,end:fact.index + fact.surface.length});
    frequencyGroups.set(fact.normalized,group);
  }
  for (const fact of frequencyGroups.values()) {
    add(fact.term,{term:fact.term,canonicalTerm:fact.canonicalTerm,id:wordId(fact.canonicalTerm,domain),domain,kind:'word',
      priority:1,reason:'frequency',position:fact.position,rank:fact.rank,occurrences:fact.occurrences});
  }

  return {domain,terms:[...candidates.values()].sort((a,b) => b.priority-a.priority || (b.rank || 0)-(a.rank || 0) || b.occurrences.length-a.occurrences.length || a.position-b.position)
    .map(({position,rank,contextWeight,...candidate}) => candidate)};
}

export function analyze(text, settings = {}, words = [], resolvedDomain) {
  const domain = selectedDomain(settings,resolvedDomain);
  return analyzePrepared(text,analysisPreparation(settings,words,domain,Date.now()));
}

export function analyzeBatch(items, settings = {}, words = []) {
  if (!Array.isArray(items)) return [];
  const now = Date.now();
  const shared = {
    known:new Set(words.filter(word => Number(word?.knownAt) > 0).map(word => knownTermKey(word.term))),
    priorities:new Set((settings.annotationPolicy?.priorityTerms || []).map(knownTermKey)),
  };
  const preparations = new Map();
  return items.map(item => {
    const domain = selectedDomain(settings,item?.domain);
    let preparation = preparations.get(domain);
    if (!preparation) {
      preparation = analysisPreparation(settings,words,domain,now,shared);
      preparations.set(domain,preparation);
    }
    return analyzePrepared(item?.sentence,preparation);
  });
}
