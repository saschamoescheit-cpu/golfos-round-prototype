// QA (Sascha 14.11.2026, USA): bets running over a tournament series.
// 1. "Hab der Turnierserie nun für morgen 15.11. noch Hawks Landing hinzugefügt, aber bei den Wetten ist die Runde nicht
//    sichtbar": a tournament planned tomorrow within the pool's days – in the standing's rounds, "geplant – noch keine
//    Scores", before its first score.
// 2. "sollte abgefragt werden, ob die laufenden Wetten auch für die neue hinzugefügte Runde zählen sollen": the round
//    added to the series – the pool's host asked, each kind of bet a tick (Pars ticked – it counts; "Ergebnis in 6 Runden"
//    on chosen rounds not); "Übernehmen" – on the server Pars count it, the 6 rounds stay theirs; the period stretched.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesbets.mjs [url]   (SHOTS=dir)
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
const host = await sim.phone('Sascha');
const H = host.p;
const days = await H.evaluate(() => {
  const d = (n) => {
    const x = new Date(Date.now() + n * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { yesterday: d(-1), today: d(0), tomorrow: d(1), later: d(3) };
});
// the pool: today to the day after tomorrow; Pars (any round) and a score over 2 chosen rounds
const code = await H.evaluate(async (days) => {
  const ws = await import('/src/lib/wagerstore.ts');
  const base = { stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' };
  const pool = {
    kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: days.yesterday, to: days.tomorrow, createdAt: new Date().toISOString(), currency: 'USD',
    players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at: new Date().toISOString(), uid: 'Sascha' } }, { id: 'pc', name: 'Cedric' }],
    wagers: [
      { ...base, id: 'w-p', player: 'pc', kind: 'pars', target: 10 },
      { ...base, id: 'w-s', player: 'pc', kind: 'scoreSum', target: 20, rounds: 2, picks: [{ day: days.yesterday, course: 'Celebration Golf Club' }, { day: days.today, course: 'Reunion' }] },
    ],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
}, days);
ok(!!code, `the pool: ${code}`);

// a series with today's tournament; tomorrow's planned
const t1 = await sim.plan(H, { name: 'Serie R1', date: days.today, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 10 }] }] });
const t2 = await sim.plan(H, { name: 'Hawks Landing', date: days.tomorrow, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 10 }] }] });
const series = sim.series('Sascha', 'USA-Serie', [t1]);
await H.evaluate(async () => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
});
await H.waitForTimeout(1000);

// 1. the standing: tomorrow's tournament among the rounds, planned (a score on today's round so the standing shows)
sim.shared.get(code).game.progress = { 'w-p': { perRound: [{ day: days.today, course: 'Hetzenhof', value: 6, counted: true }], at: new Date().toISOString(), best: 6, done: false, rounds: 1 } };
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2000);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item:not(.side-bet-row)').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
await H.waitForTimeout(2000);
await H.locator('.pool-standings .step-pick-value, .pool-standings [aria-label="Runden"]').first().click().catch(() => {});
await H.waitForTimeout(500);
const opts = (await H.locator('.sheet .pick-option, .sheet [role="option"], .sheet button').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(opts.some((x) => /Hetzenhof/.test(x) && /geplant – noch keine Scores/.test(x)), `tomorrow's tournament among the rounds: "geplant – noch keine Scores" (${opts.filter((x) => /\d\d\.\d\d\./.test(x)).join(' | ')})`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/seriesbets-rounds.png' });
// picked: under its name only "N von M geplant" – no "gewertet" beside it (Sascha 15.11.2026: "sonst wird es zu
// unübersichtlich")
{
  const planned = H.locator('.sheet .pick-option').filter({ hasText: 'geplant – noch keine Scores' }).first();
  if (await planned.count()) {
    await planned.click();
    await H.waitForTimeout(500);
    const sub = (await H.locator('.pool-standings .step-pick-now .muted').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    ok(/^\d+ von \d+ geplant$/.test(sub), `the planned round picked: "${sub}" under its name`);
  } else ok(false, 'the planned round picked: not in the sheet');
}
await H.keyboard.press('Escape');
await H.locator('.sheet').getByRole('button', { name: 'Schließen' }).first().click({ timeout: 2000 }).catch(() => {});

// 2. tomorrow's tournament added to the series: the question
await H.evaluate(async ({ series, t2 }) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.addToSeries(series, t2);
}, { series, t2 });
const ask = H.getByRole('dialog', { name: 'Neue Runde in der Serie' });
await ask.waitFor({ timeout: 8000 }).catch(() => {});
ok((await ask.count()) === 1 && /für welche laufenden Wetten zählt sie/.test(await ask.innerText().catch(() => '')), 'the round added to the series: "Neue Runde in der Serie – für welche laufenden Wetten zählt sie?"');
const tick = (re) => ask.getByRole('checkbox', { name: re });
ok((await tick(/^Pars/).getAttribute('aria-checked')) === 'true', 'Pars: ticked – they count it already');
ok((await tick(/Ergebnis über mehrere Runden/).getAttribute('aria-checked')) === 'false', 'the score over chosen rounds: not ticked');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/seriesbets-ask.png' });
// both count it
await tick(/Ergebnis über mehrere Runden/).click();
await ask.getByRole('button', { name: 'Übernehmen' }).click();
await H.waitForTimeout(2000);
ok((await ask.count()) === 0, 'Übernehmen: the sheet closes');
{
  const g = sim.shared.get(code).game;
  const sum = g.wagers.find((w) => w.id === 'w-s');
  ok(sum.picks.some((p) => p.day === days.tomorrow), `on the server: the score over 2 rounds takes tomorrow's round (${sum.picks.map((p) => p.day).join(', ')})`);
  ok(!(g.wagers.find((w) => w.id === 'w-p').voided ?? []).length, 'Pars: not taken out');
}
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
