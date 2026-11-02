// My physio plan (Sascha 1.11.2026: "in the TPI app I see my results, the swing characteristics and the exercises my
// physio put together – adapt Agility to it"; "set myself how often a week, a push reminds, a training diary to confirm
// a session, the tests again after a month"). A made-up plan in the shape of the file is imported: the card on the
// drills tab, the results as a screening, the swing characteristics, the week, the guided routine to the end, the
// diary. Usage: node mobility-physio.mjs <app url> [shots dir]
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

// no player's data: a plan made up for the test
const PLAN = {
  source: 'TPI Level 1 Screen (Physio)',
  screenedAt: '2026-10-29T16:26:00+01:00',
  gfh: 22,
  tests: [
    { name: 'Toe Touch', light: 'red' },
    { name: 'Single Leg Balance', light: 'red', left: 'red', right: 'yellow' },
    { name: 'Pelvic Tilt', light: 'yellow' },
    { name: 'Setup Posture', light: 'green' },
    { name: 'Overhead Deep Squat', light: 'green' },
  ],
  faults: [
    { name: 'Early Extension', pct: 90 },
    { name: 'Sway', pct: 60 },
    { name: 'Flying Elbow', pct: 10 },
  ],
  routine: {
    name: 'Testroutine',
    exercises: [
      { name: 'Gesäß anspannen', steps: ['Rückenlage.', 'Gesäß anspannen.'], sets: [{ reps: 2, repSec: 3, restSec: 2 }] },
      { name: 'Brücke', steps: ['Becken heben.'], sets: [{ reps: 2, repSec: 2, restSec: 2 }, { reps: 2, repSec: 2, restSec: 2 }], targets: ['bridge'], clip: 'glute-bridge' },
      { name: 'Einbeinstand', steps: ['Auf einem Bein stehen.'], perSide: true, sets: [{ reps: 1, repSec: 4, restSec: 2 }] },
    ],
  },
};

await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', 'good');
  localStorage.setItem('golfos.mobility.fakeSpeed', '8');
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.waitForTimeout(400);

// no plan yet: where to import it, a wrong file is refused
ok(await p.locator('.mob-physio-import').isVisible(), 'the drills tab offers to import the physio plan');
await p.locator('.mob-physio-import input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
await p.locator('.mob-physio-error').waitFor({ timeout: 5000 }).catch(() => {});
ok(await p.locator('.mob-physio-error').isVisible(), 'a file that is no plan is refused with a message');
await p.locator('.mob-physio-import input[type=file]').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PLAN)) });
await p.locator('.mob-physio').waitFor({ timeout: 5000 }).catch(() => {});
ok(await p.locator('.mob-physio').isVisible(), 'imported: the plan opens');
await shot('physio-routine');

// the routine: 3 exercises, the time as the physio app counts it, a dosage table
const sum = await p.locator('.mob-physio-sum').first().innerText();
ok(/3 Übungen · 0:32 Min\./.test(sum), `the routine with its time (${sum.split('\n')[1]})`);
await p.locator('.mob-physio-ex-head').nth(1).click();
ok((await p.locator('.mob-physio-sets tbody tr').count()) === 2 && /Für: Brücke/.test(await p.locator('.mob-physio-ex-body').innerText()), 'an exercise opens: its sets and what it is for');
await p.locator('.mob-physio-ex-body .mob-3d').waitFor({ timeout: 15000 }).catch(() => {});
ok(await p.locator('.mob-physio-ex-body .mob-3d').isVisible(), 'the exercise shows its 3D video (the bridge)');
ok((await p.locator('.mob-physio-ex-body .mob-3d-voice[aria-pressed="false"]').count()) === 1, 'its loudspeaker there but muted');
await p.locator('.mob-physio-ex-head').nth(0).click();
ok(!(await p.locator('.mob-physio-ex-body .mob-3d').count()), 'an exercise without a fitting video: its steps only');
await p.locator('.mob-physio-ex-head').nth(0).click();

// daily: today is a training day – the start page's "training today" is the routine, Agility's plan a tap away
// how often a week: a row with its sheet (docs/DESIGN.md)
await p.locator('.mob-physio-plan .settings-row').filter({ hasText: 'Wie oft pro Woche' }).click();
await p.locator('.sheet .pick-option').filter({ hasText: "täglich" }).click();
await p.locator('.topbar .icon-btn').first().click();
await p.locator('.tabbar button').filter({ hasText: 'Screening' }).click();
await p.locator('.mob-today').waitFor({ timeout: 5000 }).catch(() => {});
const today = await p.locator('.mob-today').innerText().catch(() => '');
ok(/Testroutine/.test(today) && /Routine starten/.test(today) && /Stattdessen Agility-Plan/.test(today), `a training day: today's training is the routine (${today.replace(/\n/g, ' · ').slice(0, 120)})`);
await p.locator('.tabbar button').filter({ hasText: 'Übungen' }).click();
await p.locator('.mob-physio-open').click();
await p.locator('.mob-physio').waitFor({ timeout: 5000 });

