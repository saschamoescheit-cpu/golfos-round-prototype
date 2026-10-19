// The motion log of a guided session (Sascha 19.10.2026: the measuring has only been checked with synthetic players):
// when switched on before the start, the player records the body points the camera saw in every drill – no picture,
// no video, only the 33 points – with what the app counted, measured and said. Downloaded or shared as one file at the
// end, it lets the counting, the values and the cues be checked and tuned on a real body (qa/replay.mjs). Kept in
// memory only, for this session: nothing is stored or sent by itself.
import type { Lm } from './measure';
import type { DrillCoach } from './drillcoach';

const KEY = 'golfos.mobility.motionlog.v1';

export function isLogging(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setLogging(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
}

/** One picture: the time from the drill's start (ms), the phase (f frame, c countdown, r run), the set, the points
 * (x, y in thousandths of the picture, visibility in hundredths; null when nobody was seen), and the app's state. */
export interface LogFrame {
  t: number;
  p: 'f' | 'c' | 'r';
  s: number;
  lm: number[] | null;
  reps?: number;
  v?: number | null;
  cue?: string;
  paced?: boolean;
}

export interface LogDrill {
  drill: string;
  plan: DrillCoach;
  w: number;
  h: number;
  at: string;
  frames: LogFrame[];
  /** what the app saved for the drill (reps, best value, cues per set) */
  result?: unknown;
}

export interface MotionLog {
  v: 1;
  startedAt: string;
  device: string;
  drills: LogDrill[];
}

let log: MotionLog | null = null;
let cur: LogDrill | null = null;
let last = -1e9;

/** a new session: the log starts empty */
export function startLog(): void {
  log = isLogging() ? { v: 1, startedAt: new Date().toISOString(), device: navigator.userAgent, drills: [] } : null;
  cur = null;
}

export function logDrill(drill: string, plan: DrillCoach): void {
  if (!log && isLogging()) startLog();
  if (!log) return;
  last = -1e9;
  // the same drill started again before it ran (the player set up anew): one entry, not two
  if (cur && cur.drill === drill && !cur.frames.some((x) => x.p === 'r')) {
    Object.assign(cur, { plan, at: new Date().toISOString(), frames: [] });
    return;
  }
  cur = { drill, plan, w: 0, h: 0, at: new Date().toISOString(), frames: [] };
  log.drills.push(cur);
}

const r3 = (x: number) => Math.round(x * 1000);

/** a picture of the drill */
export function logFrame(t: number, p: LogFrame['p'], s: number, lm: Lm[] | null, w: number, h: number, state: Omit<LogFrame, 't' | 'p' | 's' | 'lm'> = {}): void {
  if (!cur) return;
  // every picture of the countdown (the still pictures the measuring starts from) and of a set (the counting smooths
  // over the last three – the replay needs the same pictures as the app); while the player gets in position 15 a second
  if (p === 'f' && t - last < 66) return;
  last = t;
  cur.w = w;
  cur.h = h;
  const flat = lm ? lm.flatMap((l) => [r3(l.x), r3(l.y), Math.round((l.v ?? 1) * 100)]) : null;
  cur.frames.push({ t: Math.round(t), p, s, lm: flat, ...state });
}

export function logResult(result: unknown): void {
  if (cur) cur.result = result;
}

export function currentLog(): MotionLog | null {
  return log && log.drills.length ? log : null;
}

/** the log as a file – gzip where the browser can (a 15-minute session is a few MB then) */
export async function logFile(l: MotionLog): Promise<File> {
  const json = JSON.stringify(l);
  const name = `agility-protokoll-${l.startedAt.slice(0, 16).replace(/[:T]/g, '-')}`;
  const CS = (globalThis as { CompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).CompressionStream;
  if (CS) {
    const gz = await new Response(new Blob([json]).stream().pipeThrough(new CS('gzip'))).blob();
    return new File([gz], `${name}.json.gz`, { type: 'application/gzip' });
  }
  return new File([json], `${name}.json`, { type: 'application/json' });
}

/** share the file (the iPhone's share sheet: AirDrop, mail, files) or download it */
export async function shareLog(l: MotionLog): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = await logFile(l);
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}
