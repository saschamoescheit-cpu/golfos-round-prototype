// QA (night run 27./28.10.2026): eleven US aerial services send their pictures as "application/octet-stream" – since the
// tile check of 23.10. the app threw them away and showed Esri. Here the Osceola County service (Falcon's Fire) answers
// exactly like that: real JPEGs with a generic type. The county's aerial must stay on the map, credited, and nothing
// counts as an empty tile.
// Usage: node qa/octettiles.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
// a real JPEG with a picture in it (grass with some noise), drawn in a blank page
const pre = await ctx.newPage();
const jpeg = Buffer.from(
  await pre.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let k = 0; k < 4000; k++) {
      g.fillStyle = `rgb(${40 + Math.random() * 40},${90 + Math.random() * 60},${30 + Math.random() * 30})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 6, 6);
    }
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }),
  'base64',
);
await pre.close();
let served = 0;
await ctx.route(/property-appraiser\.org\//, (r) => {
  served++;
  return r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: jpeg });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
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
// move on two holes – the map asks for new tiles and would have given up on the county by now
for (let k = 0; k < 2; k++) {
  await p.getByRole('button', { name: /Nächstes Loch/ }).first().click();
  await p.waitForTimeout(3000);
}
ok(served > 10, `the county's tiles asked for (${served})`);
const attrib = (await p.locator('.maplibregl-ctrl-attrib').textContent().catch(() => '')) ?? '';
// Esri lies below every regional aerial and is credited too – the county's credit goes when the app gives it up
ok(/Osceola/i.test(attrib), `the county's aerial stays (${attrib.replace(/\s+/g, ' ').slice(0, 100)})`);
ok(!/Luftbild.*(nicht|aus)/i.test(await p.locator('body').innerText()), 'no hint of a failed aerial');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
