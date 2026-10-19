// Green slopes on every course (Sascha 19.10.2026): a course without built-in charts gets them on the phone from the
// region's official terrain model – here courses in German states and the USA, loaded from
// OpenStreetMap as any course. The slope button on the holes, the chart on the map, the credit in the ⓘ, and the
// second time without the service (kept on the phone).
// Usage: node qa/greensmade.mjs [url] [course name …]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const COURSES = process.argv.length > 3 ? process.argv.slice(3) : ['Hubbelrath', 'Nippenburg', 'Frankfurter Golf Club', 'Wilkendorf', 'Golf Club Würzburg'];
const b = await webkit.launch();
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
for (const name of COURSES) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 51.0, longitude: 7.0, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  // a map tile a state's server sent without its CORS header (a hiccup there): one tile missing, no fault of the app
  p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|gds-srv\.hessen\.de|wms\.nrw\.de|lgln\.niedersachsen\.de|geobasis-bb\.de|geoservices\.bayern\.de|geodienste\.sachsen\.de|arcgisonline\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  let dem = 0;
  p.on('request', (r) => { if (/wcs\.nrw\.de|owsproxy\.lgl-bw\.de\/owsproxy\/wcs|elevation\.nationalmap\.gov|geoservices\.lgln|inspire-hessen\.de|isk\.geobasis-bb\.de\/ows\/dgm_wcs|geodaten-mv\.de|\/dem\/(by|rp|sn)\/[\w-]+\.json/.test(r.url())) dem++; });
  await p.goto(url);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
  await p.reload();
  await p.waitForTimeout(800);
  const start = async () => {
    await p.getByRole('button', { name: 'Neue Runde' }).click();
    await p.fill('#course-search', name);
    await p.locator('button.list-item').first().waitFor({ timeout: 30000 });
    const course = (await p.locator('button.list-item').first().innerText()).split('\n')[0];
    await p.locator('button.list-item').first().click();
    await p.getByText('Runde starten').waitFor({ timeout: 60000 });
    await p.getByText('Runde starten').click();
    await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
    return course;
  };
  const course = await start();
  const slope = p.getByRole('button', { name: 'Grün-Neigung zeigen' });
  await slope.waitFor({ timeout: 90000 }).catch(() => {});
  ok((await slope.count()) === 1 && dem > 0, `${course}: green slopes made on the phone (${dem} requests to the terrain service)`);
  if (!(await slope.count())) { await ctx.close(); continue; }
  // "plays like" from the same terrain model: the course's 10 m grid, kept on the phone
  const tgrid = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('golfos-terrain', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('grids');
    r.onsuccess = () => { const q = r.result.transaction('grids').objectStore('grids').getAll(); q.onsuccess = () => res(q.result.map((g) => `${g.cols}x${g.rows}`)); q.onerror = () => res([]); };
    r.onerror = () => res([]);
  }));
  ok(tgrid.length === 1, `${course}: the 10 m height grid for "plays like" (${tgrid.join(', ') || 'none'})`);
  await slope.click();
  await p.waitForTimeout(2000);
  const onMap = await p.evaluate(() => [...document.querySelectorAll('.maplibregl-canvas')].length > 0);
  ok(onMap, `${course}: the chart on the map`);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/made-${name.replace(/\W+/g, '')}.png` });
  await p.getByRole('button', { name: 'Karteninfo' }).click();
  await p.waitForTimeout(400);
  const credit = await p.locator('main').innerText();
  ok(/Grünhöhen: (Geobasis NRW|©)|Green heights: USGS/.test(credit), `${course}: the credit of the terrain model in the ⓘ`);
  // the second time: from the phone – only a green the service missed the first time (a hiccup under load) is asked again
  const first = dem;
  await p.reload();
  dem = 0;
  await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 }).catch(() => {});
  if (!(await p.locator('.map-hole-no').count())) {
    // the reload lands on the paused round in the list: open it again
    await p.locator('ul.list button.list-item').first().click().catch(() => {});
    await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
  }
  await p.getByRole('button', { name: /Grün-Neigung (zeigen|ausblenden)/ }).waitFor({ timeout: 30000 }).catch(() => {});
  ok((await p.getByRole('button', { name: /Grün-Neigung (zeigen|ausblenden)/ }).count()) === 1 && dem < Math.max(2, first / 4), `${course}: the second time kept on the phone (${dem} requests, first time ${first})`);
  ok(errs.length === 0, `${course}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
