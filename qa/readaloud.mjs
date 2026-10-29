// QA (Sascha 28.10.2026: "check that the speaker and the read-aloud work everywhere"): every place that reads aloud –
// the caddie by himself (setting "Von selbst vorlesen"), the caddie's speaker, the answer to a question, the rules of
// every game form, the round summary on the scorecard. The speech engine is recorded (a headless browser has no voice,
// as qa/caddievoice.mjs): each text arrives, in German, without signs a voice spells out ("·", "−", "&", "km/h" …),
// the speaker is green while it talks and a second tap stops it.
// Usage: node qa/readaloud.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const BAD = /[·→×≈~&…/−]|undefined|NaN|\.\./;
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
await ctx.addInitScript(() => {
  const w = window;
  w.__said = [];
  w.__played = 0;
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { w.__played++; return orig.call(this).catch(() => undefined); };
  let cur = null;
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [{ lang: 'de-DE', name: 'Anna', default: true, localService: true }],
    speak(u) { w.__said.push({ text: u.text, lang: u.lang }); cur = u; fake.speaking = true; setTimeout(() => u.onstart?.(), 50); setTimeout(() => { if (cur === u) { fake.speaking = false; u.onend?.(); } }, 1500); },
    cancel() { if (cur) { const u = cur; cur = null; fake.speaking = false; u.onend?.(); } },
    resume() {},
  };
  Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
});
const p = await ctx.newPage();
const errs = [];
// (headless WebKit refuses the live site's service worker – as in the other tests, no fault of the app)
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const said = () => p.evaluate(() => window.__said);
const last = async () => (await said()).at(-1) ?? { text: '', lang: '' };
const clean = (t) => t.length > 5 && !BAD.test(t);
const show = (t) => `"${t.slice(0, 90)}${t.length > 90 ? '…' : ''}"`;

// ---- 1 · the round: the caddie by himself, his speaker, a question ----
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.caddie.v1', JSON.stringify({ voice: true }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
for (let k = 0; k < 40 && !(await said()).length; k++) await p.waitForTimeout(250);
let s = await said();
ok(s.length >= 1 && clean(s[0].text) && s[0].lang === 'de-DE', `"Von selbst vorlesen": the caddie reads his advice by himself, German, clean – ${show(s[0]?.text ?? '')}`);
ok((await p.evaluate(() => window.__played)) >= 1, 'the audio woken for it (heard on silent)');
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(800);
const speaker = p.getByRole('button', { name: 'Vorlesen oder stoppen' });
// while he reads by himself the speaker is green – a tap then stops him; wait until he is done
for (let k = 0; k < 40 && (await speaker.getAttribute('aria-pressed')) === 'true'; k++) await p.waitForTimeout(250);
await p.waitForTimeout(400);
const n0 = (await said()).length;
await speaker.click();
await p.waitForTimeout(400);
const card = await last();
ok((await said()).length === n0 + 1 && clean(card.text), `the caddie's speaker reads the card – ${show(card.text)}`);
ok((await speaker.getAttribute('aria-pressed')) === 'true', 'green while he reads');
await speaker.click();
await p.waitForTimeout(300);
ok((await speaker.getAttribute('aria-pressed')) === 'false', 'a second tap stops him');
await p.getByRole('button', { name: 'Fragen', exact: true }).click();
await p.waitForTimeout(400);
for (const q of ['Welcher Schläger?', 'Wie weit?', 'Wie ist der Wind?', 'Was ist der Plan?']) {
  await p.getByRole('button', { name: q, exact: true }).click();
  await p.waitForTimeout(500);
  const a = await last();
  ok(clean(a.text), `"${q}" – the answer is read aloud ${show(a.text)}`);
}
await p.keyboard.press('Escape');

// ---- 2 · Games: the rules of every form ----
// the running round away (else the app opens straight on its hole)
await p.evaluate(() => {
  localStorage.removeItem('golfos.rounds.v1');
  sessionStorage.setItem('golfos.module', 'games');
});
await p.goto(url);
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.waitForTimeout(500);
const open = async () => {
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.waitForTimeout(300);
  return p.getByRole('dialog', { name: 'Spielform wählen' });
};
let sheet = await open();
const forms = (await sheet.locator('.pick-option strong').allInnerTexts()).map((x) => x.trim());
await p.keyboard.press('Escape');
await sheet.locator('.icon-btn').first().click().catch(() => {});
await p.waitForTimeout(300);
const badForms = [];
for (const name of forms) {
  sheet = await open();
  await sheet.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first().click();
  await p.waitForTimeout(300);
  const read = p.getByRole('button', { name: 'Spielform vorlesen oder stoppen' });
  const before = (await said()).length;
  await read.click();
  await p.waitForTimeout(300);
  const r = await last();
  const pressed = (await read.getAttribute('aria-pressed')) === 'true';
  await read.click(); // stop
  await p.waitForTimeout(200);
  const stopped = (await read.getAttribute('aria-pressed')) === 'false';
  if ((await said()).length !== before + 1 || !clean(r.text) || !r.text.startsWith(name.split(' ')[0]) || !pressed || !stopped) badForms.push(`${name}: ${show(r.text)} pressed ${pressed} stopped ${stopped}`);
}
ok(forms.length >= 10 && badForms.length === 0, `the rules of all ${forms.length} game forms read aloud – clean, green, stopped by a second tap${badForms.length ? ' · ' + badForms.join(' | ') : ''}`);

// ---- 3 · the round summary on the scorecard ----
await p.evaluate((exp) => {
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: '2026-10-16T20:00:00Z' }]));
}, exp);
await p.goto(url);
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1500);
const sumBtn = p.getByRole('button', { name: 'Vorlesen oder stoppen' }).first();
ok((await sumBtn.count()) === 1, 'the round summary has its speaker');
const n1 = (await said()).length;
await sumBtn.click();
await p.waitForTimeout(400);
const sum = await last();
ok((await said()).length === n1 + 1 && clean(sum.text), `the round summary is read aloud ${show(sum.text)}`);
await sumBtn.click();
await p.waitForTimeout(300);
ok((await sumBtn.getAttribute('aria-pressed')) === 'false', 'and stopped by a second tap');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
