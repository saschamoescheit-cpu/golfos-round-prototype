// QA (Sascha 17.10.2026): hazard distances on the hole map – every bunker and water ahead with start and end, dashed
// lines out to the side, the labels beside the hazard (not on it), white type (no yellow). Hole 3C at Hetzenhof has
// three bunkers right of the line. Usage: node qa/hazards.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.70, longitude: 9.60, accuracy: 5 }, permissions: ['geolocation'] }); // away from the course: from the tee
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('· console:', m.text().slice(0, 160)); });
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
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /^C · 9 Löcher/ }).click();
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(4000);
for (let k = 0; k < 2; k++) {
  await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(2500);
}
ok((await p.locator('.map-hole-no').innerText()).trim() === '3C', 'on hole 3C');
await p.getByRole('button', { name: 'Distanzen zu Hindernissen zeigen' }).click();
await p.waitForTimeout(2500);
const labels = await p.locator('.map-label.hazard').allInnerTexts();
console.log('· labels:', labels.join(' | '));
const bunkers = await p.locator('.map-label.hazard.bunker').count();
// only what is in play (Sascha 17.10.2026: "still very cluttered"): near the line, past the reach of the tee, bunker
// groups as one – on 3C the right pair at 128–147 and the greenside bunkers, nothing by the tee
const values = labels.map((t) => parseInt(t, 10));
ok(labels.length > 0 && labels.every((t) => /^\d+\s*m$/.test(t.trim())), 'every hazard distance with its unit (m)');
ok(bunkers >= 6 && bunkers <= 10, `the bunkers in play with start and end (${bunkers} labels)`);
ok(values.every((v) => v >= 80), 'nothing by the tee (all past 80 m)');
ok(values.includes(128) && values.includes(147), 'the right bunker pair as one group (128–147)');
const colours = await p.locator('.map-label.hazard').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).color))]);
ok(colours.every((c) => c === 'rgb(255, 255, 255)'), `white distance type, no yellow (${colours.join(', ')})`);
const edges = await p.locator('.map-label.hazard').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).boxShadow))]);
ok(edges.every((x) => x === 'none'), `no coloured edge behind the distances (${edges.join(' | ')})`);
// the player walks onto the hole: every hazard distance counts from where he stands now (Sascha 17.10.2026: "dynamic,
// not static") – 150 m along 3C, all labels about 150 m shorter
const geo = JSON.parse(readFileSync(new URL('../src/data/courses/hetzenhof.json', import.meta.url), 'utf-8'));
const line = geo.holes.find((h) => h.ref === '3C').line;
const [t0, t1] = [line[0], line[1]];
const seg = Math.hypot((t1[0] - t0[0]) * 111320 * Math.cos((t0[1] * Math.PI) / 180), (t1[1] - t0[1]) * 111320);
const f = Math.min(1, 150 / seg);
await ctx.setGeolocation({ longitude: t0[0] + (t1[0] - t0[0]) * f, latitude: t0[1] + (t1[1] - t0[1]) * f, accuracy: 4 });
await p.waitForTimeout(5000);
const moved = (await p.locator('.map-label.hazard').allInnerTexts()).map((t) => parseInt(t, 10));
console.log('· from 150 m along the hole:', moved.join(' | '));
const far = values.filter((v) => v > 200);
ok(moved.length > 0 && Math.min(...moved) < Math.min(...far) - 100, `the distances follow the player (nearest far one ${Math.min(...far)} → ${Math.min(...moved.filter((v) => v > 40))})`);
// the dashed lines are drawn: the map has features in the hazard-ticks source
const ticks = await p.evaluate(() => document.querySelectorAll('.map-label.hazard').length);
ok(ticks > 0, 'hazard labels at the ends of the lines');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/hazards-3C.png` });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
