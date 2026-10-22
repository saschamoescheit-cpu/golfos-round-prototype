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
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
