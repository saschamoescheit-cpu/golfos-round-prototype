import type { LngLat, Ring } from '../types';
import type { TrackPoint } from './track';
import { distanceM, distToLine, pointInRing } from './geo';

// Where the player walked on the green (Sascha 16.10.2026: "the app should record the GPS walk so that when editing
// afterwards you can see where you were on the green"): from the round's GPS track, the visit to this green – the
// longest stay within a few metres of it – and the spots where he stood still (where a ball probably lay).

export interface GreenWalk {
  path: LngLat[];
  stops: LngLat[];
}

export function greenWalk(track0: TrackPoint[], green: Ring | null, center: LngLat, margin = 6): GreenWalk | null {
  // milliseconds (some browsers hand out GPS times in microseconds)
  const track = track0.map((x) => (x.t > 1e14 ? { ...x, t: x.t / 1000 } : x));
  const near = (p: LngLat) => (green ? pointInRing(p, green) || distToLine(p, green) <= margin : distanceM(p, center) <= 20);
  // the runs of fixes near the green (a gap of more than 2 minutes ends a run)
  const runs: TrackPoint[][] = [];
  let run: TrackPoint[] = [];
  for (const t of track) {
    const ok = near(t.p) && t.acc <= 15;
    if (ok && run.length && t.t - run[run.length - 1].t > 120_000) {
      runs.push(run);
      run = [];
    }
    if (ok) run.push(t);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  // the visit: the longest stay (passing by on the next tee is short)
  const visit = runs.sort((a, b) => b[b.length - 1].t - b[0].t - (a[a.length - 1].t - a[0].t))[0];
  if (!visit || visit.length < 2) return null;
  // standing still: fixes within 2.5 m of each other for at least 12 s → one spot (their middle)
  const stops: LngLat[] = [];
  let i = 0;
  while (i < visit.length) {
    let j = i;
    while (j + 1 < visit.length && distanceM(visit[i].p, visit[j + 1].p) <= 2.5) j++;
    if (visit[j].t - visit[i].t >= 12_000) {
      const pts = visit.slice(i, j + 1).map((x) => x.p);
      stops.push([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]);
      i = j + 1;
    } else i++;
  }
  return { path: visit.map((x) => x.p), stops };
}
