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
const hcps = await H.locator('.pool-round-player input').evaluateAll((xs) => xs.map((x) => x.value));
ok((await H.locator('.pool-round-player .chip').allInnerTexts()).join('|') === 'Sascha · du|Chris|Erik' && hcps[0] === '10' && hcps[1] === '6,2', `its players – you first, the handicaps from the profile and the friends (${hcps.join(', ')})`);
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
ok(/2 geschafft · 1 vorläufig/.test(bar), `the bar: "${bar}"`);
// finished: into the round analysis
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
await H.getByRole('button', { name: 'Speichern & beenden' }).click();
await H.waitForTimeout(2000);
const kept = await H.evaluate(() => ({ rounds: JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').filter((r) => r.finishedAt).length, inPlay: JSON.parse(localStorage.getItem('golfos.poolrounds.v1') ?? '[]').length }));
ok(kept.rounds === 1 && kept.inPlay === 0, `finished: the round in the round analysis, none in play (${JSON.stringify(kept)})`);
ok((await H.getByRole('button', { name: 'Runde starten' }).count()) === 1, 'the pool offers a new round');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
