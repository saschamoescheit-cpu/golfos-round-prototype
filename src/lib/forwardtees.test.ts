import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { alongLine, centroid, distanceM, holeMapData, lineLength, pointInRing } from './geo';
import { parseHoleRef } from './loops';
import { holeForTee } from './teeline';

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

  // the round from the yellow tee starts on the yellow tee box (Sascha 28.10.2026: moved along the line, the tee stood
  // 48 m beside it); a tee point moved along the line that already lies on a box stays (6A blue)
  it('4B Hetzenhof from yellow and red: the line starts on that tee box', () => {
    const d = holeMapData(het, 'B', 4)!;
    const boxes = d.tees.map((r) => ({ r, a: alongLine(d.line, centroid(r)) })).sort((x, y) => x.a - y.a);
    for (const [tee, box] of [['Yellow', boxes[1].r], ['Red', boxes[2].r]] as const) {
      const h = holeForTee(d, 'osm:relation/1326323', '4B', tee, het.tee)!;
      expect(distanceM(h.tee, centroid(box))).toBeLessThan(1);
      expect(Math.abs(lineLength(h.line) - (tee === 'Yellow' ? 497 : 413))).toBeLessThan(25);
    }
    const a6 = holeMapData(het, 'A', 6)!;
    const blue = holeForTee(a6, 'osm:relation/1326323', '6A', 'Blue', het.tee)!;
    expect(a6.tees.some((r) => pointInRing(blue.tee, r))).toBe(true);
    expect(Math.abs(lineLength(blue.line) - 116)).toBeLessThan(5);
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
