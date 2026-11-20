import { describe, expect, it } from 'vitest';
import { roundBoard, type SeriesBoardRow } from '../screens/Tournaments';

// Sascha 17.11.2026, Mockup B: the series' total without its guests; each round its own board – everyone who played it,
// the guests ranked with "Gast" (Daniel +10 before Erik +13 on Legends).
const part = (k: number, sort: number, o: Partial<SeriesBoardRow['parts'][number]> = {}) => ({ k, sort, text: sort === 0 ? 'Par' : `+${sort}`, thru: 18, finished: true, card: () => null, ...o });
const row = (name: string, parts: SeriesBoardRow['parts'], guest = false): SeriesBoardRow => ({ key: name, pos: '', name, total: '', parts, ...(guest ? { guest } : {}) });
const rows = [
  row('Sascha', [part(0, 3), part(6, 6)]),
  row('Erik', [part(0, 9), part(6, 13)]),
  row('Cedric', [part(6, 21)]),
  row('Moritz', [part(0, 5)]),
  row('Daniel', [part(6, 10)], true),
  row('Thomas', [part(6, 19)], true),
];

describe("a series round's board", () => {
  it('everyone who played R7, by score – the guests among them', () => {
    expect(roundBoard(rows, 6).map((x) => `${x.pos} ${x.row.name}${x.row.guest ? ' (Gast)' : ''}`)).toEqual(['1 Sascha', '2 Daniel (Gast)', '3 Erik', '4 Thomas (Gast)', '5 Cedric']);
  });
  it('not who did not play it', () => {
    expect(roundBoard(rows, 0).map((x) => x.row.name)).toEqual(['Sascha', 'Moritz', 'Erik']);
  });
  it('ties share the place; a No Return last', () => {
    const r = [row('A', [part(1, 4)]), row('B', [part(1, 4)]), row('C', [part(1, 2)]), row('D', [part(1, 0, { noReturn: true })])];
    expect(roundBoard(r, 1).map((x) => `${x.pos} ${x.row.name}`)).toEqual(['1 C', 'T2 A', 'T2 B', 'NR D']);
  });
  it('Stableford: more points first', () => {
    const r = [row('A', [part(0, 30)]), row('B', [part(0, 36)])];
    expect(roundBoard(r, 0, true).map((x) => x.row.name)).toEqual(['B', 'A']);
  });
});
