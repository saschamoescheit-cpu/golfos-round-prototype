// QA (Sascha 22.10.2026): penalty strokes are lines of their own in "Schläge prüfen" – under the shot they belong to,
// and the ones entered on the course but not tied to a shot yet before the putts; a tap asks which shot, then water or
// out of bounds.
// Usage: node qa/penaltyrows.mjs [url]
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
  // two penalty strokes entered on the course for the first hole, none tied to a shot
  const me = r.players.find((x) => x.isMe).id;
  const e0 = r.entries[me][0];
  r.entries[me][0] = { ...e0, penalties: 2, strokes: (e0.strokes ?? 4) + 2, detail: e0.detail ? { ...e0.detail, shots: e0.detail.shots.map((s) => ({ ...s, penalty: false })) } : e0.detail };
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
const open = () => p.locator('.penalty-row.open').count();
const tied = () => p.locator('.penalty-row:not(.open)').count();
ok((await open()) === 2 && (await tied()) === 0, `two penalty strokes from the course as lines of their own (${await open()} open)`);
// tie one to shot 1: which shot → that shot's sheet → water
await p.locator('.penalty-row.open .shot-row').first().click();
const pick = p.getByRole('dialog', { name: 'Zu welchem Schlag gehört der Strafschlag?' });
ok((await pick.count()) === 1, 'a tap asks which shot it belongs to');
await pick.locator('.pick-option').first().click();
await p.waitForTimeout(400);
await p.getByRole('group', { name: 'Strafschlag' }).getByRole('button', { name: 'Wasser' }).click();
await p.getByRole('button', { name: /^Speichern/ }).last().click();
await p.waitForTimeout(600);
ok((await open()) === 1 && (await tied()) === 1, `one tied, one still open (${await tied()} tied, ${await open()} open)`);
const rowsText = await p.locator('.review-list li').allInnerTexts();
const iPen = rowsText.findIndex((t) => /Strafschlag · Wasser/.test(t));
ok(iPen === 1 && /nach Schlag 1/.test(rowsText[iPen]), `the penalty under shot 1: "${(rowsText[iPen] ?? '').replace(/\s+/g, ' ')}"`);
// the open one dragged by its grip under shot 2 (Sascha 22.10.2026: "penalty strokes must move like shots")
{
  await p.waitForTimeout(800); // the map scrolls into view for "where it went in" first
  const grip = p.locator('.penalty-row.open .row-grip').first();
  await grip.scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  const g = await grip.boundingBox();
  const shot2 = await p.locator('.review-list li[data-shot="1"]').boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  for (let s = 1; s <= 8; s++) await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + ((shot2.y + shot2.height * 0.75 - (g.y + g.height / 2)) * s) / 8);
  await p.mouse.up();
  await p.waitForTimeout(600);
  const texts = await p.locator('.review-list li').allInnerTexts();
  ok((await open()) === 0 && texts.some((t) => /Strafschlag/.test(t) && /nach Schlag 2/.test(t)), `dragged by its grip under shot 2: tied to shot 2 (${await open()} open)`);
  // then shot 2's sheet opens by itself: water or out of bounds (Sascha 22.10.2026, hole 8C)
  const pen = p.getByRole('group', { name: 'Strafschlag' });
  ok((await pen.count()) === 1, "after the drag the shot's sheet opens: water or out of bounds");
  // water, played again from the same spot (stroke and distance) – then where it went in
  await pen.getByRole('button', { name: 'Wasser' }).click();
  const then = p.getByRole('group', { name: 'Danach' });
  ok((await then.getByRole('button', { name: 'Gedroppt' }).count()) === 1 && (await then.getByRole('button', { name: 'Erneut von hier' }).count()) === 1, 'water: "Gedroppt" or "Erneut von hier"');
  await then.getByRole('button', { name: 'Erneut von hier' }).click();
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
  const me = before.players.find((x) => x.isMe).id;
  const n0 = before.entries[me][0].detail.shots.length;
  await p.getByRole('button', { name: /^Speichern/ }).last().click();
  await p.waitForTimeout(600);
  ok(/ins Wasser ging/.test((await p.locator('main').allInnerTexts()).join(' ')), 'then: tap the map where it went into the water');
  await p.waitForTimeout(300);
  const map = await p.locator('.maplibregl-canvas').first().boundingBox();
  await p.mouse.click(map.x + map.width * 0.5, map.y + map.height * 0.35);
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
  const sh = after.entries[me][0].detail.shots;
  const d = (a, b) => Math.hypot((a[0] - b[0]) * 70000, (a[1] - b[1]) * 111000);
  ok(sh.length === n0 + 1 && sh[1].replay === true && sh[1].missPos && d(sh[2].pos, sh[1].pos) < 1, `again from here: the next shot from the same spot (${n0} → ${sh.length} shots)`);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
