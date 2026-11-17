import { beforeEach, describe, expect, it } from 'vitest';
import { compose, DEFAULT_WISH, faultOf, fits, focusOf, history, minutesOf, readWish, remember, topicOf, total, upgrade, whereOf, type Wish } from './caddiePlan';
import { CATEGORIES, drillById } from './content';

// The caddie puts a session together (Sascha 17.11.2026): "30 Minuten Putten, Richtungskontrolle" → a session of
// putting drills on the start line that fills 30 minutes; the next day other drills first; "wie letztes Mal" possible.
// The night after: faults, the rounds, the place, several topics.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
const one = (minutes: number, cat: Wish['parts'][0]['cat'], focus: Wish['parts'][0]['focus'] = 'mixed', where: Wish['where'] = 'any'): Wish => ({ parts: [{ minutes, cat, focus }], where });
const faultName = (cat: string, i?: number) => (i == null ? null : CATEGORIES.find((c) => c.id === cat)?.faults?.[i]?.name.en);

describe('the wish in words', () => {
  it('reads the time', () => {
    expect(minutesOf('Ich habe 30 Minuten Zeit')).toBe(30);
    expect(minutesOf('eine halbe Stunde')).toBe(30);
    expect(minutesOf('1 h')).toBe(60);
    expect(minutesOf('an hour of chipping')).toBe(60);
    expect(minutesOf('45 min')).toBe(45);
    expect(minutesOf('Putten')).toBeNull();
  });
  it('reads topic, focus and place', () => {
    expect(topicOf('Putten Richtungskontrolle')).toBe('putting');
    expect(topicOf('Grün lesen üben')).toBe('greenreading');
    expect(topicOf('Lob shot')).toBe('lob');
    expect(topicOf('Abschlag mit dem Driver')).toBe('driver');
    expect(topicOf('auf dem Puttinggrün chippen')).toBe('chipping');
    expect(focusOf('Putten Richtungskontrolle')).toBe('direction');
    expect(focusOf('Tempo beim Putten')).toBe('distance');
    expect(focusOf('Chippen')).toBe('mixed');
    expect(whereOf('im Wohnzimmer putten')).toBe('home');
    expect(whereOf('auf der Range')).toBe('range');
    expect(whereOf('auf dem Puttinggrün')).toBe('green');
    expect(whereOf('Putten')).toBeNull();
  });
  it('reads faults – in the player\'s words', () => {
    const f = (t: string) => {
      const r = faultOf(t);
      return r && `${r.cat}: ${faultName(r.cat, r.fault)}`;
    };
    expect(f('ich slice immer')).toBe('ballflight: Slice');
    expect(f('mein Slice vom Abschlag')).toBe('driver: Slice off the tee');
    expect(f('meine Chips sind fett')).toBe('chipping: Fat chip (chunk)');
    expect(f('zu viele 3-Putts')).toBe('putting: Three-putts from distance');
    expect(f('ich komme nicht aus dem Bunker raus')).toBe('bunker: Ball stays in the bunker');
    expect(f('Kerze beim Drive')).toBe('driver: Sky ball (pop-up)');
    expect(f('30 Minuten Putten')).toBeNull();
  });
  it('the whole wish: what it does not name stays', () => {
    const r = readWish('Ich habe jetzt 30 Minuten Zeit und will Putten Richtungskontrolle üben', one(60, 'irons'));
    expect(r.wish).toEqual(one(30, 'putting', 'direction'));
    expect(readWish('45 Minuten', r.wish).wish).toEqual(one(45, 'putting', 'direction'));
    expect(readWish('Chippen zu Hause', r.wish).wish).toEqual({ parts: [{ minutes: 30, cat: 'chipping', focus: 'mixed' }], where: 'home' });
    expect(readWish('hallo', r.wish).unknown).toBe(true);
  });
  it('a fault becomes the part\'s fault, with its topic', () => {
    const r = readWish('20 Minuten, ich slice vom Abschlag', DEFAULT_WISH).wish.parts[0];
    expect(r.cat).toBe('driver');
    expect(faultName('driver', r.fault)).toBe('Slice off the tee');
    expect(r.minutes).toBe(20);
    const c = readWish('meine Chips sind fett', DEFAULT_WISH).wish.parts[0];
    expect([c.cat, faultName('chipping', c.fault)]).toEqual(['chipping', 'Fat chip (chunk)']);
  });
  it('several topics: "20 Minuten Putten und 20 Minuten Chippen"', () => {
    const w = readWish('20 Minuten Putten und 20 Minuten Chippen', DEFAULT_WISH).wish;
    expect(w.parts.map((p) => [p.cat, p.minutes])).toEqual([['putting', 20], ['chipping', 20]]);
    const shared = readWish('eine Stunde Putten, Chippen und Bunker', DEFAULT_WISH).wish;
    expect(shared.parts.map((p) => p.cat)).toEqual(['putting', 'chipping', 'bunker']);
    expect(shared.parts.reduce((s, p) => s + p.minutes, 0)).toBe(60);
    // a comma inside one topic is no second topic
    expect(readWish('30 Minuten Putten, Richtung', DEFAULT_WISH).wish.parts.length).toBe(1);
  });
  it('the rounds: "Was soll ich üben?" takes the biggest weak spot; without rounds it says so', () => {
    const advice = [{ cat: 'putting' as const, why: '3-Putts 0,4 je Runde' }, { cat: 'chipping' as const, why: 'Up & Down 20 %' }];
    const r = readWish('Was soll ich üben?', one(30, 'irons'), advice);
    expect(r.wish.parts.map((p) => p.cat)).toEqual(['putting']);
    expect(r.why).toContain('3-Putts');
    const two = readWish('Ich habe eine Stunde – was soll ich üben?', one(30, 'irons'), advice).wish;
    expect(two.parts.map((p) => [p.cat, p.minutes])).toEqual([['putting', 30], ['chipping', 30]]);
    expect(readWish('Was soll ich üben?', one(30, 'irons'), []).noRounds).toBe(true);
  });
  it('a wish kept from before (one topic) still opens', () => {
    expect(upgrade({ minutes: 30, cat: 'putting', focus: 'direction', home: true })).toEqual(one(30, 'putting', 'direction', 'home'));
  });
});

