import { describe, expect, it } from 'vitest';
import { paintedGreen } from './greenpaint';
import { ringArea } from './geo';
import type { LngLat } from '../types';

// Sascha 16.11.2026, Hawks Landing 2: "mit dem Finger um das Grün malen, um das Grün festzusetzen"
const M = 1 / 111195;
const at = (east: number, north: number): LngLat => [-81.5 + (east * M) / Math.cos((28.36 * Math.PI) / 180), 28.36 + north * M];
const round = (rx: number, ry: number, to = Math.PI * 2, step = 0.05): LngLat[] => {
  const pts: LngLat[] = [];
  for (let a = 0; a <= to + 1e-9; a += step) pts.push(at(rx * Math.cos(a), ry * Math.sin(a)));
  return pts;
};

describe('a green drawn round with the finger', () => {
  it('once round: a closed ring of about the drawn size', () => {
    const r = paintedGreen(round(15, 10))!;
    expect(r).not.toBeNull();
    expect(r[0]).toEqual(r[r.length - 1]);
    const area = ringArea(r);
    expect(area).toBeGreaterThan(Math.PI * 15 * 10 * 0.85);
    expect(area).toBeLessThan(Math.PI * 15 * 10 * 1.05);
  });
  it('not closed, a tap, a scribble or a whole fairway: nothing', () => {
    expect(paintedGreen(round(15, 10, Math.PI))).toBeNull(); // half way round
    expect(paintedGreen([at(0, 0), at(1, 0)])).toBeNull();
    expect(paintedGreen(round(4, 3))).toBeNull(); // 38 m² – no green
    expect(paintedGreen(round(80, 40, Math.PI * 2, 0.02))).toBeNull(); // 10 000 m²
  });
});
