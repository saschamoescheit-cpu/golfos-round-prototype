import { describe, expect, it } from 'vitest';
import { friendOf, planGuests, planNames } from './planinvite';
import { plannedEvent } from './sharedround';
import type { Friend } from './friends';

// A plan invites its linked friends by itself (Sascha 17.11.2026, "Automatisch einladen"): who is a linked friend, who a
// typed name the host has to send the code.
const holes = Array.from({ length: 3 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par: 4, strokeIndex: i + 1 }));
const course = { id: 'osm:way/1', source: 'osm' as const, name: 'Legends', lat: 28.5, lon: -81.7 };
const plan = () =>
  plannedEvent({
    name: 'Legends R7', date: '2026-11-16', course, holes, loopOrder: ['A'], format: { mode: 'single', scoring: 'stroke', allowance: 0 },
    flights: [
      { players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Thomas', playingHandicap: 17 }] },
      { players: [{ name: 'Daniel', playingHandicap: 20 }, { name: 'Erik', playingHandicap: 12 }] },
    ],
  });
const friends: Friend[] = [
  { id: 'f1', name: 'Thomas', hcp: '17', uid: 'u-thomas', fullName: 'Thomas Weber' },
  { id: 'f2', name: 'Erik', hcp: '12' }, // typed, not linked
  { id: 'f3', name: 'Cedric', hcp: '5', uid: 'u-cedric' },
];

describe('a plan invites its linked friends (Sascha 17.11.2026)', () => {
  it('the names of a plan, team members one by one', () => {
    expect(planNames(plan())).toEqual(['Sascha', 'Thomas', 'Daniel', 'Erik']);
  });
  it('a linked friend by name, full name or first name – not a typed friend, not by a shared first name', () => {
    expect(friendOf('Thomas', friends)?.uid).toBe('u-thomas');
    expect(friendOf('thomas weber', friends)?.uid).toBe('u-thomas');
    expect(friendOf('Erik', friends)).toBeNull();
    expect(friendOf('Daniel', friends)).toBeNull();
    const two = [...friends, { id: 'f4', name: 'Thomas Müller', hcp: '', uid: 'u-tm' }];
    expect(friendOf('Thomas', two)?.uid).toBe('u-thomas'); // the exact name wins
    expect(friendOf('Tom', two)).toBeNull();
    expect(friendOf('Thomas Schmidt', two)).toBeNull(); // two of that first name: nobody by guess
  });
  it('who the plan invites, who the host has to send the code – the host himself neither', () => {
    const g = planGuests(plan(), friends, 'u-sascha');
    expect(g.linked).toEqual([{ uid: 'u-thomas', name: 'Thomas' }]);
    expect(g.typed).toEqual(expect.arrayContaining(['Daniel', 'Erik']));
    expect(g.typed).not.toContain('Thomas');
  });
});