// how often a week: 3×, then fixed days set the count
await p.locator('.mob-physio-plan .settings-row').filter({ hasText: 'Wie oft pro Woche' }).click();
await p.locator('.sheet .pick-option').filter({ hasText: "3×" }).click();
ok((await p.locator('.mob-physio-plan .settings-row').filter({ hasText: 'Wie oft pro Woche' }).locator('.settings-value').innerText()) === '3×', 'three times a week chosen');
for (const d of ['Mo', 'Mi', 'Fr', 'So']) await p.locator('.mob-physio-days button').filter({ hasText: d }).click();
ok((await p.locator('.mob-physio-plan .settings-row').filter({ hasText: 'Wie oft pro Woche' }).locator('.settings-value').innerText()) === '4×' && (await p.locator('.mob-physio-days button[aria-pressed="true"]').count()) === 4, 'four days chosen: four a week');
// the reminder: a switch, then the time as a row
await p.locator('.mob-physio-plan [role="switch"]').click();
await p.locator('.mob-physio-plan .date-row-input').fill('18:30');
await p.waitForTimeout(200);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.physio.v1'))[0].schedule);
ok(stored.perWeek === 4 && stored.days.join() === '0,2,4,6' && stored.remind === '18:30', `the week and the reminder kept in the account (${JSON.stringify(stored)})`);

// the results: lights, sides, taken over as a screening
await p.locator('.mob-physio .tr-tabs button').filter({ hasText: 'Ergebnisse' }).click();
const lights = await p.locator('.mob-physio-tests .mob-light').evaluateAll((xs) => xs.map((x) => x.classList[1]));
ok(lights.join(' ') === 'red red yellow green green', `the tests by their light, red first (${lights.join(' ')})`);
ok(/links eingeschränkt · rechts teilweise/.test(await p.locator('.mob-physio-tests').innerText()), 'a sided test shows both sides');
ok(/Golf-Fitness-Handicap 22/.test(await p.locator('.mob-physio-sum').innerText()), 'the golf fitness handicap');
const scr = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.v1')));
ok(scr.length === 1 && scr[0].from === 'TPI Level 1 Screen (Physio)' && scr[0].results['toe-touch'].both.grade === 'fail' && scr[0].results['single-leg'].right.grade === 'limited', 'the results became a screening of the physio’s day');
ok(/Nachtest/.test(await p.locator('.mob-physio-retest').innerText()), 'the retest after about 4 weeks is announced');
await shot('physio-results');

// the swing characteristics
await p.locator('.mob-physio .tr-tabs button').filter({ hasText: 'Schwung' }).click();
const levels = await p.locator('.mob-physio-level').allInnerTexts();
ok(levels.join(' | ') === '90 % · Hoch | 60 % · Mittel | 10 % · Niedrig', `the swing characteristics: ${levels.join(' | ')}`);
await shot('physio-swing');

// the guided routine to the end
await p.locator('.mob-physio .tr-tabs button').filter({ hasText: 'Routine' }).click();
await p.locator('.mob-physio-sum .mob-physio-start').click();
await p.locator('.mob-physio-run').waitFor({ timeout: 5000 });
const acts = await p.locator('.mob-physio-run .drawer-action').evaluateAll((bs) => bs.map((x) => x.classList[1]).join(' '));
ok(acts === 'skip pause end', `the routine's buttons: Skip, Pause, Finish (${acts})`);
await shot('physio-run');
const phases = new Set();
const names = new Set();
const shown3d = new Set();
for (let i = 0; i < 120 && !(await p.locator('.mob-physio-end').isVisible().catch(() => false)); i++) {
  const ph = await p.locator('.mob-physio-phase').innerText().catch(() => '');
  if (ph) phases.add(ph.replace(/\d+\/\d+/g, '#'));
  const nm = await p.locator('.mob-warmup-name').innerText().catch(() => '');
  names.add(nm);
  if (await p.locator('.mob-physio-run .mob-3d').count()) shown3d.add(nm);
  await p.waitForTimeout(150);
}
ok(await p.locator('.mob-physio-end').isVisible(), 'the routine runs to its end by itself');
ok(names.has('Gesäß anspannen') && names.has('Brücke') && names.has('Einbeinstand'), 'every exercise in turn');
ok(shown3d.has('Brücke') && !shown3d.has('Gesäß anspannen'), `the guided routine shows the 3D video where there is one (${[...shown3d].join(', ')})`);
ok(['Vorbereiten', 'Pause', 'Andere Seite'].every((x) => phases.has(x)) && [...phases].some((x) => /rechts/.test(x)) && [...phases].some((x) => /links/.test(x)), `get ready, reps, rest, the other side (${[...phases].join(' / ')})`);
ok(/Die ganze Routine – geschafft/.test(await p.locator('.mob-physio-end').innerText()), 'all done');
await p.locator('.mob-physio-feel button').filter({ hasText: 'okay' }).click();
await p.locator('.mob-physio-confirm').click();
await p.locator('.mob-physio').waitFor({ timeout: 5000 }).catch(() => {});

