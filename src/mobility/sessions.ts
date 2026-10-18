// The guided drill sessions of the mobility pillar on this device (synced like the screenings: src/lib/sync.ts). Each
// session keeps what the player did per drill and set – the reps, the holds and, where the camera measured, the best
// value – so the next session and the drill page can show the way there. Nothing is ever deleted by itself.
import { syncSoon } from '../lib/sync';
import type { SignalId } from './drillcoach';
import type { Side } from './types';

export interface DrillSet {
  side: Side | null;
  /** repetitions done (counted by the camera or by the app's count) and asked for */
  reps: number;
  target: number;
  /** seconds held (holds) */
  held?: number;
  /** the furthest the camera saw in this set (null: not measured) */
  best: number | null;
  /** the reps were counted by the camera (not the app's count) */
  seen?: boolean;
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
  /** the time a day the player chose (10, 15, 20 min) or the length of a single drill */
  minutes: number;
  drills: string[];
  done: DrillDone[];
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
export function newSession(drills: string[], minutes: number): TrainSession {
  return { id: newId(), startedAt: new Date().toISOString(), finishedAt: null, minutes, drills, done: [] };
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

/** days with a finished session in the 7 days up to now */
export function daysThisWeek(now = new Date()): number {
  const from = now.getTime() - 7 * 864e5;
  const days = new Set(loadSessions().filter((s) => s.finishedAt && new Date(s.startedAt).getTime() > from).map((s) => s.startedAt.slice(0, 10)));
  return days.size;
}

/** drills that hurt in the last 4 weeks – left out of the plan (pain is a stop sign, as in the screening) */
export function painDrills(now = new Date()): Set<string> {
  const from = now.getTime() - 28 * 864e5;
  return new Set(loadSessions().flatMap((s) => s.done.filter((d) => d.pain && new Date(d.at).getTime() > from).map((d) => d.drill)));
}

/** a session that was started and not finished (paused) */
export const openSession = (): TrainSession | undefined => loadSessions().find((s) => !s.finishedAt && s.done.length > 0);
export const sessionById = (id: string): TrainSession | undefined => loadSessions().find((s) => s.id === id);
