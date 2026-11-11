// Agility in the iOS app (Sascha 01.11.2026: "every change also for the native app"). WKWebView has no service worker,
// no Wake Lock of its own and no browser share for files – the app's plugins stand in (src/lib/native.ts). Here the page
// believes it is the app: Capacitor's iOS bridge is faked and answers the plugins, every call written down.
// 1 · a single camera test (the fake player) runs to its result; the screen is kept awake through KeepAwake and let
//     go after; the result is spoken (the fake player's own cues are silent)
// 2 · a physio plan is imported from a file
// 3 · the motion logs kept on the phone go to the iPhone's share sheet (Filesystem + Share), not a download
// Usage: node qa/mobility-native.mjs [app url] [shots dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', serviceWorkers: 'block' });
await mockNet(ctx);
await ctx.addInitScript(() => {
  const w = window;
  // as the app: Capacitor finds its iOS bridge, the plugins answer
  w.webkit = { messageHandlers: { bridge: { postMessage: () => {} } } };
  w.__calls = [];
  const m = (...names) => names.map((name) => ({ name, rtype: 'promise' }));
  const answers = { Filesystem: { writeFile: (o) => ({ uri: `file:///cache/${o.path}` }) } };
  w.Capacitor = {
    PluginHeaders: [
      { name: 'KeepAwake', methods: m('keepAwake', 'allowSleep', 'isSupported', 'isKeptAwake') },
      { name: 'Share', methods: m('share', 'canShare') },
      { name: 'Filesystem', methods: m('writeFile', 'deleteFile') },
      { name: 'PushNotifications', methods: [...m('removeAllListeners', 'checkPermissions'), { name: 'addListener', rtype: 'callback' }] },
      { name: 'App', methods: [...m('removeAllListeners', 'getLaunchUrl'), { name: 'addListener', rtype: 'callback' }] },
    ],
    nativePromise: (plugin, method, options) => {
      w.__calls.push(`${plugin}.${method}`);
      return Promise.resolve(answers[plugin]?.[method]?.(options ?? {}) ?? {});
    },
    nativeCallback: (plugin, method) => {
      w.__calls.push(`${plugin}.${method}`);
      return String(w.__calls.length);
    },
  };
  // the speech engine (the app speaks through WKWebView's, as Safari)
  w.__said = [];
  let cur = null;
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [{ lang: 'de-DE', name: 'Anna' }],
    speak(u) { w.__said.push(u.text); cur = u; fake.speaking = true; setTimeout(() => u.onstart?.(), 30); setTimeout(() => { if (cur === u) { fake.speaking = false; u.onend?.(); } }, 300); },
    cancel() { if (cur) { const u = cur; cur = null; fake.speaking = false; u.onend?.(); } },
    resume() {},
  };
  Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let bad = 0;
let n = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const shot = async (name) => shots && p.screenshot({ path: `${shots}/native-${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const calls = () => p.evaluate(() => window.__calls.slice());
const said = () => p.evaluate(() => window.__said.slice());
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();

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
ok(await p.evaluate(() => window.Capacitor?.isNativePlatform?.() === true), 'the page runs as the app');

// 1 · a single camera test
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await tab('Screening');
await p.locator('.mob-test-row').filter({ hasText: 'Zehen berühren' }).click();
await p.getByRole('button', { name: 'Test starten' }).click();
await p.waitForTimeout(1500); // the brief page settles
await p.locator('.mob-start-coach').click();
// after the demo the camera starts: from then on iOS keeps the screen on
const awake = await p.waitForFunction(() => window.__calls.includes('KeepAwake.keepAwake'), null, { timeout: 60000 }).then(() => true, () => false);
await shot('camera');
ok(awake, 'the screen is kept awake by iOS (KeepAwake) while the camera runs');
await p.locator('main .step-pick').waitFor({ timeout: 90000 }).catch(() => {});
ok((await p.locator('main .step-pick-now strong').innerText().catch(() => '')) === 'Ergebnisse', 'the test ran to its result in the app');
await p.waitForTimeout(500);
ok((await calls()).includes('KeepAwake.allowSleep'), 'after the test the screen may sleep again');
const words = (await said()).join(' | ');
ok(/Hier ist dein Ergebnis/.test(words), `spoken through WKWebView's speech (${words.slice(0, 80)})`);
await shot('result');
await p.locator('.topbar .icon-btn').first().click();

// 2 · the physio plan from a file
await tab('Übungen');
await p.waitForTimeout(300);
const PLAN = {
  source: 'TPI Level 1 Screen (Physio)',
  screenedAt: '2026-10-29T16:26:00+01:00',
  tests: [{ name: 'Toe Touch', light: 'red' }, { name: 'Pelvic Tilt', light: 'yellow' }],
  faults: [{ name: 'Early Extension', pct: 90 }],
  routine: { name: 'Testroutine', exercises: [{ name: 'Brücke', steps: ['Becken heben.'], sets: [{ reps: 2, repSec: 2, restSec: 2 }] }] },
};
await p.locator('.mob-physio-import input[type=file]').setInputFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PLAN)) });
await p.locator('.mob-physio').waitFor({ timeout: 5000 }).catch(() => {});
ok(await p.locator('.mob-physio').isVisible(), 'the physio plan is imported in the app');
await shot('physio');
await p.locator('.topbar .icon-btn').first().click();

// 3 · the kept motion logs to the share sheet
await tab('Verlauf');
await p.locator('.mob-log-kept').waitFor({ timeout: 10000 }).catch(() => {});
ok(await p.locator('.mob-log-kept').isVisible(), 'the motion log of the test is kept on the phone');
await p.locator('.mob-log-kept-share').click();
await p.waitForFunction(() => window.__calls.includes('Share.share'), null, { timeout: 10000 }).catch(() => {});
const c = await calls();
ok(c.includes('Filesystem.writeFile') && c.includes('Share.share'), 'shared through the iPhone\'s share sheet (file into the app cache, then Share)');
await p.locator('.mob-log-kept').getByText('Geteilt').waitFor({ timeout: 5000 }).catch(() => {});
ok(/Geteilt/.test(await p.locator('.mob-log-kept').innerText().catch(() => '')), 'the card says "Geteilt – danke."');
await shot('shared');

// the faked bridge lacks plugins the app has (sign-in link, push token) – that is the fake, not the app
const real = errs.filter((e) => !/not implemented on ios/i.test(e));
ok(real.length === 0, `no errors on the page${real.length ? ': ' + real.join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
