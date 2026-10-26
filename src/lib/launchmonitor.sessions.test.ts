import { describe, expect, it } from 'vitest';
import { measuredAtOf, mergeLaunch, parseLaunchCsv, proposeNew, whenOf, type LmClub, type LmData, type LmSession } from './launchmonitor';

// Every measurement, the day, sessions (Sascha 26.10.2026: Garmin R10, Trackman, Foresight to begin with; new sessions add
// to the old ones, a club measured again: the newer proposed, the player decides; the values 1:1).

// the German R10 export's own header (a friend's session showed it, 26.10.2026) – the values here are made up
const R10_DE = `Datum,Spieler,Schlägername,Marke/Modell,Schlägerart,Schl.gsch.,Anstellwinkel,Schwungbahn,Schlagfläche,Schlagflächenstellung,Ballgeschwindigkeit,Smash Factor,Abflugwinkel,Abflugrichtung,Backspin,Sidespin,Drehrate,Drehratentyp,Drehachse,Höhe des Scheitelpunkts,Carry-Distanz,Carry-Abweichungswinkel,Carry-Abweichungsdistanz,Gesamt​strecke,Gesamtabweichungswinkel,Gesamtabweichungsdistanz,Notiz,Markierung,Luftdichte,Temperatur,Luftdruck,Relative Luftfeuchtigkeit,Rückschw.zeit,Durchschw.zeit,Schwungtempo
,,,,,[mph],[deg],[deg],[deg],[deg],[mph],,[deg],[deg],[1/m.],[1/m.],[1/m.],,[deg],[m],[m],[deg],[m],[m],[deg],[m],,,[g/L],[deg C],[kPa],[%],[s],[s],
15.11.25 22:09:37,Alex,,,Eisen 7,85.0,-0.5,0.5,-3.0,-3.5,120.0,1.41,16.2,-2.4,4349.0,334.6,4361.9,Berechnet,-4.4,26.1,159.1,-4.7,-13.0,169.3,-4.8,-14.1,,,1.19,9.4,101.0,0,094,013,7.4
15.11.25 22:20:43,Alex,,,Pitching-Wedge,86.0,0.0,4.2,-0.7,-4.9,101.2,1.18,29.5,-0.1,8500.0,-700.0,8553.0,Berechnet,-4.7,34.4,109.0,-1.9,-3.6,110.8,-2.0,-3.9,,,1.20,9.0,101.0,0,085,013,6.5`;

const GARMIN_EN = `Date,Player,Club Name,Club Type,Club Speed,Ball Speed,Launch Angle,Backspin,Carry Distance,Carry Deviation Angle,Carry Deviation Distance,Total Distance,Total Deviation Distance
,,,,[mph],[mph],[deg],[rpm],[yds],[deg],[yds],[yds],[yds]
10/25/26 9:01 AM,Alex,Driver,Driver,98.2,141.0,12.1,2650,221.4,-1.2,-4.6,240.1,-6.0`;

