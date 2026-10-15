import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { holeMapData, ringArea, woodsOf } from './geo';
import { caddieAdvice, teeAimFor } from './caddieplan';
import { DEFAULT_CARRY } from './caddie';
import { withPartials } from './partials';
import { loadHoleNotes } from './holenotes';
import { teeStrategy } from './teestrategy';
import type { Ring } from '../types';

// Rules from Sascha's Hetzenhof notes (15.10.2026) that hold on every course.
const HET = 'osm:relation/1326323';
const geo = SEED_GEOMETRY[HET];
const bag = withPartials(DEFAULT_CARRY);

describe('woods where balls are lost', () => {
  it('counts the mapped woods and the large crown areas of the aerial image, not single crowns', () => {
    const w = woodsOf(geo);
    expect(w.length).toBeGreaterThan((geo.trees ?? []).length);
    expect(w.slice((geo.trees ?? []).length).every((r) => ringArea(r) >= 1000)).toBe(true);
  });
  it('a hole note "woods left" makes the caddie warn and name the safe side', () => {
    const data = holeMapData(geo, 'A', 4)!;
    const note = loadHoleNotes(HET)['4A'];
    expect(note.lostLeft).toBe(true);
    const common = { data, par: 5, holeIndex: 3, holeCount: 18, pin: data.greenCenter, slopes: geo.fairwaySlopes?.['4A'], boundary: geo.boundary, trees: geo.trees, woods: woodsOf(geo), bag, conditions: null, tendency: new Map(), note, style: 'normal' as const, favourite: 90, lieChoice: null, unit: 'm' as const, playing: null };
    const teeAim = teeAimFor(common);
    const cad = caddieAdvice({ ...common, from: data.tee, teeShot: true, targets: teeAim ? [teeAim.pos] : [], teeAim });
    expect(cad.lines.some((l) => /Woods left|Wald links/.test(l.text))).toBe(true);
    expect(cad.lines.some((l) => /open on both sides|auf beiden Seiten offen/.test(l.text))).toBe(false);
  });
  it('deep in a wood a tee shot costs stroke and distance', () => {
    // a straight hole with a wood on the whole left side from 150 m on, right at the edge of the fairway
    const tee: [number, number] = [9.0, 48.0];
    const m = (x: number, y: number): [number, number] => [9.0 + x / (111320 * Math.cos((48 * Math.PI) / 180)), 48.0 + y / 111320];
    const data = { ...holeMapData(geo, 'A', 1)!, tee, line: [tee, m(0, 380)], greenCenter: m(0, 380), green: null, fairways: [[m(-15, 120), m(15, 120), m(15, 360), m(-15, 360), m(-15, 120)]] as Ring[], water: [], bunkers: [] };
    const wood: Ring = [m(-16, 150), m(-200, 150), m(-200, 400), m(-16, 400), m(-16, 150)];
    const open = teeStrategy({ data, par: 4, bag, playing: 24, conditions: null, trees: [], woods: [] });
    const lost = teeStrategy({ data, par: 4, bag, playing: 24, conditions: null, trees: [], woods: [wood] });
    expect(open).not.toBeNull();
    expect(lost).not.toBeNull();
    // the drives that end deep in the wood cost a stroke and the tee shot again
    expect(lost!.expected).toBeGreaterThan(open!.expected + 0.05);
  });
});

describe('aim help and misses by the green (Sascha, Hetzenhof B)', () => {
  const m = (x: number, y: number): [number, number] => [9.0 + x / (111320 * Math.cos((48 * Math.PI) / 180)), 48.0 + y / 111320];
  it('names a tree in line with the aim, a little beyond it – not one far away or off the line', async () => {
    const { aimHelp } = await import('./caddieplan');
    const from = m(0, 0);
    const aim = m(0, 200);
    expect(aimHelp(from, aim, [m(1, 240)], false)).toMatch(/40 m/);
    expect(aimHelp(from, aim, [m(1, 400)], false)).toBeNull(); // 200 m beyond: no help
    expect(aimHelp(from, aim, [m(30, 240)], false)).toBeNull(); // 7° off the line
    expect(aimHelp(from, aim, [m(1, 240), m(4, 245), m(-3, 238)], false)).toMatch(/group of trees|Baumgruppe/);
  });
  it('a wood next to the green makes that side the one to avoid', async () => {
    const { approachPlan } = await import('./holeplan');
    const green: Ring = [m(-10, 140), m(10, 140), m(10, 160), m(-10, 160), m(-10, 140)];
    const data = { ...holeMapData(geo, 'A', 2)!, tee: m(0, 0), line: [m(0, 0), m(0, 150)], greenCenter: m(0, 150), green, fairways: [], water: [], bunkers: [] };
    const wood: Ring = [m(-14, 100), m(-120, 100), m(-120, 220), m(-14, 220), m(-14, 100)];
    const plan = approachPlan(data, m(0, 0), m(0, 150), { woods: [wood] });
    expect(plan.avoid.some((a) => a.side === 'left' && a.why === 'woods')).toBe(true);
    expect(plan.best).not.toBe('left');
  });
});
