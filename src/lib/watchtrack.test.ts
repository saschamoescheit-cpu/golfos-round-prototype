import { describe, expect, it } from 'vitest';
import { mergeWatchRows } from './track';
import type { Row } from './trackcodec';

// The watch's own GPS track (Sascha 09.11.2026: "the phone may lie in the cart – the watch must have GPS to record the
// shots and the GPS track"): its fixes take the place of the phone's over the same time.
const row = (t: number, x = 9.69, acc = 5): Row => [t, x, 48.78, acc];

describe("the watch's track in the round's track", () => {
  it("the phone's fixes of the batch's time out, the watch's in, by time – before and after kept", () => {
    const phone = [row(0, 1), row(10, 1), row(20, 1), row(30, 1), row(90, 1)];
    const watch = [row(10, 2), row(25, 2), row(35, 2)];
    expect(mergeWatchRows(phone, watch).map((r) => [r[0], r[1]])).toEqual([[0, 1], [10, 2], [25, 2], [35, 2], [90, 1]]);
  });
  it('the same batch again: the same rows, nothing written', () => {
    const merged = mergeWatchRows([row(0, 1)], [row(10, 2), row(20, 2)]);
    expect(mergeWatchRows(merged, [row(10, 2), row(20, 2)])).toBe(merged);
  });
  it("two batches one after the other: both kept (the watch's own rows of the first stay)", () => {
    const a = mergeWatchRows([], [row(10, 2), row(20, 2)]);
    const b = mergeWatchRows(a, [row(30, 3), row(40, 3)]);
    expect(b.map((r) => r[0])).toEqual([10, 20, 30, 40]);
  });
});
