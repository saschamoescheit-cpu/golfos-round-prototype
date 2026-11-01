import { describe, expect, it } from 'vitest';
import { FitVoice, fitOf, fitScreen, fitSpeech, type Fit } from './framing';
import type { Frame } from './measure';

const tr = (_en: string, de: string) => de;
/** a body with every point in the middle; `at` moves single points */
const frame = (at: Record<number, [number, number]> = {}): Frame => ({
  lm: Array.from({ length: 33 }, (_, i) => ({ x: at[i]?.[0] ?? 0.5, y: at[i]?.[1] ?? 0.5, z: 0, v: 0.9 })),
  w: 720,
  h: 1280,
  t: 0,
});

describe('is the player in the picture', () => {
  it('nobody, the feet cut off, the head cut off, both, off the middle, covered, turned the wrong way, fine', () => {
    expect(fitOf(null, [], true)).toBe('none');
    expect(fitOf(frame({ 27: [0.5, 1.04] }), [27], true)).toBe('feet');
    expect(fitOf(frame({ 0: [0.5, -0.03] }), [0], true)).toBe('head');
    expect(fitOf(frame({ 0: [0.5, -0.03], 28: [0.5, 1.1] }), [0, 28], true)).toBe('far');
    expect(fitOf(frame({ 16: [1.05, 0.5] }), [16], true)).toBe('side');
    expect(fitOf(frame(), [25], true)).toBe('hidden');
    expect(fitOf(frame(), [], false)).toBe('turn');
    expect(fitOf(frame(), [], true)).toBe('ok');
  });

  it('says what to do, and "person recognised" when it is fine', () => {
    expect(fitSpeech('feet', 'side', tr)).toMatch(/Füße.*weiter weg.*tiefer/);
    expect(fitSpeech('head', 'side', tr)).toMatch(/Kopf.*höher/);
    expect(fitSpeech('turn', 'side', tr)).toMatch(/seitlich/);
    expect(fitSpeech('turn', 'front', tr)).toMatch(/frontal/);
    expect(fitSpeech('ok', null, tr)).toBe('Person erkannt.');
    for (const f of ['none', 'far', 'feet', 'head', 'side', 'hidden', 'turn', 'ok'] as Fit[]) {
      expect(fitScreen(f, 'front', tr).length, f).toBeGreaterThan(5);
      expect(fitSpeech(f, 'front', tr).length, f).toBeGreaterThan(5);
    }
  });

  it('a hint is said once it lasts 1.5 s, the same one not again before 6 s, "ok" never', () => {
    const v = new FitVoice();
    expect(v.push('feet', 0)).toBeNull();
    expect(v.push('feet', 1000)).toBeNull();
    expect(v.push('feet', 1600)).toBe('feet');
    expect(v.push('feet', 4000)).toBeNull();
    expect(v.push('feet', 7700)).toBe('feet');
    // a new one waits its 1.5 s and not less than 2.5 s after the last sentence
    expect(v.push('head', 8000)).toBeNull();
    expect(v.push('head', 9600)).toBeNull();
    expect(v.push('head', 10300)).toBe('head');
    expect(v.push('ok', 20000)).toBeNull();
    expect(v.push('ok', 30000)).toBeNull();
  });
});
