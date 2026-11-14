// QA (Sascha 14.11.2026: the Reserve round stored as White, played from Blue – "Abschlag nachträglich ändern"): a finished
// round (Hetzenhof 16.10.2026, yellow) – on its scorecard the tee beside the date opens the tee sheet; red picked, the
// round and the own player are red, the header says so, the own playing handicap follows the new tee.
// Usage: node qa/teeafter.mjs [url]
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
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ name: 'Sascha', hcpIndex: '5,4' }));
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: null }]));
}, exp);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
const before = await stored();
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/teeafter.png' });
const btn = p.getByRole('button', { name: /^Abschlag .* – ändern$/ });
ok((await btn.count()) === 1, `the scorecard: the tee beside the date to tap (${before.tee})`);
await btn.click();
const sheet = p.getByRole('dialog', { name: 'Tee' });
await sheet.waitFor({ timeout: 4000 }).catch(() => {});
const names = await sheet.locator('.pick-option strong').allInnerTexts();
ok(names.length > 1, `the sheet: the course's tees (${names.join(', ')})`);
await sheet.locator('.pick-option').filter({ hasText: 'Rot' }).first().click();
await p.waitForTimeout(800);
const after = await stored();
const me = after.players.find((x) => x.isMe);
const me0 = before.players.find((x) => x.isMe);
ok(after.tee === 'Red' && me.tee === 'Red', `stored: the round and the own player red (${after.tee}, ${me.tee})`);
ok(me.playingHandicap !== me0.playingHandicap || me0.playingHandicap == null, `the own playing handicap follows the tee (${me0.playingHandicap} → ${me.playingHandicap})`);
ok(after.entries && JSON.stringify(after.entries) === JSON.stringify(before.entries), 'the scores and shots kept');
ok(/Rot/.test(await p.getByRole('button', { name: /^Abschlag .* – ändern$/ }).innerText()), 'the header says red');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
