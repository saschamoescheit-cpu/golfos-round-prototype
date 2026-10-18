// The guided drill session of the mobility pillar (Sascha 18.10.2026: "an app that leads a person through exercises
// and analyses and measures the mobility meanwhile"): from the pillar one tap starts the session, the synthetic player
// does every drill, the app counts and measures and goes on by itself, the summary shows the values; pause and
// continue; a single drill from its page; the history and the drill page show what was measured.
// Usage: node mobility-train.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
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
// a quick check done the day before: stiff in the hips, the trunk and the legs
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', 'good');
  localStorage.setItem('golfos.mobility.fakeSpeed', '8');
  const at = '2026-10-17T18:00:00Z';
  const m = (value) => ({ value, grade: 'limited', source: 'camera', at });
  const results = {
    'pelvic-rotation': { both: m(16) },
    'single-leg': { left: m(6), right: m(8) },
    'seated-rotation': { left: m(30), right: m(33) },
    'deep-squat': { both: m(-18) },
    'toe-touch': { both: m(14) },
    bridge: { left: m(5), right: m(6) },
  };
  const s = { id: 'q1', kind: 'quick', tests: Object.keys(results), createdAt: at, finishedAt: at, current: 5, hand: 'right', results };
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([s]));
  localStorage.setItem('golfos.mobility.goal.v1', JSON.stringify({ id: 'goal', hcp: 10, focus: ['length'], at }));
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
// the start tab: the training of the day, one tap away
await p.locator('.mob-today').waitFor({ timeout: 10000 }).catch(() => {});
const today = await p.locator('.mob-today').innerText().catch(() => '');
ok(/Dein Training heute/i.test(today) && /Jetzt trainieren/.test(today), `the start tab shows the training of the day (${today.split('\n').slice(0, 2).join(' · ')})`);
await shot('today');
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(400);
await p.locator('.mob-plan-time .chip').filter({ hasText: '10' }).click();
const startText = await p.locator('.mob-train-start').innerText();
ok(/Jetzt trainieren – \d+ Min\. mit Kamera/.test(startText), `the pillar starts a guided session (${startText})`);
ok((await p.locator('.sticky-cta .btn-secondary').filter({ hasText: 'ins Training' }).count()) === 1, 'the plan for Training is still there, as the second way');
await shot('pillar');
await p.locator('.mob-train-start').click();
await p.locator('.mob-setup').waitFor({ timeout: 10000 });
const rows = await p.locator('.mob-train-list .mob-test-row').count();
ok(rows >= 2, `the setup lists the drills of the day (${rows})`);
ok(await p.getByText('gemessen:').first().isVisible(), 'the setup says what the camera measures');
await shot('setup');
await p.locator('.mob-start-train').click();
let taps = 1;

// the whole session without a tap: demo, counting, measuring, the next drill – until the summary
const t0 = Date.now();
const seen = new Set();
let counted = '';
let lastTag = '';
let lastChange = Date.now();
let stuck = '';
let demoShot = false;
let runShot = false;
while (Date.now() - t0 < 300000) {
  if (await p.locator('.mob-train-summary').isVisible().catch(() => false)) break;
  const tag = await p.evaluate(() => document.querySelector('.mob-side-tag')?.textContent ?? document.querySelector('.mob-drill-result .eyebrow')?.textContent ?? '').catch(() => '');
  const live = await p.evaluate(() => document.querySelector('.mob-drill-live .mob-live-value')?.textContent ?? '').catch(() => '');
  if (/^Übung \d von \d/.test(tag)) seen.add(tag.split(':')[0]);
  if (/\d+ \/ \d+/.test(live) && !/^0 /.test(live)) counted = live;
  if (!demoShot && (await p.locator('.mob-demo.big').isVisible().catch(() => false))) {
    demoShot = true;
    await shot('drill-demo');
  }
  if (!runShot && /^[3-9] \//.test(live)) {
    runShot = true;
    await shot('drill-run');
  }
  const key = tag + live;
  if (key !== lastTag) {
    lastTag = key;
    lastChange = Date.now();
  }
  if (Date.now() - lastChange > 40000) {
    stuck = `${tag} · ${live}`;
    break;
  }
  await p.waitForTimeout(120);
}
ok(!stuck, `no drill got stuck${stuck ? ' (' + stuck + ')' : ''}`);
ok(seen.size === rows, `every drill was shown and done by itself (${[...seen].join(', ')})`);
ok(!!counted, `the app counted the reps (e.g. ${counted})`);
const sess = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]')[0]);
ok(!!sess?.finishedAt && sess.done.length === rows, `the session is saved and finished (${sess?.done.length} drills)`);
const measured = (sess?.done ?? []).filter((d) => d.signal && d.signal !== 'oneLeg');
ok(measured.length >= 1 && measured.every((d) => d.sets.some((s) => s.best != null && s.seen)), `the camera counted and measured the measured drills (${measured.map((d) => d.drill + ' ' + d.sets.map((s) => s.best).join('/')).join(', ')})`);
ok(measured.every((d) => d.sets.every((s) => s.reps >= Math.ceil(s.target * 0.8))), `the camera counted the reps of the measured drills (${measured.map((d) => d.sets.map((s) => s.reps + '/' + s.target).join(' ')).join(', ')})`);
ok((sess?.done ?? []).every((d) => d.sets.length >= 1 && d.sets.every((s) => (s.held != null ? s.held > 0 : s.reps >= 1))), 'every set has reps or a hold');
ok(taps === 1, `${taps} tap for the whole session (Start)`);
await shot('summary');
const summary = await p.locator('.mob-train-summary').innerText();
ok(/Training fertig/.test(summary) && /Tag/.test(summary), 'the summary: done, the days of the week');
ok(/(Drehung|Tiefe|Fingerspitzen|Schienbein|Hüftstreckung|Arme)/.test(summary), 'the summary shows what was measured');
await p.locator('.mob-train-done').click();
await p.waitForTimeout(300);

