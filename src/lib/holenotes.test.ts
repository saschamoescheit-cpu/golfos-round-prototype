import { beforeEach, describe, expect, it } from 'vitest';
import { loadHoleNotes, saveHoleNote } from './holenotes';

// Sascha 22.10.2026: "hole notes not for one played round, but for the course, with its combinations of holes"
const course = (id: string, name: string, lat: number, lon: number) =>
  localStorage.setItem('golfos.course.v1.' + id, JSON.stringify({ id, name, lat, lon, holes: [] }));

describe('hole notes belong to the course', () => {
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
  it('by the hole label: 8C in "C" and in "B + C"', () => {
    saveHoleNote('osm:relation/1', '8C', { text: 'Wasser vorm Grün' });
    expect(loadHoleNotes('osm:relation/1')['8C'].text).toBe('Wasser vorm Grün');
  });
  it('the same course under another id: the same name close by', () => {
    course('osm:way/5', 'Golfanlage Gut Frielinghausen', 51.3147, 7.2351);
    course('osm:relation/9', 'Golfanlage Gut Frielinghausen', 51.3150, 7.2360);
    saveHoleNote('osm:way/5', '3', { text: 'blind' });
    expect(loadHoleNotes('osm:relation/9')['3']?.text).toBe('blind');
  });
  it('another course of the same resort stays apart', () => {
    course('osm:way/1', 'Son Antem East', 39.52, 2.80);
    course('osm:way/2', 'Son Antem West', 39.521, 2.801);
    saveHoleNote('osm:way/1', '10', { text: 'east' });
    expect(loadHoleNotes('osm:way/2')['10']?.text).toBeUndefined();
  });
});
