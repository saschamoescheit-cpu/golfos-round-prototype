// QA (night run 22./23.10.2026, Games like Rounds): a game on the map – its bar above the hole bar never covers the
// map's tools (the last one, "2D", sat under the bar on an iPhone SE), and the tools stay under the green's distances.
// Usage: node qa/gamebar.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const b = await webkit.launch();
for (const dev of ['iPhone SE', 'iPhone 13']) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'de-DE', colorScheme: 'dark', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.setItem('golfos.module', 'games'); localStorage.setItem('golfos.tip.shots.v1', '1'); });
  await p.reload(); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Neues Spiel' }).click(); await p.waitForTimeout(500);
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click(); await p.waitForTimeout(300);
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: /^Skins$/ }) }).click();
  if ((await p.locator('.game-player-row').count()) < 2) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof'); await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Spiel starten' }).click(); await p.waitForTimeout(4000);
  const tb = await p.locator('.map-toolbar').boundingBox();
  const gb = await p.locator('.game-bar').boundingBox();
  const green = await p.locator('.map-green').first().boundingBox();
  const good = tb.y + tb.height <= gb.y && tb.y >= green.y + green.height;
  if (!good) fails++;
  console.log(`${good ? '✓' : '✗'} ${dev}: the tools (${Math.round(tb.y)}–${Math.round(tb.y + tb.height)}) between the green's distances (${Math.round(green.y + green.height)}) and the game bar (${Math.round(gb.y)})`);
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
