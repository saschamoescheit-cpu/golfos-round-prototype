import { CATEGORIES, DRILLS, drillsOf } from './content';
import type { CategoryId, Drill, Place } from './types';

// The caddie puts a session together (Sascha 17.11.2026: "dem Caddie sagen, dass man jetzt 30 Minuten Zeit hat und
// Putten Richtungskontrolle üben will – die App stellt einen Trainingsplan zusammen. Am Tag danach nicht wieder die
// gleichen Übungen, es soll ja Spaß machen; der User kann entscheiden, ob gleiche oder neue"). In Training › Üben, at
// the top: a spoken or typed wish ("30 Minuten Putten, Richtung") becomes time, topic and focus – shown as rows to
// change – and from them a session of drills that fills the time. New drills by default; "Wie letztes Mal" brings
// back the session last started for the same wish.
// Later that night (Sascha: all four): he understands faults ("ich slice", "fette Chips", "3-Putts"), asks the
// player's rounds ("Was soll ich üben?"), keeps to a place (zu Hause, Puttinggrün, Range …) and takes several topics
// ("20 Minuten Putten und 20 Minuten Chippen").

export type Focus = 'mixed' | 'direction' | 'distance' | 'contact' | 'pressure';
export type Where = 'any' | Place;
/** one part of a session: a topic with its time, focus and – when asked for – a fault (its index in the topic) */
export interface Part {
  minutes: number;
  cat: CategoryId;
  focus: Focus;
  fault?: number;
}
export interface Wish {
  parts: Part[];
  where: Where;
}
export interface CaddieItem {
  drill: string;
  minutes: number;
  /** the part it belongs to (0 when one) */
  part?: number;
}
/** what the caddie understood – and what he could not */
export interface Read {
  wish: Wish;
  /** from the rounds: why this topic */
  why?: string;
  /** nothing in the words he knew */
  unknown?: boolean;
  /** asked the rounds, but there is no signed round yet */
  noRounds?: boolean;
}

export const MINUTES = [10, 15, 20, 30, 45, 60, 90];
export const WHERE: Where[] = ['any', 'green', 'chipping', 'bunker', 'range', 'course', 'home'];
export const DEFAULT_WISH: Wish = { parts: [{ minutes: 30, cat: 'putting', focus: 'mixed' }], where: 'any' };

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
  if (has(t, ['eineinhalb stunden', 'anderthalb stunden', 'hour and a half', 'one and a half hours'])) return 90;
  if (has(t, ['halbe stunde', 'half an hour', 'half hour'])) return 30;
  if (has(t, ['viertelstunde', 'quarter of an hour', 'quarter hour'])) return 15;
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
  ['putting', ['putt', 'einlochen']],
  ['chipping', ['chip']],
  ['pitching', ['pitch', 'wedge']],
  ['bunker', ['bunker', 'sandschlag', 'sand shot']],
  ['slopes', ['hanglage', 'am hang', 'vom hang', 'slope', 'bergauf', 'bergab', 'uphill', 'downhill']],
  ['trouble', ['rough', 'baum', 'bäume', 'tree', 'punch', 'rettung', 'recovery', 'divot']],
  ['driver', ['driver', 'abschlag', 'drive', 'tee shot', 'teeshot', 'kerze', 'sky ball']],
  ['woods', ['holz', 'hölzer', 'hybrid', 'wood']],
  ['irons', ['eisen', 'iron', 'annäherung', 'approach']],
  ['ballflight', ['slice', 'hook', 'shank', 'ballflug', 'ball flight', 'fade', 'draw']],
  ['swing', ['schwung', 'swing', 'drehung', 'rotation', 'over the top', 'über die ebene']],
  ['basics', ['griff', 'grip', 'ansprache', 'set-up', 'setup', 'haltung', 'posture', 'ausrichtung']],
  ['strategy', ['strategie', 'course management', 'platzstrategie', 'taktik', 'strategy']],
  ['mental', ['mental', 'routine', 'nerven', 'konzentration', 'nerves', 'zweifel']],
  ['fitness', ['fitness', 'beweglich', 'aufwärm', 'warm-up', 'warm up', 'kraft', 'mobility', 'strength']],
  ['practice', ['richtig trainieren', 'trainingsplan', 'how to practise', 'how to practice']],
];
/** every topic a wish names, in the order of the words */
const PLACE_WORDS = /puttinggrün|putting-grün|putting green|übungsgrün|practice green|übungsbunker|practice bunker|chipping-area|chipping area/g;
function topicsIn(text: string): { cat: CategoryId; at: number }[] {
  // the place's own words name no topic ("auf dem Puttinggrün chippen")
  const t = text.toLowerCase().replace(PLACE_WORDS, (m) => ' '.repeat(m.length));
  const out: { cat: CategoryId; at: number }[] = [];
  for (const [cat, ws] of TOPIC_WORDS) {
    const at = Math.min(...ws.map((w) => t.indexOf(w)).filter((i) => i >= 0));
    // a word inside a more specific one already taken ("putt" in "grün lesen … putts") counts once
    if (Number.isFinite(at) && !out.some((o) => o.at === at)) out.push({ cat, at });
  }
  return out.sort((a, b) => a.at - b.at);
}
/** the topic a wish names, null when none */
export const topicOf = (text: string): CategoryId | null => topicsIn(text)[0]?.cat ?? null;

