// The score paths on the course: "→" without a score opens the sheet and moves on; the GPS moving on to the next
// tee without a score shows the reminder; the scorecard corrects a hole.
// Usage: node score.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
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

// 0 · "shot here" on the map for every round, green, with undo (Sascha 17.10.2026 – it was in the profile's test mode)
await p.waitForTimeout(1500);
const shotTool = p.getByRole('button', { name: 'Schlag hier erfassen' });
ok((await p.locator('.map-toolbar .map-shot-btn').count()) === 0 && (await p.locator('.map-bottom-tools .map-shot-btn').count()) === 1, '"Schlag hier" bottom right, where "centre" was (Sascha 17.10.2026)');
{
  const sb = await p.locator('.map-shot-btn').boundingBox();
  const ib = await p.getByRole('button', { name: 'Karteninfo' }).boundingBox();
  const vw = p.viewportSize().width;
  ok(sb && sb.x + sb.width > vw - 40, `"Schlag hier" at the right edge, the ⓘ stays left (Sascha 18.10.2026) (${Math.round(sb?.x + sb?.width)} of ${vw})`);
  ok(ib && sb && ib.x < 40 && Math.abs(ib.y + ib.height - (sb.y + sb.height)) < 3, `the map ⓘ bottom left at the height of "shot here" (${Math.round(ib?.y + ib?.height)} / ${Math.round(sb?.y + sb?.height)})`);
}
ok(await shotTool.isVisible(), '"Schlag hier" is a map tool on every round');
await shotTool.click();
await p.waitForTimeout(300);
const manual = () => p.evaluate(() => (JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].manualShots ?? []).length);
ok((await manual()) === 1 && (await p.getByText(/Schlag 1 an 1A: wird gemessen/).isVisible()), 'a tap notes the ball and measures for 5 s');
await p.waitForTimeout(6000);
const acc = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].manualShots[0].acc);
const toast = await p.locator('.test-shot-row').innerText().catch(() => '');
ok(/Schlag 1 an 1A erfasst \(±[\d,]+ m, \d+ Messung(en)?\)/.test(toast) && acc <= 5, `then the averaged spot (±${acc} m): ${toast.replace(/\s+/g, ' ')}`);
await p.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(300);
ok((await manual()) === 0, 'undo takes it back');
// a noted shot stands on the map; a tap on it offers to remove it (Sascha 17.10.2026)
await shotTool.click();
await p.waitForTimeout(400);
const dot = p.locator('.map-hand-shot');
ok((await dot.count()) === 1, 'the noted shot stands on the map');
await dot.first().click();
await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Entfernen', exact: true }).click();
await p.waitForTimeout(300);
ok((await manual()) === 0 && (await p.locator('.map-hand-shot').count()) === 0, 'a tap on it and "Entfernen" removes it');
// pressed by mistake twice: the count on the button lists this hole's shots, each can be removed (Sascha 17.10.2026)
await shotTool.click();
await p.waitForTimeout(300);
await shotTool.click();
await p.waitForTimeout(300);
const count = p.getByRole('button', { name: 'Erfasste Schläge an diesem Loch' });
ok((await count.innerText()).trim() === '2', 'the count on the shot button: 2');
await count.click();
await p.waitForTimeout(300);
ok((await p.locator('.shot-list-row').count()) === 2, 'a tap on the count lists both shots');
await p.locator('.shot-list-row').last().getByRole('button', { name: 'Entfernen' }).click();
await p.waitForTimeout(300);
ok((await manual()) === 1 && (await p.locator('.shot-list-row').count()) === 1, 'one removed from the list, one kept');
await p.getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(6000); // the 5 s measuring of the first is done
// moved on the aerial to the exact spot – to the metre
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].manualShots[0]);
const bb = await p.locator('.map-hand-shot').first().boundingBox();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.mouse.down();
await p.mouse.move(bb.x + bb.width / 2 + 20, bb.y + bb.height / 2 - 30, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(500);
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].manualShots[0]);
ok(after.placed === true && after.acc === 0 && (after.pos[0] !== before.pos[0] || after.pos[1] !== before.pos[1]), 'dragged on the map: the shot stands where it was put');
await count.click();
await p.waitForTimeout(300);
ok(/auf der Karte gesetzt/.test(await p.locator('.hand-list').innerText()), 'the list says it was set on the map');
await p.locator('.shot-list-row').first().getByRole('button', { name: 'Entfernen' }).click();
await p.waitForTimeout(300);
ok((await manual()) === 0 && (await p.locator('.hand-list').count()) === 0, 'the last one removed: the list closes');
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
// the same score panel as on the course (Sascha 20.10.2026)
await p.locator('.score-panel').getByRole('button', { name: /Schläge minus eins/ }).first().click();
for (let k = 0; k < 4 && (await stored(0)).putts !== 1; k++) await p.locator('.score-panel').getByRole('button', { name: (await stored(0)).putts > 1 ? /Putts minus eins/ : /Putts plus eins/ }).first().click();
await p.locator('.score-panel').getByRole('button', { name: 'Zurück zur Scorekarte' }).click();
await p.waitForTimeout(600);
const e1b = await stored(0);
ok(e1b.strokes === 4 && e1b.putts === 1, `scorecard correction stored (${e1b.strokes}/${e1b.putts})`);

console.log(errs.join(' / ') || 'no page errors');
await b.close();
