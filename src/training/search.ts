import { CATEGORIES, DRILLS } from './content';
import { GEAR } from './content/gear';
import type { Category, Drill, Fault, Gear, L } from './types';

// The search of the Training module (night run 16./17.10.2026: "Slice" found no drill, "Lag" found 131).
// - a drill is found by its own texts, its topic and the faults that point to it (Slice → the slice drills)
// - short words (up to 3 letters) must be a whole word, 4 letters the start of a word, longer ones anywhere
//   (German compounds: "Länge" in "Längenkontrolle", "putt" in "Dreiputt")
// - a few words golfers use are widened (Nerven → Druck, Nervosität …)
// - drills whose name matches come first

export const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)-(?=[a-z])/g, '$1');

const SYNONYMS: Record<string, string[]> = {
  '3putt': ['dreiputt', 'three-putt', 'threeputt', '3putt'],
  dreiputt: ['dreiputt', 'three-putt', '3putt'],
  dreiputts: ['dreiputt', 'three-putt', '3putt'],
  nerven: ['nerv', 'unter druck', 'under pressure', 'angst', 'beruhig', 'calm'],
  nervos: ['nerv', 'unter druck', 'under pressure', 'angst', 'beruhig', 'calm'],
  angst: ['angst', 'unter druck', 'nerv', 'under pressure'],
  druck: ['unter druck', 'under pressure', 'nerv'],
  aufwarmen: ['aufwarm', 'warm-up', 'warmup', 'einschlagen'],
  einschlagen: ['einschlagen', 'aufwarm', 'warm'],
  tempo: ['tempo', 'rhythmus', 'takt'],
  rhythmus: ['rhythmus', 'tempo', 'takt', 'metronom'],
  takt: ['takt', 'rhythmus', 'metronom'],
  lange: ['lange', 'distanz', 'dosier'],
  langenkontrolle: ['lange', 'distanz', 'dosier', 'lag'],
  zuhause: ['hause', 'home', 'wohnzimmer'],
  hause: ['hause', 'home'],
  hanglage: ['hang', 'slope'],
  hanglagen: ['hang', 'slope'],
  abschlag: ['abschlag', 'driver', 'tee shot'],
  fett: ['fett', 'chunk', 'boden vor dem ball'],
  getoppt: ['topp', 'topping'],
};

const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Does the text (already normalized, with its tokens) contain the query word? */
function matchWord(w: string, text: string, toks: string[]): boolean {
  const alts = SYNONYMS[w] ?? [w];
  return alts.some((a) => {
    if (a.includes(' ') || a.includes('-')) return text.includes(a);
    if (a.length <= 3) return toks.includes(a);
    if (a.length === 4) return toks.some((t) => t.startsWith(a));
    return text.includes(a);
  });
}

const both = (x?: L) => (x ? `${x.en} ${x.de}` : '');

export interface SearchResult {
  cats: Category[];
  faults: { c: Category; f: Fault; index: number }[];
  drills: Drill[];
  gear: Gear[];
}

// the faults that point to each drill – their names make the drill findable ("Slice", "Shank", "Dreiputts")
const FAULT_NAMES = new Map<string, string>();
for (const c of CATEGORIES) for (const f of c.faults ?? []) for (const id of f.drills ?? []) FAULT_NAMES.set(id, `${FAULT_NAMES.get(id) ?? ''} ${both(f.name)}`);

const DRILL_TEXT = new Map(
  DRILLS.map((d) => {
    const c = CATEGORIES.find((x) => x.id === d.cat);
    const text = norm(
      [both(d.name), both(d.goal), both(d.setup), ...d.steps.map(both), ...(d.tips ?? []).map(both), both(d.origin), both(c?.name), FAULT_NAMES.get(d.id) ?? ''].join(' '),
    );
    return [d.id, { text, toks: tokens(text) }];
  }),
);

export function search(q: string): SearchResult {
  const words = tokens(q.replace(/(\d)-(?=\p{L})/gu, '$1'));
  const empty = { cats: [], faults: [], drills: [], gear: [] };
  if (!words.length) return empty;
  const hit = (raw: string) => {
    const text = norm(raw);
    const toks = tokens(text);
    return words.every((w) => matchWord(w, text, toks));
  };
  const nameHit = (d: Drill) => hit(both(d.name));
  const drills = DRILLS.filter((d) => {
    const x = DRILL_TEXT.get(d.id)!;
    return words.every((w) => matchWord(w, x.text, x.toks));
  }).sort((a, b) => Number(nameHit(b)) - Number(nameHit(a)));
  return {
    cats: CATEGORIES.filter((c) => hit(`${both(c.name)} ${both(c.short)}`)),
    faults: CATEGORIES.flatMap((c) => (c.faults ?? []).map((f, index) => ({ c, f, index }))).filter(({ f }) => hit(`${both(f.name)} ${both(f.looks)} ${both(f.cause)}`)),
    drills,
    gear: GEAR.filter((g) => hit(`${typeof g.name === 'string' ? g.name : both(g.name)} ${typeof g.brand === 'string' ? g.brand : both(g.brand)} ${both(g.what)} ${both(g.why)}`)),
  };
}
