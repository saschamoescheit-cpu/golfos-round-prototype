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
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
ok((await p.locator('.module-card').count()) === 2, 'app opens on the module choice');
await p.locator('.module-card').filter({ hasText: 'Games' }).click();
await p.waitForTimeout(300);
ok(await p.getByRole('heading', { name: 'Spiele' }).isVisible(), 'Games start page');
await p.reload();
await p.waitForTimeout(800);
ok(await p.getByRole('heading', { name: 'Spiele' }).isVisible(), 'a reload stays in Games');

// the catalogue
await p.getByRole('button', { name: 'Alle Spielformen & Regeln' }).click();
const forms = await p.locator('.game-form').count();
ok(forms === 11, `catalogue lists ${forms} game forms`);
await p.locator('.game-form-head').filter({ hasText: 'Wolf' }).click();
ok((await p.locator('.game-rules li').count()) >= 3, 'rules of the wolf open');
await p.getByRole('button', { name: 'Zurück' }).click();

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
}
ok((await p.locator('.list-item').count()) === CASES.length, `${CASES.length} games in the list`);

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
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
console.log(bad ? `${bad} FAILED` : 'all ok');
await b.close();
