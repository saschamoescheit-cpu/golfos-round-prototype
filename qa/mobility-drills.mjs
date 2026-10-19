// Every drill of the mobility pillar once through the guided session (a paused session with all drills is continued
// from the start tab): each one is shown, done by the synthetic player, counted or timed, and saved; the measured ones
// have a value. Slow (all 26 drills) – run it when the drill plans or the player change.
// Usage: node mobility-drills.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
// good: a supple player; stiff: one with the faults a coach corrects (hips along, heels up …) – the cues are checked
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
const IDS = ['mob-ankle-wall', 'mob-toe-touch', 'mob-thread-needle', 'mob-pelvic-turn', 'mob-cat-camel', 'mob-pelvic-tilt', 'mob-single-leg-reach', 'mob-single-leg-bridge', 'mob-clamshell', 'mob-lat-stretch', 'mob-wall-angels', 'mob-9090-stretch', 'mob-band-er', 'mob-hip-ir', 'mob-prone-y', 'mob-neck-turn', 'mob-forearm-turn', 'mob-wrist-hinge', 'mob-wrist-stretch', 'hip-9090', 'pallof-press', 'single-leg-balance', 'open-books', 'seated-rotation', 'deep-squat', 'glute-bridge'];
const MEASURED = ['mob-thread-needle', 'mob-prone-y', 'mob-ankle-wall', 'mob-toe-touch', 'mob-pelvic-turn', 'mob-single-leg-bridge', 'mob-clamshell', 'mob-lat-stretch', 'mob-wall-angels', 'mob-band-er', 'mob-neck-turn', 'seated-rotation', 'deep-squat', 'glute-bridge'];

await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(({ ids, lv }) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.mobility.fake', lv);
  localStorage.setItem('golfos.mobility.fakeSpeed', '8');
  const at = '2026-10-17T18:00:00Z';
  const m = (value) => ({ value, grade: 'limited', source: 'camera', at });
  const s = { id: 'q1', kind: 'quick', tests: ['seated-rotation'], createdAt: at, finishedAt: at, current: 0, hand: 'right', results: { 'seated-rotation': { left: m(30), right: m(33) } } };
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([s]));
  // a session with every drill, paused after a first one that was skipped
  const started = new Date(Date.now() - 60000).toISOString();
  localStorage.setItem('golfos.mobility.sessions.v1', JSON.stringify([{ id: 'all', startedAt: started, finishedAt: null, minutes: 60, drills: ['skip-me', ...ids], done: [{ drill: 'skip-me', sets: [], skipped: true, at: started }] }]));
}, { ids: IDS, lv: level });
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-today-start').click();
await p.locator('.mob-start-train').click();
const t0 = Date.now();
let last = '';
let lastChange = Date.now();
let stuck = '';
while (Date.now() - t0 < 900000) {
  if (await p.locator('.mob-train-summary').isVisible().catch(() => false)) break;
  const now = await p.evaluate(() => (document.querySelector('.mob-side-tag')?.textContent ?? '') + '|' + (document.querySelector('.mob-drill-live .mob-live-value')?.textContent ?? '') + '|' + (document.querySelector('.mob-status')?.textContent ?? '')).catch(() => '');
  if (now !== last) {
    last = now;
    lastChange = Date.now();
  }
  if (Date.now() - lastChange > 45000) {
    stuck = now;
    break;
  }
  await p.waitForTimeout(200);
}
ok(!stuck, `no drill got stuck${stuck ? ' (' + stuck + ')' : ''} – ${Math.round((Date.now() - t0) / 1000)} s`);
const sess = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.mobility.sessions.v1') ?? '[]').find((x) => x.id === 'all'));
for (const id of IDS) {
  const d = sess?.done.find((x) => x.drill === id);
  const sets = d?.sets ?? [];
  const okSets = sets.length >= 1 && sets.every((s) => (s.held != null ? s.held > 0 : s.reps === s.target));
  const measured = MEASURED.includes(id);
  const valued = !measured || sets.some((s) => s.best != null);
  const counted = !d?.signal || d.signal === 'oneLeg' || !!sets.find((s) => s.held == null) === false || sets.some((s) => s.seen);
  ok(!!d && !d.skipped && okSets && valued && counted, `${id}: ${sets.map((s) => (s.held != null ? `${s.held} s` : `${s.reps}/${s.target}${s.seen ? ' cam' : ''}`) + (s.best != null ? ` (${s.best})` : '')).join(', ') || 'not done'}`);
}
ok(!!sess?.finishedAt, 'the session is finished');
if (level === 'stiff') {
  // the faults of the stiff player: the coach said the cue and the set kept it
  const want = { 'seated-rotation': 'hipsStill', 'mob-pelvic-turn': 'chestStill', 'mob-neck-turn': 'shouldersStill', 'deep-squat': 'heelsDown', 'mob-toe-touch': 'kneesStraight', 'pallof-press': 'trunkStill', 'mob-single-leg-reach': 'footUp', 'open-books': 'kneesTogether', 'mob-thread-needle': 'hipsOverKnees' };
  for (const [id, cue] of Object.entries(want)) {
    const d = sess?.done.find((x) => x.drill === id);
    const n = (d?.sets ?? []).reduce((k, s) => k + (s.cues?.[cue] ?? 0), 0);
    ok(n >= 1, `${id}: the cue "${cue}" was given ${n} ×`);
  }
}
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
