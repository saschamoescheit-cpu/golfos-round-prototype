// QA (Sascha 12.11.2026, Cypress: the course had no map during the round – "now that Cypress has a map, the shots from
// the GPS track"): a round whose first hole has its shots and whose second has none (its map came later) – "Schläge
// prüfen" finds the second hole's shots from the track by itself, the first stays as it was.
// Usage: node qa/detectlate.mjs [url]
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
const before = await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const r = { ...exp.round, signedAt: null, capture: 'full', manualShots: [] };
  const me = r.players.find((x) => x.isMe).id;
  // hole 2 never got its shots (no map during the round)
  r.entries[me][1] = { ...r.entries[me][1], detail: undefined, puttsAt: undefined };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
  localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
  return { first: JSON.stringify(r.entries[me][0].detail?.shots ?? []), n: r.entries[me][0].detail?.shots?.length ?? 0 };
}, exp);
ok(before.n > 0, `hole 1 has its shots (${before.n}), hole 2 none`);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(3500);
const after = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const me = r.players.find((x) => x.isMe).id;
  return { first: JSON.stringify(r.entries[me][0].detail?.shots ?? []), second: r.entries[me][1].detail?.shots ?? [] };
});
ok(after.second.length > 0 && after.second.every((s) => s.review), `hole 2: shots from the GPS track, to check (${after.second.length})`);
ok(after.first === before.first, 'hole 1 as it was');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
