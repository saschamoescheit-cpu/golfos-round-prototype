import { beforeEach, describe, expect, it } from 'vitest';
import { compose, fits, focusOf, minutesOf, readWish, remember, history, topicOf, total, type Wish } from './caddiePlan';
import { drillById } from './content';

// The caddie puts a session together (Sascha 17.11.2026): "30 Minuten Putten, Richtungskontrolle" → a session of
// putting drills on the start line that fills 30 minutes; the next day other drills first; "wie letztes Mal" possible.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
const start: Wish = { minutes: 30, cat: 'putting', focus: 'mixed', home: false };

describe('the wish in words', () => {
  it('reads the time', () => {
    expect(minutesOf('Ich habe 30 Minuten Zeit')).toBe(30);
    expect(minutesOf('eine halbe Stunde')).toBe(30);
    expect(minutesOf('1 h')).toBe(60);
    expect(minutesOf('an hour of chipping')).toBe(60);
    expect(minutesOf('45 min')).toBe(45);
    expect(minutesOf('Putten')).toBeNull();
  });
  it('reads topic and focus', () => {
    expect(topicOf('Putten Richtungskontrolle')).toBe('putting');
    expect(topicOf('Grün lesen üben')).toBe('greenreading');
    expect(topicOf('Lob shot')).toBe('lob');
    expect(topicOf('Abschlag mit dem Driver')).toBe('driver');
    expect(focusOf('Putten Richtungskontrolle')).toBe('direction');
    expect(focusOf('Tempo beim Putten')).toBe('distance');
    expect(focusOf('Chippen')).toBe('mixed');
  });
  it('the whole wish: what it does not name stays', () => {
    const w = readWish('Ich habe jetzt 30 Minuten Zeit und will Putten Richtungskontrolle üben', { ...start, minutes: 60, cat: 'irons' });
    expect(w).toEqual({ minutes: 30, cat: 'putting', focus: 'direction', home: false });
    expect(readWish('45 Minuten', w)).toEqual({ ...w, minutes: 45 });
    expect(readWish('Chippen zu Hause', w)).toMatchObject({ cat: 'chipping', focus: 'mixed', home: true });
  });
});

describe('the session', () => {
  it('fills the time with drills of the topic, the ones on the focus first', () => {
    const w: Wish = { minutes: 30, cat: 'putting', focus: 'direction', home: false };
    const s = compose(w, { seed: 7 });
    expect(total(s)).toBe(30);
    expect(s.length).toBeGreaterThanOrEqual(2);
    for (const i of s) {
      const d = drillById(i.drill)!;
      expect(d, i.drill).toBeTruthy();
      expect(d.cat === 'putting' || d.also?.includes('putting'), i.drill).toBe(true);
      expect(i.minutes).toBeGreaterThanOrEqual(5);
    }
    expect(fits(drillById(s[0].drill)!, 'direction')).toBeGreaterThan(0);
  });
  it('the next day other drills first – the one before can come back', () => {
    const w: Wish = { minutes: 30, cat: 'putting', focus: 'direction', home: false };
    const first = compose(w, { seed: 1 });
    remember(w, first);
    expect(history(w)[0].items).toEqual(first);
    const next = compose(w, { seed: 2 });
    const again = next.filter((i) => first.some((f) => f.drill === i.drill));
    expect(again.length).toBeLessThan(first.length);
    expect(total(next)).toBe(30);
  });
  it('every topic and length gives a session that fills the time', () => {
    for (const cat of ['putting', 'chipping', 'pitching', 'bunker', 'irons', 'driver', 'woods', 'greenreading'] as const)
      for (const minutes of [15, 30, 60]) {
        const s = compose({ minutes, cat, focus: 'mixed', home: false }, { seed: 3 });
        expect(s.length, `${cat} ${minutes}`).toBeGreaterThan(0);
        expect(total(s), `${cat} ${minutes}`).toBe(minutes);
      }
  });
  it('at home only drills for home when the topic has some', () => {
    const s = compose({ minutes: 20, cat: 'putting', focus: 'mixed', home: true }, { seed: 5 });
    expect(s.every((i) => drillById(i.drill)!.place === 'home')).toBe(true);
  });
});
