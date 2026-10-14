// The Games module (15.10.2026): the module choice at app start, every game form with its player numbers – setup,
// three holes of scores (plus the form's own input), finish and settlement – and the switch back to Rounds.
// Usage: node games.mjs <app url>
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
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
ok((await p.locator('.module-card').count()) === 2, 'app opens on the module choice');
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
ok(gtabs.join('|') === 'Spielen|Spiele|Bilanz|Regeln|Profil', `Games menu: ${gtabs.join(' · ')}`);
await p.reload();
await p.waitForTimeout(800);
ok(await p.getByRole('heading', { name: 'Spiel starten' }).isVisible(), 'a reload stays in Games');

// the catalogue
await p.locator('.tabbar button').filter({ hasText: 'Regeln' }).click();
const forms = await p.locator('.game-form').count();
ok(forms === 11, `catalogue lists ${forms} game forms`);
await p.locator('.game-form-head').filter({ hasText: 'Wolf' }).click();
ok((await p.locator('.game-rules li').count()) >= 3, 'rules of the wolf open');
await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();

const CASES = [
  ['Skins', 3],
  ['Nassau', 2],
  ['Nassau', 4],
  ['Wolf', 4],
  ['Chicago', 2],
  ['Bingo Bango Bongo', 3],
  ['Las Vegas', 4],
  ['Sixes (Round Robin)', 4],
  ['Snake', 2],
  ['Dots (Punktejagd)', 4],
  ['Stableford-Duell', 3],
  ['Lochspiel', 2],
  ['Lochspiel', 4],
];
for (const [form, n] of CASES) {
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${form.replace(/[()]/g, '\\$&')}$`) }) }).click();
  for (let k = 2; k <= n; k++) {
    if (k > 2) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    await p.fill(`.game-player-row:nth-of-type(${k}) input >> nth=0`, `S${k}`).catch(async () => {
      await p.locator('.game-player-row').nth(k - 1).locator('input').first().fill(`S${k}`);
    });
  }
  await p.locator('.game-player-row').nth(1).locator('input').nth(1).fill('12');
  const start = p.getByRole('button', { name: 'Spiel starten' });
  ok(await start.isEnabled(), `${form} with ${n}: start possible`);
  await start.click();
  await p.waitForTimeout(200);
  for (let h = 0; h < 3; h++) {
    // everyone par, the first player one better on the second hole
    await p.getByRole('button', { name: 'Par für alle übrigen' }).click();
    if (h === 1) await p.locator('.game-scores .stepper').first().getByRole('button', { name: 'minus eins' }).click();
    if (form === 'Wolf') await p.locator('.game-extra .chip').first().click();
    if (form === 'Bingo Bango Bongo') for (const row of await p.locator('.game-extra .game-setting').all()) await row.locator('.chip').first().click();
    if (form === 'Snake' && h === 2) await p.locator('.game-extra .chip').nth(1).click();
    if (form.startsWith('Dots')) await p.locator('.game-extra .game-setting').first().locator('.chip').first().click();
    await p.getByRole('button', { name: 'Nächstes Loch ›' }).click();
  }
  const standing = await p.locator('.game-standing').innerText();
  ok(/1\n/.test(standing) || standing.includes('1'), `${form} with ${n}: standing shown`);
  await p.getByRole('button', { name: 'Spiel jetzt beenden' }).click();
  await p.getByRole('button', { name: 'Beenden & abrechnen' }).click();
  await p.waitForTimeout(200);
  const winner = (await p.locator('.game-winner strong').innerText()).trim();
  const pays = await p.locator('.game-pays li').count();
  ok(winner.length > 0 && !winner.includes('?'), `${form} with ${n}: winner ${winner}, ${pays} payment(s)`);
  await p.getByRole('button', { name: 'Spiele' }).click();
  if (form !== CASES[CASES.length - 1][0] || n !== CASES[CASES.length - 1][1]) await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
}
ok((await p.locator('.list-item').count()) === CASES.length, `${CASES.length} games in the list`);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
const bal = await p.locator('main').innerText();
ok(/Spiele/.test(bal) && /Siege/.test(bal) && /S2/.test(bal), 'balance with games, wins and the other players');
await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();

// Chicago for money: gross, press doubles 0,10 € up to the cap (Sascha 15.10.2026)
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.locator('.pick-option').filter({ hasText: 'Chicago' }).click();
await p.getByRole('button', { name: '+ Ben' }).click();
ok((await p.locator('.game-player-row').nth(1).locator('input').nth(1).inputValue()) === '12', 'friend Ben added with one tap, handicap 12');
ok((await p.locator('.game-player-row').count()) === 2, 'the friend took the empty row');
await p.locator('.game-setting').filter({ hasText: 'Vorgabe (WHS)' }).getByRole('button', { name: 'Ohne (brutto)' }).click();
await p.locator('.game-setting').filter({ hasText: 'Press:' }).getByRole('button', { name: 'Ja' }).click();
ok(await p.getByText('Höchsteinsatz nach Press').isVisible(), 'highest stake shows once press is on');
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.getByRole('button', { name: 'Par für alle übrigen' }).click();
await p.locator('.game-scores .stepper').nth(1).getByRole('button', { name: 'plus eins' }).click(); // Ben bogey
await p.getByRole('button', { name: 'Nächstes Loch ›' }).click();
await p.getByRole('button', { name: 'Ben presst (×2)' }).click();
ok((await p.locator('[aria-label="Press"]').innerText()).includes('0,20 €'), 'press doubles the stake to 0,20 €');
ok((await p.locator('.game-standing').innerText()).includes('Brutto, ohne Vorgabe'), 'standing says gross');
await p.getByRole('button', { name: 'Spiele' }).click();

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
const head = await p.locator('.topbar h1').innerText();
ok(/Par \d/.test(head) && /Hcp \d/.test(head), `hole header with course data: ${head.replace(/\s+/g, ' ')}`);

// a running game: the module choice says so; back to Rounds
await p.getByRole('button', { name: 'Spiele' }).click();
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
await p.waitForTimeout(300);
ok(await p.getByRole('button', { name: 'Runde fortsetzen' }).isVisible(), 'Undo brings the round back');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
console.log(bad ? `${bad} FAILED` : 'all ok');
await b.close();
