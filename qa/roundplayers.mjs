// QA (Sascha 16.11.2026 after Hawks Landing: "Heute haben nur Cedric, Erik und Sascha gespielt und deshalb dürfen die
// Wetten auch nur für diese Spieler zählen. Bei der einzelnen Runde würde ich dann Chris und Moritz auch gar nicht
// anzeigen. Bei gesamt sind natürlich alle zu sehen"): the pool's standing on one round shows only the players of that
// round (Chris showed "0" there without a round); the total shows everyone; a bet made in it is paid only by those who
// played (Sascha's sum: 2 × 20 $, not 4 × 20 $).
// Usage: node qa/roundplayers.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const day = (d) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const now = new Date().toISOString();
const C1 = 'Celebration Golf Club';
const C2 = 'Hawks Landing Golf Club';
const ids = { Sascha: 'p0', Cedric: 'p1', Chris: 'p2', Erik: 'p3', Moritz: 'p4' };
const wagers = [];
const progress = {};
for (const [n, id] of Object.entries(ids)) {
  const w = `w-${n}`;
  wagers.push({ id: w, player: id, kind: 'birdies', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true });
  const r = [{ day: day(-2), course: C1, value: 1, counted: true }];
  // Hawks Landing: only Sascha, Cedric and Erik – Sascha made his two birdies there
  if (['Sascha', 'Cedric', 'Erik'].includes(n)) r.push({ day: day(-1), course: C2, value: n === 'Sascha' ? 2 : 1, counted: true });
  progress[w] = { best: n === 'Sascha' ? 2 : 1, done: n === 'Sascha', rounds: r.length, at: now, perRound: r };
}
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-3), to: day(5), createdAt: now, currency: 'USD',
  players: Object.entries(ids).map(([name, id]) => ({ id, name, ...(id === 'p0' ? { joined: { name, at: now } } : {}) })),
  wagers, progress,
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((ps) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.pools.v1', JSON.stringify(ps));
  sessionStorage.setItem('golfos.module', 'games');
}, [{ code: 'USA1', pool, me: 'p0', host: true }]);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await p.getByText('USA-Wetten').first().click();
const stand = p.locator('.pool-standings');
await stand.waitFor({ timeout: 15000 });
const heads = async () => (await stand.locator('.bet-matrix thead th').allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(',');
const pick = async (name) => {
  await stand.locator('.step-pick-now').click();
  await p.getByRole('dialog', { name: 'Runden' }).locator('.pick-option').filter({ hasText: name }).first().click();
  await p.waitForTimeout(400);
};
await pick('Hawks');
const h1 = await heads();
ok(h1 === 'Sascha,Cedric,Erik', `Hawks Landing: only its players – no Chris, no Moritz (${h1})`);
const sum = (await stand.locator('.bet-sum-row td').first().innerText()).replace(/\s+/g, ' ');
ok(/\+40\s?\$/.test(sum), `Sascha's two birdies paid by the two who played: +40 $, not +80 $ (${sum})`);
if (process.env.SHOTS) await stand.screenshot({ path: process.env.SHOTS + '/roundplayers.png' });
await pick('Celebration');
const h2 = await heads();
ok(h2 === 'Sascha,Cedric,Chris,Erik,Moritz', `a round everyone played: everyone (${h2})`);
await pick('Gesamt');
const h3 = await heads();
ok(h3 === 'Sascha,Cedric,Chris,Erik,Moritz', `the total: everyone (${h3})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
