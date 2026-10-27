// Gut Frielinghausen (Sprockhövel, NRW – Sascha 18.10.2026: "no green slopes, no weather there"): the green charts from
// the NRW terrain model are on every hole, and when Open-Meteo refuses (429, its free quota used up) the weather comes
// from the German weather service (Bright Sky, DWD) – both answered here, nothing on the real services.
// Usage: node qa/weatherdwd.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 51.3147, longitude: 7.2359, accuracy: 5 }, permissions: ['geolocation'] });
let dwd = 0;
await ctx.route(/api\.open-meteo\.com\//, (r) => r.fulfill({ status: 429, json: { error: true, reason: 'Daily API request limit exceeded' } }));
await ctx.route(/api\.brightsky\.dev\/current_weather/, (r) => {
  dwd++;
  return r.fulfill({ json: { weather: { timestamp: '2026-10-19T08:30:00+00:00', temperature: 9.4, wind_speed_10: 17.3, wind_gust_speed_10: 31.0, wind_direction_10: 240, condition: 'dry', cloud_cover: 40 } } });
});
await ctx.route(/api\.brightsky\.dev\/weather/, (r) => r.fulfill({ json: { weather: [0, 1, 2, 3, 4].map((k) => ({ timestamp: `2026-10-19T1${k}:00:00+02:00`, precipitation_probability: k === 2 ? 70 : 10, wind_gust_speed: 30 })) } }));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|api\.brightsky\.dev|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };

await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Frielinghausen');
await p.locator('button.list-item').filter({ hasText: 'Frielinghausen' }).first().waitFor({ timeout: 30000 });
await p.locator('button.list-item').filter({ hasText: 'Frielinghausen' }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
await p.waitForTimeout(3000);
const w = (await p.locator('.map-weather').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
ok(dwd > 0 && /9°/.test(w) && /17 km\/h/.test(w), `Open-Meteo refuses: the weather from the DWD (${w || 'none'})`);
const slope = p.getByRole('button', { name: 'Grün-Neigung zeigen' });
ok((await slope.count()) === 1, 'the green slope button on hole 1');
await slope.click();
await p.waitForTimeout(1500);
const img = await p.evaluate(() => [...performance.getEntriesByType('resource')].some((e) => /greens\/frielinghausen\/1\.webp/.test(e.name)));
ok(img, 'the chart of hole 1 loaded');
await p.getByRole('button', { name: 'Grün-Neigung ausblenden' }).click();
await p.waitForTimeout(400);
let holes = 0;
for (let h = 0; h < 18; h++) {
  if ((await slope.count()) === 1) holes++;
  if (h < 17) {
    await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
    await p.waitForTimeout(350);
  }
}
ok(holes === 18, `green slopes on ${holes} of 18 holes (NRW DGM1)`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
