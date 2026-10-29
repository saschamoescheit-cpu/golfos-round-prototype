// QA (Sascha 18.10.2026): shot by sound – a test. Edge plays a sound file as the microphone: two strikes (3 s, 8 s) and
// a voice in between; the app hears the two strikes, keeps them with time and place and shows them on the map.
// Usage: node qa/soundtest.mjs [url]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockNet } from './netmock.mjs';

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
const errs = [];
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
// a fresh phone with a round started on Hetzenhof A – the switch in the profile on or off
async function roundOn(soundTest) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation', 'microphone'] });
  await mockNet(ctx);
  // the microphone's streams: how many were opened, how many are live (no button any more, 29.10.2026)
  await ctx.addInitScript(() => {
    const w = window;
    w.__streams = [];
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); w.__streams.push(s); return s; };
    w.__micLive = () => w.__streams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length;
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.evaluate((on) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    if (on) localStorage.setItem('golfos.soundtest.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  }, soundTest);
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
  await p.locator('.map-hole-no').waitFor({ timeout: 20000 });
  await p.waitForTimeout(2000);
  return { ctx, p };
}
const micOf = (p) => p.evaluate(() => ({ opened: window.__streams.length, live: window.__micLive() }));
// off by default: on the map nothing listens
const quiet = await roundOn(false);
ok((await micOf(quiet.p)).opened === 0, `off by default – the microphone stays closed (${JSON.stringify(await micOf(quiet.p))})`);
await quiet.ctx.close();
// switched on in the profile: the map listens by itself – no microphone button (Sascha 29.10.2026)
const { p } = await roundOn(true);
const mic = () => micOf(p);
ok((await p.locator('.map-tool[aria-label*="per Ton"], button[aria-label*="Mithören"]').count()) === 0, 'no microphone button on the map');
ok((await mic()).live === 1, `listening by itself (${JSON.stringify(await mic())})`);
// the file loops (12 s): within 14 s two or three strikes – never the voice
const count = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).flatMap((r) => r.soundShots ?? []).length);
for (let k = 0; k < 64 && (await count()) === 0; k++) await p.waitForTimeout(250); // the file loops every 12 s
const note = ((await p.locator('body').innerText()).match(/Schlag \d+ an [^\n]*/) ?? [''])[0];
ok(/^Schlag 1 an \S+ per Ton – Knall gehört um [\d:]+ \(Lautstärke/.test(note), `the note as for a shot by hand: "${note}"`);
await p.waitForTimeout(500);
const mark = p.locator('.map-sound-shot').first();
const markBox = await mark.boundingBox();
ok((await mark.locator('b').innerText()) === '1' && /^\d\d:\d\d$/.test(await mark.locator('.sound-time').innerText()) && markBox && markBox.width >= 30,
  `shown on the map as big as a shot by hand, numbered, with the time (${await mark.locator('b').innerText().catch(() => '–')} · ${await mark.locator('.sound-time').innerText().catch(() => '–')} · ${markBox && Math.round(markBox.width)} px)`);
await p.waitForTimeout(13500);
const heard = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).flatMap((r) => r.soundShots ?? []));
// both strikes of the loop (19.10.2026: the background falls back fast after the voice – before only one was heard)
ok(heard.length >= 2 && heard.length <= 4, `strikes heard (${heard.length}: ${heard.map((h) => h.level).join(', ')})`);
// every hit on a strike of the file (3 s and 8 s in a 12 s loop) – none on the voice at 5–6 s
const off = heard.map((h) => (((h.t - heard[0].t) / 1000) % 12 + 12) % 12);
ok(off.every((o) => [0, 5, 7, 12].some((x) => Math.abs(o - x) < 0.6)), `only the strikes, not the voice (${off.map((o) => o.toFixed(1)).join(', ')})`);
ok(heard.every((h) => h.hole === 0 && Math.abs(h.pos[1] - 48.781065) < 0.001), 'each kept with the hole and the GPS position');
// iOS ends the microphone in the background: back in the foreground it listens again
await p.evaluate(() => window.__streams.forEach((s) => s.getTracks().forEach((t) => t.stop())));
ok((await mic()).live === 0, 'the microphone ended (as iOS in the background)');
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(1000);
const back = await mic();
ok(back.live === 1 && back.opened === 2, `back in the foreground: listening again (${JSON.stringify(back)})`);
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(600);
ok((await mic()).opened === 2, 'still listening: not opened once more');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
