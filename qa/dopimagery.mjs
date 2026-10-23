// The best imagery on every German course (Sascha 19.10.2026): the state's own aerial photos (DOP20) where the state
// offers them to the app – North Rhine-Westphalia, Lower Saxony, Hesse, Brandenburg/Berlin, Bavaria, Saxony – instead
// of the worldwide Esri imagery; the credit of the state in the map's ⓘ.
// Usage: node qa/dopimagery.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const COURSES = [['Hubbelrath', /wms_nw_dop/, /Geobasis NRW/], ['Golfclub München-Riem', /geoservices\.bayern\.de\/od\/wms\/dop/, /Bayerische Vermessungsverwaltung/], ['Golfclub Dresden Elbflorenz', /wms_geosn_dop/, /GeoSN/]];
const b = await webkit.launch();
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
for (const [name, host, credit] of COURSES) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 51.0, longitude: 10.0, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  // a map tile a state's server sent without its CORS header (a hiccup there): one tile missing, no fault of the app
  p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|gds-srv\.hessen\.de|wms\.nrw\.de|lgln\.niedersachsen\.de|geobasis-bb\.de|geoservices\.bayern\.de|geodienste\.sachsen\.de|arcgisonline\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  let tiles = 0;
  let esri = 0;
  p.on('response', (r) => { if (host.test(r.url()) && r.status() === 200) tiles++; if (/arcgisonline/.test(r.url())) esri++; });
  await p.goto(url);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
  await p.reload();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', name);
  await p.locator('button.list-item').first().waitFor({ timeout: 30000 });
  const course = (await p.locator('button.list-item').first().innerText()).split('\n')[0];
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
  await p.getByText('Runde starten').click();
  await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
  // the course comes from OpenStreetMap: wait for the imagery, not a fixed time
  for (let k = 0; k < 40 && tiles < 4; k++) await p.waitForTimeout(500);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/dop-${name.replace(/\W+/g, '')}.png` });
  // Esri lies underneath since 21.10.2026 (never a black map) – the state's tiles must still come and cover it
  ok(tiles > 0, `${course}: aerial photos from the state straight away (${tiles} tiles, ${esri} Esri tiles underneath)`);
  await p.getByRole('button', { name: 'Karteninfo' }).click();
  await p.waitForTimeout(400);
  ok(credit.test((await p.locator('main').allInnerTexts()).join(' ')), `${course}: the state's credit in the ⓘ`);
  ok(errs.length === 0, `${course}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
