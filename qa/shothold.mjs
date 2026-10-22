// QA (Sascha 22.10.2026): in "Schläge prüfen" a shot held down on the map is removed – with "Undo" for a few seconds; a
// short tap and moving it work as before. The hole's score line keeps "Doppelbogey" clear of the putts.
// Usage: node qa/shothold.mjs [url]
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
const rows = () => p.locator('.row-delete').count();
const before = await rows();
const marks = p.locator('.review-map .holdable');
ok(before >= 2 && (await marks.count()) >= 2, `shots in the list and on the map (${before} shots, ${await marks.count()} marks)`);
// hold a shot on the map (the first: the tee shot – the last marks are the balls on the green)
const last = marks.first();
const box = await last.boundingBox();
const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, pointerId: 1, bubbles: true, isPrimary: true, pointerType: 'touch' };
await last.dispatchEvent('pointerdown', at);
await p.waitForTimeout(900);
await last.dispatchEvent('pointerup', at).catch(() => {});
await p.waitForTimeout(500);
// held: asks first (pressed and then dragged, the shot only moves)
const ask = p.getByRole('dialog', { name: /Schlag 1 entfernen/ });
ok((await ask.count()) === 1 && (await rows()) === before, 'held on the map: "Schlag 1 entfernen?" – nothing removed yet');
await ask.getByRole('button', { name: 'Entfernen' }).click();
await p.waitForTimeout(500);
ok((await rows()) === before - 1, `"Entfernen": the shot removed (${before} → ${await rows()})`);
ok(/entfernt/.test(await p.locator('.undo-toast').innerText().catch(() => '')), '"Schlag … entfernt · Rückgängig"');
await p.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(500);
ok((await rows()) === before, `"Rückgängig": the shot back (${await rows()})`);
// a short press removes nothing
const m2 = p.locator('.review-map .holdable').first();
const b2 = await m2.boundingBox();
const at2 = { clientX: b2.x + b2.width / 2, clientY: b2.y + b2.height / 2, pointerId: 2, bubbles: true, isPrimary: true, pointerType: 'touch' };
await m2.dispatchEvent('pointerdown', at2);
await p.waitForTimeout(150);
await m2.dispatchEvent('pointerup', at2);
await p.waitForTimeout(900);
ok((await rows()) === before, 'a short press removes nothing');
// the score line: the name of the score never over the putts
const cells = await p.locator('.review-score .sc-hero-main > div').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.right]));
const clear = cells.every((c, i) => i === 0 || c[0] >= cells[i - 1][1] - 1);
ok(clear, `the score line: no cell over the next (${cells.map((c) => c.map(Math.round).join('–')).join(' | ')})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
