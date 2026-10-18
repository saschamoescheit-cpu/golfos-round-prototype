// Training without network (night run 16./17.10.2026): open the built app online once, let the service worker keep it,
// then the network goes off – Training still opens: topics, drill with sketch, a result is saved, a plan starts as a
// session and the drill bar works; videos and product pictures show their stand-ins instead of breaking.
// Usage: node training-offline.mjs <built app url, e.g. http://localhost:4177/ (vite preview) or the live site>
import { chromium, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:4177/';
const b = await chromium.launch({ channel: 'msedge' });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', serviceWorkers: 'allow' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// WebKit reports an aborted cross-origin load (the weather of the home screen, open-meteo) as a page error on
// navigation – the app catches it; not an error of the page
p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message) && errs.push(e.message));
let bad = 0;
const ok = (c, what) => {
  if (!c) bad++;
  console.log(`${c ? '✓' : '✗'} ${what}`);
};
const back = () => p.locator('.topbar .icon-btn').first().click();

await p.goto(url);
await p.waitForTimeout(2000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
});
await p.reload();
await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30000 }).catch(() => {});
ok(await p.evaluate(() => navigator.serviceWorker?.controller != null), 'service worker controls the page');
// wait until the precache is complete (the Training chunk is part of it)
await p.waitForFunction(async () => (await caches.keys()).length > 0 && (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, n) => a + n, 0) > 10, null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1500);

await ctx.setOffline(true);
await p.reload();
await p.waitForTimeout(1500);
ok((await p.locator('.module-card').count()) === 4, 'offline: the start page opens');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.locator('.tr-cat').first().waitFor({ timeout: 20000 }).catch(() => {});
ok((await p.locator('.tr-cat').count()) >= 17, 'offline: Training opens with all topics');
await p.locator('.tr-cat').filter({ has: p.locator('strong', { hasText: /^Putten$/ }) }).first().click();
ok((await p.locator('.tr-drill-row').count()) >= 10, 'offline: the putting drills are there');
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Leiter-Übung' }).first().click();
await p.waitForTimeout(300);
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'offline: the drill shows its sketch');
ok(await p.locator('.tr-metronome').isVisible(), 'offline: the metronome is there');
await p.getByRole('tab', { name: 'Ergebnis' }).click();
for (let i = 0; i < 6; i++) await p.locator('.tr-result button').nth(1).click();
await p.getByRole('button', { name: 'Ergebnis speichern' }).click();
ok(await p.getByRole('button', { name: 'Gespeichert ✓' }).isVisible(), 'offline: a result is saved');
await p.waitForTimeout(1500);
await p.getByRole('tab', { name: 'Videos' }).click().catch(() => {});
const thumbs = await p.locator('.tr-video-thumb img').count();
ok(thumbs === 0 || (await p.locator('.tr-video-cover').count()) > 0, 'offline: videos show their card without breaking');
await back();
await back();
await p.locator('.tabbar button').filter({ hasText: 'Üben' }).click();
await p.locator('.list-item').filter({ hasText: 'Putten 30 Min: Länge' }).click();
await p.getByRole('button', { name: 'Einheit starten' }).click();
await p.waitForTimeout(500);
ok(await p.locator('.tr-now').isVisible(), 'offline: a session starts');
await p.locator('.hole-bar-arrow').last().click();
await p.getByRole('button', { name: 'Überspringen – nächste Übung' }).click();
ok((await p.locator('.map-hole-no').innerText()) === '2', 'offline: the drill bar goes to the next drill');
await ctx.setOffline(false);
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} failed` : 'all good');
process.exit(bad ? 1 : 0);
