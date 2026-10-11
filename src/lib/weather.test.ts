import { describe, expect, it } from 'vitest';
import { windOnHole, type Weather } from './weather';

const w = (windFromDeg: number, windKmh = 20): Weather => ({ tempC: 20, windKmh, gustKmh: 30, windFromDeg, code: 0, at: '' });

describe('wind relative to the hole', () => {
  it('hole to the north: wind from the north is into the wind, from the south downwind', () => {
    expect(windOnHole(w(0), 0)).toMatchObject({ headKmh: 20, crossKmh: 0, label: 'Into the wind' });
    expect(windOnHole(w(180), 0)).toMatchObject({ headKmh: -20, label: 'Downwind' });
  });
  it('wind from the east on a hole to the north comes from the right', () => {
    expect(windOnHole(w(90), 0)).toMatchObject({ crossKmh: 20, label: 'Wind from the right' });
    expect(windOnHole(w(270), 0)).toMatchObject({ crossKmh: -20, label: 'Wind from the left' });
  });
  it('turns with the hole: hole to the east, wind from the east is into the wind', () => {
    expect(windOnHole(w(90), 90).label).toBe('Into the wind');
  });
  it('light wind is calm', () => {
    expect(windOnHole(w(90, 3), 0).label).toBe('Calm');
  });
});
