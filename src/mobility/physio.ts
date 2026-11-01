// The plan of the player's physio (Sascha 1.11.2026: "in the TPI app I see my results, the swing characteristics that
// follow from them and the exercises the physio put together for me – adapt Agility to it"). The player imports it
// once as a file (results, swing characteristics, the routine with its sets); it lives in the account like the
// screenings (src/lib/sync.ts) and never in the code. Its results become a screening, so the day plans follow them;
// the routine runs as a guided session with the clock (PhysioPlan.tsx).
import { syncSoon } from '../lib/sync';
import { isLeftHanded } from '../lib/profile';
import { TESTS } from './tests';
import type { Grade, Measurement, Screening, TestId, TestResult } from './types';

export type Light = 'red' | 'yellow' | 'green';

export interface PhysioTest {
  /** the name in the physio's screening ("Toe Touch") */
  name: string;
  /** our test, when there is one */
  test?: TestId;
  light: Light;
  /** sided tests: each side on its own (else the light is both sides) */
  left?: Light;
  right?: Light;
  /** what the physio's report says, short */
  note?: string;
}
export interface PhysioFault {
  name: string;
  /** how likely the physio's screening finds it, 0–100 */
  pct: number;
}
/** One set: reps × the time of one rep, then the rest. */
export interface PhysioSet {
  reps: number;
  repSec: number;
  restSec: number;
}
export interface PhysioExercise {
  id: string;
  name: string;
  /** the instruction, step by step (read aloud) */
  steps: string[];
  /** e.g. "Every rep: 5 s right, 5 s left, 5 s both" */
  note?: string;
  equipment?: string;
  sets: PhysioSet[];
  /** every set on one side, then all on the other */
  perSide: boolean;
  /** the tests it works on */
  targets?: TestId[];
}
export interface PhysioPlan {
  id: string;
  /** "TPI Level 1 Screen" */
  source: string;
  /** when the physio screened (ISO) */
  screenedAt: string;
  /** TPI's golf fitness handicap */
  gfh?: number;
  tests: PhysioTest[];
  faults: PhysioFault[];
  routine: { name: string; exercises: PhysioExercise[] };
  importedAt: string;
  /** how often a week the player wants to do it (Sascha 1.11.2026: "set it myself – a push reminds me") */
  schedule?: PhysioSchedule;
  /** the training diary: every session confirmed */
  log?: PhysioEntry[];
  /** the screening made from its results */
  screening?: string;
}
export interface PhysioSchedule {
  /** sessions a week, 1–7 */
  perWeek: number;
  /** the days (0 = Monday … 6 = Sunday) – none: any days, as many as perWeek */
  days?: number[];
  /** the reminder on a training day ("18:00"), none: no reminder */
  remind?: string | null;
}
/** One session in the diary (Sascha 1.11.2026: "confirm a session and see how often I trained"). */
export interface PhysioEntry {
  id: string;
  at: string;
  /** exercises done of all */
  done: number;
  of: number;
  /** minutes trained */
  min: number;
  /** guided by the app, or entered afterwards (done without the phone) */
  how: 'guided' | 'entered';
  /** how it felt, 1 (hard) … 5 (easy) */
  feel?: number;
  note?: string;
}

/** The TPI Level 1 tests by their name in the physio's report – the ones Agility has too. */
export const TPI_NAMES: Record<string, TestId> = {
  'toe touch': 'toe-touch',
  'single leg balance': 'single-leg',
  'lower quarter rotation': 'lower-quarter',
  'bridge with leg extension': 'bridge',
  'pelvic tilt': 'pelvic-tilt',
  'pelvic rotation': 'pelvic-rotation',
  'cervical rotation': 'neck',
  'overhead deep squat': 'deep-squat',
  '90/90': 'shoulder-9090',
  'lat test': 'lat',
  'seated trunk rotation': 'seated-rotation',
  'forearm rotation': 'forearm',
  'wrist hinge': 'wrist-hinge',
  'wrist flexion/extension': 'wrist-flex',
};
export const testOf = (t: PhysioTest): TestId | undefined => t.test ?? TPI_NAMES[t.name.trim().toLowerCase()];

export const GRADE_OF: Record<Light, Grade> = { red: 'fail', yellow: 'limited', green: 'pass' };

/** "High" from 66 %, "Moderate" from 33 %, else "Low" – as the TPI app labels them */
export const faultLevel = (pct: number): 'high' | 'moderate' | 'low' => (pct >= 66 ? 'high' : pct >= 33 ? 'moderate' : 'low');

