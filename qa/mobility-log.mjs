// The motion log of the guided training (Sascha 19.10.2026 – the measuring checked on a real body): switched on in the
// setup, a session writes down the body points with what the app counted; the summary offers it to share (here: the
// download), and qa/replay.ts counts the same reps from the file as the app did on the phone.
// Usage: node mobility-log.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const shot = async (name) => shots && p.screenshot({ path: `${shots}/log-${name}.png`, fullPage: true });
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', acceptDownloads: true });
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
await p.waitForTimeout(800);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', 'good');
  // (slower than the other checks: enough pictures per rep even when the machine is busy – the replay compares them)
  localStorage.setItem('golfos.mobility.fakeSpeed', '3');
  const at = '2026-10-17T18:00:00Z';
  const m = (value) => ({ value, grade: 'limited', source: 'camera', at });
  const results = { 'pelvic-rotation': { both: m(16) }, 'seated-rotation': { left: m(30), right: m(33) }, 'deep-squat': { both: m(-18) } };
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([{ id: 'q1', kind: 'quick', tests: Object.keys(results), createdAt: at, finishedAt: at, current: 2, hand: 'right', results }]));
  // one measured drill is enough: hip turns in golf posture, the camera counts them
  localStorage.setItem('golfos.mobility.sessions.v1', JSON.stringify([{ id: 'log', startedAt: new Date().toISOString(), finishedAt: null, minutes: 10, drills: ['skip-me', 'mob-pelvic-turn', 'deep-squat'], done: [{ drill: 'skip-me', sets: [], skipped: true, at: new Date().toISOString() }] }]));
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-today-start').click();

// the setup: the switch, off at first; on, the privacy line says what is written down
const sw = p.locator('.mob-log-switch .drawer-row');
ok((await sw.getAttribute('aria-checked')) === 'false', 'the setup has the switch "Bewegungsprotokoll mitschreiben", off');
await sw.click();
const priv = await p.locator('.mob-private').innerText();
ok((await sw.getAttribute('aria-checked')) === 'true' && /Nur die Körperpunkte/.test(priv), `switched on, the setup says only the body points are written down (${priv})`);
await shot('setup');
await p.locator('.mob-start-train').click();
await p.locator('.mob-train-summary').waitFor({ timeout: 240000 }).catch(() => {});
ok(await p.locator('.mob-train-summary').isVisible(), 'the session ends in its summary');

// the summary offers the log
const card = await p.locator('.mob-log-share').innerText().catch(() => '');
ok(/Bewegungsprotokoll/.test(card) && /2 Übungen/.test(card) && /kein Foto, kein Video/.test(card), `the summary offers the motion log (${card.split('\n').slice(1, 2).join('')})`);
await shot('summary');
const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
await p.locator('.mob-log-share-btn').click();
const d = await dl;
const dir = mkdtempSync(join(tmpdir(), 'mob-log-'));
const path = d ? join(dir, d.suggestedFilename()) : '';
if (d) await d.saveAs(path);
ok(!!d && /^agility-protokoll-.*\.json(\.gz)?$/.test(d.suggestedFilename()), `the log is a file to share or save (${d?.suggestedFilename()})`);

// the replay of the file counts the same reps as the app did
if (d) {
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite-node', 'qa/replay.ts', path, '--json'], { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32' });
  const rep = JSON.parse(out.slice(out.indexOf('\n[') + 1));
  const turn = rep.find((x) => x.drill === 'mob-pelvic-turn');
  // the sets the camera counted (a set the app counted along in the tempo has no reps in the points)
  const sets = (turn?.sets ?? []).filter((s) => s.appSeen);
  ok(sets.length >= 1 && sets.every((s) => s.appSeen && Math.abs(s.replayReps - s.appReps) <= 1), `the replay counts the hip turns as the app did (${sets.map((s) => `${s.appReps} app / ${s.replayReps} replay`).join(', ')})`);
  ok(sets.every((s) => s.replayBest != null && Math.abs(s.replayBest - s.appBest) <= 3), `… and measures the same (${sets.map((s) => `${s.appBest}° / ${s.replayBest}°`).join(', ')})`);
  ok(turn?.seen > 0.9, `the body was seen in the log (${Math.round((turn?.seen ?? 0) * 100)} %)`);
}
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
