/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../roamcat-0.2.0/extension');
// Vector tracing of the supplied side-facing cat: stepped ears, short legs,
// raised tail, and fine horizontal scan lines. No embedded raster image.
const outline = [[32,12],[40,12],[40,20],[57,20],[57,30],[75,30],[75,42],[93,42],[93,55],[113,55],[113,66],[188,66],[188,53],[213,53],[213,37],[236,37],[236,20],[254,20],[254,8],[268,8],[268,25],[277,25],[277,74],[285,74],[285,119],[295,119],[295,178],[305,178],[305,213],[321,213],[321,225],[343,225],[343,237],[365,237],[365,249],[393,249],[406,240],[412,221],[412,194],[403,178],[390,169],[384,149],[384,123],[390,102],[398,99],[407,110],[407,139],[422,151],[438,168],[445,193],[445,223],[438,246],[425,269],[404,285],[381,294],[375,325],[375,426],[362,426],[362,454],[319,454],[319,398],[298,398],[298,412],[287,412],[287,461],[235,461],[235,398],[198,398],[185,405],[168,405],[168,466],[112,466],[112,407],[96,407],[96,453],[48,453],[48,401],[39,380],[31,346],[25,308],[19,279],[10,256],[7,228],[15,201],[23,181],[23,157],[31,133],[31,91],[25,91],[25,48],[32,48]];
function spansAt(points, y) {
  const xs=[];
  for(let i=0;i<points.length;i++) { const a=points[i],b=points[(i+1)%points.length]; if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])); }
  return xs.sort((a,b)=>a-b);
}
let lines='';
for(let y=12;y<469;y+=9){const xs=spansAt(outline,y);for(let i=0;i<xs.length;i+=2)lines+=`<rect x="${xs[i].toFixed(1)}" y="${y}" width="${(xs[i+1]-xs[i]).toFixed(1)}" height="1.8"/>`;
}
const body=`<path d="M${outline.map(p=>p.join(',')).join('L')}Z" opacity=".065"/><g>${lines}</g><path d="M57 132h18v-9h20v8h-9v28h9v9H58v-9h-7v-18h6zM186 126h38v9h-8v31h9v8h-39v-9h-8v-28h8zM125 163h17v10h-17zM119 177h9v9h-9zM70 42h16v9h16v9H70zM224 44h36v9h9v21h-9V62h-35z"/><path d="M43 463h68m57 9h132m20-11h92m-201 19h19" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 490" fill="currentColor"><title>RoamCat · 扫描线漫游猫</title>${body}</svg>`;
fs.writeFileSync(path.join(root,'icons/roamcat-cat-ink.svg'),svg+'\n');
// Thicker scan lines preserve the silhouette at 16–48 px toolbar sizes.
const iconBody=body.replaceAll('height="1.8"','height="5.4"');
const icon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="20" fill="#f5f4ee"/><g transform="translate(8 5) scale(.244)" fill="#161511" color="#161511">${iconBody}</g></svg>`;
for(const name of ['roamcat.svg','roamcat-icon-src.svg'])fs.writeFileSync(path.join(root,'icons',name),icon+'\n');
for(const name of ['options.html','welcome.html']){
  const file=path.join(root,'ui',name);let html=fs.readFileSync(file,'utf8');
  if(name==='options.html') html=html.replace(/<svg class="stamp-tree-svg stamp-cat-svg"[\s\S]*?<\/svg>/g,svg.replace('<svg ','<svg class="stamp-tree-svg stamp-cat-svg" aria-hidden="true" '));
  else html=html.replace(/(<div class="welcome-hero-art"[^>]*>\s*)<svg[\s\S]*?<\/svg>/,(_,before)=>before+svg.replace('<svg ','<svg aria-hidden="true" '));
  fs.writeFileSync(file,html);
}
