// QA (Sascha 08.11.2026: "yesterday's Celebration – a tournament of its own – into the series The Orlando Invitational
// that starts on Monday, with its scores and the live leaderboard"). Supabase simulated (qa/sharesim.mjs), the app real.
// 1 · the series' host sees "Turnier als Runde aufnehmen" – yesterday's tournament offered, marked "gespielt"
// 2 · taken in: round 1 of the series, the tournament points to it, the cut stays after the same round (now one on)
// 3 · the total counts yesterday's scores
// Usage: node qa/seriesadopt.mjs [url]
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
const day = (n) =>
  H.evaluate((n) => {
    const d = new Date(Date.now() + n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, n);
const flights = [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Erik', playingHandicap: 8 }] }];
const celebration = await sim.plan(H, { name: 'Celebration', date: await day(-1), flights, format: { mode: 'single', scoring: 'stroke', allowance: 0 } });
const r1 = await sim.plan(H, { name: 'Orlando · Runde 1', date: await day(1), flights, format: { mode: 'single', scoring: 'stroke', allowance: 0 } });
const r2 = await sim.plan(H, { name: 'Orlando · Runde 2', date: await day(2), flights, format: { mode: 'single', scoring: 'stroke', allowance: 0 } });
const code = sim.series('Sascha', 'The Orlando Invitational', [r1, r2], { multi: { cut: { after: 1, top: 1 } } });
// yesterday played: Sascha one over par per hole on the first two holes, Erik level
const row = sim.shared.get(celebration);
const ownRows = [...sim.shared.values()].filter((r) => r.event_code === celebration).map((r) => r.game.flight);
for (const f of [...Object.values(row.game.flights), ...ownRows]) {
  const n = row.game.holes.length;
  f.scores = Object.fromEntries(f.players.map((p) => [p.id, Array.from({ length: n }, (_, i) => ({ s: row.game.holes[i].par + (p.name === 'Sascha' && i < 2 ? 1 : 0) }))]));
}
for (const r of [row, ...[...sim.shared.values()].filter((r) => r.event_code === celebration)]) r.updated_at = new Date().toISOString();

// 1 · the host opens the series in Tournaments
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.reload();
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(1500);
await H.locator('.tour-series-row').filter({ hasText: 'The Orlando Invitational' }).first().click({ timeout: 8000 });
await H.waitForTimeout(2500);
const take = H.getByRole('button', { name: 'Turnier als Runde aufnehmen' });
ok(await take.isVisible().catch(() => false), '"Turnier als Runde aufnehmen" for the host');
await take.click();
const sheet = H.getByRole('dialog', { name: 'Turnier aufnehmen' });
const offered = sheet.locator('.list-item').filter({ hasText: 'Celebration' });
ok((await offered.count()) === 1 && /gespielt/.test(await offered.innerText()), 'yesterday\'s Celebration offered, "gespielt"');
ok((await sheet.locator('.list-item').filter({ hasText: 'Orlando' }).count()) === 0, 'the series\' own rounds not offered');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/seriesadopt-sheet.png' });

// 2 · taken in
await offered.click();
await H.waitForTimeout(3000);
const s = sim.shared.get(code).game;
ok(s.rounds.length === 3 && s.rounds[0].code === celebration, `round 1 of the series now (${s.rounds.map((r) => r.name).join(' | ')})`);
ok(sim.shared.get(celebration).game.series?.code === code, 'the tournament points to the series');
ok(s.multi?.cut?.after === 2 && s.multi.cut.top === 1, `the cut stays after the same round – now round 2 (${JSON.stringify(s.multi)})`);
ok((await sheet.count()) === 0, 'the sheet closes');

// 3 · the total with yesterday's scores
await H.waitForTimeout(1500);
const rows = (await H.locator('[aria-label="Gesamtwertung"] .lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(rows.length === 2 && /Erik/.test(rows[0]) && /Sascha/.test(rows[1]) && /\+2/.test(rows[1]) && /R1/.test(rows[1]), `the total counts Celebration: Erik first, Sascha +2 (${rows.join(' | ')})`);
ok((await H.locator('li .list-item').filter({ hasText: 'Celebration' }).count()) === 1, 'Celebration in the series\' list of rounds');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/seriesadopt.png', fullPage: true });
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
