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

// Garmin's real exports (26.10.2026, as the open project R10Progress reads them): in the phone's language, tab-separated, the
// club in "Club Type" while "Club Name" is often empty – German ones in metres (club speed 113 km/h, 9-iron carry 88.6 m).
const T = '\t';
const DE_HEAD = ['Datum', 'Spieler', 'Schlägername', 'Schlägerart', 'Schl.gsch.', 'Anstellwinkel', 'Schwungbahn', 'Schlagfläche', 'Schlagflächenstellung', 'Ballgeschwindigkeit', 'Smash-Faktor', 'Abflugwinkel', 'Abflugrichtung', 'Backspin', 'Sidespin', 'Drehrate', 'Drehratentyp', 'Drehachse', 'Höhe des Scheitelpunkts', 'Carry-Distanz', 'Carry-Abweichungswinkel', 'Carry-Abweichungsdistanz', 'Gesamtstrecke', 'Gesamtabweichungswinkel', 'Gesamtabweichungsdistanz', 'Notiz', 'Markierung', 'Luftdichte', 'Temperatur', 'Luftdruck', 'Relative Luftfeuchtigkeit'].join(T);
const DE_ROW = '14.02.24 13:33:18\tAron Schüler\t\tEisen 9\t113.42900776786246\t-3.3086297512054443\t-4.047730445861816\t-1.0483050346374512\t2.9994254112243652\t128.24671443709485\t1.1306341910312527\t22.974985122680664\t-1.3675819635391235\t4863.04638671875\t-644.055908203125\t4905.51025390625\tBerechnet\t7.544279098510742\t14.848843574523926\t88.6080322265625\t1.0706405639648438\t1.655823826789856\t96.77474212646484\t1.2754888534545898\t2.154283046722412\t\t\t1.2277452\t12.777778\t101.169624\t72';

describe('Garmin as it really exports', () => {
  it('German, tab-separated: "Eisen 9" from "Schlägerart" (the name empty), the carry and the deviation, metres', () => {
    const r = parseLaunchCsv(`${DE_HEAD}\n${DE_ROW}\n${DE_ROW.replace('Eisen 9', 'Holz 3').replace('88.6080322265625', '171.2')}\n${DE_ROW.replace('Eisen 9', 'Sandwedge').replace('88.6080322265625', '64.0')}`);
    expect(r.source).toBe('Garmin');
    expect(r.unit).toBe('m');
    expect(r.unitSure).toBe(false); // the file says no unit – shown, switchable
    expect(r.shots.map((s) => s.club)).toEqual(['9i', '3W', 'SW']);
    expect(r.shots[0].carry).toBeCloseTo(88.6, 1);
    expect(r.shots[0].side).toBeCloseTo(1.7, 1);
  });
  it('English: "Club Name" empty or a model, the club from "Club Type"', () => {
    const csv = 'Date,Player,Club Name,Club Type,Club Speed,Carry Distance,Carry Deviation Distance\n1,A,,Driver,98,221,-4\n2,A,Stealth 2,7 Iron,78,148,2';
    expect(parseLaunchCsv(csv).shots.map((s) => s.club)).toEqual(['Dr', '7i']);
  });
  it('Spanish and Dutch headers and club names', () => {
    const es = 'Fecha\tJugador\tTipo de palo\tVel. palo\tDist.​vuelo\tDistancia de desviación de vuelo\tÁngulo de desviación de vuelo\n1\tA\tHierro 7\t120\t135,5\t-3,2\t-1,1\n2\tA\tHíbrido 4\t140\t165\t4\t2';
    const r = parseLaunchCsv(es);
    expect(r.shots.map((s) => s.club)).toEqual(['7i', 'Hy']);
    expect(r.shots[0].carry).toBeCloseTo(135.5, 1);
    expect(r.shots[0].side).toBeCloseTo(-3.2, 1);
    expect(r.unit).toBe('m');
    const nl = 'Datum,Speler,Clubnaam,Type club,Clubsnelh.,Carry-afstand,Carry-afwijkingshoek,Carry-afwijkingsafstand\n1,A,,Driver,150,205,1,6\n2,A,,7 ijzer,120,130,-1,-2';
    expect(parseLaunchCsv(nl).shots.map((s) => [s.club, s.carry, s.side])).toEqual([['Dr', 205, 6], ['7i', 130, -2]]);
  });
});

