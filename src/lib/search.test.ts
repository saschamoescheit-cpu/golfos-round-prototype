import { describe, expect, it } from 'vitest';
import { bundledCourses, searchBundled } from './courses';

describe('bundled courses are found without the course database', () => {
  it('words in any order, accents and case ignored', () => {
    expect(searchBundled('son antem').map((c) => c.name)).toEqual(['Golf de Son Antem West', 'Golf de Son Antem East']);
    expect(searchBundled('termens').map((c) => c.name)).toEqual(['Golf de Son Térmens']);
    expect(searchBundled('ALCANADA')[0].name).toBe('Club de Golf Alcanada');
    expect(searchBundled('xyz')).toEqual([]);
  });
  // Sascha 16.11.2026 (Orlando): "Legends Golf Clermont" – as Google names it – found nothing
  it('found by the town too: "Legends Golf Clermont" is Legends G&CC, not Orange Lake', () => {
    const r = searchBundled('Legends Golf Clermont');
    expect(r.map((c) => c.id)).toEqual(['osm:relation/4040123']);
    expect(r[0].place).toBe('Clermont, FL, USA');
    expect(searchBundled('legends clermont').map((c) => c.id)).toEqual(['osm:relation/4040123']);
    expect(searchBundled('Legends Golf & Country Club').map((c) => c.id)).toEqual(['osm:relation/4040123']);
    expect(searchBundled('legends').map((c) => c.place).sort()).toEqual(['Clermont, FL, USA', 'Kissimmee, FL, USA']);
    expect(searchBundled('kissimmee').length).toBeGreaterThan(3);
  });
  it('a course mapped twice in OSM is listed once', () => {
    expect(bundledCourses().filter((c) => c.name === 'Golf de Son Antem West')).toHaveLength(1);
  });
  // night run 28./29.10.2026: with Photon down OpenGolfAPI had Hawks Landing at the hotel, the round had no holes
  it('a course with its holes from the scorecard (Hawks Landing) is found too – the OSM id, the box of its holes', () => {
    const [h] = searchBundled('hawks landing');
    expect(h.id).toBe('osm:relation/4053362');
    expect(h.place).toMatch(/Orlando/);
    expect(h.bbox).toBeDefined();
    const [w, s, e, n] = h.bbox!;
    expect(w < h.lon && h.lon < e && s < h.lat && h.lat < n).toBe(true);
  });
});
