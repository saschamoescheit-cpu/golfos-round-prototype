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
ok(await p.locator('.module-card').filter({ hasText: 'Beweglichkeits-Screening' }).isVisible(), 'the module card says "Beweglichkeits-Screening" (not TPI)');
ok((await p.getByText('TPI').count()) === 0, 'no "TPI" on the start page');
await shot('start');
await p.locator('.module-card').filter({ hasText: 'Beweglichkeits-Screening' }).click();
await p.locator('.mob-start').first().waitFor({ timeout: 20000 });
const tabs = await p.locator('.tabbar button').allInnerTexts();
ok(tabs.map((x) => x.trim()).join('|') === 'Screening|Ergebnis|Übungen|Verlauf|Profil', `menu: ${tabs.join(' · ')}`);
ok((await p.locator('.module-tag').textContent()) === 'Beweglichkeit', 'module header');
ok((await p.getByText('So funktioniert').count()) === 0, 'no intro card');
ok((await p.locator('.mob-test-row').count()) === 15, '15 single tests listed');
await shot('screening-tab');
await small('the screening tab');

// the empty result and drills tabs
await tab('Ergebnis');
ok(await p.getByText('Noch kein Ergebnis').isVisible(), 'empty result points to the screening');
await tab('Screening');

// ---------- quick check with the stiff player ----------
await p.locator('.mob-start').filter({ hasText: 'Kurz-Check' }).click();
await p.getByRole('button', { name: 'Kamera starten' }).waitFor();
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'the test shows its picture');
ok((await p.locator('.tr-video').count()) >= 1, 'the test shows its video');
await shot('brief');
let steps = 0;
for (let i = 0; i < 12; i++) {
  const start = p.getByRole('button', { name: 'Kamera starten' });
  if (!(await start.isVisible().catch(() => false))) break;
  if (await p.locator('.sheet').isVisible().catch(() => false)) break;
  const name = await p.locator('.tr-now-name').innerText();
  await start.click();
  if (i === 0) {
    await p.locator('.mob-live').waitFor({ timeout: 15000 }).catch(() => {});
    await shot('camera-live');
  }
  const save = p.getByRole('button', { name: 'Speichern und weiter' });
  const again = p.getByRole('button', { name: 'Nochmal versuchen' });
  await Promise.race([save.waitFor({ timeout: 40000 }), again.waitFor({ timeout: 40000 })]).catch(() => {});
  if (i === 0) await shot('camera-result');
  if (await save.isVisible().catch(() => false)) {
    steps++;
    const grade = await p.locator('.mob-outcome .mob-grade').innerText();
    console.log(`   ${name}: ${await p.locator('.mob-value').innerText()} ${grade}`);
    await save.click();
  } else {
    console.log(`   ${name}: not recognised`);
    ok(false, `${name} was measured`);
    await p.getByRole('button', { name: 'Selbst einschätzen' }).click();
    await p.locator('.mob-option').first().click();
  }
  await p.waitForTimeout(300);
}
ok(steps === 9, `${steps} of 9 camera steps measured (6 tests, 3 with both sides)`);
await p.getByRole('button', { name: 'Beenden & Ergebnis zeigen' }).waitFor({ timeout: 5000 }).catch(() => {});
await shot('finish-sheet');
await p.getByRole('button', { name: 'Beenden & Ergebnis zeigen' }).click();
await p.locator('.mob-summary').waitFor();
ok(await p.locator('.mob-summary').isVisible(), 'the result opens after the screening');
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
await shot('pattern');
await p.locator('.topbar .icon-btn').first().click();
await p.locator('.segmented button').filter({ hasText: 'Dein Körper' }).click();
ok((await p.locator('.mob-test-row').count()) === 15, 'body result lists all 15 tests by area');
ok((await p.locator('.mob-test-row.untested').count()) === 9, 'the 9 tests not in the quick check are marked untested');
await shot('result-body');

