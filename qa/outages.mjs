// QA: one outside service down or hanging at a time – the app goes on (night run 21./22.10.2026, Sascha: "the GPS maps
// must always work, on every course"). Hetzenhof (its data come with the app) as a course preview:
// 1 the state's aerial photo and Esri both hang → the drawn hole, a short hint, never black
// 2 Esri hangs, the state's aerial photo answers → the aerial photo
// 3 the weather services refuse → hole and caddie work, no "NaN" or "undefined" anywhere
// 4 the height service refuses → the same
// 5 the course search (Photon) hangs → the other course database answers within 10 s
// 6 the course databases (OSM API and Overpass) refuse → a clear message, no endless waiting
// Usage: node qa/outages.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const hang = () => {}; // a route never answered
const GRASS = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPwyjPBihiGlgQAE6E7AUXeDRsAAAAASUVORK5CYII=', 'base64');

async function lit(p) {
  const shot = await p.locator('.hole-map').screenshot();
  return p.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, l = 0;
    for (let k = 0; k < d.length; k += 32) {
      n++;
      if (d[k] + d[k + 1] + d[k + 2] > 60) l++;
    }
    return Math.round((l / n) * 1000) / 10;
  }, shot.toString('base64'));
}

async function scenario(name, routes, run) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx);
  for (const [re, h] of routes) await ctx.route(re, h); // registered last: they win over the net mock
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/due to access control|sw\.js/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await p.reload();
  await p.waitForTimeout(1000);
  try {
    await run(p);
  } catch (e) {
    ok(false, `${name}: ${String(e).split('\n')[0]}`);
  }
  ok(errs.length === 0, `${name}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
const preview = async (p) => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').first().waitFor({ timeout: 15000 });
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: 'Platzvorschau', exact: true }).click();
  await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
};
const clean = async (p, name) => {
  const text = await p.locator('main').innerText();
  ok(!/NaN|undefined|null m|Infinity/.test(text), `${name}: no NaN, undefined or Infinity on the screen`);
};

await scenario('aerial photos all down', [[/owsproxy\.lgl-bw\.de/, hang], [/arcgisonline\.com/, hang]], async (p) => {
  await preview(p);
  await p.waitForTimeout(20000); // 8 s for the state's photo, 8 s for Esri
  const pressed = await p.getByRole('button', { name: /Luftbild zeigen/ }).count();
  const share = await lit(p);
  ok(pressed > 0 && share > 40, `the drawn hole instead – never black (${share} % lit, 2D ${pressed ? 'on' : 'off'})`);
  ok((await p.getByText(/Gerade kein Luftbild/).count()) > 0, 'a short hint says why');
});

await scenario('Esri down', [[/owsproxy\.lgl-bw\.de/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: GRASS })], [/arcgisonline\.com/, hang]], async (p) => {
  await preview(p);
  await p.waitForTimeout(10000);
  const share = await lit(p);
  ok(share > 40 && (await p.getByRole('button', { name: /Gezeichnetes Loch/ }).count()) > 0, `the state's aerial photo – Esri is not needed (${share} % lit)`);
});

await scenario('weather down', [[/api\.open-meteo\.com\/v1\/forecast/, (r) => r.fulfill({ status: 503, body: '' })], [/api\.brightsky\.dev/, (r) => r.fulfill({ status: 503, body: '' })]], async (p) => {
  await preview(p);
  await p.waitForTimeout(4000);
  ok((await lit(p)) > 40, 'the map is there');
  await p.getByRole('button', { name: /^Caddie zeigen/ }).first().click();
  await p.waitForTimeout(500);
  ok((await p.getByRole('button', { name: 'Lochnotizen' }).count()) > 0, 'the caddie works without weather');
  await clean(p, 'weather down');
});

await scenario('heights down', [[/api\.open-meteo\.com\/v1\/elevation/, (r) => r.fulfill({ status: 503, body: '' })]], async (p) => {
  await preview(p);
  await p.waitForTimeout(4000);
  await p.getByRole('button', { name: /^Caddie zeigen/ }).first().click();
  await p.waitForTimeout(500);
  ok((await p.getByText(/spielt wie/).count()) > 0, 'the caddie still says "plays like"');
  await clean(p, 'heights down');
});

await scenario('course search hangs', [[/photon\.komoot\.io/, hang]], async (p) => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  const t0 = Date.now();
  await p.fill('#course-search', 'Frielinghausen');
  await p.locator('button.list-item').filter({ hasText: /Frielinghausen/ }).first().waitFor({ timeout: 15000 });
  const s = Math.round((Date.now() - t0) / 100) / 10;
  ok(s <= 10, `the other course database answers – a hit after ${s} s`);
});

await scenario('course databases down', [[/api\.openstreetmap\.org/, (r) => r.fulfill({ status: 503, body: '' })], [/overpass/, (r) => r.fulfill({ status: 503, body: '' })]], async (p) => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Frielinghausen');
  const hit = p.locator('button.list-item').filter({ hasText: /Frielinghausen/ }).first();
  await hit.waitFor({ timeout: 15000 });
  const t0 = Date.now();
  await hit.click();
  const msg = p.getByText(/Platz-Server sind gerade ausgelastet|Runde starten/);
  await msg.first().waitFor({ timeout: 60000 }).catch(() => {});
  const s = Math.round((Date.now() - t0) / 1000);
  const text = await p.locator('main').innerText();
  ok(/Platz-Server sind gerade ausgelastet/.test(text) || /Runde starten/.test(text), `a clear message or a playable course after ${s} s – no endless waiting`);
});

await b.close();
process.exit(fails ? 1 : 0);
