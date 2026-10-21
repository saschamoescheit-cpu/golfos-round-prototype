// QA: zoom while placing the putts (Sascha 16.10.2026: "beim Bearbeiten der Putts sollte man reinzoomen können") –
// the buttons zoom in steps and onto the putts, the free green moves the view, a ball still drags when zoomed, the
// putts are saved.  Usage: node qa/puttzoom.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByText('Runde starten').click();
await p.waitForTimeout(5000);
// the flag on the map stays on the green (Sascha 16.10.2026): dragged 250 px away it waits at the green's edge
const flag = p.locator('.map-flag');
const fb = await flag.boundingBox();
await p.mouse.move(fb.x + 4, fb.y + fb.height - 2);
await p.mouse.down();
await p.mouse.move(fb.x - 150, fb.y + 250, { steps: 10 });
// still held: the flag waits at the edge of the green instead of following the finger
const held = await flag.boundingBox();
await p.mouse.up();
await p.waitForTimeout(400);
const moved = Math.round(Math.hypot(held.x - fb.x, held.y - fb.y));
ok(moved < 90, `map: the flag stays on the green while dragged 290 px away (it moved ${moved} px)`);
// walk to the green of 1A and stand at two spots (the putts) – the GPS walk shows in the editor (Sascha 16.10.2026)
const TEE = [9.689329, 48.781065];
const GREEN = [9.69356755600646, 48.781410881427405];
const towards = (f) => [TEE[0] + (GREEN[0] - TEE[0]) * f, TEE[1] + (GREEN[1] - TEE[1]) * f];
const setPos = (pt) => ctx.setGeolocation({ latitude: pt[1], longitude: pt[0], accuracy: 4 });
for (const f of [0.3, 0.6, 0.85, 0.95]) {
  await setPos(towards(f));
  await p.waitForTimeout(700);
}
const stand = async (pt, secs) => {
  for (let k = 0; k < secs; k += 2) {
    await setPos([pt[0] + (Math.random() - 0.5) * 0.00001, pt[1] + (Math.random() - 0.5) * 0.000007]);
    await p.waitForTimeout(2000);
  }
};
await stand(towards(0.975), 16); // the first putt, ~8 m short
await stand(towards(0.997), 16); // the second, ~1 m
// hole 1: 5 strokes, 2 putts, then the pencil to place them on the green
await p.locator('.map-score').click();
await p.waitForTimeout(300);
const me = p.locator('.score-player').first();
// fewer strokes take the putts along (Sascha 18.10.2026: "a birdie cannot have 2 putts"): par 4, 2 putts, down to 2
await me.getByRole('button', { name: /Schläge plus eins/ }).click();
await me.getByRole('button', { name: /Putts plus eins/ }).click();
await me.getByRole('button', { name: /Schläge minus eins/ }).click();
await me.getByRole('button', { name: /Schläge minus eins/ }).click();
await p.waitForTimeout(200);
const two = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]; const e = Object.values(r.entries)[0][0]; return [e.strokes, e.putts]; });
ok(two[0] === 2 && two[1] === 1, `a 2 on a par 4: the putts follow down to 1 (${two.join(' / ')})`);
// back to 5 strokes, 2 putts
for (let k = 0; k < 3; k++) await me.getByRole('button', { name: /Schläge plus eins/ }).click();
await me.getByRole('button', { name: /Putts plus eins/ }).click();
await me.getByRole('button', { name: 'Putts auf dem Grün setzen' }).click();
await p.waitForTimeout(500);
const ed = p.locator('.putt-editor');
ok(await ed.isVisible(), 'the putt editor is open');
ok((await ed.locator('.putt-bunker').count()) >= 1, `the greenside bunkers around the green (${await ed.locator('.putt-bunker').count()})`);
const stops = await ed.locator('.putt-walk circle').count();
ok((await ed.locator('.putt-walk polyline').count()) === 1 && stops >= 2, `the GPS walk on the green with the spots where he stood (${stops})`);
ok(await ed.getByText('Gestrichelt: dein GPS-Laufweg').isVisible(), 'a line explains the walk');
const width = async () => Number((await ed.locator('svg.putt-green').getAttribute('viewBox')).split(' ')[2]);
const w0 = await width();
// no zoom buttons and no explanation any more (Sascha 17.10.2026): two fingers (here the wheel) zoom
ok((await ed.locator('.putt-zoom').count()) === 0 && (await ed.getByText(/Ziehe die Fahne/).count()) === 0, 'no zoom buttons, no explanation');
// mobile WebKit has no wheel: the zoom gesture's event, sent to the green
const wheel = (dy, n) => ed.locator('svg.putt-green').evaluate((svg, [dy, n]) => {
  for (let k = 0; k < n; k++) svg.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
}, [dy, n]);
await wheel(-200, 6);
await p.waitForTimeout(300);
const w1 = await width();
ok(w1 < w0 * 0.7, `zooming in with two fingers (wheel) (view ${w0.toFixed(1)} → ${w1.toFixed(1)} m)`);
// the balls keep their size on the screen
const ballPx = (await ed.locator('.putt-ball circle').nth(1).boundingBox()).width;
ok(ballPx > 12 && ballPx < 40, `a ball is still finger-sized when zoomed (${Math.round(ballPx)} px)`);
// one finger on the free green moves the view
await p.waitForTimeout(400); // the zoom has settled (the long gate run on a busy machine)
const box = await ed.locator('svg.putt-green').boundingBox();
const vb0 = await ed.locator('svg.putt-green').getAttribute('viewBox');
await p.mouse.move(box.x + 12, box.y + 12);
await p.mouse.down();
await p.mouse.move(box.x + 60, box.y + 60, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(200);
const vb1 = await ed.locator('svg.putt-green').getAttribute('viewBox');
ok(vb0 !== vb1, 'dragging the free green moves the view');
// a ball still drags when zoomed
const ball = ed.locator('.putt-ball').first().locator('circle').nth(1);
const bb = await ball.boundingBox();
const before = (await ed.locator('.putt-dist text').first().textContent()).trim();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.mouse.down();
await p.mouse.move(bb.x + bb.width / 2 - 40, bb.y + bb.height / 2 + 30, { steps: 6 });
// while dragging: the length large above the green; the ball moves half the finger's way (finer)
await p.waitForTimeout(120); // the moved ball drawn
const readout = (await ed.locator('.putt-readout').textContent().catch(() => '')).trim();
const nb = await ball.boundingBox();
const movedPx = Math.hypot(nb.x - bb.x, nb.y - bb.y);
await p.mouse.up();
ok(/^Putt 1: \d/.test(readout), `while dragging the length stands above the finger ("${readout}")`);
ok(movedPx > 15 && movedPx < 35, `finer: the ball moved ${Math.round(movedPx)} px for 50 px of the finger`);
ok((await ed.locator('.putt-readout').count()) === 0, 'the readout goes when the finger lifts');
const after = (await ed.locator('.putt-dist text').first().textContent()).trim();
ok(before !== after, `the first ball moved while zoomed (${before} → ${after})`);
// the flag in the editor stays on the green too – zoomed out again first
await wheel(300, 20);
await p.waitForTimeout(300);
const pinG = ed.locator('.putt-pin circle').first();
const pb = await pinG.boundingBox();
const svgBox = await ed.locator('svg.putt-green').boundingBox();
await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
await p.mouse.down();
await p.mouse.move(svgBox.x + 6, svgBox.y + 6, { steps: 8 });
await p.mouse.up();
const inGreen = await ed.locator('svg.putt-green').evaluate((svg) => {
  const c = svg.querySelector('.putt-pin circle');
  const poly = svg.querySelector('.putt-green-shape');
  const pt = svg.createSVGPoint();
  pt.x = Number(c.getAttribute('cx'));
  pt.y = Number(c.getAttribute('cy'));
  return poly.isPointInFill(pt);
});
ok(inGreen, 'editor: the flag dragged into the corner stays on the green');
// where the flag stands (Sascha 21.10.2026): from the front or to the back, and from the nearer edge
const spot = (await ed.locator('.putt-pinspot').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/^Fahne: [\d,]+ (cm|m) (von vorne|bis hinten) · [\d,]+ (cm|m) vom Rand (links|rechts|vorne|hinten)$/.test(spot), `under the green: where the flag stands ("${spot}")`);
{
  // zoomed in, a finger 25 px beside the flag moves the flag – not the green
  // zoomed in as far as the flag stays in view
  const sb = await ed.locator('svg.putt-green').boundingBox();
  const inView = (b) => b && b.x > sb.x + 40 && b.x < sb.x + sb.width - 40 && b.y > sb.y + 40 && b.y < sb.y + sb.height - 40;
  for (let k = 0; k < 6; k++) {
    await wheel(-200, 1);
    await p.waitForTimeout(150);
    if (!inView(await ed.locator('.putt-pin circle').nth(1).boundingBox())) {
      await wheel(200, 1);
      await p.waitForTimeout(150);
      break;
    }
  }
  await p.waitForTimeout(300);
  const pg = await ed.locator('.putt-pin circle').nth(1).boundingBox();
  const vbA = await ed.locator('svg.putt-green').getAttribute('viewBox');
  const fx = pg.x + pg.width / 2 + 25, fy = pg.y + pg.height / 2;
  await p.mouse.move(fx, fy);
  await p.mouse.down();
  await p.mouse.move(fx - 30, fy + 20, { steps: 6 });
  const ro = (await ed.locator('.putt-readout').innerText().catch(() => '')).replace(/\s+/g, ' ');
  await p.mouse.up();
  const vbB = await ed.locator('svg.putt-green').getAttribute('viewBox');
  const pg2 = await ed.locator('.putt-pin circle').nth(1).boundingBox();
  ok(vbA === vbB && Math.hypot(pg2.x - pg.x, pg2.y - pg.y) > 5 && (await width()) < w0 * 0.95, `zoomed in, a finger beside the flag moves the flag, the green stays (view ${(await width()).toFixed(1)} m)`);
  ok(/^Fahne/.test(ro) && /vom Rand/.test(ro), `while dragging the flag: its spot on the green too ("${ro}")`);
  await wheel(300, 20);
  await p.waitForTimeout(300);
}
ok(Math.abs((await width()) - w0) < 0.5, 'zoomed out again: the whole green');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/puttzoom.png' });
await ed.getByRole('button', { name: 'Putts speichern' }).click();
await p.waitForTimeout(400);
const saved = await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const id = r.players.find((x) => x.isMe).id;
  return r.entries[id][0].puttsAt?.balls?.length ?? 0;
});
ok(saved === 2, `both putts saved (${saved})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