// the start tab knows it was done today (and the 10 minutes chosen in the pillar)
await p.locator('.tabbar button').filter({ hasText: 'Screening' }).click();
await p.waitForTimeout(300);
const after = await p.locator('.mob-today').innerText().catch(() => '');
ok(/heute erledigt/.test(after) && /Nochmal trainieren/.test(after) && /10 Min\./.test(after), `the start tab: done today, train again, 10 min (${after.split('\n').slice(0, 2).join(' · ')})`);

// history: the training next to the screenings
await p.locator('.tabbar button').filter({ hasText: 'Verlauf' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.mob-train-history').isVisible(), 'the history lists the training');
await shot('history');

// a measured drill's page shows its values; "do it with the camera" runs this one drill
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(300);
const measuredId = measured[0]?.drill;
const NAMES = { 'mob-pelvic-turn': 'Hüfte drehen', 'seated-rotation': 'Rotation im Sitzen', 'deep-squat': 'Tiefe Kniebeuge', 'mob-toe-touch': 'Zehen berühren', 'mob-ankle-wall': 'Knie zur Wand', 'glute-bridge': 'Brücke (Gesäß)', 'mob-single-leg-bridge': 'Einbeinige Brücke', 'mob-wall-angels': 'Wandengel', 'mob-neck-turn': 'Kopf drehen' };
const row = p.locator('.mob-pillar-area .list-item').filter({ hasText: NAMES[measuredId] ?? '' }).first();
await (NAMES[measuredId] && (await row.count()) ? row : p.locator('.mob-pillar-area .list-item').first()).click();
await p.waitForTimeout(500);
const values = await p.locator('.mob-drill-values').count();
const startDrill = p.locator('.mob-drill-start');
ok(await startDrill.isVisible(), 'the drill page offers "Mit Kamera mitmachen"');
ok(values === 1, 'the page of a measured drill shows "Deine Werte"');
await shot('drill-page');
await startDrill.click();
await p.locator('.mob-start-train').click();
await p.locator('.mob-train-summary').waitFor({ timeout: 90000 }).catch(() => {});
ok(await p.locator('.mob-train-summary').isVisible(), 'a single drill with the camera ends in its summary');
await p.locator('.mob-train-done').click();
await p.waitForTimeout(300);
ok(await p.locator('.mob-drill-start').isVisible(), 'after the single drill: back on its page');
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(300);

// pause and continue: during the first drill → Pause → Pausieren → the pillar offers to continue
await p.locator('.mob-train-start').click();
await p.locator('.mob-start-train').click();
await p.locator('.mob-drill-result').waitFor({ timeout: 90000 });
await p.locator('.mob-coach-pause').waitFor({ timeout: 30000 });
await p.locator('.mob-coach-pause').click();
await p.locator('.mob-hold-screen').waitFor({ timeout: 10000 });
await p.locator('.mob-hold-screen .btn-secondary').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(400);
ok(await p.locator('.mob-train-open').isVisible(), 'the pillar shows the paused training');
await shot('paused');
await p.locator('.mob-train-open .btn-secondary').click();
const names = (await p.locator('.mob-train-list .title').allInnerTexts()).map((x) => x.replace(/^\d+\.\s*/, '').trim());
const resume = await p.locator('.mob-start-train').innerText();
ok(/Fortsetzen/.test(resume), `the setup says "Fortsetzen" (${resume})`);
await p.locator('.mob-start-train').click();
await p.locator('.mob-side-tag').waitFor({ timeout: 20000 });
const resumedTag = await p.locator('.mob-side-tag').innerText();
ok(names.length > 1 && resumedTag.includes(names[1]) && !resumedTag.includes(names[0]), `it goes on with the next drill (${resumedTag}; the drills: ${names.join(', ')})`);

ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
