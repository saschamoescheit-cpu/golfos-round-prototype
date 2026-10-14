// Dress rehearsal on any bundled course (night run 15./16.10.2026): a walking round over the first hole option,
// like qa/het9.mjs on Hetzenhof A. At every ball the phone comes out of the pocket, the score goes in on the green.
// Afterwards: hole detection per ball, the shots the check finds, the caddie's log – and page errors.
// Usage: node rehearsal.mjs <app url> "<course name to search>" <course id> [seconds standing per ball]
import { chromium, devices } from 'playwright';

const [url = 'http://localhost:5173/', search, courseId, standArg] = process.argv.slice(2);
const STAND = Number(standArg ?? 12);
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.78, longitude: 9.69, accuracy: 6 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const out = { course: search, holes: 0, wrongHole: [], shots: '', exact: 0, caddie: '', errors: [] };

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.tip.shots.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', search);
await p.waitForTimeout(2000);
await p.locator('button.list-item').filter({ hasText: search }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByText('Runde starten').click();
await p.waitForTimeout(4000);

// the balls from the app's own data for the round's holes and tee
const holes = await p.evaluate(async (courseId) => {
  const G = await import('/src/lib/geo.ts');
  const T = await import('/src/lib/teeline.ts');
  const S = await import('/src/lib/storage.ts');
  await S.ensureGeometry(courseId);
  const geo = S.loadGeometry(courseId);
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  return r.holes.map((h) => {
    const d = T.holeForTee(G.holeMapData(geo, h.loop, h.number), courseId, h.label, r.tee ?? null, geo.tee);
    if (!d) return { ref: h.label, par: h.par, balls: [], green: null };
    const L = G.lineLength(d.line);
    const balls = [d.tee];
    if (h.par >= 4) balls.push(G.pointAt(d.line, Math.min(205, L - 140)));
    if (h.par === 5) balls.push(G.pointAt(d.line, L - 110));
    return { ref: h.label, par: h.par || 4, balls, green: G.pointAt(d.line, L - 3) };
  });
}, courseId);
out.holes = holes.length;
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
const walk = async (a, c) => {
  for (let k = 1; k <= 4; k++) {
    await setPos([a[0] + ((c[0] - a[0]) * k) / 4, a[1] + ((c[1] - a[1]) * k) / 4]);
    await p.waitForTimeout(400);
  }
};

for (const [n, h] of holes.entries()) {
  if (!h.green) {
    out.wrongHole.push(`${h.ref}: no hole data`);
    continue;
  }
  if (n > 0) {
    await visibility('hidden');
    await walk(holes[n - 1].green ?? h.balls[0], h.balls[0]);
  }
  for (const [k, ball] of h.balls.entries()) {
    if (k > 0) {
      await visibility('hidden');
      await walk(h.balls[k - 1], ball);
    }
    await visibility('visible');
    await stand(ball, STAND);
    const holeNo = (await p.locator('.map-hole-no').innerText().catch(() => '?')).trim();
    if (holeNo !== h.ref) out.wrongHole.push(`${h.ref} ball ${k + 1}: screen ${holeNo}`);
  }
  await visibility('hidden');
  await walk(h.balls[h.balls.length - 1], h.green);
  await visibility('visible');
  await stand(h.green, STAND + 2);
  await p.locator('.map-score').first().click().catch(() => out.wrongHole.push(`${h.ref}: no score button`));
  await p.waitForTimeout(400);
  const want = h.par + (n % 3 === 2 ? 1 : 0);
  for (let k = h.par; k <= want; k++) await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click().catch(() => {});
  await p.locator('.score-panel').getByRole('button', { name: 'Putts plus eins', exact: true }).click().catch(() => {});
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click().catch(() => {});
  await p.waitForTimeout(300);
  if (n < holes.length - 1) {
    await p.getByRole('button', { name: /Nächstes Loch/ }).last().click().catch(() => out.wrongHole.push(`${h.ref}: no next button`));
    await p.waitForTimeout(800);
  }
}

const state = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const cl = JSON.parse(localStorage.getItem('golfos.caddielog.v1.' + r.id) ?? '{}');
  return { caddie: Object.values(cl).map((x) => x.length).join(',') };
});
out.caddie = state.caddie;
// finish, then the shot check
await p.locator('.hole-bar-handle').click().catch(() => {});
await p.locator('.hole-drawer').getByRole('button', { name: 'Runde beenden' }).click().catch(() => {});
await p.getByRole('button', { name: 'Speichern & beenden' }).first().click().catch(() => {});
await p.waitForTimeout(1500);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click().catch(() => {});
await p.waitForTimeout(4000);
const det = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const id = Object.keys(r.entries)[0];
  return r.entries[id].map((e, k) => ({ ref: r.holes[k].label, shots: e.detail?.shots.length ?? 0, putts: e.putts ?? 0, strokes: e.strokes }));
});
out.shots = det.map((d) => `${d.ref}:${d.shots + d.putts}/${d.strokes}`).join(' ');
out.exact = det.filter((d) => d.strokes != null && d.shots + d.putts === d.strokes).length;
out.errors = errs;
console.log(JSON.stringify(out));
await b.close();
