// QA (Sascha 16.11.2026, Legends: "Beim Rundensetup wurde es Thomas in Meter statt in Yards angezeigt, obwohl er in
// seinem Profil alles in Yards eingestellt hat"): the tees' lengths in "Neue Runde" and the caddie's standard distances
// in the unit of the profile – yards with "Distanzen in Yards", metres as before.
// Usage: node qa/setupyards.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const start = async (unit) => {
  await p.goto(url);
  await p.evaluate((u) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Thomas', lastName: '', hcpIndex: '12', homeClub: '' }));
    localStorage.setItem('golfos.unit.v1', JSON.stringify(u));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, unit);
  await p.reload();
  await p.waitForTimeout(1000);
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2500);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
  await p.locator('.player-row').first().locator('.tee-pick').click();
  const tees = (await p.getByRole('dialog', { name: 'Tee' }).locator('.pick-option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  await p.keyboard.press('Escape');
  await p.getByRole('dialog', { name: 'Tee' }).locator('xpath=..').click({ position: { x: 5, y: 5 } }).catch(() => {});
  const note = (await p.locator('.good-text').filter({ hasText: 'Standard-Weiten' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  return { tees, note };
};

const yd = await start('yd');
ok(yd.tees.length > 1 && yd.tees.every((t) => /\d+ yd\b/.test(t) && !/\d+ m\b/.test(t)), `yards in the profile: the tees in yd (${yd.tees.join(' | ')})`);
// Hetzenhof white: the metres × 1.09361, not the metres with "yd"
const white = yd.tees.find((t) => /Weiß/.test(t)) ?? '';
const n = Number(/(\d+) yd/.exec(white)?.[1] ?? 0);
ok(n === Math.round(6286 * 1.09361), `…converted, not the metres renamed (Weiß ${n} yd)`);
ok(/Driver 219 yd … PW 126 yd/.test(yd.note), `the caddie's standard distances in yd (${yd.note})`);
const m = await start('m');
ok(m.tees.length > 1 && m.tees.every((t) => /\d+ m\b/.test(t) && !/ yd\b/.test(t)), `metres in the profile: the tees in m as before (${m.tees.join(' | ')})`);
ok(/Driver 200 m … PW 115 m/.test(m.note), 'the caddie\'s standard distances in m');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
