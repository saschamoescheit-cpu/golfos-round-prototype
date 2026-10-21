// QA: an aerial service that never answers (LGL Baden-Württemberg, 21.10.2026 afternoon: the whole map stayed black –
// the course layers waited for the first aerial tile). The map draws the hole at once and falls back to Esri.
// Usage: node qa/imageryhang.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
await ctx.route(/owsproxy\.lgl-bw\.de/, () => {}); // never answered
let esri = 0;
const p = await ctx.newPage();
p.on('request', (r) => { if (/arcgisonline/.test(r.url())) esri++; });
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
await p.waitForTimeout(3000);
await p.waitForTimeout(1000);
// the hole is drawn before any aerial tile: fairway and green in their colours on the map
const drawn = async () => {
  const shot = await p.locator('.hole-map').screenshot();
  return await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let k = 0; k < d.length; k += 16) if (d[k] + d[k + 1] + d[k + 2] > 90) lit++;
    return Math.round((lit / (d.length / 16)) * 1000) / 10;
  }, shot.toString('base64'));
};
const early = await drawn();
ok(early > 3, `the hole drawn while the aerial service hangs (${early} % of the map lit)`);
await p.waitForTimeout(9000);
ok(esri > 0, `no aerial tile after 8 s: Esri instead (${esri} tiles asked)`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
