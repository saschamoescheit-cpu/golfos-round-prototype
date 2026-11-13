// QA (click paths 13.11.2026): the host owing a player without the app saw "Erhalten" on his own debt ("20 $ von Sascha
// erhalten") – the receiver counted as his because the host's phone marks for players without the app. Now: his own side
// first – "Bezahlt"; tapped, it is settled at once (nobody else could confirm it for Erik). Erik's own debt to the host
// stays "Erhalten" on the host's phone.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/hostpays.mjs [url]
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
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
await H.waitForTimeout(1500);
const row = H.locator('.pool-pays li').filter({ hasText: 'Sascha zahlt an Erik' });
const mark = row.locator('.paid-mark');
if (process.env.DBG) console.log((await H.locator('.pool-pays').innerText().catch(() => '')).replace(/\s+/g, ' '));
ok((await row.count()) === 1 && (await mark.count()) === 1 && !/erhalten/i.test((await mark.getAttribute('aria-label')) ?? '') && /bezahlt/i.test((await mark.getAttribute('aria-label')) ?? ''), `the host's own debt to Erik (no app): "Bezahlt", not "Erhalten" (${await mark.getAttribute('aria-label').catch(() => '')})`);
const fromChris = H.locator('.pool-pays li').filter({ hasText: 'Chris zahlt an Sascha' }).locator('.paid-mark');
ok((await fromChris.count()) === 1 && /erhalten/i.test((await fromChris.getAttribute('aria-label')) ?? ''), 'what Chris owes the host: "Erhalten" on the host\'s phone');
await mark.click();
await H.waitForTimeout(2000);
const pay = (shared.get(code).game.payments ?? []).find((x) => x.from === 's' && x.to === 'e');
ok(!!pay?.paidAt && !!pay?.receivedAt, `paid to Erik (no app): settled at once (${JSON.stringify(pay)})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
