// QA (Sascha 12.11.2026: "the green is not the green of GolfOS – check the whole app whether colours do not fit
// elsewhere too"): every green of the app's look is the CI green – --brand / --brand-text / --brand-soft and --ok (the
// same green). A green written anywhere else in the CSS or the screens is a fail, unless it paints the course itself
// (grass, fairway, tee, rough, trees – maps, sketches, 3D) or is marked "ci-allow".
// Static – reads the source. Usage: node qa/cigreen.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const hsl = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (hue + 360) % 360, s, l };
};
const isGreen = (hex) => {
  const { h, s, l } = hsl(hex);
  return h >= 75 && h <= 165 && s >= 0.3 && l >= 0.2 && l <= 0.8;
};
const CI = new Set(['#79a128', '#9bc53d', '#24331b', '#4f7a0a', '#3a6300', '#e1eecb', '#2f5a00']);
// the course itself in the drawings (RuleSketch, SgHole, training sketches, Agility pictures): grass, fairway, trees, mat
const TERRAIN_HEX = new Set(['#2c6a36', '#2e5a28', '#2f6a2a', '#3d5a2a', '#3d6b22', '#3f6d2a', '#3f8a4a', '#4f7a2a', '#5d8c3b', '#5d8f3a', '#6c9d47', '#6ea545', '#7cb24c', '#86bb55', '#86c964', '#8fc95a', '#a3e27f', '#c9e6a4']);
// the course itself, not the app's look
const TERRAIN = /ci-allow|sk-|fairway|tee\b|rough|trees|grass|terrain|turf|lawn|mapStyle|anim3d|course|green(?!-?text)|fringe|leaf|bush/i;

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(css|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(f);
  }
};
walk(path.join(root, 'src'));
const bad = [];
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (/anim3d|training\/content|mapStyle/.test(rel)) continue;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const hex = m[0].toLowerCase();
      if (!isGreen(hex) || CI.has(hex) || TERRAIN_HEX.has(hex) || TERRAIN.test(line)) continue;
      bad.push(`${rel}:${i + 1} ${hex}`);
    }
  });
}
ok(bad.length === 0, `no green outside the CI green (${bad.length ? bad.join(' | ') : files.length + ' files'})`);
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const okTokens = [...css.matchAll(/--ok:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase());
ok(okTokens.length > 0 && okTokens.every((c) => CI.has(c)), `--ok is the CI green in every theme (${okTokens.join(', ')})`);
process.exit(fails ? 1 : 0);
