// QA (Sascha 27.10.2026, Hawks Landing in Orlando: "no round, no course preview – it must work when you are not at the
// course or on the tee, for every course"): a course whose holes are not in OpenStreetMap, the phone far away – the set-up
// asks to tap the tee on the aerial photo (no "Ich stehe am Abschlag"), two taps draw the hole, the round plays it on the
// map. The course search and the map are answered here (a made-up course in Florida), the app is real.
// Usage: node qa/remotesetup.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
// the player at home in Germany
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const box = [-81.512, 28.358, -81.504, 28.364];
await ctx.route(/photon\.komoot\.io\//, (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-81.508, 28.361] }, properties: { name: 'Test Links', city: 'Orlando', osm_type: 'R', osm_id: 990001, extent: [box[0], box[3], box[2], box[1]] } }] }),
  }),
);
// the course in OSM: its outline, a tee and a fairway – no holes
const ring = (id, pts, tags) => `<way id="${id}">${pts.map((_, k) => `<nd ref="${id}${k}"/>`).join('')}<nd ref="${id}0"/>${Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('')}</way>`;
const nodes = (id, pts) => pts.map(([lon, lat], k) => `<node id="${id}${k}" lat="${lat}" lon="${lon}"/>`).join('');
const outline = [[-81.511, 28.359], [-81.505, 28.359], [-81.505, 28.363], [-81.511, 28.363]];
const tee = [[-81.5101, 28.3596], [-81.5099, 28.3596], [-81.5099, 28.3597], [-81.5101, 28.3597]];
const fairway = [[-81.5103, 28.3605], [-81.5097, 28.3605], [-81.5097, 28.3622], [-81.5103, 28.3622]];
const OSM = `<?xml version="1.0"?><osm version="0.6">${nodes(1, outline)}${nodes(2, tee)}${nodes(3, fairway)}${ring(1, outline, { leisure: 'golf_course', name: 'Test Links' })}${ring(2, tee, { golf: 'tee' })}${ring(3, fairway, { golf: 'fairway' })}</osm>`;
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
await p.fill('#course-search', 'Test Links');
const hit = p.locator('button.list-item').filter({ hasText: 'Test Links' }).first();
await hit.waitFor({ timeout: 20000 });
await hit.click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByText('Runde starten').click();
await p.waitForTimeout(2500);
// far from the course: tap on the aerial photo, no GPS button
const card = p.locator('.setup-card');
ok((await card.count()) === 1 && /Wo ist der Abschlag von Loch 1\?/.test(await card.innerText()), 'a course without holes: the set-up asks for the tee of hole 1');
ok(/noch nicht in der Karte/.test(await card.innerText()) && /von zu Hause/.test(await card.innerText()), 'far from the course: "tap the tee on the aerial photo – from home too"');
ok((await p.getByRole('button', { name: 'Ich stehe am Abschlag' }).count()) === 0, 'no "Ich stehe am Abschlag" away from the course');
const map = await p.locator('.hole-map').boundingBox();
await p.mouse.click(map.x + map.width / 2, map.y + map.height * 0.42);
await p.waitForTimeout(500);
ok(/Tippe auf das Grün/.test(await card.innerText()), 'tee tapped – now the green');
await p.mouse.click(map.x + map.width / 2, map.y + map.height * 0.2);
await p.waitForTimeout(500);
const len = Number((/Abschlag → Grün: (\d+) m/.exec(await card.innerText()) ?? [])[1]);
ok(len > 50, `green tapped – tee to green ${len} m`);
await card.getByRole('button', { name: 'Loch speichern' }).click();
await p.waitForTimeout(2500);
ok((await p.locator('.setup-card').count()) === 0 && (await p.locator('.map-hole-no').first().innerText()).trim() === '1', 'saved: the round plays hole 1 on the map');
const saved = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('holeline') || k.includes('lines')).length);
ok(saved >= 1, 'the hole drawn is kept for this course');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
