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
