import { describe, expect, it } from 'vitest';
import { roundWeather, roundWeatherText, windOnHole, type Weather } from './weather';

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

describe('roundWeather (GOL-26: the weather of a round on its scorecard)', () => {
  const e = (w?: { tempC: number; windKmh: number; windFromDeg: number }) => ({ weather: w }) as never;
  it('averages the holes that have weather and keeps the strongest wind', () => {
    const r = roundWeather([e({ tempC: 15, windKmh: 10, windFromDeg: 270 }), e(), e({ tempC: 18, windKmh: 24, windFromDeg: 250 })]);
    expect(r).toEqual({ tempC: 17, windKmh: 17, maxWindKmh: 24, holes: 2 });
  });
  it('is null without any weather', () => {
    expect(roundWeather([e(), e()])).toBeNull();
    expect(roundWeatherText([e()])).toBeNull();
  });
  it('names the strongest wind only when it was clearly stronger', () => {
    expect(roundWeatherText([e({ tempC: 12, windKmh: 10, windFromDeg: 0 }), e({ tempC: 12, windKmh: 12, windFromDeg: 0 })])).toMatch(/11 km\/h$/);
    expect(roundWeatherText([e({ tempC: 12, windKmh: 8, windFromDeg: 0 }), e({ tempC: 12, windKmh: 30, windFromDeg: 0 })])).toMatch(/19 km\/h \((up to|bis) 30\)$/);
  });
});
