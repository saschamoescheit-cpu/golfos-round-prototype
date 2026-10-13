import type { Club, DetailEntry, LngLat, Shot } from '../types';
import { distanceM, distToLine, type HoleMapData } from './geo';
import { BAG, lieAt, onGreenAt, suggestKind } from './shots';

// Shot detection from the GPS track (features 004/007). A golfer walks to the ball, stands there while
// choosing the club and hitting, then walks on towards the green. "Stand still, then move on towards the
// green" is the signal for a shot. The web app can only record while it is open; a native app records in
// the background (feature 004) – the detection is the same.

export interface TrackPoint {
  t: number; // ms
  p: LngLat;
  acc: number; // GPS accuracy in metres
}

/** Tunable values (feature 004, Akzeptanzkriterien – to be calibrated with real rounds). */
export const DETECT = {
  maxAccuracyM: 15, // ignore worse fixes
  stopRadiusM: 6, // standing still = all fixes within this radius
  minStopS: 8,
  maxStopS: 180, // longer = waiting, not a shot (except on the tee)
  minProgressM: 15, // after a shot the player gets closer to the green by at least this
  mergeM: 10, // stops closer than this are one shot (practice swing, back to the bag)
  corridorM: 60, // stops further from the hole line do not belong to this hole
};

export interface Stop {
  p: LngLat;
  from: number;
  to: number;
}

/** Stops in a track: windows where all fixes stay within the stop radius for at least the minimum time. */
export function findStops(track: TrackPoint[]): Stop[] {
  const pts = track.filter((x) => x.acc <= DETECT.maxAccuracyM);
  const stops: Stop[] = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    const anchor = pts[i].p;
    while (j + 1 < pts.length && distanceM(anchor, pts[j + 1].p) <= DETECT.stopRadiusM) j++;
    const dur = (pts[j].t - pts[i].t) / 1000;
    if (dur >= DETECT.minStopS) {
      const window = pts.slice(i, j + 1);
      const p: LngLat = [window.reduce((s, x) => s + x.p[0], 0) / window.length, window.reduce((s, x) => s + x.p[1], 0) / window.length];
      stops.push({ p, from: pts[i].t, to: pts[j].t });
      i = j + 1;
    } else i++;
  }
  return stops;
}

/** Club whose typical distance fits the shot length best (driver only for long tee shots). */
export function clubForLength(lengthM: number, isTeeShot: boolean, bag = BAG): Club {
  const options = bag.filter((b) => b.club !== 'Dr' || isTeeShot);
  return options.reduce((best, b) => (Math.abs(b.m - lengthM) < Math.abs(best.m - lengthM) ? b : best)).club;
}

/**
 * Detects the shots of one hole from the part of the track played on it. Every shot is marked "review",
 * the player confirms or corrects them after the round.
 */
export function detectHoleShots(track: TrackPoint[], hole: HoleMapData, par: number, bag = BAG): DetailEntry | null {
  const toGreen = (p: LngLat) => distanceM(p, hole.greenCenter);
  let stops = findStops(track).filter((s) => distToLine(s.p, hole.line) <= DETECT.corridorM);
  // The tee: the last stop near the tee (waiting for the group in front does not matter there).
  const teeStops = stops.filter((s) => distanceM(s.p, hole.tee) <= 40);
  const tee = teeStops[teeStops.length - 1];
  if (tee) stops = stops.filter((s) => s.from >= tee.from);
  // Shots on the way: not too long, and the player moves on towards the green afterwards.
  // Putting: a stop on the green, or a long stop right next to it (GPS error near the edge).
  const onGreen = stops.find((s) => onGreenAt(s.p, hole) || (toGreen(s.p) <= 20 && (s.to - s.from) / 1000 >= 40));
  const fairway = stops.filter((s) => s !== tee && s !== onGreen && !onGreenAt(s.p, hole) && (!onGreen || s.from < onGreen.from) && (s.to - s.from) / 1000 <= DETECT.maxStopS);
  const progress = fairway.filter((s) => {
    const after = track.filter((x) => x.t > s.to && x.acc <= DETECT.maxAccuracyM);
    const later = after.find((x) => distanceM(x.p, s.p) > 25);
    return later ? toGreen(s.p) - toGreen(later.p) >= DETECT.minProgressM : true;
  });
  // Merge stops that are close to each other.
  const merged: Stop[] = [];
  for (const s of [...(tee ? [tee] : []), ...progress]) {
    const last = merged[merged.length - 1];
    if (last && distanceM(last.p, s.p) <= DETECT.mergeM) last.to = s.to;
    else merged.push({ ...s });
  }
  if (merged.length === 0) return null;
  const end = onGreen?.p ?? null;
  const shots: Shot[] = merged.map((s, k) => {
    const next = k + 1 < merged.length ? merged[k + 1].p : end;
    const length = next ? distanceM(s.p, next) : toGreen(s.p);
    const lie = lieAt(s.p, hole, k === 0 && tee != null);
    const kind = suggestKind(lie, toGreen(s.p));
    const club = kind === 'chip' || kind === 'pitch' || kind === 'bunker' ? clubForLength(Math.max(length, 50), false, bag) : clubForLength(length, k === 0 && par >= 4, bag);
    return { pos: s.p, lie, club, penalty: false, kind, review: true };
  });
  return { shots, onGreen: end, pin: null, holedOut: false };
}

