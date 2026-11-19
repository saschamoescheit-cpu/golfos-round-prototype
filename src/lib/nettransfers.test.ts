import { describe, expect, it } from 'vitest';
import { netTransfers } from './wagers';

// Sascha 19.11.2026, the settlement push "Du zahlst 60 $ an Erik · du bekommst 100 $ von Erik · du bekommst 20 $ von
// Daniel": "In dieser Meldung sollte direkt das verrechnete Ergebnis stehen"
describe('netTransfers', () => {
  it('sets off each two: Erik 100 to Sascha, Sascha 60 to Erik – Erik 40 to Sascha; Daniel stays', () => {
    const ts = [
      { from: 'sascha', to: 'erik', amount: 60 },
      { from: 'erik', to: 'sascha', amount: 100 },
      { from: 'daniel', to: 'sascha', amount: 20 },
    ];
    expect(netTransfers(ts)).toEqual([
      { from: 'erik', to: 'sascha', amount: 40 },
      { from: 'daniel', to: 'sascha', amount: 20 },
    ]);
  });
  it('even – nothing; several the same way add up; cents rounded', () => {
    expect(netTransfers([{ from: 'a', to: 'b', amount: 20 }, { from: 'b', to: 'a', amount: 20 }])).toEqual([]);
    expect(netTransfers([{ from: 'a', to: 'b', amount: 10.1 }, { from: 'a', to: 'b', amount: 0.2 }])).toEqual([{ from: 'a', to: 'b', amount: 10.3 }]);
  });
});
