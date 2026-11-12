// QA (Sascha 29.10.2026: "if Sascha invites Cedric, Cedric keeps his own scores – strokes, putts, penalties"; "in a
// tournament the player always counts himself and a partner"): two phones, a stroke play tournament flight Sascha +
// Cedric. Each keeps his own score (the other's phone shows it, no steppers for it in a friendly round – here each
// marks the other), each marks the other; a difference between the own count and the marker's shows on the score
// panel and on the leaderboard. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/sharemarker.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
// a server without the SQL of 30.10.2026: the tournament's flights stay in the event's row
const { phone, event, shared, plan, joinPlanned } = sharedServer(b, url, { noSplit: true });
const flight = () => Object.values(event().flights)[0];

// Sascha: a stroke play round with Cedric, a tournament – the code in the setup
// (tournaments are planned in Games since 01.11.2026 – the plan made by the app's own code, then both join by link)
const host = await phone('Sascha');
const H = host.p;
const code = await plan(H, { name: 'Hetzenhof', format: { mode: 'single', scoring: 'net', allowance: 100 }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 9 }] }] });
const ids = flight().players.map((p) => p.id);
ok(ids.length === 2 && flight().markers?.[ids[0]] === ids[1] && flight().markers?.[ids[1]] === ids[0], 'server: Sascha and Cedric mark each other');
await joinPlanned(H, code);

// Cedric joins as Cedric – his name is in the flight: in at once
const guest = await phone('Cedric');
const G = guest.p;
await joinPlanned(G, code);
await G.waitForTimeout(6000); // both phones in the flight

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const plus = async (p, name, n) => {
  for (let k = 0; k < n; k++) await block(p, name).getByRole('button', { name: /Schläge plus eins/ }).click();
};
// Sascha: himself a 4 (par), Cedric a 5 – Cedric: himself a 5, Sascha a 5 (!)
await H.locator('.map-score').click();
await H.waitForTimeout(300);
ok((await H.locator('.score-player.kept-elsewhere').count()) === 0, 'Sascha: steppers for himself and for Cedric (he marks him)');
await plus(H, 'Sascha', 1);
await plus(H, 'Cedric', 2);
// the player he marks: no bet counts this round – the score with penalty strokes only (Sascha 02.11.2026: in detail
// only when a bet is coupled); his own card in full
const rows = async (name) => (await block(H, name).locator('.stepper-label').allInnerTexts()).map((x) => x.trim());
const cRows = await rows('Cedric');
ok(!cRows.some((r) => /^(Putts|Sand Shots|Strafschläge)/.test(r)), `Cedric without a bet: the strokes incl. penalty strokes only (${cRows.map((r) => r.split(String.fromCharCode(10))[0]).join(', ')})`);
const sRows = await rows('Sascha');
ok(['Putts', 'Sand Shots', 'Strafschläge'].every((x) => sRows.some((r) => r.startsWith(x))), 'his own card in full');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await G.locator('.map-score').click();
await G.waitForTimeout(300);
await plus(G, 'Cedric', 2);
await plus(G, 'Sascha', 2);
await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(12000);
const f = flight();
const [sId, cId] = ids;
ok(f.scores[sId][0]?.s === 4 && f.marks?.[sId]?.[0]?.s === 5 && f.scores[cId][0]?.s === 5 && f.marks?.[cId]?.[0]?.s === 5, `server: own counts 4 / 5, marker counts 5 / 5`);
// Sascha's panel: his own 4 beside his marker's 5 – flagged; Cedric's own 5 beside Sascha's count of him
await H.locator('.map-score').click();
await H.waitForTimeout(300);
const mine = (await block(H, 'Sascha').innerText()).replace(/\s+/g, ' ');
ok(/Cedric \(Zähler\): 5 · weicht ab/.test(mine), `Sascha's panel: "${mine.match(/Cedric \(Zähler\)[^·]*·?[^·]*/)?.[0] ?? mine}"`);
ok((await block(H, 'Sascha').getByRole('button', { name: /Schläge plus eins/ }).count()) === 1 && (await block(H, 'Sascha').locator('.stepper-value').first().innerText()).startsWith('4'), 'Sascha: his own 4 stays his own – the marker\'s 5 does not overwrite it');
ok(/Cedric selbst: 5/.test(await block(H, 'Cedric').innerText()) && !/weicht ab/.test(await block(H, 'Cedric').innerText()), 'Sascha: beside his count of Cedric, Cedric\'s own 5 – the same');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/round-marker.png' });
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
// the leaderboard flags it
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Leaderboard · Turnier' }).click();
await H.waitForTimeout(400);
const board = (await H.locator('.event-board').innerText()).replace(/\s+/g, ' ');
ok(/Sascha (dein Flight )?Zähler weicht ab: 1A/.test(board) && /Sascha.*Par/.test(board), `leaderboard: "${board}"`);
ok([...shared.values()].every((r) => !r.event_code), 'old server: no rows of their own – the tournament as before');
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
