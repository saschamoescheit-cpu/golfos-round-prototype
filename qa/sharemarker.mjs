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
const { phone, event } = sharedServer(b, url);
const flight = () => Object.values(event().flights)[0];

// Sascha: a stroke play round with Cedric, a tournament – the code in the setup
const host = await phone('Sascha');
const H = host.p;
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.locator('input[id^="hcp-"]').first().fill('10');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Cedric');
await H.locator('input[id^="hcp-"]').last().fill('18');
const card = H.locator('.invite-card');
await card.getByRole('switch', { name: /Turnier über mehrere Flights/ }).click();
await card.getByRole('button', { name: 'Code erzeugen' }).click();
await H.waitForTimeout(800);
const code = (await card.locator('.join-code').innerText()).trim();
const ids = flight().players.map((p) => p.id);
ok(ids.length === 2 && flight().markers?.[ids[0]] === ids[1] && flight().markers?.[ids[1]] === ids[0], 'server: Sascha and Cedric mark each other');
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });

// Cedric joins as Cedric
const guest = await phone('Cedric');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
// Sascha lets him in on the hole map; Cedric's name is in the flight – in at once
const ask = H.getByRole('alertdialog', { name: 'Cedric möchte beitreten' });
await ask.waitFor({ timeout: 15000 });
await ask.getByRole('button', { name: 'Zulassen' }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
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
ok(/Sascha Zähler weicht ab: 1A/.test(board) && /Sascha.*Par/.test(board), `leaderboard: "${board}"`);
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
