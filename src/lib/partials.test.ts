import { describe, expect, it } from 'vitest';
import { adviseClub, type CarryBag } from './caddie';
import { partialCarry, trackedPartials, withPartials } from './partials';
import { emptyEntry } from './scoring';
import type { LngLat, Round } from '../types';

const bag: CarryBag = [
  { club: 'Dr', carry: 225 }, { club: '7i', carry: 150 }, { club: '8i', carry: 140 }, { club: '9i', carry: 128 },
  { club: 'PW', carry: 115 }, { club: 'GW', carry: 100 }, { club: 'SW', carry: 85 }, { club: 'LW', carry: 65 },
];

describe('wedge partial swings', () => {
  it('suggested from the full carry (60 % / 80 %), the player’s own value wins', () => {
    expect(partialCarry('SW', 85, 'half', {})).toBe(51);
    expect(partialCarry('SW', 85, 'threeQ', {})).toBe(68);
    expect(partialCarry('SW', 85, 'half', { SW: { half: 47 } })).toBe(47);
    expect(partialCarry('SW', 85, 'half', { SW: { half: 120 } })).toBe(51); // not believable: longer than the full swing
  });
  it('the caddie picks the closest full or partial wedge swing from 30 m to the full pitching wedge', () => {
    const b = withPartials(bag, {});
    const pick = (m: number) => {
      const a = adviseClub(m, b);
      return `${a.club}${a.swing ? ' ' + a.swing : ''}`;
    };
    expect(pick(50)).toBe('SW half');
    expect(pick(68)).toBe('SW threeQ');
    expect(pick(85)).toBe('SW'); // full swing on a tie with nothing closer
    expect(pick(100)).toBe('GW');
    expect(pick(140)).toBe('8i'); // outside the wedge range: full clubs only
    expect(adviseClub(68, b).shorter).toMatchObject({ club: 'LW' }); // one swing less: LW full 65
  });
  it('without partials in the bag nothing changes', () => {
    const a = adviseClub(68, bag);
    expect(a.club).toBe('LW'); // as before: 65 m carry plus roll
    expect(a.swing).toBeUndefined();
  });
  it('tracked pitch shots count for the nearer swing, from 3 shots', () => {
    const M = 1 / 111195;
    const at = (n: number): LngLat => [9.69, 48.78 + n * M];
    // pitch shots with SW of 55 m (→ half, carry ≈ 51) and 73 m (→ three-quarter, carry ≈ 68)
    const hole = (len: number) => ({
      ...emptyEntry(),
      detail: { shots: [{ pos: at(0), lie: 'fairway' as const, club: 'SW' as const, penalty: false, kind: 'pitch' as const }], onGreen: at(len), pin: at(len + 2), holedOut: false },
    });
    const r: Round = {
      id: 'r', createdAt: '2026-10-13T10:00:00Z', finishedAt: '2026-10-13T14:00:00Z', courseId: 'x', courseName: 'x', loopOrder: ['Main'],
      holes: Array.from({ length: 6 }, (_, i) => ({ index: i, label: String(i + 1), loop: 'Main', number: i + 1, par: 3, strokeIndex: i + 1 })),
      mode: 'detail', currentHole: 5, players: [{ id: 'me', name: 'S', playingHandicap: 7, isMe: true }],
      entries: { me: [hole(55), hole(54), hole(56), hole(73), hole(74), hole(72)] },
    };
    const t = trackedPartials([r], bag);
    expect(t.get('SW|half')).toMatchObject({ carry: 51, shots: 3 });
    expect(t.get('SW|threeQ')).toMatchObject({ carry: 68, shots: 3 });
  });
});
