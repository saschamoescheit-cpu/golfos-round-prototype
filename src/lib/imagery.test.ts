import { describe, expect, it } from 'vitest';
import { imageryOptions, pickImagery } from './imagery';

const SON_QUINT: [number, number] = [2.6031, 39.5955];
const HETZENHOF: [number, number] = [9.73, 48.83];
const LISBON: [number, number] = [-9.14, 38.72];
const BADAJOZ: [number, number] = [-6.97, 38.88];

describe('imagery', () => {
  it('uses the Spanish orthophoto in Spain and Esri elsewhere', () => {
    expect(pickImagery(SON_QUINT, null).id).toBe('pnoa');
    expect(pickImagery(BADAJOZ, null).id).toBe('pnoa');
    expect(pickImagery(HETZENHOF, null).id).toBe('lgl');
    expect(pickImagery(LISBON, null).id).toBe('esri');
  });
  it('keeps the player’s choice where it is available', () => {
    expect(pickImagery(SON_QUINT, 'esri').id).toBe('esri');
    expect(pickImagery(HETZENHOF, 'pnoa').id).toBe('lgl');
    expect(pickImagery(HETZENHOF, 'esri').id).toBe('esri');
    expect(imageryOptions(HETZENHOF).map((s) => s.id)).toEqual(['lgl', 'esri']);
    expect(imageryOptions(SON_QUINT).map((s) => s.id)).toEqual(['pnoa', 'esri']);
  });
});
