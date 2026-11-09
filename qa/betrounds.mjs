// QA (Sascha 08.11.2026, USA): "the bets hold for one round each – we need an overview over all rounds for a total,
// and then per round"; and Erik showed "2/1" while the others had nothing – their rounds of yesterday were not on the
// phones (the app failed). Yesterday's tournament, its scores entered afterwards by the host ("Scores eintragen" –
// they count fully), a pool of bets over the days: the host's phone judges Chris's bet from the tournament's flight,
// made (not "vorläufig"); the standing has "Gesamt" and a chip for yesterday's round with each one's figure in it.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/betrounds.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const yesterday = day(-1);
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const code = await sim.plan(H, {
  name: 'Celebration',
  date: yesterday,
  flights: [{ teeTime: '11:40', players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Christopher', playingHandicap: 8 }, { name: 'Erik', playingHandicap: 4 }] }],
});

// the host's phone keeps the tournament; he enters yesterday's scores afterwards: Christopher three birdies in a row
const filled = await H.evaluate(
  async ({ code, row }) => {
    const ts = await import('/src/lib/tourstore.ts');
    const sr = await import('/src/lib/sharedround.ts');
    ts.keepTour(code, row.game, row.owner);
    const ev = await sr.refreshEvent(code);
    const f = Object.values(ev.flights)[0];
    const pid = (n) => f.players.find((p) => p.name === n).id;
    const pars = ev.holes.map((h) => h.par);
    const typed = { [pid('Christopher')]: pars.map((p, i) => (i < 3 ? p - 1 : p)), [pid('Sascha')]: pars.map((p) => p) };
    const done = await sr.writeScores(code, f.id, typed);
    return { ok: !!done, entered: Object.keys(done?.flights[f.id]?.entered ?? {}).length, holes: pars.length };
  },
  { code, row: sim.shared.get(code) },
);
ok(filled.ok && filled.entered === 2, `yesterday's scores entered by the host (${filled.entered} players, ${filled.holes} holes) – marked as entered`);

// a pool over the days: Chris 2 birdies in a row "with marker", Sascha 3 pars in a row
const pool = await H.evaluate(
  async ({ from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const now = new Date().toISOString();
    const bet = (id, player, kind, target) => ({ id, player, kind, target, stake: 20, payout: 'success', attempts: 'any', counted: true });
    const made = {
      kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from, to, createdAt: now, currency: 'USD', counted: true,
      players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }, { id: 'e', name: 'Erik' }],
      // + Chris's score over 7 rounds added up (Sascha 10.11.2026: "over 7 rounds – never green in one round")
      wagers: [bet('w1', 'c', 'birdieRun', 2), bet('w2', 's', 'parRun', 3), bet('w3', 'e', 'birdieRun', 2), { ...bet('w4', 'c', 'scoreSum', 126), rounds: 7 }],
      progress: {},
    };
    const e = await ws.createPool(made, 's');
    return e?.code ?? null;
  },
  { from: day(-3), to: day(9) },
);
ok(!!pool, `the pool set up (${pool})`);

// the pool opened: judged on opening – from the tournament's flight
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.getByText('USA-Wetten').first().click();
const stand = H.locator('.pool-standings');
await stand.waitFor({ timeout: 15000 });
const cellText = async (row, player) => {
  const names = await stand.locator('thead th').allInnerTexts();
  const col = names.indexOf(player);
  return col < 0 ? '?' : ((await stand.locator('tbody tr').filter({ hasText: row }).first().locator('td').nth(col - 1).innerText().catch(() => '?')) ?? '?').replace(/\s+/g, ' ').trim();
};
let chris = '';
// "Gesamt" counts the rounds made (Sascha 09.11.2026: "every bet holds for each round on its own – the total shows how
// often it was made over all rounds"): the target on top, "1/1" below (10.11.), green; no "vorläufig"
for (let k = 0; k < 20 && !/^2 1\/1$/.test(chris); k++) {
  await H.waitForTimeout(1000);
  chris = await cellText('Birdies in Folge', 'Chris');
}
const chrisDone = await stand.locator('tbody tr').filter({ hasText: 'Birdies in Folge' }).first().locator('.bet-cell.done').count();
ok(/^2 1\/1$/.test(chris) && chrisDone >= 1, `Gesamt: Chris "Birdies in Folge" from the tournament's flight – made in 1 of 1, green (${chris})`);
const sascha = await cellText('Pars in Folge', 'Sascha');
ok(/^3 1\/1$/.test(sascha) && !/vorläufig/.test(sascha), `Gesamt: Sascha's pars in a row counted (${sascha})`);
const erik = await cellText('Birdies in Folge', 'Erik');
ok(/^2 0(\/0)?$/.test(erik), `Erik: nothing entered for him – a dash (${erik})`);

// the rounds: "Gesamt" and yesterday's round
const chips = await stand.getByRole('group', { name: 'Runden' }).getByRole('button').allInnerTexts();
const label = `${yesterday.slice(8, 10)}.${yesterday.slice(5, 7)}.`;
ok(chips[0] === 'Gesamt' && chips.length === 2 && chips[1].startsWith(label), `the chips: ${chips.join(' | ')}`);
await stand.getByRole('group', { name: 'Runden' }).getByRole('button').nth(1).click();
await H.waitForTimeout(300);
const inRound = await cellText('Birdies in Folge', 'Chris');
ok(/^2 3$/.test(inRound) && (await stand.locator('.bet-cell.done').count()) >= 1, `yesterday's round: Chris 2/3, made (${inRound})`);
{
  const sum = stand.locator('tbody tr').filter({ hasText: 'in 7 Runden' }).first();
  const txt = (await sum.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok((await sum.count()) === 1 && (await sum.locator('.bet-cell.done').count()) === 0 && /\+18/.test(txt), `the score over 7 rounds in one round: its share +126 / 7 = +18 on top, not green while not played (${txt})`);
}
if (process.env.SHOTS) await stand.screenshot({ path: `${process.env.SHOTS}/betrounds.png` });
await stand.getByRole('button', { name: 'Gesamt' }).click();
ok((await stand.getByRole('button', { name: 'Gesamt' }).getAttribute('aria-pressed')) === 'true', 'back to "Gesamt"');

// a round of the series today (Sascha 09.11.2026: "'Runde starten' only makes sense for a single round"): the pool's
// button leads to the tournament in Rounds – "Turnier heute", "Teilnehmen" – instead of a round of its own
ok((await H.getByRole('button', { name: 'Runde starten' }).count()) === 1 && (await H.getByRole('button', { name: 'Zum Turnier' }).count()) === 0, 'no tournament today: "Runde starten"');
const todayCode = await sim.plan(H, {
  name: 'Kissimmee Bay',
  date: day(0),
  flights: [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Christopher', playingHandicap: 8 }] }],
});
await H.evaluate(async ({ code, row }) => (await import('/src/lib/tourstore.ts')).keepTour(code, row.game, row.owner), { code: todayCode, row: sim.shared.get(todayCode) });
await H.locator('.topbar button, .back-btn').first().click().catch(() => {});
await H.waitForTimeout(500);
await H.getByText('USA-Wetten').first().click();
await H.locator('.pool-standings').waitFor({ timeout: 15000 });
ok((await H.getByRole('button', { name: 'Zum Turnier' }).count()) === 1 && (await H.getByRole('button', { name: 'Runde starten' }).count()) === 0 && /Heute: Kissimmee Bay – zählt für die Wetten/.test(await H.locator('.pool-tour-hint').innerText().catch(() => '')), 'a tournament today: "Zum Turnier" with "Heute: Kissimmee Bay – zählt für die Wetten." – no "Runde starten"');
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/pool-tour.png`, fullPage: true });
await H.getByRole('button', { name: 'Zum Turnier' }).click();
const todayCard = H.locator('.play-card').filter({ hasText: 'Turnier heute' }).filter({ hasText: 'Kissimmee Bay' });
await todayCard.waitFor({ timeout: 10000 }).catch(() => {});
ok((await todayCard.getByRole('button', { name: 'Teilnehmen' }).count()) === 1, 'Rounds: "Turnier heute · Kissimmee Bay" – "Teilnehmen"');

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
