// The trainer mode when a movement is not recognised (the player is 2.5–3 m away or lying on the floor): it tries
// again by itself twice with a countdown, without a tap; after the third miss it asks the player to come to the phone.
// The synthetic player is "not recognised" via golfos.mobility.fakeMiss. Usage: node mobility-retry.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const run = async (misses) => {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx); // no weather calls from the tests (Open-Meteo quota of the home line)
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.evaluate((n) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.lang.v1', 'de');
    localStorage.setItem('golfos.mobility.fake', 'good');
    localStorage.setItem('golfos.mobility.fakeSpeed', '4');
    localStorage.setItem('golfos.mobility.fakeMiss', String(n));
  }, misses);
  await p.reload();
  await p.waitForTimeout(800);
  await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
  await p.locator('.mob-start').filter({ hasText: 'Kurz-Check' }).click();
  await p.locator('.mob-start-coach').click();
  const seen = new Set();
  let countdown = '';
  const t0 = Date.now();
  // until the first test is saved, or nothing goes on for 25 s
  let last = '';
  let since = Date.now();
  while (Date.now() - t0 < 120000) {
    const saved = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').at(-1)?.results ?? {}).length);
    if (saved) break;
    const state = await p.evaluate(() => {
      const res = document.querySelector('.mob-result');
      const btn = [...document.querySelectorAll('.btn-primary')].map((x) => x.innerText).find((x) => /Nochmal versuchen/.test(x)) ?? '';
      return { missed: !!res && /nicht erkannt/.test(res.textContent ?? ''), btn };
    });
    if (state.missed) seen.add(state.btn);
    if (/\(\d\)/.test(state.btn)) countdown = state.btn;
    const now = JSON.stringify(state) + (await p.locator('.mob-status').innerText().catch(() => ''));
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since > 25000) break;
    await p.waitForTimeout(150);
  }
  const results = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('golfos.mobility.v1') ?? '[]').at(-1)?.results ?? {}));
  const waiting = await p.locator('.mob-result').filter({ hasText: 'nicht erkannt' }).isVisible().catch(() => false);
  const btn = await p.evaluate(() => [...document.querySelectorAll('.btn-primary')].map((x) => x.innerText).find((x) => /Nochmal versuchen/.test(x)) ?? '');
  await ctx.close();
  return { results, seen, countdown, waiting, btn, errs };
};

// two misses: both are tried again by themselves, the third attempt is measured and saved – no tap
const two = await run(2);
ok(two.seen.size >= 1 && /\(\d\)/.test(two.countdown), `not recognised: "Try again" counts down by itself (${two.countdown} · seen ${JSON.stringify([...two.seen])})`);
ok(two.results.length >= 1, `after two misses the test is measured and saved without a tap (${two.results.join(', ')})`);
ok(two.errs.length === 0, `no page errors${two.errs.length ? ': ' + two.errs.join(' | ') : ''}`);
// three misses: then it waits for the player at the phone (no endless loop)
const three = await run(3);
ok(three.results.length === 0 && three.waiting && !/\(\d\)/.test(three.btn), `after the third miss it waits for a tap ("${three.btn}")`);
ok(three.errs.length === 0, `no page errors${three.errs.length ? ': ' + three.errs.join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
