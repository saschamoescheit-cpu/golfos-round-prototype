// The guided drill sessions of the mobility pillar on this device (synced like the screenings: src/lib/sync.ts). Each
// session keeps what the player did per drill and set – the reps, the holds and, where the camera measured, the best
// value – so the next session and the drill page can show the way there. Nothing is ever deleted by itself.
import { syncSoon } from '../lib/sync';
import { SAME_AS_TEST, SIGNALS, coachOf, type FormCue, type SignalId } from './drillcoach';
import type { Side, TestId } from './types';

export interface DrillSet {
  side: Side | null;
  /** repetitions done (counted by the camera or by the app's count) and asked for */
  reps: number;
  target: number;
  /** seconds held (holds) */
  held?: number;
  /** the seconds asked for (holds) */
  goal?: number;
  /** the furthest the camera saw in this set (null: not measured) */
  best: number | null;
  /** the reps were counted by the camera (not the app's count) */
  seen?: boolean;
  /** the form cues the app gave in this set, how often */
  cues?: Partial<Record<FormCue, number>>;
}

export interface DrillDone {
  drill: string;
  signal?: SignalId;
  sets: DrillSet[];
  skipped?: boolean;
  /** it hurt – stop sign, the drill is left out until a physio looked at it */
  pain?: boolean;
  at: string;
}

export interface TrainSession {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** the time a day the player chose (15, 30, 45, 60 min – before 31.10.2026 10, 15, 20) or the length of a single drill */
  minutes: number;
  drills: string[];
  done: DrillDone[];
  /** sets on top of a drill's plan (focus drills on a long day, dayplan.ts) */
  extraSets?: Record<string, number>;
  /** the moving-through drills at the start of a long day */
  warm?: string[];
}

const KEY = 'golfos.mobility.sessions.v1';

function read(): TrainSession[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(list: TrainSession[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked – keeps working for this visit */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:mobility-changed'));
  syncSoon();
}

const newId = (): string => 't' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/** newest first */
export const loadSessions = (): TrainSession[] => read().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export function saveSession(s: TrainSession): void {
  write([s, ...read().filter((x) => x.id !== s.id)]);
}
export function newSession(drills: string[], minutes: number, plan: { extraSets?: Record<string, number>; warm?: string[] } = {}): TrainSession {
  const extra = plan.extraSets && Object.keys(plan.extraSets).length ? { extraSets: plan.extraSets } : {};
  const warm = plan.warm?.length ? { warm: plan.warm } : {};
  return { id: newId(), startedAt: new Date().toISOString(), finishedAt: null, minutes, drills, done: [], ...extra, ...warm };
}

/** the best value of a drill in a session (both sides: the weaker counts, as in the screening) */
export function bestOf(d: DrillDone, better: 'up' | 'down' = 'up'): number | null {
  const vals = d.sets.map((s) => s.best).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const bySide = (side: Side | null) => {
    const v = d.sets.filter((s) => s.side === side && s.best != null).map((s) => s.best as number);
    return v.length ? (better === 'up' ? Math.max(...v) : Math.min(...v)) : null;
  };
  const sides = (['left', 'right'] as Side[]).map(bySide).filter((v): v is number => v != null);
  if (sides.length === 2) return better === 'up' ? Math.min(...sides) : Math.max(...sides);
  return better === 'up' ? Math.max(...vals) : Math.min(...vals);
}

/** every measured time of one drill, oldest first (for the drill page) */
/** The measured drills of a session that went further than the last time (the clear ones: 3° or 1 cm/s at least),
 * the biggest first – what the coach says at the end. `previous`: the best value of the last time per drill. */
export function gains(s: TrainSession, previous: Record<string, number | null>): { drill: string; signal: SignalId; by: number }[] {
  const out: { drill: string; signal: SignalId; by: number }[] = [];
  for (const d of s.done) {
    const sig = d.signal ?? coachOf(d.drill).signal;
    if (!sig || d.skipped || d.pain || sig === 'oneLeg' || SIGNALS[sig].countOnly) continue;
    const best = bestOf(d, SIGNALS[sig].better);
    const prev = previous[d.drill];
    if (best == null || prev == null) continue;
    const by = SIGNALS[sig].better === 'up' ? best - prev : prev - best;
    if (by >= (SIGNALS[sig].unit === '°' ? 3 : 1)) out.push({ drill: d.drill, signal: sig, by });
  }
  return out.sort((a, b) => b.by / (SIGNALS[b.signal].unit === '°' ? 3 : 1) - a.by / (SIGNALS[a.signal].unit === '°' ? 3 : 1));
}

export function drillHistory(drill: string, better: 'up' | 'down' = 'up'): { at: string; value: number }[] {
  const out: { at: string; value: number }[] = [];
  for (const s of loadSessions())
    for (const d of s.done)
      if (d.drill === drill && !d.skipped) {
        const v = bestOf(d, better);
        if (v != null) out.push({ at: d.at, value: v });
      }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** what the training measured for a test (drills that measure the same), newest first */
export function trainingValues(test: TestId): { at: string; value: number; drill: string }[] {
  const out: { at: string; value: number; drill: string }[] = [];
  for (const [drill, t] of Object.entries(SAME_AS_TEST)) {
    if (t !== test) continue;
    const sig = coachOf(drill).signal;
    for (const x of drillHistory(drill, sig ? SIGNALS[sig].better : 'up')) out.push({ ...x, drill });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** a drill done cleanly: every set complete (all reps, the whole hold), no cue, no pain */
export function isClean(d: DrillDone): boolean {
  return !d.skipped && !d.pain && d.sets.length > 0 && d.sets.every((s) => (s.held != null ? s.held >= (s.goal ?? 0) - 0.5 : s.reps >= s.target) && !Object.values(s.cues ?? {}).some((n) => (n ?? 0) > 0));
}

/** how many of the last times (newest first) the drill was done cleanly in a row */
export function cleanStreak(drill: string): number {
  let n = 0;
  for (const s of loadSessions())
    for (const d of s.done) {
      if (d.drill !== drill || d.skipped) continue;
      if (!isClean(d)) return n;
      n++;
    }
  return n;
}

/** the day of a moment on the player's clock (YYYY-MM-DD) – a training at 00:30 belongs to the new day, not to UTC's */
export function localDay(at: string | number | Date = new Date()): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** days with a finished session in the 7 days up to now */
export function daysThisWeek(now = new Date()): number {
  const from = now.getTime() - 7 * 864e5;
  const days = new Set(loadSessions().filter((s) => s.finishedAt && new Date(s.startedAt).getTime() > from).map((s) => localDay(s.startedAt)));
  return days.size;
}

/** drills that hurt in the last 4 weeks – left out of the plan (pain is a stop sign, as in the screening) */
export function painDrills(now = new Date()): Set<string> {
  const from = now.getTime() - 28 * 864e5;
  return new Set(loadSessions().flatMap((s) => s.done.filter((d) => d.pain && new Date(d.at).getTime() > from).map((d) => d.drill)));
}

/** a session that was started and not finished (paused) */
export const openSession = (): TrainSession | undefined => loadSessions().find((s) => !s.finishedAt && s.done.length > 0);
/** a session paused today – the training of the day goes on with it; one paused on an earlier day does not hold up
 * today's plan (it stays in the drills tab and the history to continue, nothing is dropped) */
export const openToday = (): TrainSession | undefined => loadSessions().find((s) => !s.finishedAt && s.done.length > 0 && localDay(s.startedAt) === localDay());
export const sessionById = (id: string): TrainSession | undefined => loadSessions().find((s) => s.id === id);
