// QA: the course search (Photon) down – the search then finds only OpenGolfAPI entries, which carry no map. Picking one
// loads the OSM course at its place: the round has its map and the green slopes (night check 22.10.2026, Photon down
// twice in one night).
// Usage: node qa/photondown.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
await ctx.route(/photon\.komoot\.io/, (r) => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
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
await p.fill('#course-search', 'Hubbelrath');
await p.locator('button.list-item').first().waitFor({ timeout: 30000 });
ok(/Hubbelrath/.test(await p.locator('button.list-item').first().innerText()), 'found without Photon (the second course database)');
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
const state = await p.evaluate(() => ({
  geo: Object.keys(localStorage).filter((k) => k.startsWith('golfos.geo.v1.')),
  course: Object.keys(localStorage).filter((k) => k.startsWith('golfos.course.v1.')),
}));
ok(state.geo.some((k) => /osm:(way|relation)\//.test(k)), `the OSM course at its place – with its map (${state.geo.join(', ') || 'no map'})`);
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
const holes = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].holes.length);
ok(holes >= 9, `the round has the course's holes (${holes})`);
const slope = p.getByRole('button', { name: 'Grün-Neigung zeigen' });
await slope.waitFor({ timeout: 90000 }).catch(() => {});
ok((await slope.count()) === 1, 'the green slopes made on the phone (the greens came with the map)');
// a course OpenGolfAPI does not know: found in the app's list of every German course (Sascha 22.10.2026)
await p.goto(url);
await p.evaluate(() => {
  sessionStorage.clear();
  sessionStorage.setItem('golfos.module', 'rounds');
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs.map((r) => ({ ...r, finishedAt: r.finishedAt ?? new Date().toISOString() }))));
});
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Golfclub München-Riem');
await p.waitForTimeout(2500);
const found = (await p.locator('button.list-item').allInnerTexts()).join(' | ');
ok(/München Riem/.test(found), `without Photon: "Golfclub München-Riem" found in the app's list (${found.replace(/\s+/g, ' ').slice(0, 80)})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
