// The score paths on the course: "→" without a score opens the sheet and moves on; the GPS moving on to the next
// tee without a score shows the reminder; the scorecard corrects a hole.
// Usage: node score.mjs <app url>
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (cond, what) => console.log(`${cond ? '✓' : '✗'} ${what}`);

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
const hole = async () => (await p.locator('.map-hole-no').innerText().catch(() => '?')).trim();
const stored = (k) => p.evaluate((k) => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][k], k);

// 1 · "→" without a score: the sheet, then on to 2A
await p.getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(500);
ok((await p.locator('.score-panel').count()) === 1, '"→" without a score opens the score sheet');
// Hole19 steppers: the first + gives par, every further + one more
const plus = (what) => p.locator('.score-panel').getByRole('button', { name: what + ' plus eins', exact: true }).first().click();
await plus('Schläge');
await plus('Schläge');
await plus('Strafschläge');
await plus('Putts');
await p.getByRole('button', { name: 'Nächstes Loch' }).click(); // the hole bar stays under the panel (Hole19)
await p.waitForTimeout(800);
// on the next hole the sheet closes by itself – the map shows (Sascha 15.10.2026)
ok((await p.locator('.score-panel').count()) === 0, 'on to the next hole: the score sheet closes by itself');
const e1 = await stored(0);
ok((await hole()) === '2A' && e1.strokes === 5 && e1.putts === 2 && e1.penalties === 1, `strokes 5, penalty 1, putts 2 → on 2A (stored ${e1.strokes}/${e1.penalties}/${e1.putts})`);

// 2 · walk to the 3A tee without a score on 2A: the reminder, "Enter" goes back to 2A's score
const tee3 = await p.evaluate(async () => {
  const G = await import('/src/lib/geo.ts');
  const T = await import('/src/lib/teeline.ts');
  const { SEED_GEOMETRY } = await import('/src/data/seedGeometry.ts');
  const id = 'osm:relation/1326323';
  const geo = SEED_GEOMETRY[id];
  return T.holeForTee(G.holeMapData(geo, 'A', 3), id, '3A', 'Yellow', geo.tee).tee;
});
const vis = (v) =>
  p.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
await vis('hidden');
await ctx.setGeolocation({ latitude: tee3[1], longitude: tee3[0], accuracy: 5 });
await p.waitForTimeout(1200);
await vis('visible');
for (let k = 0; k < 4; k++) {
  await ctx.setGeolocation({ latitude: tee3[1] + k * 1e-6, longitude: tee3[0], accuracy: 5 });
  await p.waitForTimeout(700);
}
// on to 3A by GPS without a score for 2A (Sascha 16.10.2026): the score entry of 2A opens by itself first
const panel = p.getByRole('dialog', { name: 'Score an diesem Loch' });
ok((await panel.isVisible()) && /2A/.test(await panel.innerText()), 'walking on: the score entry of 2A opens by itself');
// closed without a score: on to 3A, the reminder stays
await panel.getByRole('button', { name: 'Zurück zur Karte' }).click();
await p.waitForTimeout(600);
ok((await p.locator('.map-hole-no').innerText()).trim() === '3A', 'closed without a score: on to 3A (the GPS hole)');
const banner = (await p.locator('.map-hint.detected').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Score für 2A fehlt/.test(banner), `reminder: "${banner.trim()}"`);
ok((await stored(1)).strokes == null, 'no par written silently for 2A');
await p.getByRole('button', { name: 'Eintragen', exact: true }).click();
await p.waitForTimeout(600);
ok(/2A/.test(await p.locator('main').innerText()), '"Enter" opens the score of 2A');

// 3 · scorecard: correct hole 1 to 4 strokes, 1 putt
await p.getByRole('button', { name: 'Scorekarte' }).first().click();
await p.waitForTimeout(1200);
await p.locator('.sc-hole').first().click();
await p.waitForTimeout(600);
await p.locator('.sheet').getByRole('button', { name: /Schläge minus eins/ }).first().click();
await p.locator('.sheet .segmented button').filter({ hasText: /^1$/ }).first().click();
await p.locator('.sheet').getByRole('button', { name: 'Fertig' }).click();
await p.waitForTimeout(600);
const e1b = await stored(0);
ok(e1b.strokes === 4 && e1b.putts === 1, `scorecard correction stored (${e1b.strokes}/${e1b.putts})`);

console.log(errs.join(' / ') || 'no page errors');
await b.close();
