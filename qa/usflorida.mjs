// QA (USA trip, 17.10.2026): a Florida course from the search – the county orthoimagery instead of Esri, the green
// chart from USGS 3DEP heights, the credits. Falcon's Fire, Kissimmee (Osceola County 2026).
// Usage: node qa/usflorida.mjs [url]   (SHOTS=<dir> for screenshots; needs the network: Photon, OSM, county server)
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
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
const tees = await p.locator('body').innerText();
ok(/Schwarz/.test(tees) && /Gold/.test(tees), 'Southern Dunes: its tees (Black … Red) to choose');
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(6000);
ok((await p.locator('.map-hole-no').innerText()).trim() === '1', 'Southern Dunes: on hole 1');
const sdCredit = await p.locator('.maplibregl-ctrl-attrib').textContent().catch(() => '');
ok(/Polk/i.test(sdCredit), `Southern Dunes: the Polk County orthoimagery (${sdCredit.replace(/\s+/g, ' ').slice(0, 80)})`);
await p.waitForTimeout(14000); // the county server draws each tile on request
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
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
