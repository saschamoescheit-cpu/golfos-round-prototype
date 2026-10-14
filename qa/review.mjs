// The round check with a simulated walking round (qa/simtrack.json from the simulator:
// EXPORT=qa/simtrack.json MODES=locked npx tsx scripts/shotsim.ts 1). Score and putts as played; hole 7 gets a penalty
// from the course. Checks: shots found on the first visit, white circles, penalty hint, flag hint, putt in the list.
// Usage: node review.mjs <app url>
import { readFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const sim = JSON.parse(readFileSync(new URL('./simtrack.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (cond, what) => console.log(`${cond ? '✓' : '✗'} ${what}`);

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
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
// the round as played: the simulated track, score = shots + 2 putts (hole 7: + a penalty), finished
await p.evaluate(
  ([track, truth]) => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
    const r = rs[0];
    const id = Object.keys(r.entries)[0];
    r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: truth[k].shots.length + 2 + (k === 6 ? 1 : 0), putts: 2, penalties: k === 6 ? 1 : 0 }));
    r.finishedAt = new Date().toISOString();
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(track));
    sessionStorage.setItem('golfos.paused', r.id);
  },
  [sim.track, sim.truth],
);
await p.reload();
await p.waitForTimeout(1500);
ok((await p.getByText('Schläge prüfen →').count()) === 1, 'home: "Schläge prüfen →" on the round');
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
const notice = (await p.locator('.notice').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/an 9 Löchern erkannt/.test(notice), `shots found on the first visit ("${notice}")`);
const counts = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  return Object.values(r.entries)[0].map((e) => e.detail?.shots.length ?? 0);
});
const truth = sim.truth.map((t) => t.shots.length);
const same = counts.filter((c, k) => c === truth[k]).length;
ok(same >= 7, `shot count right on ${same} of 9 holes (detected ${counts.join(',')} · true ${truth.join(',')})`);
// white circles = stops that are no shot yet; with the phone locked between balls there are few (info, no check)
console.log('· white circles on the first hole to check:', (await p.getByText(/hier bist du stehen geblieben/).count()) ? 'yes' : 'none (all stops are shots)');
ok((await p.getByText(/Fahne dorthin ziehen/).count()) === 1, 'flag hint');
// hole 7: the penalty from the course
for (let k = 0; k < 10; k++) {
  const n = Number((await p.locator('.review-nav').innerText()).match(/Loch ([0-9])/)[1]);
  if (n === 7) break;
  await p.getByRole('button', { name: n < 7 ? 'Nächstes Loch' : 'Voriges Loch' }).click();
  await p.waitForTimeout(500);
}
const notices = (await p.locator('.notice').allInnerTexts()).join(' | ');
const e7 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][6]);
ok(e7.penalties === 1, 'penalty from the course kept on hole 7');
ok(/Strafschlag vom Platz/.test(notices) || e7.detail.shots.some((s) => s.penalty), 'hole 7: penalty placed on a shot (water) or the hint to place it');
ok(!/Dein Score war/.test(notices), 'no false score difference on hole 7');
ok((await p.locator('.review-list li').filter({ hasText: /Putts/ }).count()) === 1, 'putts in the list');
console.log(errs.join(' / ') || 'no page errors');
await b.close();
