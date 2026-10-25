import { describe, expect, it } from 'vitest';
import { clubOf, num, parseLaunchCsv, summarize } from './launchmonitor';

// The makers' exports as their help pages and users describe them (25.10.2026) – the columns differ, the reading must not.
const GARMIN = `Date,Player,Club Name,Club Type,Club Speed,Ball Speed,Launch Angle,Backspin,Carry Distance,Carry Deviation Angle,Carry Deviation Distance,Total Distance,Total Deviation Distance
,,,,[mph],[mph],[deg],[rpm],[yds],[deg],[yds],[yds],[yds]
10/25/26 9:01 AM,Sascha,Driver,Driver,98.2,141.0,12.1,2650,221.4,-1.2,-4.6,240.1,-6.0
10/25/26 9:02 AM,Sascha,Driver,Driver,97.5,139.2,11.4,2800,215.0,2.0,7.5,233.0,9.1
10/25/26 9:03 AM,Sascha,7 Iron,Iron,78.0,105.2,17.9,6100,148.3,0.5,1.3,156.0,1.8
10/25/26 9:04 AM,Sascha,Pitching Wedge,Wedge,70.1,90.0,24.0,8400,112.0,-0.8,-1.6,116.0,-1.9`;

const TRACKMAN = `sep=,
"Date","Player","Club","Ball","Club Speed","Ball Speed","Carry","Carry Side","Total","Total Side"
"","","","","[mph]","[mph]","[yds]","[yds]","[yds]","[yds]"
"2026-10-25","Sascha","Dr","Premium",99.1,145.2,228.6,"5.1 R",249.3,"7.0 R"
"2026-10-25","Sascha","7i","Premium",79.4,108.1,151.2,"2.3 L",158.0,"2.9 L"`;

const FORESIGHT = `Club;Ball Speed (mph);Launch Angle (deg);Carry (m);Total (m);Offline (m)
3 Wood;135,2;11,8;195,4;214,0;-8,2
56°;71,0;29,1;78,6;80,2;1,4
Putter;5,0;1,0;3,0;3,0;0,0`;

const RAPSODO = `Rapsodo MLM2PRO Session Export
Player: Sascha
Club Type,Club Brand,Carry Distance,Total Distance,Side Carry,Ball Speed
4 Hybrid,Ping,172.5,185.0,-6.3,128.0
Sand Wedge,Titleist,85.0,88.0,2.1,70.2`;

describe('reading launch monitor CSV files', () => {
  it('Garmin R10: the units row, carry deviation as the side, yards to metres', () => {
    const r = parseLaunchCsv(GARMIN);
    expect(r.source).toBe('Garmin');
    expect(r.unit).toBe('yd');
    expect(r.unitSure).toBe(true);
    expect(r.shots.map((s) => s.club)).toEqual(['Dr', 'Dr', '7i', 'PW']);
    expect(r.shots[0].carry).toBeCloseTo(221.4 * 0.9144, 0);
    expect(r.shots[0].side).toBeCloseTo(-4.6 * 0.9144, 0);
  });
  it('Trackman: "sep=", quoted cells, the side as "5.1 R" / "2.3 L"', () => {
    const r = parseLaunchCsv(TRACKMAN);
    expect(r.source).toBe('CSV'); // Trackman's file does not name itself
    expect(r.shots.map((s) => s.club)).toEqual(['Dr', '7i']);
    expect(r.shots[0].side).toBeGreaterThan(0);
    expect(r.shots[1].side).toBeLessThan(0);
  });
  it('Foresight with semicolons and decimal commas, metres in the header, a loft for the wedge, the putter left out', () => {
    const r = parseLaunchCsv(FORESIGHT);
    expect(r.unit).toBe('m');
    expect(r.shots.map((s) => s.club)).toEqual(['3W', 'SW']);
    expect(r.shots[0].carry).toBeCloseTo(195.4, 1);
    expect(r.shots[0].side).toBeCloseTo(-8.2, 1);
    expect(r.skipped).toBe(1);
  });
  it('Rapsodo: title lines above the header, no unit anywhere → yards, but not sure', () => {
    const r = parseLaunchCsv(RAPSODO);
    expect(r.source).toBe('Rapsodo');
    expect(r.unitSure).toBe(false);
    expect(r.shots.map((s) => s.club)).toEqual(['Hy', 'SW']);
    // the player says metres: taken as they are
    expect(parseLaunchCsv(RAPSODO, 'm').shots[0].carry).toBeCloseTo(172.5, 1);
  });
  it('a file without a carry column: nothing, nothing guessed', () => {
    expect(parseLaunchCsv('Name,Score\nSascha,82').shots).toEqual([]);
  });
});

describe('club names and numbers', () => {
  it('the names of the makers and of German players', () => {
    const cases: [string, string | null][] = [
      ['Driver', 'Dr'], ['DR', 'Dr'], ['3 Wood', '3W'], ['5W', '5W'], ['Holz 5', '5W'], ['Fairway Wood 7', null],
      ['4 Hybrid', 'Hy'], ['Hybrid 3', '3H'], ['3H', '3H'], ['7 Iron', '7i'], ['7i', '7i'], ['Eisen 7', '7i'], ['I9', '9i'],
      ['Pitching Wedge', 'PW'], ['PW', 'PW'], ['Gap Wedge', 'GW'], ['AW', 'GW'], ['Sand Wedge', 'SW'], ['Lob Wedge', 'LW'],
      ['50°', 'GW'], ['56', 'SW'], ['60 deg', 'LW'], ['Putter', 'Pt'], ['Range Ball', null],
    ];
    for (const [name, want] of cases) expect(clubOf(name)).toBe(want);
  });
  it('numbers: comma or point, units, left as minus', () => {
    expect(num('152,3')).toBeCloseTo(152.3);
    expect(num('152.3 yds')).toBeCloseTo(152.3);
    expect(num('12.4 L')).toBeCloseTo(-12.4);
    expect(num('R 3.1')).toBeCloseTo(3.1);
    expect(num('-5')).toBe(-5);
    expect(num('')).toBeNull();
  });
});

describe('per club', () => {
  it('the median carry, the length band and the side band; clear mishits left out', () => {
    const shots = [150, 148, 152, 147, 155, 151, 149, 60].map((carry, k) => ({ club: '7i' as const, carry, side: [-6, 2, 4, -1, 8, -3, 0, 20][k] }));
    const [c] = summarize(shots);
    expect(c.shots).toBe(7); // the 60 m topped one is out
    expect(c.carry).toBe(150);
    expect(c.len.lo).toBeLessThan(0);
    expect(c.len.hi).toBeGreaterThan(0);
    expect(c.side!.lo).toBeLessThan(0);
    expect(c.side!.hi).toBeGreaterThan(0);
  });
});
