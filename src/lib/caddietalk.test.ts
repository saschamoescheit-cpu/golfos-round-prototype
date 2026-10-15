import { describe, expect, it } from 'vitest';
import { SEED_GEOMETRY } from '../data/seedGeometry';
import { bearingDeg, holeMapData, lineLength, pointAt, woodsOf } from './geo';
import { caddieAdvice } from './caddieplan';
import { DEFAULT_CARRY } from './caddie';
import { withPartials } from './partials';
import { loadHoleNotes } from './holenotes';
import { answer, summary } from './caddietalk';
import { setLang } from './i18n';

// The caddie talks like a caddie (Sascha 15.10.2026): the usual club and why it is another today, the flag, the
// plan for the hole – also when read aloud.
const HET = 'osm:relation/1326323';
const geo = SEED_GEOMETRY[HET];
const bag = withPartials(DEFAULT_CARRY);
setLang('de');

function approach(windKmh: number, fromRel: number, pinOffset = 0) {
  const data = holeMapData(geo, 'A', 1)!;
  const from = pointAt(data.line, lineLength(data.line) - 150);
  const b = bearingDeg(from, data.greenCenter);
  // the pin moved along the line of play (+ = back)
  const r = ((b * Math.PI) / 180);
  const pin: [number, number] = [data.greenCenter[0] + (pinOffset * Math.sin(r)) / (111320 * Math.cos((data.greenCenter[1] * Math.PI) / 180)), data.greenCenter[1] + (pinOffset * Math.cos(r)) / 111320];
  return caddieAdvice({
    data, par: 4, holeIndex: 0, holeCount: 18, from, teeShot: false, pin, targets: [], teeAim: null, slopes: geo.fairwaySlopes?.['1A'], boundary: geo.boundary, trees: geo.trees, woods: woodsOf(geo),
    bag, conditions: { windKmh, gustKmh: windKmh, windFromDeg: (b + fromRel + 360) % 360, tempC: 15 }, tendency: new Map(), note: loadHoleNotes(HET)['1A'], style: 'normal', favourite: 90, lieChoice: null, unit: 'm', playing: 18,
    wind: { windKmh, gustKmh: windKmh, label: 'Böig' },
  });
}

describe('caddie talk', () => {
  it('into a strong wind: the usual club, the wind and today’s club', () => {
    const cad = approach(30, 0);
    expect(cad.facts.clubTalk).toMatch(/^Normal wäre das dein .+ – mit 30 km\/h Gegenwind \(\+\d+ m\) heute das /);
    expect(cad.lines.find((l) => l.lead)?.text).toBe(cad.facts.clubTalk + '.');
    expect(summary(cad.facts)).toContain(cad.facts.clubTalk!);
    expect(answer('Wie ist der Wind?', cad.facts)).toContain('Gegenwind');
  });
  it('downwind: a shorter club than usual', () => {
    const cad = approach(30, 180);
    expect(cad.facts.clubTalk).toMatch(/Rückenwind \(−\d+ m\)/);
  });
  it('no wind: no club talk and no wind words read aloud', () => {
    const cad = approach(2, 0);
    expect(cad.facts.clubTalk).toBeNull();
    expect(summary(cad.facts)).not.toMatch(/Wind:/);
  });
  it('names where the flag stands', () => {
    const cad = approach(0, 0, 10);
    expect(cad.facts.pinSpot).toBe('hinten');
    expect(cad.lines.some((l) => l.text.startsWith('Die Fahne steht hinten'))).toBe(true);
    expect(answer('Wo steht die Fahne?', cad.facts)).toBe('Die Fahne steht hinten.');
  });
  it('reads the plan for the hole on the tee', () => {
    const data = holeMapData(geo, 'A', 1)!;
    const note = loadHoleNotes(HET)['1A'];
    const cad = caddieAdvice({ data, par: 4, holeIndex: 0, holeCount: 18, from: data.tee, teeShot: true, pin: data.greenCenter, targets: [], teeAim: null, boundary: geo.boundary, bag, conditions: null, tendency: new Map(), note, lieChoice: null, unit: 'm' });
    expect(note.tip).toBeTruthy();
    expect(summary(cad.facts)).toContain(`Der Plan für dieses Loch: ${note.tip}`);
    expect(answer('Was ist der Plan?', cad.facts)).toContain(note.tip!);
  });
});
