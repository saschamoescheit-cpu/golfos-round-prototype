// QA Facelift Agility (Sascha 11.11.2026, Facelift-Abnahme a1–a10 + o5/o6): the views of a page as the app's switch
// "‹ Ablauf ›" (no tab blocks), the physio's lights green/grey/red with SVG trends, the diary swiped away with "Rückgängig",
// the goal saved by the floating tick the first time and by itself afterwards, the pause screens and the leave sheets as
// the round's (one bar of icons + the green main button), the paused training as a list row with "Ins Training" in the
// bar and the main button last, white on colour and the pain mark as an SVG sign, the camera setup as a picture + one
// line, no "Fertig" at the end, no h2 inside the Agility pages and no "✓" glyph.
// Usage: node qa/agilface.mjs [url] [shots dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); if (process.env.AGDBG) console.log('PAGEERROR', e.message); });
let fails = 0;
let n = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const shot = async (name) => shots && p.screenshot({ path: `${shots}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const tab = async (name) => {
  await p.locator('.tabbar button').filter({ hasText: name }).click();
  await p.waitForTimeout(350);
};
const back = async () => {
  await p.locator('.topbar .icon-btn').first().click();
  await p.waitForTimeout(350);
};
// the switch of the views: what it shows, and a view picked from its list
const stepNow = async (scope = p.locator('main')) => (await scope.locator('.step-pick-now').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const pickView = async (name) => {
  await p.locator('main .step-pick-now').first().click();
  const dlg = p.getByRole('dialog');
  await dlg.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).click();
  await p.waitForTimeout(350);
};
const barLabels = (scope) => scope.locator('.sc-action').evaluateAll((bs) => bs.map((x) => `${x.querySelector('span')?.textContent ?? ''}${x.classList.contains('danger') ? '!' : ''}${x.querySelector('svg') ? '' : '(no icon)'}`).join('|'));
// no section heading inside the Agility pages (o6) – the title of the page is the h1
const noH2 = async (where) => ok((await p.locator('main h2').count()) === 0, `${where}: no h2 inside the page – eyebrows above the blocks`);
// no "✓" as a glyph (o5) – neither as text nor drawn by CSS
const noTickGlyph = async (where) => {
  const found = await p.evaluate(() => {
    const m = document.querySelector('main');
    if (!m) return 'no main';
    if (/✓/.test(m.textContent ?? '')) return 'text';
    for (const e of m.querySelectorAll('*')) for (const ps of ['::before', '::after']) if (/✓/.test(getComputedStyle(e, ps).content)) return `${e.className} ${ps}`;
    return '';
  });
  ok(!found, `${where}: no "✓" glyph (${found || 'none'})`);
};
// the camera's Pause: the buttons redraw while a test runs – tapped again until the pause screen shows
const pauseNow = async () => {
  await p.locator('.mob-camera-actions .pause').waitFor({ timeout: 60000 });
  for (let i = 0; i < 20 && !(await p.locator('.mob-hold-screen').isVisible().catch(() => false)); i++) {
    await p.locator('.mob-camera-actions .pause').click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(300);
  }
};
const swipeAway = async (row) => {
  const box = await row.boundingBox();
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x - (box.width * 0.65 * i) / 8, y);
  await p.mouse.up();
  await p.waitForTimeout(700);
};

const PLAN = {
  id: 'pp',
  source: 'TPI Level 1 Screen (Physio)',
  screenedAt: '2026-10-29T16:26:00+01:00',
  importedAt: '2026-10-29T16:26:00+01:00',
  gfh: 22,
  tests: [
    { name: 'Toe Touch', light: 'red' },
    { name: 'Single Leg Balance', light: 'red', left: 'red', right: 'yellow' },
    { name: 'Pelvic Tilt', light: 'yellow' },
    { name: 'Setup Posture', light: 'green' },
  ],
  faults: [
    { name: 'Early Extension', pct: 90 },
    { name: 'Sway', pct: 50 },
    { name: 'Flying Elbow', pct: 10 },
  ],
  routine: {
    name: 'Testroutine',
    exercises: [
      { id: 'e1', name: 'Gesäß anspannen', steps: ['Rückenlage.', 'Gesäß anspannen.'], sets: [{ reps: 2, repSec: 3, restSec: 2 }] },
      { id: 'e2', name: 'Brücke', steps: ['Becken heben.'], sets: [{ reps: 2, repSec: 2, restSec: 2 }] },
    ],
  },
  schedule: { perWeek: 3, days: [], remind: null },
  log: [
    { id: 'l1', at: '2026-11-10T08:00:00Z', done: 2, of: 2, min: 1, how: 'guided' },
    { id: 'l2', at: '2026-11-08T08:00:00Z', done: 2, of: 2, min: 1, how: 'entered' },
  ],
};

await p.goto(url, { timeout: 90000 });
await p.waitForTimeout(800);
await p.evaluate((plan) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', 'good');
  localStorage.setItem('golfos.mobility.fakeSpeed', '30');
  const at = '2026-11-09T18:00:00Z';
  const m = (value) => ({ value, grade: 'limited', source: 'camera', at });
  const results = {
    'pelvic-rotation': { both: m(16) },
    'single-leg': { left: m(6), right: m(8) },
    'seated-rotation': { left: m(30), right: m(33) },
    'deep-squat': { both: m(-18) },
    'toe-touch': { both: m(14) },
    bridge: { left: m(5), right: m(6) },
    'wrist-flex': { both: { value: null, grade: 'fail', source: 'self', pain: true, at } },
  };
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([{ id: 'q1', kind: 'quick', tests: Object.keys(results), createdAt: at, finishedAt: at, current: 6, hand: 'right', results }]));
  localStorage.setItem('golfos.mobility.physio.v1', JSON.stringify([plan]));
  // a training paused earlier today: one drill done
  const now = new Date().toISOString();
  localStorage.setItem('golfos.mobility.sessions.v1', JSON.stringify([{ id: 'paused1', startedAt: now, finishedAt: null, minutes: 10, drills: ['seated-rotation', 'deep-squat'], done: [{ drill: 'seated-rotation', sets: [{ side: null, reps: 20, target: 20, best: null }], at: now }] }]));
}, PLAN);
await p.reload();
await p.waitForTimeout(900);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-start').first().waitFor({ timeout: 20000 }).catch(async (e) => { if (process.env.AGDBG) await p.screenshot({ path: process.env.AGDBG }); throw e; });

// ---------- Screening tab: eyebrows, no h2 ----------
await noH2('Screening');
ok((await p.locator('main .eyebrow').filter({ hasText: 'Einzelne Tests' }).count()) === 1, 'Screening: "Einzelne Tests" as an eyebrow');
// a8: the pain mark – a white SVG sign on red, no "!"
await p.locator('.mob-test-row').filter({ hasText: 'Handgelenk beugen' }).scrollIntoViewIfNeeded();
const painMark = p.locator('.mob-test-row').filter({ hasText: 'Handgelenk beugen' }).locator('.mob-grade.pain');
ok((await painMark.locator('svg').count()) === 1 && !(await painMark.innerText()).trim(), 'the pain mark is the SVG warning sign, no "!"');
ok((await painMark.evaluate((e) => getComputedStyle(e).color)) === 'rgb(255, 255, 255)', 'the pain mark white on red');
await noTickGlyph('Screening');
await shot('screening');

// ---------- a1: a test's views as the switch ----------
await p.locator('.mob-test-row').filter({ hasText: 'Tiefe Kniebeuge' }).click();
await p.waitForTimeout(400);
ok((await p.locator('main .segmented').count()) === 0 && (await p.locator('main .step-pick').count()) === 1, 'a test page: the switch, no tab block');
ok(/^Ablauf 1 von 3$/.test(await stepNow()), `a test page opens on "Ablauf · 1 von 3" (${await stepNow()})`);
await p.locator('main .step-pick-now').click();
const testViews = await p.getByRole('dialog').locator('.pick-option strong').allInnerTexts();
ok(testViews.join('|') === 'Ablauf|Ergebnisse|Übungen', `its views: ${testViews.join(' · ')}`);
await p.getByRole('dialog').locator('.pick-option').filter({ hasText: 'Ergebnisse' }).click();
await p.waitForTimeout(350);
ok(/^Ergebnisse 2 von 3$/.test(await stepNow()) && (await p.locator('.mob-rating').isVisible()), 'picked "Ergebnisse": the rating shows');
await p.locator('main .step-pick').getByRole('button', { name: 'Vorherige' }).click();
await p.waitForTimeout(300);
ok(/^Ablauf/.test(await stepNow()), '‹ back to "Ablauf"');
await p.locator('.mob-3d-play').waitFor({ timeout: 30000 }).catch(() => {});
ok((await p.locator('.mob-3d-play').evaluate((e) => getComputedStyle(e).color).catch(() => '')) === 'rgb(255, 255, 255)', 'a8: the play symbol white on green');
await noH2('a test page');
await shot('test-views');
await back();

// ---------- the result: the switch, the goal (a4), the pain mark ----------
await tab('Ergebnis');
ok((await p.locator('main .segmented').count()) === 0 && /^Dein Körper 1 von 2$/.test(await stepNow()), `the result: "‹ Dein Körper ›" instead of a tab block (${await stepNow()})`);
await noH2('the result');
// a sided test judged by oneself as "it hurts" (one result for both sides): its lights red, counted as poor
const painLights = await p.locator('.mob-light-row').filter({ hasText: 'Handgelenk beugen' }).locator('.mob-dot').evaluateAll((xs) => xs.map((x) => x.classList[1]).join(' '));
ok(painLights === 'red red' && /1 schlecht/.test(await p.locator('.mob-light-sum').innerText()), `pain on a sided test: both lights red, one poor (${painLights})`);
// a4: the first time – no "Ziel speichern" button in the page, the floating tick once a handicap is chosen
const goal = p.locator('.mob-goal');
ok((await goal.locator('.eyebrow').filter({ hasText: 'Dein Ziel' }).count()) === 1 || (await p.locator('.eyebrow').filter({ hasText: 'Dein Ziel' }).count()) >= 1, 'the goal under the eyebrow "Dein Ziel"');
ok((await p.locator('main button.btn-primary').filter({ hasText: 'Ziel speichern' }).count()) === 0 && (await p.locator('.fab-save').count()) === 0, 'no goal yet: no save button while nothing is chosen');
await goal.locator('.settings-row').filter({ hasText: 'Ziel-Handicap' }).click();
await p.getByRole('dialog').locator('.pick-option').filter({ hasText: /^10/ }).click();
await p.waitForTimeout(250);
const fab = p.locator('.fab-save');
ok((await fab.count()) === 1 && (await fab.getAttribute('aria-label')) === 'Ziel speichern', 'a handicap chosen: the floating tick "Ziel speichern"');
await shot('goal-new');
await fab.click();
await p.waitForTimeout(300);
const stored1 = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.goal.v1') ?? '[]')[0]);
ok(stored1?.hcp === 10, `saved with the tick (${JSON.stringify(stored1)})`);
ok((await p.locator('.fab-save').count()) === 0 && (await p.locator('.mob-goal .autosave-note').count()) === 1, 'saved: no tick any more, the quiet autosave line');
await p.locator('.mob-goal .settings-row').filter({ hasText: 'Ziel-Handicap' }).click();
await p.getByRole('dialog').locator('.pick-option').filter({ hasText: /^15/ }).click();
await p.locator('.mob-goal .chip').filter({ hasText: 'Mehr Länge' }).click();
await p.waitForTimeout(1500);
const stored2 = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.goal.v1') ?? '[]')[0]);
ok(stored2?.hcp === 15 && stored2.focus.includes('length') && (await p.locator('.fab-save').count()) === 0, `changed: saved by itself, no button (${JSON.stringify(stored2)})`);
ok(/Gespeichert/.test(await p.locator('.mob-goal .autosave-note').innerText()), 'the line says "Gespeichert"');
await shot('goal-autosave');
// the next view with ›
await p.locator('main .step-pick').getByRole('button', { name: 'Nächste' }).click();
await p.waitForTimeout(400);
ok(/^Dein Schwung 2 von 2$/.test(await stepNow()) && (await p.locator('.mob-pattern').count()) >= 1, '› "Dein Schwung": the swing patterns');
await noH2('the result · Dein Schwung');
await noTickGlyph('the result');
// a2: no yellow in the likelihood bars – moderate is grey
const yellow = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => /rgb\(232, 185, 49\)|rgb\(201, 154, 18\)/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)).map((e) => e.className).slice(0, 3));
ok(!yellow.length, `no yellow in the result (${yellow.join(', ')})`);
await shot('result-swing');

// ---------- the drills tab: a7, the drill page's views ----------
await tab('Übungen');
await noH2('the drills');
const pausedRow = p.locator('.mob-train-open');
ok((await pausedRow.count()) === 1 && (await pausedRow.evaluate((e) => e.classList.contains('list-item'))) && (await pausedRow.locator('.list-mark .paused-mark').count()) === 1, 'the paused training: a list row with the pause mark in its own column');
ok((await pausedRow.locator('.btn-secondary, .btn-primary').count()) === 0 && /Pausiert/.test(await pausedRow.innerText()), `no "Fortsetzen" button in it (${(await pausedRow.innerText()).replace(/\n/g, ' · ')})`);
const cta = p.locator('main .sticky-cta');
ok((await barLabels(cta)) === 'Ins Training', `the plan for Training as the action "Ins Training" (${await barLabels(cta)})`);
ok(await cta.evaluate((e) => e.lastElementChild?.classList.contains('btn-primary') && /Jetzt trainieren/.test(e.lastElementChild.textContent)), 'the main button "Jetzt trainieren" last');
ok(!/›/.test(await cta.innerText()), 'no "Training › Üben › …" path text');
await shot('drills');
await cta.locator('.sc-action').filter({ hasText: 'Ins Training' }).click();
await p.waitForTimeout(300);
const plans = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.training.plans.v1') ?? '[]'));
ok(plans.length === 1 && /^Agility/.test(plans[0].name), `"Ins Training": the plan is in Training (${plans[0]?.name})`);
ok((await barLabels(cta)).includes('Training öffnen') && !/›/.test(await cta.innerText()), `then "Training öffnen" in the bar (${await barLabels(cta)})`);
await shot('drills-taken');
// a drill with videos: "‹ Anleitung ›"
const drillRows = p.locator('.mob-pillar-area .mob-test-row');
let videoDrill = false;
for (let i = 0; i < Math.min(6, await drillRows.count()); i++) {
  await drillRows.nth(i).click();
  await p.waitForTimeout(350);
  if (await p.locator('main .step-pick').count()) {
    videoDrill = true;
    ok(/^Anleitung 1 von 2$/.test(await stepNow()) && (await p.locator('main .segmented').count()) === 0, `a drill page: "‹ Anleitung ›" (${await stepNow()})`);
    await p.locator('main .step-pick').getByRole('button', { name: 'Nächste' }).click();
    await p.waitForTimeout(300);
    ok(/^Videos/.test(await stepNow()) && (await p.locator('.tr-video').count()) >= 1, '› "Videos": the videos');
    await noH2('a drill page');
    await back();
    break;
  }
  await back();
}
ok(videoDrill, 'a drill with videos found');

// ---------- the physio plan: a1, a2, a3 ----------
await p.locator('.mob-physio-open').click();
await p.locator('.mob-physio').waitFor({ timeout: 5000 });
ok((await p.locator('main .segmented').count()) === 0 && /^Routine 1 von 4$/.test(await stepNow()), `the physio plan: "‹ Routine ›" (${await stepNow()})`);
await pickView('Tagebuch');
const rows = p.locator('.mob-physio-log .swipe');
ok((await rows.count()) === 2 && (await p.locator('.mob-physio-log .icon-btn').count()) === 0, 'the diary: rows that swipe, no "✕"');
await shot('diary');
await swipeAway(rows.first());
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.physio.v1'))[0].log.length);
ok(after === 1 && (await p.locator('.undo-toast').isVisible()), `swiped away: gone, "Rückgängig" in the toast (${after} left)`);
await p.locator('.undo-toast button').click();
await p.waitForTimeout(400);
const restored = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.physio.v1'))[0].log.map((x) => x.id).join());
ok(restored === 'l1,l2' && (await rows.count()) === 2, `"Rückgängig": the entry back in its place (${restored})`);
await pickView('Ergebnisse');
const lightBg = await p.locator('.mob-physio-tests .mob-light.yellow').first().evaluate((e) => getComputedStyle(e).backgroundColor);
ok(lightBg === 'rgb(143, 163, 176)', `the middle light grey, not yellow (${lightBg})`);
ok(!/[▲▼◆]/.test(await p.locator('main').innerText()), 'no ▲ ▼ ◆ glyphs');
await noH2('the physio plan');
await shot('physio-results');
await pickView('Schwung');
const yellow2 = await p.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => /rgb\(232, 185, 49\)|rgb\(201, 154, 18\)/.test(getComputedStyle(e).backgroundColor + getComputedStyle(e).color)).length);
ok(yellow2 === 0, `the physio's swing: no yellow (${yellow2})`);
await back();

// ---------- the paused training: deleted from its leave sheet, "Rückgängig" brings it back (a6) ----------
await pausedRow.click();
await p.locator('.mob-setup').waitFor({ timeout: 10000 });
// a9: a picture and one line, no steps, no heading
ok((await p.locator('.mob-setup h2, .mob-setup ol').count()) === 0 && (await p.locator('.mob-setup .mob-setup-line').count()) === 1 && (await p.locator('.mob-setup svg').first().isVisible()), 'the setup: the picture and one line – no heading, no steps');
await shot('train-setup');
await back();
const sheet = p.locator('.sheet[role="dialog"]');
ok((await sheet.locator('h2').count()) === 0 && (await sheet.locator('.sheet-head strong').innerText()) === 'Training verlassen?' && /✕/.test(await sheet.locator('.sheet-head .icon-btn').innerText()), 'the leave sheet: its head as the round\'s (strong + ✕)');
ok((await barLabels(sheet)) === 'Pausieren|Löschen!' && (await sheet.locator('.btn-primary').innerText()) === 'Speichern & beenden' && (await sheet.locator('.btn-secondary').count()) === 0, `the leave sheet: Pausieren | Löschen (red) + "Speichern & beenden" (${await barLabels(sheet)})`);
await shot('train-leave');
await sheet.locator('.sc-action').filter({ hasText: 'Löschen' }).click();
await p.waitForTimeout(400);
const gone = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]').some((s) => s.id === 'paused1'));
ok(!gone && (await p.locator('.undo-toast').isVisible()) && (await p.locator('.mob-train-open').count()) === 0, 'Löschen: the training gone, "Rückgängig" in the toast');
await p.locator('.undo-toast button').click();
await p.waitForTimeout(400);
ok(await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]').some((s) => s.id === 'paused1')), '"Rückgängig": the paused training back');

// ---------- a guided training: the pause screen (a5), the summary without "Fertig" (a10) ----------
await p.locator('.mob-train-start').click();
await p.locator('.mob-start-train').click();
await pauseNow();
const hold = p.locator('.mob-hold-screen');
await hold.waitFor({ timeout: 10000 });
ok((await barLabels(hold)) === 'Pausieren|Es tut weh|Beenden!', `the pause screen: one bar Pausieren | Es tut weh | Beenden (red) (${await barLabels(hold)})`);
ok((await hold.locator('.btn-secondary').count()) === 0 && (await hold.evaluate((e) => { const bar = e.querySelector('.sc-actions'); const main = e.querySelector('.btn-primary'); return !!bar && !!main && main.textContent === 'Weiter' && !!(bar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING); })), '"Weiter" the green main button below the bar, no column of text buttons');
await noH2('the pause screen');
await shot('train-hold');
// it hurts: the drill stops, the next one begins; then finish → the summary
await hold.locator('.sc-action').filter({ hasText: 'Es tut weh' }).click();
await p.locator('.mob-camera-actions .pause').waitFor({ timeout: 60000 });
await pauseNow();
await hold.waitFor({ timeout: 10000 });
await hold.locator('.sc-action').filter({ hasText: 'Beenden' }).click();
await p.locator('.mob-train-summary').waitFor({ timeout: 10000 });
const sum = p.locator('.mob-train-summary');
ok((await p.getByRole('button', { name: 'Fertig', exact: true }).count()) === 0, 'the summary: no "Fertig" button');
ok((await barLabels(sum)) === 'Teilen|Löschen!', `the summary: its action bar Teilen | Löschen (${await barLabels(sum)})`);
await noH2('the summary');
await shot('train-summary');
await back();
ok(await p.locator('.mob-train-start').isVisible(), 'back with ‹: the drills tab');

// ---------- the range warm-up: setup as one line, no "Fertig" at the end ----------
await p.locator('.mob-warmup-open').click();
await p.locator('.mob-warmup .mob-setup').waitFor({ timeout: 10000 });
ok((await p.locator('.mob-warmup .mob-setup h2').count()) === 0 && (await p.locator('.mob-warmup .mob-setup .mob-setup-line').count()) === 1, 'the warm-up setup: one line, no heading');
await p.locator('.mob-warmup-start').click();
await p.locator('.mob-warmup-done').waitFor({ timeout: 120000 }).catch(() => {});
ok(await p.locator('.mob-warmup-done').isVisible(), 'the warm-up runs to its end');
ok((await p.getByRole('button', { name: 'Fertig', exact: true }).count()) === 0, 'the warm-up: no "Fertig" button');
await shot('warmup-done');
await back();
ok(await p.locator('.mob-warmup-card').isVisible(), 'back with ‹: the drills tab');

// ---------- a screening: the setup (a9), the pause screen (a5), the leave sheet with its finish question (a6) ----------
await tab('Screening');
await p.locator('.mob-start').filter({ hasText: 'Kurz-Check' }).click();
await p.locator('.mob-setup').waitFor({ timeout: 15000 });
ok((await p.locator('.mob-setup h2, .mob-setup ol').count()) === 0 && (await p.locator('.mob-setup .mob-setup-line').count()) === 1, 'the screening setup: the picture and one line');
ok((await p.locator('.mob-setup-tests .tr-thumb, .mob-setup-tests svg').count()) >= 6, 'the tests still listed');
ok((await p.locator('.mob-model.ready svg').count()) === 1, 'body tracking ready: an SVG tick, no "✓" glyph');
await noTickGlyph('the screening setup');
await shot('screening-setup');
await p.evaluate(() => localStorage.setItem('golfos.mobility.fakeSpeed', '8'));
await p.locator('.mob-start-coach').click();
// as qa/mobility.mjs: during the demo of a test the Pause is there to stay
await p.locator('.mob-demo.big').waitFor({ timeout: 60000 }).catch(() => {});
await pauseNow();
if (process.env.AGDBG && !(await hold.isVisible())) await p.screenshot({ path: process.env.AGDBG });
await hold.waitFor({ timeout: 10000 });
ok((await barLabels(hold)) === 'Pausieren|Es tut weh|Beenden!' && (await hold.locator('.btn-primary').innerText()) === 'Weiter', `the screening's pause screen as the training's (${await barLabels(hold)})`);
await shot('screening-hold');
await back();
ok((await barLabels(sheet)) === 'Pausieren|Abbrechen!' && (await sheet.locator('.btn-primary').innerText()) === 'Screening beenden' && (await sheet.locator('.btn-secondary').count()) === 0, `leaving: Pausieren | Abbrechen (red) + "Screening beenden" (${await barLabels(sheet)})`);
await sheet.locator('.btn-primary').click();
await p.waitForTimeout(250);
ok((await barLabels(sheet)) === 'Zurück|Löschen!' && (await sheet.locator('.btn-primary').innerText()) === 'Beenden & Ergebnis zeigen', `the finish question as the round's: Zurück | Löschen + "Beenden & Ergebnis zeigen" (${await barLabels(sheet)})`);
await shot('screening-finish');
await sheet.locator('.sc-action').filter({ hasText: 'Zurück' }).click();
await p.waitForTimeout(250);
ok((await sheet.count()) === 0 && (await hold.isVisible()), 'Zurück: the sheet closes, the pause screen stays');
await hold.locator('.sc-action').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(400);
ok(await p.locator('.mob-open').isVisible(), 'Pausieren: the paused screening on the screening tab');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
