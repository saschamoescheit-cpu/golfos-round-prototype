// Smoke test of the live site (or any build): version, Hetzenhof round start with the 9-hole hint, the one-time tip,
// height grid and LGL imagery loaded, "→" without a score opens the score sheet and moves on.
// Usage: node live-smoke.mjs <app url>
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'https://saschamoescheit-cpu.github.io/golfos-round-prototype/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const got = {};
p.on('response', (r) => {
  const m = r.url().match(/(terrain|heights)\.json|owsproxy/);
  if (m) got[m[1] ?? 'lgl'] = r.status();
});
await p.goto(url);
await p.waitForTimeout(1500);
// the version stands in the profile tab (since 14.10.2026; before on the start page)
if (await p.locator('.tabbar').count()) await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
console.log('version:', (await p.locator('main').innerText()).match(/Version [^\n]*/)?.[0]);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
});
await p.reload();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.fill('input[id^="hcp-"]', '4').catch(() => {});
console.log('9-hole hint:', await p.getByText(/Spielvorgabe für 9 Löcher/).count());
await p.getByText('Runde starten').click();
await p.waitForTimeout(6000);
console.log('tip shown:', await p.getByText(/Die Schläge findet die App nach der Runde/).count());
console.log('box:', (await p.locator('.map-green').innerText()).replace(/\s+/g, ' '));
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(500);
console.log('→ opens sheet:', await p.locator('.score-sheet').count());
// steppers (Hole19): the first + gives par, putts start at 2
await p.locator('.score-sheet').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
await p.locator('.score-sheet').getByRole('button', { name: 'Putts plus eins', exact: true }).click();
await p.locator('.score-sheet').getByRole('button', { name: /Nächstes Loch/ }).click();
await p.waitForTimeout(800);
console.log('now on:', await p.locator('.map-hole-no').innerText());
console.log('responses:', JSON.stringify(got));
console.log(errs.join(' / ') || 'no page errors');
await b.close();
