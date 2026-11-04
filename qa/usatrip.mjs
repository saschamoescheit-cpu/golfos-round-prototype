// The USA trip end to end (Sascha 04.11.2026: "in the first two of four weeks 6 rounds; the USA bets run on every one of
// them – every round has to be judged; the 6 rounds one tournament, flights and tee times planned ahead for each round,
// everyone invited to the whole; the bets' judging and settlement must be reliable"). Four phones – Sascha, Chris,
// Erik, Cedric – on a clock that walks through the trip's days:
// 1 · before the trip: 6 tournaments planned (one a day, 2 flights with tee times – in rounds 4 and 5 the second flight
//     off tee 10), made one series; everyone in by the link. The pool "USA 2026" in $ on all 6 rounds, its bets with
//     marker; joined by its link
// 2 · each day: "Turnier heute · Dein Flight · Teilnehmen" on every phone, 18 holes with the marker entering his
//     partner, the cards signed, the round finished; every phone opens the pool – it judges its owner's bets from the
//     signed round. After each day the server's standing of every bet is checked against the numbers worked out here
// 3 · after the 6th day: the settlement – who pays whom, to the dollar
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/usatrip.mjs [url]   (~25 min)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};

// ---------- the trip's days: from tomorrow, 6 rounds over two weeks ----------
const OFFSETS = [1, 2, 4, 6, 9, 11];
const at = (offset, hhmm) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let shift = 0; // the fake clock minus the real one – the server keeps the phones' time
const sim = sharedServer(b, url, { offset: () => shift });
const NAMES = ['Sascha', 'Chris', 'Erik', 'Cedric'];
const PARTNER = { Sascha: 'Chris', Chris: 'Sascha', Erik: 'Cedric', Cedric: 'Erik' };
const phones = {};
const setDay = async (when) => {
  shift = when.getTime() - Date.now();
  for (const n of NAMES) await phones[n].p.clock.setSystemTime(when);
};
// the day before the trip, 07:00
const start = at(0, '07:00');
shift = start.getTime() - Date.now();
for (const n of NAMES) {
  phones[n] = await sim.phone(n);
  const p = phones[n].p;
  await p.clock.install({ time: start });
  // signed in for the whole trip (the simulated server checks only the token)
  await p.evaluate(() => {
    const a = JSON.parse(localStorage.getItem('golfos.auth.v1'));
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ ...a, expires_at: Math.floor(Date.now() / 1000) + 60 * 864e2 }));
  });
  await p.reload();
  await p.waitForTimeout(1200);
}
const P = (n) => phones[n].p;
const away = async (n, go) => {
  const before = phones[n].errs.length;
  await go();
  const after = phones[n].errs.splice(before);
  phones[n].errs.push(...after.filter((e) => !/supabase\.co\/\S* due to access control checks/.test(e)));
};

