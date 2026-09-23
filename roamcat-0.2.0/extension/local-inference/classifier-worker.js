/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MAX_TEXT_LENGTH = 6000;
const MAX_TITLE_LENGTH = 240;
const SCORE_THRESHOLD = 0.10;
const MARGIN_THRESHOLD = 0.055;


let initialization;
let inferenceChain = Promise.resolve();

function bounded(value, limit) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

async function initialize() {
  const { env, pipeline } = await import('./runtime/transformers.min.js');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.localModelPath = new URL('./models/', self.location.href).href;
  env.backends.onnx.wasm.wasmPaths = new URL('./runtime/', self.location.href).href;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  const [extractor, response] = await Promise.all([
    pipeline('feature-extraction', MODEL_ID, { device: 'wasm', dtype: 'q8' }),
    fetch(new URL('./domain-prototypes.json', self.location.href), { cache: 'no-store' }),
  ]);
  if (!response.ok) {
    await extractor.dispose();
    throw new Error(`领域原型加载失败：HTTP ${response.status}`);
  }
  const stored = await response.json();
  const entries = stored.entries.map(({ domain, vectors }) => ({
    domain,
    vectors: vectors.map((vector) => Float32Array.from(vector)),
  }));
  return { extractor, entries, dimensions: stored.dimensions };
}

function getRuntime() {
  return initialization ??= initialize().catch((error) => {
    initialization = undefined;
    throw error;
  });
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

function scoreDomains(embedding, entries) {
  let bestDomain = 'general';
  let bestScore = -1;
  let secondScore = -1;
  for (const entry of entries) {
    let first = -1;
    let second = -1;
    for (const prototype of entry.vectors) {
      const similarity = dot(embedding, prototype);
      if (similarity > first) {
        second = first;
        first = similarity;
      } else if (similarity > second) {
        second = similarity;
      }
    }
    const score = first * 0.72 + second * 0.28;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestDomain = entry.domain;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  const margin = bestScore - secondScore;
  const confident = bestScore >= SCORE_THRESHOLD && margin >= MARGIN_THRESHOLD;
  return {
    domain: confident ? bestDomain : 'general',
    source: 'local-model',
    score: Number(bestScore.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    confident,
  };
}

async function classify(text, title) {
  const body = bounded(text, MAX_TEXT_LENGTH);
  const heading = bounded(title, MAX_TITLE_LENGTH);
  const input = heading ? `${heading}. ${body}` : body;
  if (!input) return { domain: 'general', source: 'local-model', score: 0, margin: 0, confident: false };
  const runtime = await getRuntime();
  const tensor = await runtime.extractor(input, { pooling: 'mean', normalize: true });
  if (tensor.size !== runtime.dimensions) throw new Error('本地模型输出维度异常');
  return scoreDomains(tensor.data, runtime.entries);
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'classify') return;
  const { id, text, title } = event.data;
  inferenceChain = inferenceChain
    .then(() => classify(text, title))
    .then(
      (result) => self.postMessage({ id, ok: true, data: result }),
      (error) => self.postMessage({ id, ok: false, error: error?.message || String(error) }),
    );
});
