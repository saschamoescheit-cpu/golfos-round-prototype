import { describe, expect, it } from 'vitest';
import { swapSides } from './sides';

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
  it('English "right" as "correct" and "left" as "remaining" stay', () => {
    expect(swapSides('a putt with the right speed; take the right amount of sand')).toBe('a putt with the right speed; take the right amount of sand');
    expect(swapSides('Never the right length – the distance that is left')).toBe('Never the right length – the distance that is left');
    expect(swapSides('curves to the right; the right side; aim left')).toBe('curves to the left; the left side; aim right');
    expect(swapSides('Lead hand (left for right-handers)')).toBe('Lead hand (right for left-handers)');
  });
});
