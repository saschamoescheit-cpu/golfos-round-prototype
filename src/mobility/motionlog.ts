// The motion log (Sascha 19.10.2026: the measuring has only been checked with synthetic players): when switched on in
// the setup of a training or a screening, its camera parts record the body points they saw – no picture, no video,
// only the 33 points – with what the app counted, measured and said. Shared as one file at the end, it lets the
// counting, the values and the cues be checked and tuned on a real body (qa/replay.ts). Kept in memory only, until the
// next start: nothing is stored or sent by itself.
import type { Lm } from './measure';
import type { DrillCoach } from './drillcoach';
import type { MetricKind, Side } from './types';

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

/** One picture: the time (ms; for a test the time its measuring saw), the phase (f getting in position, c countdown,
 * r run), the set, the points (x, y in thousandths of the picture, visibility in hundredths; null when nobody was
 * seen), and the app's state. */
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

/** One camera part: a drill of the training, or a test of the screening on one side. */
export interface LogItem {
  drill?: string;
  plan?: DrillCoach;
  test?: { id: string; kind: MetricKind; side: Side | null; variant?: string };
  w: number;
  h: number;
  at: string;
  frames: LogFrame[];
  /** what the app saved (the reps, best value and cues per set of a drill; the value of a test) */
  result?: unknown;
}

export interface MotionLog {
  v: 1;
  startedAt: string;
  device: string;
  items: LogItem[];
}

let log: MotionLog | null = null;
let cur: LogItem | null = null;
let last = -1e9;

/** a new training or screening: the log starts empty (when switched on) */
export function startLog(): void {
  log = isLogging() ? { v: 1, startedAt: new Date().toISOString(), device: navigator.userAgent, items: [] } : null;
  cur = null;
}

const keyOf = (x: Pick<LogItem, 'drill' | 'test'>) => x.drill ?? `${x.test?.id}:${x.test?.side ?? ''}`;

/** a camera part begins: a drill, or a test on a side */
export function logItem(what: Pick<LogItem, 'drill' | 'plan' | 'test'>): void {
  if (!log && isLogging()) startLog();
  if (!log) return;
  last = -1e9;
  // the same part started again before it ran (the player set up anew): one entry, not two
  if (cur && keyOf(cur) === keyOf(what) && !cur.frames.some((x) => x.p === 'r')) {
    Object.assign(cur, what, { at: new Date().toISOString(), frames: [] });
    return;
  }
  cur = { ...what, w: 0, h: 0, at: new Date().toISOString(), frames: [] };
  log.items.push(cur);
}

const r3 = (x: number) => Math.round(x * 1000);

/** a picture of the part */
export function logFrame(t: number, p: LogFrame['p'], s: number, lm: Lm[] | null, w: number, h: number, state: Omit<LogFrame, 't' | 'p' | 's' | 'lm'> = {}): void {
  if (!cur) return;
  // every picture of the countdown (the still pictures the measuring starts from) and of the run (the counting smooths
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

/** the log, when it holds a part that ran */
export function currentLog(): MotionLog | null {
  return log && log.items.some((x) => x.frames.some((f) => f.p === 'r')) ? log : null;
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

/** share the file (the iPhone's share sheet: AirDrop, mail, files) or download it. The file is made beforehand: Safari
 * opens the share sheet only right after the tap – not after waiting for the zip. Not allowed (or no sharing of files):
 * the download. */
export async function shareFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      // the player closed the sheet: nothing more; the browser did not allow it: the download instead
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}
