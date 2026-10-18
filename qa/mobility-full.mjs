// The full screening in the trainer mode (Sascha 17.10.2026: set up once, tap once): all 10 camera tests with both
// sides run one after the other by themselves (a synthetic player instead of the camera), the questions and the five
// self checks come at the end, then the result. Checks that no test gets stuck (the facing check for side-on tests,
// the bridge lying) and counts the taps. Usage: node mobility-full.mjs <app url> [good|stiff]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const level = process.argv[3] ?? 'good';
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
while (Date.now() - t0 < 420000) {
  if (await p.locator('.mob-feel, .mob-ankle, .mob-self, .mob-summary').first().isVisible().catch(() => false)) break;
  const tag = await p.locator('.mob-side-tag').innerText().catch(() => '');
  const status = await p.locator('.mob-status').innerText().catch(() => '');
  if (tag !== lastTag) {
    lastTag = tag;
    lastChange = Date.now();
  }
  if (/von 15/.test(tag)) intros.add(tag);
  if (Date.now() - lastChange > 45000) {
    stuck = `${tag} · ${status}`;
    break;
  }
  await p.waitForTimeout(200);
}
console.log('   ' + [...intros].join('\n   '));
ok(!stuck, `no test got stuck${stuck ? ' (' + stuck + ')' : ''}`);
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
const cam = Object.values(sc?.results ?? {}).reduce((n, r) => n + ['left', 'right', 'both'].filter((k) => r[k]?.source === 'camera').length, 0);
ok(cam === 16, `${cam} of 16 camera steps measured by themselves (10 tests, 6 with both sides)`);
ok(taps <= 1 + 1 + 5 + 1, `${taps} taps for the whole full screening (start, the bridge question, 5 self checks${level === 'stiff' ? ', knee to wall' : ''})`);
ok(await p.locator('.mob-summary').isVisible(), 'the result opens at the end');
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
