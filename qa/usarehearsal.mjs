// The dress rehearsal for the USA trip (Sascha 01.11.2026, the night run): four phones – Sascha, Chris, Erik, Cedric –
// end to end, as on the first day over there:
// 1 · the tournament planned (2 flights with tee times), everyone joined by the link before the day
// 2 · on the day: "Turnier heute · Dein Flight · Teilnehmen" on every phone, each one in as himself
// 3 · played with markers – the marker enters his partner in full (putts …) – the live leaderboard on every phone
// 4 · the cards signed by player and marker, the leaderboard says so; the marker's counts with their details on the
//     server (what the bets "with marker" judge from)
// 5 · the bets: the pool "USA 2026" in $ tied to the tournament's round, joined by its link (only the host changes it);
//     pars in a row "with marker" – judged by each phone from its signed round, the push for a bet made, the
//     settlement (5+5+10 is a game in Games, not a bet – Sascha 02.11.2026)
// 18 holes, as over there.
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
  option: 'A \\+ B · 18',
  format: { mode: 'single', scoring: 'net', allowance: 100 },
  flights: [
    { teeTime: '09:20', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Chris', playingHandicap: 6 }] },
    { teeTime: '09:30', players: [{ name: 'Erik', playingHandicap: 8 }, { name: 'Cedric', playingHandicap: 5 }] },
  ],
  // the special prizes: Long Drive on the first hole, Nearest to the Pin on the first par 3
  specials: [{ id: 'ld', kind: 'longDrive', hole: 0 }, { id: 'ntp', kind: 'nearestPin' }],
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the tournament planned: ${code}`);
// the link sent ahead: the others are in (a planned tournament asks nobody)
for (const n of ['Chris', 'Erik', 'Cedric']) if (!sim.shared.get(code).members.includes(n)) sim.shared.get(code).members.push(n);
// ===== BETS (Games): the pool "USA 2026" in $ – set up here, before the day =====
// Sascha sets it up through the app's own code, as Games does (createPool – qa/wagers.mjs drives those screens): tied to
// the tournament's round, 5 pars in a row for Sascha and 4 for Chris (with marker, 20 $ each, paid when made)
const tourRow = sim.shared.get(code).game;
const ID = { Sascha: 'pl-s', Chris: 'pl-c', Erik: 'pl-e', Cedric: 'pl-k' };
// a phone sent to another page: what it was still fetching is cancelled – WebKit calls that "access control checks"
const away = async (n, go) => {
  const before = phones[n].errs.length;
  await go();
  const after = phones[n].errs.splice(before);
  phones[n].errs.push(...after.filter((e) => !/supabase\.co\/\S* due to access control checks/.test(e)));
};
const poolCode = await P('Sascha').evaluate(
  async ({ code, course, ID }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const { dayOf } = await import('/src/lib/wagers.ts');
    const day = dayOf(new Date());
    const run = { stake: 20, payout: 'success', attempts: 'any', counted: true, kind: 'parRun', by: 'Sascha' };
    const pool = {
      kind: 'wager-pool',
      id: 'usa-2026',
      name: 'USA 2026',
      from: day,
      to: day,
      createdAt: new Date().toISOString(),
      currency: 'USD',
      players: Object.entries(ID).map(([name, id]) => ({ id, name })),
      rounds: [{ id: 'r1', day, course: course.name, courseId: course.id, tour: code }],
      wagers: [
        { ...run, id: 'w-s5', player: ID.Sascha, target: 5 },
        { ...run, id: 'w-c4', player: ID.Chris, target: 4 },
      ],
      progress: {},
    };
    return (await ws.createPool(pool, ID.Sascha))?.code ?? null;
  },
  { code, course: { id: tourRow.course.id, name: tourRow.course.name }, ID },
);
ok(/^[A-Z0-9]{6}$/.test(poolCode ?? '') && sim.shared.get(poolCode)?.owner === 'Sascha', `the pool "USA 2026" on the server, Sascha its host: ${poolCode}`);
// the others: the pool's link – "who are you?" – themselves; they see the bets, only the host changes them
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
  const head = await p.locator('.topbar h1').innerText().catch(() => '');
  const guest = (await p.getByText('Nur wer den Pool angelegt hat, ändert die Wetten').isVisible().catch(() => false)) && (await p.getByRole('button', { name: 'Pool bearbeiten' }).count()) === 0 && (await p.locator('button.pool-wager').count()) === 0;
  ok(/USA 2026/.test(head) && guest, `${n}: joined by the link, in the pool – sees the bets, changes none (only the host)`);
  // back to Rounds for the day
  await p.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
  await away(n, () => p.goto(url));
}
const joined = sim.shared.get(poolCode).game.players;
ok(['Chris', 'Erik', 'Cedric'].every((n) => joined.find((x) => x.id === ID[n])?.joined?.uid === n), `the server: each joined as himself, with his account (${joined.map((x) => `${x.name}:${x.joined?.uid ?? '–'}`).join(' ')})`);

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

// ---------- special prizes: Long Drive at the first hole by the hint on the map, Nearest to the Pin from the phones ----------
const ld = async (n, m, fairway) => {
  const p = P(n);
  const hint = p.getByRole('status', { name: 'Long Drive' });
  await hint.waitFor({ timeout: 10000 });
  await hint.getByRole('button').click();
  const sheet = p.getByRole('dialog', { name: 'Long Drive' });
  await sheet.locator('#special-m').fill(String(m));
  if (!fairway) await sheet.getByRole('checkbox').uncheck();
  await sheet.getByRole('button', { name: 'Eintragen' }).click();
  await sheet.waitFor({ state: 'detached', timeout: 10000 });
};
ok(/Long Drive · führend: noch keiner/.test((await P('Sascha').getByRole('status', { name: 'Long Drive' }).innerText().catch(() => '')).replace(/\s+/g, ' ')), 'the hint at the Long Drive hole: "Long Drive · führend: noch keiner"');
await ld('Sascha', 245, true);
await ld('Erik', 262, false); // longer – but in the rough: it does not count
await ld('Cedric', 251, true);
for (const [n, m] of [['Chris', 2.1], ['Cedric', 3.4]])
  await P(n).evaluate(async ({ code, m }) => {
    const sr = await import('/src/lib/sharedround.ts');
    const r = JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => !x.finishedAt);
    await sr.setSpecial(code, r.shared.flight, 'ntp', r.players.find((p) => p.isMe).id, { m, at: new Date().toISOString(), by: r.shared.phone });
  }, { code, m });
await P('Sascha').waitForTimeout(8000);
const hintNow = (await P('Sascha').getByRole('status', { name: 'Long Drive' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/führend: Cedric 251 m/.test(hintNow) && /deins 245 m/.test(hintNow), `Sascha's hint follows: "${hintNow}"`);

// ---------- 3 · played with markers ----------
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const holes = (await sim.round(P('Sascha'))).holes.length;
// own score: par + 0/1 by player and hole; the marker's count the same – on hole 1 also his partner's putts. Gross:
// Sascha +3/+1 (pars on 14–18: 5 in a row), Chris +3/+3 (3 at most), Erik +3/+2, Cedric +3/+1
const extra = {
  Sascha: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  Chris: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
  Erik: [0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  Cedric: [1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
};
const partnerDetails = {};
const enterHole = async (n, i) => {
  const p = P(n);
  await p.locator('.map-score').click();
  for (const who of [n, PARTNER[n]]) for (let k = 0; k <= extra[who][i]; k++) await block(p, who).getByRole('button', { name: /Schläge plus eins/ }).click();
  // the partner in detail only when a bet of the pool needs it (Sascha 02.11.2026) – else score and penalty strokes
  if (i === 0) {
    const putts = block(p, PARTNER[n]).getByRole('button', { name: /Putts plus eins/ });
    partnerDetails[n] = (await putts.count()) > 0;
    if (partnerDetails[n]) await putts.click();
  }
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
  const { bd, rows } = await board(n);
  ok(rows.length === 4 && rows.every((r) => /nach 3/.test(r)), `${n}'s live leaderboard after 3 holes: ${rows.join(' | ')}`);
  const sp = (await bd.locator('.special-leaders').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(/Long Drive · Loch \S+: Cedric 251 m/.test(sp) && /Nearest to the Pin · Loch \S+: Chris 2,1 m/.test(sp), `${n}: the special prizes' leaders – "${sp}"`);
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
const detailed = Object.values(partnerDetails).every(Boolean);
ok(all.every(({ f, pl }) => (f.marks?.[pl.id] ?? []).filter((c) => c?.s != null).length === holes && (f.marks[pl.id][0]?.d?.pu != null) === detailed), `server: every marker's count – all holes; the partner's putts ${detailed ? 'there (a bet of the pool needs details)' : 'not asked (the pool bets on the score only)'}`);
const final = (await board('Sascha')).rows;
ok(final.length === 4 && final.every((r) => /F|nach 18/.test(r)), `the leaderboard as it ended: ${final.join(' | ')}`);
ok(/unterschrieben/.test(await P('Sascha').locator('.event-board').innerText()), 'the leaderboard: "unterschrieben"');

// ===== BETS (Games): judged by themselves from the signed rounds, the pushes, the settlement =====
// each phone opens the pool: it judges its owner's bets from his signed round – the marker's figures – and reports them
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
for (const n of NAMES) await openPool(n);
await P('Sascha').waitForTimeout(6000);
const pg = sim.shared.get(poolCode).game.progress;
// hole 1: Chris entered Sascha's putts, Sascha did not – the one hole the marker counted "differently"; his figures count
ok(pg['w-s5']?.done === true && pg['w-s5'].best === 5 && pg['w-s5'].rounds === 1 && pg['w-s5'].differ === 1, `Sascha: 5 pars in a row (14–18) made – a counted round, the marker's figures (his putts on hole 1: 1 hole "differs") (${JSON.stringify(pg['w-s5'] ?? null).slice(0, 120)})`);
ok(pg['w-c4']?.done === false && pg['w-c4'].best === 3 && pg['w-c4'].rounds === 1, `Chris (his phone): 3 pars in a row of 4 – open (${pg['w-c4']?.best})`);
const betPushes = sim.pushes.filter((x) => x.action === 'bet' && x.code === poolCode);
ok(betPushes.length === 1 && betPushes[0].wager === 'w-s5' && betPushes[0].from === 'Sascha', `push "Wette geschafft": once, for Sascha's run, from his phone (${betPushes.map((x) => `${x.from}:${x.wager}`).join(' ')})`);
// the settlement on the host's phone: Sascha +3 × 20, the others −20 each
await openPool('Sascha');
const H = P('Sascha');
await H.locator('.pool-settle').waitFor({ timeout: 10000 });
const settle = (await H.locator('.pool-settle').innerText()).replace(/\s+/g, ' ');
ok(/Chris → Sascha 20 \$/.test(settle) && /Erik → Sascha 20 \$/.test(settle) && /Cedric → Sascha 20 \$/.test(settle), `the settlement: "${settle.slice(0, 220)}"`);
const standing = (await H.locator('.pool-standings').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(standing.includes('Sascha Chris Pars in Folge 5/5 3/4'), `the standing at the top – those with bets, Sascha made, Chris 3 of 4: "${standing.slice(0, 160)}"`);

const errs = Object.entries(phones).flatMap(([n, x]) => x.errs.map((e) => `${n}: ${e}`));
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