// what a drill is about, found in its own words (German and English)
const FOCUS_WORDS: Record<Exclude<Focus, 'mixed'>, string[]> = {
  direction: ['richtung', 'startlinie', 'start line', 'starts on', 'startet', 'gerade', 'straight', 'tor', 'gate', 'linie', 'line', 'ausricht', 'alignment', 'aim', 'zielen'],
  distance: ['länge', 'length', 'tempo', 'speed', 'leiter', 'ladder', 'lag', 'distanz', 'distance', 'weit', 'far', 'meter', 'kurz', 'short of'],
  contact: ['treff', 'strike', 'kontakt', 'contact', 'sauber', 'clean', 'low point', 'tiefste', 'divot', 'ball zuerst', 'ball first', 'sweetspot', 'mitte der fläche', 'centre of the face'],
  pressure: ['druck', 'pressure', 'in folge', 'in a row', 'spiel', 'game', 'wettkampf', 'punkte', 'points', 'challenge', 'herausforderung'],
};
/** edit distance of two short words (speech recognition slips by a letter or two) */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
/** a word that starts like the stem, up to two letters off – "Rechnungskontrolle" heard for "Richtungskontrolle" */
const soundsLike = (t: string, stems: string[]) =>
  t.split(/[^a-zäöüß]+/).some((w) => stems.some((s) => w.length >= s.length && editDistance(w.slice(0, s.length), s) <= 2));

/** the focus a wish names ("Richtungskontrolle", "Tempo", "unter Druck"), mixed when none */
export function focusOf(text: string): Focus {
  const t = text.toLowerCase();
  if (has(t, ['richtung', 'direction', 'startlinie', 'start line', 'gerade', 'straight', 'line'])) return 'direction';
  if (has(t, ['länge', 'length', 'tempo', 'speed', 'distanz', 'distance', 'weite', 'lag'])) return 'distance';
  if (has(t, ['treff', 'kontakt', 'strike', 'contact', 'sauber', 'clean'])) return 'contact';
  if (has(t, ['druck', 'pressure', 'wettkampf', 'turnier', 'competition'])) return 'pressure';
  // the microphone sometimes mishears the long words – a near miss still counts (Sascha 18.11.2026)
  if (soundsLike(t, ['richtung', 'startlinie', 'direction'])) return 'direction';
  if (soundsLike(t, ['distanz', 'distance'])) return 'distance';
  if (soundsLike(t, ['kontakt', 'contact'])) return 'contact';
  return 'mixed';
}

