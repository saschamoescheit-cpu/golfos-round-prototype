import { describe, expect, it } from 'vitest';
import { decodeTrack, encodeTrack, type Row } from './trackcodec';

// a round as the app records it: a fix every few metres or 5 s, rounded to 1e-6°, an app-open now and then
function round(n: number): Row[] {
  const rows: Row[] = [];
  let t = 1792564562036;
  let lon = 9.689329;
  let lat = 48.781065;
  for (let k = 0; k < n; k++) {
    t += 1000 + ((k * 7919) % 9000);
    lon = Math.round((lon + (((k * 31) % 17) - 8) * 0.000013) * 1e6) / 1e6;
    lat = Math.round((lat + (((k * 47) % 13) - 6) * 0.000011) * 1e6) / 1e6;
    const acc = 3 + ((k * 13) % 20);
    rows.push(k % 97 === 0 ? [t, lon, lat, acc, 1] : [t, lon, lat, acc]);
  }
  return rows;
}

describe('GPS track stored compactly', () => {
  it('lossless: every fix comes back exactly', () => {
    const rows = round(4000);
    expect(decodeTrack(encodeTrack(rows))).toEqual(rows);
  });
  it('much smaller than the plain list', () => {
    const rows = round(4000);
    const ratio = encodeTrack(rows).length / JSON.stringify(rows).length;
    expect(ratio).toBeLessThan(0.5);
  });
  it('a track in the old form reads as it is; nothing and broken read as empty', () => {
    const rows = round(50);
    expect(decodeTrack(JSON.stringify(rows))).toEqual(rows);
    expect(decodeTrack(null)).toEqual([]);
    expect(decodeTrack('{oops')).toEqual([]);
  });
});
