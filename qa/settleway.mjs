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
        // Sascha against Chris only: made – 20 $ from Chris (set off against w2: ±0 between the two)
        { id: 'w3', player: 's', kind: 'birdies', target: 3, stake: 20, payout: 'opponent', opponent: 'c', attempts: 'any' },
        // a 5+5+10 of Chris against Sascha, set gross (not played yet)
        { id: 'd1', player: 'c', opponent: 's', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day: to, parts: { front: 5, back: 5, total: 10 }, challenge: { state: 'accepted', at } },
      ],
      progress: {
        w1: { best: 1, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
        w2: { best: 9, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
        w3: { best: 3, done: true, rounds: 1, at, manual: { done: true, by: 'Sascha' } },
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
// set off only between the same two (Sascha 11.11.2026: "±0 only when Chris gets 20 from Sascha and Sascha 20 from
// Chris") – nothing passed on past a third
let p = await pays();
ok(p.length === 2 && p.some((x) => /Sascha zahlt an Erik/.test(x) && /20/.test(x)) && p.some((x) => /Chris zahlt an Erik/.test(x) && /20/.test(x)), `set off: Sascha and Chris each pay Erik 20 $, nothing between them (${p.join(' | ')})`);
const row = settle.getByRole('button', { name: /Rechenweg/ });
ok(/4 Schulden → 2 Zahlungen/.test(await row.innerText()), `"Rechenweg": ${(await row.innerText()).replace(/\s+/g, ' ')}`);
// the ledger: from whom Erik's bet brought its money (Sascha 11.11.2026: "Erik's 80 – from whom")
const erikLine = (await settle.locator('.pool-standing > li').filter({ hasText: /^Erik/ }).first().innerText()).replace(/\s+/g, ' ');
ok(/von Sascha, Chris – je 20 \$/.test(erikLine), `the ledger: Erik's bet "von Sascha, Chris – je 20 $" (${erikLine.slice(0, 120)})`);
await row.click();
const way = H.getByRole('dialog', { name: 'Rechenweg' });
if (process.env.SHOTS) await way.screenshot({ path: `${process.env.SHOTS}/settleway.png` });
// grouped per person (Sascha 11.11.2026: "under Sascha: Sascha owes Erik 20 and Chris X")
const block = async (who) => (await way.locator('.settle-debts > li').filter({ has: H.locator('strong', { hasText: new RegExp(`^${who}$`) }) }).first().innerText()).replace(/\s+/g, ' ');
const sascha = await block('Sascha');
ok(/schuldet Erik 20 \$/.test(sascha) && /schuldet Chris 20 \$/.test(sascha) && /bekommt 20 \$ von Chris/.test(sascha) && /mit Chris verrechnet: unterm Strich ±0/.test(sascha) && /zahlt 20 \$/.test(sascha), `Sascha's block: owes Erik and Chris, gets from Chris, ±0 with Chris, pays 20 $ (${sascha})`);
ok(/Erik: .*Birdie/.test(sascha), 'each debt says its bet');
const chris = await block('Chris');
ok(/schuldet Erik 20 \$/.test(chris) && /zahlt 20 \$/.test(chris), `Chris's block: owes Erik 20 $ (${chris})`);
await way.getByRole('button', { name: 'Schließen' }).click();

// "Abrechnung: Einzeln" in the pool's settings
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await edit.getByRole('button', { name: /Abrechnung/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Einzeln' }).click();
await edit.getByRole('button', { name: 'Schließen' }).click(); // saved by itself (12.11.2026) – closing saves at once
await H.waitForTimeout(1500);
ok(shared.get(code).game.settle === 'single', 'the setting on the server: settle "single"');
p = await pays();
ok(p.length === 4 && p.some((x) => /Sascha zahlt an Chris/.test(x)) && p.some((x) => /Chris zahlt an Sascha/.test(x)) && p.some((x) => /Sascha zahlt an Erik/.test(x) && /20/.test(x)) && p.some((x) => /Chris zahlt an Erik/.test(x)), `one by one: four payments, Sascha and Chris both ways (${p.join(' | ')})`);
ok(/4 Zahlungen/.test(await settle.getByRole('button', { name: /Rechenweg/ }).innerText()), '"Rechenweg": 4 Zahlungen');

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

// which rounds a bet counts (Sascha 10.11.2026: "from today on – and other ways too; rounds chosen or made"): Erik's bet
// – "Welche Runden" → "Ausgewählte Runden", a day added – then "Von – bis"
await H.locator('.pool-wager').filter({ hasText: '1 Birdies' }).first().click();
await H.locator('.wager-sheet').getByRole('button', { name: /Welche Runden/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Ausgewählte Runden' }).click();
await H.locator('.wager-sheet').getByRole('button', { name: /^Runden/ }).click();
await H.getByRole('dialog', { name: 'Runden' }).getByRole('button', { name: '+ Diesen Tag hinzufügen' }).click();
await H.getByRole('dialog', { name: 'Runden' }).getByRole('button', { name: 'Schließen' }).click();
await H.locator('.wager-sheet').getByRole('button', { name: 'Speichern', exact: true }).click();
await H.waitForTimeout(1500);
let w1 = shared.get(code).game.wagers.find((w) => w.id === 'w1');
ok(w1?.picks?.length === 1 && !w1.picks[0].course, `a day added: the bet counts its rounds only (${JSON.stringify(w1?.picks)})`);
ok((await H.locator('.pool-wager').filter({ hasText: '1 Birdies' }).first().innerText()).includes('nur '), 'its line says "nur <Tag>"');
await H.locator('.pool-wager').filter({ hasText: '1 Birdies' }).first().click();
await H.locator('.wager-sheet').getByRole('button', { name: /Welche Runden/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Von – bis' }).click();
await H.locator('.wager-sheet').getByRole('button', { name: 'Speichern', exact: true }).click();
await H.waitForTimeout(1500);
w1 = shared.get(code).game.wagers.find((w) => w.id === 'w1');
ok(!!w1?.from && !!w1?.until && !w1.picks, `"Von – bis": from and up to the pool's days (${w1?.from}–${w1?.until})`);

// the challenger changes his own 5+5+10 (Sascha 11.11.2026: "the host changes everything – but Chris set it up and
// challenged me, so he changes it too"): Chris's phone – his duel opens, whose and against whom fixed, no deleting; his
// other bet only to see
{
  const g = shared.get(code);
  g.game.players = g.game.players.map((p) => (p.id === 'c' ? { ...p, joined: { name: 'Chris', at: new Date().toISOString(), uid: 'Chris' } } : p));
  g.members.push('Chris');
  const chris = await sim.phone('Chris');
  const C = chris.p;
  await C.evaluate(async () => {
    await (await import('/src/lib/wagerstore.ts')).syncPools();
    sessionStorage.setItem('golfos.module', 'games');
  });
  await C.goto('about:blank');
  await C.goto(url);
  await C.waitForTimeout(1500);
  await C.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await C.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await C.waitForTimeout(1500);
  ok((await C.locator('div.pool-wager').filter({ hasText: '9 Pars' }).count()) === 1, 'Chris: his other bet only to see');
  await C.locator('button.pool-wager').filter({ hasText: '5+5+10' }).first().click();
  const cs = C.locator('.wager-sheet');
  const txt = (await cs.innerText()).replace(/\s+/g, ' ');
  ok(!/Wessen Wette/.test(txt) && /Gegen Sascha/.test(txt) && (await cs.getByRole('button', { name: /^Gegen/ }).count()) === 0 && (await cs.getByRole('button', { name: 'Wette löschen' }).count()) === 0, `Chris's 5+5+10: against Sascha fixed, no "Wessen Wette", no deleting (${txt.slice(0, 120)})`);
  await cs.getByRole('button', { name: /Vorgabe/ }).click();
  await C.locator('.pick-option').filter({ hasText: '80 %' }).click();
  await cs.getByRole('button', { name: 'Speichern', exact: true }).click();
  await C.waitForTimeout(1500);
  const d = shared.get(code).game.wagers.find((w) => w.id === 'd1');
  ok(d?.allowance === 80 && d.player === 'c' && d.opponent === 's', `on the server: Chris changed his duel to 80 % (${d?.allowance})`);
  ok(chris.errs.length === 0, `Chris: no page errors ${chris.errs.slice(0, 2).join(' | ')}`);
}

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
