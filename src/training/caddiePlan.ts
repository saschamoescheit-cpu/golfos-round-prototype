import { DRILLS, drillsOf } from './content';
import type { CategoryId, Drill } from './types';

// The caddie puts a session together (Sascha 17.11.2026: "dem Caddie sagen, dass man jetzt 30 Minuten Zeit hat und
// Putten Richtungskontrolle üben will – die App stellt einen Trainingsplan zusammen. Am Tag danach nicht wieder die
// gleichen Übungen, es soll ja Spaß machen; der User kann entscheiden, ob gleiche oder neue"). In Training › Üben, at
// the top: a spoken or typed wish ("30 Minuten Putten, Richtung") becomes time, topic and focus – shown as rows to
// change – and from them a session of drills that fills the time. New drills by default; "Wie letztes Mal" brings
// back the session last started for the same wish.

export type Focus = 'mixed' | 'direction' | 'distance' | 'contact' | 'pressure';
export interface Wish {
  minutes: number;
  cat: CategoryId;
  focus: Focus;
  /** at home: only drills for home (asked for with "zu Hause") */
  home: boolean;
}
export interface CaddieItem {
  drill: string;
  minutes: number;
}

export const MINUTES = [15, 20, 30, 45, 60, 90];

// ---------- the wish in words ----------
const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

/** the minutes in a wish: "30 Minuten", "eine halbe Stunde", "1 h", "an hour", "45 min" – null when none */
export function minutesOf(text: string): number | null {
  const t = text.toLowerCase();
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h\b|std|stunden?|hours?)/.exec(t);
  if (h) return Math.round(Number(h[1].replace(',', '.')) * 60);
  const m = /(\d+)\s*(?:min|minuten|minutes|mins|m\b)/.exec(t);
  if (m) return Number(m[1]);
  if (has(t, ['dreiviertel', 'three quarters of an hour'])) return 45;
  if (has(t, ['halbe stunde', 'half an hour', 'half hour'])) return 30;
  if (has(t, ['viertelstunde', 'quarter of an hour', 'quarter hour'])) return 15;
  if (has(t, ['eineinhalb stunden', 'anderthalb stunden', 'hour and a half', 'one and a half hours'])) return 90;
  if (has(t, ['eine stunde', 'an hour', 'one hour', 'einer stunde'])) return 60;
  const n = /\b(\d{2})\b/.exec(t);
  return n && Number(n[1]) >= 10 && Number(n[1]) <= 120 ? Number(n[1]) : null;
}

// topic words, the more specific first ("grün lesen" before "grün", "lob" before "pitch")
const TOPIC_WORDS: [CategoryId, string[]][] = [
  ['greenreading', ['grün lesen', 'grüns lesen', 'green lesen', 'green reading', 'read green', 'reading green', 'break', 'gefälle']],
  ['lowpoint', ['low point', 'tiefster punkt', 'tiefsten punkt']],
  ['highlow', ['hoch und flach', 'hohe schläge', 'flache schläge', 'knockdown', 'high and low', 'trajectory']],
  ['lob', ['lob', 'flop']],
  ['spin', ['spin', 'rückwärtsdrall', 'backspin']],
  ['putting', ['putt', 'putten', 'einlochen']],
  ['chipping', ['chip']],
  ['pitching', ['pitch', 'wedge', 'annäherung unter', 'kurze annäherung']],
  ['bunker', ['bunker', 'sand']],
  ['slopes', ['hang', 'hanglage', 'slope', 'bergauf', 'bergab', 'uphill', 'downhill']],
  ['trouble', ['rough', 'baum', 'bäume', 'tree', 'punch', 'rettung', 'recovery', 'divot']],
  ['driver', ['driver', 'abschlag', 'drive', 'tee shot', 'teeshot']],
  ['woods', ['holz', 'hölzer', 'hybrid', 'wood', 'fairwayholz', 'fairway wood']],
  ['irons', ['eisen', 'iron', 'annäherung', 'approach']],
  ['ballflight', ['slice', 'hook', 'shank', 'ballflug', 'ball flight', 'fade', 'draw']],
  ['swing', ['schwung', 'swing', 'drehung', 'rotation']],
  ['basics', ['griff', 'grip', 'stand', 'stance', 'ansprache', 'set-up', 'setup', 'haltung', 'posture']],
  ['strategy', ['strategie', 'course management', 'platzstrategie', 'taktik', 'strategy']],
  ['mental', ['mental', 'routine', 'nerven', 'konzentration', 'focus on', 'nerves']],
  ['fitness', ['fitness', 'beweglich', 'aufwärm', 'warm-up', 'warm up', 'kraft', 'mobility', 'strength']],
  ['practice', ['richtig trainieren', 'trainingsplan', 'how to practise', 'how to practice']],
];
/** the topic a wish names, null when none */
export function topicOf(text: string): CategoryId | null {
  const t = text.toLowerCase();
  return TOPIC_WORDS.find(([, w]) => has(t, w))?.[0] ?? null;
}

