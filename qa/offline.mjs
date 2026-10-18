// Offline on the course (night run 15./16.10.2026): open the app online and start a round on Hetzenhof, let the
// service worker keep the app and the course, then the network goes off: reload, the round is still there – map,
// distances, caddie, score entry and finishing work without network.
// Usage: node offline.mjs <built app url, e.g. http://localhost:4173/ (vite preview) or the live site>
import { chromium, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'], serviceWorkers: 'allow' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(2000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
// the service worker takes over and fills its cache
await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 }).catch(() => {});
ok(await p.evaluate(() => navigator.serviceWorker?.controller != null), 'service worker controls the page');
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(6000);
// the hole map saves the imagery of the round for offline (hint "Karte offline gespeichert")
const t0 = Date.now();
await p.waitForFunction(() => document.body.innerText.includes('offline gespeichert ✓'), null, { timeout: 240000 }).catch(() => {});
console.log('prefetch', Math.round((Date.now() - t0) / 1000), 's; hint:', (await p.locator('.map-shot').allInnerTexts()).join(' | '));
ok(await p.evaluate(() => JSON.stringify(Object.keys(localStorage)).includes('golfos.offline')), 'map of the round saved for offline');

await ctx.setOffline(true);
await p.reload();
await p.waitForTimeout(5000);
const txt = await p.locator('body').innerText();
ok(/HINTEN|MITTE/.test(txt), 'offline: the hole opens again with its distances');
ok((await p.locator('.map-hole-no').innerText().catch(() => '')).trim() === '1A', 'offline: on hole 1A');
await p.locator('.map-score').first().click();
await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries.me?.[0]?.strokes);
ok(saved === 4, `offline: the score is saved (${saved})`);
await p.getByRole('button', { name: /Caddie zeigen/ }).click().catch(() => {});
ok((await p.locator('.caddie-card').count()) === 1, 'offline: the caddie works');
const tiles = await p.evaluate(() => [...document.querySelectorAll('canvas')].length);
if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
ok(tiles > 0, 'offline: the map is drawn');
ok(errs.filter((e) => !/Failed to fetch|NetworkError|Load failed|weather|open-meteo/i.test(e)).length === 0, `no page errors ${errs.join(' | ')}`);
await ctx.setOffline(false);
console.log(bad ? `${bad} FAILED` : 'all ok');
await b.close();
