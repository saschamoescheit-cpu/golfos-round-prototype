import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { CATEGORIES, catById, drillById } from './content';
import { AREAS } from './areas';
import { reviewItems } from './review';
import type { L } from './types';

// The basic swing as the P system (Sascha 17./18.11.2026): its own topic, ten positions from down the line, each with
// its photo (one series, the golfer always on the same spot), what you see, check points, faults and drills.

const filled = (x?: L) => !!x && x.en.trim().length > 3 && x.de.trim().length > 3;

describe('the basic swing (P system)', () => {
  const c = catById('psystem')!;
  const pos = c?.positions ?? [];

  it('is a topic of "Swing and ball flight", first in its area', () => {
    expect(c).toBeTruthy();
    expect(AREAS.find((a) => a.id === 'swing')?.cats[0]).toBe('psystem');
    expect(CATEGORIES.some((x) => x.id === 'psystem')).toBe(true);
  });

  it('has the ten positions in order, each with its photo', () => {
    expect(pos.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
    for (const p of pos) {
      expect(existsSync(`public/training/psystem/${p.photo}`), p.photo).toBe(true);
      expect(p.photoFront, p.id).toBeTruthy();
      expect(existsSync(`public/training/psystem/${p.photoFront}`), p.photoFront).toBe(true);
      expect(t(p.name).startsWith(`${p.id.toUpperCase()} · `), p.id).toBe(true);
    }
  });

  it('every position: what you see, at least three check points, a fault with its fix – both languages', () => {
    for (const p of pos) {
      expect(filled(p.short), p.id).toBe(true);
      expect(p.look.length && p.look.every(filled), p.id).toBeTruthy();
      expect(p.checks.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.checks.every((r) => filled(r.v)), p.id).toBe(true);
      expect(p.faults.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.faults.every((f) => filled(f.name) && filled(f.fix)), p.id).toBe(true);
    }
  });

  it('the drills exist in the library', () => {
    for (const p of pos) for (const d of p.drills ?? []) expect(drillById(d), `${p.id} ${d}`).toBeTruthy();
    expect(pos.every((p) => (p.drills ?? []).length > 0)).toBe(true);
  });

  it('Sascha\'s rules are in the texts: feet parallel and still, no standing up until P9, P3 on one line', () => {
    const de = (id: string) => JSON.stringify(pos.find((p) => p.id === id));
    expect(de('p1')).toContain('parallel zur Ziellinie');
    expect(de('p3')).toContain('rechte Schulter');
    expect(de('p3')).toContain('auf den Ball');
    expect(de('p8')).toContain('Kein Aufrichten');
    expect(de('p9')).toContain('noch geneigt');
  });

  it('our pro can review every position', () => {
    const keys = reviewItems().filter((i) => i.kind === 'position').map((i) => i.key);
    expect(keys).toEqual(pos.map((p) => `pos:psystem:${p.id}`));
  });
});

function t(x: L): string {
  return x.de;
}
