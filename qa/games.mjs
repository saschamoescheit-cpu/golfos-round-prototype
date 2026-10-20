// The Games module (15.10.2026): the module choice at app start, every game form with its player numbers – setup,
// three holes of scores (plus the form's own input), finish and settlement – and the switch back to Rounds.
// Usage: node games.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(1500); // let the service worker register first (a reload right away cancels it: a WebKit error)
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
ok((await p.locator('.module-card').count()) === 4, 'app opens on the module choice (Rounds, Games, Training, Mobility)');
// the start page's menu: start, friends, profile (Sascha 15.10.2026)
const tabs = await p.locator('.tabbar button').allInnerTexts();
ok(tabs.join('|') === 'Start|Freunde|Profil', `start page menu: ${tabs.join(' · ')}`);
await p.locator('.tabbar button').filter({ hasText: 'Freunde' }).click();
await p.getByRole('button', { name: '+ Freund hinzufügen' }).click();
await p.locator('.game-player-row input').first().fill('Ben');
await p.locator('.game-player-row input').nth(1).fill('12,4');
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
ok(await p.getByRole('heading', { name: 'Profil' }).isVisible(), 'profile on the start page');
await p.locator('.tabbar button').filter({ hasText: 'Start' }).click();
await p.locator('.module-card').filter({ hasText: 'Games' }).click();
await p.waitForTimeout(300);
ok(await p.getByRole('heading', { name: 'Spiel starten' }).isVisible(), 'Games start page');
const gtabs = await p.locator('.tabbar button').allInnerTexts();
ok(gtabs.join('|') === 'Spielen|Spiele|Bilanz|Profil', `Games menu without "Regeln": ${gtabs.join(' · ')}`);
await p.reload();
await p.waitForTimeout(800);
ok(await p.getByRole('heading', { name: 'Spiel starten' }).isVisible(), 'a reload stays in Games');

// no rules tab any more (Sascha 16.10.2026): the rules are in the setup and in the game sheet


