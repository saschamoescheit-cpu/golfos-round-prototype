// QA (Sascha 16.11.2026, Orlando: "Thomas und Daniel spielen morgen und übermorgen Legends mit" – "Nur Tageswertung"):
// a guest of a series – in the flights of fewer than half its rounds – stands in the total below a grey line, without a
// place ("–", "Gast · auf 1 Runde"), and wins nothing of the series' own prizes, nor pays into its pot.
// Three tournaments in a series, Sascha, Chris, Cedric in all; Thomas only in round 3 – better than everyone.
// R1 Sascha +0, Chris +2, Cedric +4 – R2 Sascha +1, Chris +2, Cedric +3 – R3 Thomas +0, Sascha +1, Chris +3, Cedric +5.
// Series gross: Sascha +2, Chris +7, Cedric +12, Thomas +0 (guest) → Sascha 1st and wins the 100 $; the pot 3 × 50 $.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesguest.mjs [url]   (SHOTS=dir)
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
  return { r1: d(-3), r2: d(-2), r3: d(-1) };
});
const three = [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Chris', playingHandicap: 0 }, { name: 'Cedric', playingHandicap: 10 }];
const gross = { mode: 'single', scoring: 'stroke', allowance: 0 };
const t1 = await sim.plan(H, { name: 'Celebration', date: days.r1, flights: [{ teeTime: '10:00', players: three }], format: gross });
const t2 = await sim.plan(H, { name: 'Hawks Landing', date: days.r2, flights: [{ teeTime: '10:00', players: three }], format: gross });
const t3 = await sim.plan(H, { name: 'Legends', date: days.r3, flights: [{ teeTime: '10:00', players: [...three, { name: 'Thomas', playingHandicap: 8 }] }], format: gross });
const series = sim.series('Sascha', 'USA-Serie', [t1, t2, t3]);
for (const t of [t1, t2, t3]) shared.get(t).game.series = { code: series, name: 'USA-Serie' };
shared.get(series).game.prizes = { prize: { kind: 'money', currency: 'USD' }, fee: 50, amounts: { gross1: 100 } };
const put = (code, over) => {
  const ev = shared.get(code).game;
  for (const [, row] of [...shared.entries()].filter(([, r]) => r.event_code === code)) {
    const f = row.game.flight;
    const scores = Object.fromEntries(f.players.map((p) => [p.id, ev.holes.map((h, i) => ({ s: h.par + (i < (over[p.name] ?? 0) ? 1 : 0) }))]));
    row.game = { kind: 'round-flight', flight: { ...f, scores } };
    row.updated_at = new Date().toISOString();
  }
};
put(t1, { Sascha: 0, Chris: 2, Cedric: 4 });
put(t2, { Sascha: 1, Chris: 2, Cedric: 3 });
put(t3, { Thomas: 0, Sascha: 1, Chris: 3, Cedric: 5 });
await H.evaluate((codes) => {
  const at = new Date().toISOString();
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  for (const code of codes) rs.push({ id: 'r-' + code, courseName: 'Hetzenhof', createdAt: at, finishedAt: at, holes: [], players: [{ id: 'me', name: 'Sascha', isMe: true }], entries: { me: [] }, capture: 'full', loopOrder: ['A'], courseId: 'x', kind: 'tournament', shared: { code, flight: 'f1', phone: 'ph', base: {} } });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
}, [t1, t2, t3]);

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click().catch(() => {});
await H.waitForTimeout(1200);
await H.locator('.list-item').filter({ hasText: 'USA-Serie' }).first().click();
await H.waitForTimeout(2500);

// 1. the total: Sascha first, Thomas last below the grey line, no place
const total = H.getByRole('region', { name: 'Gesamtwertung' });
const lines = (await total.locator('.series-lb li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(lines.length === 4 && /^1 Sascha/.test(lines[0]), `Sascha first (${lines.join(' | ')})`);
ok(/^– Thomas Gast Par/.test(lines[3] ?? ''), `Thomas last: "– Thomas Gast" (${lines[3]})`);
ok(!lines.slice(0, 3).some((x) => /Thomas|Gast/.test(x)), 'nobody else a guest');
const guestLi = total.locator('.series-lb li').nth(3);
ok(/\blb-guests\b/.test((await guestLi.getAttribute('class')) ?? '') && !/\blb-cut\b/.test((await guestLi.getAttribute('class')) ?? ''), 'his own line – not the cut');
const line = await guestLi.evaluate((el) => getComputedStyle(el).boxShadow);
ok(!/rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(line), `the line grey, not red (${line})`);
ok(/Gäste unter der Linie: nur in ihren Runden gewertet/.test(await txt(total)), 'the note under the board');
ok(!/Cut nach Runde/.test(await txt(total)), 'no cut note');
if (shots) await total.screenshot({ path: `${shots}/seriesguest-total.png` });

// 2. the series' prizes: Sascha wins, the pot of the three only
const board = H.getByRole('region', { name: 'Preise der Serie' });
const bt = await txt(board);
ok(/Sieger brutto · Sascha/.test(bt) && !/Sieger brutto · Thomas/.test(bt), `the series' winner: Sascha, not the guest (${bt.slice(0, 200)})`);
ok(/Topf 150 \$/i.test(bt), `the pot: 3 × 50 $ = 150 $ (${bt.slice(0, 120)})`);
ok(!/Thomas →|→ Thomas/.test(bt), 'Thomas not in the settlement of the series');

// 3. round 3 itself: Thomas in full – first of the day
await H.locator('.list-item').filter({ hasText: 'Legends' }).first().click();
await H.waitForTimeout(2500);
const day = (await H.locator('.lb-rows li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(/^1 Thomas/.test(day[0] ?? ''), `the day: Thomas first (${day.slice(0, 4).join(' | ')})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