// faults in the player's words → the topic's fault (its English name); the more specific first
const FAULT_RULES: { cat: CategoryId; name: string; when: (t: string) => boolean }[] = [
  { cat: 'putting', name: 'Three-putts from distance', when: (t) => has(t, ['3-putt', '3 putt', 'dreiputt', 'drei putt', 'three-putt', 'three putt']) },
  { cat: 'putting', name: 'Missing the short ones', when: (t) => has(t, ['kurze putts', 'kurzen putts', 'short putts', 'verschieb', 'missing the short']) },
  { cat: 'putting', name: 'Always short', when: (t) => has(t, ['putt']) && has(t, ['zu kurz', 'immer kurz', 'too short', 'always short']) },
  { cat: 'putting', name: 'Ball starts right of the line', when: (t) => has(t, ['putt']) && has(t, ['rechts', 'right']) },
  { cat: 'putting', name: 'Ball starts left of the line', when: (t) => has(t, ['putt']) && has(t, ['links', 'left']) },
  { cat: 'greenreading', name: 'Missing low (amateur side)', when: (t) => has(t, ['unten vorbei', 'amateurseite', 'amateur side', 'missing low']) },
  { cat: 'bunker', name: 'Ball stays in the bunker', when: (t) => has(t, ['bunker']) && has(t, ['bleibt', 'nicht raus', 'komme nicht', 'stays', 'get out', 'raus']) },
  { cat: 'bunker', name: 'Thin over the green', when: (t) => has(t, ['bunker']) && has(t, ['getoppt', 'dünn', 'thin', 'über das grün', 'übers grün', 'over the green']) },
  { cat: 'chipping', name: 'Fat chip (chunk)', when: (t) => has(t, ['chip']) && has(t, ['fett', 'fat', 'chunk', 'boden zuerst']) },
  { cat: 'chipping', name: 'Thin or bladed chip', when: (t) => has(t, ['chip']) && has(t, ['getoppt', 'dünn', 'thin', 'blade', 'top']) },
  { cat: 'chipping', name: 'Slowing down', when: (t) => has(t, ['chip']) && has(t, ['abbrems', 'bremse', 'decelerat', 'slowing']) },
  { cat: 'pitching', name: 'Fat or thin pitches', when: (t) => has(t, ['pitch']) && has(t, ['fett', 'fat', 'dünn', 'thin', 'getoppt']) },
  { cat: 'pitching', name: 'Slowing down at the ball', when: (t) => has(t, ['pitch']) && has(t, ['abbrems', 'bremse', 'decelerat', 'slowing']) },
  { cat: 'pitching', name: 'Every pitch a different length', when: (t) => has(t, ['pitch', 'wedge']) && has(t, ['jede länge', 'andere länge', 'different length', 'länge stimmt nicht']) },
  { cat: 'woods', name: 'Topping', when: (t) => has(t, ['holz', 'hölzer', 'wood', 'hybrid']) && has(t, ['getoppt', 'topp', 'top']) },
  { cat: 'woods', name: 'Fat (chunked) woods', when: (t) => has(t, ['holz', 'hölzer', 'wood', 'hybrid']) && has(t, ['fett', 'fat', 'chunk']) },
  { cat: 'driver', name: 'Slice off the tee', when: (t) => has(t, ['slice']) && has(t, ['driver', 'abschlag', 'tee', 'drive']) },
  { cat: 'driver', name: 'Sky ball (pop-up)', when: (t) => has(t, ['kerze', 'sky', 'pop-up', 'pop up']) },
  { cat: 'slopes', name: 'Losing balance', when: (t) => has(t, ['gleichgewicht', 'balance', 'falle um', 'kippe']) },
  { cat: 'irons', name: 'Fat shots', when: (t) => has(t, ['fett', 'fat', 'chunk']) },
  { cat: 'irons', name: 'Thin shots', when: (t) => has(t, ['dünn', 'thin']) },
  { cat: 'ballflight', name: 'Slice', when: (t) => has(t, ['slice']) },
  { cat: 'ballflight', name: 'Hook', when: (t) => has(t, ['hook']) },
  { cat: 'ballflight', name: 'Shank', when: (t) => has(t, ['shank']) },
  { cat: 'ballflight', name: 'Topped shots', when: (t) => has(t, ['getoppt', 'toppe', 'topped', 'topping']) },
  { cat: 'swing', name: 'Over the top', when: (t) => has(t, ['over the top', 'über die ebene', 'von außen']) },
  { cat: 'swing', name: 'Rushing the swing', when: (t) => has(t, ['hastig', 'rushing', 'zu schnell', 'too fast']) },
  { cat: 'fitness', name: 'Early extension (standing up)', when: (t) => has(t, ['aufrichten', 'early extension', 'stand up']) },
  { cat: 'mental', name: 'Doubt over the ball', when: (t) => has(t, ['zweifel', 'doubt']) },
];
/** the fault a wish names, with its topic – null when none (a topic named limits it to that topic's faults) */
export function faultOf(text: string, cat?: CategoryId | null): { cat: CategoryId; fault: number } | null {
  const t = text.toLowerCase();
  for (const r of FAULT_RULES) {
    if (cat && r.cat !== cat && !(cat === 'ballflight' && r.cat === 'driver')) continue;
    if (!r.when(t)) continue;
    const i = CATEGORIES.find((c) => c.id === r.cat)?.faults?.findIndex((f) => f.name.en === r.name) ?? -1;
    if (i >= 0) return { cat: r.cat, fault: i };
  }
  return null;
}

