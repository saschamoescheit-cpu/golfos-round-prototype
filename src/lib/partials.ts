import type { Club, Round } from '../types';
import type { CarryBag } from './caddie';
import { shotLengths } from './shots';
import { tr } from './i18n';

// Wedge partial swings (feature 016): besides the full carry, PW, GW, SW and LW have a half swing (9 o'clock, lead arm
// level) and a three-quarter swing (10:30). Empty = suggested from the full carry (60 % / 80 %); the player's own value
// wins. The caddie picks between full and partial swings from 30 m to the full pitching wedge, and tracked pitch shots
// from detailed rounds suggest real values.

export type Swing = 'full' | 'threeQ' | 'half';
export const WEDGES: Club[] = ['PW', 'GW', 'SW', 'LW'];
export const SWING_SHARE: Record<'threeQ' | 'half', number> = { threeQ: 0.8, half: 0.6 };
export type Partials = Partial<Record<Club, { half?: number; threeQ?: number }>>;

const KEY = 'golfos.partials.v1';
export function loadPartials(): Partials {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partials) : {};
  } catch {
    return {};
  }
}
export function savePartials(p: Partials): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
}

/** Suggested carry of a partial swing from the full carry. */
export const suggestedPartial = (full: number, swing: 'threeQ' | 'half') => Math.round(full * SWING_SHARE[swing]);

/** Carry of a partial swing: the player's value if believable (15 m … just under the full carry), else the suggestion. */
export function partialCarry(club: Club, full: number, swing: 'threeQ' | 'half', partials: Partials): number {
  const own = partials[club]?.[swing];
  return own != null && own >= 15 && own < full ? own : suggestedPartial(full, swing);
}

/** The bag with the wedges' partial swings added (after the full clubs, so a lookup by club still finds the full one). */
export function withPartials(bag: CarryBag, partials: Partials = loadPartials()): CarryBag {
  const extra: CarryBag = [];
  for (const b of bag) {
    if (!WEDGES.includes(b.club) || b.swing) continue;
    extra.push({ club: b.club, carry: partialCarry(b.club, b.carry, 'threeQ', partials), swing: 'threeQ' });
    extra.push({ club: b.club, carry: partialCarry(b.club, b.carry, 'half', partials), swing: 'half' });
  }
  return [...bag, ...extra];
}

/** "¾" / "½" after the club code, empty for a full swing. */
export const swingMark = (s: Swing | undefined): string => (s === 'threeQ' ? ' ¾' : s === 'half' ? ' ½' : '');
/** "three-quarter (10:30)" – for the caddie's line and the read-aloud text. */
export const swingName = (s: Swing | undefined): string =>
  s === 'threeQ' ? tr('three-quarter swing (10:30)', 'Dreiviertel-Schwung (10:30)') : s === 'half' ? tr('half swing (9 o’clock)', 'halber Schwung (9 Uhr)') : '';

/**
 * Partial-swing carries from tracked pitch shots with a wedge (detailed rounds): each shot counts for the swing whose
 * carry it is closer to; median minus typical roll (≈ 7 %), from 3 shots on.
 */
export function trackedPartials(rounds: Round[], bag: CarryBag, partials: Partials = {}): Map<string, { carry: number; shots: number }> {
  const lengths = new Map<string, number[]>();
  for (const r of rounds) {
    if (!r.finishedAt) continue;
    const me = r.players.find((p) => p.isMe);
    if (!me) continue;
    for (const e of r.entries[me.id]) {
      const d = e.detail;
      if (!d) continue;
      const lens = shotLengths(d);
      d.shots.forEach((s, k) => {
        const len = lens[k];
        if (!s.club || !WEDGES.includes(s.club) || s.kind !== 'pitch' || s.penalty || len == null) return;
        const full = bag.find((b) => b.club === s.club && !b.swing)?.carry;
        if (!full) return;
        const carry = len * 0.93;
        const half = partialCarry(s.club, full, 'half', partials);
        const three = partialCarry(s.club, full, 'threeQ', partials);
        if (carry < half * 0.6 || carry > full) return; // a chip or a full shot after all
        const swing = Math.abs(carry - half) <= Math.abs(carry - three) ? 'half' : 'threeQ';
        const key = `${s.club}|${swing}`;
        lengths.set(key, [...(lengths.get(key) ?? []), carry]);
      });
    }
  }
  const out = new Map<string, { carry: number; shots: number }>();
  for (const [k, xs] of lengths) {
    if (xs.length < 3) continue;
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    out.set(k, { carry: Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2), shots: s.length });
  }
  return out;
}
