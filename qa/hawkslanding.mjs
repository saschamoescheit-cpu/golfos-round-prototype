// QA (Sascha 27.10.2026: Hawks Landing in Orlando – "other apps can show these courses too"): OpenStreetMap has the course
// without holes; the app has its holes worked out (src/data/cards.ts LINES) – the course preview opens on hole 1 with its
// distances, no set-up, from home; par and stroke index from the card; all 18 holes on the map.
// The course search and the map are answered here (OSM without holes, as it is), the app is real.
// Usage: node qa/hawkslanding.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
// the player at home in Germany
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const box = [-81.5156, 28.3581, -81.4996, 28.3657];
await ctx.route(/photon\.komoot\.io\//, (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-81.5076, 28.3619] }, properties: { name: 'Hawks Landing Golf Club', city: 'Orlando', osm_type: 'R', osm_id: 4053362, extent: [box[0], box[3], box[2], box[1]] } }] }),
  }),
);
// the course in OSM: its outline, a tee and a fairway – no holes
const ring = (id, pts, tags) => `<way id="${id}">${pts.map((_, k) => `<nd ref="${id}${k}"/>`).join('')}<nd ref="${id}0"/>${Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('')}</way>`;
const nodes = (id, pts) => pts.map(([lon, lat], k) => `<node id="${id}${k}" lat="${lat}" lon="${lon}"/>`).join('');
const outline = [[-81.511, 28.359], [-81.505, 28.359], [-81.505, 28.363], [-81.511, 28.363]];
const tee = [[-81.5101, 28.3596], [-81.5099, 28.3596], [-81.5099, 28.3597], [-81.5101, 28.3597]];
const fairway = [[-81.5103, 28.3605], [-81.5097, 28.3605], [-81.5097, 28.3622], [-81.5103, 28.3622]];
const OSM = `<?xml version="1.0"?><osm version="0.6">${nodes(1, outline)}${nodes(2, tee)}${nodes(3, fairway)}${ring(1, outline, { leisure: 'golf_course', name: 'Hawks Landing Golf Club' })}${ring(2, tee, { golf: 'tee' })}${ring(3, fairway, { golf: 'fairway' })}</osm>`;
await ctx.route(/api\.openstreetmap\.org\/api\/0\.6\/map/, (r) => r.fulfill({ status: 200, contentType: 'text/xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: OSM }));
await ctx.route(/overpass/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [] }) }));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hawks Landing');
const hit = p.locator('button.list-item').filter({ hasText: 'Hawks Landing' }).first();
await hit.waitFor({ timeout: 20000 });
await hit.click();
await p.getByText('Platzvorschau').waitFor({ timeout: 30000 });
ok(!/fehlen Par oder Hcp/.test(await p.locator('main').innerText()), 'set-up: par and stroke index from the card');
await p.getByText('Platzvorschau').click();
await p.waitForTimeout(3000);
ok((await p.locator('.setup-card').count()) === 0, 'the preview opens on the map – no set-up needed, from home');
ok((await p.locator('.map-hole-no').first().innerText()).trim() === '1' && /Par 4/.test(await p.locator('body').innerText()), 'hole 1, par 4');
const green1 = (await p.locator('.map-green').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Mitte \d{2,3}/i.test(green1), `distances to the green on hole 1 (${green1})`);
for (let k = 1; k < 18; k++) {
  await p.getByRole('button', { name: /Nächstes Loch/ }).first().click();
  await p.waitForTimeout(500);
}
ok((await p.locator('.setup-card').count()) === 0 && (await p.locator('.map-hole-no').first().innerText()).trim() === '18' && /Par 3/.test(await p.locator('body').innerText()), 'all 18 holes on the map – 18 the par 3 to the island green');

// Photon down (night run 28./29.10.2026): OpenGolfAPI alone has Hawks Landing at the hotel, 650 m from the course, and
// Verona (Wisconsin) first – the app's own entry with the holes is found all the same, once, and plays without set-up
{
  const ctx2 = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx2); // Photon answers nothing
  await ctx2.route(/api\.opengolfapi\.org\/v1\/courses\/search/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ courses: [
        { id: 'a2e5c0a3-4087-4349-8c3b-70be0c889d43', name: 'Hawks Landing Golf Club', city: 'Verona', state: 'WI', latitude: 43.0346938, longitude: -89.5452696 },
        { id: '0add94c9-cfe6-4401-8647-bbe0a45b06c1', name: 'Hawks Landing Golf Club', city: 'Orlando', state: 'FL', latitude: 28.3618866, longitude: -81.5076057 },
      ] }),
    }),
  );
  // the OSM course area around the hotel point holds no course (as it is); the course's own box brings its map
  // (the hotel's box reaches 600 m west to −81.5136, the course's box of its holes further, beyond −81.515)
  await ctx2.route(/api\.openstreetmap\.org\/api\/0\.6\/map/, (r) => {
    const west = Number(new URL(r.request().url()).searchParams.get('bbox')?.split(',')[0]);
    return r.fulfill({ status: 200, contentType: 'text/xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: west < -81.515 ? OSM : '<?xml version="1.0"?><osm version="0.6"></osm>' });
  });
  await ctx2.route(/overpass/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ elements: [] }) }));
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
  await q.goto(url);
  await q.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await q.reload();
  await q.waitForTimeout(1000);
  await q.getByRole('button', { name: 'Neue Runde' }).click();
  await q.fill('#course-search', 'Hawks Landing');
  await q.waitForTimeout(3000);
  const rows = (await q.locator('button.list-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const orl = rows.filter((t) => /Hawks Landing/.test(t) && /Orlando/.test(t));
  ok(orl.length === 1, `Photon down: Hawks Landing Orlando once in the list (${rows.join(' | ')})`);
  await q.locator('button.list-item').filter({ hasText: 'Hawks Landing' }).filter({ hasText: 'Orlando' }).first().click();
  await q.getByText('Platzvorschau').waitFor({ timeout: 30000 });
  await q.getByText('Platzvorschau').click();
  await q.waitForTimeout(3000);
  const id = await q.evaluate(() => JSON.parse(sessionStorage.getItem('golfos.preview.v1') ?? localStorage.getItem('golfos.preview.v1') ?? 'null')?.courseId ?? null);
  ok((await q.locator('.setup-card').count()) === 0 && (await q.locator('.map-hole-no').first().innerText()).trim() === '1', `Photon down: the preview opens on hole 1 without set-up (${id ?? 'course id not stored'})`);
  await ctx2.close();
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
