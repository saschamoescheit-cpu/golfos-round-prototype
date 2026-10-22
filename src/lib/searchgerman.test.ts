import { describe, expect, it } from 'vitest';
import { searchGerman } from './courses';

// every German course in the app (Sascha 22.10.2026): found without the search service
describe('the German courses in the app', () => {
  it('by name', async () => {
    const r = await searchGerman('Hetzenhof');
    expect(r.map((c) => c.id)).toContain('osm:relation/1326323');
    expect(r[0].bbox).toHaveLength(4);
    expect(r[0].place).toBe('Baden-Württemberg');
  });
  it('words like "Golfclub" and the dash do not stand in the way', async () => {
    const r = await searchGerman('Golfclub München-Riem');
    expect(r.some((c) => /München Riem/.test(c.name))).toBe(true);
  });
  it('the beginning of a word is enough, case and accents do not matter', async () => {
    expect((await searchGerman('frieling')).some((c) => /Frielinghausen/.test(c.name))).toBe(true);
    expect((await searchGerman('MUNCHEN eichen')).some((c) => /Eichenried/.test(c.name))).toBe(true);
  });
  it('too short or nothing telling: nothing', async () => {
    expect(await searchGerman('go')).toEqual([]);
  });
});
