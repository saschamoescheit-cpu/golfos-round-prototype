// Replays a motion log (Agility → the setup of a training or a screening → "Keep a motion log" → shared at the end)
// through the app's own counting, measuring and cues – to check and tune them on a real body. Per drill and set: what
// the app counted on the phone against the replay, the best value, the cues, and a line of the signal over the set
// (▁▂▃▄▅▆▇█) to see the reps the camera saw or missed. Per test of a screening: the value the phone measured against
// the replay, and the line of the live value.
// Usage: npx vite-node qa/replay.ts <agility-protokoll-….json(.gz)> [--json]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { FormCheck, RepCounter, SIGNALS, Signal, setsOf } from '../src/mobility/drillcoach';
import { makeAnalyzer, type Frame, type Lm } from '../src/mobility/measure';
import type { LogFrame, LogItem, MotionLog } from '../src/mobility/motionlog';

const file = process.argv[2];
if (!file) {
  console.log('usage: npx vite-node qa/replay.ts <log.json(.gz)> [--json]');
  process.exit(1);
}
const raw = readFileSync(file);
const log = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')) as MotionLog & { drills?: LogItem[] };
// (the first logs of 19.10. had the drills only)
const items = log.items ?? log.drills ?? [];

const points = (flat: number[]): Lm[] => {
  const out: Lm[] = [];
  for (let i = 0; i < flat.length; i += 3) out.push({ x: flat[i] / 1000, y: flat[i + 1] / 1000, v: flat[i + 2] / 100 });
  return out;
};
const bars = '▁▂▃▄▅▆▇█';
const spark = (xs: (number | null)[], n = 60) => {
  const vals = xs.filter((x): x is number => x != null);
  if (!vals.length) return '(nothing seen)';
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const step = Math.max(1, Math.ceil(xs.length / n));
  let s = '';
  for (let i = 0; i < xs.length; i += step) {
    const part = xs.slice(i, i + step).filter((x): x is number => x != null);
    s += part.length ? bars[Math.round(((part.reduce((a, b) => a + b, 0) / part.length - lo) / (hi - lo || 1)) * 7)] : ' ';
  }
  return `${s}  (${lo.toFixed(1)} … ${hi.toFixed(1)})`;
};

const report: unknown[] = [];
console.log(`motion log ${log.startedAt} · ${items.length} parts · ${log.device}`);
for (const d of items) {
  const frame = (x: LogFrame): Frame | null => (x.lm ? { lm: points(x.lm), w: d.w, h: d.h, t: x.t } : null);
  if (d.test) {
    // a test of the screening: its measuring gets the pictures of the run, as on the phone
    const a = makeAnalyzer(d.test.kind, d.test.side ?? 'left', { noArms: d.test.variant === 'handsBehind' });
    const run = d.frames.filter((x) => x.p === 'r');
    for (const x of run) {
      const f = frame(x);
      if (f) a.push(f);
    }
    const out = a.finish();
    const app = d.result as { value?: number } | null | undefined;
    const seen = run.filter((x) => x.lm).length / Math.max(1, run.length);
    const r1 = (v: number | null | undefined) => (v == null ? 'not recognised' : String(Math.round(v * 10) / 10));
    console.log(`\n${d.test.id}${d.test.side ? ` (${d.test.side})` : ''} · ${d.test.kind} · ${d.w}×${d.h} · ${d.frames.length} pictures · body seen in ${Math.round(seen * 100)} % of the run`);
    console.log(`  value app ${r1(app?.value)} · replay ${r1(out?.value)} · ${Math.round(((run.at(-1)?.t ?? 0) - (run[0]?.t ?? 0)) / 100) / 10} s`);
    console.log(`    ${spark(run.map((x) => x.v ?? null))}`);
    report.push({ test: d.test, seen, app: app?.value ?? null, replay: out?.value ?? null });
    continue;
  }
  const plan = d.plan!;
  const id = plan.signal ?? plan.watch;
  const sig = plan.signal ? new Signal(plan.signal) : null;
  const sets = setsOf(plan);
  const app = (d.result as { sets?: { reps: number; best: number | null; seen?: boolean; cues?: Record<string, number> }[] } | undefined)?.sets ?? [];
  const seen = d.frames.filter((x) => x.p === 'r' && x.lm).length / Math.max(1, d.frames.filter((x) => x.p === 'r').length);
  console.log(`\n${d.drill}${id ? ` · ${id}` : ''} · ${d.w}×${d.h} · ${d.frames.length} pictures · body seen in ${Math.round(seen * 100)} % of the run`);
  const out: Record<string, unknown>[] = [];
  for (let k = 0; k < sets.length; k++) {
    const count = d.frames.filter((x) => x.s === k && x.p === 'c');
    const run = d.frames.filter((x) => x.s === k && x.p === 'r');
    if (!run.length) continue;
    const form = id ? new FormCheck(id) : null;
    for (const x of count) {
      const f = frame(x);
      if (f) {
        sig?.calibrate(f);
        form?.calibrate(f);
      }
    }
    const counter = sig ? new RepCounter(SIGNALS[sig.id]) : null;
    // the same with half the smallest movement that counts: how many reps a lower threshold would see (for tuning)
    const loose = sig ? new RepCounter({ ...SIGNALS[sig.id], minAmp: SIGNALS[sig.id].minAmp / 2 }) : null;
    const values: (number | null)[] = [];
    const cues: Record<string, number> = {};
    for (const x of run) {
      const f = frame(x);
      if (f && sig && !sig.calibrated) sig.calibrate(f);
      const v = f && sig ? sig.value(f) : null;
      values.push(v);
      counter?.push(v);
      loose?.push(v);
      if (f && form) {
        if (!form.calibrated) form.calibrate(f);
        const c = form.push(f, v);
        if (c) cues[c] = (cues[c] ?? 0) + 1;
      }
    }
    const a = app[k];
    const appCues = run.filter((x) => x.cue).map((x) => x.cue);
    const row = {
      set: k + 1,
      side: sets[k],
      appReps: a?.reps ?? run.at(-1)?.reps,
      appSeen: a?.seen ?? false,
      appPaced: run.some((x) => x.paced),
      replayReps: counter?.reps ?? null,
      halfThreshold: loose?.reps ?? null,
      appBest: a?.best ?? null,
      replayBest: counter?.best != null ? Math.round(counter.best * 10) / 10 : null,
      appCues: appCues.join(', ') || '–',
      replayCues: Object.entries(cues).map(([c, n]) => `${n}× ${c}`).join(', ') || '–',
      seconds: Math.round(((run.at(-1)?.t ?? 0) - (run[0]?.t ?? 0)) / 100) / 10,
    };
    out.push(row);
    console.log(`  set ${row.set}${row.side ? ` (${row.side})` : ''} · ${row.seconds} s · reps app ${row.appReps}${row.appSeen ? ' (camera)' : row.appPaced ? ' (counted along)' : ''} · replay ${row.replayReps ?? '–'}${row.halfThreshold != null && row.halfThreshold !== row.replayReps ? ` (half the threshold: ${row.halfThreshold})` : ''} · best app ${row.appBest ?? '–'} · replay ${row.replayBest ?? '–'}`);
    console.log(`    cues app ${row.appCues} · replay ${row.replayCues}`);
    if (sig) console.log(`    ${spark(values)}`);
  }
  report.push({ drill: d.drill, signal: plan.signal, watch: plan.watch, seen, sets: out });
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 1));
