import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sascha 13.11.2026: "Baue OpenGolf API ein" – course rating and slope of a US course the app does not bring along, from
// OpenGolfAPI's tee sets (fetched in the background, kept on the phone); a bundled course keeps its checked values.
const TEES = {
  tees: [
    { name: 'Gold', gender: 'Male', course_rating: 72.6, slope: 137, yardage: 6741 },
    { name: 'Blue', gender: 'Male', course_rating: 70.3, slope: 132, yardage: 6241 },
    { name: 'Red', gender: 'Female', course_rating: 71.8, slope: 124, yardage: 5326 },
    { name: 'Silver/Green', gender: 'Male', course_rating: 65.3, slope: 108, yardage: 4085 },
    { name: 'Broken', gender: 'Male', course_rating: 0, slope: 0 },
  ],
};
const course = { id: 'osm:way/999', name: 'Lakeside Golf Club', lat: 28.1, lon: -81.5 };

describe('course ratings from OpenGolfAPI', () => {
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
    globalThis.window = Object.assign(globalThis.window ?? {}, { dispatchEvent: () => true }) as unknown as Window & typeof globalThis;
    vi.restoreAllMocks();
  });
  const api = () =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/search')) return new Response(JSON.stringify({ courses: [{ id: 'far', course_name: 'Lakeside Golf', lat: 29.5, lng: -81.5 }, { id: 'abc', course_name: 'Lakeside Golf Club', lat: 28.101, lng: -81.501 }] }));
      if (u.endsWith('/abc')) return new Response(JSON.stringify(TEES));
      return new Response('{}', { status: 404 });
    });
  it('an OSM course in the USA: its entry by name nearest to it (not the one 150 km away), its tees kept', async () => {
    const f = api();
    const { ensureOgaRatings, ogaRating } = await import('./ogaratings');
    await ensureOgaRatings(course);
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/abc'))).toBe(true);
    expect(ogaRating(course.id, 'Blue')).toEqual({ cr: 70.3, slope: 132, source: 'opengolfapi' });
    expect(ogaRating(course.id, 'silver')?.cr).toBe(65.3); // "Silver/Green" as silver
    expect(ogaRating(course.id, 'Red')).toBeNull(); // a man never from a women's tee
    expect(ogaRating(course.id, 'Red', true)?.cr).toBe(71.8);
    expect(ogaRating(course.id, 'Gold', true)).toBeNull(); // a woman never from a men's tee
    expect(ogaRating(course.id, 'Broken')).toBeNull(); // implausible values left out
  });
  it('ratingFor: the player\'s own, then bundled, then OpenGolfAPI', async () => {
    api();
    const { ensureOgaRatings } = await import('./ogaratings');
    const { ratingFor } = await import('./handicap');
    await ensureOgaRatings(course);
    expect(ratingFor(course.id, 'Gold', [{ loop: 'Main' }])).toMatchObject({ cr: 72.6, slope: 137, source: 'opengolfapi' });
    // a bundled course keeps its own (StoneGate Oaks, checked) – OpenGolfAPI is not even asked for it by loadCourse
    expect(ratingFor('osm:relation/4039063', 'Blue', [{ loop: 'Main' }])).toEqual({ cr: 70.0, slope: 123 });
  });
  it('outside the USA, or offline: nothing asked, nothing kept', async () => {
    const f = api();
    const { ensureOgaRatings, ogaRating } = await import('./ogaratings');
    await ensureOgaRatings({ ...course, id: 'osm:way/1', lat: 48.8, lon: 9.7 });
    expect(f).not.toHaveBeenCalled();
    f.mockRejectedValue(new Error('offline'));
    await ensureOgaRatings({ ...course, id: 'osm:way/2' });
    expect(ogaRating('osm:way/2', 'Blue')).toBeNull();
  });
});

describe('the tees of a course from OpenGolfAPI', () => {
  it('longest first, colours by the app\'s names, the course\'s own words kept – and their ratings found by them', async () => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
    store.set('golfos.ogatees.v1.osm:way/7', JSON.stringify({ at: Date.now(), oga: 'x', tees: [
      { name: 'Member', lady: false, cr: 68.1, slope: 120, yards: 6010 },
      { name: 'Championship', lady: false, cr: 70.2, slope: 126, yards: 6522 },
      { name: 'Silver/Green', lady: false, cr: 65.3, slope: 108, yards: 4085 },
      { name: 'Forward', lady: true, cr: 69.0, slope: 119, yards: 5100 },
    ] }));
    const { ogaTees, ogaRating } = await import('./ogaratings');
    const { courseTees } = await import('../data/tees');
    expect(ogaTees('osm:way/7')).toEqual(['Championship', 'Member', 'Forward', 'Silver']);
    expect(courseTees('osm:way/7', ['Red'], ogaTees('osm:way/7'))).toEqual({ tees: ['Championship', 'Member', 'Forward', 'Silver'], known: true });
    expect(ogaRating('osm:way/7', 'Championship')).toMatchObject({ cr: 70.2, slope: 126 });
    expect(ogaRating('osm:way/7', 'Silver')).toMatchObject({ cr: 65.3 });
    expect(ogaRating('osm:way/7', 'Forward', true)).toMatchObject({ cr: 69.0 });
    expect(courseTees('osm:relation/4039888', [], ['Championship']).tees).toEqual(['Teal', 'White', 'Yellow']); // bundled first
  });
});
