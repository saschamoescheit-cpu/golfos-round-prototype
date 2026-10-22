// QA: on the course with weak reception the hole's aerial tiles come from the offline store and only a few tiles at
// the edge hang. The map must keep the state's aerial photo then – switching to Esri (not saved) would throw the saved
// map away and end in the drawn hole (night check 22.10.2026).
// Usage: node qa/edgehang.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const GRASS = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPwyjPBihiGlgQAE6E7AUXeDRsAAAAASUVORK5CYII=', 'base64');
// every tile answers at once (as from the offline store) – except every eighth, which never does
let lgl = 0;
await ctx.route(/owsproxy\.lgl-bw\.de/, (r) => (++lgl % 8 === 0 ? undefined : r.fulfill({ status: 200, contentType: 'image/png', body: GRASS })));
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: 'Platzvorschau', exact: true }).click();
// from the first tile on: longer than the map's wait for the aerial photo (8 s)
for (let k = 0; k < 60 && lgl === 0; k++) await p.waitForTimeout(500);
await p.waitForTimeout(11000);
ok(lgl > 4, `the state's aerial photo asked (${lgl} tiles)`);
const credit = async () => (await p.locator('.maplibregl-ctrl-attrib').innerText().catch(() => '')).trim();
// "Luftbild: LGL-BW" is the aerial photo's credit (the green heights' "© LGL" is another)
ok(/Luftbild: LGL-BW/.test(await credit()), `after the wait still the state's aerial photo (credit: ${await credit()})`);
// still on the state's photo: the next hole asks it again
const before = lgl;
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(4000);
ok(lgl > before, `a few hanging tiles at the edge: the map stays on the state's aerial photo (${lgl - before} new tiles on the next hole)`);
ok((await p.getByText('Gerade kein Luftbild').count()) === 0, 'no switch to the drawn hole');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
