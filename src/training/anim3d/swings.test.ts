import { describe, expect, it } from 'vitest';
import { PAIRS, SWINGS } from './swings';

// under every 3D video the step is named from the first moment on (a step without words showed only its number)
describe('the 3D swings', () => {
  it('every video starts with a named step, the keys run forward in time', () => {
    const all = [...Object.entries(SWINGS), ...Object.entries(PAIRS).map(([id, p]) => [id, p.fault] as const)];
    for (const [id, sw] of all) {
      expect(sw.keys[0].label, id).toBeTruthy();
      sw.keys.forEach((k, i) => i && expect(k.t, `${id} key ${i}`).toBeGreaterThanOrEqual(sw.keys[i - 1].t));
      if (sw.hit) expect(sw.hit.at, id).toBeLessThanOrEqual(sw.keys[sw.keys.length - 1].t);
    }
  });
});
