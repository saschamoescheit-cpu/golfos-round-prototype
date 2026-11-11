// QA (Sascha 12.11.2026, design "Heute": "„Läuft gerade“-Karte oben auf der Startseite"): a pool of bets on its days
// shows on the start page above the modules – its name, "Tag N von M", my standing in green when ahead – and a tap
// opens the pool; without anything running there is no such card.
// Usage: node qa/runningcard.mjs [url]
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
const day = (d) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const now = new Date().toISOString();
// day 3 of 8; I made a bet: +20 $ from Chris
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-2), to: day(5), createdAt: now, currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }],
  wagers: [{ id: 'w1', player: 'p0', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
  progress: { w1: { best: 2, done: true, rounds: 1, at: now, perRound: [{ day: day(-1), course: 'Celebration Golf Club', value: 2, counted: true }] } },
};
const seed = async (pools) => {
  await p.evaluate((ps) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
    localStorage.setItem('golfos.pools.v1', JSON.stringify(ps));
  }, pools);
  await p.reload();
  await p.waitForTimeout(1500);
};
await p.goto(url);
await p.waitForTimeout(1200);

// nothing running: no card
await seed([]);
ok((await p.locator('.running-card').count()) === 0, 'nothing running: no "Läuft gerade"');

// a pool on its days
await seed([{ code: 'USA1', pool, me: 'p0' }]);
const card = p.locator('.running-card');
ok((await card.count()) === 1, 'a pool on its days: the card "Läuft gerade"');
const row = card.locator('.running-row').filter({ hasText: 'USA-Wetten' });
const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Tag 3 von 8/.test(txt) && /\+20 \$/.test(txt), `the pool's row: day and my standing (${txt})`);
ok((await row.locator('.running-value.good-text').count()) === 1, 'ahead: the amount in green');
const cardBox = await card.boundingBox();
const firstModule = await p.locator('.home-hero .module-card').first().boundingBox();
ok(!!cardBox && !!firstModule && cardBox.y + cardBox.height <= firstModule.y + 1, 'above the modules');
ok(((await row.boundingBox())?.height ?? 0) >= 44, 'a row big enough to tap');
await row.click();
await p.waitForTimeout(1200);
ok((await p.locator('.pool-screen, .pool-standings').count()) >= 1, 'a tap opens the pool');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
