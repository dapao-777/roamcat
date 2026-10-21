// i18n.js 字典键对齐检查
const s = require('fs').readFileSync('roamcat-0.0.1/extension/i18n.js', 'utf8');
function grab(name) {
  const m = s.match(new RegExp('\\n\\s*' + name + ':\\s*\\{'));
  const start = m.index + m[0].length;
  let d = 1, i = start;
  while (d > 0) { i++; if (s[i] === '{') d++; else if (s[i] === '}') d--; }
  return s.slice(start, i);
}
const evalObj = body => new Function('return {' + body + '}')();
const zh = evalObj(grab('zh')), en = evalObj(grab('en'));
const zk = Object.keys(zh), ek = Object.keys(en);
console.log('zh:', zk.length, 'en:', ek.length);
console.log('zh-missing-in-en:', zk.filter(k => !(k in en)));
console.log('en-missing-in-zh:', ek.filter(k => !(k in zh)));
// 重名检查：evalObj 会静默去重，用正则数字面键出现次数
const keyPat = /'([^'\n]+)':/g;
const count = {};
for (const m of grab('zh').matchAll(keyPat)) count[m[1]] = (count[m[1]] || 0) + 1;
console.log('zh dupes:', Object.entries(count).filter(([, c]) => c > 1).map(([k]) => k));
// 代码里用到、字典里却没有的键：t('a.b') / T('a.b') 查不到时界面会直接显示键名（曾漏掉 c.em.headline 等 4 个）。
const fs = require('fs'), path = require('path');
const used = new Map();
const walk = dir => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) { if (!/node_modules|local-inference|vendor|frequency|icons|fonts|_locales/.test(full)) walk(full); continue; }
    if (!/\.m?js$/.test(name) || /^(i18n|content-ui|design)\.js$/.test(name)) continue;
    for (const m of fs.readFileSync(full, 'utf8').matchAll(/\b[Tt]\(\s*['`]([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)['`]/g)) {
      if (!(m[1] in zh)) used.set(m[1], (used.get(m[1]) || new Set()).add(path.relative('.', full)));
    }
  }
};
walk('roamcat-0.0.1/extension'); walk('src');
console.log('used-but-missing:', [...used].map(([k, files]) => `${k} <- ${[...files].join(', ')}`));
if (used.size || zk.some(k => !(k in en)) || ek.some(k => !(k in zh))) process.exitCode = 1;
