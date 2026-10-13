import type { Club, DetailEntry, LngLat, Shot } from '../types';
import { distanceM, distToLine, type HoleMapData } from './geo';
import { BAG, lieAt, onGreenAt, suggestKind } from './shots';
import { expectedStrokes } from './sg';

// Shot detection from the GPS track (features 004/007). A golfer walks to the ball, stands there while
// choosing the club and hitting, then walks on towards the green. "Stand still, then move on towards the
// green" is the signal for a shot. The web app can only record while it is open; a native app records in
// the background (feature 004) – the detection is the same.

export interface TrackPoint {
  t: number; // ms
  p: LngLat;
  acc: number; // GPS accuracy in metres
  open?: boolean; // first fix after the app was opened again (often at the ball)
}

/** Tunable values (feature 004, Akzeptanzkriterien – calibrated with the simulator scripts/shotsim.ts, then real rounds). */
export const DETECT = {
  maxAccuracyM: 15, // ignore worse fixes
  stopRadiusM: 8, // standing still = the fixes stay within this radius of their centre (phone GPS wanders 3–8 m)
  minStopS: 10,
  maxStopS: 180, // longer = waiting, not a shot (except on the tee)
  minProgressM: 15, // after a shot the player gets closer to the green by at least this
  mergeM: 12, // places closer than this are one ball (practice swing, back to the bag)
  corridorM: 60, // places further from the hole line do not belong to this hole
  gapS: 30, // no fix for this long = the phone was put away
};

export interface Stop {
  p: LngLat;
  from: number;
  to: number;
}

/**
 * Stops in a track: the player stays within the stop radius of the centre of the fixes for at least the minimum
 * time. One wild fix (a jump of 20 m and back) does not end a stop.
 */
export function findStops(track: TrackPoint[]): Stop[] {
  const pts = track.filter((x) => x.acc <= DETECT.maxAccuracyM);
  const stops: Stop[] = [];
  let i = 0;
  while (i < pts.length) {
    let sx = pts[i].p[0];
    let sy = pts[i].p[1];
    let n = 1;
    let j = i;
    let k = i + 1;
    while (k < pts.length) {
      const c: LngLat = [sx / n, sy / n];
      if (distanceM(c, pts[k].p) <= DETECT.stopRadiusM) {
        sx += pts[k].p[0];
        sy += pts[k].p[1];
        n++;
        j = k;
        k++;
      } else if (k + 1 < pts.length && distanceM(c, pts[k + 1].p) <= DETECT.stopRadiusM) k++; // skip one wild fix
      else break;
    }
    const dur = (pts[j].t - pts[i].t) / 1000;
    if (dur >= DETECT.minStopS && !drifts(pts.slice(i, j + 1))) {
      stops.push({ p: [sx / n, sy / n], from: pts[i].t, to: pts[j].t });
      i = j + 1;
    } else i++;
  }
  return stops;
}

/**
 * Walking slowly also keeps the fixes within the radius for a while – but the first and the last fixes are then
 * apart. Standing: the mean of the first third and of the last third are close (GPS noise averages out).
 */
function drifts(w: TrackPoint[]): boolean {
  if (w.length < 3) return false;
  const third = Math.max(1, Math.floor(w.length / 3));
  const mean = (xs: TrackPoint[]): LngLat => [xs.reduce((s, x) => s + x.p[0], 0) / xs.length, xs.reduce((s, x) => s + x.p[1], 0) / xs.length];
  const moved = distanceM(mean(w.slice(0, third)), mean(w.slice(-third)));
  const secs = Math.max(1, (w[w.length - 1].t - w[0].t) / 1000);
  return moved > Math.max(4, 0.3 * secs); // walking is 1–1.5 m/s; a few metres are GPS noise
}

/** Club whose typical distance fits the shot length best (driver only for long tee shots). */
export function clubForLength(lengthM: number, isTeeShot: boolean, bag = BAG): Club {
  const options = bag.filter((b) => b.club !== 'Dr' || isTeeShot);
  return options.reduce((best, b) => (Math.abs(b.m - lengthM) < Math.abs(best.m - lengthM) ? b : best)).club;
}

/** An amateur shot against the tour: about −0.25 strokes, spread ±0.4 (tuned with scripts/shotsim.ts). */
export const PLAUSIBLE = {
  meanSg: -0.25,
  sdSg: 0.4,
  shotCost: 0.4, // every shot must be earned – waiting by a partner's ball is common
  countMiss: 1.5, // per shot more or less than score − putts − penalties (when the player entered them)
};

