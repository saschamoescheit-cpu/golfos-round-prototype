import { describe, expect, it } from 'vitest';
import { ImpactCore } from './impact';

const RATE = 48000;
const N = 1024;
const blockMs = (N / RATE) * 1000;
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const noise = (a: number) => Float32Array.from({ length: N }, () => rnd() * a);
/** a bright crack: high-frequency burst that dies away inside the block */
const crack = (a: number) => Float32Array.from({ length: N }, (_, k) => (k % 2 ? 1 : -1) * a * Math.exp(-k / 120) + rnd() * 0.005);
const tone = (a: number, hz: number, from: number) => Float32Array.from({ length: N }, (_, k) => a * Math.sin((2 * Math.PI * hz * (from * N + k)) / RATE));

function run(blocks: Float32Array[]): number {
  const core = new ImpactCore();
  let hits = 0;
  blocks.forEach((b, k) => {
    if (core.feed(b, k * blockMs)) hits++;
  });
  return hits;
}

describe('shot by sound (Sascha 18.10.2026)', () => {
  const quiet = (n: number) => Array.from({ length: n }, () => noise(0.01));
  it('hears the crack of a strike', () => {
    expect(run([...quiet(50), crack(0.7), ...quiet(20)])).toBe(1);
  });
  it('hears a crack that starts at the end of a block', () => {
    const start = Float32Array.from({ length: N }, (_, k) => (k > N - 40 ? (k % 2 ? 1 : -1) * 0.7 * Math.exp(-(k - (N - 40)) / 120) : rnd() * 0.01));
    const rest = Float32Array.from({ length: N }, (_, k) => (k % 2 ? 1 : -1) * 0.7 * Math.exp(-(k + 40) / 120) + rnd() * 0.005);
    expect(run([...quiet(50), start, rest, ...quiet(20)])).toBe(1);
  });
  it('stays quiet in the background', () => {
    expect(run(quiet(200))).toBe(0);
  });
  it('a voice or a lasting sound is no strike', () => {
    expect(run([...quiet(50), ...Array.from({ length: 30 }, (_, k) => tone(0.5, 220, k)), ...quiet(20)])).toBe(0);
  });
  it('a voice that starts suddenly and stops a second later is no strike', () => {
    expect(run([...quiet(50), ...Array.from({ length: 47 }, (_, k) => tone(0.35, 180, k)), ...quiet(20)])).toBe(0);
  });
  it('one strike, not its echo', () => {
    expect(run([...quiet(50), crack(0.7), ...quiet(5), crack(0.5), ...quiet(20)])).toBe(1);
  });
  it('two shots a few seconds apart are two', () => {
    expect(run([...quiet(50), crack(0.7), ...quiet(150), crack(0.7), ...quiet(20)])).toBe(2);
  });
  it('a voice between two shots: both heard, also when the browser hands over 4096 samples at a time (19.10.2026)', () => {
    // 3 s · strike · 2 s · a voice for a second · 2 s · strike – as the test recording
    const blocks = [...quiet(140), crack(0.7), ...quiet(94), ...Array.from({ length: 47 }, (_, k) => tone(0.35, 180, k)), ...quiet(94), crack(0.7), ...quiet(40)];
    expect(run(blocks)).toBe(2);
    for (const per of [2, 4]) {
      // the same sound in bigger blocks
      const core = new ImpactCore();
      let hits = 0;
      for (let k = 0; k + per <= blocks.length; k += per) {
        const big = new Float32Array(N * per);
        for (let j = 0; j < per; j++) big.set(blocks[k + j], j * N);
        if (core.feed(big, k * blockMs)) hits++;
      }
      expect(hits, `blocks of ${N * per}`).toBe(2);
    }
  });
});
