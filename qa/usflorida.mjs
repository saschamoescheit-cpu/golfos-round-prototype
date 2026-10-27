// QA (USA trip, 17.10.2026): a Florida course from the search – the county orthoimagery instead of Esri, the green
// chart from USGS 3DEP heights, the credits. Falcon's Fire, Kissimmee (Osceola County 2026).
// Usage: node qa/usflorida.mjs [url]   (SHOTS=<dir> for screenshots; needs the network: Photon, OSM, county server)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io|api\.opengolfapi\.org)\/\S* due to access control/.test(e.message)) errs.push(e.message); }); // a search refused by the busy real services is an outage the app copes with (night 23./24.10.)
const tiles = new Set();
p.on('request', (r) => { if (r.url().includes('imagery/us.json')) console.log('· list requested', r.url()); const h = new URL(r.url()).host; if (/property-appraiser|arcgisonline/.test(h)) tiles.add(h); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', "Falcon's Fire");
await p.locator('button.list-item').filter({ hasText: /Falcon/ }).first().waitFor({ timeout: 30000 });
await p.locator('button.list-item').filter({ hasText: /Falcon/ }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(9000);
ok((await p.locator('.map-hole-no').innerText()).trim() === '1', 'on hole 1');
const attrib = await p.locator('.maplibregl-ctrl-attrib').textContent().catch(() => '');
console.log('· credits:', attrib.replace(/\s+/g, ' ').slice(0, 160));
ok(/Osceola/i.test(attrib), 'the Osceola County orthoimagery, not Esri');
// the ⓘ: the app's own button bottom left in the bottom row; a tap shows the credits, a tap on them closes (Sascha 17.10.2026)
const ib = p.getByRole('button', { name: 'Karteninfo' });
const ibb = await ib.boundingBox();
const vh = p.viewportSize().height;
ok(ibb && ibb.x < 40 && ibb.y > vh / 2, `the ⓘ at the bottom left (${ibb ? Math.round(ibb.x) + ',' + Math.round(ibb.y) : '–'})`);
await ib.click();
await p.waitForTimeout(200);
ok(/Osceola/.test(await p.locator('.map-credits').innerText().catch(() => '')), 'a tap on the ⓘ shows the credits');
await p.locator('.map-credits').click({ position: { x: 4, y: 4 } });
await p.waitForTimeout(200);
ok((await p.locator('.map-credits').count()) === 0, 'a tap on them closes them');
ok([...tiles].some((h) => /property-appraiser/.test(h)), `county tiles loaded (${[...tiles].join(', ')})`);
await p.getByRole('button', { name: 'Grün-Neigung zeigen' }).click();
await p.waitForTimeout(4000);
const chart = await p.evaluate(() => [...document.querySelectorAll('img, canvas')].length);
ok(chart > 0, 'the map draws');
const credit = await p.locator('.maplibregl-ctrl-attrib').textContent().catch(() => '');
ok(/USGS/.test(credit), 'green heights credited to USGS 3DEP');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/falconsfire-1.png` });
// Southern Dunes (Haines City): no course area in OSM – bundled, hole lines from the club's map, found by name
await p.goto(url);
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Southern Dunes');
const sd = p.locator('button.list-item').filter({ hasText: /Southern Dunes Golf/ }).first();
await sd.waitFor({ timeout: 30000 });
await sd.click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
// the tees behind the dot in the player row (Sascha 21.10.2026: the tee per player)
await p.locator('.player-row .tee-pick').first().click();
const tees = await p.getByRole('dialog', { name: 'Tee' }).innerText();
ok(/Schwarz/.test(tees) && /Gold/.test(tees), 'Southern Dunes: its tees (Black … Red) to choose');
await p.getByRole('dialog', { name: 'Tee' }).getByRole('button', { name: 'Schließen' }).click();
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(6000);
ok((await p.locator('.map-hole-no').innerText()).trim() === '1', 'Southern Dunes: on hole 1');
const sdCredit = await p.locator('.maplibregl-ctrl-attrib').textContent().catch(() => '');
// the Polk County orthoimagery is gone (27.10.2026: its server sends every request to its home page) – Esri's aerial
ok(/Esri/i.test(sdCredit) && !/Polk/i.test(sdCredit), `Southern Dunes: Esri's aerial since the Polk County service is gone (${sdCredit.replace(/\s+/g, ' ').slice(0, 80)})`);
await p.waitForTimeout(3000);
const par = await p.locator('body').innerText();
ok(/Par 4/.test(par), 'Southern Dunes: hole 1 is a par 4');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/southerndunes-1.png` });
// StoneGate Oaks (Poinciana): OSM has the course area only – the bundled holes replace the empty ones
await p.goto(url);
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Stonegate Oaks');
const sg = p.locator('button.list-item').filter({ hasText: /Oaks/ }).first();
await sg.waitFor({ timeout: 30000 });
await sg.click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
ok(/18 Löcher|Par 72/.test(await p.locator('body').innerText()), 'StoneGate Oaks: 18 holes, par 72');
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(8000);
ok((await p.locator('.map-hole-no').innerText()).trim() === '1', 'StoneGate Oaks: on hole 1');
ok(/Par 5/.test(await p.locator('body').innerText()), 'StoneGate Oaks: hole 1 is a par 5');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/stonegateoaks-1.png` });
// the four OSM courses are bundled (night 17./18.10.2026): found and loaded with no course database and no OSM at all –
// in the USA without roaming
await p.route(/photon\.komoot\.io|overpass|openstreetmap\.org|opengolfapi/, (r) => r.abort());
for (const [q, name] of [['Kissimmee Bay', /Kissimmee Bay/], ['Orange Lake', /The Legends/], ['Legends Golf', /Legends Golf and Country/]]) {
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', q);
  const hit = p.locator('button.list-item').filter({ hasText: name }).first();
  const found = await hit.waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (found) {
    await hit.click();
    await p.getByText('Runde starten').waitFor({ timeout: 30000 }).catch(() => {});
  }
  ok(found && /18 Löcher/.test(await p.locator('body').innerText()), `${q}: found and loaded without any course server`);
}
await p.unroute(/photon\.komoot\.io|overpass|openstreetmap\.org|opengolfapi/);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