function greenRadius(hole: HoleMapData): number {
  if (!hole.green) return 12;
  return hole.green.reduce((s, q) => s + distanceM(hole.greenCenter, q), 0) / hole.green.length;
}

/** A place where the player may have played a ball: where he stood, opened the app, or put the phone away. */
interface Place {
  p: LngLat;
  from: number;
  to: number;
  q: number; // how sure we are that the player stood there (and not just walked past)
  w: number; // weight of its position (a stop's centre beats the first fix after unlocking)
}

/** All places on this hole: stops, the first fix after opening the app, the last fix before the phone went away. */
function places(track: TrackPoint[], hole: HoleMapData): Place[] {
  const pts = track.filter((x) => x.acc <= DETECT.maxAccuracyM);
  const out: Place[] = findStops(pts).map((s) => {
    const dur = (s.to - s.from) / 1000;
    return { p: s.p, from: s.from, to: s.to, q: dur > DETECT.maxStopS ? 0.3 : dur >= 20 ? 0.55 : 0.4, w: 3 };
  });
  for (let k = 0; k < pts.length; k++) {
    // the app opened again – a golfer looks at the distance by his ball (alone a weak sign: a glance on the way
    // looks the same; together with standing there it is a strong one)
    if (pts[k].open) out.push({ p: pts[k].p, from: pts[k].t, to: pts[k].t, q: 0.2, w: 1 });
    // the phone put away for a while and the player turned up somewhere else: he was here before
    if (k + 1 < pts.length && (pts[k + 1].t - pts[k].t) / 1000 >= DETECT.gapS && distanceM(pts[k].p, pts[k + 1].p) >= 25)
      out.push({ p: pts[k].p, from: pts[k].t, to: pts[k].t, q: 0.15, w: 1 });
  }
  out.sort((a, b) => a.from - b.from);
  // One ball, several signs (opened the app, stood there, put it away): one place, the signs add up.
  const merged: Place[] = [];
  for (const x of out) {
    const last = merged[merged.length - 1];
    if (last && distanceM(last.p, x.p) <= DETECT.mergeM && x.from - last.to <= 120000) {
      last.to = Math.max(last.to, x.to);
      last.p = [(last.p[0] * last.w + x.p[0] * x.w) / (last.w + x.w), (last.p[1] * last.w + x.p[1] * x.w) / (last.w + x.w)];
      last.w += x.w;
      // standing there and having looked at the phone: very likely the own ball
      last.q = Math.min(1.2, last.q + x.q + 0.25);
    } else merged.push({ ...x });
  }
  return merged.filter((x) => distToLine(x.p, hole.line) <= DETECT.corridorM);
}

/**
 * Detects the shots of one hole from the part of the track played on it. Every shot is marked "review",
 * the player confirms or corrects them after the round.
 *
 * Golf sense decides between the places (Sascha, 13.10.2026: "the shot detection is wrong front and back"): the
 * shots must add up to a plausible hole for an amateur – each shot measured with strokes gained against the tour
 * (an amateur shot costs about 0.2 strokes, rarely more than 1). Waiting by a partner's ball on the way would add
 * a shot that loses a stroke; leaving out the own ball would need a shot no amateur hits. The most plausible chain
 * of places wins (dynamic programming over the places in time order).
 */
