import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { distanceM, type HoleMapData } from './geo';
import { isNative } from './native';
import type { LngLat, Round } from '../types';

// The Apple Watch (Sascha 08.11.2026: "can we connect the native app with an Apple Watch – the automatic shot
// detection by the watch, the phone often lies in the cart"; shots + distances). Only in the iOS app: the round goes
// to the watch app (ios/App/Watch) – the holes with tee, green and par – and every swing it feels comes back with the
// watch's own place and time. Here it becomes a "shot here" of the round (round.manualShots, marked `watch`): the
// review builds the hole's shots from those, as from the ones tapped on the course.

/** a swing the watch felt (or a shot noted on the watch by hand) */
export interface WatchShot {
  id: string;
  round: string;
  hole: number;
  t: number; // ms since 1970
  lng?: number | null;
  lat?: number | null;
  acc?: number | null;
  peak: number; // the wrist's fastest turn, rad/s
  jolt: number; // the hit felt, g
  full: boolean;
  hit: boolean;
  manual: boolean;
  /** the crack of the hit heard on the wrist (Sascha 09.11.2026) */
  sound?: boolean;
  /** the watch's fastest GPS speed in the seconds up to the swing, m/s (watch app from 10.11.2026 on) – the watch itself
   *  sends no swing faster than 2.5 m/s (driving in the cart, Sascha 10.11.2026: "bumps counted as shots") */
  spd?: number | null;
}
/** 'hole': `round` and the watch's own `t` from the watch app of 08.11.2026 on – before, `t` is when it reached the phone */
export type WatchItem =
  | { kind: 'shot'; shot: WatchShot }
  | { kind: 'remove'; id: string }
  | { kind: 'hole'; hole: number; t: number; round?: string }
  // the watch's own GPS track, a batch: [ms, lng, lat, accuracy] per fix (Sascha 09.11.2026)
  | { kind: 'track'; round: string; pts: number[][] }
  // the watch's place, live every 5 s (10.11.2026): [ms, lng, lat, accuracy] – the map follows the player, not the cart
  | { kind: 'pos'; round: string; p: number[] };

/** A hole changed on the watch – for this round, and in the last minute? (Sascha 08.11.2026: Erik's new round jumped to
 *  the hole the watch still showed of the round he had deleted) */
export function watchHoleFor(it: { hole: number; t: number; round?: string }, roundId: string, holes: number, now = Date.now()): boolean {
  if (it.round != null && it.round !== roundId) return false;
  return now - it.t < 60000 && it.hole >= 0 && it.hole < holes;
}

// the round last sent to the watch – when it is gone or over, the watch is told (however it ended: finished, given up,
// deleted, on another phone)
const SENT = 'golfos.watch.round';
const sentId = (): string | null => {
  try {
    return localStorage.getItem(SENT);
  } catch {
    return null;
  }
};
const setSent = (id: string | null) => {
  try {
    if (id) localStorage.setItem(SENT, id);
    else localStorage.removeItem(SENT);
  } catch {
    /* this visit only */
  }
};

interface WatchLinkPlugin {
  status(): Promise<{ supported: boolean; paired: boolean; installed: boolean; reachable: boolean }>;
  round(o: { json: string; hole: number; start: boolean }): Promise<{ started: boolean; why: string }>;
  hole(o: { hole: number }): Promise<void>;
  end(): Promise<void>;
  take(): Promise<{ items: WatchItem[] }>;
  forget(o: { round: string }): Promise<void>;
  samples(): Promise<{ count: number; uri: string }>;
  addListener(event: 'watch', fn: (it: WatchItem) => void): Promise<PluginListenerHandle>;
}
// a plugin proxy answers every name, also "then" – never awaited or returned itself (see native.ts)
const Link = registerPlugin<WatchLinkPlugin>('WatchLink');

/** at most n points of the green's outline – the watch only needs its front and back */
function thin(ring: LngLat[], n: number): LngLat[] {
  if (ring.length <= n) return ring;
  const step = (ring.length - 1) / (n - 1);
  const out: LngLat[] = [];
  for (let k = 0; k < n; k++) out.push(ring[Math.round(k * step)]);
  return out;
}
const r6 = (p: LngLat): LngLat => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];

