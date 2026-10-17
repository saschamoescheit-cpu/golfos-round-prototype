import { webkit, devices } from 'playwright';
const [url, out, test] = process.argv.slice(2);
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
// MapLibre loads map tiles through blob: addresses and frees them once drawn – WebKit under test now and then reports
// the freed one ("…localhost:5173/<uuid> due to access control checks"); the tile is on the map, nothing is wrong
p.on('pageerror', (e) => { if (!/localhost:\d+\/[0-9a-f-]{36} due to access control/.test(e.message)) errs.push(e.message); });
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.lang.v1', 'de'); });
await p.reload();
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-test-row').filter({ hasText: test }).first().click();
await p.locator('.mob-3d canvas').waitFor({ timeout: 30000 });
await p.waitForTimeout(3500);
await p.screenshot({ path: out });
console.log('errors:', errs.join(' | ') || 'none', 'step:', await p.locator('.mob-3d-step').textContent().catch(() => '-'));
await b.close();
