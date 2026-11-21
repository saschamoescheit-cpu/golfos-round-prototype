import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { catById, drillById } from './content';
import type { L } from './types';

// The standard chip as photos (Sascha 21.11.2026, mockup B): C1–C4, each from behind and from the front – the photos
// must be there (they come from ChatGPT, checked by our pro), so this fails until they are.

const filled = (x?: L) => !!x && x.en.trim().length > 3 && x.de.trim().length > 3;

describe('the standard chip as photos', () => {
  const shot = catById('chipping')?.shots?.find((s) => s.id === 'chip-standard');
  const pos = shot?.positions ?? [];

  it('has C1–C4 in order, each from behind and from the front', () => {
    expect(pos.map((p) => p.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    for (const p of pos) {
      expect(existsSync(`public/training/${p.photo}`), p.photo).toBe(true);
      expect(existsSync(`public/training/${p.photoFront}`), p.photoFront).toBe(true);
      expect(p.name.en.startsWith(`${p.id.toUpperCase()} · `), p.id).toBe(true);
    }
  });

  it('every position: what you see, check points incl. the clubface, a fault – both languages; the drills exist', () => {
    for (const p of pos) {
      expect(filled(p.short) && p.look.every(filled), p.id).toBe(true);
      expect(p.checks.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.checks.every((r) => filled(r.v)), p.id).toBe(true);
      expect(p.faults.length && p.faults.every((f) => filled(f.name) && filled(f.fix)), p.id).toBeTruthy();
      for (const d of p.drills ?? []) expect(drillById(d), `${p.id} ${d}`).toBeTruthy();
    }
    // the clubface matters most (Sascha 20.11.2026): it is checked at address, at the top and in the finish
    for (const id of ['c1', 'c2', 'c4']) expect(pos.find((p) => p.id === id)?.checks.some((r) => r.k === 'face'), id).toBe(true);
  });
});