/** Seconds of one exercise: every set reps × rep time + rest, twice when per side. */
export const exerciseSec = (e: PhysioExercise): number => e.sets.reduce((n, s) => n + s.reps * s.repSec + s.restSec, 0) * (e.perSide ? 2 : 1);
export const routineSec = (p: PhysioPlan): number => p.routine.exercises.reduce((n, e) => n + exerciseSec(e), 0);
export const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// ---------- the file ----------

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isLight = (x: unknown): x is Light => x === 'red' || x === 'yellow' || x === 'green';
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** The plan from the imported file – or what is wrong with it. */
export function parsePlan(text: string, now = new Date()): PhysioPlan | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'no JSON' };
  }
  if (!isObj(raw)) return { error: 'no plan' };
  const routine = raw.routine;
  if (!isObj(routine) || !Array.isArray(routine.exercises) || !routine.exercises.length) return { error: 'no routine' };
  const exercises: PhysioExercise[] = [];
  for (const [i, e] of (routine.exercises as unknown[]).entries()) {
    if (!isObj(e) || typeof e.name !== 'string' || !Array.isArray(e.sets) || !e.sets.length) return { error: `exercise ${i + 1}` };
    const sets: PhysioSet[] = [];
    for (const s of e.sets as unknown[]) {
      if (!isObj(s) || !num(s.reps) || !num(s.repSec) || !num(s.restSec) || s.reps < 1 || s.repSec <= 0) return { error: `exercise ${i + 1}: set` };
      sets.push({ reps: Math.round(s.reps), repSec: s.repSec, restSec: s.restSec });
    }
    exercises.push({
      id: typeof e.id === 'string' && e.id ? e.id : `x${i + 1}`,
      name: e.name,
      steps: Array.isArray(e.steps) ? (e.steps as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      ...(typeof e.note === 'string' ? { note: e.note } : {}),
      ...(typeof e.equipment === 'string' ? { equipment: e.equipment } : {}),
      sets,
      perSide: e.perSide === true,
      ...(Array.isArray(e.targets) ? { targets: (e.targets as unknown[]).filter((x): x is TestId => TESTS.some((t) => t.id === x)) } : {}),
    });
  }
  const tests: PhysioTest[] = Array.isArray(raw.tests)
    ? (raw.tests as unknown[]).filter((x): x is Record<string, unknown> => isObj(x) && typeof x.name === 'string' && isLight(x.light)).map((x) => ({
        name: x.name as string,
        light: x.light as Light,
        ...(typeof x.test === 'string' && TESTS.some((t) => t.id === x.test) ? { test: x.test as TestId } : {}),
        ...(isLight(x.left) ? { left: x.left } : {}),
        ...(isLight(x.right) ? { right: x.right } : {}),
        ...(typeof x.note === 'string' ? { note: x.note } : {}),
      }))
    : [];
  const faults: PhysioFault[] = Array.isArray(raw.faults)
    ? (raw.faults as unknown[]).filter((x): x is { name: string; pct: number } => isObj(x) && typeof x.name === 'string' && num(x.pct)).map((x) => ({ name: x.name, pct: Math.min(100, x.pct) })).sort((a, b) => b.pct - a.pct)
    : [];
  const screenedAt = typeof raw.screenedAt === 'string' && !Number.isNaN(Date.parse(raw.screenedAt)) ? new Date(raw.screenedAt).toISOString() : now.toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    source: typeof raw.source === 'string' ? raw.source : 'Physio',
    screenedAt,
    ...(num(raw.gfh) ? { gfh: raw.gfh } : {}),
    tests,
    faults,
    routine: { name: typeof routine.name === 'string' ? routine.name : 'Routine', exercises },
    importedAt: now.toISOString(),
  };
}

/** The physio's results as a screening of Agility (finished on the day of the physio's screen): the day plans, the
 *  body result and the history use them like a screening of the app. */
export function toScreening(p: PhysioPlan, id = newId()): Screening | null {
  const results: Partial<Record<TestId, TestResult>> = {};
  for (const t of p.tests) {
    const test = testOf(t);
    const def = test && TESTS.find((x) => x.id === test);
    if (!test || !def) continue;
    const m = (l: Light): Measurement => ({ value: null, grade: GRADE_OF[l], source: 'physio', at: p.screenedAt });
    results[test] = def.sides ? { left: m(t.left ?? t.light), right: m(t.right ?? t.light) } : { both: m(t.light) };
  }
  const tests = TESTS.map((x) => x.id).filter((x) => results[x]);
  if (!tests.length) return null;
  return { id, kind: 'full', tests, createdAt: p.screenedAt, finishedAt: p.screenedAt, current: tests.length, hand: isLeftHanded() ? 'left' : 'right', results, from: p.source };
}

// ---------- the guided run: the routine as a line of steps ----------

export type RunStep =
  | { kind: 'intro'; ex: number }
  | { kind: 'rep'; ex: number; side: 0 | 1 | 2; set: number; sets: number; rep: number; reps: number; sec: number }
  | { kind: 'rest'; ex: number; side: 0 | 1 | 2; set: number; sec: number }
  | { kind: 'switch'; ex: number; sec: number };