const CASES = [
  ['Skins', 3],
  ['Nassau', 2],
  ['Nassau', 4],
  ['Wolf', 4],
  ['Chicago', 4],
  ['Bingo Bango Bongo', 3],
  ['Las Vegas', 4],
  ['Sixes (Round Robin)', 4],
  ['Snake', 2],
  ['Dots (Punktejagd)', 4],
  ['Stableford-Duell', 3],
  ['Lochspiel', 2],
  ['Lochspiel', 4],
  ['Hammer', 2],
  ['Hammer', 4],
  ['Rabbit', 3],
  ['Acey Deucey', 4],
];
// a game needs a course (Sascha 15.10.2026) – Hetzenhof for every game
const course = async () => {
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(800);
};
// games are played on the GPS map (Sascha 16.10.2026): the scores in the round's score sheet, the form's input in the
// game sheet (the bar over the hole bar), pause and finish in the hole overview
const scores = async (bump = []) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(250);
  const blocks = p.locator('.score-player');
  const nb = await blocks.count();
  for (let k = 0; k < nb; k++) await blocks.nth(k).getByRole('button', { name: /Schläge plus eins/ }).click();
  for (const [k, d] of bump) await blocks.nth(k).getByRole('button', { name: d > 0 ? /Schläge plus eins/ : /Schläge minus eins/ }).click();
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
};
const gameSheet = async (fn) => {
  await p.locator('.game-bar').click();
  await p.waitForTimeout(250);
  const r = await fn(p.locator('.game-sheet'));
  await p.locator('.game-sheet').getByRole('button', { name: 'Schließen' }).click();
  return r;
};
const nextHole = async () => {
  await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(500);
};
const pause = async () => {
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: /pausieren/ }).click();
  await p.waitForTimeout(400);
};
let firstCase = true;
for (const [form, n] of CASES) {
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${form.replace(/[()]/g, '\\$&')}$`) }) }).click();
  for (let k = 2; k <= n; k++) {
    if ((await p.locator('.game-player-row').count()) < k) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    await p.fill(`.game-player-row:nth-of-type(${k}) input >> nth=0`, `S${k}`).catch(async () => {
      await p.locator('.game-player-row').nth(k - 1).locator('input').first().fill(`S${k}`);
    });
  }
  await p.locator('.game-player-row').nth(1).locator('input').nth(1).fill('12');
  if (firstCase) {
    ok(await p.getByRole('button', { name: 'Spiel starten' }).isDisabled(), 'no start without a course');
    ok((await p.getByText('Wähle zuerst den Platz').count()) === 0, 'no green hint – the course stands first');
    const order = await p.locator('main .eyebrow').allInnerTexts();
    ok(order[0] === 'PLATZ' || /^Platz$/i.test(order[0]), `the course above the game form (${order.slice(0, 2).join(' · ')})`);
    const rules = await p.locator('main .card').filter({ has: p.locator('.game-rules') }).first().evaluate((c) => [...c.children].map((x) => x.className));
    ok(/read-rules/.test(rules[0]) && /game-rules/.test(rules[1]), 'the speaker before the rules');
    firstCase = false;
  }
  await course();
  const start = p.getByRole('button', { name: 'Spiel starten' });
  ok(await start.isEnabled(), `${form} with ${n}: start possible`);
  await start.click();
  await p.waitForTimeout(4500);
  for (let h = 0; h < 3; h++) {
    // everyone par, the first player one better on the second hole
    await scores(h === 1 ? [[0, -1]] : []);
    const extras = form === 'Wolf' || form === 'Bingo Bango Bongo' || (form === 'Snake' && h === 2) || (form === 'Hammer' && h === 1) || form.startsWith('Dots');
    if (extras)
      await gameSheet(async (g) => {
        if (form === 'Wolf') await g.locator('.game-extra .chip').first().click();
        if (form === 'Bingo Bango Bongo') for (const row of await g.locator('.game-extra .game-setting').all()) await row.locator('.chip').first().click();
        if (form === 'Snake') await g.locator('.game-extra .chip').nth(1).click();
        if (form === 'Hammer') await g.locator('[aria-label="Hammer"] .chip').first().click();
        if (form.startsWith('Dots')) await g.locator('.game-extra .game-setting').first().locator('.chip').first().click();
      });
    await nextHole();
  }
  const standing = await gameSheet((g) => g.locator('.game-standing').innerText());
  ok(/1\n/.test(standing) || standing.includes('1'), `${form} with ${n}: standing shown`);
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
  await p.getByRole('button', { name: /Speichern & beenden/ }).click();
  await p.waitForTimeout(200);
  const winner = (await p.locator('.game-winner strong').innerText()).trim();
  const pays = await p.locator('.game-pays li').count();
  ok(winner.length > 0 && !winner.includes('?'), `${form} with ${n}: winner ${winner}, ${pays} payment(s)`);
  await p.getByRole('button', { name: 'Spiele' }).click();
  if (form !== CASES[CASES.length - 1][0] || n !== CASES[CASES.length - 1][1]) await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
}
ok((await p.locator('.list-item').count()) === CASES.length, `${CASES.length} games in the list`);
// the result: share it, read the standing aloud (Sascha 15.10.2026)
await p.locator('.list-item').first().click();
ok(await p.getByRole('button', { name: 'Ergebnis teilen' }).isVisible() && (await p.getByRole('button', { name: 'Zwischenstand vorlesen' }).count()) === 1, 'result: share and read aloud');
const said = await p.evaluate(async () => {
  const G = await import('/src/screens/Games.tsx');
  const S = await import('/src/lib/gamestore.ts');
  const g = S.loadGames()[0];
  return [G.standingText(g, true), G.standingText(g, false)];
});
ok(/^Ergebnis nach 3 Löchern\. 1\. /.test(said[0]) && said[1].split('\n').length >= 3, `standing in words: "${said[0].slice(0, 70)}…"`);
await p.locator('.topbar').getByRole('button', { name: /Spiele/ }).first().click(); // back from the result
// delete as a round: one tap, "Undo", the bin (Sascha 15.10.2026)
await p.locator('.list-item').first().click();
await p.getByRole('button', { name: 'Spiel löschen' }).click();
ok(await p.getByText('Spiel gelöscht').isVisible(), 'game deleted – "Undo" offered');
await p.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(300);
await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
ok((await p.locator('.list-item').count()) === CASES.length, 'Undo brings the game back');
await p.locator('.list-item').first().click();
await p.getByRole('button', { name: 'Spiel löschen' }).click();
await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
ok((await p.locator('.tile').filter({ hasText: 'gelöscht' }).innerText()).replace(/\s+/g, ' ').trim() === '1 gelöscht', 'games list: tile "1 gelöscht" as in Rounds');
await p.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await p.getByRole('button', { name: 'Wiederherstellen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.list-item').count()) === CASES.length && (await p.locator('.tile').filter({ hasText: 'gelöscht' }).count()) === 0, 'restored from the bin');
// only confirmed games count in the balance (Sascha 16.10.2026, as signed rounds)
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(300);
ok((await p.getByText(/noch nicht bestätigt/).count()) === 1, 'balance: the unconfirmed games are named');
await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
await p.waitForTimeout(300);
// as "sign your rounds" in Rounds (Sascha 17.10.2026): a card with the count under "new game", it opens the list filtered
const confirmCard = p.getByRole('button', { name: /Ergebnisse bestätigen/ });
const nConfirm = Number((await confirmCard.locator('.count-badge').innerText()).trim());
ok(nConfirm > 0, `start page: "Ergebnisse bestätigen · ${nConfirm}"`);
await confirmCard.click();
await p.waitForTimeout(400);
ok((await p.locator('ul.list .list-item').count()) === nConfirm && (await p.locator('button.tile').filter({ hasText: 'zu bestätigen' }).getAttribute('aria-pressed')) === 'true', 'it opens the games list filtered to the ones to confirm');
ok((await p.locator('ul.list .signed-mark[aria-label="zu bestätigen"]').count()) === nConfirm && (await p.locator('.tile .tile-mark svg').count()) >= 2, 'the same marks as in the rounds list, on the tiles too');
ok((await p.locator('ul.list .round-date').count()) === nConfirm, 'rows with the date block as in the rounds list');
await p.locator('.list-item').first().click();
await p.waitForTimeout(500);
// as on a round's scorecard: to confirm it follows the result and the scores, confirmed it stands on top
const order = () => p.evaluate(() => [...document.querySelectorAll('.game-winner, .sign-card, .game-grid-card')].map((e) => e.classList.contains('sign-card') ? 'sign' : e.classList.contains('game-winner') ? 'winner' : 'grid').join(' '));
const before = await order();
ok(before === 'winner grid sign', `result: "Ergebnis bestätigen" follows the scores (${before})`);
await p.locator('.sign-card').getByRole('button', { name: 'Bestätigen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.sign-card').innerText()).includes('Ergebnis bestätigt'), 'result: "Ergebnis bestätigen" confirms it');
const after = await order();
ok(after === 'sign winner grid', `confirmed: the seal stands on top as on a round (${after})`);
await p.evaluate(() => {
  const gs = JSON.parse(localStorage.getItem('golfos.games.v1'));
  localStorage.setItem('golfos.games.v1', JSON.stringify(gs.map((g) => (g.finishedAt ? { ...g, signedAt: g.signedAt ?? new Date().toISOString() } : g))));
});
await p.reload();
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(300);
const bal = await p.locator('main').innerText();
ok(/Spiele/.test(bal) && /Siege/.test(bal) && /S2/.test(bal) && /\d+× vorne · \d+× hinten/.test(bal), 'balance with games, wins, the other players and head to head');
await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();

// Chicago for money: gross, press doubles 0,10 € up to the cap (Sascha 15.10.2026)
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ hasText: 'Chicago' }).click();
await p.getByRole('button', { name: '+ Ben' }).click();
// Chicago needs four: four rows from the start (Sascha 17.10.2026)
ok((await p.locator('.game-player-row').count()) === 4 && (await p.getByRole('button', { name: '+ Spieler hinzufügen' }).count()) === 0, 'Chicago: four player rows straight away');
// the house rules in one row of switches, all on (Sascha 20.10.2026: Eagle −10, "summarise them sensibly")
{
  const house = p.locator('.game-setting').filter({ hasText: 'Hausregeln' });
  const chips = await house.locator('.chip').allInnerTexts();
  const on = await house.locator('.chip.on').count();
  ok((await house.count()) === 1 && chips.join('|') === 'Höchstens 9|Birdie −5|Eagle −10' && on === 3, `Chicago: house rules in one row, all on (${chips.join(' · ')})`);
  await house.getByRole('button', { name: 'Eagle −10' }).click();
  ok((await house.locator('.chip.on').count()) === 2, 'a tap switches a house rule off');
  await house.getByRole('button', { name: 'Eagle −10' }).click();
}
await p.locator('.game-player-row').nth(2).locator('input').first().fill('Chris');
await p.locator('.game-player-row').nth(3).locator('input').first().fill('Anna');
ok((await p.locator('.game-player-row').nth(1).locator('input').nth(1).inputValue()) === '12', 'friend Ben added with one tap, handicap 12');
ok((await p.locator('.game-player-row').count()) === 4, 'the friend took the empty row (then two more players)');
await course();
await p.locator('.game-setting').filter({ hasText: 'Vorgabe (WHS)' }).getByRole('button', { name: 'Ohne (brutto)' }).click();
ok((await p.locator('.game-setting').filter({ hasText: 'Press:' }).locator('.chip.on').innerText()) === 'Ja', 'Chicago: press is on by default');
// the highest stake: the doubling chain of 0,10 € up to 6,40 €, higher steps typed in and checked (Sascha 15.10.2026)
const cap = p.locator('.game-setting').filter({ hasText: 'Höchsteinsatz' });
const capChips = (await cap.locator('.chip').allInnerTexts()).join('|');
ok(capChips === '0,20 €|0,40 €|0,80 €|1,60 €|3,20 €|6,40 €|höher …|ohne Limit', `cap chips, "ohne Limit" last: ${capChips}`);
await cap.getByRole('button', { name: 'höher …' }).click();
await cap.locator('input').fill('10');
await cap.getByRole('button', { name: 'Übernehmen' }).click();
ok((await cap.getByRole('alert').innerText()).includes('Nur Verdopplungen von 0,10 €'), '10 € is refused');
await cap.locator('input').fill('12,20');
await cap.getByRole('button', { name: 'Übernehmen' }).click();
ok(await cap.getByRole('alert').isVisible(), '12,20 € is refused');
await cap.locator('input').fill('12,80');
await cap.getByRole('button', { name: 'Übernehmen' }).click();
ok((await cap.locator('.chip.on').innerText()) === '12,80 €' && (await cap.innerText()).includes('7× verdoppelt'), '12,80 € taken (7 doublings)');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/games-cap.png', fullPage: true });
await cap.getByRole('button', { name: '1,60 €' }).click();
const presses = p.locator('.game-setting').filter({ hasText: 'Erlaubte Pressen' });
ok((await presses.locator('.chip.on').innerText()) === '4×', 'highest stake 1,60 € = 4× pressing');
await presses.getByRole('button', { name: '2×' }).click();
ok((await cap.locator('.chip.on').innerText()) === '0,40 €', '2× pressing = highest stake 0,40 €');
await cap.getByRole('button', { name: '1,60 €' }).click();
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(4500);
await scores([[1, 1]]); // Ben bogey
// the team numbers of the hole (Sascha 15.10.2026): Ich & Ben 4 and 5 = 45, Chris & Anna 4 and 4 = 44 → 1
const team = await gameSheet(async (g) => {
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/games-play.png' });
  return (await g.locator('.chicago-result').innerText()).replace(/\s+/g, ' ');
});
ok(/45 −1/.test(team) && /44 \+1/.test(team) && team.includes('45 − 44 = 1'), `Chicago hole result: ${team}`);
await nextHole();
await gameSheet(async (g) => {
  await g.getByRole('button', { name: 'Ben presst (×2)' }).click();
  ok((await g.locator('[aria-label="Press"]').innerText()).includes('0,20 €'), 'press doubles the stake to 0,20 €');
  ok((await g.locator('.game-standing').innerText()).includes('Brutto, ohne Vorgabe'), 'standing says gross');
});
await pause();

// too few players: no start
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ hasText: 'Las Vegas' }).click();
ok(await p.getByRole('button', { name: 'Spiel starten' }).isDisabled(), 'Las Vegas with 2 players cannot start');

// with a course: Hetzenhof, the par and the stroke index on the hole
await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2500);
await p.locator('button.list-item').first().click();
await p.waitForTimeout(1500);
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Skins$/ }) }).click();
await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(4500);
const head = (await p.locator('.hole-bar').innerText()).replace(/\s+/g, ' ');
ok(/Par 4/.test(head) && /Hcp 11/.test(head) && (await p.locator('.maplibregl-canvas').count()) === 1, `on the map, hole bar with course data: ${head}`);
await p.locator('.hole-bar-handle').click();
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/games-drawer.png' });
ok((await p.locator('.hole-drawer .drawer-hole').count()) === 18 && (await p.locator('.hole-drawer').getByRole('button', { name: 'Pausieren' }).isVisible()), 'hole overview with 18 holes and pause');
await p.locator('.hole-drawer .drawer-handle').click();

// a running game: the module choice says so; back to Rounds
await pause();
await p.locator('.module-switch').click();
ok(await p.getByText('Ein Spiel läuft').isVisible(), 'module choice shows the running game');
await p.locator('.module-card').filter({ hasText: 'Rounds' }).click();
ok(await p.getByRole('button', { name: 'Neue Runde' }).isVisible(), 'Rounds start page');

// one tap deletes a round – "Undo" brings it back (Sascha 15.10.2026)
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
await p.locator('.hole-bar-handle').click();
await p.locator('.hole-drawer').getByRole('button', { name: 'Runde beenden' }).click();
await p.getByRole('button', { name: 'Runde löschen' }).click();
await p.waitForTimeout(500);
ok(await p.locator('.undo-toast').isVisible(), 'delete: "Round deleted · Undo" shows, no second question');
ok(!(await p.getByRole('button', { name: 'Runde fortsetzen' }).count()), 'the round is gone');
await p.locator('.undo-toast button').click();
await p.waitForTimeout(1000);
ok(await p.getByRole('button', { name: 'Runde fortsetzen' }).isVisible(), 'Undo brings the round back');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
console.log(bad ? `${bad} FAILED` : 'all ok');
await b.close();
