// QA (Sascha 12.11.2026: "in Bilanz my Verlust should say 30 $ and Gewinn 320 $ – Geld renamed Bilanz, there the 290
// are right"): a pool's bets each on their own side – the bets I won on "Gewinn", the bets I lost on "Verlust", the sum
// on "Bilanz"; the tile "Verlust" lists the pool with what I lost in it.
// Sascha made 3 pars in a row (20 $ from Chris and from Erik: +40), Chris made 2 birdies in a row (Sascha pays 20 $):
// Gewinn 40 $, Verlust 20 $, Bilanz +20 $.
// Usage: node qa/balancegross.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const now = new Date().toISOString();
const made = (value) => ({ best: value, done: true, rounds: 1, at: now, perRound: [{ day: day(-1), course: 'Celebration Golf Club', value, counted: true }] });
const pool = {
  kind: 'wager-pool',
  id: 'pool-usa',
  name: 'USA-Wetten',
  from: day(-3),
  to: day(5),
  createdAt: now,
  currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }, { id: 'p2', name: 'Erik' }],
  wagers: [
    { id: 'w1', player: 'p0', kind: 'parRun', target: 3, stake: 20, payout: 'success', attempts: 'any', counted: true },
    { id: 'w2', player: 'p1', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true },
  ],
  progress: { w1: made(4), w2: made(2) },
};

await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((pl) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'USA1', pool: pl, me: 'p0' }]));
  sessionStorage.setItem('golfos.module', 'games');
}, pool);
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(800);

const tile = (name) => p.locator('.balance-totals .tile').filter({ hasText: name });
const num = async (name) => (await tile(name).locator('.tile-num').innerText()).replace(/\s+/g, ' ').trim();
const won = await num('Gewinn');
const lost = await num('Verlust');
const sum = await num('Bilanz');
ok(won === '40 $', `Gewinn: the bets won, each on its own (${won})`);
ok(lost === '20 $', `Verlust: the bet lost – not set off against the wins (${lost})`);
ok(sum === '+20 $', `Bilanz: the sum (${sum})`);
ok((await p.locator('.balance-totals .tile').filter({ hasText: 'Geld' }).count()) === 0, 'no tile "Geld" any more');
await tile('Verlust').click();
await p.waitForTimeout(400);
const entry = (await p.locator('.balance-entry').filter({ hasText: 'USA-Wetten' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/−20 \$|-20 \$/.test(entry), `tile "Verlust": the pool with what was lost in it (${entry})`);
await tile('Gewinn').click();
await p.waitForTimeout(400);
const entry2 = (await p.locator('.balance-entry').filter({ hasText: 'USA-Wetten' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/\+40 \$/.test(entry2), `tile "Gewinn": the pool with what was won in it (${entry2})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
