import type { AimKind, LngLat, Shot } from '../types';
import { distanceM, pointAt } from './geo';
import { sideOf } from './dispersion';
import { tr } from './i18n';

// Where the player aimed (Sascha 16.11.2026: "Ich ziele ja nicht immer Mitte Bahn. Daher habe ich Streuungen in den
// Schlägern, die nicht der Realität entsprechen"): set per shot in the round check – a chip (Fahne, Grünmitte, Bahn links /
// Mitte / rechts, Vorlegen) or dragged on the map. Without it the spread is measured as before: off the tee of a par 4/5
// against the middle of the hole at the ball's distance, else against the flag.

/** "Bahn links / rechts": this far off the middle of the hole */
export const FAIRWAY_SIDE_M = 10;

/** p moved `m` metres to the right (+) or left (−) of the direction from → p */
export function besideLine(from: LngLat, p: LngLat, m: number): LngLat {
  const k = Math.cos((from[1] * Math.PI) / 180);
  const dx = (p[0] - from[0]) * k;
  const dy = p[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  // right of the direction (east = +x, north = +y): (dy, −dx)
  const rx = dy / len;
  const ry = -dx / len;
  const deg = m / 111320;
  return [p[0] + (rx * deg) / k, p[1] + ry * deg];
}

/** The tee shot of a par 4/5: aimed along the hole, not at the flag. */
export const aimsAtFairway = (shotIndex: number, par: number): boolean => shotIndex === 0 && par >= 4;

/** The chips a shot offers: the fairway off the tee of a par 4/5, else the flag, the green and a lay-up. */
export function aimChoices(fairway: boolean): { value: AimKind; label: () => string }[] {
  return fairway
    ? [
        { value: 'left', label: () => tr('Fairway left', 'Bahn links') },
        { value: 'middle', label: () => tr('Fairway middle', 'Bahnmitte') },
        { value: 'right', label: () => tr('Fairway right', 'Bahn rechts') },
      ]
    : [
        { value: 'flag', label: () => tr('Flag', 'Fahne') },
        { value: 'green', label: () => tr('Green centre', 'Grünmitte') },
        { value: 'layup', label: () => tr('Lay up', 'Vorlegen') },
      ];
}

export const aimName = (k: AimKind | undefined): string | null =>
  !k ? null : k === 'map' ? tr('set on the map', 'auf der Karte gesetzt') : ([...aimChoices(true), ...aimChoices(false)].find((c) => c.value === k)?.label() ?? null);

/** What the shot is measured against when no aim is set: the middle of the hole at the ball's distance (tee shot, par
 *  4/5) or the flag – as the club statistics do. */
export function assumedAim(o: { fairway: boolean; from: LngLat; end: LngLat | null; line: LngLat[] | null; pin: LngLat | null }): LngLat | null {
  if (o.fairway) return o.line && o.line.length >= 2 && o.end ? pointAt(o.line, distanceM(o.from, o.end)) : null;
  return o.pin;
}

/** The point a chip stands for. Lay-up: on the way to the flag at the ball's distance (then dragged where it was). */
export function aimFor(kind: Exclude<AimKind, 'map'>, o: { from: LngLat; end: LngLat | null; line: LngLat[] | null; pin: LngLat | null; greenCenter: LngLat | null }): LngLat | null {
  if (kind === 'flag') return o.pin;
  if (kind === 'green') return o.greenCenter ?? o.pin;
  if (kind === 'layup') {
    if (!o.pin) return null;
    const m = o.end ? Math.min(distanceM(o.from, o.end), distanceM(o.from, o.pin) - 20) : distanceM(o.from, o.pin) * 0.6;
    return pointAt([o.from, o.pin], Math.max(20, m));
  }
  const middle = assumedAim({ fairway: true, from: o.from, end: o.end, line: o.line, pin: o.pin });
  if (!middle) return null;
  return kind === 'middle' ? middle : besideLine(o.from, middle, kind === 'left' ? -FAIRWAY_SIDE_M : FAIRWAY_SIDE_M);
}

/** Metres right (+) / left (−) of the line from → aim, and long (+) / short (−) of the aim. */
export function offAim(from: LngLat, aim: LngLat, end: LngLat): { side: number; long: number } {
  const toAim = distanceM(from, aim);
  const k = Math.cos((from[1] * Math.PI) / 180);
  const ax = (aim[0] - from[0]) * k;
  const ay = aim[1] - from[1];
  const bx = (end[0] - from[0]) * k;
  const by = end[1] - from[1];
  const len = Math.hypot(ax, ay) || 1;
  const along = ((ax * bx + ay * by) / len) * 111320;
  return { side: sideOf(from, aim, end), long: along - toAim };
}

/** A shot aimed shorter than its club goes (Vorlegen, or an aim set well short): its side counts for the
 *  spread, its length not for the club's length. */
export function laidUp(s: Pick<Shot, 'aim' | 'aimKind' | 'pos'>, clubTotalM: number | undefined): boolean {
  if (s.aimKind === 'layup') return true;
  if (!s.aim || !s.pos || !clubTotalM) return false;
  return distanceM(s.pos, s.aim) < 0.8 * clubTotalM;
}

/** "7 m rechts vom Ziel · 4 m zu kurz" – against the aim set, the flag or the middle of the hole */
export function offAimText(o: { side: number; long: number }, against: 'aim' | 'flag' | 'middle'): string {
  const s = Math.round(o.side);
  const l = Math.round(o.long);
  const m = Math.abs(s);
  const side =
    s === 0
      ? tr('on the line', 'genau auf der Linie')
      : against === 'aim'
        ? s > 0 ? tr(`${m} m right of the target`, `${m} m rechts vom Ziel`) : tr(`${m} m left of the target`, `${m} m links vom Ziel`)
        : against === 'flag'
          ? s > 0 ? tr(`${m} m right of the flag`, `${m} m rechts der Fahne`) : tr(`${m} m left of the flag`, `${m} m links der Fahne`)
          : s > 0 ? tr(`${m} m right of the middle`, `${m} m rechts der Bahnmitte`) : tr(`${m} m left of the middle`, `${m} m links der Bahnmitte`);
  const long = l === 0 ? tr('length right', 'Länge passt') : l > 0 ? tr(`${l} m long`, `${l} m zu lang`) : tr(`${-l} m short`, `${-l} m zu kurz`);
  return `${side} · ${long}`;
}
