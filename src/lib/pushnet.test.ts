import { describe, expect, it } from 'vitest';
import { netTransfers, settleNote } from '../../supabase/functions/golfos-push/index';

// Sascha 19.11.2026, the push "Abrechnung · USA-Wetten – Du zahlst 60 $ an Erik · du bekommst 100 $ von Erik · du
// bekommst 20 $ von Daniel": "In dieser Meldung sollte direkt das verrechnete Ergebnis stehen" – the function sets off
// each two players itself too, for the apps that still send both ways
describe('the settlement push: each two players set off', () => {
  const names = { s: 'Sascha', e: 'Erik', d: 'Daniel' };
  const both = [
    { from: 's', to: 'e', amount: 60 },
    { from: 'e', to: 's', amount: 100 },
    { from: 'd', to: 's', amount: 20 },
  ];
  it('Erik 100 to Sascha, Sascha 60 to Erik – one line: 40 from Erik', () => {
    expect(netTransfers(both)).toEqual([
      { from: 'e', to: 's', amount: 40 },
      { from: 'd', to: 's', amount: 20 },
    ]);
    const n = settleNote({ pool: 'USA-Wetten', code: 'X', me: 's', names, transfers: netTransfers(both), sym: '$', remind: false }, 'de');
    expect(n?.body).not.toMatch(/zahlst/);
    expect(n?.body).toMatch(/^Du bekommst 40.*Erik · du bekommst 20.*Daniel$/);
  });
  it('even – nothing to say', () => {
    expect(netTransfers([{ from: 'a', to: 'b', amount: 20 }, { from: 'b', to: 'a', amount: 20 }])).toEqual([]);
  });
});