// what a drill is about, found in its own words (German and English)
const FOCUS_WORDS: Record<Exclude<Focus, 'mixed'>, string[]> = {
  direction: ['richtung', 'startlinie', 'start line', 'starts on', 'startet', 'gerade', 'straight', 'tor', 'gate', 'linie', 'line', 'ausricht', 'alignment', 'aim', 'zielen'],
  distance: ['länge', 'length', 'tempo', 'speed', 'leiter', 'ladder', 'lag', 'distanz', 'distance', 'weit', 'far', 'meter', 'kurz', 'short of'],
  contact: ['treff', 'strike', 'kontakt', 'contact', 'sauber', 'clean', 'low point', 'tiefste', 'divot', 'ball zuerst', 'ball first', 'sweetspot', 'mitte der fläche', 'centre of the face'],
  pressure: ['druck', 'pressure', 'in folge', 'in a row', 'spiel', 'game', 'wettkampf', 'punkte', 'points', 'challenge', 'herausforderung'],
};
/** the focus a wish names ("Richtungskontrolle", "Tempo", "unter Druck"), mixed when none */
export function focusOf(text: string): Focus {
  const t = text.toLowerCase();
  if (has(t, ['richtung', 'direction', 'startlinie', 'start line', 'gerade', 'straight', 'line'])) return 'direction';
  if (has(t, ['länge', 'length', 'tempo', 'speed', 'distanz', 'distance', 'weite', 'lag'])) return 'distance';
  if (has(t, ['treff', 'kontakt', 'strike', 'contact', 'sauber', 'clean'])) return 'contact';
  if (has(t, ['druck', 'pressure', 'wettkampf', 'turnier', 'competition'])) return 'pressure';
  return 'mixed';
}

/** a spoken or typed wish → time, topic, focus; what it does not name stays as it was */
export function readWish(text: string, before: Wish): Wish {
  const t = text.toLowerCase();
  return {
    minutes: minutesOf(text) ?? before.minutes,
    cat: topicOf(text) ?? before.cat,
    focus: focusOf(text) === 'mixed' && !has(t, ['gemischt', 'mixed', 'alles', 'everything']) ? (topicOf(text) ? 'mixed' : before.focus) : focusOf(text),
    home: has(t, ['zu hause', 'zuhause', 'daheim', 'at home', 'indoor', 'wohnzimmer', 'teppich']) || (before.home && !topicOf(text)),
  };
}

// ---------- the session ----------
const words = (d: Drill) => [d.name.en, d.name.de, d.goal.en, d.goal.de, ...(d.steps ?? []).flatMap((s) => [s.en, s.de])].join(' ').toLowerCase();
/** how well a drill fits a focus: the number of the focus' words in it */
export const fits = (d: Drill, focus: Focus): number => (focus === 'mixed' ? 0 : FOCUS_WORDS[focus].filter((w) => words(d).includes(w)).length);

const key = (w: Wish) => `${w.cat}|${w.focus}|${w.home ? 'home' : 'out'}`;
const STORE = 'golfos.training.caddie.v1';
type Store = Record<string, { at: string; items: CaddieItem[] }[]>;
function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Store;
  } catch {
    return {};
  }
}
/** the sessions started for this wish, the last first (at most 5) */
export const history = (w: Wish): { at: string; items: CaddieItem[] }[] => load()[key(w)] ?? [];
/** a started session: the next one for the same wish takes other drills first */
export function remember(w: Wish, items: CaddieItem[], at = new Date().toISOString()): void {
  const s = load();
  s[key(w)] = [{ at, items }, ...(s[key(w)] ?? [])].slice(0, 5);
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // storage full: the next session may repeat drills, nothing else
  }
}

/** a random number generator from a seed – the same seed, the same session (tests) */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * The session for a wish: drills of the topic that fit the focus first, the ones of the last sessions for the same wish
 * last (fun: something new each day), shuffled among equals; each drill its own minutes (5 at least), the last one
 * stretched or cut so the session fills the time. `avoid`: drills to leave out too ("Neue Übungen" again).
 */
export function compose(w: Wish, o: { seed?: number; avoid?: string[]; recent?: string[] } = {}): CaddieItem[] {
  const rand = rng(o.seed ?? Date.now());
  const recent = new Set([...(o.recent ?? history(w).slice(0, 2).flatMap((h) => h.items.map((i) => i.drill))), ...(o.avoid ?? [])]);
  let pool = drillsOf(w.cat).filter((d) => DRILLS.includes(d) && d.minutes > 0);
  // at home only drills for home; on the course or the range none for home or the gym
  const home = pool.filter((d) => d.place === 'home');
  pool = w.home ? (home.length ? home : pool) : pool.filter((d) => d.place !== 'home' && d.place !== 'gym');
  const ranked = pool
    .map((d) => ({ d, fit: fits(d, w.focus), seen: recent.has(d.id) ? 1 : 0, r: rand() }))
    // new before seen, then the focus, then chance
    .sort((a, b) => a.seen - b.seen || Math.min(b.fit, 3) - Math.min(a.fit, 3) || a.r - b.r);
  const items: CaddieItem[] = [];
  let left = w.minutes;
  for (const { d } of ranked) {
    if (left < 5) break;
    // a long drill in a short session is cut, but never to less than 5 minutes
    const m = Math.max(5, Math.min(d.minutes, left));
    items.push({ drill: d.id, minutes: m });
    left -= m;
  }
  // not enough drills: the last one takes the rest; too much: the last one gives back
  if (items.length && left !== 0) items[items.length - 1].minutes = Math.max(5, items[items.length - 1].minutes + left);
  return items;
}

/** the minutes of a session */
export const total = (items: CaddieItem[]): number => items.reduce((s, i) => s + i.minutes, 0);
