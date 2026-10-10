import { describe, expect, it } from 'vitest';
import { holeTileUrls } from './prefetch';
import { holeMapData } from './geo';
import { IMAGERY } from './imagery';
import { SEED_GEOMETRY } from '../data/seedGeometry';

describe('offline tiles for a round', () => {
  const geo = SEED_GEOMETRY['osm:relation/1654444'];
  const holes = Array.from({ length: 18 }, (_, k) => holeMapData(geo, 'Main', k + 1)!);
  it('covers all 18 Son Quint holes with a reasonable number of tiles', () => {
    const urls = holeTileUrls(IMAGERY.pnoa, holes);
    expect(urls.length).toBeGreaterThan(100); // Son Quint: ~210 tiles ≈ 3 MB
    expect(urls.length).toBeLessThan(2500); // fits the service worker cache (5000 tiles)
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('flips y for TMS sources (PNOA) and keeps it for XYZ (Esri)', () => {
    const one = [holes[0]];
    const pnoa = holeTileUrls(IMAGERY.pnoa, one).find((u) => u.includes('/18/'))!;
    const esri = holeTileUrls(IMAGERY.esri, one).find((u) => u.includes('/tile/18/'))!;
    const [, x, tmsY] = pnoa.match(/\/18\/(\d+)\/(\d+)\.jpeg$/)!.map(Number);
    const [, y, ex] = esri.match(/\/tile\/18\/(\d+)\/(\d+)$/)!.map(Number);
    expect(x).toBeGreaterThan(0);
    expect(ex).toBeGreaterThan(0);
    expect(2 ** 18 - 1 - tmsY).toBeGreaterThan(y - 20);
    expect(2 ** 18 - 1 - tmsY).toBeLessThan(y + 20);
  });
});
