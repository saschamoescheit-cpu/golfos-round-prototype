// QA: a game on the GPS map (Sascha 16.10.2026) – Chicago for four on Hetzenhof: the round's hole screen (map, hole
// bar, overview), the scores in the round's score sheet, the pairing and team numbers in the game sheet, finish and
// settle like a round.  Usage: SHOTS=<dir> node qa/gamemap.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
// MapLibre loads map tiles through blob: addresses and frees them once drawn – WebKit under test now and then reports
// the freed one ("…localhost:5173/<uuid> due to access control checks"); the tile is on the map, nothing is wrong
p.on('pageerror', (e) => { if (!/localhost:\d+\/[0-9a-f-]{36} due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const shot = async (name) => process.env.SHOTS && (await p.screenshot({ path: `${process.env.SHOTS}/${name}.png` }));
await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ hasText: 'Chicago' }).click();
await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.waitForTimeout(800);
for (const [k, n] of [[1, 'Ben'], [2, 'Chris'], [3, 'Anna']]) {
  if ((await p.locator('.game-player-row').count()) <= k) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click(); // Chicago starts with four rows
  await p.locator('.game-player-row').nth(k).locator('input').first().fill(n);
}
await p.locator('.game-setting').filter({ hasText: 'Vorgabe (WHS)' }).getByRole('button', { name: 'Ohne (brutto)' }).click();
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(6000);
ok((await p.locator('.hole-bar').count()) === 1 && (await p.locator('.maplibregl-canvas').count()) === 1, 'the game opens on the GPS map with the hole bar');
ok((await p.locator('.game-bar').innerText()).includes('Chicago'), `game bar: ${(await p.locator('.game-bar').innerText()).replace(/\s+/g, ' ')}`);
const teamTexts = (await p.locator('.game-bar .game-team').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(teamTexts.length === 2 && /Sascha.*Ben/.test(teamTexts[0]) && /Chris.*Anna/.test(teamTexts[1]), `game bar: two coloured teams on 1A (${teamTexts.join(' | ')})`);
await shot('gamemap-hole');
// hole 1: Sascha 4, Ben 5, Chris 4, Anna 4 – in the round's score sheet
await p.locator('.map-score').click();
await p.waitForTimeout(400);
const blocks = p.locator('.score-player');
ok((await blocks.count()) === 4, `score sheet with ${await blocks.count()} players`);
for (let k = 0; k < 4; k++) await blocks.nth(k).getByRole('button', { name: /Schläge plus eins/ }).click();
await blocks.nth(1).getByRole('button', { name: /Schläge plus eins/ }).click();
await shot('gamemap-score');
await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
await p.waitForTimeout(400);
// the game sheet: pairing and the team numbers of the hole
await p.locator('.game-bar').click();
await p.waitForTimeout(400);
const sheet = await p.locator('.game-sheet').innerText();
ok(/Paarung an diesem Loch/.test(sheet) && /45/.test(sheet) && /44/.test(sheet), 'game sheet: pairing and team numbers (45 vs 44)');
await shot('gamemap-sheet');
await p.locator('.game-sheet').getByRole('button', { name: 'Schließen' }).click();
// the overview: the game's standing instead of the leaderboard, pause and finish as in a round
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
const acts = (await p.locator('.hole-drawer .drawer-action').allInnerTexts()).map((t) => t.trim()).join(' | ');
ok(acts === 'Scorekarte | Pausieren | Beenden', `overview actions as in a round: ${acts}`);
ok(await p.locator('.hole-drawer').getByRole('button', { name: /Chicago · Stand/ }).isVisible(), 'overview: "Chicago · Stand"');
await shot('gamemap-drawer');
await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
await p.waitForTimeout(300);
await shot('gamemap-finish');
ok(await p.getByRole('button', { name: 'Spiel löschen' }).isVisible(), 'finish question says "Spiel löschen"');
await p.getByRole('button', { name: /Speichern & beenden/ }).click();
await p.waitForTimeout(800);
const res = await p.locator('main').innerText();
ok(/Abrechnung/i.test(res) && /Ben → Anna/.test(res), 'result with the settlement');
await shot('gamemap-result');
// the game is in the games list, not among the rounds
await p.getByRole('button', { name: /Spiele/ }).first().click();
await p.waitForTimeout(400);
const rounds = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').length);
ok(rounds === 0, 'no round in Rounds for the game');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
