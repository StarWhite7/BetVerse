import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const out = resolve(root, 'public/brand');
const mark = 'M14 18H51C68 18 75 25 75 36C75 43 71 49 65 52C72 56 76 61 76 70C76 83 66 90 49 90H0L14 18ZM28 34L25 47H46C52 47 56 44 56 40C56 36 53 34 47 34H28ZM22 61L19 74H44C51 74 55 72 55 67C55 63 52 61 45 61H22Z';
const vee = 'M73 18H94L100 62L124 18H148L103 90H84L73 18Z';
const glyphs = {
  B: 'M0 0H13C23 0 25 12 18 15C27 19 23 30 13 30H0V0ZM7 6V12H12C17 12 17 6 12 6H7ZM7 18V24H13C18 24 18 18 13 18H7Z',
  E: 'M0 0H22V6H7V12H20V18H7V24H22V30H0V0Z',
  T: 'M0 0H26V7H17V30H9V7H0V0Z',
  V: 'M0 0H8L15 21L22 0H30L19 30H11L0 0Z',
  R: 'M0 0H14C28 0 28 17 19 19L28 30H18L10 20H7V30H0V0ZM7 6V14H13C20 14 20 6 13 6H7Z',
  S: 'M22 1V8C18 6 14 5 10 6C6 7 7 10 12 11L17 13C29 17 25 30 12 30C6 30 3 29 0 27V20C5 23 9 25 14 24C19 23 18 20 13 19L8 17C-5 13-1 0 11 0C15 0 19 0 22 1Z',
};
const widths = { B: 25, E: 24, T: 27, V: 31, R: 29, S: 26 };
let x=0;
const letters = [...'BETVERSE'].map((letter) => {
  const tag=`<path d="${glyphs[letter]}" transform="translate(${x} 0)"/>`;
  x += widths[letter] + 3;
  return tag;
}).join('');
function svg(viewBox, content, title, description) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title desc"><title id="title">${title}</title><desc id="desc">${description}</desc>${content}</svg>\n`;
}
for (const [theme, ink, cobalt] of [['light','#142234','#2458E8'], ['dark','#F3F6FC','#86AAFF']]) {
  const markContent=`<g fill="${cobalt}" fill-rule="evenodd"><path d="${mark}"/><path d="${vee}"/></g>`;
  writeFileSync(resolve(out,`bv-mark-${theme}.svg`),svg('0 0 148 108',markContent,'BetVerse — BV','Monogramme original BV, lettres sportives inclinées en aplat.'));
  writeFileSync(resolve(out,`betverse-wordmark-${theme}.svg`),svg('0 0 570 108',`<g transform="translate(0 13.5) scale(.75)">${markContent}</g><g fill="${ink}" fill-rule="evenodd" transform="translate(151 27) skewX(-10) scale(1.75)">${letters}</g>`,'BetVerse','Monogramme BV cobalt et mot-symbole BetVerse vectoriel, sans police externe.'));
}
const icon = `<rect width="1024" height="1024" rx="224" fill="#2458E8"/><g transform="translate(216 296) scale(4)" fill="#FFFFFF" fill-rule="evenodd"><path d="${mark}"/><path d="${vee}"/></g>`;
writeFileSync(resolve(out,'app-icon.svg'),svg('0 0 1024 1024',icon,'BetVerse','Icône BetVerse cobalt et monogramme BV blanc ; marque contenue dans la zone centrale.'));
writeFileSync(resolve(out,'favicon.svg'),svg('0 0 128 128','<rect width="128" height="128" rx="28" fill="#2458E8"/><g transform="translate(18 30.5) scale(.62)" fill="#FFFFFF" fill-rule="evenodd"><path d="'+mark+'"/><path d="'+vee+'"/></g>','BetVerse','Monogramme BV blanc sur cobalt.'));
const tokens = {
  name:'BetVerse Club', publisher:'StarWhite Interactive', country:'France', version:1,
  themes: {
    light: { background:'#F5F3ED', surface:'#FFFFFF', raised:'#EBEFF7', text:'#142234', muted:'#4E5D70', border:'#CDD2DA', primary:'#2458E8', onPrimary:'#FFFFFF', accent:'#2458E8', success:'#17683B', danger:'#B42318' },
    dark: { background:'#101722', surface:'#192331', raised:'#222F41', text:'#F3F6FC', muted:'#B4C0D0', border:'#35445A', primary:'#2458E8', onPrimary:'#FFFFFF', accent:'#86AAFF', success:'#82D6A5', danger:'#FFB4AB' },
  },
  radius:{small:6,medium:10,large:14}, minimumTouchTarget:48,
  fonts:{body:'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',weightBody:400,weightStrong:600},
};
writeFileSync(resolve(out,'club-tokens.json'),JSON.stringify(tokens,null,2)+'\n');
const vars=(theme)=>Object.entries(tokens.themes[theme]).map(([key,value])=>`  --bv-${key.replace(/[A-Z]/g,(c)=>'-'+c.toLowerCase())}: ${value};`).join('\n');
writeFileSync(resolve(out,'club-tokens.css'),`/* BetVerse Club: semantic tokens, no layout overrides. */\n:root {\n${vars('light')}\n  --bv-font: ${tokens.fonts.body};\n  --bv-radius-sm: 6px;\n  --bv-radius: 10px;\n  --bv-radius-lg: 14px;\n  --bv-touch: 48px;\n  color-scheme: light;\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${vars('dark')}\n    color-scheme: dark;\n  }\n}\n:root[data-theme="dark"] {\n${vars('dark')}\n  color-scheme: dark;\n}\n`);
console.log('Generated 6 SVG assets and Club CSS/JSON tokens.');
