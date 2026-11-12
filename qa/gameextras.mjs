// QA (Sascha 08.11.2026: "in Games the game's details are not in the score entry – integrate them there"): a game on the
// map – what its form needs on the hole (here Bingo Bango Bongo) is in the score entry, below the scores; set there, the
// game has it (the game's sheet shows the same).
// Usage: node qa/gameextras.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
import { pickPrize } from './prize.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message) && !/sw\.js load failed/.test(e.message)) errs.push(e.message); });
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.setItem('golfos.module', 'games'); localStorage.setItem('golfos.tip.shots.v1', '1'); });
await p.reload();
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.waitForTimeout(500);
await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await p.waitForTimeout(300);
await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Bingo Bango Bongo$/ }) }).click();
if ((await p.locator('.game-player-row').count()) < 2) await p.getByRole('button', { name: 'Spieler hinzufügen' }).click();
await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.waitForTimeout(800);
await pickPrize(p);
await p.getByRole('button', { name: 'Spiel starten' }).click();
await p.waitForTimeout(4000);

// the score entry of the hole
await p.getByRole('button', { name: /antippen zum Eintragen/ }).first().click();
await p.waitForTimeout(600);
const panel = p.getByRole('dialog', { name: 'Score an diesem Loch' });
const extras = panel.getByRole('group', { name: 'Das Spiel an diesem Loch' });
ok((await extras.count()) === 1, 'the score entry: "Das Spiel an diesem Loch" below the scores');
const t = (await extras.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Bingo/.test(t) && /Bango/.test(t) && /Bongo/.test(t) && /Ben/.test(t), `Bingo, Bango, Bongo with the players (${t.slice(0, 120)})`);
// Bingo to Ben – there
await extras.locator('.game-setting').filter({ hasText: 'Bingo' }).getByRole('button', { name: 'Ben' }).click();
await p.waitForTimeout(400);
ok((await extras.locator('.game-setting').filter({ hasText: 'Bingo' }).getByRole('button', { name: 'Ben' }).getAttribute('aria-pressed')) === 'true', 'Bingo to Ben in the score entry');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/gameextras.png', fullPage: true });
await panel.getByRole('button', { name: 'Zurück zur Karte' }).click();
await p.waitForTimeout(400);
// the game's sheet says the same
await p.locator('.game-bar').click();
await p.waitForTimeout(500);
const sheet = p.locator('.game-sheet');
ok((await sheet.locator('.game-setting').filter({ hasText: 'Bingo' }).getByRole('button', { name: 'Ben' }).getAttribute('aria-pressed')) === 'true', 'the game\'s sheet: Bingo to Ben there too');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
