// GPS tracks stored compactly (night 22.10.2026, a proposal waiting for Sascha's OK): the first fix in full, every
// further one as the difference to the one before – time in ms, position in millionths of a degree, accuracy in m.
// Lossless (the fixes are stored to 1e-6° already) and about 60 % smaller – more than twice the rounds fit on the phone.
// Tracks in the old form (a plain list of fixes) are read as they are; a track is written in the new form the next
// time it is saved.

export type Row = [number, number, number, number] | [number, number, number, number, 1];

const E = 1e6;

export function encodeTrack(rows: Row[]): string {
  const d: number[][] = [];
  let pt = 0;
  let px = 0;
  let py = 0;
  for (const r of rows) {
    const t = r[0];
    const x = Math.round(r[1] * E);
    const y = Math.round(r[2] * E);
    const e = [t - pt, x - px, y - py, r[3]];
    if (r[4]) e.push(1);
    d.push(e);
    pt = t;
    px = x;
    py = y;
  }
  return JSON.stringify({ v: 2, d });
}

/** The fixes of a stored track, in either form. An unreadable track reads as empty. */
export function decodeTrack(raw: string | null): Row[] {
  if (!raw) return [];
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return [];
  }
  if (Array.isArray(j)) return j as Row[];
  const c = j as { v?: number; d?: number[][] } | null;
  if (!c || c.v !== 2 || !Array.isArray(c.d)) return [];
  let t = 0;
  let x = 0;
  let y = 0;
  return c.d.map((e): Row => {
    t += e[0];
    x += e[1];
    y += e[2];
    return e[4] ? [t, x / E, y / E, e[3], 1] : [t, x / E, y / E, e[3]];
  });
}
