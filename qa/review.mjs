// The round check with a simulated walking round (qa/simtrack.json from the simulator:
// EXPORT=qa/simtrack.json MODES=locked npx tsx scripts/shotsim.ts 1). Score and putts as played; hole 7 gets a penalty
// from the course. Checks: shots found on the first visit, white circles, penalty hint, flag hint, putt in the list.
// Usage: node review.mjs <app url>
import { readFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const sim = JSON.parse(readFileSync(new URL('./simtrack.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
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
// the round as played: the simulated track, score = shots + 2 putts (hole 7: + a penalty), finished – set twice: under
// load the hole screen may still save its own copy right after the first time
for (let pass = 0; pass < 2; pass++) {
  if (pass) await p.waitForTimeout(800);
  await p.evaluate(
  ([track, truth]) => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
    const r = rs[0];
    const id = Object.keys(r.entries)[0];
    r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: truth[k].shots.length + 2 + (k === 6 ? 1 : 0), putts: 2, penalties: k === 6 ? 1 : 0 }));
    // hole 1: the putts placed on the course (Sascha 16.10.2026: they must show in the check and stay editable)
    r.entries[id][0].puttsAt = { pin: [9.69356755600646, 48.781410881427405], balls: [[9.6935, 48.78134], [9.693562, 48.781402]] };
    r.finishedAt = new Date().toISOString();
    // hole 2 noted by hand on the course: the tee shot and the ball on the green
    r.manualShots = [{ hole: 1, pos: truth[1].shots[0], t: 1, acc: 3 }, { hole: 1, pos: truth[1].green, t: 2, acc: 3 }];
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(track));
    sessionStorage.setItem('golfos.paused', r.id);
  },
  [sim.track, sim.truth],
  );
}
await p.reload();
await p.waitForTimeout(1500);
// the dot on "Runden" (a round to check) – the profile may have its own (the bag's measured distances)
const roundsTab = p.locator('.tabbar button').filter({ hasText: 'Runden' });
await roundsTab.locator('.tabbar-dot').waitFor({ timeout: 8000 }).catch(() => {});
ok((await roundsTab.locator('.tabbar-dot').count()) === 1, 'menu: dot on "Runden"');
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
ok((await p.locator('ul.list .signed-mark[aria-label="prüfen & signieren"]').count()) === 1, 'rounds tab: the green pen on the round to check & sign (no text hint)');
ok((await p.getByText('Schläge prüfen →').count()) === 0, 'rounds tab: no green text hint any more');
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
const notice = (await p.locator('.notice').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/an 9 Löchern/.test(notice) && /aus deinen „Schlag hier“-Punkten/.test(notice), `shots on the first visit – from the places noted by hand where there are some ("${notice}")`);
if (process.env.SHOTS) await p.locator('.review-map').screenshot({ path: process.env.SHOTS + '/review-map.png' });
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
  const score = el.querySelector('.review-score')?.getBoundingClientRect().top ?? 9999;
  const map = el.querySelector('.review-map')?.getBoundingClientRect().top ?? 0;
  return score < map;
});
ok(top, 'score of the hole above the map');
// the score as entered, edited behind its pencil in the course's score panel (Sascha 20.10.2026)
{
  ok((await p.locator('.review .stepper').count()) === 0 && (await p.locator('.review .segmented').count()) === 0, 'the score shown like the scorecard result (strokes · to par · putts), no steppers above the map');
  ok((await p.locator('.review-score .sc-big').count()) === 1 && /Schläge/.test(await p.locator('.review-score').innerText()) && /Putts/.test(await p.locator('.review-score').innerText()), 'strokes big, to par and putts beside it');
  const val = (await p.locator('.review-score').innerText()).trim();
  await p.getByRole('button', { name: /^Score an Loch .* bearbeiten$/ }).click();
  await p.waitForTimeout(300);
  const panel = p.locator('.score-panel');
  ok((await panel.getByRole('button', { name: /Strafschläge plus eins/ }).count()) === 1 && (await panel.getByText('Sand Shots').count()) === 1, 'the pencil opens the score panel of the course (sand shots, penalties)');
  await panel.getByRole('button', { name: /^Schläge plus eins/ }).click();
  await p.waitForTimeout(200);
  await panel.getByRole('button', { name: /^Schläge minus eins/ }).click();
  await p.waitForTimeout(200);
  await panel.getByRole('button', { name: 'Zurück zu Schläge prüfen' }).click();
  await p.waitForTimeout(300);
  ok((await p.locator('.score-panel').count()) === 0 && (await p.locator('.review-score').innerText()).trim() === val, `back in the shot check, the score as before (${val})`);
}
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
await p.waitForTimeout(1200); // the map at rest before a mark is taken
const m2 = p.locator('.map-shot-dot').filter({ hasText: /^2/ }).first();
const b2 = await m2.boundingBox();
await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await p.mouse.down();
const mapBox = await p.locator(".review-map").boundingBox();
// a little way first: only the metres (Sascha 20.10.2026: no "2 ·", no "from … →")
await p.mouse.move(b2.x + b2.width / 2 + 15, b2.y + b2.height / 2 + 10, { steps: 4 });
const metres = (await p.locator('.map-drag-readout').innerText().catch(() => '')).trim();
ok(/^[0-9,]+ (m|yd)$/.test(metres), `while dragging: only the metres ("${metres}")`);
await p.mouse.move(mapBox.x + 20, b2.y + b2.height / 2, { steps: 8 });
const readout = (await p.locator('.map-drag-readout').innerText().catch(() => '')).trim();
const rb = await p.locator('.map-drag-readout').boundingBox();
const vw = p.viewportSize().width;
await p.mouse.up();
void vw;
ok(rb && rb.x >= mapBox.x + 4 && rb.x + rb.width <= mapBox.x + mapBox.width - 4 && rb.y >= Math.max(mapBox.y, 0) && rb.y < Math.max(mapBox.y, 0) + 60 && /* on the screen, at the top of the visible map */ Math.abs(rb.x + rb.width / 2 - (mapBox.x + mapBox.width / 2)) < 3, `the readout in the map window, whole, centred and on the screen (${rb ? Math.round(rb.x) + '–' + Math.round(rb.x + rb.width) + ' / y ' + Math.round(rb.y) : '–'} in ${Math.round(mapBox.x)}–${Math.round(mapBox.x + mapBox.width)} / y ${Math.round(mapBox.y)})`);
await p.waitForTimeout(800);
ok(/^Aus – Strafschlag \+ neuer Schlag/.test(readout), `while dragging out: "${readout}" at the top of the map`);
const h1 = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots);
const sameSpot = h1[1]?.pos && h1[0].pos && Math.abs(h1[1].pos[0] - h1[0].pos[0]) < 1e-9 && Math.abs(h1[1].pos[1] - h1[0].pos[1]) < 1e-9;
ok(h1[0].penalty && h1[0].penaltyKind === "ob" && sameSpot && h1.length === before1, `out of bounds: shot 1 +1 penalty, shot 2 again from the tee (${h1.length} shots)`);
// a shot missing: "+ Schlag hinzufügen", a tap on the map – the new shot with its sheet (Sascha 17.10.2026)
const shotsNow = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots.length);
const n0 = await shotsNow();
ok((await p.getByRole('button', { name: '+ Schlag hinzufügen' }).count()) === 0, 'adding a shot is the "shot here" symbol, no big button');
await p.getByRole('button', { name: 'Schlag hinzufügen', exact: true }).click();
await p.waitForTimeout(400);
ok(/Tippe auf die Karte, wo der Schlag gespielt wurde/.test(await p.locator('.notice').allInnerTexts().then((t) => t.join(' '))), '"+ Schlag hinzufügen": the hint to tap the map');
const mb = await p.locator('.review-map').boundingBox();
await p.mouse.click(mb.x + mb.width * 0.3, mb.y + mb.height * 0.55);
await p.waitForTimeout(600);
ok((await shotsNow()) === n0 + 1, `a tap on the map adds the shot (${n0} → ${await shotsNow()})`);
ok((await p.locator('.sheet').count()) === 1, 'its sheet opens for the club');
{
  // the lies: semi rough next to rough (Sascha 18.10.2026), all on the screen
  const lies = await p.locator('.sheet .segmented').first().locator('button').allInnerTexts();
  const fits = await p.locator('.sheet .segmented').first().evaluate((e) => e.getBoundingClientRect().right <= innerWidth + 1 && [...e.querySelectorAll('button')].every((b) => b.scrollWidth <= b.clientWidth + 1)); // no word cut off
  ok(lies.includes('Semi Rough') && lies.indexOf('Semi Rough') === lies.indexOf('Fairway') + 1 && lies.includes('Vorgrün') && fits, `lie: "Semi Rough" after fairway, "Vorgrün" too, nothing cut off (${lies.join(' · ')})`);
  ok((await p.locator('.sheet .club-grid').getByRole('button', { name: /Texas Wedge/ }).count()) === 1, 'club: the putter from off the green (Texas wedge) to choose');
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/shot-sheet.png' });
}
await p.locator('.sheet').getByRole('button', { name: 'Schließen' }).first().click();
await p.waitForTimeout(300);
// reorder: hold the grip of the last shot and move it to the top (Sascha 17.10.2026)
const order = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0].detail.shots.map((x) => x.pos.join(',')));
const o0 = await order();
const grips = p.locator('.review-list .row-grip');
await p.locator('.review-list').scrollIntoViewIfNeeded();
await p.waitForTimeout(200);
const gl = await grips.last().boundingBox();
const gf = await grips.first().boundingBox();
await p.mouse.move(gl.x + gl.width / 2, gl.y + gl.height / 2);
await p.mouse.down();
await p.mouse.move(gl.x + gl.width / 2, gf.y + gf.height / 2 - 4, { steps: 10 });
await p.mouse.up();
await p.waitForTimeout(400);
const o1 = await order();
ok(o1.length === o0.length && o1[0] === o0[o0.length - 1] && o1[1] === o0[0], `the last shot dragged to the top (${o0.length} shots)`);
// …and by holding the row itself (Sascha 18.10.2026: "take hold of a shot and move it"): a long press lifts it
{
  const rows = p.locator('.review-list .shot-row');
  const rf = await rows.first().boundingBox();
  const rl = await rows.last().boundingBox();
  await p.mouse.move(rf.x + 40, rf.y + rf.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(650);
  const lifted = (await p.locator('.review-list li.dragging').count()) === 1;
  await p.mouse.move(rf.x + 40, rl.y + rl.height / 2 + 4, { steps: 10 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const o2 = await order();
  ok(lifted && o2[o2.length - 1] === o1[0] && (await p.locator('.sheet').count()) === 0, `held and moved by the row: the first shot to the end, the sheet stays shut (${o2.length} shots)`);
  // a short tap still opens the shot
  await rows.first().click();
  await p.waitForTimeout(300);
  ok((await p.locator('.sheet').count()) === 1, 'a short tap still opens the shot');
  await p.locator('.sheet').getByRole('button', { name: 'Schließen' }).click();
  await p.waitForTimeout(200);
}
// the iPhone (Sascha 20.10.2026: "neither holding nor the grip works"): a finger goes by its own touch events – the grip
// at once, a row after a moment held still
{
  const touch = (sel, type, x, y, nth = 'last') =>
    p.evaluate(({ sel, type, x, y, nth }) => {
      const els = document.querySelectorAll(sel);
      const el = sel === 'window' ? window : els[nth === 'last' ? els.length - 1 : 0];
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    }, { sel, type, x, y, nth });
  const drag = async (sel, nth, from, to, hold) => {
    const kept = await touch(sel, 'touchstart', from.x, from.y, nth);
    if (hold) await p.waitForTimeout(600);
    for (let k = 1; k <= 8; k++) await touch('window', 'touchmove', from.x, from.y + ((to.y - from.y) * k) / 8);
    await touch('window', 'touchend', 0, 0);
    await p.waitForTimeout(400);
    return kept;
  };
  const centre = async (loc) => { const bb = await loc.boundingBox(); return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
  const o2 = await order();
  const g = await centre(p.locator('.review-list .row-grip').last());
  const top = await centre(p.locator('.review-list .row-grip').first());
  const still = await drag('.review-list .row-grip', 'last', g, { y: top.y - 4 }, false);
  const o3 = await order();
  ok(still && o3[0] === o2[o2.length - 1] && o3[1] === o2[0], 'iPhone: the grip takes the shot at once, the page keeps still, the last shot to the top');
  const r0 = await centre(p.locator('.review-list .shot-row').first());
  const rl = await centre(p.locator('.review-list .shot-row').last());
  await drag('.review-list .shot-row', 'first', r0, { y: rl.y + 4 }, true);
  const o4 = await order();
  ok(o4[o4.length - 1] === o3[0] && (await p.locator('.sheet').count()) === 0, 'iPhone: a row held still is lifted and moved to the end');
}
// delete in the row, without opening the shot
const before2 = (await order()).length;
await p.getByRole('button', { name: 'Schlag 1 löschen' }).click();
await p.waitForTimeout(400);
ok((await order()).length === before2 - 1 && (await p.locator('.sheet').count()) === 0, 'the bin in the row deletes the shot, no sheet');
// hole 2: the shots noted by hand on the course taken over with one tap, undo brings the others back
await p.getByRole('button', { name: 'Nächstes Loch' }).first().click();
await p.waitForTimeout(1200);
const det2 = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][1].detail);
const before2d = JSON.stringify((await det2())?.shots ?? []);
const take = p.getByRole('button', { name: /von Hand erfassten Schläge übernehmen/ });
// the places noted by hand are taken over by themselves on the first visit (Sascha 18.10.2026) – no button any more
const d2 = await det2();
ok(d2?.fromHand && d2.shots.length === 1 && d2.shots[0].lie === 'tee' && Array.isArray(d2.onGreen) && (await take.count()) === 0, `hole 2: the shots noted by hand taken over by themselves – the tee shot and the ball on the green, no button (${d2?.shots.length} shot)`);
void before2d;
await p.getByRole('button', { name: 'Voriges Loch' }).first().click();
await p.waitForTimeout(800);
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
await p.locator('.btn-primary').filter({ hasText: /passt/ }).click();
await p.waitForTimeout(600);
const after = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][6].strokes);
ok(after === before, `confirming hole 7 keeps the score from the course (${before} → ${after})`);
// the export is out again (Sascha 16.10.2026: "vorerst aus der Webversion entfernen")
ok((await p.getByRole('button', { name: /Runde exportieren/ }).count()) === 0, 'no export button');
console.log(errs.join(' / ') || 'no page errors');
await b.close();
