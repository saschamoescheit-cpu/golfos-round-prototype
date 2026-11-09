import { describe, expect, it } from 'vitest';
import { editedPlayer } from './wagers';
import { withFrame, type RoundEvent } from './sharedround';
import type { Round } from '../types';

// Sascha 09.11.2026 ("3 net classes set to none and saved – it shows 3 again … correct it in the whole app, this must
// not happen"): what is taken away in a setup stays away after saving – the merge over the stored state keeps nothing of
// it. (The tournament's net classes and special prizes: qa/tourclasses.mjs.)
describe('what is taken away does not come back', () => {
  it("a pool's player: the HCP emptied stays empty – his joining and invitation stay", () => {
    const old = { id: 'e', name: 'Erik', hcp: '4,6', joined: { name: 'Erik', at: '', uid: 'u-e' }, invited: { uid: 'u-e', name: 'Erik H', at: '' } };
    const m = editedPlayer(old, { id: 'e', name: 'Erik' });
    expect(m.hcp).toBeUndefined();
    expect(m.joined?.uid).toBe('u-e');
    expect(m.invited?.uid).toBe('u-e');
    expect(editedPlayer(old, { id: 'e', name: 'Erik', hcp: '5,1' }).hcp).toBe('5,1');
  });
  it("a round shared by code: a course rating or tee taken away goes from the event too; the flights stay", () => {
    const e = { kind: 'round-event', name: 'R', holes: [], loopOrder: ['A'], format: { mode: 'single' }, tee: 'yellow', rating: { cr: 71.6, slope: 130 }, flights: { f1: { id: 'f1' } } } as unknown as RoundEvent;
    const round = { loopOrder: ['A'], holes: [], format: { mode: 'single' } } as unknown as Round;
    const out = withFrame(e, round);
    expect(out.rating).toBeUndefined();
    expect(out.tee).toBeUndefined();
    expect(Object.keys(out.flights)).toEqual(['f1']);
    expect(withFrame(e, { ...round, rating: { cr: 72, slope: 131 } } as Round).rating).toEqual({ cr: 72, slope: 131 });
  });
});
