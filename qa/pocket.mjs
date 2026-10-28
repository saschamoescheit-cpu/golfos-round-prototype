// QA (Sascha 28.10.2026: "the screen not locked but inactive, so GPS and the shot detection work – I want to test it on
// my next round", and shot by sound with it): pocket mode as a test, switched on in the profile. The screen black, the
// GPS track keeps growing, the microphone keeps listening (Edge plays a sound file as the microphone); hold 1 s to leave –
// like unlocking: the next fix is marked "phone out at the ball" for the shot detection, the map shows again.
// Usage: node qa/pocket.mjs [url]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
// the sound: 12 s at 48 kHz – quiet wind, a strike at 3 s and 8 s (as qa/soundtest.mjs)
const RATE = 48000;
const n = RATE * 12;
const pcm = new Int16Array(n);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let k = 0; k < n; k++) {
  const t = k / RATE;
  let v = rnd() * 0.01;
  for (const at of [3, 8]) if (t >= at && t < at + 0.05) v += (k % 2 ? 1 : -1) * 0.8 * Math.exp(-(t - at) / 0.004);
  pcm[k] = Math.max(-1, Math.min(1, v)) * 32767;
}
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(wav, 44);
const file = fileURLToPath(new URL('./fixtures/cracks-pocket.wav', import.meta.url));
writeFileSync(file, wav);

const b = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation', 'microphone'] });
await mockNet(ctx);
// the speech engine recorded (as qa/caddievoice.mjs): he talks for 1.5 s
await ctx.addInitScript(() => {
  const w = window;
  w.__said = [];
  let cur = null;
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [{ lang: 'de-DE', name: 'Anna', default: true, localService: true }],
    speak(u) { w.__said.push(u.text); cur = u; fake.speaking = true; setTimeout(() => u.onstart?.(), 50); setTimeout(() => { if (cur === u) { fake.speaking = false; u.onend?.(); } }, 1500); },
    cancel() { if (cur) { const u = cur; cur = null; fake.speaking = false; u.onend?.(); } },
    resume() {},
  };
  Object.defineProperty(w, 'speechSynthesis', { value: fake, configurable: true });
  w.SpeechSynthesisUtterance = function (t) { this.text = t; };
  // the microphone's streams: how many were opened, how many are live
  w.__streams = [];
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); w.__streams.push(s); return s; };
  w.__micLive = () => w.__streams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(800);

// the switch in the profile
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(600);
const sw = p.getByRole('switch', { name: /Taschenmodus \(Test\)/ });
ok((await sw.count()) === 1 && (await sw.getAttribute('aria-checked')) === 'false', 'profile: "Taschenmodus (Test)" as a switch, off');
await sw.click();
ok((await sw.getAttribute('aria-checked')) === 'true' && (await p.evaluate(() => localStorage.getItem('golfos.pockettest.v1'))) === '1', 'switched on and kept');
await p.evaluate(() => localStorage.setItem('golfos.soundtest.v1', '1'));

await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
await p.waitForTimeout(500);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').waitFor({ timeout: 20000 });
await p.waitForTimeout(2000);
const pocketBtn = p.getByRole('button', { name: /Taschenmodus: Bildschirm schwarz/ });
ok((await pocketBtn.count()) === 1, 'the pocket tool on the map');

// listening; the caddie reads aloud: the microphone pauses while he talks and listens again afterwards
await p.getByRole('button', { name: /Schläge per Ton erkennen/ }).click();
await p.waitForTimeout(500);
await p.getByRole('button', { name: /Caddie zeigen/ }).click().catch(() => {});
await p.waitForTimeout(600);
await p.getByRole('button', { name: 'Vorlesen oder stoppen' }).click();
await p.waitForTimeout(700);
const mic = () => p.evaluate(() => ({ opened: window.__streams.length, live: window.__micLive() }));
const during = await mic();
ok((await p.evaluate(() => window.__said.length)) === 1 && during.live === 0, `the caddie talks: the microphone paused (${JSON.stringify(during)})`);
await p.waitForTimeout(2500);
const afterTalk = await mic();
ok(afterTalk.live === 1 && afterTalk.opened === 2, `he is done: the microphone listens again (${JSON.stringify(afterTalk)})`);
await p.getByRole('button', { name: /Caddie ausblenden/ }).click().catch(() => {});
await p.waitForTimeout(300);
await pocketBtn.click();
await p.waitForTimeout(800);
const pocket = p.locator('.pocket');
ok((await pocket.count()) === 1 && /Taschenmodus/.test(await pocket.innerText()), 'pocket mode: the black screen');
ok(/Mikrofon hört mit/.test(await pocket.innerText()), `the microphone listens on: "${(await pocket.innerText()).replace(/\s+/g, ' ')}"`);
const pts = async () => Number(((await pocket.innerText()).match(/(\d+) Punkte/) ?? [])[1] ?? -1);
const before = await pts();
// walking in the pocket
for (let k = 1; k <= 6; k++) {
  await ctx.setGeolocation({ latitude: 48.781065 + k * 0.0002, longitude: 9.689329, accuracy: 5 });
  await p.waitForTimeout(1200);
}
const after = await pts();
ok(after > before, `the GPS track keeps growing in the pocket (${before} → ${after} points)`);
for (let k = 0; k < 60 && !/[1-9]\d* Knall/.test(await pocket.innerText()); k++) await p.waitForTimeout(250);
ok(/[1-9]\d* Knall/.test(await pocket.innerText()), `a strike heard in the pocket (${((await pocket.innerText()).match(/\d+ Knall\w*/) ?? [''])[0]})`);
// kept where the player is now – not where pocket mode began (the screen is not redrawn meanwhile)
const crack = await p.evaluate(() => (JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].soundShots ?? []).at(-1));
// (the walk goes on while it is heard: any of its places, not the start)
ok(crack && crack.pos[1] > 48.781065 + 0.0003, `the crack kept where the player walked to, not at the start (${crack ? crack.pos[1].toFixed(6) : '–'}; start 48.781065, walked to ${(48.781065 + 6 * 0.0002).toFixed(6)})`);
// a short tap does nothing (touches in the pocket)
const box = await pocket.boundingBox();
await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await p.waitForTimeout(400);
ok((await pocket.count()) === 1, 'a short touch does nothing');
// hold for 1 s: out of the pocket
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down();
await p.waitForTimeout(1300);
await p.mouse.up();
await p.waitForTimeout(500);
ok((await pocket.count()) === 0 && (await p.locator('.map-hole-no').count()) === 1, 'held for 1 s: the map again');
ok((await p.getByRole('button', { name: 'Mithören beenden' }).count()) === 1, 'the microphone still listening');
// the next fix: "phone out at the ball" in the track
await ctx.setGeolocation({ latitude: 48.7824, longitude: 9.689329, accuracy: 5 });
await p.waitForTimeout(2500);
const open = await p.evaluate(async () => {
  const T = await import('/src/lib/track.ts');
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const tr = T.loadTrack(r.id);
  return { opens: tr.filter((x) => x.open).length, last: tr.slice(-3).map((x) => !!x.open) };
});
ok(open.last.includes(true), `leaving the pocket marks the next fix as "phone out" (${JSON.stringify(open)})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