/** Part of the round's track that belongs to a hole: from arriving at its tee until arriving at the next tee. */
export function trackForHole(track: TrackPoint[], hole: HoleMapData, nextHole: HoleMapData | null): TrackPoint[] {
  const start = track.findIndex((x) => distanceM(x.p, hole.tee) <= 40);
  if (start < 0) return [];
  let end = track.length;
  if (nextHole) {
    const k = track.findIndex((x, n) => n > start && distanceM(x.p, nextHole.tee) <= 25 && distanceM(x.p, hole.greenCenter) > 30);
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
export function autoShot(track: TrackPoint[], hole: HoleMapData, now: LngLat): { from: LngLat; length: number; fromTee: boolean } | null {
  const toGreen = (p: LngLat) => distanceM(p, hole.greenCenter);
  if (distToLine(now, hole.line) > DETECT.corridorM || toGreen(now) > toGreen(hole.tee) - 15) return null;
  const pts = track.filter((x) => x.acc <= DETECT.maxAccuracyM);
  // Anchors: stops, and the last fix before a gap of ≥ 30 s (phone put away).
  const anchors: { t: number; p: LngLat }[] = findStops(pts).map((s) => ({ t: s.to, p: s.p }));
  for (let k = 0; k + 1 < pts.length; k++) if (pts[k + 1].t - pts[k].t >= 30000) anchors.push({ t: pts[k].t, p: pts[k].p });
  anchors.sort((a, b) => b.t - a.t); // newest first
  const here = (p: LngLat) => distanceM(p, now) < 15;
  const from = anchors.find((a) => !here(a.p) && distToLine(a.p, hole.line) <= DETECT.corridorM && toGreen(a.p) >= toGreen(now) + 15);
  // Nothing recorded on this hole yet: the shot came from the tee.
  if (!from || distanceM(from.p, hole.tee) < 25) return { from: hole.tee, length: distanceM(hole.tee, now), fromTee: true };
  return { from: from.p, length: distanceM(from.p, now), fromTee: false };
}

// ---- Recording (web prototype: only while the app is open) ----

const KEY = 'golfos.track.v1.';
const MAX_POINTS = 6000; // ~8 h at one fix per 5 s

// The track of the running round stays in memory: reading and parsing the whole stored track on every fix
// (once a second, thousands of points late in the round) costs battery.
let mem: { id: string; raw: [number, number, number, number][]; pts: TrackPoint[] } | null = null;

function cached(roundId: string) {
  if (mem?.id !== roundId) {
    let raw: [number, number, number, number][] = [];
    try {
      raw = JSON.parse(localStorage.getItem(KEY + roundId) ?? '[]');
    } catch {
      raw = [];
    }
    mem = { id: roundId, raw, pts: raw.map(([t, lon, lat, acc]): TrackPoint => ({ t, p: [lon, lat], acc })) };
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
  if (last && fix.t - last[0] < 5000 && distanceM([last[1], last[2]], fix.p) < 3) return;
  const row: [number, number, number, number] = [fix.t, Math.round(fix.p[0] * 1e6) / 1e6, Math.round(fix.p[1] * 1e6) / 1e6, Math.round(fix.acc)];
  // new arrays: callers may hold the old one (e.g. a memo)
  c.raw = [...c.raw, row].slice(-MAX_POINTS);
  const pt: TrackPoint = { t: row[0], p: [row[1], row[2]], acc: row[3] };
  c.pts = [...c.pts, pt].slice(-MAX_POINTS);
  try {
    localStorage.setItem(KEY + roundId, JSON.stringify(c.raw));
  } catch {
    // storage full – the track is a bonus, the round itself is saved separately
  }
}
