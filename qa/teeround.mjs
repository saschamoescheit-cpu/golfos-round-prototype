// QA (Sascha 13.11.2026, click paths: "Abschlag in der Runde"): the tee changed in the middle of a round – the hole drawer
// has "Tee · Gelb"; the sheet offers the course's tees with length and course rating; red chosen: the round, the player's
// own tee and his playing handicap follow, the row says "Tee · Rot". Usage: node qa/teeround.mjs [url]
import { webkit } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
await mockNet(ctx).catch(() => {});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ hcpIndex: '14,2', tee: 'Yellow' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
const round = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
const r0 = await round();
await p.getByRole('button', { name: 'Lochübersicht öffnen' }).click();
await p.waitForTimeout(500);
const row = p.locator('.hole-drawer .drawer-row').filter({ hasText: /^Tee · / });
ok((await row.count()) === 1 && /Tee · Gelb/.test(await row.innerText()), `the drawer: "${(await row.innerText().catch(() => '')).replace(/\s+/g, ' ').replace('›', '').trim()}"`);
await row.click();
const sheet = p.getByRole('dialog', { name: 'Tee' });
const opts = await sheet.locator('.pick-option').allInnerTexts();
ok(opts.length > 1 && opts.some((t) => /Rot/.test(t) && /Course Rating/.test(t)), `the sheet: the course's tees with rating (${opts.length})`);
await sheet.locator('.pick-option').filter({ hasText: 'Rot' }).first().click();
await p.waitForTimeout(800);
const r1 = await round();
const me0 = r0.players.find((x) => x.isMe);
const me1 = r1.players.find((x) => x.isMe);
ok(r1.tee === 'Red' && me1.tee === 'Red' && me1.playingHandicap != null && me1.playingHandicap !== me0.playingHandicap, `red: round and own tee red, playing handicap ${me0.playingHandicap} → ${me1.playingHandicap}`);
await p.getByRole('button', { name: 'Lochübersicht öffnen' }).click();
await p.waitForTimeout(500);
ok(/Tee · Rot/.test(await p.locator('.hole-drawer .drawer-row').filter({ hasText: /^Tee · / }).innerText()), 'the drawer now: "Tee · Rot"');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
