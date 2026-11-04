import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { holeMapData, pointAt, lineLength } from './geo';
import { holeForTee } from './teeline';
import { teeQuestion } from './teecheck';

const HET = 'osm:relation/1326323';

describe('teecheck: the first shot from another tee (Sascha 04.11.2026, Hetzenhof 2B from red)', () => {
  const geo = SEED_GEOMETRY[HET];
  const base = holeMapData(geo, 'B', 2)!;
  const at = (tee: string) => holeForTee(base, HET, '2B', tee, geo.tee)!.tee;
  it('from the chosen tee: no question', () => {
    expect(teeQuestion(at('Yellow'), base, HET, '2B', 'Yellow', geo.tee)).toBeNull();
  });
  it('from the red tee with yellow chosen: asks for red', () => {
    const q = teeQuestion(at('Red'), base, HET, '2B', 'Yellow', geo.tee)!;
    expect(q.other).toBe('Red');
    expect(q.off).toBeGreaterThan(40);
  });
  it('ahead of the tee but on no other: asks without a tee (a drop?)', () => {
    const p = pointAt(base.line, lineLength(base.line) * 0.5);
    const q = teeQuestion(p, base, HET, '2B', 'Yellow', geo.tee)!;
    expect(q.other).toBeNull();
  });
  it('nothing told: no question', () => {
    expect(teeQuestion(null, base, HET, '2B', 'Yellow', geo.tee)).toBeNull();
    expect(teeQuestion(at('Red'), base, HET, '2B', null, geo.tee)).toBeNull();
    expect(teeQuestion(at('Red'), base, 'osm:nowhere', '2B', 'Yellow', geo.tee)).toBeNull();
  });
});
