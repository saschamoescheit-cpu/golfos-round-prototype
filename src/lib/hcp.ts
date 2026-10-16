import type { Club, LngLat } from '../types';
import type { CarryBag, LieKind } from './caddie';
import { alongLine, distanceM, distToLine, pointInRing, profileAlong, type HoleMapData } from './geo';
import { crossSlopeAt, heightAt, type Samples } from './terrain';
import { tr } from './i18n';

// The caddie for every handicap (Sascha 16.10.2026: "a handicap 54 needs other advice from the caddie than a
// handicap 3") and from where the ball lies ("je nachdem, wo der Ball liegt").

/** The playing handicap the caddie works with: 0–54 (WHS maximum), unknown = 18. */
export const clampHcp = (playing: number | null | undefined): number => Math.min(54, Math.max(0, playing ?? 18));

/** How much wider a player's shots scatter than a scratch player's – the spread model of tee and pin strategy. */
export const spreadFactor = (playing: number | null | undefined): number => 0.6 + clampHcp(playing) / 25;

export type HcpTier = 'low' | 'mid' | 'high' | 'beginner';
/** Up to 9: precise targets; 10–24: the middle; 25–36: bogey golf; 37–54: getting round – safe, simple shots. */
export function hcpTier(playing: number | null | undefined): HcpTier {
  const ph = clampHcp(playing);
  return ph <= 9 ? 'low' : ph <= 24 ? 'mid' : ph <= 36 ? 'high' : 'beginner';
}

/** Strokes received on a hole of stroke index `si` (18-hole playing handicap; above 36 a third round of strokes). */
export function strokesOn(playing: number | null | undefined, si: number | null | undefined): number {
  if (playing == null || !si || si < 1) return 0;
  const ph = clampHcp(playing);
  return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0);
}

/**
 * On the tee for bogey golfers and beginners: the player's own par ("par 4 + 2 strokes = 6 – three shots to the
 * green is fine"). Nothing for players who receive nothing or one stroke at most on a low handicap.
 */
export function ownParLine(par: number, received: number, tier: HcpTier): string | null {
  if (received < 1 || tier === 'low' || tier === 'mid') return null;
  const own = par + received;
  const toGreen = own - 2; // two putts
  return tr(
    `Your par here: ${own} (par ${par} + ${received} stroke${received > 1 ? 's' : ''}) – ${toGreen} shots to the green are fine, then two putts.`,
    `Dein Par hier: ${own} (Par ${par} + ${received} ${received > 1 ? 'Schläge' : 'Schlag'}) – ${toGreen} Schläge bis aufs Grün sind okay, dann zwei Putts.`,
  );
}

const LONG_IRONS: Club[] = ['2i', '3i', '4i', '5i'];
const FORGIVING: Club[] = ['Hy', '2H', '3H', '5H', '6H', '7W', '9W', '5W', '4W'];
const LOFTED: Club[] = ['5W', '7W', '9W', 'Hy', '2H', '3H', '5H'];
/**
 * Clubs that are hard to hit for bogey golfers and beginners, and the easier one from the player's bag:
 * - a long iron (and from the rough the 6-iron too) → a hybrid or lofted wood of about the same carry (±12 m);
 * - a 3- or 4-wood off the fairway or the rough → the longest lofted wood or hybrid (a little shorter, far safer).
 * Null: keep the club.
 */
export function easierClub(club: Club, bag: CarryBag, tier: HcpTier, o: { teeShot?: boolean; rough?: boolean } = {}): { club: Club; carry: number } | null {
  if (tier !== 'high' && tier !== 'beginner') return null;
  const full = bag.filter((b) => !b.swing || b.swing === 'full');
  const want = full.find((b) => b.club === club)?.carry;
  if (want == null) return null;
  if (!o.teeShot && (club === '3W' || club === '4W')) {
    const alt = full.filter((b) => LOFTED.includes(b.club) && b.carry < want).sort((a, b) => b.carry - a.carry)[0];
    return alt ? { club: alt.club, carry: alt.carry } : null;
  }
  const hard = o.rough ? [...LONG_IRONS, '6i' as Club] : LONG_IRONS;
  if (!hard.includes(club)) return null;
  const alt = full
    .filter((b) => FORGIVING.includes(b.club) && Math.abs(b.carry - want) <= 12)
    .sort((a, b) => Math.abs(a.carry - want) - Math.abs(b.carry - want))[0];
  return alt ? { club: alt.club, carry: alt.carry } : null;
}

/** The club for the short game around the green (bogey golfers and beginners): the putter from the fringe, else a
 *  chip and run with the 8-iron. Null: the usual advice. */
export function shortGameClub(toPinM: number, where: BallSpot['where'], tier: HcpTier): { club: 'Putter' | '8i'; text: string } | null {
  if (toPinM > 40 || (tier !== 'high' && tier !== 'beginner') || where === 'green' || where === 'bunker' || where === 'trees') return null;
  return where === 'fringe'
    ? { club: 'Putter', text: tr('Putter from the fringe', 'Putter vom Vorgrün') }
    : { club: '8i', text: tr('8-iron · chip and run (a third in the air, two thirds rolling)', 'Eisen 8 · Chip & Run (ein Drittel fliegen, zwei Drittel rollen)') };
}

