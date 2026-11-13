// QA (Sascha's concept 30.10.2026, the night run – the tournament's core): Sascha sets up a tournament with net
// classes (A up to 18, B above) for Sascha (HCP 10) and Ben (HCP 54 – on 9 holes half); Max asks with the code, is let in and starts a
// flight of his own. The leaderboard: net and gross, one class or all, "nach N" / "F", the flights as they stand, and
// the results as a CSV list. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/sharetourney.mjs [url]
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
// (planned in Games since 01.11.2026 – the plan made by the app's own code: Sascha & Ben, and Max's flight)
const code = await sim.plan(H, { name: 'Clubturnier', classes: [18], flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Ben', playingHandicap: 27 }] }, { players: [{ name: 'Max', playingHandicap: null }] }] });
ok(JSON.stringify(sim.event()?.classes) === '[18]', `server: the tournament's classes (${JSON.stringify(sim.event()?.classes)})`);
await sim.joinPlanned(H, code);
const max = await sim.phone('Max');
const M = max.p;
await sim.joinPlanned(M, code);

// hole 1: Sascha 5, Ben 6 (on Sascha's phone – no phone of his), Max 4
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const plus = async (p, name, n) => {
  for (let k = 0; k < n; k++) await block(p, name).getByRole('button', { name: /Schläge plus eins/ }).click();
};
await H.locator('.map-score').click();
await plus(H, 'Sascha', 2);
await plus(H, 'Ben', 3);
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await M.locator('.map-score').click();
await plus(M, 'Max', 1);
await M.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(12000);

await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Leaderboard · Turnier' }).click();
const board = H.locator('.event-board');
await board.waitFor({ timeout: 5000 });
const rows = async () => (await board.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const net = await rows();
ok(net.length === 3 && net.every((r) => /nach 1/.test(r)) && /Ben/.test(net[0]), `net – Ben's 27 strokes on 9 holes put him first: ${net.join(' | ')}`);
ok(/Ben Klasse B/.test(net.join()) && /Sascha Klasse A/.test(net.join()), 'the classes beside the names (Sascha A, Ben B)');
// Sascha 13.11.2026 ("Hier sehe ich kein Live im Leaderboard auf der Runde – optisch genauso wie unter Tournaments"):
// the same card – "● LIVE" while played, a player tapped: his scorecard below
ok((await board.locator('.tour-live-badge').count()) === 1 && /LIVE/.test(await board.locator('.tour-live-head').innerText()) && (await board.locator('.lb-rows.tour-lb').count()) === 1, "the round's board as under Tournaments: ● LIVE, the same rows");
await board.locator('.lb-rows li').first().click();
await H.waitForTimeout(400);
ok((await board.locator('.lb-rows li .lb-card').count()) === 1, 'a player tapped: his scorecard opens below');
await board.locator('.lb-rows li').first().click();
await H.waitForTimeout(300);
await board.getByRole('button', { name: 'Klasse B' }).click();
const onlyB = await rows();
ok(onlyB.length === 2 && /Ben/.test(onlyB[0]) && /Max/.test(onlyB[1]) && !/Sascha/.test(onlyB.join()), `class B – Ben, and Max without a handicap: ${onlyB.join(' | ')}`);
await board.getByRole('button', { name: 'Alle' }).click();
await board.getByRole('button', { name: 'Brutto' }).click();
const gross = await rows();
ok(/Max.*Par/.test(gross[0]) && /Sascha.*\+1/.test(gross[1]) && /Ben.*\+2/.test(gross[2]), `gross: ${gross.join(' | ')}`);
const status = (await board.locator('.flight-status').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Sascha · Ben · nach 1 Loch/.test(status) && /Max · nach 1 Loch/.test(status), `the flights as they stand: "${status}"`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourney-board.png' });
const [dl] = await Promise.all([H.waitForEvent('download', { timeout: 8000 }).catch(() => null), board.getByRole('button', { name: 'Ergebnisliste (CSV)' }).click()]);
const csv = dl ? await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8') : '';
ok(/"Platz";"Spieler";"Flight";"Klasse";"Zu Par"/.test(csv) && /"1";"Max"/.test(csv), `CSV: ${csv.split('\n').slice(1, 3).join(' / ') || 'no download'}`);
ok(host.errs.length === 0 && max.errs.length === 0, `no page errors ${[...host.errs, ...max.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
