import { describe, expect, it } from 'vitest';
import { demProvidersAt, fromUtm, staticProvider, toUtm, unpackCm, type StaticCourse } from './dem';

// packed as lidar/de_static.py does: differences cell to cell, int16, zlib, base64
async function pack(values: number[]): Promise<string> {
  const d = new Int16Array(values.length);
  values.forEach((v, k) => (d[k] = v - (k ? values[k - 1] : 0)));
  const z = new Uint8Array(await new Response(new Blob([d.buffer]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return btoa(String.fromCharCode(...z));
}

describe('terrain models for every course (19.10.2026)', () => {
  it('UTM there and back to a centimetre', () => {
    for (const [p, zone] of [[[7.2359, 51.3147], 32], [[13.98, 52.6], 33], [[-81.4, 28.4], 17]] as const) {
      const [e, n] = toUtm(p as [number, number], zone);
      const q = fromUtm(e, n, zone);
      expect(Math.abs(q[0] - p[0]) * 70000).toBeLessThan(0.02);
      expect(Math.abs(q[1] - p[1]) * 111320).toBeLessThan(0.02);
    }
  });
  it('the services of a place: the state’s own, by a border also the neighbour’s', () => {
    expect(demProvidersAt([7.2359, 51.3147]).map((d) => d.id)).toEqual(['nrw', 'ni']); // Frielinghausen: NRW first, Lower Saxony's box reaches down here
    expect(demProvidersAt([9.73, 48.83]).map((d) => d.id)).toEqual(['bw']); // Hetzenhof
    expect(demProvidersAt([8.68, 50.11]).map((d) => d.id)).toEqual(['he']); // Frankfurt
    expect(demProvidersAt([11.2, 48.3])).toEqual([]); // Bavaria: shipped with the app
    expect(demProvidersAt([2.6, 39.6])).toEqual([]); // Mallorca: built in
    expect(demProvidersAt([-81.4, 28.4]).map((d) => d.id)).toEqual(['usgs']);
  });
  it('unpacks the shipped heights exactly', async () => {
    const v = [0, 3, 7, 12, 10, 9, 400, 398, -1, 25000, 24990];
    expect(Array.from(await unpackCm(await pack(v)))).toEqual(v);
  });
  it('answers a green’s square from inside a shipped one, north row first', async () => {
    // a 6 × 6 square at w = 1000, s = 2000: height = 100 m + column cm + 10 cm per row from the north
    const size = 6;
    const cm = Array.from({ length: size * size }, (_, k) => (k % size) + 10 * Math.floor(k / size));
    const c: StaticCourse = { course: 'osm:way/1', credit: 'x', zone: 32, squares: [{ w: 1000, s: 2000, size, base: 100, cm: await pack(cm) }], terrain: null };
    const d = await staticProvider(c);
    const q = d.local!(1002, 2001, 1005, 2004)!; // columns 2–4, rows 2–4 from the north (north edge 2004 → 2 rows below 2006)
    expect(q.size).toBe(3);
    expect(Array.from(q.h).map((x) => Math.round((x - 100) * 100))).toEqual([22, 23, 24, 32, 33, 34, 42, 43, 44]);
    expect(d.local!(990, 2001, 993, 2004)).toBeNull(); // outside: nothing
  });
});
