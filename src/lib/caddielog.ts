import type { LngLat } from '../types';
import { distanceM } from './geo';

// What the caddie advised during the round (Sascha, 13.10.2026): shown again in the round check, where the player
// sets his own view next to it – "fits" or "I'd have played it differently: …". That is the material to make the
// caddie better (and it travels in the backup file, like everything under "golfos.").

export interface CaddieLogEntry {
  t: number; // ms
  pos: LngLat; // where the player stood
  toPin: number; // m
  club: string; // e.g. "Dr", "SW ¾"
  playsLike: number; // m
  aim: string | null; // the instruction ("Aim at target 1 (right side of the fairway – …)")
  plan: string | null; // the hole plan sentence
  warning: string | null;
  verdict?: 'ok' | 'other'; // the player's view after the round
  note?: string; // what he would have done
}

export type CaddieLog = Record<number, CaddieLogEntry[]>; // per hole index

const KEY = 'golfos.caddielog.v1.';
const SAME_SPOT_M = 20;
const MAX_PER_HOLE = 10;

export function loadCaddieLog(roundId: string): CaddieLog {
  try {
    return JSON.parse(localStorage.getItem(KEY + roundId) ?? '{}');
  } catch {
    return {};
  }
}

function save(roundId: string, log: CaddieLog): void {
  try {
    localStorage.setItem(KEY + roundId, JSON.stringify(log));
  } catch {
    // storage full – the log is a bonus
  }
}

/** Keeps the advice: one entry per spot – standing at the same spot (20 m) the newest advice replaces the older one. */
export function recordCaddie(roundId: string, hole: number, e: CaddieLogEntry): void {
  const log = loadCaddieLog(roundId);
  const list = log[hole] ?? [];
  const last = list[list.length - 1];
  // the same spot again: the newer advice replaces the older – a putt read never replaces a shot's advice (or back)
  if (last && distanceM(last.pos, e.pos) < SAME_SPOT_M && (last.club === 'Putt') === (e.club === 'Putt')) list[list.length - 1] = { ...e, verdict: last.verdict, note: last.note };
  else list.push(e);
  log[hole] = list.slice(-MAX_PER_HOLE);
  save(roundId, log);
}

/** The player's view on one piece of advice. */
export function rateCaddie(roundId: string, hole: number, index: number, verdict: 'ok' | 'other' | undefined, note?: string): CaddieLog {
  const log = loadCaddieLog(roundId);
  const list = log[hole];
  if (!list?.[index]) return log;
  list[index] = { ...list[index], verdict, note: note ?? list[index].note };
  save(roundId, log);
  return log;
}