/** the place a wish names, null when none */
export function whereOf(text: string): Where | null {
  const t = text.toLowerCase();
  if (has(t, ['zu hause', 'zuhause', 'daheim', 'at home', 'indoor', 'wohnzimmer', 'teppich', 'in the living room'])) return 'home';
  if (has(t, ['puttinggrün', 'putting-grün', 'übungsgrün', 'putting green', 'practice green'])) return 'green';
  if (has(t, ['chipping-area', 'chipping area', 'kurzspielbereich', 'short game area'])) return 'chipping';
  if (has(t, ['übungsbunker', 'practice bunker'])) return 'bunker';
  if (has(t, ['range', 'driving range', 'übungsgelände', 'abschlagplatz'])) return 'range';
  if (has(t, ['auf dem platz', 'auf der runde', 'on the course', 'during a round', 'beim spielen'])) return 'course';
  if (has(t, ['egal wo', 'anywhere'])) return 'any';
  return null;
}

/** "Was soll ich üben?" – a question to the rounds */
export const asksRounds = (text: string): boolean => has(text.toLowerCase(), ['was soll ich', 'was sollte ich', 'woran soll ich', 'what should i', 'what shall i', 'schwäche', 'schwächen', 'weak spot', 'wo verliere', 'where do i lose', 'aus meinen runden', 'from my rounds']);

const sum = (parts: Part[]) => parts.reduce((s, p) => s + p.minutes, 0);
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);

/**
 * A spoken or typed wish → the parts of the session and the place; what it does not name stays as it was.
 * `advice`: the weak spots of the player's signed rounds, the biggest first ("Was soll ich üben?").
 */