// Trackman's newer export (as an open fitting app reads it, 26.10.2026): "Carry Flat - Length [yds]", "Carry Flat - Side [yds]";
// "Club" sometimes empty, the club then in "Club (Description)"
describe('Trackman as it really exports', () => {
  it('"Carry Flat - Length/Side [yds]", the club from another column when "Club" is empty', () => {
    const csv = 'Date,Player,Club,Club (Description),Club Speed [mph],Carry Flat - Length [yds],Carry Flat - Side [yds],Carry Flat - Land. Angle [deg],Carry Flat - Hang Time [s]\n1,A,,Driver,102,232.1,-6.4,38,6.2\n2,A,7i,7 Iron,80,152.0,3.1,46,5.8';
    const r = parseLaunchCsv(csv);
    expect(r.unit).toBe('yd');
    expect(r.unitSure).toBe(true);
    expect(r.shots.map((s) => s.club)).toEqual(['Dr', '7i']);
    expect(r.shots[0].carry).toBeCloseTo(232.1 * 0.9144, 0);
    expect(r.shots[0].side).toBeCloseTo(-6.4 * 0.9144, 0);
  });
});

// Foresight FSX's LastShot.CSV (as an open studio project describes it, 26.10.2026): metric, "1w" for the driver, 16777215 where
// the device measured nothing
describe('Foresight FSX as it really exports', () => {
  it('"Carry (m)", "Offline (m)", "1w", the not-measured sentinel as no value', () => {
    const csv = 'Shot ID,Club,Club head Speed (m/s),Ball Speed (m/s),Launch Angle (deg),Azimuth (deg),Side Spin (rpm),Back Spin (rpm),Total Spin (rpm),Descent Angle (deg),Carry (m),Total Distance (m),Offline (m),Peak Height (m)\n1,1w,16777215.000000,68.2,12.1,-1.0,-300,2600,2620,38,214.6,236.0,-7.3,31\n2,7i,16777215.000000,49.1,18.2,0.5,200,6200,6210,47,138.2,145.0,16777215.000000,28';
    const r = parseLaunchCsv(csv);
    expect(r.unit).toBe('m');
    expect(r.shots.map((s) => [s.club, s.carry, s.side])).toEqual([['Dr', 214.6, -7.3], ['7i', 138.2, null]]);
  });
});

// Rapsodo and SkyTrak as an open importer documents them (26.10.2026): Rapsodo with "Average" rows per club, SkyTrak with L/R
describe('Rapsodo and SkyTrak as they really export', () => {
  it('Rapsodo: the "Average" rows are no shots', () => {
    const csv = 'Shot Number,Date,Club Type,Club Brand,Club Model,Ball Speed,Club Speed,Carry Distance,Total Distance,Side Carry\n1,d,7 Iron,X,Y,110,80,150,158,-3\n2,d,7 Iron,X,Y,111,81,154,160,2\nAverage,,7 Iron,,,110.5,80.5,152,159,-0.5';
    const r = parseLaunchCsv(csv);
    expect(r.shots.length).toBe(2);
    expect(r.skipped).toBe(1);
  });
  it('SkyTrak: "Carry (yds)", "Offline (yds)" with L/R', () => {
    const csv = 'Shot,Date,Club,Ball Speed (mph),Club Speed (mph),Launch Angle (deg),Side Angle (deg),Back Spin (rpm),Side Spin (rpm),Carry (yds),Roll (yds),Total (yds),Offline (yds)\n1,d,PW,95,75,26,1,8000,200,112,4,116,3.2 R\n2,d,PW,94,74,27,-1,8200,-300,109,3,112,5.1 L';
    const r = parseLaunchCsv(csv);
    expect(r.unit).toBe('yd');
    expect(r.shots.map((s) => s.club)).toEqual(['PW', 'PW']);
    expect(r.shots[0].side!).toBeGreaterThan(0);
    expect(r.shots[1].side!).toBeLessThan(0);
  });
});
