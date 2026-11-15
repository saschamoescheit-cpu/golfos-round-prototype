import { describe, expect, it } from 'vitest';
import { CATEGORIES, shotsForDrills, shotsOfDrill } from './content';
import { COACH_FAULT_DRILLS, coachShots } from './coachLinks';
import { search } from './search';

// The shots linked into the rest of Training (night run 15./16.11.2026): the search finds them, a fault, an advice
// from the rounds and a coach fault lead to the shot that uses their drills, a drill names the shots it belongs to.

describe('shots linked', () => {
  it('the search finds shots by their words, the name hits first', () => {
    expect(search('Spiegelei').shots.map(({ s }) => s.id)).toContain('bunker-plugged');
    expect(search('Bounce').shots[0].s.id).toBe('bunker-bounce');
    expect(search('bergab').shots.map(({ s }) => s.id)).toEqual(expect.arrayContaining(['chip-downhill', 'slope-downhill', 'putt-downhill']));
    expect(search('Lob').shots[0].s.id).toBe('lob-shot');
    expect(search('').shots).toEqual([]);
  });

  it('a fault leads to its shot', () => {
    const fat = CATEGORIES.find((c) => c.id === 'chipping')!.faults!.find((f) => f.name.en.startsWith('Fat chip'))!;
    expect(shotsForDrills(fat.drills ?? [])[0].shot.id).toBe('chip-standard');
    // most faults of the topics with shots find one
    const faults = CATEGORIES.filter((c) => c.shots?.length).flatMap((c) => c.faults ?? []);
    const found = faults.filter((f) => shotsForDrills(f.drills ?? []).length > 0).length;
    expect(found / faults.length).toBeGreaterThan(0.8);
  });

  it('a drill names the shots it belongs to', () => {
    expect(shotsOfDrill('tiger-gate').map((x) => x.shot.id)).toEqual(['putt-short']);
    expect(shotsOfDrill('landing-ring').map((x) => x.shot.id)).toContain('chip-standard');
    expect(shotsOfDrill('no-such-drill')).toEqual([]);
  });

  it('the coach: most of its faults have a shot', () => {
    const ids = Object.keys(COACH_FAULT_DRILLS);
    expect(ids.filter((id) => coachShots(id).length > 0).length).toBeGreaterThanOrEqual(20);
    expect(coachShots('no-such-fault')).toEqual([]);
  });
});
