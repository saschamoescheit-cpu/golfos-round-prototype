// QA (Sascha 14.11.2026 after the Reserve: Supabase blocked the project – 402 "exceed_egress_quota" – and the bets' standing
// showed old figures as if right): while the server refuses, the standing and the settlement say "Nicht aktuell"; the
// server back, the line is gone. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/serverstale.mjs [url]
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
  async ({ from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      // Erik without the app, Chris without the app
      players: [{ id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'e', name: 'Erik' }, { id: 'c', name: 'Chris' }],
      wagers: [
        { id: 'w1', player: 'e', kind: 'birdies', target: 1, stake: 20, payout: 'success', attempts: 'any' },
        { id: 'w2', player: 's', kind: 'birdies', target: 1, stake: 10, payout: 'success', attempts: 'any' },
      ],
      progress: {
        w1: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
        w2: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
      },
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-3), to: day(-1) },
);
const openPool = async () => {
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(1500);
  await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await H.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await H.waitForTimeout(2000);
};
await openPool();
ok((await H.locator('.server-stale').count()) === 0, 'the server answers: no "Nicht aktuell"');
// the server refuses as on 13.11.2026
const refuse = (r) => r.fulfill({ status: 402, contentType: 'application/json', body: JSON.stringify({ message: 'Service for this project is restricted due to the following violations: exceed_egress_quota' }) });
await H.context().route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, refuse);
await openPool();
const standing = H.getByRole('region', { name: 'Stand der Wetten' });
const settle = H.getByRole('region', { name: 'Abrechnung' });
const said = async (loc) => ((await loc.locator('.server-stale').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
ok(/Nicht aktuell · keine Verbindung zum Server seit/.test(await said(standing)), `the standing: "${await said(standing)}"`);
ok(/Nicht aktuell/.test(await said(settle)), 'the settlement: "Nicht aktuell" too');
// back: the line gone after the next answer
await H.context().unroute(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, refuse);
await openPool();
await H.waitForTimeout(1500);
ok((await H.locator('.server-stale').count()) === 0, 'the server back: "Nicht aktuell" gone');
ok(host.errs.filter((e) => !/402|restricted/.test(e)).length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