/** Around the green (off it, up to 40 m to the pin): how to play it for this handicap. */
export function shortGameLine(toPinM: number, onFringe: boolean, tier: HcpTier): string | null {
  if (toPinM > 40) return null;
  if (tier === 'beginner' || tier === 'high')
    return onFringe
      ? tr('From the fringe: putt it – the putter is the safest club.', 'Vom Vorgrün: putten – der Putter ist der sicherste Schläger.')
      : tr('Chip and run: 8-iron, ball back in the stance, land it on the green and let it roll – no high lob.', 'Chip & Run: Eisen 8, Ball hinten im Stand, aufs Grün tragen und rollen lassen – kein hoher Lob.');
  if (tier === 'low') return tr('Pick the landing spot first, then the club – one bounce on the green, then roll to the hole.', 'Erst den Landepunkt wählen, dann den Schläger – ein Aufsetzer aufs Grün, dann zum Loch rollen.');
  return onFringe ? tr('From the fringe: putt it if the grass in between is short.', 'Vom Vorgrün: putten, wenn das Gras dazwischen kurz ist.') : null;
}

export interface BallSpot {
  /** where the ball lies as the map knows it */
  where: 'fairway' | 'rough' | 'bunker' | 'trees' | 'green' | 'fringe';
  side: 'left' | 'right' | null;
  /** the lie for the club advice, read from the map (null: nothing special) */
  lie: LieKind | null;
}

/**
 * Where the ball lies (Sascha 16.10.2026): fairway, rough left or right, bunker, trees, fringe – from the map with a
 * 3 m tolerance for the GPS; on a slope (terrain model) the stance. The player can still change the lie.
 */
export function ballSpot(from: LngLat, data: HoleMapData, o: { fairways?: LngLat[][]; trees?: LngLat[][]; slopes?: Samples } = {}): BallSpot {
  const fairways = [...data.fairways, ...(o.fairways ?? [])];
  const side = sideOf(data.line, from);
  if (data.green && pointInRing(from, data.green)) return { where: 'green', side: null, lie: null };
  if (data.bunkers.some((r) => pointInRing(from, r))) return { where: 'bunker', side, lie: distanceM(from, data.greenCenter) > 60 ? 'fairwayBunker' : null };
  if (data.green && distToLine(from, data.green) <= 4) return { where: 'fringe', side: null, lie: null };
  if ((o.trees ?? []).some((r) => pointInRing(from, r))) return { where: 'trees', side, lie: null };
  const onFairway = fairways.length ? fairways.some((r) => pointInRing(from, r) || distToLine(from, r) <= 3) : distToLine(from, data.line) <= 15;
  const where = onFairway ? 'fairway' : 'rough';
  // the stance on a slope (only near the hole line, where the terrain model has heights)
  let lie: LieKind | null = where === 'rough' ? 'lightRough' : null;
  if (!lie && o.slopes && distToLine(from, data.line) <= 35) {
    const s = profileAlong(data, from);
    const cross = crossSlopeAt(o.slopes, s); // % – + : the right side is higher
    const a = heightAt(o.slopes, s - 8);
    const b = heightAt(o.slopes, s + 8);
    const up = a != null && b != null ? ((b - a) / 16) * 100 : null;
    // a right-hander stands left of the ball: the right side higher = the ball above the feet
    if (cross != null && Math.abs(cross) >= 7) lie = cross > 0 ? 'above' : 'below';
    else if (up != null && Math.abs(up) >= 7) lie = up > 0 ? 'uphill' : 'downhill';
  }
  return { where, side: where === 'fairway' ? null : side, lie };
}

/** "You are in the rough right – 152 m to the pin." */
export function spotLine(spot: BallSpot, toPin: string): string | null {
  const side = spot.side === 'left' ? tr(' left', ' links') : spot.side === 'right' ? tr(' right', ' rechts') : '';
  const where = {
    fairway: tr('on the fairway', 'auf dem Fairway'),
    rough: tr(`in the rough${side}`, `im Rough${side}`),
    bunker: tr(`in the bunker${side}`, `im Bunker${side}`),
    trees: tr(`in the trees${side}`, `in den Bäumen${side}`),
    fringe: tr('on the fringe', 'auf dem Vorgrün'),
    green: '',
  }[spot.where];
  if (!where) return null;
  return tr(`You are ${where} – ${toPin} to the pin.`, `Du liegst ${where} – ${toPin} zur Fahne.`);
}

/** Left or right of the hole line, seen towards the green (null: on it, within 4 m). */
function sideOf(line: LngLat[], p: LngLat): 'left' | 'right' | null {
  if (line.length < 2) return null;
  const s = alongLine(line, p);
  // the segment the point is beside
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const seg = distanceM(line[i], line[i + 1]);
    if (s <= acc + seg || i === line.length - 2) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      const kx = Math.cos((ay * Math.PI) / 180);
      const cross = (bx - ax) * kx * (p[1] - ay) - (by - ay) * (p[0] - ax) * kx;
      if (distToLine(p, line) < 4) return null;
      return cross > 0 ? 'left' : 'right';
    }
    acc += seg;
  }
  return null;
}