describe('the session', () => {
  it('fills the time with drills of the topic, the ones on the focus first', () => {
    const s = compose(one(30, 'putting', 'direction'), { seed: 7 });
    expect(total(s)).toBe(30);
    expect(s.length).toBeGreaterThanOrEqual(2);
    for (const i of s) {
      const d = drillById(i.drill)!;
      expect(d.cat === 'putting' || d.also?.includes('putting'), i.drill).toBe(true);
      expect(i.minutes).toBeGreaterThanOrEqual(5);
    }
    expect(fits(drillById(s[0].drill)!, 'direction')).toBeGreaterThan(0);
  });
  it('a fault: its drills first', () => {
    const fault = CATEGORIES.find((c) => c.id === 'chipping')!.faults!.findIndex((f) => f.name.en === 'Fat chip (chunk)');
    const drills = CATEGORIES.find((c) => c.id === 'chipping')!.faults![fault].drills!;
    const s = compose({ parts: [{ minutes: 20, cat: 'chipping', focus: 'mixed', fault }], where: 'any' }, { seed: 4 });
    expect(drills).toContain(s[0].drill);
  });
  it('several parts: each fills its time, no drill twice', () => {
    const s = compose({ parts: [{ minutes: 20, cat: 'putting', focus: 'mixed' }, { minutes: 20, cat: 'chipping', focus: 'mixed' }], where: 'any' }, { seed: 9 });
    expect(total(s.filter((i) => i.part === 0))).toBe(20);
    expect(total(s.filter((i) => i.part === 1))).toBe(20);
    expect(new Set(s.map((i) => i.drill)).size).toBe(s.length);
  });
  it('the next day other drills first – the one before can come back', () => {
    const w = one(30, 'putting', 'direction');
    const first = compose(w, { seed: 1 });
    remember(w, first);
    expect(history(w)[0].items).toEqual(first);
    const next = compose(w, { seed: 2 });
    expect(next.filter((i) => first.some((f) => f.drill === i.drill)).length).toBeLessThan(first.length);
    expect(total(next)).toBe(30);
  });
  it('every topic and length gives a session that fills the time', () => {
    for (const cat of ['putting', 'chipping', 'pitching', 'bunker', 'irons', 'driver', 'woods', 'greenreading'] as const)
      for (const minutes of [15, 30, 60]) {
        const s = compose(one(minutes, cat), { seed: 3 });
        expect(s.length, `${cat} ${minutes}`).toBeGreaterThan(0);
        expect(total(s), `${cat} ${minutes}`).toBe(minutes);
      }
  });
  it('a place: only drills for there when the topic has some', () => {
    expect(compose(one(20, 'putting', 'mixed', 'home'), { seed: 5 }).every((i) => drillById(i.drill)!.place === 'home')).toBe(true);
    expect(compose(one(30, 'irons', 'mixed', 'range'), { seed: 5 }).every((i) => drillById(i.drill)!.place === 'range')).toBe(true);
  });
});