export function detectHoleShots(track: TrackPoint[], hole: HoleMapData, par: number, bag = BAG, opts: { shots?: number | null } = {}): DetailEntry | null {
  const toGreen = (p: LngLat) => distanceM(p, hole.greenCenter);
  let list = places(track, hole);
  if (list.length === 0 && track.length === 0) return null;
  // The tee: the last place near the tee (waiting for the group in front does not matter there). The player tees
  // off from the tee even when the phone was in the pocket there.
  const teeIdx = list.map((x, k) => (distanceM(x.p, hole.tee) <= 40 ? k : -1)).filter((k) => k >= 0).pop();
  const tee: Place = teeIdx != null ? list[teeIdx] : { p: hole.tee, from: track[0]?.t ?? 0, to: track[0]?.t ?? 0, q: 0, w: 1 };
  if (teeIdx != null) list = list.slice(teeIdx + 1);
  list = list.filter((x) => distanceM(x.p, hole.tee) > 40);
  // The ball on the green: the first place on it (or a long stop right next to it – GPS error at the edge).
  const g = list.findIndex((x) => onGreenAt(x.p, hole) || (toGreen(x.p) <= greenRadius(hole) + 4 && (x.to - x.from) / 1000 >= 60));
  const green = g >= 0 ? list[g] : null;
  if (g >= 0) list = list.slice(0, g);
  // places off the green on the way (not on the green itself)
  list = list.filter((x) => !onGreenAt(x.p, hole));

  // ---- the most plausible chain tee → … → green ----
  const lieOf = (p: LngLat, first: boolean) => lieAt(p, hole, first);
  const E = (p: LngLat, first: boolean): number => expectedStrokes(toGreen(p), lieOf(p, first));
  // The pin is not known: the first putt counts like an amateur's typical one (7 m) or longer.
  const endE = expectedStrokes(Math.max(7, green ? toGreen(green.p) : 7), 'green');
  /** How plausible one shot is for an amateur (log-likelihood): strokes gained around −0.2 ± 0.35. */
  const shotLL = (from: number, to: number, progress: number): number => {
    const sg = from - to - 1;
    let ll = -(((sg - PLAUSIBLE.meanSg) / PLAUSIBLE.sdSg) ** 2) / 2;
    if (progress < 5) ll -= 3; // a "shot" that does not get closer to the green
    return ll;
  };
  const nodes = [{ p: tee.p, e: E(tee.p, true), q: 0 }, ...list.map((x) => ({ p: x.p, e: E(x.p, false), q: x.q }))];
  // best[j][c]: the most plausible chain that ends at place j with c shots (tee = 1). The count matters: the player
  // entered his score and putts on the course – score − putts − penalties = shots to the green, a strong hint.
  const MAXC = Math.min(nodes.length, 9);
  const best: number[][] = nodes.map(() => Array(MAXC + 1).fill(-Infinity));
  const prev: number[][] = nodes.map(() => Array(MAXC + 1).fill(-1));
  best[0][1] = 0;
  for (let j = 1; j < nodes.length; j++) {
    for (let i = 0; i < j; i++) {
      const step = shotLL(nodes[i].e, nodes[j].e, toGreen(nodes[i].p) - toGreen(nodes[j].p)) + nodes[j].q - PLAUSIBLE.shotCost;
      for (let c = 1; c < MAXC; c++) {
        if (best[i][c] === -Infinity) continue;
        const v = best[i][c] + step;
        if (v > best[j][c + 1]) {
          best[j][c + 1] = v;
          prev[j][c + 1] = i;
        }
      }
    }
  }
  let last = 0;
  let lastC = 1;
  let total = -Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let c = 1; c <= MAXC; c++) {
      if (best[i][c] === -Infinity) continue;
      let v = best[i][c] + shotLL(nodes[i].e, endE, toGreen(nodes[i].p));
      if (opts.shots != null) v += c === opts.shots ? 0 : -PLAUSIBLE.countMiss * Math.abs(c - opts.shots);
      if (v > total) {
        total = v;
        last = i;
        lastC = c;
      }
    }
  }
  const chain: number[] = [];
  for (let k = last, c = lastC; k >= 0 && c >= 1; ) {
    chain.unshift(k);
    if (k === 0) break;
    const pk = prev[k][c];
    k = pk;
    c--;
  }
  const end = green?.p ?? null;
  // One shot fewer than score − putts says, the last place well away from the green: the missing one is almost
  // always the chip or pitch from just off the green (nobody takes the phone out for it). It is suggested at the
  // green's edge on the way in, marked for checking – the player drags it to where the ball lay.
  const spots = chain.map((k) => nodes[k].p);
  const lastP = spots[spots.length - 1];
  if (opts.shots != null && opts.shots - spots.length === 1 && lastP && toGreen(lastP) > greenRadius(hole) + 15) {
    const r = greenRadius(hole) + 4;
    const k = r / toGreen(lastP);
    spots.push([hole.greenCenter[0] + (lastP[0] - hole.greenCenter[0]) * k, hole.greenCenter[1] + (lastP[1] - hole.greenCenter[1]) * k]);
  }
  const shots: Shot[] = spots.map((p, n) => {
    const next = n + 1 < spots.length ? spots[n + 1] : end;
    const length = next ? distanceM(p, next) : toGreen(p);
    const lie = lieOf(p, n === 0);
    const kind = suggestKind(lie, toGreen(p));
    const club = kind === 'chip' || kind === 'pitch' || kind === 'bunker' ? clubForLength(Math.max(length, 50), false, bag) : clubForLength(length, n === 0 && par >= 4, bag);
    return { pos: p, lie, club, penalty: false, kind, review: true };
  });
  return { shots, onGreen: end, pin: null, holedOut: false };
}

