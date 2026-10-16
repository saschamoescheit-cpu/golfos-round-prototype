import { beforeEach, describe, expect, it } from 'vitest';
import { drillKey, exportMarkdown, loadReview, nextOpenDrill, planKey, reviewItems, sectionKey, setMark } from './review';
import { CATEGORIES, DRILLS } from './content';
import { PLANS } from './content/plans';

describe('training review (for the golf pro)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage;
  });

  it('lists every drill, section, fault, video and plan once', () => {
    const items = reviewItems();
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    expect(items.filter((i) => i.kind === 'drill').length).toBe(DRILLS.filter((d) => CATEGORIES.some((c) => c.id === d.cat)).length);
    expect(items.filter((i) => i.kind === 'plan').length).toBe(PLANS.length);
  });

  it('goes through the drills one by one, skipping the reviewed ones', () => {
    const first = nextOpenDrill()!;
    expect(first).toBe(DRILLS.find((d) => d.cat === CATEGORIES[0].id)!.id);
    setMark(drillKey(first), { verdict: 'ok', at: '2026-10-16T20:00:00Z' });
    const second = nextOpenDrill()!;
    expect(second).not.toBe(first);
    expect(nextOpenDrill(second)).not.toBe(second);
  });

  it('exports the marks grouped by topic, cuts and changes first, with notes', () => {
    const putting = CATEGORIES.find((c) => c.id === 'putting')!;
    setMark(drillKey('tiger-gate'), { verdict: 'ok', at: '2026-10-16T20:00:00Z' });
    setMark(drillKey('ladder'), { verdict: 'edit', note: 'Abstände in Metern angeben', at: '2026-10-16T20:01:00Z' });
    setMark(sectionKey('putting', putting.sections[0].title), { verdict: 'cut', at: '2026-10-16T20:02:00Z' });
    setMark(planKey(PLANS[0].id), { verdict: 'ok', at: '2026-10-16T20:03:00Z' });
    const md = exportMarkdown('de', 'Chris');
    expect(md).toContain('# GolfOS Training – Prüfung (Chris)');
    expect(md).toContain('✓ 2 · ✎ 1 · ✕ 1');
    expect(md).toContain('## Putten');
    expect(md).toContain('- ✎ Leiter-Übung – Abstände in Metern angeben');
    expect(md.indexOf('✎ Leiter-Übung')).toBeLessThan(md.indexOf('✓ Tiger-Woods-Tor'));
    expect(md).toContain('## Pläne');
    // removing a mark
    setMark(drillKey('ladder'), null);
    expect(loadReview()[drillKey('ladder')]).toBeUndefined();
  });
});
