// Dress rehearsal for a walking round: Hetzenhof A, 9 holes. At every ball the phone comes out of the pocket
// (visibility "visible", then "hidden" again), the score goes in on the green via the score sheet.
// Afterwards: round finished, "Check shots" finds the shots by itself, the caddie's advice is there.
// Usage: node het9.mjs <app url> [edge|webkit]
import { chromium, webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const engine = process.argv[3] ?? 'edge';
const b = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 6 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

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
await p.fill('input[id^="hcp-"]', '4').catch(() => {}); // 9-hole playing handicap
await p.getByText('Runde starten').click();
await p.waitForTimeout(4000);

// The balls: from the app's own course data (tee, about 200 m along the line or the approach, the green).
const holes = await p.evaluate(async () => {
  const G = await import('/src/lib/geo.ts');
  const T = await import('/src/lib/teeline.ts');
  // only Hetzenhof, the way the app loads it (all courses at once are ~8 MB since the full-resolution tree crowns)
  const S = await import('/src/lib/storage.ts');
  const { SEED_COURSES } = await import('/src/data/seedCourses.ts');
  const C = await import('/src/lib/courses.ts');
  const id = 'osm:relation/1326323';
  await S.ensureGeometry(id);
  const geo = S.loadGeometry(id);
  return C.holesFromTags(SEED_COURSES[id].holeTags)
    .filter((h) => h.loop === 'A' && h.par)
    .map((h) => {
      const d = T.holeForTee(G.holeMapData(geo, h.loop, h.number), id, h.ref, 'Yellow', geo.tee);
      const L = G.lineLength(d.line);
      const balls = [d.tee];
      if (h.par >= 4) balls.push(G.pointAt(d.line, Math.min(205, L - 140)));
      if (h.par === 5) balls.push(G.pointAt(d.line, L - 110));
      return { ref: h.ref, par: h.par, balls, green: G.pointAt(d.line, L - 3) };
    });
});
const setPos = (pt) => ctx.setGeolocation({ latitude: pt[1], longitude: pt[0], accuracy: 6 });
const visibility = (v) =>
  p.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, v);
const stand = async (pt, secs) => {
  for (let k = 0; k < secs; k += 2) {
    await setPos([pt[0] + (Math.random() - 0.5) * 0.00003, pt[1] + (Math.random() - 0.5) * 0.00002]);
    await p.waitForTimeout(2000);
  }
};
const walk = async (a, bpt) => {
  for (let k = 1; k <= 4; k++) {
    await setPos([a[0] + ((bpt[0] - a[0]) * k) / 4, a[1] + ((bpt[1] - a[1]) * k) / 4]);
    await p.waitForTimeout(400);
  }
};

const log = [];
for (const [n, h] of holes.entries()) {
  for (const [k, ball] of h.balls.entries()) {
    if (k > 0) {
      await visibility('hidden');
      await walk(h.balls[k - 1], ball);
    }
    await visibility('visible');
    await stand(ball, 12);
    const holeNo = await p.locator('.map-hole-no').innerText().catch(() => '?');
    if (holeNo.trim() !== h.ref) log.push(`${h.ref} ball ${k + 1}: screen shows ${holeNo}`);
  }
  await visibility('hidden');
  await walk(h.balls[h.balls.length - 1], h.green);
  await visibility('visible');
  await stand(h.green, 14);
  // score on the green via the sheet: par, or bogey every third hole, then back to the map
  await p.locator('.map-score').first().click();
  await p.waitForTimeout(400);
  const want = h.par + (n % 3 === 2 ? 1 : 0);
  // Hole19 steppers: the first + gives par, every further + one more
  for (let k = h.par; k <= want; k++) await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
  await p.locator('.score-panel').getByRole('button', { name: 'Putts plus eins', exact: true }).click();
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await p.waitForTimeout(300);
  if (await p.locator('.score-panel').count()) log.push(`${h.ref}: score sheet did not close`);
  await p.getByRole('button', { name: /Nächstes Loch|Runde beenden/ }).last().click().catch(() => log.push(`${h.ref}: no next button`));
  await p.waitForTimeout(800);
}
console.log(log.join('\n') || 'every ball on the right hole');

const state = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const id = Object.keys(r.entries)[0];
  const track = JSON.parse(localStorage.getItem('golfos.track.v1.' + r.id) ?? '[]');
  const cl = JSON.parse(localStorage.getItem('golfos.caddielog.v1.' + r.id) ?? '{}');
  return { strokes: r.entries[id].map((e) => e.strokes).join(','), track: track.length, opens: track.filter((x) => x[4]).length, caddie: Object.values(cl).map((x) => x.length).join(',') };
});
console.log('round:', JSON.stringify(state));
// finish the round on the scorecard, then the check
await p.getByRole('button', { name: /Speichern & beenden|Runde beenden/ }).first().click().catch(() => {});
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click().catch(() => {});
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click().catch(() => {});
await p.waitForTimeout(1200);
await p.getByRole('button', { name: /Schläge prüfen/ }).click().catch(() => {});
await p.waitForTimeout(3000);
console.log('check notice:', (await p.locator('.notice').first().innerText().catch(() => '-')).replace(/\s+/g, ' '));
const det = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const id = Object.keys(r.entries)[0];
  return r.entries[id].map((e, k) => `${r.holes[k].label}: ${e.detail?.shots.length ?? 0} + ${e.putts} = ${(e.detail?.shots.length ?? 0) + (e.putts ?? 0)} vs ${e.strokes}`).join(' | ');
});
console.log('detected (shots + putts vs score):', det);
console.log('caddie items on the first hole to check:', await p.locator('.caddie-review-item').count());
console.log(errs.join(' / ') || 'no page errors');
await b.close();
