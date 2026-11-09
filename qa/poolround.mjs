// QA (Sascha 02.11.2026: "start the round right from the bet – else again through Rounds and the players set up";
// "we set up a bet for today, played a round on one phone – nothing was judged"): one phone. Sascha's pool with
// Chris and Erik – his 2 birdies in a row "with marker", Chris's 3 pars in a row. "Runde starten" in the pool: the
// course, the pool's players with their handicap, the map; nine holes entered for all three – the bets judged live
// (Sascha's provisional: no marker signed; Chris's made, judged on Sascha's phone as the host's); finished: the round in
// the round analysis, the pool offers a new one. Supabase is simulated (qa/sharesim.mjs). Usage: node qa/poolround.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const code = await H.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const day = dayOf(new Date());
  const base = { stake: 10, payout: 'success', attempts: 'any', by: 'Sascha' };
  const pool = {
    kind: 'wager-pool', id: 'today', name: 'Heute', from: day, to: day, createdAt: new Date().toISOString(), currency: 'EUR',
    players: [{ id: 'ps', name: 'Sascha' }, { id: 'pc', name: 'Chris' }, { id: 'pe', name: 'Erik' }],
    wagers: [
      { ...base, id: 'w-s', player: 'ps', kind: 'birdieRun', target: 2, counted: true },
      { ...base, id: 'w-c', player: 'pc', kind: 'parRun', target: 3 },
      { ...base, id: 'w-e', player: 'pe', kind: 'custom', metric: 'birdie', compare: 'min', where: 'par3', target: 1 },
    ],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the pool for today: ${code}`);
await H.evaluate(() => {
  localStorage.setItem('golfos.friends.v1', JSON.stringify([{ id: 'f1', name: 'Chris', hcp: '6,2' }]));
  sessionStorage.setItem('golfos.module', 'games');
});
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item').filter({ hasText: 'Heute' }).first().click();
await H.getByRole('button', { name: 'Runde starten' }).click();
ok(await H.getByRole('heading', { name: 'Runde starten' }).isVisible(), 'the pool: "Runde starten" – right from the bets');
// a row per player as in Rounds (Sascha 02.11.2026): name (the pool's, not typed), tee, HCP, playing handicap
const hcps = await H.locator('.pool-round-player input[id^="hcp-"]').evaluateAll((xs) => xs.map((x) => x.value));
const pnames = await H.locator('.pool-round-player input[id^="name-"]').evaluateAll((xs) => xs.map((x) => x.value + (x.readOnly ? '' : ' (typed)')));
ok(pnames.join('|') === 'Sascha|Chris|Erik' && hcps[0] === '10' && hcps[1] === '6,2', `its players as in Rounds – you first, the names fixed, the handicaps from the profile and the friends (${pnames.join(', ')}; ${hcps.join(', ')})`);
await H.getByRole('button', { name: 'Erik entfernen' }).click();
ok((await H.locator('.pool-round-player').count()) === 2, 'Erik taken out of this round');
await H.getByRole('button', { name: '+ Erik' }).click();
ok((await H.locator('.pool-round-player').count()) === 3, 'and back with "+ Erik"');
await H.getByRole('button', { name: /Platz wählen/ }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('.choice-loop').filter({ hasText: /^A\s*9 Löcher/ }).first().click();
await H.getByRole('button', { name: 'Runde starten' }).last().click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
ok((await H.locator('.game-bar').innerText()).includes('Wetten · Heute'), 'on the map: the bets in the bar over the hole bar');
const pars = await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.poolrounds.v1'))[0].round.holes.map((h) => h.par));
// Sascha birdies on 1 and 2 (2 in a row), Chris par everywhere, Erik a birdie on the first par 3
const p3 = pars.indexOf(3);
const block = (name) => H.locator('.score-player').filter({ has: H.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
for (let i = 0; i < pars.length; i++) {
  await H.locator('.map-score').click();
  // bets on the score only: the strokes incl. penalty strokes – no putts asked (Sascha 02.11.2026)
  if (i === 0) ok((await block('Sascha').getByRole('button', { name: /Putts plus eins/ }).count()) === 0 && (await block('Sascha').getByRole('button', { name: /Schläge plus eins/ }).count()) === 1, 'score-only bets: strokes (incl. penalties), no putts asked');
  for (const n of ['Sascha', 'Chris', 'Erik']) {
    await block(n).getByRole('button', { name: /Schläge plus eins/ }).click(); // par
    if ((n === 'Sascha' && i < 2) || (n === 'Erik' && i === p3)) await block(n).getByRole('button', { name: /Schläge minus eins/ }).click();
  }
  if (i < pars.length - 1) await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  else await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await H.waitForTimeout(200);
}
await H.waitForTimeout(3000);
const pg = sim.shared.get(code).game.progress;
ok(pg['w-s']?.done === false && pg['w-s']?.pending === 2, `Sascha's 2 birdies in a row "with marker": provisional – no marker signed (${JSON.stringify(pg['w-s'] ?? null)})`);
ok(pg['w-c']?.done === true && pg['w-c']?.best === 9, `Chris's 3 pars in a row: made – judged on Sascha's phone, the host's (${JSON.stringify(pg['w-c'] ?? null)})`);
ok(pg['w-e']?.done === true, `Erik's own bet "at least 1 birdie on the par 3s": made (${JSON.stringify(pg['w-e'] ?? null)})`);
const bar = (await H.locator('.game-bar').innerText()).replace(/\s+/g, ' ');
// each round on its own, no "provisional" any more (Sascha 09.11.2026): made in an unsigned round is made
ok(/3 geschafft/.test(bar) && !/vorläufig/.test(bar), `the bar: "${bar}"`);
// finished: into the round analysis
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
await H.getByRole('button', { name: 'Speichern & beenden' }).click();
await H.waitForTimeout(2000);
const kept = await H.evaluate(() => ({ rounds: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').filter((r) => r.finishedAt).length, inPlay: JSON.parse(localStorage.getItem('golfos.poolrounds.v1') ?? '[]').length }));
ok(kept.rounds === 1 && kept.inPlay === 0, `finished: the round in the round analysis, none in play (${JSON.stringify(kept)})`);
ok((await H.getByRole('button', { name: 'Runde starten' }).count()) === 1, 'the pool offers a new round');
// "Einer für alle" (Sascha 04.11.2026): the phone that started the round kept the score of all – finished, the round
// counts as marked: Sascha's bet "with marker" made, no longer provisional
await H.evaluate(async (c) => {
  const ws = await import('/src/lib/wagerstore.ts');
  await ws.changePool(c, (p) => ({ ...p, counted: true, oneScorer: true }));
  await ws.reportWagers();
}, code);
await H.waitForTimeout(1500);
{
  const pg2 = sim.shared.get(code).game.progress;
  ok(pg2['w-s']?.done === true, `one for all: the round finished on this phone counts as marked – Sascha's bet made (${JSON.stringify(pg2['w-s'] ?? null)})`);
}
// a bet on the greens: the putts a must (Sascha 02.11.2026: "the next hole only once all putts are entered")
const gir = await H.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const day = dayOf(new Date());
  const pool = {
    kind: 'wager-pool', id: 'gir', name: 'Grüns', from: day, to: day, createdAt: new Date().toISOString(), currency: 'EUR',
    players: [{ id: 'ps', name: 'Sascha' }, { id: 'pc', name: 'Chris' }],
    wagers: [{ stake: 10, payout: 'success', attempts: 'any', by: 'Sascha', id: 'g', player: 'pc', kind: 'greens', target: 5, holes: 9 }],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
});
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item').filter({ hasText: 'Grüns' }).first().click();
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.getByRole('button', { name: /Platz wählen|Golfclub/ }).first().click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('.choice-loop').filter({ hasText: /^As*9 Löcher/ }).first().click();
ok((await H.locator('.settings-row').filter({ hasText: 'Erfassung' }).first().isDisabled()) && (await H.getByText(/jeder Spieler mit Details, die Putts sind Pflicht/).isVisible()), 'a greens bet: the score entry "Mit Details", fixed by the bets – said why');
await H.getByRole('button', { name: 'Runde starten' }).last().click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
await H.locator('.map-score').click();
for (const n of ['Sascha', 'Chris']) await block(n).getByRole('button', { name: /Schläge plus eins/ }).click();
await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
await H.waitForTimeout(400);
ok((await H.getByText(/Putts fehlen bei/).count()) >= 1 && (await H.getByRole('dialog', { name: 'Score an diesem Loch' }).count()) === 1, `the putts missing: not on to the next hole – "${(await H.getByText(/Putts fehlen bei/).first().innerText().catch(() => '–')).slice(0, 60)}"`);
for (const n of ['Sascha', 'Chris']) await block(n).getByRole('button', { name: /Putts plus eins/ }).click();
const before = await H.locator('.map-hole-no').first().innerText();
await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
await H.waitForTimeout(500);
const after = await H.locator('.map-hole-no').first().innerText();
ok(after !== before, `all putts in: on to the next hole (${before.slice(0, 12)} → ${after.slice(0, 12)})`);
ok(!!gir, `the greens pool: ${gir}`);

// one level back through the pool's round (Sascha 06.11.2026: "back – it jumps right to the front instead of one level
// back"): the pool opened from "Bilanz", its round paused – back on the pool, "Zurück" to the balance, not to "Wetten"
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await H.waitForTimeout(800);
await H.locator('.balance-pool').filter({ hasText: 'Grüns' }).locator('.balance-pool-head').click();
await H.waitForTimeout(1200);
await H.getByRole('button', { name: 'Runde fortsetzen' }).click(); // its round still running: straight onto the map
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
await H.locator('.hole-bar-handle').click();
await H.locator('.drawer-action').filter({ hasText: 'Pausieren' }).click();
await H.waitForTimeout(1200);
ok((await H.getByRole('button', { name: 'Runde fortsetzen' }).count()) === 1, 'the round paused: back on the pool');
await H.locator('.topbar').getByRole('button').first().click();
await H.waitForTimeout(1000);
ok((await H.locator('.tabbar button[aria-current="page"], .tabbar button.on, .tabbar button[aria-pressed="true"]').filter({ hasText: 'Bilanz' }).count()) === 1 || (await H.locator('.balance-title, .balance').count()) > 0, `"Zurück" on the pool: the balance again, where it was opened (${(await H.locator('main h1, main h2').first().innerText().catch(() => '–')).trim()})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