export function readWish(text: string, before: Wish, advice: { cat: CategoryId; why: string }[] = []): Read {
  const t = text.toLowerCase();
  const where = whereOf(text) ?? before.where;
  const total = minutesOf(text);
  let found = topicsIn(text);
  // "Slice vom Abschlag": the fault of one topic, not two topics
  const whole = faultOf(text);
  if (found.length > 1 && whole && found.some((f) => f.cat === whole.cat) && found.some((f) => f.cat === 'ballflight') && whole.cat !== 'ballflight') found = found.filter((f) => f.cat !== 'ballflight');
  // a fault without its topic word ("ich slice", "Kerze") brings its topic
  if (!found.length) {
    const f = faultOf(text);
    if (f) found.push({ cat: f.cat, at: 0 });
  }
  // the rounds: the weak spot as the topic (two parts from 45 minutes when there are two)
  if (!found.length && asksRounds(text)) {
    if (!advice.length) return { wish: { ...before, where }, noRounds: true };
    const minutes = total ?? sum(before.parts);
    const two = minutes >= 45 && advice.length > 1;
    const parts: Part[] = (two ? advice.slice(0, 2) : advice.slice(0, 1)).map((a, i) => ({ cat: a.cat, focus: 'mixed', minutes: two ? (i === 0 ? round5(minutes / 2) : minutes - round5(minutes / 2)) : minutes }));
    return { wish: { parts, where }, why: advice.slice(0, parts.length).map((a) => a.why).join(' · ') };
  }
  if (!found.length) {
    // no topic: time, focus or place for what is there
    const focus = focusOf(text);
    const named = total != null || focus !== 'mixed' || whereOf(text) != null || has(t, ['gemischt', 'mixed']);
    let parts = before.parts.map((p) => ({ ...p, focus: focus !== 'mixed' || has(t, ['gemischt', 'mixed']) ? focus : p.focus }));
    if (total != null) {
      const k = total / sum(parts);
      parts = parts.map((p, i) => ({ ...p, minutes: i === parts.length - 1 ? total - parts.slice(0, -1).reduce((s, q) => s + round5(q.minutes * k), 0) : round5(p.minutes * k) }));
    }
    return { wish: { parts, where }, unknown: !named };
  }
  // the words of each topic: from its connector ("und", ",", "and", "dann", "+") to the next topic's
  const cuts = found.map((f, i) => {
    if (i === 0) return 0;
    const between = t.slice(found[i - 1].at, f.at);
    const m = [...between.matchAll(/\s(?:und|and|plus|dann|then|sowie)\s|[,;+]/g)].pop();
    return m ? found[i - 1].at + m.index! : f.at;
  });
  const segs = found.map((f, i) => ({ cat: f.cat, text: t.slice(cuts[i], cuts[i + 1] ?? t.length) }));
  // a time for every part: its own, else the rest shared; one topic takes the whole time
  // a time before the first topic ("eine Stunde Putten, Chippen und Bunker") is the whole session's
  // – unless the other topics have their own ("20 Minuten Putten und 20 Minuten Chippen"): then it is the first one's
  const inner = segs.map((s, i) => minutesOf(i === 0 ? t.slice(found[0].at, cuts[1]) : s.text));
  const pre = minutesOf(t.slice(0, found[0].at));
  const own = segs.length > 1 ? inner.map((m, i) => (i === 0 && m == null && inner.slice(1).some((x) => x != null) ? pre : m)) : [total];
  const all = segs.length > 1 && own.every((m) => m == null) ? (total ?? sum(before.parts)) : null;
  const rest = (all ?? Math.max(segs.length * 10, sum(before.parts))) - own.reduce<number>((s, m) => s + (m ?? 0), 0);
  const open = own.filter((m) => m == null).length;
  const parts: Part[] = segs.map((s, i) => {
    const f = faultOf(s.text, s.cat);
    const minutes = own[i] ?? (segs.length === 1 ? sum(before.parts) : round5(rest / Math.max(1, open)));
    return { cat: f && segs.length === 1 && s.cat === 'ballflight' ? f.cat : s.cat, focus: focusOf(s.text), minutes, ...(f && (f.cat === s.cat || s.cat === 'ballflight') ? { fault: f.fault } : {}) };
  });
  return { wish: { parts, where } };
}

// ---------- the session ----------
const words = (d: Drill) => [d.name.en, d.name.de, d.goal.en, d.goal.de, ...(d.steps ?? []).flatMap((s) => [s.en, s.de])].join(' ').toLowerCase();
/** how well a drill fits a focus: the number of the focus' words in it */
export const fits = (d: Drill, focus: Focus): number => (focus === 'mixed' ? 0 : FOCUS_WORDS[focus].filter((w) => words(d).includes(w)).length);

const key = (w: Wish) => `${w.parts.map((p) => `${p.cat}|${p.focus}|${p.fault ?? ''}`).join('+')}@${w.where}`;
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

