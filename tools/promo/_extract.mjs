/**
 * @file tools/promo/_extract.mjs
 * 宣传片资产提取：从 floating-pet.js 抽出伴读猫 SVG，读取扫描线猫 SVG，
 * 打包为 _assets.js（<script> 加载，file:// 下无跨域限制），供 intro.html 内联操纵。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('roamcat-0.0.1/extension/floating-pet.js', 'utf8');
const i = src.indexOf('<svg class="cat-svg"');
const j = src.indexOf('</svg>', i) + 6;
const pet = src.slice(i, j).replace(/\$\{T\('fp\.svgCat'\)\}/g, 'RoamCat');

const scan = readFileSync('roamcat-0.0.1/extension/icons/roamcat-cat-ink.svg', 'utf8');

const js = `window.PROMO_ASSETS = ${JSON.stringify({ pet, scan })};\n`;
writeFileSync('tools/promo/_assets.js', js);
console.log('assets.js bytes:', js.length, '| pet:', pet.length, '| scan:', scan.length);
