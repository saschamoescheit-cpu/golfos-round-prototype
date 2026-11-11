// QA (Sascha 12.11.2026, Cypress checked afterwards: "some distances are missing – set a point, then see the distance
// left to the flag, also in this sheet"): in "Schläge prüfen" a shot's sheet says how far it still was to the flag and
// how long the shot was; a shot without its place: "Ort fehlt" – "Auf der Karte setzen", a tap on the map, the sheet
// again with the distance to the flag. A real round (Hetzenhof 16.10.2026).
// Usage: node qa/shotplace.mjs [url]
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
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = { ...exp.round, signedAt: null, capture: 'full' };
  // hole 1: shot 2's place unknown (entered without GPS)
  const me = r.players.find((x) => x.isMe).id;
  const e0 = r.entries[me][0];
  if (e0.detail?.shots?.[1]) e0.detail.shots[1] = { ...e0.detail.shots[1], pos: null };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
// shot 1 (from the tee): how far it still was to the flag, how long the shot was
await p.locator('.review-list li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(300);
const w1 = (await p.locator('.shot-where').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Noch \d+ m zur Fahne/.test(w1) && !/Schlag \d+ m/.test(w1) && /Ort ändern/.test(w1), `shot 1: to the flag – no length while shot 2's place is missing ("${w1}")`);
await p.getByRole('button', { name: 'Schließen' }).last().click();
await p.waitForTimeout(300);
// shot 2 without its place
await p.locator('.review-list li[data-shot="1"] .shot-row').click();
await p.waitForTimeout(300);
const w2 = (await p.locator('.shot-where').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Ort fehlt/.test(w2), `shot 2 without its place: "${w2}"`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/shotplace-missing.png` });
await p.locator('.shot-where').getByRole('button', { name: 'Auf der Karte setzen' }).click();
await p.waitForTimeout(500);
ok(/Tippe auf die Karte, wo Schlag 2 gespielt wurde/.test(await p.locator('main').innerText()), 'the hint: tap the map where shot 2 was played from');
// a tap halfway between the tee and the green
const box = await p.locator('.review-map').boundingBox();
await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await p.waitForTimeout(800);
const w3 = (await p.locator('.shot-where').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Noch \d+ m zur Fahne/.test(w3), `tapped: its sheet again with the distance to the flag ("${w3}")`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/shotplace-set.png` });
const pos = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const me = r.players.find((x) => x.isMe).id;
  return r.entries[me][0].detail?.shots?.[1]?.pos ?? null;
});
ok(Array.isArray(pos) && pos.length === 2, `kept with the round (${JSON.stringify(pos)})`);
await p.getByRole('button', { name: 'Schließen' }).last().click();
await p.waitForTimeout(300);
await p.locator('.review-list li[data-shot="0"] .shot-row').click();
await p.waitForTimeout(300);
const w4 = (await p.locator('.shot-where').innerText().catch(() => '')).replace(/s+/g, ' ');
ok(/Schlag \d+ m/.test(w4), `shot 1 now with its length ("${w4}")`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
