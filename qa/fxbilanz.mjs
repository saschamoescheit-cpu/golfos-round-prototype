// QA (Sascha 12.11.2026: "everything is dollars now – what if we play for euros? A setting in the profile for the
// standard currency; with euro chosen and a bet running in dollars, it is converted to euro at the cut-off day with the
// dollar rate"): the profile has "Standardwährung" (none by default – each in its own currency); Bilanz shows a $ pool in € – a pool that ended:
// at the rate of its last day ("Kurs vom …"), a pool still running: today's rate ("≈ … fest am …"); with Dollar as the
// standard currency nothing is converted. The ECB rates (frankfurter.app) are simulated.
// Usage: node qa/fxbilanz.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const asked = [];
await ctx.route(/api\.frankfurter\.app/, (route) => {
  const u = route.request().url();
  asked.push(u);
  const rate = /latest/.test(u) ? 0.95 : 0.9;
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'USD', rates: { EUR: rate } }) });
});
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
const poolOf = (id, name, from, to) => ({
  kind: 'wager-pool', id, name, from, to, createdAt: now, currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }],
  wagers: [{ id: `${id}-w`, player: 'p0', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
  progress: { [`${id}-w`]: { best: 2, done: true, rounds: 1, at: now, perRound: [{ day: from, course: 'Celebration Golf Club', value: 2, counted: true }] } },
});
const seed = async (pools, currency) => {
  await p.evaluate(({ ps, c }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '', ...(c ? { currency: c } : {}) }));
    localStorage.setItem('golfos.pools.v1', JSON.stringify(ps));
    sessionStorage.setItem('golfos.module', 'games');
  }, { ps: pools, c: currency });
  await p.reload();
  await p.waitForTimeout(1500);
  await p.locator('.tabbar button').filter({ hasText: /^\s*Bilanz\s*$/ }).click();
  await p.waitForTimeout(1500);
};
const tile = async (name) => (await p.locator('.balance-totals .tile').filter({ hasText: name }).locator('.tile-num').innerText()).replace(/\s+/g, ' ').trim();
await p.goto(url);
await p.waitForTimeout(1200);

// a $ pool that ended yesterday, Euro chosen as the standard currency: at the rate of its last day
// none chosen (the default): nothing converted – the trip stays in dollars
await seed([{ code: 'A1', pool: poolOf('a', 'Florida', day(-6), day(-1)), me: 'p0' }]);
const t0 = await tile('Bilanz');
ok(t0 === '+20 $' && (await p.locator('.fx-note').count()) === 0, `no standard currency chosen: "+20 $", nothing converted (${t0})`);
await seed([{ code: 'A1', pool: poolOf('a', 'Florida', day(-6), day(-1)), me: 'p0' }], 'EUR');
const t1 = await tile('Bilanz');
ok(t1 === '+18 €', `ended $ pool: +20 $ at 0,90 → "+18 €" (${t1})`);
const note1 = (await p.locator('.fx-note').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/1 \$ = 0,9.* Kurs vom/.test(note1), `the line says which rate: ${note1}`);
ok(asked.some((u) => u.includes(day(-1))), 'asked for the rate of the cut-off day');

// a pool still running: today's rate, "≈"
asked.length = 0;
await seed([{ code: 'B1', pool: poolOf('b', 'USA-Wetten', day(-2), day(5)), me: 'p0' }], 'EUR');
const t2 = await tile('Bilanz');
ok(t2 === '+19 €', `running $ pool: today's rate 0,95 → "+19 €" (${t2})`);
const note2 = (await p.locator('.fx-note').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/≈ 0,95.* heutiger Kurs, fest am/.test(note2), `"≈ … heutiger Kurs, fest am …": ${note2}`);

// Dollar the standard currency: nothing converted
await seed([{ code: 'B1', pool: poolOf('b', 'USA-Wetten', day(-2), day(5)), me: 'p0' }], 'USD');
const t3 = await tile('Bilanz');
ok(t3 === '+20 $' && (await p.locator('.fx-note').count()) === 0, `Dollar as standard: "+20 $", no conversion line (${t3})`);

// the profile: "Standardwährung" Euro / Dollar
await p.locator('.tabbar button').filter({ hasText: /^\s*Profil\s*$/ }).click();
await p.waitForTimeout(800);
const seg = p.getByRole('group', { name: 'Währung' });
ok((await seg.count()) === 1 && /Euro/.test(await seg.innerText()) && /Dollar/.test(await seg.innerText()), 'Profil: "Standardwährung" with Euro and Dollar');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
