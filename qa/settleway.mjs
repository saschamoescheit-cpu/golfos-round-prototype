// QA (Sascha 10.11.2026, USA: "Chris has 0 – why do I owe Erik 40? The app may set off, but the way it calculated must
// be shown and traceable; set off or one by one as a setting of the pool"; "Chris's 5+5+10 was net with 75 %"; "tapping
// USA-Wetten in the Bilanz should jump there"). Erik made a bet (20 $ from each), Chris won 20 $ from Sascha:
//  · set off: Sascha pays Erik 40 $, Chris nothing – "Rechenweg" says "3 Schulden → 1 Zahlung", who owes whom for which
//    bet, and "Chris bekommt 20 $ von Sascha und schuldet 20 $ an Erik – unterm Strich ±0 $";
//  · "Abrechnung: Einzeln" in the pool's settings: Sascha pays Chris 20 $ and Erik 20 $, Chris pays Erik 20 $;
//  · the host sets the 5+5+10 net with 75 % afterwards: "5+5+10 netto 75 %";
//  · the Bilanz: Erik tapped, "USA-Wetten" tapped – the pool.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/settleway.mjs [url]
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
      players: [
        { id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } },
        { id: 'c', name: 'Chris' },
        { id: 'e', name: 'Erik' },
      ],
      wagers: [
        // Erik: made – 20 $ from each
        { id: 'w1', player: 'e', kind: 'birdies', target: 1, stake: 20, payout: 'success', attempts: 'any' },
        // Chris against Sascha only: made – 20 $ from Sascha
        { id: 'w2', player: 'c', kind: 'pars', target: 9, stake: 20, payout: 'opponent', opponent: 's', attempts: 'any' },
        // a 5+5+10 of Chris against Sascha, set gross (not played yet)
        { id: 'd1', player: 'c', opponent: 's', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day: to, parts: { front: 5, back: 5, total: 10 }, challenge: { state: 'accepted', at } },
      ],
      progress: {
        w1: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
        w2: { best: 9, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
      },
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-3), to: day(1) },
);

const openPool = async () => {
  await H.evaluate(async () => {
    await (await import('/src/lib/wagerstore.ts')).syncPools();
    sessionStorage.setItem('golfos.module', 'games');
  });
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(1500);
  await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await H.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await H.waitForTimeout(1200);
};
await openPool();
const pays = async () => (await H.locator('.pool-pays li').allInnerTexts().catch(() => [])).map((x) => x.replace(/\s+/g, ' ').trim());
const settle = H.locator('.pool-settle');
let p = await pays();
ok(p.length === 1 && /Sascha zahlt an Erik/.test(p[0]) && /40/.test(p[0]), `set off: Sascha pays Erik 40 $ – Chris nothing (${p.join(' | ')})`);
const row = settle.getByRole('button', { name: /Rechenweg/ });
ok(/3 Schulden → 1 Zahlung/.test(await row.innerText()), `"Rechenweg": ${(await row.innerText()).replace(/\s+/g, ' ')}`);
await row.click();
const way = H.getByRole('dialog', { name: 'Rechenweg' });
const txt = (await way.innerText()).replace(/\s+/g, ' ');
ok(/Chris schuldet Erik/.test(txt) && /Sascha schuldet Chris/.test(txt) && /Sascha schuldet Erik/.test(txt), 'who owes whom: Chris → Erik, Sascha → Chris, Sascha → Erik');
ok(/Erik: Birdies auf 18/.test(txt) || /Erik: .*Birdie/.test(txt), `each debt says its bet (${txt.slice(0, 160)})`);
ok(/Chris bekommt 20 \$ von Sascha und schuldet 20 \$ an Erik – unterm Strich ±0 \$/.test(txt), 'set off: "Chris bekommt 20 $ von Sascha und schuldet 20 $ an Erik – unterm Strich ±0 $"');
await way.getByRole('button', { name: 'Schließen' }).click();

// "Abrechnung: Einzeln" in the pool's settings
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await edit.getByRole('button', { name: /Abrechnung/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Einzeln' }).click();
await edit.getByRole('button', { name: 'Speichern', exact: true }).click();
await H.waitForTimeout(1500);
ok(shared.get(code).game.settle === 'single', 'the setting on the server: settle "single"');
p = await pays();
ok(p.length === 3 && p.some((x) => /Sascha zahlt an Chris/.test(x)) && p.some((x) => /Sascha zahlt an Erik/.test(x) && /20/.test(x)) && p.some((x) => /Chris zahlt an Erik/.test(x)), `one by one: three payments (${p.join(' | ')})`);
ok(/3 Zahlungen/.test(await settle.getByRole('button', { name: /Rechenweg/ }).innerText()), '"Rechenweg": 3 Zahlungen');

// the 5+5+10 net with 75 %, set afterwards by the host
await H.locator('.pool-wager').filter({ hasText: '5+5+10' }).first().click();
await H.locator('.wager-sheet').getByRole('button', { name: /Ergebnis/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Netto' }).click();
await H.locator('.wager-sheet').getByRole('button', { name: /Vorgabe/ }).click();
await H.locator('.pick-option').filter({ hasText: '75 %' }).click();
await H.locator('.wager-sheet').getByRole('button', { name: 'Speichern', exact: true }).click();
await H.waitForTimeout(1500);
const d1 = shared.get(code).game.wagers.find((w) => w.id === 'd1');
ok(d1?.net === true && d1?.allowance === 75, `the duel on the server: net, 75 % (${JSON.stringify({ net: d1?.net, allowance: d1?.allowance })})`);
ok((await H.locator('.pool-wager').filter({ hasText: '5+5+10 netto 75 %' }).count()) > 0, 'its name: "5+5+10 netto 75 %"');

// the Bilanz: Erik tapped – "USA-Wetten" tapped: the pool
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await H.waitForTimeout(800);
await H.locator('button').filter({ hasText: 'Erik' }).first().click();
const sheet = H.getByRole('dialog', { name: 'Erik' });
await sheet.getByRole('button', { name: 'USA-Wetten öffnen' }).click();
await H.waitForTimeout(800);
ok((await H.locator('.topbar h1').filter({ hasText: 'USA-Wetten' }).count()) === 1, 'the Bilanz: "USA-Wetten" tapped – the pool opens');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