// ---------- 1 · planned before the trip ----------
const codes = [];
for (let k = 0; k < 6; k++) {
  const tee10 = k === 3 || k === 4; // rounds 4 and 5: the second flight off tee 10, both at 09:00
  const code = await sim.plan(P('Sascha'), {
    name: `USA Runde ${k + 1}`,
    date: ymd(at(OFFSETS[k], '07:00')),
    option: 'A \\+ B · 18',
    format: { mode: 'single', scoring: 'net', allowance: 100 },
    flights: [
      { teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Chris', playingHandicap: 6 }] },
      // tee 10: PlanFlight.startHole (Games, 04.11.2026)
      { teeTime: tee10 ? '09:00' : '09:10', ...(tee10 ? { startHole: 9 } : {}), players: [{ name: 'Erik', playingHandicap: 8 }, { name: 'Cedric', playingHandicap: 5 }] },
    ],
  });
  codes.push(code);
}
ok(codes.every((c) => /^[A-Z0-9]{6}$/.test(c ?? '')), `6 tournaments planned, one a day: ${codes.join(' ')}`);
ok([3, 4].every((k) => Object.values(sim.shared.get(codes[k]).game.flights).some((f) => f.startHole === 9)), 'rounds 4 and 5: the second flight off tee 10 in the plan');
// one tournament over the 6 rounds (Games: a series with `multi` – no cut)
const seriesCode = sim.series('Sascha', 'USA 2026', codes, { multi: { cut: null } });
// the series' link sent ahead: everyone is in every round (a planned tournament asks nobody – qa/tourseries.mjs)
for (const c of [seriesCode, ...codes]) for (const n of ['Chris', 'Erik', 'Cedric']) if (!sim.shared.get(c).members.includes(n)) sim.shared.get(c).members.push(n);

// the pool "USA 2026" in $ on the 6 rounds – through the app's own code, as Games does (qa/wagers.mjs drives its screens)
const ID = { Sascha: 'pl-s', Chris: 'pl-c', Erik: 'pl-e', Cedric: 'pl-k' };
const course = sim.shared.get(codes[0]).game.course;
const rounds = codes.map((c, k) => ({ id: `r${k + 1}`, day: ymd(at(OFFSETS[k], '07:00')), course: course.name, courseId: course.id, tour: c }));
const bet = { stake: 20, payout: 'success', attempts: 'any', counted: true, by: 'Sascha' };
const WAGERS = [
  { ...bet, id: 'w-s-par8', player: ID.Sascha, kind: 'parRun', target: 8 }, // made in round 5
  { ...bet, id: 'w-c-bird2', player: ID.Chris, kind: 'birdies', target: 2 }, // one in round 2, two in round 4: made
  { ...bet, id: 'w-c-par12', player: ID.Chris, kind: 'parRun', target: 12 }, // 5 at best: missed
  { ...bet, id: 'w-e-score10', player: ID.Erik, kind: 'score', target: 10 }, // +12 … +11, +9 in round 6: made
  { ...bet, id: 'w-e-r3bird', player: ID.Erik, kind: 'birdies', target: 1, attempts: 'round', round: 'r3' }, // his birdie came in round 2: missed
  { ...bet, id: 'w-k-sum60', player: ID.Cedric, kind: 'scoreSum', target: 60, rounds: 6 }, // 6 × +11 = +66: missed
];
const poolCode = await P('Sascha').evaluate(
  async ({ ID, rounds, WAGERS }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const pool = {
      kind: 'wager-pool',
      id: 'usa-2026-trip',
      name: 'USA 2026',
      from: rounds[0].day,
      to: rounds[rounds.length - 1].day,
      createdAt: new Date().toISOString(),
      currency: 'USD',
      counted: true,
      players: Object.entries(ID).map(([name, id]) => ({ id, name })),
      rounds,
      wagers: WAGERS,
      progress: {},
    };
    return (await ws.createPool(pool, ID.Sascha))?.code ?? null;
  },
  { ID, rounds, WAGERS },
);
ok(/^[A-Z0-9]{6}$/.test(poolCode ?? '') && sim.shared.get(poolCode)?.game.rounds.length === 6, `the pool "USA 2026" on the server, on all 6 rounds: ${poolCode}`);
for (const n of ['Chris', 'Erik', 'Cedric']) {
  const p = P(n);
  await away(n, async () => {
    await p.goto('about:blank');
    await p.goto(url + '#join=' + poolCode);
  });
  const d = p.getByRole('dialog', { name: 'Spiel beitreten' });
  await d.getByText('Wetten „USA 2026“ – wer bist du?').waitFor({ timeout: 15000 }).catch(() => {});
  await d.getByRole('button', { name: n, exact: true }).click();
  await p.locator('.topbar h1', { hasText: 'USA 2026' }).waitFor({ timeout: 15000 }).catch(() => {});
  await p.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
  await away(n, () => p.goto(url));
}
const joined = sim.shared.get(poolCode).game.players;
ok(['Chris', 'Erik', 'Cedric'].every((n) => joined.find((x) => x.id === ID[n])?.joined?.uid === n), `everyone in the pool as himself (${joined.map((x) => `${x.name}:${x.joined?.uid ?? '–'}`).join(' ')})`);

// ---------- the scores, worked out here: strokes over par, hole by hole (index 0 = hole 1A) ----------
const line = (over = {}) => Array.from({ length: 18 }, (_, k) => over[k] ?? 0);
const at3 = (v) => Object.fromEntries([2, 5, 8, 11, 14, 17].map((k) => [k, v]));
const SCORES = {
  // Sascha: a bogey every third hole – 2 pars in a row at best; round 5 only two bogeys: 8 in a row (1A–8A)
  Sascha: [line(at3(1)), line(at3(1)), line(at3(1)), line(at3(1)), line({ 8: 1, 17: 1 }), line(at3(1))],
  // Chris: bogeys on 6A, 3B, 9B – 5 pars in a row at best; a birdie in round 2, two in round 4
  Chris: [0, 1, 2, 3, 4, 5].map((r) => line({ 5: 1, 11: 1, 17: 1, ...(r === 1 ? { 0: -1 } : r === 3 ? { 0: -1, 6: -1 } : {}) })),
  // Erik: six double bogeys (+12) – a birdie in round 2 (+11), round 6 nine bogeys (+9)
  Erik: [0, 1, 2, 3, 4, 5].map((r) => (r === 5 ? line(Object.fromEntries([0, 2, 4, 6, 8, 10, 12, 14, 16].map((k) => [k, 1]))) : line({ 1: 2, 4: 2, 7: 2, 10: 2, 13: 2, 16: 2, ...(r === 1 ? { 3: -1 } : {}) }))),
  // Cedric: eleven bogeys every round, +11 – 66 over six
  Cedric: [0, 1, 2, 3, 4, 5].map(() => line(Object.fromEntries([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15].map((k) => [k, 1])))),
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
ok(sum(SCORES.Erik[5]) === 9 && sum(SCORES.Erik[1]) === 11 && SCORES.Cedric.every((r) => sum(r) === 11), 'the plan: Erik +11 in round 2, +9 in round 6; Cedric +11 a round');

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const enterHole = async (n, r, hole, last) => {
  const p = P(n);
  await p.locator('.map-score').click();
  for (const who of [n, PARTNER[n]]) {
    const v = SCORES[who][r][hole];
    const blk = block(p, who);
    await blk.getByRole('button', { name: /Schläge plus eins/ }).click(); // par
    for (let k = 0; k < v; k++) await blk.getByRole('button', { name: /Schläge plus eins/ }).click();
    if (v < 0) await blk.getByRole('button', { name: /Schläge minus eins/ }).click();
  }
  if (!last) await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  else await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.waitForTimeout(200);
};
const openPool = async (n) => {
  const p = P(n);
  // the round left for Games (as by the start page from the hole map: paused, not ended)
  await p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').find((x) => !x.finishedAt);
    if (r) sessionStorage.setItem('golfos.paused', r.id);
    sessionStorage.setItem('golfos.module', 'games');
  });
  await away(n, async () => {
    await p.goto('about:blank');
    await p.goto(url);
  });
  await p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await p.locator('.list-item').filter({ hasText: 'USA 2026' }).first().click();
  await p.locator('.topbar h1', { hasText: 'USA 2026' }).waitFor({ timeout: 15000 });
};
const progress = () => sim.shared.get(poolCode).game.progress;
const brief = (x) => (x ? `${x.done ? 'made' : 'open'} best ${x.best} in ${x.rounds}` : '–');

