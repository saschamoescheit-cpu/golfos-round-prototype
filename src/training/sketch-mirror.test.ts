import { describe, expect, it } from 'vitest';
import { swapSides } from './Sketch';

// Left-handers (Sascha 17.10.2026): the sketches are mirrored, so the side words in their texts swap with them.
describe('side words of a mirrored sketch', () => {
  it('swaps right and left, also in compounds and inflections', () => {
    expect(swapSides('Von vorn, Ziel rechts.')).toBe('Von vorn, Ziel links.');
    expect(swapSides('Slice: startet leicht links, dreht stark nach rechts.')).toBe('Slice: startet leicht rechts, dreht stark nach links.');
    expect(swapSides('die rechte Hand beim Rechtshänder')).toBe('die linke Hand beim Linkshänder');
    expect(swapSides('Face-on, target to the right (right-hander).')).toBe('Face-on, target to the left (left-hander).');
  });
  it('leaves other words alone', () => {
    expect(swapSides('Linksrum? Rechtschreibung, leftover, upright')).toBe('Linksrum? Rechtschreibung, leftover, upright');
  });
});
