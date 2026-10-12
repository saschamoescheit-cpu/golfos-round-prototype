import { describe, expect, it } from 'vitest';
import { bundledCourses, searchBundled } from './courses';

describe('bundled courses are found without the course database', () => {
  it('words in any order, accents and case ignored', () => {
    expect(searchBundled('son antem').map((c) => c.name)).toEqual(['Golf de Son Antem West', 'Golf de Son Antem East']);
    expect(searchBundled('termens').map((c) => c.name)).toEqual(['Golf de Son Térmens']);
    expect(searchBundled('ALCANADA')[0].name).toBe('Club de Golf Alcanada');
    expect(searchBundled('xyz')).toEqual([]);
  });
  it('a course mapped twice in OSM is listed once', () => {
    expect(bundledCourses().filter((c) => c.name === 'Golf de Son Antem West')).toHaveLength(1);
  });
});
