// QA (Sascha 11.11.2026, USA: "I forgot to place the flag and enter the putts on the round – in the round check I could
// not set flag and putts either"; "sometimes I could not move the putts and the flag"). A finished round without putts
// and without a flag: the putts' row is there with its pencil, the editor sets the number of putts (− / +), the flag is
// taken by its cloth, a ball by its length beside it; saved: putts, flag and balls on the hole.
// Usage: node qa/puttplace.mjs [url]
import { readFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const sim = JSON.parse(readFileSync(new URL('./simtrack.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices[process.env.DEVICE ?? 'iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message) && !/sw.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.tip.shots.v1', '1');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().waitFor({ timeout: 30000 });
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
// the round as played – the score only, no putts, no flag, nothing placed
for (let pass = 0; pass < 2; pass++) {
  if (pass) await p.waitForTimeout(800);
  await p.evaluate(
    ([track, truth]) => {
      const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
      const r = rs[0];
      const id = Object.keys(r.entries)[0];
      r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: truth[k].shots.length + 2, putts: null, puttsAt: undefined }));
      r.finishedAt = new Date().toISOString();
      localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
      localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(track));
      sessionStorage.setItem('golfos.paused', r.id);
    },
    [sim.track, sim.truth],
  );
}
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
const entry = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][0]);
const e0 = await entry();
const strokes0 = e0.strokes;

const row = p.locator('.review-list li.putt-row');
ok((await row.count()) === 1 && /Nicht eingetragen/.test(await row.innerText()), `no putts on the round: the putts' row is there – "${(await row.innerText().catch(() => '')).replace(/\s+/g, ' ')}"`);
const pencil = row.getByRole('button', { name: 'Fahne und Putts auf dem Grün setzen' });
ok((await pencil.count()) === 1, 'its pencil: "Fahne und Putts auf dem Grün setzen"');
await pencil.click();
await p.waitForTimeout(600);
const ed = p.locator('.putt-editor');
ok((await ed.locator('.putt-count .stepper-value').innerText()) === '2' && (await ed.locator('.putt-ball').count()) === 2, 'the editor: 2 putts to start with, two balls');
await ed.getByRole('button', { name: 'Putts plus eins' }).click();
await p.waitForTimeout(200);
ok((await ed.locator('.putt-count .stepper-value').innerText()) === '3' && (await ed.locator('.putt-ball').count()) === 3, '"+": 3 putts, a third ball');

// the flag taken by its cloth (not the hole)
const pinXY = async () => ed.locator('.putt-pin circle').nth(1).evaluate((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
const pin0 = await pinXY();
const cloth = await ed.locator('.putt-pin path').nth(1).boundingBox();
await p.mouse.move(cloth.x + cloth.width / 2, cloth.y + cloth.height / 2);
await p.mouse.down();
await p.mouse.move(cloth.x + cloth.width / 2 + 40, cloth.y + cloth.height / 2 + 30, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(200);
const pin1 = await pinXY();
ok(Math.hypot(pin1[0] - pin0[0], pin1[1] - pin0[1]) > 0.3, `the flag dragged by its cloth moves (${pin0.map((v) => v.toFixed(1))} → ${pin1.map((v) => v.toFixed(1))})`);

// a ball taken by its length beside it
const ballXY = async () => ed.locator('.putt-ball').first().locator('circle').nth(1).evaluate((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);
const ball0 = await ballXY();
const label = await ed.locator('.putt-ball').first().locator('.putt-dist rect').boundingBox();
await p.mouse.move(label.x + label.width * 0.7, label.y + label.height / 2);
await p.mouse.down();
await p.mouse.move(label.x + label.width * 0.7 - 50, label.y + label.height / 2 - 20, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(200);
const ball1 = await ballXY();
ok(Math.hypot(ball1[0] - ball0[0], ball1[1] - ball0[1]) > 0.3, `a ball dragged by its length moves (${ball0.map((v) => v.toFixed(1))} → ${ball1.map((v) => v.toFixed(1))})`);
// the iPhone's finger: it belongs to the ball it touched first – the green taking it over makes the ball "lose" it (a
// bubbling lostpointercapture); that must not end the drag (it did: "sometimes I could not move the putts")
const moved = await ed.evaluate((root) => {
  const svg = root.querySelector('svg.putt-green');
  const ball = root.querySelectorAll('.putt-ball')[1];
  const hit = ball.querySelector('circle');
  const c = ball.querySelectorAll('circle')[1];
  const before = [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))];
  const bb = hit.getBoundingClientRect();
  const at = { x: bb.left + bb.width / 2, y: bb.top + bb.height / 2 };
  const pe = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
  pe('pointerdown', hit, at.x, at.y);
  pe('lostpointercapture', hit, at.x, at.y);
  for (let k = 1; k <= 6; k++) pe('pointermove', svg, at.x + k * 8, at.y + k * 4);
  pe('pointerup', svg, at.x + 48, at.y + 24);
  return new Promise((res) => setTimeout(() => res([before, [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]]), 100));
});
ok(Math.hypot(moved[1][0] - moved[0][0], moved[1][1] - moved[0][1]) > 0.3, `iPhone: the ball's lost finger does not end the drag (${moved[0].map((v) => v.toFixed(1))} → ${moved[1].map((v) => v.toFixed(1))})`);
if (process.env.SHOTS) await ed.screenshot({ path: `${process.env.SHOTS}/puttplace.png` });

await p.getByRole('button', { name: 'Putts speichern' }).click(); // floating since 11.11.2026
await p.waitForTimeout(800);
const e1 = await entry();
ok(e1.putts === 3 && e1.puttsAt?.balls?.length === 3 && !!e1.puttsAt?.pin, `saved: 3 putts, flag and three balls (${e1.putts} · ${e1.puttsAt?.balls?.length})`);
ok(e1.strokes === strokes0, `the score entered stays (${strokes0} → ${e1.strokes})`);
ok(/3 Putts/.test(await row.innerText()) && /1: .* · 2: .* · 3: /.test((await row.innerText()).replace(/\s+/g, ' ')), `the row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
