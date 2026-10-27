// Games like Rounds (Sascha 25.10.2026: "Games unter Berücksichtigung aller Änderungen zu Rounds"): a paused game as
// "Laufendes Spiel" on the start page – continue, finish (asked first) and cancel (asked first, into the bin) as the
// round in progress; the games list with the six tiles of the rounds list in the same order, "pausiert" and "Löcher"
// always there; a paused game's row with its delete button; a finished game's row in one line; the module choice with
// the results to confirm. Usage: node qa/gamestart.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1000);
const tab = (name) => p.locator('.tabbar').getByRole('button', { name: new RegExp('(^|\\s)' + name + '$') }).click();
const closeScores = async () => {
  if (await p.getByRole('button', { name: 'Zurück zur Karte' }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
};
const newGame = async (form) => {
  await tab('Spielen');
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${form}$`) }) }).click();
  await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Spiel starten' }).click();
  await p.locator('.map-score').waitFor({ state: 'attached', timeout: 30000 });
  await p.waitForTimeout(1500);
  await closeScores();
};
const playHole = async () => {
  await p.locator('.map-score').click();
  for (const blk of await p.locator('.score-player').all()) await blk.getByRole('button', { name: /Schläge plus eins/ }).click();
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(400);
  await closeScores();
};
const pause = async () => {
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: /pausieren/ }).click();
  await p.waitForTimeout(500);
};

// 1 · the tiles of an empty list: the six of the rounds list, in its order, at 0
await tab('Spiele');
const labels = (await p.locator('.tile-row .tile .muted').allInnerTexts()).map((s) => s.trim());
ok(labels.join('|') === 'zu bestätigen|pausiert|gespielt|bestätigt|Löcher|gelöscht', `six tiles as on the rounds list: ${labels.join(' · ')}`);
const top = await p.locator('.tile-row .tile').evaluateAll((ts) => ts.map((t) => Math.round(t.getBoundingClientRect().top)));
ok(new Set(top).size === 2 && top.filter((y) => y === top[0]).length === 3, 'three by two, as on the rounds list');

// 1b · course rating and slope in the game setup as in the round setup: shown, typed, the playing handicaps follow
await tab('Spielen');
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.game-player-row').first().locator('input').nth(1).fill('15,4');
await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
await p.waitForTimeout(800);
const rline = () => p.locator('.rating-line').innerText().then((s) => s.replace(/\s+/g, ' ')).catch(() => '');
ok(/Course Rating \d+,\d · Slope \d+/.test(await rline()), `game setup: course rating and slope as in Rounds (${await rline()})`);
const vg = () => p.locator('.game-player-row').first().innerText().then((s) => s.replace(/\s+/g, ' '));
const before = await vg();
await p.locator('.rating-line').click();
await p.fill('#setup-cr', '74,0');
await p.fill('#setup-slope', '145');
await p.getByRole('button', { name: 'Speichern' }).click();
await p.waitForTimeout(300);
ok(/Course Rating 74,0 · Slope 145/.test(await rline()) && (await vg()) !== before, `game setup: own values saved, the playing handicap follows (${before} → ${await vg()})`);
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(400);

// 2 · a game, two holes, paused: the card on the start page
await newGame('Skins');
await playHole();
await playHole();
await pause();
await tab('Spielen');
const card = p.getByRole('region', { name: 'Laufendes Spiel' });
ok((await card.count()) === 1, 'start page: "Laufendes Spiel" as "Laufende Runde" on Rounds');
const ctext = (await card.innerText()).replace(/\s+/g, ' ');
ok(/Skins/.test(ctext) && /Golfclub Hetzenhof/.test(ctext) && /Loch 3A · 3 von 18/.test(ctext) && /begonnen/.test(ctext), `card: form, course, hole, start (${ctext.slice(0, 90)})`);
const btns = (await card.getByRole('button').allInnerTexts()).map((s) => s.trim());
ok(btns.join('|') === 'Spiel fortsetzen|Spiel beenden|Spiel abbrechen', `buttons as on Rounds: ${btns.join(' · ')}`);
ok((await card.getByRole('button', { name: 'Spiel fortsetzen' }).getAttribute('class')).includes('btn-primary'), '"Spiel fortsetzen" is the main button');
ok((await p.getByRole('button', { name: 'Neues Spiel' }).getAttribute('class')).includes('btn-secondary'), '"Neues Spiel" second while a game waits');
await card.getByRole('button', { name: 'Spiel fortsetzen' }).click();
await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
await p.waitForTimeout(800);
await closeScores();
ok((await p.locator('.map-hole-no').innerText()).trim().startsWith('3A'), 'continue: back on hole 3A');
await pause();

// 3 · the list: the paused row with its delete button, one line
await tab('Spiele');
const prow = p.locator('.paused-row').first();
ok((await prow.count()) === 1 && (await prow.getByRole('button', { name: /Pausiertes Spiel .* löschen/ }).count()) === 1, 'list: the paused game with a delete button, as a paused round');
ok(/Pausiert · Loch 3A/.test(await prow.innerText()), 'list: "Pausiert · Loch 3A"');
ok((await p.locator('.tile').filter({ hasText: 'pausiert' }).locator('.tile-num').innerText()).trim() === '1', 'tile "pausiert": 1');

// 4 · finish from the start page: asked first, then the result
await tab('Spielen');
await card.getByRole('button', { name: 'Spiel beenden' }).click();
ok(/Jetzt beenden\? 2 von 18 Löchern/.test(await card.innerText()), 'finish: asked first ("Jetzt beenden? 2 von 18 Löchern …")');
await card.getByRole('button', { name: 'Beenden & abrechnen' }).click();
await p.waitForTimeout(600);
ok((await p.locator('.game-winner').count()) === 1, 'finish: the result');
await p.getByRole('button', { name: 'Spiele' }).first().click();
await p.waitForTimeout(400);
const frow = p.locator('ul.list .list-item').first();
const lines = await frow.evaluate((el) => [...el.querySelectorAll('.grow > span, .game-row-result > *')].map((x) => Math.round(x.getBoundingClientRect().height)));
ok(lines.every((h) => h <= 26), `list: a finished game's row – every line one line high (${lines.join(', ')} px)`);
ok((await p.locator('.tile').filter({ hasText: 'Löcher' }).locator('.tile-num').innerText()).trim() === '2', 'tile "Löcher": the 2 holes played');

// 5 · the module choice: one result to confirm, with the dot
await p.locator('.module-switch').click();
const gcard = p.locator('.module-card').filter({ hasText: 'Games' });
ok((await gcard.getByText('1 Ergebnis bestätigen').count()) === 1 && (await gcard.locator('.module-dot').count()) === 1, 'module choice: "1 Ergebnis bestätigen" with the dot, as on Rounds');
await gcard.click();
await p.waitForTimeout(600);

// 6 · cancel from the start page: asked first, into the bin
await newGame('Skins');
await playHole();
await pause();
await tab('Spielen');
await card.getByRole('button', { name: 'Spiel abbrechen' }).click();
ok(/Spiel abbrechen und löschen\?/.test(await card.innerText()), 'cancel: asked first');
await card.getByRole('button', { name: 'Spiel löschen' }).click();
await p.waitForTimeout(400);
ok((await card.count()) === 0 && (await p.getByText('Spiel gelöscht').count()) === 1, 'cancel: gone, "Spiel gelöscht · Rückgängig"');
await tab('Spiele');
ok((await p.locator('.tile').filter({ hasText: 'gelöscht' }).locator('.tile-num').innerText()).trim() === '1', 'in the bin');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all ok');
process.exit(bad ? 1 : 0);
