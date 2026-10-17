// QA (Sascha 17.10.2026): hazard distances on the hole map – every bunker and water ahead with start and end, dashed
// lines out to the side, the labels beside the hazard (not on it), white type (no yellow). Hole 3C at Hetzenhof has
// three bunkers right of the line. Usage: node qa/hazards.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
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
ok(bunkers >= 14, `start and end of all seven bunkers shown (${bunkers} labels) – none dropped`);
const colours = await p.locator('.map-label.hazard').evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).color))]);
ok(colours.every((c) => c === 'rgb(255, 255, 255)'), `white distance type, no yellow (${colours.join(', ')})`);
// the dashed lines are drawn: the map has features in the hazard-ticks source
const ticks = await p.evaluate(() => document.querySelectorAll('.map-label.hazard').length);
ok(ticks > 0, 'hazard labels at the ends of the lines');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/hazards-3C.png` });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
