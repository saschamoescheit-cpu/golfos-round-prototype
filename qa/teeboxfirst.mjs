// QA (Sascha 16.11.2026, iPad, Hawks Landing 4: "Wenn ich einen Schlag in der TeeBox manuell setze, dann sollte der erste
// Schlag auch automatisch Tee haben"): in "Schläge prüfen", a shot added by hand inside a tee box of the hole becomes shot
// 1 with "Tee" – the shot at the drawn tee behind it moves to 2 (nothing deleted). Usage: node qa/teeboxfirst.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const CID = 'osm:relation/4053362';
const HOLE = 4;
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPad Pro 11 landscape'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const pars = [4, 3, 4, 5, 4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 3, 4, 4, 3];
await p.goto(url);
await p.waitForTimeout(1000);
// the hole's drawn tee, a forward tee box of it, and a spot down the fairway
const geo = await p.evaluate(async ({ CID, HOLE }) => {
  const s = await import('/src/lib/storage.ts');
  const g = await import('/src/lib/geo.ts');
  await s.ensureGeometry(CID);
  const d = g.holeMapData(s.loadGeometry(CID), 'Main', HOLE);
  const c = (r) => [r.reduce((a, q) => a + q[0], 0) / r.length, r.reduce((a, q) => a + q[1], 0) / r.length];
  const box = d.tees.map(c).filter((q) => g.distanceM(q, d.tee) > 35 && g.distanceM(q, d.tee) < 200).sort((a, b) => g.distanceM(a, d.tee) - g.distanceM(b, d.tee))[0];
  const mid = g.pointAt ? g.pointAt(d.line, 260) : d.line[1];
  return { tee: d.tee, box, mid };
}, { CID, HOLE });
ok(!!geo.box, `a forward tee box on hole ${HOLE} (${JSON.stringify(geo.box)})`);
await p.evaluate(({ CID, pars, geo, HOLE }) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const holes = pars.map((par, i) => ({ par, loop: 'Main', index: i, label: String(i + 1), number: i + 1, strokeIndex: i + 1 }));
  const entries = pars.map((par) => ({ strokes: par, putts: 2 }));
  entries[HOLE - 1] = { strokes: 5, putts: 2, detail: { pin: null, shots: [{ pos: geo.tee, lie: 'tee', club: 'LW', penalty: false }, { pos: geo.mid, lie: 'fairway', club: '5W', penalty: false }], onGreen: null, holedOut: false } };
  const r = {
    id: 'hawks-qa', tee: 'Green', kind: 'social', mode: 'quick', format: { mode: 'single', scoring: 'net', allowance: 100, matchplay: false }, loopOrder: ['Main'], holes, capture: 'full', courseId: CID,
    courseName: 'Hawks Landing Golf Club', createdAt: '2026-11-15T12:00:00', finishedAt: '2026-11-15T17:00:00', currentHole: 0, signedAt: null,
    players: [{ id: 'me', isMe: true, name: 'Sascha', playingHandicap: 4 }], entries: { me: entries },
  };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
}, { CID, pars, geo, HOLE });
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hawks/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(2500);
for (let i = 1; i < HOLE; i++) {
  await p.getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(700);
}
await p.waitForTimeout(2500);
// screen point of a place: from the two shot marks (a similarity transform – the map may be turned along the hole)
const mark = async (n) => {
  const bb = await p.locator('.review-map .maplibregl-marker').filter({ hasText: new RegExp(`^${n}( |$)`) }).first().boundingBox();
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
};
const [s1, s2] = [await mark(1), await mark(2)];
const toXY = (q) => {
  const k = Math.cos((geo.tee[1] * Math.PI) / 180);
  const P = (a) => ({ x: a[0] * k, y: -a[1] });
  const [A, B, Q] = [P(geo.tee), P(geo.mid), P(q)];
  const u = { x: B.x - A.x, y: B.y - A.y };
  const v = { x: s2.x - s1.x, y: s2.y - s1.y };
  const den = u.x * u.x + u.y * u.y;
  const a = (u.x * v.x + u.y * v.y) / den;
  const bb = (u.x * v.y - u.y * v.x) / den;
  const w = { x: Q.x - A.x, y: Q.y - A.y };
  return { x: s1.x + a * w.x - bb * w.y, y: s1.y + bb * w.x + a * w.y };
};
const t = toXY(geo.box);
await p.getByRole('button', { name: 'Schlag hinzufügen' }).first().click();
await p.waitForTimeout(500);
await p.mouse.click(t.x, t.y);
await p.waitForTimeout(1200);
await p.keyboard.press('Escape').catch(() => {});
const shots = await p.evaluate((HOLE) => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries.me[HOLE - 1].detail.shots, HOLE);
const d0 = shots[0] && Math.hypot((shots[0].pos[0] - geo.box[0]) * 97000, (shots[0].pos[1] - geo.box[1]) * 111000);
ok(shots.length === 3 && d0 < 12 && shots[0].lie === 'tee', `the shot in the tee box is shot 1, "Tee" (${shots.length} shots, ${Math.round(d0)} m from the box, ${shots[0]?.lie})`);
ok(JSON.stringify(shots[1]?.pos) === JSON.stringify(geo.tee) && shots[1]?.club === 'LW', 'the shot at the drawn tee kept – now shot 2');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/teeboxfirst.png` });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
