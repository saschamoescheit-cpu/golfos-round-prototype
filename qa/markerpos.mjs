// QA (Sascha 22.10.2026, round of 22.10. on Hetzenhof): the shots on the map stand where they were played – in the
// overview too. A mark's own "position: relative" had put the hand circles into the page flow: each further one sat
// 30 px lower (some 60 m in the overview, right only when zoomed in). Every mark must be placed by the map (absolute).
// Usage: node qa/markerpos.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-22-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: null, capture: 'full' }]));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
let marks = 0;
let wrong = [];
let hands = 0;
for (let h = 0; h < exp.round.holes.length; h++) {
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => [...document.querySelectorAll('.review-map .maplibregl-marker')].map((e) => ({ pos: getComputedStyle(e).position, cls: e.className.split(' ')[0], hand: e.classList.contains('map-hand-shot') })));
  marks += r.length;
  hands += r.filter((x) => x.hand).length;
  wrong = wrong.concat(r.filter((x) => x.pos !== 'absolute').map((x) => `${exp.round.holes[h].label}:${x.cls}`));
  await p.getByRole('button', { name: 'Nächstes Loch' }).click().catch(() => {});
}
ok(marks > 20 && hands > 10, `marks on the 9 holes (${marks}, ${hands} hand circles)`);
ok(wrong.length === 0, `every mark placed by the map, none in the page flow ${wrong.slice(0, 4).join(' ')}`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
