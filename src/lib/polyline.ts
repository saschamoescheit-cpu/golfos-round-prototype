import type { CourseGeometry, LngLat } from '../types';

// Packed course geometry (night run 15./16.10.2026): tree crowns and the fairways from the aerial image are stored as
// encoded polylines (Google's algorithm, 1e-6 degrees, lon before lat) – a fraction of the size of plain
// coordinates. Written by scripts/packgeo.py, unpacked here when a course is loaded.

export function decodeRing(s: string): LngLat[] {
  const pts: LngLat[] = [];
  let i = 0;
  let lon = 0;
  let lat = 0;
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let b: number;
      let shift = 0;
      let res = 0;
      do {
        b = s.charCodeAt(i++) - 63;
        res |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lon += d;
      else lat += d;
    }
    pts.push([lon / 1e6, lat / 1e6]);
  }
  return pts;
}

type Packed = CourseGeometry & { enc?: { canopy?: string[]; fairwayAuto?: Record<string, string[]> } };

/** The geometry as the app uses it: packed parts decoded (once per course). */
export function unpackGeometry(g: Packed): CourseGeometry {
  if (!g.enc) return g;
  const { enc, ...rest } = g;
  return {
    ...rest,
    ...(enc.canopy ? { canopy: enc.canopy.map(decodeRing) } : {}),
    ...(enc.fairwayAuto ? { fairwayAuto: Object.fromEntries(Object.entries(enc.fairwayAuto).map(([k, v]) => [k, v.map(decodeRing)])) } : {}),
  };
}
