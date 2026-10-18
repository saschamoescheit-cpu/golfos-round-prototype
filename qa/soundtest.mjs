// QA (Sascha 18.10.2026): shot by sound – a test. Edge plays a sound file as the microphone: two strikes (3 s, 8 s) and
// a voice in between; the app hears the two strikes, keeps them with time and place and shows them on the map.
// Usage: node qa/soundtest.mjs [url]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:5173/';
// the sound: 12 s at 48 kHz – quiet wind, a strike at 3 s and 8 s, someone talking at 5 s
const RATE = 48000;
const n = RATE * 12;
const pcm = new Int16Array(n);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let k = 0; k < n; k++) {
  const t = k / RATE;
  let v = rnd() * 0.01;
  for (const at of [3, 8]) if (t >= at && t < at + 0.05) v += ((k % 2 ? 1 : -1) * 0.8 * Math.exp(-(t - at) / 0.004));
  if (t >= 5 && t < 6) v += 0.35 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
  pcm[k] = Math.max(-1, Math.min(1, v)) * 32767;
}
const wav = Buffer.alloc(44 + n * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(wav, 44);
const file = fileURLToPath(new URL('./fixtures/cracks.wav', import.meta.url));
writeFileSync(file, wav);

const b = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation', 'microphone'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(800);
ok((await p.getByRole('button', { name: /Schläge per Ton erkennen/ }).count()) === 0, 'off by default – no microphone tool');
await p.evaluate(() => localStorage.setItem('golfos.soundtest.v1', '1'));
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
const mic = p.getByRole('button', { name: /Schläge per Ton erkennen/ });
ok((await mic.count()) === 1, 'switched on in the profile: the microphone tool on the map');
await mic.click();
// the file loops (12 s): within 14 s two or three strikes – never the voice
const count = () => p.evaluate(() => (JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].soundShots ?? []).length);
for (let k = 0; k < 64 && (await count()) === 0; k++) await p.waitForTimeout(250); // the file loops every 12 s
ok(/Knall gehört um/.test(await p.locator('body').innerText()), 'the note "Knall gehört um …"');
await p.waitForTimeout(500);
ok((await p.locator('.map-sound-shot').count()) >= 1, `shown on the map as a sound mark with the time (${await p.locator('.map-sound-shot').count()})`);
await p.waitForTimeout(13500);
const heard = await p.evaluate(() => (JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].soundShots ?? []));
ok(heard.length >= 1 && heard.length <= 3, `strikes heard (${heard.length}: ${heard.map((h) => h.level).join(', ')})`);
// every hit on a strike of the file (3 s and 8 s in a 12 s loop) – none on the voice at 5–6 s
const off = heard.map((h) => (((h.t - heard[0].t) / 1000) % 12 + 12) % 12);
ok(off.every((o) => [0, 5, 7, 12].some((x) => Math.abs(o - x) < 0.6)), `only the strikes, not the voice (${off.map((o) => o.toFixed(1)).join(', ')})`);
ok(heard.every((h) => h.hole === 0 && Math.abs(h.pos[1] - 48.781065) < 0.001), 'each kept with the hole and the GPS position');
await p.getByRole('button', { name: 'Mithören beenden' }).click();
ok((await p.getByRole('button', { name: /Schläge per Ton erkennen/ }).getAttribute('aria-pressed')) === 'false', 'a second tap stops listening');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
