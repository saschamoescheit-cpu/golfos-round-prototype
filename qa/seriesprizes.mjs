// QA (Sascha 15.11.2026): "wie machen wir es mit ‚worum gespielt wird', wenn es sich auf eine ganze Serie bezieht – Sieger
// der Turnierserie aus X Runden" – "Auf der Serienseite" + "Eine Abrechnung am Ende".
// Two tournaments in a series, Sascha the host: round 1 with a day prize (gross winner 30 $, no fee – Sascha pays it).
// On the series page Sascha sets "Worum · ganze Serie": US-Dollar, 50 $ entry fee, the series' gross winner 100 $.
// Scores: R1 Chris +0, Sascha +2, Cedric +5 – R2 Sascha +0, Chris +3, Cedric +4 → series gross: Sascha +2, Chris +3.
// Day 1: Chris +30, Sascha −30. Series: Sascha 100 − 50 + (150 − 100) = +100, Chris −50, Cedric −50.
// Together: Sascha +70, Chris −20, Cedric −50 → Cedric → Sascha 50 $, Chris → Sascha 20 $ – one settlement.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesprizes.mjs [url]   (SHOTS=dir)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const txt = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');
const sim = sharedServer(b, url);
const { shared } = sim;
const host = await sim.phone('Sascha');
const H = host.p;
const days = await H.evaluate(() => {
  const d = (n) => {
    const x = new Date(Date.now() + n * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { r1: d(-2), r2: d(-1) };
});
const flights = [{ teeTime: '10:00', players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Chris', playingHandicap: 0 }, { name: 'Cedric', playingHandicap: 10 }] }];
const gross = { mode: 'single', scoring: 'stroke', allowance: 0 };
const t1 = await sim.plan(H, { name: 'Celebration', date: days.r1, flights, format: gross });
const t2 = await sim.plan(H, { name: 'Hawks Landing', date: days.r2, flights, format: gross });
shared.get(t1).game.prizes = { prize: { kind: 'money', currency: 'USD' }, amounts: { gross1: 30 } };
const series = sim.series('Sascha', 'USA-Serie', [t1, t2]);
for (const t of [t1, t2]) shared.get(t).game.series = { code: series, name: 'USA-Serie' };
// the scores, as Rounds writes them: over par on the first holes
const put = (code, over) => {
  const ev = shared.get(code).game;
  for (const [, row] of [...shared.entries()].filter(([, r]) => r.event_code === code)) {
    const f = row.game.flight;
    const scores = Object.fromEntries(f.players.map((p) => [p.id, ev.holes.map((h, i) => ({ s: h.par + (i < (over[p.name] ?? 0) ? 1 : 0) }))]));
    row.game = { kind: 'round-flight', flight: { ...f, scores } };
    row.updated_at = new Date().toISOString();
  }
};
put(t1, { Chris: 0, Sascha: 2, Cedric: 5 });
put(t2, { Sascha: 0, Chris: 3, Cedric: 4 });
// Sascha's phone has his rounds of it (the inbox knows who he is)
await H.evaluate((codes) => {
  const at = new Date().toISOString();
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  for (const code of codes) rs.push({ id: 'r-' + code, courseName: 'Hetzenhof', createdAt: at, finishedAt: at, holes: [], players: [{ id: 'me', name: 'Sascha', isMe: true }], entries: { me: [] }, capture: 'full', loopOrder: ['A'], courseId: 'x', kind: 'tournament', shared: { code, flight: 'f1', phone: 'ph', base: {} } });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
}, [t1, t2]);

const open = async (name) => {
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(2500);
  await H.getByRole('button', { name: 'Turniere' }).first().click().catch(() => {});
  await H.waitForTimeout(1200);
  await H.locator('.list-item').filter({ hasText: name }).first().click();
  await H.waitForTimeout(2500);
};
await open('USA-Serie');

// 1. the host sets what the whole series is played for – under the rounds
const rows = H.locator('.tour-prizes');
ok(/Worum · ganze Serie/i.test(await txt(rows.locator('.eyebrow').first())), `the series page: "Worum · ganze Serie" (${await txt(rows.locator('.eyebrow').first())})`);
const heads = (await H.locator('main .eyebrow').allInnerTexts()).map((x) => x.trim().toUpperCase());
ok(heads.indexOf('RUNDEN') >= 0 && heads.indexOf('WORUM · GANZE SERIE') > heads.indexOf('RUNDEN'), `under the rounds (${heads.join(' · ')})`);
await rows.locator('.settings-row').filter({ hasText: 'Worum wird gespielt' }).click();
await H.getByRole('dialog', { name: 'Worum wird gespielt' }).locator('.pick-option').filter({ hasText: /^Geld/ }).first().click();
await H.waitForTimeout(300);
await H.getByRole('dialog').locator('.pick-option').filter({ hasText: 'US-Dollar' }).first().click();
await H.waitForTimeout(800);
await rows.locator('.settings-row').filter({ hasText: 'Startgeld je Spieler' }).click();
await H.getByRole('dialog', { name: 'Startgeld je Spieler' }).locator('.pick-option').filter({ hasText: /^50 \$$/ }).first().click();
await H.waitForTimeout(800);
await rows.locator('.settings-row').filter({ hasText: 'Sieger brutto' }).click();
await H.getByRole('dialog', { name: 'Sieger brutto' }).locator('.pick-option').filter({ hasText: /^100 \$$/ }).first().click();
await H.waitForTimeout(2000);
const sp = shared.get(series).game.prizes;
ok(sp?.prize?.currency === 'USD' && sp.fee === 50 && sp.amounts?.gross1 === 100, `on the server: the series' prizes (${JSON.stringify(sp)})`);
ok(/Topf · 3 Spieler × 50 \$/.test(await txt(rows)), `the pot over the series' field: 3 × 50 $ (${(await txt(rows)).slice(0, 200)})`);

// 2. the board: the series' winner, the day prize, one settlement
await open('USA-Serie');
const board = H.getByRole('region', { name: 'Preise der Serie' });
const bt = await txt(board);
ok(/Ganze Serie/.test(bt) && /Sieger brutto · Sascha/.test(bt) && /100 \$/.test(bt), `the series' gross winner: Sascha 100 $ (${bt.slice(0, 260)})`);
ok(/Tagespreise/.test(bt) && /R1 · Sieger brutto · Chris/.test(bt) && /30 \$/.test(bt), 'the day prize of round 1: Chris 30 $');
const pays = (await board.locator('.tour-prize-pays li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(pays.length === 2 && pays.some((x) => /Cedric → Sascha/.test(x) && /50 \$/.test(x)) && pays.some((x) => /Chris → Sascha/.test(x) && /20 \$/.test(x)), `one settlement: Cedric → Sascha 50 $, Chris → Sascha 20 $ (${pays.join(' | ')})`);
if (shots) await H.screenshot({ path: `${shots}/seriesprizes-board.png`, fullPage: true });
await board.locator('.tour-prize-pays li').filter({ hasText: 'Chris → Sascha' }).getByRole('button', { name: /als bezahlt markieren/ }).click();
await H.waitForTimeout(2000);
ok(!!shared.get(series).game.paid?.['chris>sascha'], 'marked paid: kept on the series on the server');

// 3. round 1's page: who won, no "Wer zahlt wem" – settled at the series' end
await open('USA-Serie');
await H.locator('.list-item').filter({ hasText: 'Celebration' }).first().click();
await H.waitForTimeout(2500);
const tb = H.getByRole('region', { name: 'Preise' });
const tt = await txt(tb);
ok(/Chris/.test(tt) && /Abgerechnet wird am Ende der Serie „USA-Serie“/.test(tt) && (await tb.locator('.tour-prize-pays').count()) === 0, `the tournament: its winner, settled with the series (${tt.slice(0, 200)})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
