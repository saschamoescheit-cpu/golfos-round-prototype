// QA (Sascha 15.11.2026, Hawks Landing on the course: "Hawks Landing kann noch nicht gewertet werden, weil sie läuft.
// Also müsste hier läuft gerade stehen"): the pool's standing on a round in play – under its name "N von M läuft
// gerade", no "gewertet" beside it (as "N von M geplant"); a round played: "gewertet" for the host as before.
// Usage: node qa/inplaysub.mjs [url]
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
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-2), to: day(5), createdAt: now, currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha', joined: { name: 'Sascha', at: now } }, { id: 'p1', name: 'Chris' }],
  wagers: [{ id: 'w1', player: 'p0', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
  progress: {
    w1: {
      best: 2, done: true, rounds: 1, at: now,
      perRound: [
        { day: day(-1), course: 'Celebration Golf Club', value: 2, counted: true },
        { day: day(0), course: 'Hawks Landing Golf Club', value: 0, counted: true, open: true },
      ],
    },
  },
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
const sub = async () => (await stand.locator('.step-pick-now .muted').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const pick = async (name) => {
  await stand.locator('.step-pick-now').click();
  await p.getByRole('dialog', { name: 'Runden' }).locator('.pick-option').filter({ hasText: name }).first().click();
  await p.waitForTimeout(400);
};
await pick('Hawks');
const s1 = await sub();
ok(/^\d+ von \d+ läuft gerade$/.test(s1), `the round in play: "${s1}" – no "gewertet"`);
if (process.env.SHOTS) await stand.screenshot({ path: process.env.SHOTS + '/inplaysub.png' });
await pick('Celebration');
const s2 = await sub();
ok(/^\d+ von \d+/.test(s2) && !/läuft|geplant/.test(s2), `the round played: "${s2}"`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
