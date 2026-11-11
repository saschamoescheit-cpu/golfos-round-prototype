// QA (Sascha 12.11.2026: "Stefan cannot check today's round in 'Schläge prüfen' – even if that is the reason, the people
// must be able to check the round afterwards and set the shots by hand"): a round played on a course without a map
// (scores only) – "Schläge prüfen": "Loch 1 hat noch keine Karte", "Loch einrichten" on the aerial photo (tee, green),
// then the map of the hole and a shot set by a tap.
// Usage: node qa/reviewnomap.mjs [url]
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
  // the same round on a course the app has no map of – scores only, no shots
  const id = 'test:nomap';
  const r = { ...exp.round, courseId: id, courseName: 'Golfplatz ohne Karte', signedAt: null, capture: 'full', manualShots: [] };
  for (const pid of Object.keys(r.entries)) r.entries[pid] = r.entries[pid].map((e) => ({ ...e, detail: undefined, puttsAt: undefined }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  const holes = r.holes.map((h) => ({ loop: h.loop, number: h.number, label: h.label, par: h.par, strokeIndex: [h.strokeIndex] }));
  localStorage.setItem('golfos.course.v1.' + id, JSON.stringify({ id, source: 'osm', name: 'Golfplatz ohne Karte', lat: 48.7795, lon: 9.6835, holes, loops: [...new Set(holes.map((h) => h.loop))] }));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /ohne Karte/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(2000);
const nomap = p.locator('.review-nomap');
ok((await nomap.count()) === 1 && /hat noch keine Karte/.test(await nomap.innerText()), `no map: "${(await nomap.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90)}"`);
await nomap.getByRole('button', { name: 'Loch einrichten' }).click();
await p.waitForTimeout(2500);
const card = p.locator('.setup-card');
ok((await card.count()) === 1, 'the set-up on the aerial photo');
const map = await p.locator('.review-setup-layer .hole-map').boundingBox();
await p.mouse.click(map.x + map.width / 2, map.y + map.height * 0.42);
await p.waitForTimeout(500);
await p.mouse.click(map.x + map.width / 2, map.y + map.height * 0.2);
await p.waitForTimeout(500);
await card.getByRole('button', { name: 'Loch speichern' }).click();
await p.waitForTimeout(2000);
ok((await p.locator('.review-setup-layer').count()) === 0 && (await p.locator('.review-nomap').count()) === 0 && (await p.locator('.review-map').count()) === 1, 'saved: the hole on the map in "Schläge prüfen"');
// a shot by a tap halfway
const rm = await p.locator('.review-map').boundingBox();
await p.mouse.click(rm.x + rm.width / 2, rm.y + rm.height / 2);
await p.waitForTimeout(800);
const shots = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const me = r.players.find((x) => x.isMe).id;
  return r.entries[me][0].detail?.shots?.length ?? 0;
});
ok(shots >= 1, `a tap on the map sets a shot (${shots})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/reviewnomap.png` });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