describe('every measurement of a shot (Range-Sitzung)', () => {
  it('Garmin R10 in German: speeds from mph to km/h, the swing times in hundredths, the day – carry as measured', () => {
    const r = parseLaunchCsv(R10_DE);
    expect(r.source).toBe('Garmin');
    expect(r.unit).toBe('m');
    const s = r.shots[0];
    expect(s).toMatchObject({ club: '7i', carry: 159.1, side: -13, total: 169.3, apex: 26.1, smash: 1.41, attack: -0.5, path: 0.5, face: -3, faceToPath: -3.5, launch: 16.2, dir: -2.4, sideAngle: -4.7, spin: 4362, temp: 9.4, backSec: 0.94, downSec: 0.13, tempo: 7.4, at: '2025-11-15T22:09:37' });
    expect(s.clubSpeed).toBeCloseTo(136.8, 1);
    expect(s.ballSpeed).toBeCloseTo(193.1, 1);
    expect(r.shots[1].club).toBe('PW');
    expect(measuredAtOf(r.shots)).toBe('2025-11-15T22:09:37');
  });
  it('Garmin in English: the US date with AM/PM', () => {
    const s = parseLaunchCsv(GARMIN_EN).shots[0];
    expect(s.at).toBe('2026-10-25T09:01:00');
    expect(s.clubSpeed).toBeCloseTo(98.2 * 1.609344, 1);
    expect(s.launch).toBe(12.1);
    expect(s.spin).toBe(2650);
  });
  it('Trackman by its own columns: yards and feet to metres, mph to km/h', () => {
    const csv = `Date,Club,Club Speed,Attack Angle,Club Path,Dyn. Loft,Face Angle,Spin Loft,Face To Path,Ball Speed,Smash Factor,Launch Angle,Launch Direction,Spin Rate,Spin Axis,Height,Carry,Carry Side,Total,Land. Angle
,,[mph],[deg],[deg],[deg],[deg],[deg],[deg],[mph],,[deg],[deg],[rpm],[deg],[ft],[yds],[yds],[yds],[deg]
2026-10-28 18:05:12,7 Iron,88.0,-4.1,1.2,20.1,2.0,24.2,0.8,119.0,1.35,16.0,1.9,6900,3.1,90.0,170.0,4.0,178.0,47.0`;
    const r = parseLaunchCsv(csv);
    expect(r.source).toBe('Trackman');
    const s = r.shots[0];
    expect(s.club).toBe('7i');
    expect(s.carry).toBeCloseTo(155.4, 1);
    expect(s.side).toBeCloseTo(3.7, 1);
    expect(s.apex).toBeCloseTo(27.4, 1);
    expect(s.total).toBeCloseTo(162.8, 1);
    expect(s.clubSpeed).toBeCloseTo(141.6, 1);
    expect(s).toMatchObject({ attack: -4.1, path: 1.2, face: 2, faceToPath: 0.8, launch: 16, dir: 1.9, spin: 6900, at: '2026-10-28T18:05:12' });
  });
  it('Foresight (FSX) by its own columns: azimuth, efficiency, "L" for left', () => {
    const csv = `Club,Ball Speed,Launch Angle,Azimuth,Back Spin,Side Spin,Total Spin,Carry,Total,Offline,Peak Height,Descent Angle,Club Speed,Efficiency,Angle of Attack,Club Path,Face to Target
,mph,deg,deg,rpm,rpm,rpm,yds,yds,yds,yds,deg,mph,,deg,deg,deg
7i,118.0,17.0,L 1.5,6600,-300,6607,165.0,172.0,L 6.0,31.0,48.0,87.0,1.36,-3.5,-2.0,-1.0`;
    const r = parseLaunchCsv(csv);
    expect(r.source).toBe('Foresight');
    const s = r.shots[0];
    expect(s.dir).toBe(-1.5);
    expect(s.side).toBeCloseTo(-5.5, 1);
    expect(s).toMatchObject({ smash: 1.36, attack: -3.5, path: -2, face: -1, spin: 6607, launch: 17 });
    expect(s.apex).toBeCloseTo(28.3, 1);
  });
  it('the times as the devices write them', () => {
    expect(whenOf('2026-10-28')).toBe('2026-10-28T00:00:00');
    expect(whenOf('15.11.2025 07:05')).toBe('2025-11-15T07:05:00');
    expect(whenOf('10/25/26 12:30 PM')).toBe('2026-10-25T12:30:00');
    expect(whenOf('25/10/2026 9:00')).toBe('2026-10-25T09:00:00');
    expect(whenOf('Session 3')).toBeNull();
  });
});

describe('sessions add up', () => {
  const sess = (id: string, measuredAt: string | null): LmSession => ({ id, source: 'Garmin', file: `${id}.csv`, importedAt: '2026-10-26T10:00:00Z', measuredAt, shots: [] });
  const club = (c: '7i' | 'PW' | '4i', carry: number): LmClub => ({ club: c, shots: 10, carry, len: { lo: -5, hi: 5 }, side: { lo: -8, hi: 8 } });
  it('a new session adds its clubs; a club measured before is replaced unless kept; every session stays', () => {
    const a = mergeLaunch(null, sess('a', '2025-11-15T22:00:00'), [club('7i', 159), club('PW', 117)]);
    expect(a.clubs.map((c) => [c.club, c.carry, c.session])).toEqual([['7i', 159, 'a'], ['PW', 117, 'a']]);
    const b = mergeLaunch(a, sess('b', '2026-10-28T18:00:00'), [club('4i', 170), club('7i', 163)]);
    expect(b.clubs.map((c) => [c.club, c.carry])).toEqual([['4i', 170], ['7i', 163], ['PW', 117]]);
    expect(b.sessions!.map((s) => s.id)).toEqual(['a', 'b']);
    const kept = mergeLaunch(a, sess('b', '2026-10-28T18:00:00'), [club('7i', 163)], ['7i']);
    expect(kept.clubs.find((c) => c.club === '7i')!.carry).toBe(159);
    expect(kept.clubs.find((c) => c.club === '7i')!.session).toBe('a');
  });
  it('the newer measurement is proposed – a file without dates counts as new', () => {
    const old: LmClub = { ...club('7i', 159), measuredAt: '2025-11-15T22:00:00' };
    expect(proposeNew(old, '2026-10-28T18:00:00')).toBe(true);
    expect(proposeNew(old, '2025-01-02T10:00:00')).toBe(false);
    expect(proposeNew(old, null)).toBe(true);
    expect(proposeNew({ ...old, measuredAt: null }, '2025-01-02T10:00:00')).toBe(true);
  });
  it('data kept before sessions existed still works', () => {
    const before: LmData = { importedAt: '2026-10-25T20:00:00Z', source: 'Garmin', file: 'x.csv', clubs: [club('7i', 150)] };
    const m = mergeLaunch(before, sess('c', null), [club('PW', 110)]);
    expect(m.clubs.map((c) => c.club)).toEqual(['7i', 'PW']);
    expect(m.sessions!.length).toBe(1);
  });
});
