import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = resolve(root,'public/brand');
const tokens=JSON.parse(readFileSync(resolve(directory,'club-tokens.json'),'utf8'));
const luminance=(hex)=>hex.match(/[a-f\d]{2}/gi).map((part)=>parseInt(part,16)/255).map((c)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,index)=>sum+c*[.2126,.7152,.0722][index],0);
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
const contrasts=[];
for(const [name,theme] of Object.entries(tokens.themes)) {
  for(const [label,a,b] of [['text/background',theme.text,theme.background],['muted/surface',theme.muted,theme.surface],['CTA',theme.onPrimary,theme.primary],['accent/surface',theme.accent,theme.surface]]) {
    const value=ratio(a,b); assert(value>=4.5,`${name} ${label} contrast ${value}`);
    contrasts.push({theme:name,pair:label,ratio:Number(value.toFixed(2)),meetsTextAA:true});
  }
}
const assets=readdirSync(directory).filter((name)=>name.endsWith('.svg'));
for(const name of assets) {
  const svg=readFileSync(resolve(directory,name),'utf8');
  assert.match(svg,/viewBox="[0-9. ]+"/); assert.match(svg,/<title id="title">/);
  assert(!/<script|<image|<foreignObject|<text|<filter|onload=|href=/i.test(svg),name+' contains external/active/font-dependent content');
  assert.match(svg,/<path /);
}
writeFileSync(resolve(root,'docs/design/brand/validation.json'),JSON.stringify({checkedOn:'2026-11-06',svgFiles:assets,contrasts,networkCalls:0,notes:['Original vector assets; structural and colour checks only.','Integration and platform mask checks remain separate.']},null,2)+'\n');
console.log(`${assets.length} SVGs checked; ${contrasts.length} text contrasts pass >= 4.5:1.`);
