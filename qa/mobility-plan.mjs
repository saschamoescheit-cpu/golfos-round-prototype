// The time a day and the range warm-up (Sascha 31.10.2026: "special drills for 15, 30, 45 and 60 min a day … and an
// individual warm-up of 5–7 min for the range, so you warm up your movement limits in particular"). From a screening:
// the four times build plans of about that length (a longer day moves through first and adds sets), the session
// takes the extra sets; the warm-up is made for the areas with the biggest gap, the app leads it by itself to the end.
// Usage: node mobility-plan.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let bad = 0;
let n = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const shot = async (name) => shots && p.screenshot({ path: `${shots}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });

await p.goto(url);
await p.waitForTimeout(800);
// Sascha's screening of 29.10.2026 (the physio's TPI form): stiff in the hips, the balance and the back of the legs,
// the trunk turns well
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fakeSpeed', '20');
  const at = '2026-10-29T15:30:00Z';
  const m = (value, grade = 'limited') => ({ value, grade, source: 'camera', at });
  const results = {
    'pelvic-rotation': { both: m(15, 'fail') },
    'single-leg': { left: m(4, 'fail'), right: m(3, 'fail') },
    'seated-rotation': { left: m(52, 'pass'), right: m(50, 'pass') },
    'deep-squat': { both: m(3, 'pass') },
    'toe-touch': { both: m(9) },
    bridge: { left: m(5, 'fail'), right: m(6, 'fail') },
    neck: { left: m(58), right: m(60) },
  };
  const s = { id: 'tpi', kind: 'full', tests: Object.keys(results), createdAt: at, finishedAt: at, current: 6, hand: 'right', results };
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([s]));
  localStorage.setItem('golfos.mobility.goal.v1', JSON.stringify({ id: 'goal', hcp: 15, focus: ['consistency'], at }));
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(400);

// the four times a day
const chips = await p.locator('.mob-plan-time .chip').allInnerTexts();
ok(chips.join('|') === '15 Min.|30 Min.|45 Min.|60 Min.', `the time a day: ${chips.join(', ')}`);
const plan = {};
for (const m of [15, 30, 45, 60]) {
  await p.locator('.mob-plan-time .chip').filter({ hasText: `${m} Min.` }).click();
  await p.waitForTimeout(150);
  const txt = await p.locator('.mob-plan-time').innerText();
  const got = Number(/etwa (\d+) Min\./.exec(txt)?.[1]);
  const drills = Number(/(\d+) Übungen/.exec(txt)?.[1]);
  plan[m] = { got, drills, txt };
  ok(got >= m * 0.85 && got <= m * 1.06, `${m} min: a plan of about ${got} min with ${drills} drills`);
  if (m >= 30) ok(/zum Durchbewegen/.test(txt), `${m} min: moving through first (${txt.split('\n').pop()})`);
  if (m === 60) await shot('plan-60');
}
ok(plan[15].drills <= plan[30].drills && plan[30].drills <= plan[45].drills && plan[45].drills <= plan[60].drills, `longer days, more drills (${[15, 30, 45, 60].map((m) => plan[m].drills).join(' ≤ ')})`);

// 60 min: the session takes the extra sets of the focus drills
await p.locator('.mob-train-start').click();
await p.locator('.mob-setup').waitFor({ timeout: 10000 });
const setup = await p.locator('.mob-train-list').innerText();
ok(/zum Durchbewegen/.test(setup), 'the setup names the drills to move through');
ok(/Sätze/.test(setup), 'the setup shows more sets on the long day');
const sess = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]')[0] ?? null);
ok(!sess || sess.minutes >= 51, `the session keeps its time (${sess?.minutes ?? 'not yet saved'})`);
await shot('setup-60');
await p.locator('.topbar .icon-btn, .topbar button').first().click();
await p.waitForTimeout(300);
const leave = p.locator('.sheet .btn-primary').filter({ hasText: 'beenden' });
if (await leave.isVisible().catch(() => false)) await leave.click();
await p.waitForTimeout(300);

// the range warm-up
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(300);
const card = await p.locator('.mob-warmup-card').innerText();
ok(/Range-Warmup/.test(card) && /Etwa [5-7] Min\./.test(card), `the warm-up card: ${card.split('\n').slice(1, 2).join('')}`);
ok(/Stabilität|Hüfte/.test(card), 'made for the areas with the biggest gap (balance, hips)');
await shot('warmup-card');
await p.locator('.mob-warmup-open').click();
await p.locator('.mob-warmup .mob-setup').waitFor({ timeout: 10000 });
const moves = await p.locator('.mob-warmup .mob-train-list .title').allInnerTexts();
ok(moves.length >= 6 && moves[0] === 'Rumpf drehen mit Schläger vor der Brust' && moves.at(-1) === 'Ganze Schwünge, jedes Mal schneller', `the moves: ${moves.join(' · ')}`);
ok(moves.includes('Golfhaltung auf einem Bein') && moves.includes('Hüfte drehen in Golfhaltung'), 'the balance and the hips get their moves');
const startBtn = p.locator('.mob-warmup-start');
const startBox = await startBtn.boundingBox();
const listBox = await p.locator('.mob-warmup .mob-train-list').boundingBox();
ok(startBox && listBox && startBox.y > listBox.y + listBox.height - 1, 'Start below the list (not floating)');
await shot('warmup-setup');
await startBtn.click();
await p.locator('.mob-warmup-player').waitFor({ timeout: 10000 });
await p.locator('.mob-warmup-stage canvas').waitFor({ timeout: 30000 }).catch(() => {});
ok(await p.locator('.mob-warmup-stage canvas').isVisible().catch(() => false), 'the figure shows the move');
const first = await p.locator('.mob-warmup-name').innerText();
ok(first === moves[0], `the first move: ${first}`);
await shot('warmup-run');
// pause and on
await p.locator('.mob-coach-pause').click();
ok(await p.getByText('Pausiert').isVisible(), 'pause holds the clock');
const held = await p.locator('.mob-warmup-clock').innerText();
await p.waitForTimeout(1200);
ok((await p.locator('.mob-warmup-clock').innerText()) === held, `the clock stands while paused (${held})`);
await p.getByRole('button', { name: 'Weiter' }).click();
// it goes on by itself to the end (the clock runs 20 × in the test)
const seen = new Set([first]);
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  if (await p.locator('.mob-warmup-done').isVisible().catch(() => false)) break;
  const name = await p.locator('.mob-warmup-name').innerText().catch(() => '');
  if (name) seen.add(name);
  await p.waitForTimeout(200);
}
ok(await p.locator('.mob-warmup-done').isVisible(), `the warm-up ends by itself (${seen.size} of ${moves.length} moves seen)`);
ok(seen.size >= moves.length - 1, 'every move came in turn');
await shot('warmup-done');
await p.getByRole('button', { name: 'Fertig' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.mob-warmup-card').isVisible(), 'back to the drills');

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