/** the drills a part can take at a place: there, or – when the topic has none there – anywhere but home and gym */
function poolFor(p: Part, where: Where): Drill[] {
  const all = drillsOf(p.cat).filter((d) => DRILLS.includes(d) && d.minutes > 0);
  const away = all.filter((d) => d.place !== 'home' && (d.place !== 'gym' || p.cat === 'fitness'));
  if (where === 'any') return away;
  const there = all.filter((d) => d.place === where);
  return there.length ? there : away;
}
/** true when the topic has no drill at the place – the caddie takes others and says so */
export const nothingThere = (p: Part, where: Where): boolean => where !== 'any' && !drillsOf(p.cat).some((d) => DRILLS.includes(d) && d.place === where);

/**
 * The session for a wish, part by part: the drills of the fault first, then the ones of the topic that fit the focus,
 * the ones of the last sessions for the same wish last (fun: something new each day), shuffled among equals; each
 * drill its own minutes (5 at least), the last one of a part stretched or cut so the part fills its time; a drill
 * only once. `avoid`: drills to leave out too ("Neue Übungen" again).
 */
export function compose(w: Wish, o: { seed?: number; avoid?: string[]; recent?: string[] } = {}): CaddieItem[] {
  const rand = rng(o.seed ?? Date.now());
  const recent = new Set([...(o.recent ?? history(w).slice(0, 2).flatMap((h) => h.items.map((i) => i.drill))), ...(o.avoid ?? [])]);
  const items: CaddieItem[] = [];
  w.parts.forEach((p, part) => {
    const faultDrills = p.fault != null ? (CATEGORIES.find((c) => c.id === p.cat)?.faults?.[p.fault]?.drills ?? []) : [];
    const ranked = poolFor(p, w.where)
      .filter((d) => !items.some((i) => i.drill === d.id))
      .map((d) => ({ d, fault: faultDrills.includes(d.id) ? 0 : 1, fit: fits(d, p.focus), seen: recent.has(d.id) ? 1 : 0, r: rand() }))
      // new before seen, the fault's drills, then the focus, then chance
      .sort((a, b) => a.seen - b.seen || a.fault - b.fault || Math.min(b.fit, 3) - Math.min(a.fit, 3) || a.r - b.r);
    const mine: CaddieItem[] = [];
    let left = p.minutes;
    for (const { d } of ranked) {
      if (left < 5) break;
      // a long drill in a short session is cut, but never to less than 5 minutes
      const m = Math.max(5, Math.min(d.minutes, left));
      mine.push({ drill: d.id, minutes: m, part });
      left -= m;
    }
    // not enough drills: the last one takes the rest; too much: the last one gives back
    // too much: the last one gives back; not enough drills for the time: every drill a little longer (a user check
    // 17.11.2026: one drill of 60 minutes is no session), up to twice its own length; what is left the last one takes
    if (mine.length && left < 0) mine[mine.length - 1].minutes = Math.max(5, mine[mine.length - 1].minutes + left);
    for (let round = 0; left >= 5 && round < 20; round++) {
      let grew = false;
      for (const it of mine) {
        const own = DRILLS.find((d) => d.id === it.drill)?.minutes ?? it.minutes;
        if (left >= 5 && it.minutes + 5 <= own * 2) {
          it.minutes += 5;
          left -= 5;
          grew = true;
        }
      }
      if (!grew) break;
    }
    if (mine.length && left > 0) mine[mine.length - 1].minutes += left;
    items.push(...mine);
  });
  return items;
}

/** the minutes of a session */
export const total = (items: CaddieItem[]): number => items.reduce((s, i) => s + i.minutes, 0);

/** a wish kept from before 17.11.2026 night ({ minutes, cat, focus, home }) in today's shape */
export function upgrade(w: unknown): Wish | null {
  const o = w as Record<string, unknown> | null;
  if (!o) return null;
  if (Array.isArray(o.parts) && o.parts.length) return o as unknown as Wish;
  if (typeof o.cat === 'string' && typeof o.minutes === 'number') return { parts: [{ minutes: o.minutes, cat: o.cat as CategoryId, focus: (o.focus as Focus) ?? 'mixed' }], where: o.home ? 'home' : 'any' };
  return null;
}
