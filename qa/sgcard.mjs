// QA (night 17.10.2026): strokes gained on the scorecard of a 9-hole round – per 9 holes, not doubled (Sascha
// 16.10.2026), and the table adds up: you − group = difference in every row, the total the sum of the rows.
// Usage: node qa/sgcard.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
// MapLibre loads map tiles through blob: addresses and frees them once drawn – WebKit under test now and then reports
// the freed one ("…localhost:5173/<uuid> due to access control checks"); the tile is on the map, nothing is wrong
p.on('pageerror', (e) => { if (!/localhost:\d+\/[0-9a-f-]{36} due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate((exp) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '12,4' }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: '2026-10-16T20:00:00Z' }]));
  sessionStorage.setItem('golfos.module', 'rounds');
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').nth(1).click();
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1200);
const card = p.locator('section').filter({ hasText: 'Strokes Gained dieser Runde' }).last();
const text = await card.innerText();
ok(/Je 9 Löcher/.test(text) && /je 9 Löcher\./.test(text), '9-hole round: values per 9 holes');
ok(/Hcp 10/.test(await card.locator('[aria-pressed="true"]').innerText()), 'compared with the next better group (index 12,4 → Hcp 10)');
const num = (s) => Number(s.replace(',', '.').replace('−', '-'));
for (const group of ['Hcp 10', 'Scratch']) {
  await card.getByRole('button', { name: group, exact: true }).click();
  const rows = await card.locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  const body = rows.slice(0, -1);
  const total = rows.at(-1);
  const bad = body.filter(([, you, g, d]) => Math.abs(num(you) - num(g) - num(d)) > 0.11);
  ok(bad.length === 0, `${group}: every row you − group = difference ${bad.map((r) => r.join(' ')).join(' | ')}`);
  const sum = (i) => body.reduce((t, r) => t + num(r[i]), 0);
  ok(Math.abs(sum(1) - num(total[1])) < 0.11 && Math.abs(sum(2) - num(total[2])) < 0.11 && Math.abs(num(total[1]) - num(total[2]) - num(total[3])) < 0.11, `${group}: the total adds up (${total.join(' ')})`);
  const sentence = await card.locator('p').filter({ hasText: /Gegen/ }).innerText();
  ok(sentence.includes(total[3].replace(/^[-+]/, '')), `${group}: the sentence names the total difference`);
}
// the statistics of 9-hole rounds: "where you lose strokes" per 9 holes too (17 putts, not 34)
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(500);
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(800);
const focus = await p.locator('section').filter({ hasText: 'Wo du Schläge verlierst' }).last().innerText();
ok(!/pro Runde/.test(focus) && /Putts je 9 Löcher\s*17/.test(focus), 'statistics: where you lose strokes per 9 holes (Putts 17)');
const sgStats = await p.locator('section').filter({ hasText: 'Strokes gained' }).last().innerText();
ok(/Je 9 Löcher/.test(sgStats), 'statistics: strokes gained per 9 holes');
await p.locator('.tabbar button').filter({ hasText: 'Mein Golf' }).click();
await p.waitForTimeout(600);
const hero = await p.locator('.record-hero').innerText();
ok(/\+8,0\s*Ø zu Par \(9 Loch\)/.test(hero), 'my golf: average to par per 9 holes (+8,0, not +16,0)');
// how the holes end: the numbers in the bars, the legend alone below (Sascha 17.10.2026)
const bars = await p.locator('.mix-bar span').allInnerTexts();
ok(bars.length > 0 && bars.every((t) => /^\d+$/.test(t.trim())), `the numbers stand in the bars (${bars.join(' · ')})`);
ok(!/\d/.test(await p.locator('.mix-legend').innerText()), 'the legend has no numbers');
if (process.env.SHOTS) await p.locator('.mix-bar').locator('..').screenshot({ path: process.env.SHOTS + '/mixbar.png' });
// the progress of two 9-hole rounds: per 9 holes too
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([...rs, { ...rs[0], id: rs[0].id + '-2', createdAt: '2026-10-09T08:00:00Z', finishedAt: '2026-10-09T10:00:00Z' }]));
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Mein Golf' }).click();
await p.waitForTimeout(600);
const trend = await p.locator('section').filter({ hasText: 'Dein Verlauf' }).last().innerText();
ok(/Werte je 9 Löcher/.test(trend) && !/je 18/.test(trend), 'my golf: progress per 9 holes');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
