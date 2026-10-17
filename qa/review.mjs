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
// the round as played: the simulated track, score = shots + 2 putts (hole 7: + a penalty), finished
await p.evaluate(
  ([track, truth]) => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
    const r = rs[0];
    const id = Object.keys(r.entries)[0];
    r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: truth[k].shots.length + 2 + (k === 6 ? 1 : 0), putts: 2, penalties: k === 6 ? 1 : 0 }));
    // hole 1: the putts placed on the course (Sascha 16.10.2026: they must show in the check and stay editable)
    r.entries[id][0].puttsAt = { pin: [9.69356755600646, 48.781410881427405], balls: [[9.6935, 48.78134], [9.693562, 48.781402]] };
    r.finishedAt = new Date().toISOString();
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(track));
    sessionStorage.setItem('golfos.paused', r.id);
  },
  [sim.track, sim.truth],
);
await p.reload();
await p.waitForTimeout(1500);
ok((await p.locator('.tabbar-dot').count()) === 1, 'menu: dot on "Runden"');
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
ok((await p.locator('ul.list .signed-mark[aria-label="Schläge prüfen"]').count()) === 1, 'rounds tab: the green magnifier on the round to check (no text hint)');
ok((await p.getByText('Schläge prüfen →').count()) === 0, 'rounds tab: no green text hint any more');
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
// slim (Sascha 16.10.2026): no explanations, no detect link, no caddie rating; score above the map
ok((await p.getByText(/Fahne dorthin ziehen|Tippe, wo dein Ball lag|Schläge aus der GPS-Spur erkennen|Caddie: \d+ von/).count()) === 0, 'no explanations, no detect link, no caddie count');
const top = await p.locator('.review').evaluate((el) => {
  const score = el.querySelector('.row .stepper')?.getBoundingClientRect().top ?? 9999;
  const map = el.querySelector('.review-map')?.getBoundingClientRect().top ?? 0;
  return score < map;
});
ok(top, 'score of the hole above the map');
ok((await p.locator('.review-map').boundingBox()).height < 0.5 * 844, 'the map leaves room below it on the iPhone');
const tool = p.locator('.review-tools .map-tool');
await tool.click();
await p.waitForTimeout(1500);
ok((await tool.getAttribute('aria-pressed')) === 'true', 'switch to 2D and back – the same tool as on the course');
await tool.click();
await p.waitForTimeout(800);
// hole 1: the putts placed on the course show on the map and in the list, the editor opens with them
const labels = (await p.locator('.review').innerText()).replace(/\s+/g, ' ');
ok((await p.locator('.map-shot-dot.green').allInnerTexts()).join(',') === 'P1,P2', 'hole 1: the placed putts on the map as small P1, P2');
ok(/1: [0-9,]+ m · 2: [0-9,]+ (m|cm)/.test(labels), 'hole 1: the putt lengths in the list');
await p.getByRole('button', { name: 'Putts auf dem Grün bearbeiten' }).click();
await p.waitForTimeout(500);
ok((await p.locator('.putt-editor .putt-ball').count()) === 2, 'the putt editor opens with the two placed balls');
await p.locator('.putt-editor').getByRole('button', { name: /Abbrechen/ }).click();
await p.waitForTimeout(300);
// a shot dragged out of bounds (Sascha 16.10.2026, 6C): penalty stroke and a new shot from the same spot
const before1 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots.length);
const m2 = p.locator('.map-shot-dot').filter({ hasText: /^2/ }).first();
const b2 = await m2.boundingBox();
await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await p.mouse.down();
const mapBox = await p.locator(".review-map").boundingBox();
await p.mouse.move(mapBox.x + 20, b2.y + b2.height / 2, { steps: 8 });
const readout = (await p.locator('.map-drag-readout').innerText().catch(() => '')).trim();
const rb = await p.locator('.map-drag-readout').boundingBox();
const vw = p.viewportSize().width;
await p.mouse.up();
ok(rb && rb.x >= 8 && rb.x + rb.width <= vw - 8 && Math.abs(rb.x + rb.width / 2 - vw / 2) < 3, `the readout whole and centred on the screen (${rb ? Math.round(rb.x) + '–' + Math.round(rb.x + rb.width) : '–'} of ${vw})`);
await p.waitForTimeout(800);
ok(/^Aus – Strafschlag \+ neuer Schlag/.test(readout), `while dragging out: "${readout}" at the top of the map`);
const h1 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots);
const sameSpot = h1[1]?.pos && h1[0].pos && Math.abs(h1[1].pos[0] - h1[0].pos[0]) < 1e-9 && Math.abs(h1[1].pos[1] - h1[0].pos[1]) < 1e-9;
ok(h1[0].penalty && h1[0].penaltyKind === "ob" && sameSpot && h1.length === before1, `out of bounds: shot 1 +1 penalty, shot 2 again from the tee (${h1.length} shots)`);
// a shot missing: "+ Schlag hinzufügen", a tap on the map – the new shot with its sheet (Sascha 17.10.2026)
const shotsNow = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots.length);
const n0 = await shotsNow();
await p.getByRole('button', { name: '+ Schlag hinzufügen' }).click();
await p.waitForTimeout(400);
ok(/Tippe auf die Karte, wo der Schlag gespielt wurde/.test(await p.locator('.notice').allInnerTexts().then((t) => t.join(' '))), '"+ Schlag hinzufügen": the hint to tap the map');
const mb = await p.locator('.review-map').boundingBox();
await p.mouse.click(mb.x + mb.width * 0.3, mb.y + mb.height * 0.55);
await p.waitForTimeout(600);
ok((await shotsNow()) === n0 + 1, `a tap on the map adds the shot (${n0} → ${await shotsNow()})`);
ok((await p.locator('.sheet').count()) === 1, 'its sheet opens for the club');
await p.locator('.sheet').getByRole('button', { name: 'Schließen' }).first().click();
await p.waitForTimeout(300);
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
// confirming the hole keeps the score from the course (the detection may miss a shot, the penalty is not placed yet)
const before = e7.strokes;
await p.locator('.btn-primary').filter({ hasText: /bestätigen/ }).click();
await p.waitForTimeout(600);
const after = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][6].strokes);
ok(after === before, `confirming hole 7 keeps the score from the course (${before} → ${after})`);
// the export is out again (Sascha 16.10.2026: "vorerst aus der Webversion entfernen")
ok((await p.getByRole('button', { name: /Runde exportieren/ }).count()) === 0, 'no export button');
console.log(errs.join(' / ') || 'no page errors');
await b.close();
