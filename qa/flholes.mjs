// QA (Sascha 12.11.2026, USA: "Falcon's Fire and Southern Dunes we still play – check that everything fits"; Cypress and
// Oaks too): each bundled Florida course found with no course server at all, its preview through all 18 holes – each on
// the map at once (nothing to set up), the par of the scorecard, distances to the green.
// Usage: node qa/flholes.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
await ctx.route(/photon\.komoot\.io|overpass|openstreetmap\.org|opengolfapi/, (r) => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const COURSES = [
  { q: "Falcon's Fire", name: /Falcon/, par: [4, 4, 3, 5, 4, 4, 5, 3, 4, 5, 3, 4, 4, 5, 3, 4, 4, 4] },
  { q: 'Southern Dunes', name: /Southern Dunes/, par: [4, 4, 3, 5, 4, 3, 4, 4, 5, 4, 3, 5, 4, 3, 4, 5, 4, 4] },
  { q: 'Cypress', name: /Cypress/, par: [4, 4, 3, 5, 4, 5, 4, 3, 4, 4, 4, 3, 4, 5, 4, 3, 4, 5] },
  { q: 'Stonegate Oaks', name: /Oaks/, par: [5, 4, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5, 3, 4, 4, 5] },
];
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
for (const c of COURSES) {
  await p.goto(url);
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', c.q);
  const hit = p.locator('button.list-item').filter({ hasText: c.name }).first();
  if (!(await hit.waitFor({ timeout: 20000 }).then(() => true, () => false))) {
    ok(false, `${c.q}: found offline`);
    continue;
  }
  await hit.click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
  await p.getByRole('button', { name: 'Platzvorschau' }).click();
  await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  const wrong = [];
  for (let k = 0; k < 18; k++) {
    if (k) {
      await p.getByRole('button', { name: /Nächstes Loch/ }).first().click();
      await p.waitForTimeout(700);
    }
    const no = (await p.locator('.map-hole-no').first().innerText().catch(() => '?')).trim();
    const bar = (await p.locator('.hole-bar, .map-bottom').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const setup = await p.locator('.setup-card').count();
    const green = (await p.locator('.map-green').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (no !== String(k + 1) || setup || !new RegExp(`Par ${c.par[k]}\\b`).test(bar) || !/Mitte \d{2,3}/i.test(green)) wrong.push(`${k + 1}: ${no} ${setup ? 'set-up' : ''} ${bar.slice(0, 30)} ${green.slice(0, 20)}`);
  }
  ok(!wrong.length, `${c.q}: all 18 holes on the map, the card's par, distances to the green${wrong.length ? ' – ' + wrong.join(' | ') : ''}`);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