// ---------- drills → Training ----------
await tab('Übungen');
await p.waitForTimeout(300);
const drillGroups = await p.locator('.mob-drill-head').count();
ok(drillGroups >= 4, `${drillGroups} limited tests with drills`);
await shot('drills');
await small('the drills');
await p.locator('.mob-test-row').first().click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-video').count()) >= 1, 'a drill has videos');
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'a drill has its picture');
await shot('drill');
await p.locator('.topbar .icon-btn').first().click();
await p.locator('.sticky-cta .btn-primary').click();
ok(await p.getByText('Meine Pläne').isVisible(), 'the plan is in Training');
const plans = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.training.plans.v1') ?? '[]'));
ok(plans.length === 1 && plans[0].items.length >= 4 && plans[0].name.startsWith('Beweglichkeit'), `plan "${plans[0]?.name}" with ${plans[0]?.items.length} drills`);
await p.getByRole('button', { name: 'Training öffnen' }).click();
await p.waitForTimeout(1500);
ok((await p.locator('.module-tag').textContent()) === 'Training', 'Training opens');
ok((await p.getByText(plans[0]?.name ?? '#').count()) >= 1, 'the plan is listed in Training');
await p.locator('.module-switch').click();
await p.locator('.module-card').filter({ hasText: 'Beweglichkeits-Screening' }).click();
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

// ---------- a single self check ----------
await tab('Screening');
await p.locator('.mob-test-row').filter({ hasText: 'Handgelenk anwinkeln' }).click();
await p.waitForTimeout(300);
const tt = await p.locator('.tr-tabs [role="tab"]').allInnerTexts();
ok(tt.join('|') === 'Ablauf|Ergebnisse|Übungen', `test page tabs: ${tt.join(' · ')}`);
await shot('test-page');
await p.getByRole('button', { name: 'Test starten' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.mob-option').count()) === 3, 'self check offers three pictures');
await shot('self-check');
await small('a self check');
await p.locator('.mob-option.limited').click();
await p.waitForTimeout(500);
ok((await p.locator('.topbar h1').innerText()) === 'Handgelenk anwinkeln', 'back on the test page after a single test');
await p.locator('.tr-tabs [role="tab"]').filter({ hasText: 'Ergebnisse' }).click();
ok(await p.getByText('selbst eingeschätzt').first().isVisible(), 'the self-judged result is listed');
await p.locator('.topbar .icon-btn').first().click();

// ---------- pause and continue ----------
await p.evaluate(() => localStorage.setItem('golfos.mobility.fake', 'good'));
await p.locator('.mob-start').filter({ hasText: 'Komplettes Screening' }).click();
await p.getByRole('button', { name: 'Kamera starten' }).click();
await p.getByRole('button', { name: 'Speichern und weiter' }).waitFor({ timeout: 40000 });
await p.getByRole('button', { name: 'Speichern und weiter' }).click();
await p.locator('.hole-bar-handle').click();
await shot('drawer');
await small('the screening in play');
await p.locator('.drawer-action').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.mob-open').isVisible(), 'the paused screening is offered on the screening tab');
ok((await p.locator('.tabbar button').first().locator('.tabbar-dot').count()) === 1, 'the menu shows a dot for the paused screening');
await p.locator('.module-switch').click();
ok(await p.getByText('Ein Screening ist pausiert').isVisible(), 'the start page says a screening is paused');
await p.locator('.module-card').filter({ hasText: 'Beweglichkeits-Screening' }).click();
await p.locator('.mob-open').click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-now-name').innerText()) === 'Hüftrotation auf einem Bein', 'continues with the next open test');

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
const rh = await p.locator('.mob-pattern').allInnerTexts();
const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.profile.v1') ?? '{}'));
await p.evaluate((pr) => localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...pr, hand: 'left' })), prof);
await p.reload();
await p.waitForTimeout(1200);
await tab('Ergebnis');
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
