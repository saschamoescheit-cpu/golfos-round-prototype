// QA (Sascha 17.10.2026): the caddie's read-aloud speaks – "I tap read aloud, nothing happens" – and new advice shows
// an "i" on the caddie button. The speech engine is recorded (a headless browser has no voice): the tap plays the
// silent sound that wakes the iPhone's audio (heard with the ring switch on silent), then speaks the advice; a second
// tap stops; an engine that never starts does not leave the speaker green.
// Usage: node qa/caddievoice.mjs [url]   (SHOTS=<dir> for a screenshot)
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await ctx.addInitScript(() => {
  const w = window;
  w.__said = [];
  w.__played = 0;
  w.__mute = false; // true: the engine takes the text but never starts
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { w.__played++; return orig.call(this).catch(() => undefined); };
  let cur = null;
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [{ lang: 'de-DE', name: 'Anna' }],
    speak(u) { w.__said.push(u.text); if (w.__mute) return; cur = u; fake.speaking = true; setTimeout(() => u.onstart?.(), 50); setTimeout(() => { if (cur === u) { fake.speaking = false; u.onend?.(); } }, 1500); },
    cancel() { if (cur) { const u = cur; cur = null; fake.speaking = false; u.onend?.(); } },
    resume() {},
  };
  Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
});
const p = await ctx.newPage();
const errs = [];
// MapLibre loads map tiles through blob: addresses and frees them once drawn – WebKit under test now and then reports
// the freed one ("…localhost:5173/<uuid> due to access control checks"); the tile is on the map, nothing is wrong
p.on('pageerror', (e) => { if (!/localhost:\d+\/[0-9a-f-]{36} due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
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
await p.waitForTimeout(5000);
// unread: a small green dot, no "!" or "i" (Sascha 17.10.2026); gone once opened, back on the next hole
await p.locator('.map-tool .tool-dot').waitFor({ timeout: 15000 }).catch(() => {}); // the caddie speaks once GPS and weather are in
ok((await p.locator('.map-tool .tool-dot').count()) === 1 && (await p.locator('.map-tool .tool-badge').count()) === 0, 'the caddie unread: a small green dot');
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(800);
const speaker = p.getByRole('button', { name: 'Vorlesen oder stoppen' });
await speaker.click();
await p.waitForTimeout(400);
const said = await p.evaluate(() => window.__said);
ok(said.length === 1 && said[0].length > 5, `the tap reads the advice aloud ("${(said[0] ?? '').slice(0, 60)}")`);
ok((await p.evaluate(() => window.__played)) >= 1, 'the tap wakes the audio (heard on silent)');
ok((await speaker.getAttribute('aria-pressed')) === 'true', 'the speaker is on (green) while he reads');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/caddievoice.png` });
await speaker.click();
await p.waitForTimeout(300);
ok((await speaker.getAttribute('aria-pressed')) === 'false', 'a second tap stops him');
// a stuck engine: never starts – the speaker is not green for ever
await p.evaluate(() => (window.__mute = true));
await speaker.click();
await p.waitForTimeout(3200);
ok((await speaker.getAttribute('aria-pressed')) === 'false', 'an engine that never starts does not leave the speaker green');
await p.getByRole('button', { name: /Caddie ausblenden/ }).click().catch(() => {});
await p.waitForTimeout(300);
ok((await p.locator('.map-tool .tool-dot').count()) === 0, 'read: the dot is gone after closing');
await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
await p.waitForTimeout(2500);
if (await p.locator('.score-panel').count()) { await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click().catch(() => {}); await p.waitForTimeout(2500); }
await p.locator('.map-tool .tool-dot').waitFor({ timeout: 15000 }).catch(() => {});
ok((await p.locator('.map-tool .tool-dot').count()) === 1, 'the next hole: the dot is back');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
