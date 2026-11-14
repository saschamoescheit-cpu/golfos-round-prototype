import { describe, expect, it } from 'vitest';
import { LADY_RATINGS, RATINGS } from './ratings';
import { TEES } from './tees';
import { SEED_COURSES } from './seedCourses';
import { CARD_COURSES } from './cards';

describe('course ratings of the bundled courses', () => {
  it('every rated tee is a tee of our tee data (a rating only where the lengths were compared)', () => {
    for (const [course, tees] of Object.entries(RATINGS)) {
      const known = TEES[course]?.tees;
      if (!known) continue;
      for (const key of Object.keys(tees)) expect(known, `${course} ${key}`).toContain(key.split('@')[0]);
    }
  });
  it('believable values: course rating 55–80, slope 55–155', () => {
    for (const tees of Object.values(RATINGS))
      for (const r of Object.values(tees)) {
        expect(r.cr).toBeGreaterThan(55);
        expect(r.cr).toBeLessThan(80);
        expect(r.slope).toBeGreaterThanOrEqual(55);
        expect(r.slope).toBeLessThanOrEqual(155);
      }
  });
  it('Southern Dunes from the scorecard (men)', () => {
    expect(RATINGS['southerndunes:fl'].Blue).toEqual({ cr: 72.9, slope: 136 });
    expect(RATINGS['southerndunes:fl'].Red).toBeUndefined(); // only a women's rating published
  });
});

// Sascha 13.11.2026: "every course must always have slope and course rating" – every tee of every bundled course has a
// men's or a women's value, and the tees with none are exactly the ones no federation rates (checked 13.11.2026).
describe('course ratings for every tee (13.11.2026)', () => {
  const holesOf = (course: string) => Object.keys(TEES[course].holes);
  const keysOf = (course: string, tee: string) => {
    const loops = [...new Set(holesOf(course).map((h) => h.replace(/^\d+/, '')))].filter(Boolean);
    return loops.length > 1 ? ['AB', 'BC', 'AC'].map((l) => `${tee}@${l}`) : [tee];
  };
  it('every bundled course has tee data and course ratings', () => {
    for (const id of [...Object.keys(SEED_COURSES), ...Object.keys(CARD_COURSES)]) {
      expect(TEES[id], id).toBeDefined();
      expect(Object.keys(RATINGS[id] ?? {}).length, id).toBeGreaterThan(0);
    }
  });
  it('every tee rated for men or women – the unrated ones are known', () => {
    const unrated: string[] = [];
    let men = 0;
    let women = 0;
    for (const [id, t] of Object.entries(TEES)) {
      if (id.startsWith('oga:')) continue; // the same course again
      for (const tee of t.tees)
        for (const k of keysOf(id, tee)) {
          if (RATINGS[id]?.[k]) men++;
          if (LADY_RATINGS[id]?.[k]) women++;
          if (!RATINGS[id]?.[k] && !LADY_RATINGS[id]?.[k]) unrated.push(`${id} ${k}`);
        }
    }
    // forward tees without a rating (RFEG: none for orange)
    expect(unrated.sort()).toEqual(['osm:relation/1130271 Orange', 'osm:relation/1654444 Orange']);
    expect(men).toBeGreaterThanOrEqual(102); // of 106 tees and loop combinations (13.11.2026)
    expect(women).toBeGreaterThanOrEqual(72);
  });
  it('every women\'s rating is for a tee of our tee data; believable: course rating 55–85, slope 55–155', () => {
    for (const [course, tees] of Object.entries(LADY_RATINGS)) {
      for (const [key, r] of Object.entries(tees)) {
        expect(TEES[course].tees, `${course} ${key}`).toContain(key.split('@')[0]);
        expect(r.cr).toBeGreaterThan(55);
        expect(r.cr).toBeLessThan(85);
        expect(r.slope).toBeGreaterThanOrEqual(55);
        expect(r.slope).toBeLessThanOrEqual(155);
        // a woman's course rating from a tee is higher than a man's from the same tee
        if (RATINGS[course]?.[key]) expect(r.cr, `${course} ${key}`).toBeGreaterThan(RATINGS[course][key].cr);
      }
    }
  });
  it('the official tables, not the older aggregator values', () => {
    expect(RATINGS['osm:relation/1654444'].Yellow).toEqual({ cr: 71.0, slope: 133 }); // Son Quint, RFEG (GolfPass: 70.8)
    expect(RATINGS['osm:way/40755710'].Yellow).toEqual({ cr: 72.4, slope: 135 }); // Alcanada, RFEG and the club's card (was 73.0)
    // StoneGate: the green tee's value on the card is the women's
    expect(RATINGS['osm:relation/4039062'].Green).toEqual({ cr: 63.2, slope: 112 });
    expect(LADY_RATINGS['osm:relation/4039062'].Green).toEqual({ cr: 68.6, slope: 117 });
    expect(LADY_RATINGS['osm:relation/1326323']['Red@AB']).toEqual({ cr: 71.3, slope: 126, par: 71 });
  });
  it('the courses whose tees came with their ratings: the tee lengths of the federation\'s table', () => {
    const total = (id: string, tee: string) => Object.values(TEES[id].holes).reduce((s, h) => s + (h[TEES[id].tees.indexOf(tee)] ?? 0), 0);
    expect(TEES['osm:way/60140256'].tees).toEqual(['Black', 'White', 'Yellow', 'Blue', 'Red']); // Son Gual
    expect(total('osm:way/60140256', 'Yellow')).toBe(5983);
    expect(total('osm:way/81397943', 'Red')).toBe(4508); // Son Térmens
    expect(TEES['osm:relation/4040123'].tees).toEqual(['Gold', 'Blue', 'White', 'Green', 'Purple', 'Silver']); // Legends, Clermont
    expect(Math.round(total('osm:relation/4040123', 'Gold') / 0.9144)).toBe(6807); // 6808 yd, rounded per hole
  });
});

describe('Florida: course rating and slope (GolfCourseAPI, 22./23.10.2026)', () => {
  it("Falcon's Fire blue and Orange Lake Legends black", () => {
    expect(RATINGS['osm:way/311994625'].Blue).toEqual({ cr: 71.0, slope: 128 });
    expect(RATINGS['osm:relation/4039887'].Black).toEqual({ cr: 71.9, slope: 131 });
  });
});
