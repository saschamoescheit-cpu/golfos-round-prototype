import { describe, expect, it } from 'vitest';
import { setLang } from '../lib/i18n';
import { windSide } from './WindTag';

setLang('de');

// where the wind comes from against the line of play (Sascha 25.10.2026) – playing north (0°)
describe('wind against the line of play', () => {
  it('names head, tail, side and the diagonals both ways', () => {
    expect(windSide(0, 0, 20)).toBe('Gegenwind');
    expect(windSide(180, 0, 20)).toBe('Rückenwind');
    expect(windSide(90, 0, 20)).toBe('Wind von rechts');
    expect(windSide(270, 0, 20)).toBe('Wind von links');
    expect(windSide(45, 0, 20)).toBe('Gegenwind von rechts');
    expect(windSide(225, 0, 20)).toBe('Rückenwind von links');
    expect(windSide(225, 0, 3)).toBe('Windstill');
  });
  it('turns with the line of play', () => {
    expect(windSide(300, 300, 20)).toBe('Gegenwind');
    expect(windSide(120, 300, 20)).toBe('Rückenwind');
    expect(windSide(10, 350, 20)).toBe('Gegenwind');
  });
});
