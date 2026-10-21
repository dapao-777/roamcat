/**
 * @file tools/promo/_extract.mjs
 * 宣传片资产提取：从 floating-pet.js 抽出伴读猫 SVG，读取品牌单色标 SVG，
 * 打包为 _assets.js（<script> 加载，file:// 下无跨域限制），供 intro.html 内联操纵。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('roamcat-0.0.1/extension/floating-pet.js', 'utf8');
// 伴读猫 SVG 由模板函数拼出（渐变定义、配色常量都是表达式），直接截字符串会留下 ${…}；
// 这里截出配色常量到 renderCatSvg 的整段源码，求值后取坐姿结果。
const i = src.indexOf('  // 伴读猫配色：');
const j = src.indexOf('  class RoamCatPetWidget {', i);
if (i < 0 || j < 0) throw new Error('floating-pet.js 中找不到伴读猫渲染函数');
const pet = new Function('T', `${src.slice(i, j)}\nreturn renderCatSvg();`)(() => 'RoamCat').trim();

const scan = readFileSync('roamcat-0.0.1/extension/icons/roamcat-cat-ink.svg', 'utf8');
// 片中浏览器工具栏上的扩展图标，直接用产品 logo。
const icon = readFileSync('roamcat-0.0.1/extension/icons/roamcat.svg', 'utf8').trim();

const js = `window.PROMO_ASSETS = ${JSON.stringify({ pet, scan, icon })};\n`;
writeFileSync('tools/promo/_assets.js', js);
console.log('assets.js bytes:', js.length, '| pet:', pet.length, '| scan:', scan.length, '| icon:', icon.length);
