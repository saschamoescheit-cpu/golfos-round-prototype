// Screenshots of every Games screen (Sascha 25.10.2026: Games against everything said about Rounds) – start page, new
// game with the form picker, players and settings, the map with the game bar and each form's input, the drawer, the
// result, the games list with its tiles, the bin, the balance, the profile – on the iPhone SE in dark and sun mode.
// Not a test: pictures to look at. Usage: node qa/gamesweep.mjs <url> <out dir>
import { webkit, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'gamesweep';
mkdirSync(out, { recursive: true });
const b = await webkit.launch();
const errs = [];
for (const sun of [false, true]) {
  const mode = sun ? 'sun' : 'dark';
  const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/due to access control/.test(e.message)) errs.push(`${mode}: ${e.message}`); });
  let n = 0;
  const shot = async (name, full = false) => {
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/${mode}-${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
  };
  await p.goto(url);
  await p.waitForTimeout(1000);
  await p.evaluate((sun) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ name: 'Sascha', hcp: '15,4' }));
    if (sun) localStorage.setItem('golfos.sun.v1', '1');
    sessionStorage.setItem('golfos.module', 'games');
  }, sun);
  await p.reload();
  await p.waitForTimeout(1200);
  await shot('start-leer');
  await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
  await shot('spiele-leer');
  await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
  await shot('bilanz-leer');
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();

  // a Wolf game with four, played three holes
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await shot('neu-oben');
  await shot('neu-ganz', true);
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await shot('formwahl');
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Chicago$/ }) }).click();
  await shot('chicago-ganz', true);
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Wolf$/ }) }).click();
  for (let k = 0; k < 4; k++) {
    if ((await p.locator('.game-player-row').count()) <= k) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    const row = p.locator('.game-player-row').nth(k);
    if (k > 0) await row.locator('input').first().fill(['', 'Ben', 'Chris', 'Thomas'][k]);
    await row.locator('input').nth(1).fill(String([15, 8, 22, 4][k]));
  }
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.waitForTimeout(800);
  await shot('wolf-ganz', true);
  await p.getByRole('button', { name: 'Spiel starten' }).click();
  await p.waitForTimeout(4000);
  await shot('karte-start');
  if (await p.getByRole('button', { name: 'Zurück zur Karte' }).isVisible().catch(() => false)) {
    await shot('score-offen');
    await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  }
  await p.locator('.map-score').click();
  for (const blk of await p.locator('.score-player').all()) await blk.getByRole('button', { name: /Schläge plus eins/ }).click();
  await shot('score-eingetragen');
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.locator('.game-bar').click();
  await shot('spielblatt');
  await shot('spielblatt-ganz', true);
  await p.locator('.game-sheet .game-extra .chip').first().click();
  await shot('spielblatt-partner');
  await p.locator('.game-sheet').getByRole('button', { name: 'Schließen' }).click();
  await shot('karte-mit-team');
  await p.locator('.hole-bar-handle').click();
  await shot('schublade');
  await p.locator('.hole-drawer').getByRole('button', { name: /pausieren/ }).click();
  await p.waitForTimeout(500);
  await shot('start-mit-laufendem');
  await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
  await shot('spiele-laufend');
  await p.locator('.list-item').first().click();
  await p.waitForTimeout(3000);
  if (await p.getByRole('button', { name: 'Zurück zur Karte' }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
  await shot('beenden-dialog');
  await p.getByRole('button', { name: /Speichern & beenden/ }).click();
  await p.waitForTimeout(600);
  await shot('ergebnis');
  await shot('ergebnis-ganz', true);
  await p.getByRole('button', { name: 'Spiele' }).first().click();
  await p.waitForTimeout(400);
  await shot('spiele-ein-spiel');
  await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
  await shot('bilanz');
  await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
  await shot('profil');
  await shot('profil-ganz', true);
  await ctx.close();
}
await b.close();
console.log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors');
