// QA (Sascha 16.11.2026, iPad, Hawks Landing: "die Bahnen sind falsch, das Grün ist das davor. Wenn ich aber Abschlag und
// Grün ändern will, geht es nicht. Das muss gelöst werden"): in "Schläge prüfen", "Loch falsch eingezeichnet?" → tee and
// green tapped anew → "Loch speichern": the hole runs from the new tee to the new green (kept after a reload), the shots
// stay. A round on Hawks Landing (the app's own lines). Usage: node qa/resetuphole.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const CID = 'osm:relation/4053362';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices[process.env.DEVICE ?? 'iPad Pro 11 landscape'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const pars = [4, 3, 4, 5, 4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 3, 4, 4, 3];
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(({ CID, pars }) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const holes = pars.map((par, i) => ({ par, loop: 'Main', index: i, label: String(i + 1), number: i + 1, strokeIndex: i + 1 }));
  const r = {
    id: 'hawks-qa', tee: 'Green', kind: 'social', mode: 'quick', format: { mode: 'single', scoring: 'net', allowance: 100, matchplay: false }, loopOrder: ['Main'], holes, capture: 'full', courseId: CID, courseName: 'Hawks Landing Golf Club',
    createdAt: '2026-11-15T12:00:00', finishedAt: '2026-11-15T17:00:00', currentHole: 0, signedAt: null,
    players: [{ id: 'me', isMe: true, name: 'Sascha', playingHandicap: 4 }],
    entries: { me: pars.map((par) => ({ strokes: par, putts: 2 })) },
  };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, { CID, pars });
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hawks/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3000);
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(2000);
const line = () => p.evaluate((CID) => JSON.parse(localStorage.getItem('golfos.holelines.v2.' + CID) ?? '{}'), CID);
const flagAt = async () => {
  const f = await p.locator('.review-map .map-flag, .review-map [aria-label^="Fahne"]').first().boundingBox().catch(() => null);
  return f ? { x: Math.round(f.x), y: Math.round(f.y) } : null;
};
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/resetuphole-0.png` });
const f0 = await flagAt();
await p.getByRole('button', { name: /Loch falsch eingezeichnet/ }).click();
await p.waitForTimeout(3000);
ok((await p.locator('.review-setup-layer').count()) === 1, 'the set-up opened');
const map = await p.locator('.review-setup-layer .hole-map').boundingBox();
const tap = async (fx, fy) => {
  await p.mouse.click(map.x + map.width * fx, map.y + map.height * fy);
  await p.waitForTimeout(700);
};
await tap(0.5, 0.6);
await tap(0.55, 0.35);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/resetuphole-setup.png` });
const save = p.getByRole('button', { name: 'Loch speichern' });
ok((await save.count()) === 1 && (await save.isVisible()), '"Loch speichern" there');
await save.click();
await p.waitForTimeout(2500);
const l = await line();
ok(Array.isArray(l['Main#2']) || Object.keys(l).some((k) => /2$/.test(k)), `the new line kept for hole 2 (${JSON.stringify(Object.keys(l))})`);
ok((await p.locator('.review-setup-layer').count()) === 0 && (await p.locator('.review-map').count()) === 1, 'back on the map of the hole');
const f1 = await flagAt();
ok(!!f0 && !!f1 && Math.hypot(f1.x - f0.x, f1.y - f0.y) > 20, `the flag on the new green (${JSON.stringify(f0)} → ${JSON.stringify(f1)})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/resetuphole.png` });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
