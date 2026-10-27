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
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
