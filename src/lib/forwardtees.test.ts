import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { alongLine, centroid, distanceM, holeMapData } from './geo';
import { parseHoleRef } from './loops';

// Sascha 28.10.2026 (4B Hetzenhof, a photo from the round): "no tee drawn" – the hole line starts at the back tee and
// only tees within 60 m of it were on the map; yellow lies 105 m ahead beside the line, red 176 m.
describe('the forward tees of a hole on the map', () => {
  const het = SEED_GEOMETRY['osm:relation/1326323'];

  it('4B Hetzenhof: the back, the yellow/blue and the red tee', () => {
    const d = holeMapData(het, 'B', 4)!;
    const along = d.tees.map((r) => Math.round(alongLine(d.line, centroid(r)))).sort((a, b) => a - b);
    expect(along.length).toBe(3);
    expect(along[0]).toBeLessThan(10);
    expect(along[1]).toBeGreaterThan(90);
    expect(along[2]).toBeGreaterThan(160);
  });

  it('every built-in course: no hole shows the tee another hole starts from', () => {
    const wrong: string[] = [];
    for (const [id, geo] of Object.entries(SEED_GEOMETRY)) {
      for (const h of geo.holes) {
        const p = parseHoleRef(h.ref);
        const d = p && holeMapData(geo, p.loop, p.number);
        if (!d) continue;
        const starts = geo.holes.filter((o) => o !== h && o.line.length >= 2).map((o) => o.line[0]);
        for (const r of d.tees) {
          const own = r.some((q) => distanceM(q, d.line[0]) <= 60);
          if (!own && starts.some((s) => r.some((q) => distanceM(q, s) <= 15))) wrong.push(`${id} ${h.ref}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