/**
 * The round's track cut into holes in playing order: each part starts when the player reaches the tee (or the
 * hole's line, when the phone was in the pocket on the tee) – only after the previous hole – and ends at the next tee.
 */
export function splitRound(track: TrackPoint[], holes: (HoleMapData | null)[]): TrackPoint[][] {
  const parts: TrackPoint[][] = [];
  let cursor = 0;
  holes.forEach((hole, n) => {
    if (!hole) return parts.push([]);
    const rest = track.slice(cursor);
    let start = rest.findIndex((x) => distanceM(x.p, hole.tee) <= 40);
    if (start < 0) start = rest.findIndex((x) => distToLine(x.p, hole.line) <= 30 && distanceM(x.p, hole.greenCenter) < distanceM(hole.tee, hole.greenCenter));
    if (start < 0) return parts.push([]);
    const next = holes[n + 1] ?? null;
    let end = rest.length;
    if (next) {
      // seen near the green (or at least well on the hole) first, then at the next tee
      // on the green (or right at it) first – a ball 35 m short of the green is not the end of the hole yet
      let onHole = rest.findIndex((x, k) => k > start && (onGreenAt(x.p, hole) || distanceM(x.p, hole.greenCenter) <= 20));
      if (onHole < 0) onHole = rest.findIndex((x, k) => k > start && distanceM(x.p, hole.greenCenter) <= 40);
      const from = onHole > 0 ? onHole : start;
      // at the next tee: near it (40 m – the tee box played may lie in front of or behind the mapped one) and nearer to
      // it than to this green (tees often lie right next to the last green) – or already on the next hole's line
      const k = rest.findIndex(
        (x, i) =>
          i > from &&
          ((distanceM(x.p, next.tee) <= 40 && distanceM(x.p, next.tee) < distanceM(x.p, hole.greenCenter) && distanceM(x.p, hole.greenCenter) > 25 && !onGreenAt(x.p, hole)) ||
            (distToLine(x.p, next.line) <= 20 && distanceM(x.p, hole.greenCenter) > 40 && distToLine(x.p, hole.line) > 30)),
      );
      if (k > 0) end = k;
    }
    parts.push(rest.slice(start, end));
    cursor += end;
  });
  return parts;
}

/** Part of the round's track that belongs to a hole: from arriving at its tee until arriving at the next tee. */
export function trackForHole(track: TrackPoint[], hole: HoleMapData, nextHole: HoleMapData | null): TrackPoint[] {
  const start = track.findIndex((x) => distanceM(x.p, hole.tee) <= 40);
  if (start < 0) return [];
  let end = track.length;
  if (nextHole) {
    const k = track.findIndex((x, n) => n > start && distanceM(x.p, nextHole.tee) <= 25 && distanceM(x.p, nextHole.tee) < distanceM(x.p, hole.greenCenter));
    if (k > 0) end = k;
  }
  return track.slice(start, end);
}

// ---- Automatic shot length (feature 012) ----

/**
 * Length of the last shot without tapping anything: from the last place the player stood (a stop in the track,
 * or the last fix before the app went to the background) to where he is now. On the first shot the tee is
 * known anyway. Only places on this hole count; the player must have come ≥ 15 m closer to the green.
 */
/**
 * Where the player really teed off: the last place near the tee (≤ 40 m) where he stood still or opened the app.
 * The tee of the map is a guess (the line cut to the scorecard length of the played tee, up to 14 m off at
 * Hetzenhof); null when the track knows nothing (phone in the pocket on the tee).
 */
export function teeSpot(track: TrackPoint[], hole: HoleMapData): LngLat | null {
  const near = track.filter((x) => x.acc <= DETECT.maxAccuracyM && distanceM(x.p, hole.tee) <= 40);
  if (!near.length) return null;
  // only the last visit to this tee (a tee next to an earlier green is passed before)
  let start = near.length - 1;
  while (start > 0 && near[start].t - near[start - 1].t < 5 * 60000) start--;
  const visit = near.slice(start);
  // on the tee itself (≤ 25 m): not a stop on a green or path nearby
  const onTee = (p: LngLat) => distanceM(p, hole.tee) <= 25;
  const stop = findStops(visit).filter((x) => onTee(x.p)).pop();
  if (stop) return stop.p;
  const open = visit.filter((x) => x.open && onTee(x.p)).pop();
  return open ? open.p : null;
}

