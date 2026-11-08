// A later shot standing as a tee shot (Sascha 08.11.2026, the phone in the cart: the first shot noted on the course
// 80 m before the green got "tee" and the driver; the review then showed "D · Abschlag · 77 m" for shot 2). The check
// gives it its lie from the map and the club for its distance; the real tee shot keeps the driver.
// Usage: node falsetee.mjs <app url>
import { readFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const sim = JSON.parse(readFileSync(new URL('./simtrack.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${what}`); };

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.tip.shots.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
// hole 1 played: the tee shot with the driver, then the shot noted as a "tee shot" 80 m before the green, 2 putts
const h1 = sim.truth[0];
for (let pass = 0; pass < 2; pass++) {
  if (pass) await p.waitForTimeout(800);
  await p.evaluate((t) => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
    const r = rs[0];
    const id = Object.keys(r.entries)[0];
    const second = t.shots[t.shots.length - 1];
    r.entries[id][0] = {
      ...r.entries[id][0],
      strokes: 4,
      putts: 2,
      detail: {
        shots: [
          { pos: t.shots[0], lie: 'tee', club: 'Dr', penalty: false, kind: 'full' },
          { pos: second, lie: 'tee', club: 'Dr', penalty: false, kind: 'full' },
        ],
        onGreen: t.green,
        holedOut: false,
        pin: null,
      },
    };
    r.finishedAt = new Date().toISOString();
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
    sessionStorage.setItem('golfos.paused', r.id);
  }, h1);
}
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
const rows = await p.locator('ol.review-list li').allInnerTexts();
console.log('· shots:', rows.map((x) => x.replace(/\s+/g, ' ').trim()).join(' | '));
const stored = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  return Object.values(r.entries)[0][0].detail.shots.map((s) => ({ lie: s.lie, club: s.club }));
});
ok(stored.length === 2, `still two shots (${stored.length})`);
ok(stored[0]?.lie === 'tee' && stored[0]?.club === 'Dr', `the tee shot keeps tee and driver (${JSON.stringify(stored[0])})`);
ok(stored[1]?.lie !== 'tee', `shot 2 no longer "tee" (${stored[1]?.lie})`);
ok(stored[1]?.club && stored[1].club !== 'Dr', `shot 2 the club for its distance, not the driver (${stored[1]?.club})`);
ok(rows[1] != null && !/Abschlag/.test(rows[1]) && !/^\s*2?\s*D\b/.test(rows[1].trim()), 'the list says so too');
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' / ') : ''}`);
await b.close();
process.exit(bad ? 1 : 0);
