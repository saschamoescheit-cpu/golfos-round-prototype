// QA (night run 27./28.10.2026, the USA trip from 05.11.): every built-in Florida course of the trip from the search –
// its tees to choose, then the course preview through all 18 holes: each hole on the map with distances to the green,
// never the set-up. Found with no course server (as in the USA without roaming). Hawks Landing has its own test.
// Usage: node qa/ustrip.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const COURSES = [
  { q: 'Southern Dunes', hit: /Southern Dunes Golf/, tees: ['Schwarz', 'Gold'] },
  { q: 'Stonegate Oaks', hit: /Oaks/, tees: ['Gold', 'Blau'] },
  { q: 'Kissimmee Bay', hit: /Kissimmee Bay/, tees: ['Gold', 'Blau', 'Weiß', 'Rot'] },
  { q: "Falcon's Fire", hit: /Falcon/, tees: ['Gold', 'Blau'] },
  { q: 'Legends Golf', hit: /Legends Golf and Country/, tees: [] },
  { q: 'Orange Lake', hit: /Orange Lake/, tees: ['Schwarz', 'Blau'] },
];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
// no course server at all – the trip's courses come with the app
await ctx.route(/overpass|api\.openstreetmap\.org|opengolfapi/, (r) => r.abort());
const p = await ctx.newPage();
const errs = [];
// a same-origin load (a green picture – also one made on the phone, a blob address) cut off by the next page load – on
// the live site too, not only on localhost
p.on('pageerror', (e) => { if (!/(localhost:\d+|saschamoescheit-cpu\.github\.io\/(golfos-round-prototype|[0-9a-f-]{36})|api\.open-meteo\.com|owsproxy\.lgl-bw\.de|paags\.property-appraiser\.org|server\.arcgisonline\.com|overpass|openstreetmap|opengolfapi)\S* due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
for (const c of COURSES) {
  await p.goto(url);
  await p.waitForTimeout(1000);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', c.q);
  const hit = p.locator('button.list-item').filter({ hasText: c.hit }).first();
  await hit.waitFor({ timeout: 30000 });
  await hit.click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
  ok(!/fehlen Par oder Hcp/.test(await p.locator('main').innerText()), `${c.q}: par and stroke index there`);
  if (c.tees.length) {
    await p.locator('.player-row .tee-pick').first().click();
    const tees = await p.getByRole('dialog', { name: 'Tee' }).innerText();
    ok(c.tees.every((t) => tees.includes(t)), `${c.q}: its tees to choose (${c.tees.join(', ')})`);
    await p.getByRole('dialog', { name: 'Tee' }).getByRole('button', { name: 'Schließen' }).click();
  }
  await p.getByRole('button', { name: 'Platzvorschau' }).click();
  await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(2500);
  const bad = [];
  for (let k = 1; k <= 18; k++) {
    const no = (await p.locator('.map-hole-no').first().innerText().catch(() => '')).trim();
    const setup = await p.locator('.setup-card').count();
    const green = (await p.locator('.map-green').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (no !== String(k) || setup || !/Mitte \d{2,3}/i.test(green)) bad.push(`${k}${setup ? ' set-up' : ''}${no !== String(k) ? ' shows ' + no : ''}${/Mitte/i.test(green) ? '' : ' no distances'}`);
    if (k < 18) {
      await p.getByRole('button', { name: /Nächstes Loch/ }).first().click();
      await p.waitForTimeout(450);
    }
  }
  ok(bad.length === 0, `${c.q}: all 18 holes on the map with distances, no set-up${bad.length ? ' – ' + bad.join(', ') : ''}`);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
