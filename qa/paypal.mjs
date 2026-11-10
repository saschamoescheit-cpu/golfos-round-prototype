// QA (Sascha 10.11.2026: "pay by PayPal right from the app – or cash, or transfer"; 11.11.2026: "PayPal we do not need
// for now, nor the details – paid and received is enough"): no PayPal in the settlement (nor in the profile – PAY_DETAILS off); Sascha owes
// Erik 20 $ – Erik taps "Erhalten" and it is in, no question how it came.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/paypal.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const { shared } = sim;
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const host = await sim.phone('Sascha');
const H = host.p;
const code = await H.evaluate(
  async ({ from, to, yday }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      players: [{ id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'e', name: 'Erik', joined: { name: 'Erik', at, uid: 'Erik' } }],
      wagers: [{ id: 'w1', player: 'e', kind: 'birdies', target: 1, stake: 20, payout: 'success', attempts: 'any' }],
      // decided by the host by hand – no phone's rounds judge it anew
      progress: { w1: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } } },
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-3), to: day(-1), yday: day(-2) },
);
shared.get(code).members.push('Erik');

// Erik: his PayPal.me name in the profile – his phone puts it to his player in the pool
const erik = await sim.phone('Erik');
const E = erik.p;
await E.evaluate(async () => {
  const pf = JSON.parse(localStorage.getItem('golfos.profile.v1'));
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...pf, paypal: 'ErikH' }));
  const ws = await import('/src/lib/wagerstore.ts');
  await ws.syncPools();
  await ws.reportWagers();
});
await E.waitForTimeout(1500);
ok(shared.get(code).game.players.find((p) => p.id === 'e')?.joined?.paypal === 'ErikH', "Erik's PayPal.me name in the pool");

const openPool = async (P) => {
  await P.evaluate(async () => {
    await (await import('/src/lib/wagerstore.ts')).syncPools();
    sessionStorage.setItem('golfos.module', 'games');
  });
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(1500);
  await P.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await P.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await P.waitForTimeout(1500);
};
await openPool(H);
if (process.env.DBG) console.log((await H.locator('.pool-settle').innerText().catch(() => 'no settle')).replace(/\s+/g, ' ').slice(0, 400));
ok((await H.locator('.pool-pays a.paypal-pay').count()) === 0 && (await H.locator('.pool-pays li').filter({ hasText: 'Sascha zahlt an Erik' }).count()) === 1, 'Sascha owes Erik 20 $ – no PayPal beside it');
await openPool(E);
await E.locator('.pool-pays').getByRole('button', { name: /erhalten/ }).first().click();
await E.waitForTimeout(2000);
ok((await E.getByRole('dialog', { name: 'Wie erhalten?' }).count()) === 0, '"Erhalten": no question how it came');
const pay = shared.get(code).game.payments?.[0];
ok(!!pay?.receivedAt && pay.amount === 20 && !pay.how, "the payment: received, nothing about how (" + JSON.stringify(pay) + ")");
ok(!/ · bar| · PayPal| · Überweisung/.test((await E.locator('.paid-list').innerText().catch(() => '')).replace(/\s+/g, ' ')), 'the list: only "erhalten"');
ok([host, erik].every((x) => x.errs.length === 0), `no page errors ${[host, erik].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
