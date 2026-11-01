// The dress rehearsal for the USA trip (Sascha 01.11.2026, the night run): four phones – Sascha, Chris, Erik, Cedric –
// end to end, as on the first day over there:
// 1 · the tournament planned (2 flights with tee times), everyone joined by the link before the day
// 2 · on the day: "Turnier heute · Dein Flight · Teilnehmen" on every phone, each one in as himself
// 3 · played with markers – the marker enters his partner in full (putts …) – the live leaderboard on every phone
// 4 · the cards signed by player and marker, the leaderboard says so; the marker's counts with their details on the
//     server (what the bets "with marker" judge from)
// 5 · the bets (Games adds them here: the pool, 5+5+10 in $, judged by themselves, the pushes, the settlement)
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/usarehearsal.mjs [url]
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
const NAMES = ['Sascha', 'Chris', 'Erik', 'Cedric'];
const phones = {};
for (const n of NAMES) phones[n] = await sim.phone(n);
const P = (n) => phones[n].p;
const PARTNER = { Sascha: 'Chris', Chris: 'Sascha', Erik: 'Cedric', Cedric: 'Erik' };

// ---------- 1 · planned (in Games), joined ahead ----------
const code = await sim.plan(P('Sascha'), {
  name: 'USA Tag 1',
  option: 'A · 9',
  format: { mode: 'single', scoring: 'net', allowance: 100 },
  flights: [
    { teeTime: '09:20', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Chris', playingHandicap: 6 }] },
    { teeTime: '09:30', players: [{ name: 'Erik', playingHandicap: 8 }, { name: 'Cedric', playingHandicap: 5 }] },
  ],
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the tournament planned: ${code}`);
// the link sent ahead: the others are in (a planned tournament asks nobody)
for (const n of ['Chris', 'Erik', 'Cedric']) if (!sim.shared.get(code).members.includes(n)) sim.shared.get(code).members.push(n);
// ===== BETS (Games): the pool "USA 2026" with 5+5+10 in $ – set up here, before the day =====

// ---------- 2 · the day: the card on every phone ----------
for (const n of NAMES) {
  const p = P(n);
  await p.reload();
  const c = p.getByRole('region', { name: 'Turnier USA Tag 1' });
  await c.waitFor({ timeout: 15000 }).catch(() => {});
  const t = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(new RegExp(`Dein Flight · ${['Sascha', 'Chris'].includes(n) ? '09:20' : '09:30'}`).test(t), `${n}: "${t.slice(0, 80)}"`);
  await c.getByRole('button', { name: 'Teilnehmen' }).click();
  await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
}
await P('Sascha').waitForTimeout(7000);
const flightsNow = Object.values(sim.event().flights);
ok(flightsNow.every((f) => Object.values(f.phones ?? {}).length === 2 && Object.values(f.phones).every((x) => x.uid === x.name)), `every phone in its flight, with its account (${flightsNow.map((f) => Object.values(f.phones ?? {}).map((x) => `${x.name}:${x.uid ?? '–'}`).join('+')).join(' / ')})`);

// ---------- 3 · played with markers ----------
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const holes = (await sim.round(P('Sascha'))).holes.length;
// own score: par + 0/1 by player and hole; the marker's count the same – on hole 1 also his partner's putts
const extra = { Sascha: [0, 1, 0, 0, 1, 0, 0, 0, 1], Chris: [1, 0, 0, 1, 0, 0, 1, 0, 0], Erik: [0, 0, 1, 0, 0, 1, 0, 1, 0], Cedric: [1, 1, 0, 0, 0, 0, 0, 0, 1] };
const enterHole = async (n, i) => {
  const p = P(n);
  await p.locator('.map-score').click();
  for (const who of [n, PARTNER[n]]) for (let k = 0; k <= extra[who][i]; k++) await block(p, who).getByRole('button', { name: /Schläge plus eins/ }).click();
  if (i === 0) await block(p, PARTNER[n]).getByRole('button', { name: /Putts plus eins/ }).click();
  if (i < holes - 1) await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  else await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.waitForTimeout(250);
};
for (let i = 0; i < 3; i++) for (const n of NAMES) await enterHole(n, i);
await P('Sascha').waitForTimeout(12000);
const board = async (n) => {
  const p = P(n);
  if (!(await p.locator('.event-board').isVisible().catch(() => false))) {
    await p.locator('.hole-bar-handle').click();
    await p.locator('.hole-drawer').getByRole('button', { name: /Leaderboard/ }).click();
  }
  const bd = p.locator('.event-board');
  await bd.waitFor({ timeout: 8000 });
  const rows = (await bd.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  return { bd, rows };
};
const closeBoard = async (n) => {
  const p = P(n);
  await p.locator('.sheet-backdrop').getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});
};
for (const n of NAMES) {
  const { rows } = await board(n);
  ok(rows.length === 4 && rows.every((r) => /nach 3/.test(r)), `${n}'s live leaderboard after 3 holes: ${rows.join(' | ')}`);
  await closeBoard(n);
}
for (let i = 3; i < holes; i++) for (const n of NAMES) await enterHole(n, i);
await P('Sascha').waitForTimeout(12000);

// ---------- 4 · signed by player and marker ----------
for (const n of NAMES) {
  const p = P(n);
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
  const card = p.locator('.sign-card');
  await card.waitFor({ timeout: 10000 });
  for (const btn of await card.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
}
await P('Sascha').waitForTimeout(12000);
const ev = sim.event();
const all = Object.values(ev.flights).flatMap((f) => f.players.map((pl) => ({ f, pl })));
ok(all.length === 4 && all.every(({ f, pl }) => f.signed?.[pl.id]?.player && f.signed?.[pl.id]?.marker), `server: all four cards signed by player and marker`);
ok(all.every(({ f, pl }) => (f.marks?.[pl.id] ?? []).filter((c) => c?.s != null).length === holes && f.marks[pl.id][0]?.d?.pu != null), "server: every marker's count – all holes, hole 1 with the partner's putts (what the bets with marker judge from)");
const final = (await board('Sascha')).rows;
ok(final.length === 4 && final.every((r) => /F|nach 9/.test(r)), `the leaderboard as it ended: ${final.join(' | ')}`);
ok(/unterschrieben/.test(await P('Sascha').locator('.event-board').innerText()), 'the leaderboard: "unterschrieben"');

// ===== BETS (Games): judged by themselves from the signed rounds, the pushes, the settlement =====

const errs = Object.entries(phones).flatMap(([n, x]) => x.errs.map((e) => `${n}: ${e}`));
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
