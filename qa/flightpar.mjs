// QA (Sascha 17.11.2026, Legends: "Thomas hat heute mitgespielt und war mit mir im Flight, aber bei ihm schaut es so aus"
// – his phone showed par on holes 1–7 for both and ranked it on the live board): a tournament planned as on 16.11., Sascha
// keeps both cards ("Einer für alle", Sascha the scorer). Thomas has the app for the first time – no account, nothing on
// the phone – and joins by the link after hole 2. His phone must show what Sascha's entered: the first pull brings holes
// 1–2, going on without a score (offline, ahead of Sascha) writes no par for anyone, Sascha's holes 3–4 arrive afterwards;
// his phone never becomes the writer of Sascha's card. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/flightpar.mjs [url]
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
const code = await sim.plan(H, { name: 'Legends-Cup', format: { mode: 'single', scoring: 'stroke', allowance: 0 }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Thomas', playingHandicap: 17 }], scorer: 'p1' }] });
await sim.joinPlanned(H, code);
await H.waitForTimeout(3000);
const flight = () => Object.values(sim.event().flights)[0];
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const pars = (await sim.round(H)).holes.map((h) => h.par);

// Sascha enters a hole for both: Sascha par + 1, Thomas par + 2 – never par, so a par on Thomas's phone is invented
const enter = async () => {
  await H.locator('.map-score').click();
  await H.waitForTimeout(700); // the panel settled (an exchange may draw it anew)
  for (const [name, n] of [['Sascha', 1], ['Thomas', 2]]) {
    const plus = block(H, name).getByRole('button', { name: /Schläge plus eins/ });
    for (let k = 0; k < n + 1; k++) {
      await plus.click();
      await H.waitForTimeout(150);
    } // the first tap sets par, each next one more
  }
};
const next = async (p) => {
  await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  await p.waitForTimeout(500);
  // a score sheet asking on the way: on without a score
  if (await p.locator('.score-panel').count()) await p.getByRole('button', { name: 'Nächstes Loch' }).last().click().catch(() => {});
  await p.waitForTimeout(500);
};
for (let i = 0; i < 2; i++) {
  await enter();
  await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  await H.waitForTimeout(400);
}
await H.waitForTimeout(7000);
const want = { p1: pars.map((p) => p + 1), p2: pars.map((p) => p + 2) };
const sent = flight();
ok(sent.scores.p1[0]?.s === want.p1[0] && sent.scores.p2[1]?.s === want.p2[1], `server: Sascha's holes 1–2 for both (${JSON.stringify(sent.scores.p1.slice(0, 2).map((c) => c?.s))} ${JSON.stringify(sent.scores.p2.slice(0, 2).map((c) => c?.s))})`);

// Thomas: the app for the first time – no account, no profile, no rounds; the link, his name, in
const guest = await sim.phone('Thomas', { guest: true });
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
const sheet = G.getByRole('dialog', { name: 'Runde beitreten' });
await sheet.waitFor({ timeout: 10000 });
await sheet.getByLabel('Dein Name').fill('Thomas');
await sheet.getByRole('button', { name: 'Beitreten', exact: true }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
await G.waitForTimeout(6000);
const tr0 = await sim.round(G);
const me0 = tr0.players.find((p) => p.isMe);
ok(me0?.name === 'Thomas' && me0.id === 'p2', `Thomas's phone: he is Thomas (${me0?.id} ${me0?.name})`);
ok(tr0.entries.p1[0].strokes === want.p1[0] && tr0.entries.p2[1].strokes === want.p2[1], `first pull: holes 1–2 as Sascha entered them (${tr0.entries.p1.slice(0, 2).map((e) => e.strokes)} / ${tr0.entries.p2.slice(0, 2).map((e) => e.strokes)})`);
ok(tr0.shared?.roles?.p1 === 'view' && tr0.shared?.roles?.p2 === 'view', `Thomas's phone only shows both cards (${JSON.stringify(tr0.shared?.roles)})`);
const hr0 = await sim.round(H);
ok(hr0.shared?.roles?.p1 === 'own' && hr0.shared?.roles?.p2 === 'free', `Sascha's phone still keeps both – Thomas's joining took nothing over (${JSON.stringify(hr0.shared?.roles)})`);
const phones = Object.values(flight().phones ?? {});
ok(phones.some((ph) => ph.player === 'p2' && ph.name === 'Thomas') && phones.filter((ph) => ph.player === 'p1').length === 1, `server: Thomas's phone as p2, one phone for Sascha (${phones.map((ph) => `${ph.player}:${ph.name}`).join(', ')})`);

// Thomas walks ahead without a connection – on to hole 5 (Sascha is on 3), entering nothing
await G.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\//, (r) => r.abort());
for (let k = 0; k < 4; k++) await next(G);
const tr1 = await sim.round(G);
const ahead = [2, 3].map((i) => [tr1.entries.p1[i]?.strokes ?? null, tr1.entries.p2[i]?.strokes ?? null]);
ok(tr1.currentHole >= 3, `Thomas is ahead: hole ${tr1.currentHole + 1}`);
ok(ahead.every(([a, c]) => a == null && c == null), `holes 3–4 on Thomas's phone: nothing – no par invented for Sascha or him (${JSON.stringify(ahead)})`);
ok(tr1.entries.p1[0].strokes === want.p1[0] && tr1.entries.p2[1].strokes === want.p2[1], 'holes 1–2 kept as Sascha entered them');
// his scorecard opened and closed again, as Thomas looked at it
await G.locator('.hole-bar-handle').click();
await G.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
await G.waitForTimeout(800);
await G.getByRole('button', { name: /Zurück/ }).first().click({ timeout: 2000 }).catch(() => {});

// Sascha enters holes 3–4, Thomas is back online: they arrive
for (let i = 0; i < 2; i++) {
  await enter();
  await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  await H.waitForTimeout(400);
}
await H.waitForTimeout(6000);
await G.unroute(/rgisfnilwehnqpmbrxmp\.supabase\.co\//);
await G.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await G.waitForTimeout(12000);
const tr2 = await sim.round(G);
const got = [0, 1, 2, 3].map((i) => [tr2.entries.p1[i]?.strokes ?? null, tr2.entries.p2[i]?.strokes ?? null]);
ok(got.every(([a, c], i) => a === want.p1[i] && c === want.p2[i]), `back online: holes 1–4 on Thomas's phone as Sascha entered them (${JSON.stringify(got)})`);
const srv = flight();
ok([0, 1, 2, 3].every((i) => srv.scores.p1[i]?.s === want.p1[i] && srv.scores.p2[i]?.s === want.p2[i]), 'server: the cards are Sascha\'s – nothing from Thomas\'s phone over them');
// the leaderboard: what was entered, thru 4 – not par
const ev = await G.evaluate((c) => JSON.parse(localStorage.getItem('golfos.event.v1.' + c) ?? 'null'), code);
const f = ev && Object.values(ev.flights)[0];
ok(!!f && [0, 1, 2, 3].every((i) => f.scores.p2[i]?.s === want.p2[i]), "Thomas's leaderboard reads Sascha's entries");

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