/** Every exercise: its intro, then side by side every set rep by rep, the rest after each set (none after the very
 *  last set of an exercise – the next intro is its rest); 5 s to change sides. side 0 = no sides, 1 = first, 2 = second. */
export function runSteps(p: PhysioPlan): RunStep[] {
  const out: RunStep[] = [];
  p.routine.exercises.forEach((e, ex) => {
    out.push({ kind: 'intro', ex });
    const sides: (0 | 1 | 2)[] = e.perSide ? [1, 2] : [0];
    for (const side of sides) {
      if (side === 2) out.push({ kind: 'switch', ex, sec: 5 });
      e.sets.forEach((s, set) => {
        for (let rep = 0; rep < s.reps; rep++) out.push({ kind: 'rep', ex, side, set, sets: e.sets.length, rep, reps: s.reps, sec: s.repSec });
        const last = set === e.sets.length - 1 && side === sides[sides.length - 1];
        if (s.restSec > 0 && !last) out.push({ kind: 'rest', ex, side, set, sec: s.restSec });
      });
    }
  });
  return out;
}

// ---------- the store ----------

const KEY = 'golfos.mobility.physio.v1';
function read(): PhysioPlan[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(list: PhysioPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:mobility-changed'));
  syncSoon();
}
/** the newest plan (by the day of the physio's screen) */
export const loadPhysio = (): PhysioPlan | undefined => read().sort((a, b) => b.screenedAt.localeCompare(a.screenedAt))[0];
export function savePhysio(p: PhysioPlan): void {
  write([p, ...read().filter((x) => x.id !== p.id)]);
}
export function removePhysio(id: string): void {
  write(read().filter((x) => x.id !== id));
}
/** A session into the diary (newest first, at most 500). */
export function logSession(p: PhysioPlan, e: Omit<PhysioEntry, 'id'>): PhysioPlan {
  const next = { ...p, log: [{ ...e, id: newId() }, ...(p.log ?? [])].slice(0, 500) };
  savePhysio(next);
  return next;
}
export function unlogSession(p: PhysioPlan, id: string): PhysioPlan {
  const next = { ...p, log: (p.log ?? []).filter((x) => x.id !== id) };
  savePhysio(next);
  return next;
}
export function setSchedule(p: PhysioPlan, schedule: PhysioSchedule): PhysioPlan {
  const next = { ...p, schedule };
  savePhysio(next);
  return next;
}

// ---------- the week, the reminder, the retest ----------

/** Monday 0:00 of the week of this day (local time) */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
/** 0 = Monday … 6 = Sunday */
export const weekday = (d: Date): number => (d.getDay() + 6) % 7;

/** Sessions this week (days with a session – two on one day count once). */
export function weekCount(log: PhysioEntry[] | undefined, now = new Date()): number {
  const from = weekStart(now).getTime();
  return new Set((log ?? []).filter((e) => Date.parse(e.at) >= from && Date.parse(e.at) <= now.getTime()).map((e) => dayKey(new Date(e.at)))).size;
}
export const trainedOn = (log: PhysioEntry[] | undefined, d: Date): boolean => (log ?? []).some((e) => dayKey(new Date(e.at)) === dayKey(d));

/** Today is a training day: one of the chosen days – or, without days, the week's count is not reached yet. */
export function dueToday(p: PhysioPlan, now = new Date()): boolean {
  const s = p.schedule;
  if (!s || trainedOn(p.log, now)) return false;
  if (s.days?.length) return s.days.includes(weekday(now));
  return weekCount(p.log, now) < s.perWeek;
}

/** The weeks since the first session: sessions per week, newest first (for the diary's bars). */
export function weeksOf(log: PhysioEntry[] | undefined, now = new Date(), weeks = 8): { from: Date; n: number }[] {
  const out: { from: Date; n: number }[] = [];
  let w = weekStart(now);
  for (let i = 0; i < weeks; i++) {
    const end = new Date(w);
    end.setDate(end.getDate() + 7);
    const n = new Set((log ?? []).filter((e) => Date.parse(e.at) >= w.getTime() && Date.parse(e.at) < end.getTime()).map((e) => dayKey(new Date(e.at)))).size;
    out.push({ from: new Date(w), n });
    w = new Date(w);
    w.setDate(w.getDate() - 7);
  }
  return out;
}

/** Time to test again (Sascha 1.11.2026: "repeat the tests after a month to see how far the results improved"): 4
 *  weeks after the physio's screen – or after the last screening since – and at least 8 sessions trained since. */
export function retestDue(p: PhysioPlan, lastScreenAt: string | null, now = new Date()): { due: boolean; days: number; sessions: number } {
  const since = [p.screenedAt, lastScreenAt].filter((x): x is string => !!x).sort().at(-1)!;
  const days = Math.floor((now.getTime() - Date.parse(since)) / 864e5);
  const sessions = (p.log ?? []).filter((e) => e.at >= since).length;
  return { due: days >= 28 && sessions >= 8, days, sessions };
}
