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

// Sascha 09.11.2026: "switched Kissimmee to gross – the net classes still show in front": net classes only when net
describe('net classes only with a net scoring', () => {
  it('gross (stroke play or 0 %): none, whatever is stored; net: the stored ones', async () => {
    const { netClasses } = await import('./sharedround');
    expect(netClasses({ classes: [12, 24], format: { scoring: 'stroke', allowance: 0 } })).toEqual([]);
    expect(netClasses({ classes: [12, 24], format: { scoring: 'net', allowance: 0 } })).toEqual([]);
    expect(netClasses({ classes: [12, 24], format: { scoring: 'net', allowance: 75 } })).toEqual([12, 24]);
    expect(netClasses({ format: { scoring: 'stableford' } })).toEqual([]);
  });
});

describe("a pool's prize changed between money and not money", () => {
  it('the stakes start again: 20 $ → 1 drink, the 5+5+10 5/5/10 → 1/1/2 (a part set to none stays none); back to money 20 and 5/5/10', async () => {
    const { restake } = await import('./wagers');
    const ws = [
      { id: 'a', player: 'c', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any' },
      { id: 'd', player: 'c', opponent: 's', kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', parts: { front: 0, back: 5, total: 10 } },
    ] as Parameters<typeof restake>[0];
    const drinks = restake(ws, true, false);
    expect(drinks.map((w) => w.stake)).toEqual([1, 0]);
    expect(drinks[1].parts).toEqual({ front: 0, back: 1, total: 2 });
    expect(restake(drinks, false, true)[1].parts).toEqual({ front: 0, back: 5, total: 10 });
    expect(restake(ws, true, true)).toBe(ws);
  });
});
