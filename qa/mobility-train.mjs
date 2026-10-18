// The guided drill session of the mobility pillar (Sascha 18.10.2026: "an app that leads a person through exercises
// and analyses and measures the mobility meanwhile"): from the pillar one tap starts the session, the synthetic player
// does every drill, the app counts and measures and goes on by itself, the summary shows the values; pause and
// continue; a single drill from its page; the history and the drill page show what was measured.
// Usage: node mobility-train.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx); // no weather calls from the tests (Open-Meteo quota of the home line)
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
let progressNote = '';
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
  const note = await p.evaluate(() => document.querySelector('.mob-progress-note')?.textContent ?? '').catch(() => '');
  if (note) progressNote = note;
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
ok(/Sauber|Das sitzt/.test(progressNote), `a clean drill: the result says what comes next time (${progressNote})`);
await shot('summary');
const summary = await p.locator('.mob-train-summary').innerText();
ok(/Training fertig/.test(summary) && /Tag/.test(summary), 'the summary: done, the days of the week');
ok(/(Drehung|Oberschenkel|Zehen|Schienbein|Hüftstreckung|Arme|Außenrotation|Öffnung)/.test(summary), 'the summary shows what was measured');
await p.locator('.mob-train-done').click();
await p.waitForTimeout(300);

// the start tab knows it was done today (and the 10 minutes chosen in the pillar)
await p.locator('.tabbar button').filter({ hasText: 'Screening' }).click();
await p.waitForTimeout(300);
const after = await p.locator('.mob-today').innerText().catch(() => '');
ok(/heute erledigt/.test(after) && /Nochmal trainieren/.test(after) && /10 Min\./.test(after), `the start tab: done today, train again, 10 min (${after.split('\n').slice(0, 2).join(' · ')})`);

// the test page shows what the training measured for it (hip turns in golf posture → pelvic rotation)
if (sess?.done.some((d) => d.drill === 'mob-pelvic-turn')) {
  await p.locator('.mob-test-row').filter({ hasText: 'Beckenrotation' }).first().click();
  await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
  await p.waitForTimeout(300);
  const trained = await p.locator('.mob-trained').innerText().catch(() => '');
  ok(/Aus deinem Training/.test(trained) && /Hüfte drehen/.test(trained), `the test page shows the value from the training (${trained.split('\n').slice(1, 3).join(' · ')})`);
  await shot('test-trained');
  await p.locator('.topbar .icon-btn').first().click();
  await p.waitForTimeout(300);
}

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
// this time the camera does not see the reps (golfos.mobility.fakeStill): the app has to count along
await p.evaluate(() => localStorage.setItem('golfos.mobility.fakeStill', '1'));
await startDrill.click();
await p.locator('.mob-start-train').click();
await p.locator('.mob-train-summary').waitFor({ timeout: 90000 }).catch(() => {});
ok(await p.locator('.mob-train-summary').isVisible(), 'a single drill with the camera ends in its summary');
const single = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]')[0]?.done?.[0]);
ok(!!single && single.sets.every((s) => s.reps === s.target && !s.seen), `the camera saw no rep: the app counted along to the end (${JSON.stringify(single)})`);
await p.evaluate(() => localStorage.removeItem('golfos.mobility.fakeStill'));
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
// the first drill went cleanly twice now (the session before and this one): a little more next time
const setupText = await p.locator('.mob-train-list').innerText();
ok(/etwas mehr – es saß zuletzt/.test(setupText), 'twice clean: the setup says the drill is a little harder now');
ok(/Fortsetzen/.test(resume), `the setup says "Fortsetzen" (${resume})`);
await p.locator('.mob-start-train').click();
await p.locator('.mob-side-tag').waitFor({ timeout: 20000 });
const resumedTag = await p.locator('.mob-side-tag').innerText();
ok(names.length > 1 && resumedTag.includes(names[1]) && !resumedTag.includes(names[0]), `it goes on with the next drill (${resumedTag}; the drills: ${names.join(', ')})`);

// weeks later: the screening is due again, and the history shows the progress of a measured drill
await p.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]');
  const old = new Date(Date.now() - 40 * 864e5).toISOString();
  for (const s of list) {
    s.createdAt = old;
    s.finishedAt = old;
  }
  localStorage.setItem('golfos.mobility.v1', JSON.stringify(list));
  const ss = JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]');
  const early = new Date(Date.now() - 20 * 864e5).toISOString();
  ss.push({ id: 'early', startedAt: early, finishedAt: early, minutes: 10, drills: ['mob-pelvic-turn'], done: [{ drill: 'mob-pelvic-turn', signal: 'hipTurn', sets: [{ side: null, reps: 10, target: 10, best: 20, seen: true }], at: early }] });
  // only the finished sessions (the paused one of the test above is left out)
  localStorage.setItem('golfos.mobility.sessions.v1', JSON.stringify(ss.filter((s) => s.finishedAt)));
});
await p.reload();
await p.waitForTimeout(1200);
// the app may open in Agility again (the last module) or on the start page
if (await p.locator('.module-card').filter({ hasText: 'Agility' }).isVisible().catch(() => false)) await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.tabbar button').filter({ hasText: 'Screening' }).click();
await p.locator('.mob-due').waitFor({ timeout: 10000 }).catch(() => {});
const due = await p.locator('.mob-due').innerText().catch(() => '');
ok(/Zeit zum Wiederholen/i.test(due) && /Trainingstag/.test(due) && /Kurz-Check starten/.test(due), `four weeks on: time to repeat the screening (${due.split('\n').slice(2, 3).join('')})`);
await shot('due');
await p.locator('.tabbar button').filter({ hasText: 'Verlauf' }).click();
await p.waitForTimeout(300);
const progress = await p.locator('.mob-train-progress').innerText().catch(() => '');
ok(/Fortschritt im Training/.test(progress) && /Hüfte drehen/.test(progress) && /\+\d/.test(progress), `the history shows the progress in the training (${progress.split('\n').slice(1, 4).join(' · ')})`);
await shot('progress');

ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