// the diary
await p.locator('.mob-physio .tr-tabs button').filter({ hasText: 'Tagebuch' }).click();
const entry = await p.locator('.mob-physio-log .list-item').first().innerText().catch(() => '');
ok(/3 von 3 Übungen/.test(entry) && /okay/.test(entry), `the session in the diary (${entry.replace(/\n/g, ' ')})`);
ok(/1 Trainingstage/.test(await p.locator('.mob-physio-weeks').innerText()) && /Ziel: 4× pro Woche/.test(await p.locator('.mob-physio-weeks').innerText()), 'days trained and the weekly goal');
await p.locator('.mob-physio-enter').click();
ok((await p.locator('.mob-physio-log .list-item').count()) === 2 && /eingetragen/.test(await p.locator('.mob-physio-log .list-item').first().innerText()), 'a session done without the app is entered by hand');
await shot('physio-diary');

// the skip and the finish: a session cut short counts only the exercises done
await p.locator('.topbar .icon-btn').first().click();
await p.locator('.mob-physio-card').waitFor({ timeout: 5000 });
ok(/diese Woche 1 von 4/.test(await p.locator('.mob-physio-card').innerText()), 'the card: this week 1 of 4 (two sessions on one day count once)');
await p.locator('.mob-physio-card .mob-physio-start').click();
await p.locator('.mob-physio-run .drawer-action.skip').click();
await p.locator('.mob-physio-run .drawer-action.end').click();
await p.locator('.mob-physio-end').waitFor({ timeout: 5000 });
ok(/0 von 3 Übungen/.test(await p.locator('.mob-physio-end').innerText()) && !(await p.locator('.mob-physio-confirm').count()), 'skipped and finished: nothing to enter');
await p.getByRole('button', { name: 'Schließen' }).click();

// before – after: the tests again in the app, compared with the physio's (Sascha 1.11.2026)
await p.evaluate(() => {
  const at = new Date().toISOString();
  const m = (grade) => ({ value: 1, grade, source: 'camera', at });
  const list = JSON.parse(localStorage.getItem('golfos.mobility.v1'));
  list.push({ id: 'retest', kind: 'quick', tests: ['toe-touch', 'single-leg'], createdAt: at, finishedAt: at, current: 2, hand: 'right', results: { 'toe-touch': { both: m('limited') }, 'single-leg': { left: m('fail'), right: m('fail') } } });
  localStorage.setItem('golfos.mobility.v1', JSON.stringify(list));
});
await p.locator('.mob-physio-card .mob-physio-open').click();
await p.locator('.mob-physio .tr-tabs button').filter({ hasText: 'Ergebnisse' }).click();
await p.locator('.mob-cmp-sum').waitFor({ timeout: 5000 }).catch(() => {});
const cmp = await p.locator('.mob-cmp-sum').innerText().catch(() => '');
ok(/Vorher – nachher/.test(cmp) && /besser 1/.test(cmp) && /schlechter 1/.test(cmp) && /2 Einheiten/.test(cmp), `before – after: one better, one worse, the sessions in between (${cmp.replace(/\n/g, ' · ').slice(0, 140)})`);
const toe = await p.locator('.mob-physio-tests .list-item').filter({ hasText: 'Zehen berühren' }).innerText();
ok(/besser/.test(toe), 'the toe touch: red at the physio, yellow now – better');
const legDots = await p.locator('.mob-physio-tests .list-item').filter({ hasText: 'Einbeinstand' }).locator('.mob-cmp-side .mob-dot').evaluateAll((xs) => xs.map((x) => x.classList[1]).join(' '));
ok(legDots === 'red red yellow red', `the balance per side: left red → red, right yellow → red (${legDots})`);
await shot('physio-compare');

ok(!errs.length, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
