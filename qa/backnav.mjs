// QA (Sascha 12.11.2026: "the app at some places goes back not one level but to the main menu" – tournament/series and
// bets/pool): a pool opened by a link from Rounds – its "Zurück" says "Runden" and goes back to Rounds, as it was; a
// tournament opened from the bets – "Zurück" to Games; Games left for another module and come back to opens on the pool
// it showed, not on its list.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/backnav.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const code = await H.evaluate(
  async ({ from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = { kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD', players: [{ id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'c', name: 'Chris' }], wagers: [{ id: 'w1', player: 's', kind: 'birdies', target: 3, stake: 20, payout: 'success', attempts: 'any' }], progress: {} };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-2), to: day(5) },
);
ok(!!code, `the pool: ${code}`);
// in Rounds, its start page – a link to the pool (as from a round's result)
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
ok((await H.getByRole('button', { name: 'Neue Runde' }).count()) === 1, 'in Rounds');
await H.evaluate((c) => window.dispatchEvent(new CustomEvent('golfos:go', { detail: { pool: c } })), code);
await H.waitForTimeout(4000);
const back = H.locator('.topbar .icon-btn').filter({ hasNot: H.locator('.module-switch') }).first();
ok(/USA-Wetten/.test(await H.locator('.topbar').innerText()) && /Runden/.test((await back.getAttribute('aria-label')) ?? (await back.innerText())), `the pool, "Zurück" to Rounds (${(await back.getAttribute('aria-label')) ?? ''})`);
await back.click();
await H.waitForTimeout(1200);
ok((await H.getByRole('button', { name: 'Neue Runde' }).count()) === 1, 'back: in Rounds again, not on the bets');
// in Games on the pool, a link to a tournament (another module) – its "Zurück" back to Games, on the pool again (not its list)
await H.locator('.module-switch').first().click();
await H.waitForTimeout(600);
await H.locator('.module-card').filter({ hasText: /Games/ }).first().click();
await H.waitForTimeout(1500);
await H.waitForTimeout(1500);
// Games remembers where it was: the pool again (Sascha 12.11.2026: "not back to the main menu")
ok(/USA-Wetten/.test(await H.locator('.topbar').innerText()), 'Games again: on the pool it showed');
await H.evaluate(() => window.dispatchEvent(new CustomEvent('golfos:go', { detail: { tour: 'ZZZZZZ' } })));
await H.waitForTimeout(2500);
const tb = H.locator('.topbar .icon-btn').first();
const lbl = (await tb.getAttribute('aria-label')) ?? '';
ok(/Games/.test(lbl), `the tournament, "Zurück" to Games (${lbl})`);
await tb.click();
await H.waitForTimeout(1500);
const after = (await H.locator('body').innerText()).replace(/\s+/g, ' ');
ok(/USA-Wetten/.test(await H.locator('.topbar').innerText().catch(() => '')), `back in Games: on the pool as it was (${after.slice(0, 120)})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
