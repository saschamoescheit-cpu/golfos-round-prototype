// QA (Sascha 16.11.2026, Orlando, after Hawks Landing: "Bei der Rundennachbereitung kann ich die Schläge wieder nicht
// richtig positionieren, er springt wieder. Das war behoben und darf nicht mehr vorkommen."): in "Schläge prüfen" a
// shot dragged on the map stays under the finger and lies where it was let go – also when the round is read anew in the
// middle of the drag (the sync every 2 minutes, a track from the watch or another phone, a save) – and the map keeps
// the view the player zoomed to (it went back to the whole hole: a new copy of the hole's data reset the camera).
// Before 16.11.2026 every render removed and re-created all shot markers: one under the finger was gone mid-drag.
// A real round (Hetzenhof 16.10.2026). Usage: node qa/shotdragsync.mjs [url]   (SHOTS=dir)
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
const rid = await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = { ...exp.round, signedAt: null, capture: 'full' };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
  return r.id;
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3500);
const stored = () =>
  p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
    const me = r.players.find((x) => x.isMe).id;
    return r.entries[me][0].detail?.shots?.map((s) => s.pos) ?? [];
  });
// the round read anew, as the sync, a save or a track from another device does: a new copy of everything
const reread = () =>
  p.evaluate((id) => {
    window.dispatchEvent(new Event('golfos:rounds-changed'));
    window.dispatchEvent(new CustomEvent('golfos:track-changed', { detail: id }));
  }, rid);
const flag = () => p.locator('.review-map .map-flag, .review-map [aria-label^="Fahne"]').first().boundingBox();
const shot = (n) => p.locator('.review-map .maplibregl-marker').filter({ hasText: new RegExp(`^${n}( |$)`) }).first();

await p.locator('.review-map').scrollIntoViewIfNeeded();
const mapBox = await p.locator('.review-map').boundingBox();
// 1. shot 2 dragged – the round read anew twice in the middle of the drag
const before = await stored();
const m2 = shot(2);
await m2.waitFor({ timeout: 10000 });
const bb = await m2.boundingBox();
const x0 = bb.x + bb.width / 2;
const y0 = bb.y + bb.height / 2;
const x1 = Math.min(mapBox.x + mapBox.width - 30, Math.max(mapBox.x + 30, x0 + 60));
const y1 = Math.min(mapBox.y + mapBox.height - 30, Math.max(mapBox.y + 30, y0 - 50));
await p.mouse.move(x0, y0);
await p.mouse.down();
await p.mouse.move(x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, { steps: 6 });
await reread();
await p.waitForTimeout(400);
await p.mouse.move(x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, { steps: 6 });
const mid = await shot(2).boundingBox();
ok(!!mid && Math.hypot(mid.x + mid.width / 2 - (x0 + ((x1 - x0) * 2) / 3), mid.y + mid.height / 2 - (y0 + ((y1 - y0) * 2) / 3)) < 8, `mid-drag, after the round was read anew: the shot still under the finger (${mid && Math.round(mid.x + mid.width / 2)},${mid && Math.round(mid.y + mid.height / 2)})`);
await reread();
await p.waitForTimeout(400);
await p.mouse.move(x1, y1, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(1500);
const after = await stored();
const land = await shot(2).boundingBox();
ok(!!land && Math.hypot(land.x + land.width / 2 - x1, land.y + land.height / 2 - y1) < 8, `let go: the shot lies where the finger left it (${land && Math.round(land.x + land.width / 2)},${land && Math.round(land.y + land.height / 2)} – finger ${Math.round(x1)},${Math.round(y1)})`);
const moved = before[1] && after[1] && Math.hypot(after[1][0] - before[1][0], after[1][1] - before[1][1]) > 1e-5;
ok(!!moved, `saved with the round (${JSON.stringify(before[1])} → ${JSON.stringify(after[1])})`);
ok(before.length === after.length && after.every((x, n) => n === 1 || JSON.stringify(x) === JSON.stringify(before[n])), 'the other shots stay where they were');

// 2. after a moment (the sync once more): still there – nothing puts it back
await reread();
await p.waitForTimeout(2000);
const later = await stored();
const land2 = await shot(2).boundingBox();
ok(JSON.stringify(later[1]) === JSON.stringify(after[1]) && !!land2 && Math.hypot(land2.x - land.x, land2.y - land.y) < 3, 'read anew afterwards: the shot stays where it was put');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/shotdragsync.png` });

// 3. the player moves the map himself (his own view) – it stays when the round is read anew (measured against the map's
// box: the page may scroll along)
const rel = async () => {
  const [fb, mb] = [await flag(), await p.locator('.review-map').boundingBox()];
  return fb && mb ? { x: fb.x - mb.x, y: fb.y - mb.y } : null;
};
await p.locator('.review-map').scrollIntoViewIfNeeded();
const mb0 = await p.locator('.review-map').boundingBox();
const fs0 = await rel();
await p.mouse.move(mb0.x + 40, mb0.y + mb0.height * 0.55);
await p.mouse.down();
await p.mouse.move(mb0.x + 100, mb0.y + mb0.height * 0.55 - 40, { steps: 10 });
await p.mouse.up();
await p.waitForTimeout(1200);
const f0 = await rel();
ok(!!fs0 && !!f0 && Math.hypot(f0.x - fs0.x, f0.y - fs0.y) > 15, `the map moved by the player (flag ${fs0 && Math.round(fs0.x)},${fs0 && Math.round(fs0.y)} → ${f0 && Math.round(f0.x)},${f0 && Math.round(f0.y)})`);
await reread();
await p.waitForTimeout(1500);
const f1 = await rel();
ok(!!f0 && !!f1 && Math.hypot(f1.x - f0.x, f1.y - f0.y) < 3, `his view stays when the round is read anew (flag ${f0 && Math.round(f0.x)},${f0 && Math.round(f0.y)} → ${f1 && Math.round(f1.x)},${f1 && Math.round(f1.y)})`);
// 4. another hole and back: the automatic view of the whole hole again (the guard must not keep a view for ever)
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Voriges Loch' }).click();
await p.waitForTimeout(1800);
await p.locator('.review-map').scrollIntoViewIfNeeded();
const f2 = await rel();
ok(!!f2 && !!fs0 && Math.hypot(f2.x - fs0.x, f2.y - fs0.y) < 6, `another hole and back: the whole hole as at the start (flag ${f2 && Math.round(f2.x)},${f2 && Math.round(f2.y)} – start ${fs0 && Math.round(fs0.x)},${fs0 && Math.round(fs0.y)})`);
const back = await stored();
ok(JSON.stringify(back[1]) === JSON.stringify(after[1]), 'and the moved shot still where it was put');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
