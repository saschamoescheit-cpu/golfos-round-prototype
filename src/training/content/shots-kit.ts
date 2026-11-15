import type { L, P, SideItem, Sketch, SketchItem } from '../types';
import type { GolferOptions, JointName } from '../Golfer';

// Drawing helpers for the pictures of the shots (shots.ts, shots-more.ts). Face-on = target to the right
// (right-hander), the golfer 1.75 m, ground at y = 0.2, scenes in metres.

export const S = (w: number, h: number, items: SideItem[], caption?: L): Sketch => ({ view: 'side', w, h, items, caption });
export const T = (w: number, h: number, items: SketchItem[], caption?: L): Sketch => ({ view: 'top', w, h, items, caption });
export const G0 = 0.2;
export const ground = (w: number, sand = false): SideItem => ({ k: 'ground', pts: [[0, G0], [w, G0]], sand });
/** a slope from y0 (left) to y1 (right); at(x) is the height of the ground at x, deg its angle */
export const hill = (w: number, y0: number, y1: number, sand = false) => ({
  item: { k: 'ground', pts: [[0, y0], [w, y1]], sand } as SideItem,
  at: (x: number) => y0 + ((y1 - y0) * x) / w,
  deg: (Math.atan((y1 - y0) / w) * 180) / Math.PI,
});
export const fig = (x: number, pose: GolferOptions['pose'], o: Omit<GolferOptions, 'pose'> & { tilt?: number; y?: number } = {}): SideItem => ({ k: 'figure', at: [x, o.y ?? G0], pose, ...o });
export const co = (on: JointName, t: L, at: P, figIndex?: number): SideItem => ({ k: 'callout', on, t, at, fig: figIndex });
export const ball = (x: number, y = G0): SideItem => ({ k: 'ball', at: [x, y] });
export const txt = (at: P, t: L | string, size = 11, anchor: 'start' | 'middle' | 'end' = 'middle'): SideItem => ({ k: 'text', at, t, size, anchor });
export const arrow = (from: P, to: P): SideItem => ({ k: 'arrow', from, to });
export const flight = (pts: P[]): SideItem => ({ k: 'flight', pts, dashed: true });
export const mark = (at: P, t: L): SideItem => ({ k: 'mark', at, t });
export const line = (from: P, to: P, dashed = false): SideItem => ({ k: 'line', from, to, dashed });
/** grass blades around the ball (deep grass) */
export const blades = (xs: number[], h = 0.12): SideItem[] => xs.map((x, i) => line([x, G0], [x + (i % 2 ? 0.03 : -0.03), G0 + h]));

/** a flight over the ground: where it lands, how far it rolls, the flag behind */
export const landRoll = (w: number, from: number, land: number, end: number, top: number, at: (x: number) => number, labels: [L, L]): SideItem[] => [
  ball(from, at(from)),
  flight([[from, at(from) + 0.05], [(from + land) / 2, at((from + land) / 2) + top], [land, at(land) + 0.04]]),
  arrow([land, at(land) + 0.06], [end, at(end) + 0.06]),
  txt([(from + land) / 2, at((from + land) / 2) + top + 0.22], labels[0], 11),
  txt([(land + end) / 2, at((land + end) / 2) + 0.28], labels[1], 11),
  { k: 'flag', at: [Math.min(w - 0.2, end + 0.3), at(Math.min(w - 0.2, end + 0.3))] },
];

/** from above (the y axis points up the page, the green at the top): aim beside the hole, the ball curves back –
 *  side = 1 aims right (the ball goes left), −1 aims left (the ball goes right); wind = the arrow of a crosswind */
export const aimCurve = (side: 1 | -1, caption: L, wind?: L): Sketch => {
  const hx = 2;
  const ax = hx + side * 1.1;
  return T(4, 7, [
    { k: 'fringe', x: 0, y: 2.8, w: 4, h: 4.2 },
    { k: 'green', x: 0.3, y: 3.1, w: 3.4, h: 3.6, round: true },
    { k: 'hole', at: [hx, 5.9], flag: true },
    { k: 'ball', at: [hx, 1.0] },
    { k: 'player', at: [hx - 0.6, 1.0], face: 'up' },
    { k: 'path', pts: [[hx, 1.0], [ax, 5.9]], style: 'aim' },
    { k: 'path', pts: [[hx, 1.0], [hx + side * 0.55, 3.6], [hx + side * 0.05, 5.75]], style: 'flight', arrow: true },
    { k: 'text', at: [ax, 6.45], t: { en: 'aim here', de: 'hierhin zielen' }, size: 0.3 },
    ...(wind ? [{ k: 'slope' as const, at: [side === 1 ? 0.7 : 3.3, 2.1] as P, dir: side === 1 ? 270 : 90, label: wind }] : []),
  ], caption);
};
