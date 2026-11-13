import { beforeEach, describe, expect, it } from 'vitest';
import type { LngLat } from '../types';

// Gate 13.11.2026 (sharelines): a hole marked anew on another phone of the flight must reach the others also where the
// course map has the hole (help: "es geht an alle auf dem Platz"); "Platzkarte verwenden" refuses that very line, a newer
// correction comes through again; the others' lines on the course (golfos_course_lines) only fill holes the map lacks.
const course = 'osm:relation/1326323'; // Hetzenhof – bundled, every hole mapped
const L3: LngLat[] = [[8.9481, 48.9612], [8.9502, 48.9631]];
const L3b: LngLat[] = [[8.9485, 48.9615], [8.9502, 48.9631]];

describe('the flight\'s lines over the course map', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  });
  const hole3 = async () => {
    const S = await import('./storage');
    await S.ensureGeometry(course); // the bundled map, as a screen loads it
    return S.loadGeometry(course).holes.find((h) => h.ref === '3A');
  };
  it('a flight line of 3A wins over the map, with the map\'s par kept', async () => {
    const { keepFlightLines } = await import('./courselines');
    const before = await hole3();
    expect(before?.line?.length).toBeGreaterThan(1); // the map has 3A
    expect(before?.line?.[0]).not.toEqual(L3[0]);
    keepFlightLines(course, { 'A#3': L3 });
    const h = await hole3();
    expect(h?.line?.[0]).toEqual(L3[0]);
    expect(h?.par).toBe(before?.par);
  });
  it('"Platzkarte verwenden": the map again, also after the flight sends the same line; a newer one comes through', async () => {
    const { keepFlightLines } = await import('./courselines');
    const S = await import('./storage');
    const mapTee = (await hole3())?.line?.[0];
    keepFlightLines(course, { 'A#3': L3 });
    expect(S.hasOwnHoleLine(course, 'A', 3)).toBe(true); // the button is offered
    S.removeHoleLine(course, 'A', 3);
    expect((await hole3())?.line?.[0]).toEqual(mapTee);
    expect(S.hasOwnHoleLine(course, 'A', 3)).toBe(false);
    keepFlightLines(course, { 'A#3': L3, 'A#4': L3 }); // the same 3A again (with another hole)
    expect((await hole3())?.line?.[0]).toEqual(mapTee);
    keepFlightLines(course, { 'A#3': L3b }); // marked anew
    expect((await hole3())?.line?.[0]).toEqual(L3b[0]);
  });
  it('the others\' lines on the course never over a mapped hole', async () => {
    localStorage.setItem('golfos.communitylines.v1.' + course, JSON.stringify({ 'A#3': L3 }));
    expect((await hole3())?.line?.[0]).not.toEqual(L3[0]);
  });
});
