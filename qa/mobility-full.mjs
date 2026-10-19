// The full screening in the trainer mode (Sascha 17.10.2026: set up once, tap once): all 10 camera tests with both
// sides run one after the other by themselves (a synthetic player instead of the camera), the questions and the five
// self checks come at the end, then the result. Checks that no test gets stuck (the facing check for side-on tests,
// the bridge lying) and counts the taps. Usage: node mobility-full.mjs <app url> [good|stiff]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const level = process.argv[3] ?? 'good';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx); // no weather calls from the tests (Open-Meteo quota of the home line)
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate((lv) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', lv);
  localStorage.setItem('golfos.mobility.fakeSpeed', '4');
}, level);
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-start').filter({ hasText: 'Komplettes Screening' }).click();
await p.locator('.mob-start-coach').click();
let taps = 1;
const intros = new Set();
const t0 = Date.now();
let stuck = '';
let lastChange = Date.now();
let lastTag = '';
let retestHeld = false;
while (Date.now() - t0 < 420000) {
  if (await p.locator('.mob-feel, .mob-ankle, .mob-self, .mob-summary').first().isVisible().catch(() => false)) break;
  const tag = await p.locator('.mob-side-tag').innerText().catch(() => '');
  const status = await p.locator('.mob-status').innerText().catch(() => '');
  if (tag !== lastTag) {
    lastTag = tag;
    lastChange = Date.now();
  }
  if (/von 15/.test(tag)) intros.add(tag);
  // a pause during the squat retest: "Continue" goes back to the retest, not to the squat again
  if (/^Nachtest/.test(tag) && !retestHeld && (await p.locator('.mob-coach-pause').isVisible().catch(() => false))) {
    retestHeld = true;
    await p.locator('.mob-coach-pause').click();
    await p.getByRole('button', { name: 'Weiter', exact: true }).click();
    await p.waitForTimeout(300);
    const back = await p.locator('.mob-side-tag').innerText().catch(() => '');
    ok(/^Nachtest/.test(back), `Continue after a pause in the retest goes back to the retest (${back})`);
    taps += 2;
  }
  if (Date.now() - lastChange > 45000) {
    stuck = `${tag} · ${status}`;
    break;
  }
  await p.waitForTimeout(200);
}
console.log('   ' + [...intros].join('\n   '));
ok(!stuck, `no test got stuck${stuck ? ' (' + stuck + ')' : ''}`);
// paused while a question is still open (bridge or knee to wall): it is kept and comes first after resuming
const asked = (await p.locator('.mob-feel').isVisible().catch(() => false)) ? 'feel' : (await p.locator('.mob-ankle').isVisible().catch(() => false)) ? 'ankle' : null;
if (asked) {
  const ask = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').find((x) => !x.finishedAt)?.ask ?? []);
  ok(ask[0] === asked, `the open question is kept in the screening (${JSON.stringify(ask)})`);
  await p.locator('.topbar .icon-btn').first().click();
  await p.locator('.sheet .btn-secondary').filter({ hasText: 'Pausieren' }).click();
  await p.locator('.mob-open').click();
  await p.waitForTimeout(500);
  ok(await p.locator('.mob-' + asked).isVisible(), 'after the pause the open question (' + asked + ') comes first, without the camera');
  taps += 2;
}
// the end: questions and self checks, each one tap
for (let i = 0; i < 12; i++) {
  if (await p.locator('.mob-summary').isVisible().catch(() => false)) break;
  if (await p.locator('.mob-feel').isVisible().catch(() => false)) await p.locator('.mob-feel .mob-option').first().click();
  else if (await p.locator('.mob-ankle').isVisible().catch(() => false)) await p.locator('.mob-ankle .mob-option').first().click();
  else if (await p.locator('.mob-self .mob-option:not(.mob-pain)').first().isVisible().catch(() => false)) await p.locator('.mob-self .mob-option:not(.mob-pain)').nth(1).click();
  else if (await p.getByRole('button', { name: 'Beenden & Ergebnis zeigen' }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Beenden & Ergebnis zeigen' }).click();
  else {
    await p.waitForTimeout(500);
    continue;
  }
  taps++;
  await p.waitForTimeout(500);
}
await p.locator('.mob-summary').waitFor({ timeout: 15000 }).catch(() => {});
const sc = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').at(-1));
const tested = Object.keys(sc?.results ?? {}).length;
ok(tested === 15, `${tested} of 15 tests saved`);
ok(!sc?.ask, 'no open question is left in the finished screening');
const cam = Object.values(sc?.results ?? {}).reduce((n, r) => n + ['left', 'right', 'both'].filter((k) => r[k]?.source === 'camera').length, 0);
ok(cam === 16, `${cam} of 16 camera steps measured by themselves (10 tests, 6 with both sides)`);
ok(taps <= 1 + 1 + 5 + 1 + 2 + (retestHeld ? 2 : 0), `${taps} taps for the whole full screening (start, the bridge question, 5 self checks, pause + resume${level === 'stiff' ? ', knee to wall' : ''})`);
ok(await p.locator('.mob-summary').isVisible(), 'the result opens at the end');
// repeat later: an earlier screening with less movement → the history says what changed per area
await p.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]');
  const last = list.at(-1);
  const less = (m) => (m && m.value != null ? { ...m, value: m.value - 6, at: '2026-09-18T06:00:00Z' } : m);
  const results = Object.fromEntries(Object.entries(last.results).map(([id, r]) => [id, { left: less(r.left), right: less(r.right), both: less(r.both) }]));
  list.unshift({ ...last, id: 'earlier', createdAt: '2026-09-18T06:00:00Z', finishedAt: '2026-09-18T06:20:00Z', results });
  localStorage.setItem('golfos.mobility.v1', JSON.stringify(list));
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.tabbar button').filter({ hasText: 'Verlauf' }).click();
await p.waitForTimeout(500);
const change = await p.locator('.mob-change').innerText().catch(() => '');
ok(/Seit dem/.test(change) && /Deine Beweglichkeit \d+ → \d+/.test(change) && /\+\d+ %/.test(change), `the history says what changed since the screening before – the overall value and each area (${change.split('\n').slice(0, 4).join(' · ')})`);
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
