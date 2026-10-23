// QA (Sascha 22.10.2026, round check, part 2): "Fertig" leaves the check without signing; the last step after every
// hole signs and the round report stands on top (strokes gained per area, the most expensive holes, the training
// with one tap); the stats say what they rest on, approaches by distance, how the putts miss, strikes per club.
// Usage: node qa/postround2.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
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
  const r = { ...exp.round, signedAt: null, capture: 'full' };
  const me = r.players.find((x) => x.isMe).id;
  // strikes on the tee shots, how three first putts missed
  r.entries[me] = r.entries[me].map((e, i) => ({
    ...e,
    detail: e.detail ? { ...e.detail, shots: e.detail.shots.map((s, k) => (k === 0 ? { ...s, strike: i % 3 === 0 ? 'slice' : 'good' } : s)) } : e.detail,
    ...(i < 3 && (e.putts ?? 0) >= 2 && !e.puttsAt ? { firstPuttMiss: { length: 'short', line: 'left' } } : {}),
  }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
const round = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
const openReview = async () => {
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await p.waitForTimeout(400);
  await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
  await p.waitForTimeout(2500);
};

// 1 · "Fertig" never signs
await openReview();
await p.getByRole('button', { name: 'Fertig' }).click();
await p.waitForTimeout(800);
ok(!(await round()).signedAt, '"Fertig" leaves the check without signing');

// 2 · every hole "passt", the last step signs – the report on top
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(2500);
let last = '';
for (let k = 0; k < 14 && (await p.locator('.sc-wrap').count()) === 0; k++) {
  const btn = p.locator('.sticky-cta .btn-primary');
  last = (await btn.innerText().catch(() => '')).trim();
  await btn.click().catch(() => {});
  await p.waitForTimeout(600);
}
ok(/Runde signieren/.test(last) && !!(await round()).signedAt, `the last step signs ("${last}")`);
const rep = p.locator('.round-report');
ok((await rep.count()) === 1 && (await p.locator('.round-report.fresh').count()) === 1, 'the round report, outlined right after signing');
const text = await rep.innerText().catch(() => '');
ok(/Abschlag/.test(text) && /Putting/.test(text) && /geprüften Löchern/.test(text), 'strokes gained per area, from the checked holes');
ok(/Die teuersten Löcher/.test(text) && /Loch \w+ · /.test(text), `the most expensive holes with their cause (${(text.match(/Loch \w+ · [^\n]+/) ?? [''])[0]})`);
const take = rep.getByRole('button', { name: 'Ins Training übernehmen' });
if (await take.count()) {
  await take.click();
  await p.waitForTimeout(1500);
  ok((await rep.getByRole('button', { name: 'Training öffnen' }).count()) === 1, 'taken into Training – "Training öffnen" one tap away');
} else ok(/Dein Training/.test(text) === false, 'no training drill when nothing was lost');

// 3 · the stats: what they rest on, approaches by distance, putts, strikes per club
await p.goto(url);
await p.waitForTimeout(1000);
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(800);
ok(/Aus 1 geprüften Runde/.test(await p.locator('main').innerText()), 'the stats say what they rest on: "Aus 1 geprüften Runde"');
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: /Grün/ }).click();
await p.waitForTimeout(400);
ok((await p.getByRole('heading', { name: 'Annäherung nach Entfernung' }).count()) === 1, 'approach by distance');
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Putten' }).click();
await p.waitForTimeout(400);
ok((await p.getByRole('heading', { name: 'Wie deine Putts verfehlen' }).count()) === 1, 'how the putts miss');
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Schläger' }).click();
await p.waitForTimeout(400);
const clubs = await p.locator('main').innerText();
ok(/Treffer und Streuung je Schläger/.test(clubs) && /gute Treffer/.test(clubs) && /Slice/.test(clubs), 'strikes and spread per club: good strikes and the most frequent flight off line');
ok(/auf Windstille/.test(clubs), 'the distances say they are from good strikes in calm air');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
