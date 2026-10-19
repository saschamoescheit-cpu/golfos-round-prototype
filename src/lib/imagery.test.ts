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
  it('uses the German states’ own aerial photos (19.10.2026), each only in its state', () => {
    expect(pickImagery([6.93, 51.27], null).id).toBe('dop-nw'); // Hubbelrath
    expect(pickImagery([7.2359, 51.3147], null).id).toBe('dop-nw'); // Frielinghausen
    expect(pickImagery([11.2, 48.3], null).id).toBe('dop-by'); // Odelzhausen
    expect(pickImagery([13.85, 51.1], null).id).toBe('dop-sn'); // Dresden
    expect(pickImagery([8.68, 50.11], null).id).toBe('dop-he'); // Frankfurt
    expect(pickImagery([9.97, 52.36], null).id).toBe('dop-ni'); // Hannover
    expect(pickImagery([13.4, 52.52], null).id).toBe('dop-bb'); // Berlin
    expect(pickImagery([10.0, 53.55], null).id).toBe('esri'); // Hamburg: no state imagery for the app yet
    expect(imageryOptions(HETZENHOF).map((s) => s.id)).toEqual(['lgl', 'esri']); // Baden-Württemberg as before
    expect(pickImagery([6.1, 50.78], null).id).toBe('dop-nw'); // Aachen, by the border
    expect(pickImagery([5.95, 50.85], null).id).toBe('esri'); // just across in the Netherlands
  });
});
