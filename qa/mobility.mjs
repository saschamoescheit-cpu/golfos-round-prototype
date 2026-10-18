// The mobility screen (feature 030, 17.10.2026): module choice, menu, quick check with the camera tests (a synthetic
// player instead of the camera: localStorage golfos.mobility.fake = good | stiff, fakeSpeed = time factor), result
// (swing patterns, misses, body), drills → plan in Training, history with delete + undo, a single self check, pause and
// continue, English. Usage: node mobility.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
let n = 0;
// every button the player taps is at least 44 px high (as in Rounds, qa/tapsize.mjs)
const small = async (where) => {
  const list = await p.evaluate(() => [...document.querySelectorAll('main button, main a.btn-secondary, nav.tabbar button')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => (e.textContent || e.getAttribute('aria-label') || e.className).trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height)));
  ok(list.length === 0, `tap sizes ≥ 44 px on ${where}${list.length ? ': ' + list.join(', ') : ''}`);
};
const shot = async (name) => shots && p.screenshot({ path: `${shots}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();

await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: '' }));
  localStorage.setItem('golfos.mobility.fake', 'stiff');
  localStorage.setItem('golfos.mobility.fakeSpeed', '4');
});
await p.reload();
await p.waitForTimeout(800);
ok((await p.locator('.module-card').count()) === 4, 'four modules on the start page');
ok(await p.locator('.module-card').filter({ hasText: 'Agility' }).isVisible(), 'the module card says "Agility" (not TPI)');
ok((await p.getByText('TPI').count()) === 0, 'no "TPI" on the start page');
await shot('start');
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-start').first().waitFor({ timeout: 20000 });
const tabs = await p.locator('.tabbar button').allInnerTexts();
ok(tabs.map((x) => x.trim()).join('|') === 'Screening|Ergebnis|Übungen|Verlauf|Profil', `menu: ${tabs.join(' · ')}`);
ok((await p.locator('.module-tag').textContent()) === 'Agility', 'module header');
ok((await p.getByText('So funktioniert').count()) === 0, 'no intro card');
ok((await p.locator('.mob-test-row').count()) === 15, '15 single tests listed');
await shot('screening-tab');
await small('the screening tab');

// the empty result and drills tabs
await tab('Ergebnis');
ok(await p.getByText('Noch kein Ergebnis').isVisible(), 'empty result points to the screening');
await tab('Screening');

// ---------- quick check with the stiff player: the trainer mode – set up once, ONE tap, then everything by itself ----------
await p.locator('.mob-start').filter({ hasText: 'Kurz-Check' }).click();
await p.locator('.mob-setup').waitFor({ timeout: 15000 });
ok(await p.getByText('Handy aufstellen – einmal').isVisible(), 'the setup: set up the phone once');
ok(await p.locator('.mob-setup .tr-sketch, .mob-setup svg').first().isVisible(), 'the setup shows where the phone goes');
ok((await p.locator('.mob-setup-tests .tr-thumb, .mob-setup-tests svg').count()) >= 6, 'the setup lists the tests');
await shot('coach-setup');
await small('the setup');
let taps = 0;
await p.locator('.mob-start-coach').click();
taps++;
// from here on no tap until the questions at the end: the 3D golfer shows each test, the camera measures, says the
// result and goes on (the second side, the retest of the deep squat)
const intros = new Set();
let demoSeen = false;
let demoDrawn = 0;
let demoShot = false;
let lastPaint = 0;
let liveShot = false;
let resultShot = false;
let autoText = '';
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  if (await p.locator('.mob-feel, .mob-ankle, .mob-summary, .sheet').first().isVisible().catch(() => false)) break;
  // the retest shows "Retest: …" all the time, not only during the short demo (700 ms with the synthetic player – a
  // loop round with a screenshot can take longer)
  // (read at once – a waiting read hangs while the result shows, where there is no tag)
  const always = await p.evaluate(() => document.querySelector('.mob-side-tag')?.textContent ?? '').catch(() => '');
  if (/^Nachtest/.test(always)) intros.add(always);
  if (await p.locator('.mob-demo.big').isVisible().catch(() => false)) {
    demoSeen = true;
    const tag = await p.locator('.mob-side-tag').innerText().catch(() => '');
    if (tag) intros.add(tag);
    if (!demoShot) {
      demoShot = true;
      await shot('coach-demo');
    }
  }
  // the small 3D golfer over the camera is drawn (measured now and then, the best count kept)
  if (Date.now() - lastPaint > 1000 && (await p.locator('.mob-demo canvas').isVisible().catch(() => false))) {
    lastPaint = Date.now();
    demoDrawn = Math.max(demoDrawn, await p.evaluate(() => { const c = document.querySelector('.mob-demo canvas'); if (!c) return 0; const x = document.createElement('canvas'); x.width = 40; x.height = 30; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 40, 30); const d = g.getImageData(0, 0, 40, 30).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return seen.size; }));
  }
  if (!liveShot && (await p.locator('.mob-live').isVisible().catch(() => false))) {
    liveShot = true;
    await shot('coach-live');
  }
  // the save button with its countdown, read at once from the page (with the fast synthetic player the result can save
  // itself before a waiting read gets to it) – any of the results will do
  if (!/\(\d\)/.test(autoText)) {
    const now = await p.evaluate(() => (document.querySelector('.mob-outcome') ? [...document.querySelectorAll('.btn-primary')].map((x) => x.innerText).find((x) => /Speichern und weiter/.test(x)) ?? '' : '')).catch(() => '');
    if (now) autoText = now;
  }
  if (!resultShot && (await p.locator('.mob-outcome').isVisible().catch(() => false))) {
    resultShot = true;
    await shot('coach-result');
  }
  await p.waitForTimeout(150);
}
console.log('   intros:', [...intros].join(' | '));
ok(demoSeen && demoDrawn > 12, `the 3D golfer shows each test over the camera first (${demoDrawn} colours)`);
ok(intros.size >= 9, `${intros.size} tests and sides shown and measured without a tap (6 tests, 3 with both sides, + the squat retest)`);
ok([...intros].some((x) => /Nachtest/.test(x)), 'the deep squat missed: the retest with the hands behind the head runs by itself');
ok(/\(\d\)/.test(autoText), `the result saves itself after a countdown (${autoText})`);
// the questions at the end: where the bridge was felt, knee to the wall
let feelAsked = false;
let ankleAsked = false;
for (let i = 0; i < 4; i++) {
  if (await p.locator('.mob-feel').isVisible().catch(() => false)) {
    feelAsked = true;
    await shot('bridge-feel');
    await p.locator('.mob-feel .mob-option').filter({ hasText: 'Oberschenkel' }).click();
    taps++;
  } else if (await p.locator('.mob-ankle').isVisible().catch(() => false)) {
    ankleAsked = true;
    await shot('squat-ankle');
    await p.locator('.mob-ankle .mob-option.fail').click();
    taps++;
  } else break;
  await p.waitForTimeout(400);
}
ok(feelAsked, 'at the end: "where did you feel the bridge?"');
ok(ankleAsked, 'at the end: knee to the wall (the heels came up in the retest)');
ok(taps === 3, `${taps} taps for the whole quick check (start + two questions)`);
await p.locator('.mob-summary').waitFor({ timeout: 15000 }).catch(() => {});
const quick = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').at(-1));
const measured = Object.values(quick?.results ?? {}).reduce((n, r) => n + ['left', 'right', 'both'].filter((k) => r[k]).length, 0);
ok(measured === 9, `${measured} of 9 camera steps saved (6 tests, 3 with both sides)`);
await p.locator('.mob-summary').waitFor();
ok(await p.locator('.mob-summary').isVisible(), 'the result opens after the screening');
// measuring, not grading (Sascha 18.10.2026): values on scales, no ✓/✕, the goal asked for
const glyphs = await p.evaluate(() => (document.querySelector('main')?.textContent ?? '').match(/[✓✕]|[Bb]estanden/g)?.length ?? 0);
ok(glyphs === 0, `no grades in the result (${glyphs} ✓/✕/"bestanden")`);
ok(await p.getByText('Was ist dein Ziel?').isVisible(), 'the result asks for the goal');
await p.locator('.mob-goal .chip').filter({ hasText: /^10$/ }).click();
await p.locator('.mob-goal .chip').filter({ hasText: 'Mehr Länge' }).click();
await shot('goal');
await p.getByRole('button', { name: 'Ziel speichern' }).click();
const goalText = await p.locator('.mob-goal').innerText().catch(() => '');
ok(/Dein Ziel: Handicap 10/.test(goalText) && /Mehr Länge/.test(goalText), `the goal is saved (${goalText.replace(/s+/g, ' ')})`);
ok((await p.locator('.mob-area-head .mob-levelbar').count()) >= 4, 'each measured area shows its bar with the line of the goal');
ok((await p.locator('.mob-test-row .mob-levelbar').count()) >= 6, 'each measured test shows its value on a scale');
await shot('result-body');
await p.locator('.segmented button').filter({ hasText: 'Dein Schwung' }).click();
const patterns = await p.locator('.mob-pattern').count();
ok(patterns >= 3, `${patterns} swing patterns for the stiff player`);
ok((await p.locator('.mob-level.likely').count()) >= 1, 'at least one pattern is likely');
ok(await p.locator('.mob-pattern').filter({ hasText: 'Frühes Aufrichten' }).isVisible(), 'early extension is found (squat, bridge failed)');
ok((await p.locator('.mob-miss').count()) >= 3, 'misses in player language');
await shot('result-swing');
await small('the result');
await p.locator('.mob-pattern').first().click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-sketch svg').count()) >= 1, 'pattern page shows the fault as a picture');
ok((await p.locator('.mob-test-row').count()) >= 2, 'pattern page names the tests behind it');
ok((await p.locator('.mob-play-now li').count()) >= 1, 'pattern page says how to play with it today');
await shot('pattern');
await p.locator('.topbar .icon-btn').first().click();
await p.locator('.segmented button').filter({ hasText: 'Dein Körper' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.mob-test-row').count()) === 15, 'body result lists all 15 tests by area');
ok((await p.locator('.mob-test-row.untested').count()) === 9, 'the 9 tests not in the quick check are marked untested');
ok(await p.getByText('Ursache: Sprunggelenke').first().isVisible(), 'the deep squat names its cause (ankles)');

// ---------- drills → Training ----------
await tab('Übungen');
await p.waitForTimeout(300);
const drillGroups = await p.locator('.mob-pillar-area').count();
ok(await p.getByText('Deine Säule Beweglichkeit').isVisible(), 'the drills are the mobility pillar for the goal');
ok(drillGroups >= 2 && drillGroups <= 3, `${drillGroups} focus areas with drills (the biggest gaps first)`);
const legs = p.locator('.mob-pillar-area').filter({ has: p.locator('.mob-drill-head', { hasText: 'Beine' }) });
if (await legs.count()) {
  const legDrills = await legs.locator('.list-item .title').allInnerTexts();
  ok(legDrills[0] === 'Knie zur Wand', 'the leg drills follow the cause of the squat (ankles: ' + legDrills.join(', ') + ')');
}
await shot('drills');
await small('the drills');
await p.locator('.mob-test-row').first().click();
await p.waitForTimeout(300);
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Videos' }).click();
ok((await p.locator('.tr-video').count()) >= 1, 'a drill has videos (own tab)');
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Anleitung' }).click();
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'a drill has its picture');
await p.locator('.mob-3d canvas').waitFor({ timeout: 30000 }).catch(() => {});
ok(await p.locator('.mob-3d canvas').isVisible(), 'the drill shows its 3D video');
ok(((await p.locator('.mob-3d-step').textContent()) ?? '').length > 5, 'the drill video names the step');
await shot('drill');
await p.locator('.topbar .icon-btn').first().click();
// the guided session with the camera comes first (qa/mobility-train.mjs runs it), the plan for Training second
ok(/Jetzt trainieren/.test(await p.locator('.sticky-cta .btn-primary').innerText()), 'the pillar leads with "Jetzt trainieren … mit Kamera"');
await p.locator('.sticky-cta .btn-secondary').filter({ hasText: 'ins Training' }).click();
ok(await p.getByText('Meine Pläne').isVisible(), 'the plan is in Training');
const plans = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.training.plans.v1') ?? '[]'));
const planMin = (plans[0]?.items ?? []).reduce((n, x) => n + x.minutes, 0);
ok(plans.length === 1 && plans[0].items.length >= 3 && planMin <= 15 && plans[0].name.startsWith('Agility · 15 Min.'), `plan "${plans[0]?.name}" with ${plans[0]?.items.length} drills, ${planMin} min (the time a day: 15)`);
await p.getByRole('button', { name: 'Training öffnen' }).click();
await p.waitForTimeout(1500);
ok((await p.locator('.module-tag').textContent()) === 'Training', 'Training opens');
ok((await p.getByText(plans[0]?.name ?? '#').count()) >= 1, 'the plan is listed in Training');
await p.locator('.module-switch').click();
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-start').first().waitFor();

// ---------- history: delete with undo ----------
await tab('Verlauf');
ok((await p.locator('.list-item').count()) === 1, 'one screening in the history');
await shot('history');
await p.locator('.list-item').first().click();
await p.locator('.topbar .icon-btn').last().click();
await p.waitForTimeout(300);
ok(await p.locator('.undo-toast').isVisible(), 'delete shows "Undo"');
await p.locator('.undo-toast button').click();
await p.waitForTimeout(300);
await tab('Verlauf');
ok((await p.locator('.list-item').count()) === 1, 'undo brings the screening back');

// ---------- a camera test page: picture, video, 3D ----------
await tab('Screening');
await p.locator('.mob-test-row').filter({ hasText: 'Rumpfrotation im Sitzen' }).click();
await p.locator('.mob-3d canvas').waitFor({ timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'the test shows its picture');
ok((await p.locator('.tr-video').count()) >= 1, 'the test shows its video');
ok(await p.locator('.mob-3d canvas').isVisible(), 'the test shows its 3D video');
ok(((await p.locator('.mob-3d-step').textContent()) ?? '').length > 5, 'the 3D video names the step of the moment');
ok(await p.locator('.mob-3d-play').isVisible(), 'play/pause is the round symbol in the picture');
const painted = await p.evaluate(() => { const c = document.querySelector('.mob-3d canvas'); if (!c) return 0; const x = document.createElement('canvas'); x.width = 40; x.height = 30; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 40, 30); const d = g.getImageData(0, 0, 40, 30).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return seen.size; });
ok(painted > 12, 'the 3D video is drawn (' + painted + ' colours)');
await shot('brief');
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
ok((await p.locator('.mob-bar-track b').count()) >= 1, 'the values over time on the scale, with the line of the goal');
await shot('test-history');
await p.locator('.topbar .icon-btn').first().click();

// ---------- a single self check ----------
await tab('Screening');
await p.locator('.mob-test-row').filter({ hasText: 'Handgelenk anwinkeln' }).click();
await p.waitForTimeout(300);
const tt = await p.locator('.tr-tabs [role="tab"]').allInnerTexts();
ok(tt.join('|') === 'Ablauf|Ergebnisse|Übungen', `test page tabs: ${tt.join(' · ')}`);
await shot('test-page');
await p.getByRole('button', { name: 'Test starten' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.mob-option:not(.mob-pain)').count()) === 3, 'self check offers three pictures');
ok(await p.locator('.mob-pain').isVisible(), 'self check offers "It hurts" (pain is its own result)');
await shot('self-check');
await small('a self check');
await p.locator('.mob-option.limited').click();
await p.waitForTimeout(500);
ok((await p.locator('.topbar h1').innerText()) === 'Handgelenk anwinkeln', 'back on the test page after a single test');
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
ok(await p.getByText('selbst eingeschätzt').first().isVisible(), 'the self-judged result is listed');
await p.locator('.topbar .icon-btn').first().click();

// ---------- pain: its own result, no drills for it ----------
await p.locator('.mob-test-row').filter({ hasText: 'Handgelenk beugen' }).click();
await p.getByRole('button', { name: 'Test starten' }).click();
await p.locator('.mob-pain').click();
await p.waitForTimeout(500);
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
ok(await p.getByText('Schmerz').first().isVisible(), 'a test that hurt is listed as "Schmerz"');
await p.locator('.topbar .icon-btn').first().click();
await tab('Übungen');
await p.waitForTimeout(300);
ok(await p.locator('.mob-pain-note').filter({ hasText: 'Handgelenk beugen' }).isVisible(), 'the drills say: pain – a physio first, no drills for it');
ok((await p.locator('.mob-drill-head').filter({ hasText: 'Handgelenk beugen' }).count()) === 0, 'no drills for the test that hurt');
await shot('pain-note');
await tab('Screening');
await p.waitForTimeout(300);

// ---------- hands-free: a sided single test runs through without a tap ----------
await p.locator('.mob-test-row').filter({ hasText: 'Kopfdrehung' }).click();
await p.getByRole('button', { name: 'Test starten' }).click();
await p.locator('.mob-start-coach').click();
// left side, saved by itself, the right side starts by itself, saved by itself, back on the test page
await p.locator('.tr-tabs').waitFor({ timeout: 90000 }).catch(() => {});
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
const neckRes = await p.locator('.list-item .title').first().innerText().catch(() => '');
ok(/links .*rechts/.test(neckRes), 'hands-free: both sides measured and saved without a tap (' + neckRes + ')');
await p.locator('.topbar .icon-btn').first().click();

// ---------- pause and continue ----------
await p.evaluate(() => localStorage.setItem('golfos.mobility.fake', 'good'));
await p.locator('.mob-start').filter({ hasText: 'Komplettes Screening' }).click();
await p.locator('.mob-start-coach').click();
// the first test is measured and saved by itself; during the next one: Pause
await p.locator('.mob-outcome').waitFor({ timeout: 60000 });
await p.locator('.mob-demo.big').waitFor({ timeout: 30000 });
await p.locator('.mob-coach-pause').click();
await p.locator('.mob-hold-screen').waitFor({ timeout: 10000 });
ok(await p.getByRole('button', { name: 'Weiter' }).isVisible(), 'Pause in the trainer mode: continue, pause for later, finish');
await shot('coach-hold');
await p.locator('.hole-bar-handle').click();
await shot('drawer');
await small('the screening in play');
await p.locator('.drawer-action').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.mob-open').isVisible(), 'the paused screening is offered on the screening tab');
ok((await p.locator('.tabbar button').first().locator('.tabbar-dot').count()) === 1, 'the menu shows a dot for the paused screening');
await p.locator('.module-switch').click();
ok(await p.getByText('Ein Screening ist pausiert').isVisible(), 'the start page says a screening is paused');
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-open').click();
await p.locator('.mob-setup').waitFor({ timeout: 10000 });
await p.locator('.mob-start-coach').click();
await p.locator('.mob-demo.big').waitFor({ timeout: 30000 });
const resumed = await p.locator('.mob-side-tag').innerText().catch(() => '');
// the first test of the paused screening that is not done yet (a sided test needs both sides)
const nextNo = await p.evaluate(() => {
  const sc = JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').find((x) => !x.finishedAt && x.kind !== 'single');
  const sided = ['lower-quarter', 'single-leg', 'seated-rotation', 'neck', 'bridge', 'shoulder-9090'];
  const done = (id) => { const r = sc.results[id]; return !!r && (sided.includes(id) ? !!(r.left && r.right) : !!(r.both || r.left || r.right)); };
  return sc.tests.findIndex((id) => !done(id) && !(sc.skipped ?? []).includes(id)) + 1;
});
ok(new RegExp(`Test ${nextNo} von 15|Gewicht auf dem|Bein stehen`).test(resumed) && !/Beckenrotation/.test(resumed), `continues with the next open test (${nextNo}) after one tap on Start (${resumed})`);

// ---------- left-handed: lead and trail come from the profile ----------
await p.evaluate(() => {
  const ids = ['lower-quarter'];
  const m = (grade) => ({ value: 40, grade, source: 'camera', at: '2026-10-18T06:00:00Z' });
  // only this result, so nothing else points to a pattern
  const list = [];
  list.push({ id: 'lh', kind: 'single', tests: ids, createdAt: '2026-10-18T06:00:00Z', finishedAt: '2026-10-18T06:00:00Z', current: 0, hand: 'right', results: { 'lower-quarter': { left: m('pass'), right: m('fail') } } });
  localStorage.setItem('golfos.mobility.v1', JSON.stringify(list));
});
await p.reload();
await p.waitForTimeout(1200);
await tab('Ergebnis');
await p.locator('.segmented button').filter({ hasText: 'Dein Schwung' }).click();
const rh = await p.locator('.mob-pattern').allInnerTexts();
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1') ?? '{}'));
await p.evaluate((pr) => localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...pr, hand: 'left' })), prof);
await p.reload();
await p.waitForTimeout(1200);
await tab('Ergebnis');
await p.locator('.segmented button').filter({ hasText: 'Dein Schwung' }).click();
const lh = await p.locator('.mob-pattern').allInnerTexts();
ok(rh.some((x) => x.includes('Sway')) && lh.some((x) => x.includes('Slide')) && !lh.some((x) => x.includes('Sway')) && !rh.some((x) => x.includes('Slide')), 'left-handed: the failed right hip means slide instead of sway');
await p.evaluate((pr) => localStorage.setItem('golfos.profile.v1', JSON.stringify(pr)), prof);

// ---------- sun mode ----------
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'sun'));
await shot('result-sun');
await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));

// ---------- English ----------
await p.evaluate(() => localStorage.setItem('golfos.lang.v1', 'en'));
await p.reload();
await p.waitForTimeout(1500);
const enTabs = await p.locator('.tabbar button').allInnerTexts();
ok(enTabs.map((x) => x.trim()).join('|') === 'Screening|Result|Drills|History|Profile', `English menu: ${enTabs.join(' · ')}`);

ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
