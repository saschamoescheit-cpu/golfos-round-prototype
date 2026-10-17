import { isLeftHanded } from '../lib/profile';

let cache: { raw: string | null; left: boolean } | null = null;
/** the profile's hand, read again only when the stored profile changed */
export function leftHanded(): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem('golfos.profile.v1');
  } catch {
    // storage blocked
  }
  if (!cache || cache.raw !== raw) cache = { raw, left: isLeftHanded() };
  return cache.left;
}

// Left-handers (Sascha 17.10.2026, profile "Du spielst"): the pictures are mirrored, and every right/left in the
// Training texts swaps with them – a slice curves left for a left-hander, "aim right" becomes "aim left". Drill steps
// mostly say lead/trail and need nothing. German "rechts/links" are always directions ("richtig" is another word);
// in English "right" also means "correct" ("the right speed") and "left" "remaining" ("the distance that is left") –
// those stay.

const SIDE_WORDS: Record<string, string> = {
  rechts: 'links', links: 'rechts', Rechts: 'Links', Links: 'Rechts',
  rechte: 'linke', linke: 'rechte', rechten: 'linken', linken: 'rechten', rechter: 'linker', linker: 'rechter', rechtes: 'linkes', linkes: 'rechtes',
  Rechtshänder: 'Linkshänder', Linkshänder: 'Rechtshänder',
  right: 'left', left: 'right', Right: 'Left', Left: 'Right',
  'right-hander': 'left-hander', 'left-hander': 'right-hander', 'right-handers': 'left-handers', 'left-handers': 'right-handers',
};
const WORD = /(?<![\p{L}-])(right-handers?|left-handers?|Rechtshänder|Linkshänder|rechte[nrs]?|linke[nrs]?|[Rr]echts|[Ll]inks|[Rr]ight|[Ll]eft)(?![\p{L}-])/gu;
// after "the/all/just" an English "right" is a direction only before a side or body word, or in "to/on/from the right"
const SIDE_NOUN = /^\s+(side|of|hand|hands|foot|feet|edge|half|shoulder|arm|knee|hip|ear|eye|corner|rough|bunker|heel|toe|leg|wrist|elbow|palm|thumb)\b/i;

export function swapSides(s: string): string {
  return s.replace(WORD, (w, _g, i: number) => {
    const before = s.slice(Math.max(0, i - 16), i);
    const after = s.slice(i + w.length, i + w.length + 12);
    if (/^right$/i.test(w)) {
      if (/^\s+(away|now|amount|length|speed|club|time|distance|way|one|line|answer|tempo|pace|choice)\b/i.test(after) && !/(to|on|from|towards|into) the\s+$/i.test(before)) return w;
      if (/\b(the|all|just)\s+$/i.test(before) && !/(to|on|from|towards|into) the\s+$/i.test(before) && !SIDE_NOUN.test(after)) return w;
    }
    if (/^left$/i.test(w) && (/\b(is|are|was|that's|still|m|metres|yards|have)\s+$/i.test(before) || /^\s+(over|to go|to play)\b/i.test(after))) return w;
    return SIDE_WORDS[w] ?? w;
  });
}

/** a Training text as the player plays: mirrored sides for left-handers */
export const sided = (s: string): string => (leftHanded() ? swapSides(s) : s);