/** The hole drawn on the watch (Sascha 08.11.2026: "the hole's picture on the watch beside the score and the
 *  distances"): in metres from the tee, turned so the green is straight up – [right, forward], whole metres. `b` is the
 *  turn (the bearing tee → green, degrees from north) – the watch puts its own place into the same picture with it.
 *  Kept small for the watch: few points per shape, the most of each kind near the line. */
export interface WatchMap {
  b: number;
  line: [number, number][];
  green: [number, number][] | null;
  fairways: [number, number][][];
  bunkers: [number, number][][];
  water: [number, number][][];
  tees: [number, number][][];
}
export function watchMap(m: HoleMapData, center: LngLat): WatchMap {
  const [lon0, lat0] = m.tee;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const en = (p: LngLat): [number, number] => [(p[0] - lon0) * kx, (p[1] - lat0) * ky];
  const [ce, cn] = en(center);
  const b = Math.atan2(ce, cn); // from north, clockwise
  const [sb, cb] = [Math.sin(b), Math.cos(b)];
  const local = (p: LngLat): [number, number] => {
    const [e, n] = en(p);
    return [Math.round(e * cb - n * sb), Math.round(e * sb + n * cb)];
  };
  const ring = (r: LngLat[], n: number) => thin(r, n).map(local);
  // the shapes nearest the playing line first – the watch gets the few that matter
  const near = (rs: LngLat[][], most: number, n: number) =>
    rs
      .map((r) => ({ r, d: Math.min(...r.map((q) => Math.min(...m.line.map((l) => distanceM(q, l))))) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, most)
      .map((x) => ring(x.r, n));
  return {
    b: Math.round(((b * 180) / Math.PI) * 10) / 10,
    line: thin(m.line, 10).map(local),
    green: m.green ? ring(m.green, 20) : null,
    fairways: near(m.fairways, 3, 14),
    bunkers: near(m.bunkers, 6, 8),
    water: near(m.water, 3, 12),
    tees: near(m.tees, 2, 6),
  };
}

/** What the watch gets of a round: per hole its label, par, tee, the middle of the green (or the pin) and its outline. */
export function watchRound(round: Round, maps: (HoleMapData | null)[], unit: 'm' | 'yd', lang: string, pins: (LngLat | null)[] = []) {
  return {
    id: round.id,
    unit,
    lang: lang === 'en' ? 'en' : 'de',
    start: round.startHole ?? 0,
    holes: round.holes.map((h, k) => {
      const m = maps[k];
      if (!m) return null;
      return {
        label: String(h.label ?? k + 1),
        par: h.par || 4,
        tee: r6(m.tee),
        center: r6(pins[k] ?? m.greenCenter),
        green: m.green ? thin(m.green, 24).map(r6) : null,
        map: watchMap(m, pins[k] ?? m.greenCenter),
      };
    }),
  };
}

type ManualShot = NonNullable<Round['manualShots']>[number];

/**
 * A swing from the watch into the round's "shot here" places. Its place is the watch's (the phone may lie in the
 * cart), else where the phone's track was then (`fallback`). Two swings at one spot within two minutes are one shot
 * (a practice swing, then the shot): the later one stays – unless only the earlier one felt the ball. Done once: an id
 * already there changes nothing. Returns the round as it is when nothing changed.
 */
export function addWatchShot(round: Round, s: WatchShot, hole: number, fallback: { pos: LngLat; accuracy: number } | null): Round {
  const list = round.manualShots ?? [];
  if (list.some((x) => x.watch === s.id)) return round;
  const pos: LngLat | null = s.lng != null && s.lat != null ? [s.lng, s.lat] : (fallback?.pos ?? null);
  if (!pos) return round;
  const acc = s.lng != null && s.lat != null ? Math.round(s.acc ?? 10) : Math.round(fallback?.accuracy ?? 10);
  // the ball felt – or its crack heard on the wrist
  const entry: ManualShot = { hole, pos, t: s.t, acc, watch: s.id, ...(s.hit || s.sound ? { hit: true } : {}) };
  let k = -1;
  list.forEach((x, j) => {
    if (x.hole === hole) k = j;
  });
  const prev = k >= 0 ? list[k] : null;
  if (prev && prev.watch && !s.manual && s.t - prev.t <= 120000 && s.t >= prev.t && distanceM(prev.pos, pos) <= 12) {
    // the earlier one felt the ball, this one not (a swing after the shot): the earlier stays
    if (prev.hit && !(s.hit || s.sound)) return { ...round, manualShots: list.map((x, j) => (j === k ? { ...x, also: [...(x.also ?? []), s.id] } : x)) };
    return { ...round, manualShots: list.map((x, j) => (j === k ? { ...entry, also: [...(x.also ?? []), x.watch!] } : x)) };
  }
  return { ...round, manualShots: [...list, entry] };
}

/** Swings closer together than this are one place – the watch's GPS wanders a few metres, a practice swing, the waggle,
 *  the arm while waiting are made where the ball lies. */
const SAME_PLACE_M = 25;
/**
 * The shots of a hole from the places noted (Sascha 14.11.2026, Erik on the Reserve: 47 watch swings on hole 6 for a 5):
 * a place tapped by hand always counts; the watch's swings one after another at one place (25 m) are one shot – the last
 * that felt or heard the ball, else the last. And never more than the score leaves for the shots off the green (strokes
 * − putts − penalties, `allowed`): too many – the ones nearest to the shot before go first, a swing that felt no ball
 * before one that did; the tee shot stays.
 */
export function pickWatchShots<T extends ManualShot>(hs: T[], allowed: number | null): T[] {
  const sorted = [...hs].sort((a, b) => a.t - b.t);
  const out: T[] = [];
  let group: T[] = [];
  const flush = () => {
    if (!group.length) return;
    const felt = group.filter((x) => x.hit);
    out.push((felt.length ? felt : group)[(felt.length ? felt : group).length - 1]);
    group = [];
  };
  for (const x of sorted) {
    if (!x.watch) {
      flush();
      out.push(x);
      continue;
    }
    if (group.length && distanceM(group[0].pos, x.pos) > SAME_PLACE_M) flush();
    group.push(x);
  }
  flush();
  if (allowed == null) return out;
  const keep = [...out];
  while (keep.length > Math.max(0, allowed)) {
    // the one to go: a watch swing (never a tap) – one without a ball felt first, then the nearest to the one before (the
    // first has none before it: it goes last)
    let worst = -1;
    let worstScore = Infinity;
    keep.forEach((x, n) => {
      if (!x.watch) return;
      const gap = n === 0 ? 1e5 : distanceM(keep[n - 1].pos, x.pos);
      const score = (x.hit ? 1e6 : 0) + gap;
      if (score < worstScore) {
        worstScore = score;
        worst = n;
      }
    });
    if (worst < 0) break; // only taps left – they are the player's own
    keep.splice(worst, 1);
  }
  return keep;
}

/**
 * A swing of warming up – on the range, before the round began (Sascha 09.11.2026 at Kissimmee Bay: "the shots on the
 * range were registered" – 11:27 and 11:47, the flight's tee time 12:08; they went to hole 1). Only while nothing of the
 * round counts yet (no shot, no score of this phone's owner): more than 10 minutes before the tee time of a tournament's
 * flight, or farther than 60 m (and what the GPS may be off) from every tee of the course. A shot noted by hand on the
 * watch always counts.
 */
export function warmUpSwing(round: Round, s: Pick<WatchShot, 't' | 'manual' | 'acc'>, at: { pos: LngLat | null; tees: (LngLat | null | undefined)[]; teeTime?: number | null }): 'early' | 'away' | null {
  if (s.manual) return null;
  // the round begun: a shot of it – by hand, from the watch, or a crack the phone heard
  if ((round.manualShots ?? []).length || (round.soundShots ?? []).length) return null;
  const me = round.players.find((p) => p.isMe) ?? round.players[0];
  if (me && (round.entries[me.id] ?? []).some((e) => e && (e.strokes != null || e.pickedUp))) return null;
  if (at.teeTime != null && s.t < at.teeTime - 10 * 60000) return 'early';
  const tees = at.tees.filter((x): x is LngLat => !!x);
  if (at.pos && tees.length && tees.every((t) => distanceM(t, at.pos!) > 60 + Math.min(s.acc ?? 10, 30))) return 'away';
  return null;
}

/** Is the watch's live place the player's (Sascha 10.11.2026: Erik's dot on the road – the phone in the cart): fresh
 *  (15 s), and the phone's own place clearly elsewhere – farther apart than both their accuracies and 15 m. */
export function watchPlaceWins(watch: { pos: LngLat; accuracy: number; t: number } | null, phone: { pos: LngLat; accuracy: number } | null, now = Date.now()): boolean {
  if (!watch || now - watch.t > 15000) return false;
  if (!phone) return true;
  return distanceM(watch.pos, phone.pos) > Math.max(15, watch.accuracy + phone.accuracy);
}

/** A shot taken back on the watch: gone from the round too. */
export function removeWatchShot(round: Round, id: string): Round {
  const list = round.manualShots ?? [];
  const k = list.findIndex((x) => x.watch === id);
  if (k < 0) return round;
  return { ...round, manualShots: list.filter((_, j) => j !== k) };
}

/** Is a watch with the GolfOS app there (paired, app installed)? */
export async function watchReady(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const s = await Link.status();
    return s.paired && s.installed;
  } catch {
    return false; // an app from before the watch
  }
}

/** The round to the watch; `start`: open the watch app and its workout (the shot detection) – once per round. */
export async function sendRound(json: ReturnType<typeof watchRound>, hole: number, start: boolean): Promise<boolean> {
  try {
    if (start) await Link.forget({ round: json.id });
    setSent(json.id);
    try {
      localStorage.setItem(USED, '1');
    } catch {
      /* told again only while the app runs */
    }
    const r = await Link.round({ json: JSON.stringify(json), hole, start });
    return r.started;
  } catch {
    return false;
  }
}

export function sendHole(hole: number): void {
  if (isNative()) void Link.hole({ hole }).catch(() => undefined);
}

/** The round is over: the watch ends its workout. */
export function endWatchRound(): void {
  setSent(null);
  if (isNative()) void Link.end().catch(() => undefined);
}

/** a watch was used with this phone – told again that nothing runs (Sascha 09.11.2026) */
const USED = 'golfos.watch.used';
const watchUsed = (): boolean => {
  try {
    return localStorage.getItem(USED) === '1';
  } catch {
    return false;
  }
};
/** No round running on the phone – of Rounds, a game on the map, a pool's round – while a watch was used with it: the
 *  watch is told again that nothing runs (Sascha 09.11.2026: "the deleted round is still on the watch" – the first
 *  "over" may not have reached it; it is harmless again and again). True when told. */
export function endWatchIfIdle(running: { id: string; finishedAt: string | null }[]): boolean {
  if (!watchUsed() || running.some((r) => !r.finishedAt)) return false;
  endWatchRound();
  return true;
}

/** The rounds changed: the round on the watch no longer there or over – the watch ends it too (Sascha 08.11.2026: "Erik
 *  saves or deletes the round on the phone, on the watch it is still there"). `rounds`: every round that may be on the
 *  watch – of Rounds, a game on the map, a pool's round (09.11.2026: a game's round was taken for gone). True when the
 *  watch was told. */
export function endWatchRoundIfGone(rounds: { id: string; finishedAt: string | null }[]): boolean {
  const id = sentId();
  if (!id || rounds.some((r) => r.id === id && !r.finishedAt)) return false;
  endWatchRound();
  // brought back (the delete undone): the watch app and its workout start again
  try {
    sessionStorage.removeItem(`golfos.watch.started.${id}`);
    localStorage.removeItem(`golfos.watch.started.${id}`);
  } catch {
    /* nothing kept */
  }
  return true;
}

/** What the watch sends, as it comes and – after the page slept – all kept so far. Returns the stop. */
export function onWatch(fn: (it: WatchItem) => void): () => void {
  if (!isNative()) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void Link.addListener('watch', fn)
    .then((h) => (stopped ? void h.remove() : (handle = h)))
    .catch(() => undefined);
  const catchUp = () => {
    if (document.visibilityState === 'visible') void Link.take().then((r) => r.items.forEach(fn), () => undefined);
  };
  catchUp();
  document.addEventListener('visibilitychange', catchUp);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', catchUp);
    void handle?.remove();
  };
}

/** The watch's recordings of the swings (and the turns that were no swing), kept on the iPhone in a file – to tune the
 *  shot detection from real swings (Sascha 08.11.2026). count 0: none (or not the app). */
export async function watchSamples(): Promise<{ count: number; uri: string }> {
  if (!isNative()) return { count: 0, uri: '' };
  try {
    return await Link.samples();
  } catch {
    return { count: 0, uri: '' }; // an app from before the recordings
  }
}

/** The recordings into the share sheet (AirDrop, mail, files). */
export async function shareWatchSamples(uri: string): Promise<void> {
  const { Share } = await import('@capacitor/share');
  await Share.share({ title: 'GolfOS – Apple Watch', files: [uri] });
}