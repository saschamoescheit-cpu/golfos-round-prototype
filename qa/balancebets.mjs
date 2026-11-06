// QA (Sascha 06.11.2026, USA trip): the tile "Wetten" in Bilanz tapped – "Deine Wetten" looked different from the Bilanz
// as it opens. Now the same card of the pool under the tapped tile as on the page, and a $ pool with nothing won yet
// shows "0 $", not "0 €".
// Usage: node qa/balancebets.mjs [url]
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
const pool = {
  kind: 'wager-pool',
  id: 'pool-usa',
  name: 'USA-Wetten',
  from: day(-1),
  to: day(5),
  createdAt: new Date().toISOString(),
  players: [
    { id: 'p0', name: 'Sascha' },
    { id: 'p1', name: 'Chris' },
  ],
  wagers: [],
  progress: {},
  currency: 'USD',
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

const card = () => p.locator('.balance-pool').filter({ hasText: 'USA-Wetten' });
const look = async () => {
  const c = card();
  if ((await c.count()) !== 1) return null;
  return { text: (await c.innerText()).replace(/\s+/g, ' ').trim(), cls: await c.getAttribute('class'), height: Math.round((await c.boundingBox()).height) };
};
const before = await look();
ok(before != null && /WETTEN USA-Wetten läuft 0 \$/i.test(before.text), `Bilanz opened: the pool as its card, "0 $" in the pool's currency (${before?.text})`);
const money = (await p.locator('.balance-totals .tile-num').allInnerTexts()).slice(3).map((t) => t.trim());
ok(money.length === 3 && money.every((t) => t === '0 $'), `Gewinn, Verlust, Geld of a $ pool only: "0 $" (${money.join(' | ')})`);
const tile = p.locator('.balance-totals button.tile').filter({ hasText: 'Wetten' });
await tile.click();
await p.waitForTimeout(500);
const after = await look();
ok((await tile.getAttribute('aria-pressed')) === 'true', 'the tile "Wetten" tapped');
ok(after != null && after.text === before?.text && after.cls === before?.cls && after.height === before?.height, `under the tapped tile: the same card (${after?.text} · ${after?.height} px)`);
ok((await p.locator('.balance-entry').count()) === 0, 'no list of a different look under the tile');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/balance-bets.png', fullPage: true });
await card().locator('.balance-pool-head').click();
await p.waitForTimeout(1000);
ok((await p.locator('.topbar h1').innerText().catch(() => '')).includes('USA-Wetten'), 'a tap on the card opens the pool');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