export function autoShot(track: TrackPoint[], hole: HoleMapData, now: LngLat): { from: LngLat; length: number; fromTee: boolean } | null {
  const toGreen = (p: LngLat) => distanceM(p, hole.greenCenter);
  if (distToLine(now, hole.line) > DETECT.corridorM || toGreen(now) > toGreen(hole.tee) - 15) return null;
  const all = track.filter((x) => x.acc <= DETECT.maxAccuracyM);
  // Only what happened on this hole: since the player was last on its tee – or, with the phone in the pocket on the
  // tee, since he was last away from the hole (a stop on a neighbouring green must not start this shot).
  let since = -Infinity;
  for (const x of all) if (distanceM(x.p, hole.tee) <= 40) since = x.t;
  if (since === -Infinity) for (const x of all) if (distToLine(x.p, hole.line) > DETECT.corridorM) since = x.t;
  const pts = all.filter((x) => x.t >= since);
  // Anchors: stops, the app opened again (by the ball), and the last fix before a gap of ≥ 30 s (phone put away).
  const anchors: { t: number; p: LngLat }[] = findStops(pts).map((s) => ({ t: s.to, p: s.p }));
  for (const x of pts) if (x.open) anchors.push({ t: x.t, p: x.p });
  for (let k = 0; k + 1 < pts.length; k++) if (pts[k + 1].t - pts[k].t >= 30000) anchors.push({ t: pts[k].t, p: pts[k].p });
  anchors.sort((a, b) => b.t - a.t); // newest first
  const here = (p: LngLat) => distanceM(p, now) < 15;
  const from = anchors.find((a) => !here(a.p) && distToLine(a.p, hole.line) <= DETECT.corridorM && toGreen(a.p) >= toGreen(now) + 15);
  // Nothing recorded on this hole yet: the shot came from the tee (where the player stood on it, if known).
  if (!from || distanceM(from.p, hole.tee) < 25) {
    const tee = teeSpot(all, hole) ?? hole.tee;
    return { from: tee, length: distanceM(tee, now), fromTee: true };
  }
  return { from: from.p, length: distanceM(from.p, now), fromTee: false };
}

// ---- Recording (web prototype: only while the app is open) ----

const KEY = 'golfos.track.v1.';
const MAX_POINTS = 6000; // ~8 h at one fix per 5 s

// The track of the running round stays in memory: reading and parsing the whole stored track on every fix
// (once a second, thousands of points late in the round) costs battery.
type Row = [number, number, number, number] | [number, number, number, number, 1];
let mem: { id: string; raw: Row[]; pts: TrackPoint[] } | null = null;

function cached(roundId: string) {
  if (mem?.id !== roundId) {
    let raw: Row[] = [];
    try {
      raw = JSON.parse(localStorage.getItem(KEY + roundId) ?? '[]');
    } catch {
      raw = [];
    }
    mem = { id: roundId, raw, pts: raw.map(([t, lon, lat, acc, o]): TrackPoint => (o ? { t, p: [lon, lat], acc, open: true } : { t, p: [lon, lat], acc })) };
  }
  return mem;
}

export function loadTrack(roundId: string): TrackPoint[] {
  return cached(roundId).pts;
}

/** Appends a GPS fix when the player moved ≥ 3 m or 5 s passed (compact storage). */
export function recordFix(roundId: string, fix: TrackPoint): void {
  const c = cached(roundId);
  const last = c.raw[c.raw.length - 1];
  // a cached fix handed out again (iOS, after the phone was unlocked) is no new position – and would break the order
  if (last && fix.t <= last[0]) return;
  if (!fix.open && last && fix.t - last[0] < 5000 && distanceM([last[1], last[2]], fix.p) < 3) return;
  const base: [number, number, number, number] = [fix.t, Math.round(fix.p[0] * 1e6) / 1e6, Math.round(fix.p[1] * 1e6) / 1e6, Math.round(fix.acc)];
  const row: Row = fix.open ? [...base, 1] : base;
  // new arrays: callers may hold the old one (e.g. a memo)
  c.raw = [...c.raw, row].slice(-MAX_POINTS);
  const pt: TrackPoint = fix.open ? { t: base[0], p: [base[1], base[2]], acc: base[3], open: true } : { t: base[0], p: [base[1], base[2]], acc: base[3] };
  c.pts = [...c.pts, pt].slice(-MAX_POINTS);
  try {
    localStorage.setItem(KEY + roundId, JSON.stringify(c.raw));
  } catch {
    // storage full – the track is a bonus, the round itself is saved separately
  }
}