// what each day must leave in the pool – [bet, done, best, rounds counted]
const EXPECT = {
  1: [['w-s-par8', false, 2, 1], ['w-c-bird2', false, 0, 1], ['w-e-score10', false, 12, 1], ['w-k-sum60', false, 11, 1]],
  2: [['w-c-bird2', false, 1, 2], ['w-e-score10', false, 11, 2], ['w-e-r3bird', false, null, 0]],
  3: [['w-e-r3bird', false, 0, 1], ['w-k-sum60', false, 33, 3]],
  4: [['w-c-bird2', true, 2, 4]],
  5: [['w-s-par8', true, 8, 5]],
  6: [['w-e-score10', true, 9, 6], ['w-c-par12', false, 5, 6], ['w-k-sum60', false, 66, 6], ['w-e-r3bird', false, 0, 1]],
};

// ---------- 2 · the six days ----------
for (let r = 0; r < 6; r++) {
  const day = at(OFFSETS[r], '07:30');
  await setDay(day);
  for (const n of NAMES) {
    const p = P(n);
    await p.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
    await away(n, () => p.reload());
    const card = p.getByRole('region', { name: `Turnier USA Runde ${r + 1}` });
    await card.waitFor({ timeout: 20000 }).catch(() => {});
    const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const tee = ['Erik', 'Cedric'].includes(n) && !(r === 3 || r === 4) ? '09:10' : '09:00';
    ok(new RegExp(`Dein Flight · ${tee}`).test(t), `day ${r + 1}, ${n}: "${t.slice(0, 70)}"`);
    await card.getByRole('button', { name: 'Teilnehmen' }).click();
    await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
  }
  await P('Sascha').waitForTimeout(5000);
  // the order played: off tee 10 the second flight starts on 1B (index 9) and ends on 9A
  const order = (n) => (['Erik', 'Cedric'].includes(n) && (r === 3 || r === 4) ? [...Array(18).keys()].map((k) => (k + 9) % 18) : [...Array(18).keys()]);
  if (r === 3) {
    const first = (await P('Erik').locator('.map-hole-no').innerText()).trim();
    const s1 = (await P('Sascha').locator('.map-hole-no').innerText()).trim();
    ok(first.startsWith('1B') && s1.startsWith('1A'), `day 4: Erik's flight off tee 10 starts on ${first}, Sascha's on ${s1}`);
  }
  for (let k = 0; k < 18; k++) for (const n of NAMES) await enterHole(n, r, order(n)[k], k === 17);
  await P('Sascha').waitForTimeout(8000);
  // signed by player and marker, then finished
  for (const n of NAMES) {
    const p = P(n);
    await p.locator('.hole-bar-handle').click();
    await p.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
    const sign = p.locator('.sign-card');
    await sign.waitFor({ timeout: 15000 });
    for (const btn of await sign.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
  }
  await P('Sascha').waitForTimeout(10000);
  const flights = Object.values(sim.shared.get(codes[r]).game.flights).map((f) => ({ ...f, ...([...sim.shared.values()].find((x) => x.event_code === codes[r] && x.game.flight?.id === f.id)?.game.flight ?? {}) }));
  const cards = flights.flatMap((f) => f.players.map((pl) => ({ f, pl })));
  ok(cards.length === 4 && cards.every(({ f, pl }) => f.signed?.[pl.id]?.player && f.signed?.[pl.id]?.marker), `day ${r + 1}: all four cards signed by player and marker`);
  const toPar = (f, pl) => sum((f.marks?.[pl.id] ?? []).map((c, k) => (c?.s ?? 0) - (sim.shared.get(codes[r]).game.holes[k]?.par ?? 0)));
  ok(cards.every(({ f, pl }) => toPar(f, pl) === sum(SCORES[pl.name][r])), `day ${r + 1}: every marker's count as played (${cards.map(({ f, pl }) => `${pl.name} ${toPar(f, pl) >= 0 ? '+' : ''}${toPar(f, pl)}`).join(', ')})`);
  // the pool judged on every phone
  for (const n of NAMES) await openPool(n);
  await P('Sascha').waitForTimeout(6000);
  const pg = progress();
  for (const [id, done, best, n] of EXPECT[r + 1]) {
    const x = pg[id];
    ok(!!x && x.done === done && (best == null ? x.best == null : x.best === best) && x.rounds === n, `day ${r + 1}: ${id} – ${brief(x)} (wanted ${done ? 'made' : 'open'} best ${best} in ${n})`);
  }
  // the round over: back to the start page for the next day (the round is finished from its scorecard)
  for (const n of NAMES) {
    const p = P(n);
    await p.evaluate(() => {
      const all = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
      const open = all.find((x) => !x.finishedAt);
      if (open) sessionStorage.setItem('golfos.paused', open.id);
    });
  }
}

// ---------- 3 · the settlement ----------
const pushesMade = sim.pushes.filter((x) => x.action === 'bet' && x.code === poolCode).map((x) => x.wager).sort();
ok(pushesMade.join() === ['w-c-bird2', 'w-e-score10', 'w-s-par8'].sort().join(), `push "Wette geschafft": once for each bet made (${pushesMade.join(', ')})`);
await openPool('Sascha');
const H = P('Sascha');
await H.locator('.pool-settle').waitFor({ timeout: 10000 });
const settle = (await H.locator('.pool-settle').innerText()).replace(/\s+/g, ' ');
// made: Sascha, Chris and Erik get 20 $ from each of the three others; missed bets pay nothing (payout "on success")
// net: Sascha +60 −20 −20 = +20, Chris +20, Erik +20, Cedric −60 – Cedric pays each of the three 20 $
ok(/Cedric zahlt an Sascha 20 \$/.test(settle) && /Cedric zahlt an Chris 20 \$/.test(settle) && /Cedric zahlt an Erik 20 \$/.test(settle), `the settlement: Cedric pays each 20 $ – "${settle.slice(0, 260)}"`);
ok(!/(Sascha|Chris|Erik) zahlt an/.test(settle), 'nobody else pays – the three made bets cancel out');

const errs = Object.entries(phones).flatMap(([n, x]) => x.errs.map((e) => `${n}: ${e}`));
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
