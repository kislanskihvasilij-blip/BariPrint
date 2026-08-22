const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readB64 = (p) => fs.readFileSync(path.join(root, p)).toString('base64');

let html = read('template.html');

const replacements = {
  '{{FONT_CG_NORMAL_LAT}}': readB64('fonts/cg-lat-normal.woff2'),
  '{{FONT_CG_NORMAL_CYR}}': readB64('fonts/cg-cyr-normal.woff2'),
  '{{FONT_CG_ITALIC_LAT}}': readB64('fonts/cg-lat-italic.woff2'),
  '{{FONT_CG_ITALIC_CYR}}': readB64('fonts/cg-cyr-italic.woff2'),
  '{{FONT_GOLOS_LAT}}': readB64('fonts/golos-lat.woff2'),
  '{{FONT_GOLOS_CYR}}': readB64('fonts/golos-cyr.woff2'),
  '{{IMG_HERO}}': readB64('assets/digital-print.jpg'),
  '{{IMG_P1}}': readB64('assets/project-1-a-studio.jpg'),
  '{{IMG_P2}}': readB64('assets/project-2-bristol.jpg'),
  '{{IMG_P3}}': readB64('assets/project-3-lyubimiy.jpg'),
  '{{IMG_P4}}': readB64('assets/project-4-rodnik.jpg'),
  '{{IMG_P5}}': readB64('assets/project-5-greece.jpg'),
};

let missing = [];
for (const [token, value] of Object.entries(replacements)) {
  if (!html.includes(token)) missing.push(token + ' (not found in template)');
  html = html.split(token).join(value);
}

const leftoverTokens = html.match(/\{\{[A-Z_0-9]+\}\}/g);
if (leftoverTokens) {
  console.error('WARNING: unresolved tokens remain:', leftoverTokens);
}
if (missing.length) {
  console.error('WARNING: tokens not present in template:', missing);
}

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('Built index.html —', (html.length / 1024 / 1024).toFixed(2), 'MB');
