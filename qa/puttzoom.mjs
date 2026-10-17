// QA: zoom while placing the putts (Sascha 16.10.2026: "beim Bearbeiten der Putts sollte man reinzoomen können") –
// the buttons zoom in steps and onto the putts, the free green moves the view, a ball still drags when zoomed, the
// putts are saved.  Usage: node qa/puttzoom.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
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
await me.getByRole('button', { name: /Schläge plus eins/ }).click();
await me.getByRole('button', { name: /Schläge plus eins/ }).click();
await me.getByRole('button', { name: /Putts plus eins/ }).click();
await me.getByRole('button', { name: 'Putts auf dem Grün setzen' }).click();
await p.waitForTimeout(500);
const ed = p.locator('.putt-editor');
ok(await ed.isVisible(), 'the putt editor is open');
const stops = await ed.locator('.putt-walk circle').count();
ok((await ed.locator('.putt-walk polyline').count()) === 1 && stops >= 2, `the GPS walk on the green with the spots where he stood (${stops})`);
ok(await ed.getByText('Gestrichelt: dein GPS-Laufweg').isVisible(), 'a line explains the walk');
const width = async () => Number((await ed.locator('svg.putt-green').getAttribute('viewBox')).split(' ')[2]);
const w0 = await width();
await ed.getByRole('button', { name: 'Hineinzoomen' }).click();
const w1 = await width();
ok(w1 < w0 * 0.7, `"+" zooms in (view ${w0.toFixed(1)} → ${w1.toFixed(1)} m)`);
await ed.getByRole('button', { name: 'Auf die Putts' }).click();
const w2 = await width();
ok(w2 < w0 * 0.6, `"Auf die Putts": flag and balls fill the view (${w2.toFixed(1)} m)`);
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
await ed.getByRole('button', { name: 'Auf die Putts' }).click();
const ball = ed.locator('.putt-ball').first().locator('circle').nth(1);
const bb = await ball.boundingBox();
const before = (await ed.locator('.putt-dist text').first().textContent()).trim();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.mouse.down();
await p.mouse.move(bb.x + bb.width / 2 - 40, bb.y + bb.height / 2 + 30, { steps: 6 });
// while dragging: the length large above the green; the ball moves half the finger's way (finer)
const readout = (await ed.locator('.putt-readout').textContent().catch(() => '')).trim();
const nb = await ball.boundingBox();
const movedPx = Math.hypot(nb.x - bb.x, nb.y - bb.y);
await p.mouse.up();
ok(/^Putt 1: \d/.test(readout), `while dragging the length stands above the finger ("${readout}")`);
ok(movedPx > 15 && movedPx < 35, `finer: the ball moved ${Math.round(movedPx)} px for 50 px of the finger`);
ok((await ed.locator('.putt-readout').count()) === 0, 'the readout goes when the finger lifts');
const after = (await ed.locator('.putt-dist text').first().textContent()).trim();
ok(before !== after, `the first ball moved while zoomed (${before} → ${after})`);
// the flag in the editor stays on the green too
await ed.getByRole('button', { name: 'Ganzes Grün' }).click();
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
ok((await ed.getByRole('button', { name: 'Ganzes Grün' }).count()) === 0 && !(await ed.getByRole('button', { name: 'Herauszoomen' }).isEnabled()), '"Ganzes Grün" shows the whole green again (not zoomed)');
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
