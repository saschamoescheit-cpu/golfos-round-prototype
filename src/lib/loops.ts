import type { CourseHole, RoundHole } from '../types';
import { tr } from './i18n';

/**
 * Parses a hole label from the data source into loop + number.
 * Handles "4A", "A4", "12", "Kurzplatz - Loch 3".
 */
export function parseHoleRef(ref: string): { loop: string; number: number } | null {
  const r = ref.trim();
  let m = r.match(/^(\d{1,2})\s*([A-Za-z])$/);
  if (m) return { loop: m[2].toUpperCase(), number: Number(m[1]) };
  m = r.match(/^([A-Za-z])\s*-?\s*(\d{1,2})$/);
  if (m) return { loop: m[1].toUpperCase(), number: Number(m[2]) };
  m = r.match(/^(\d{1,2})$/);
  if (m) return { loop: 'Main', number: Number(m[1]) };
  // "9/18 - Blindes Loch", "Bahn 1/10 - Terrassenschreck": a 9-hole course played twice – the first number (night
  // check 22.10.2026: Bad Herrenalb – no hole was found)
  m = r.match(/^(?:Loch|Hole|Bahn)?\s*(\d{1,2})\s*\/\s*\d{1,2}(?:\s*[-–:].*)?$/i);
  if (m) return { loop: 'Main', number: Number(m[1]) };
  // "15 (Old Course)", "8 – Academy Course": the number first, the course's name after it (night check 22.10.2026:
  // Der Öschberghof – no hole was found)
  // also "6, weiss", "9 Blau", "3 NORD", "Bahn 12 gelb", "18,18-Loch" (night check 22.10.2026: 17 courses with their
  // holes in OSM showed none) – the word is the loop; a tee colour then stands for the course played from that tee
  m = r.match(/^(?:Loch|Hole|Bahn)?\s*(\d{1,2})\s*(?:\(([^)]+)\)|[-–:,]\s*(.+)|\s+([A-Za-zÄÖÜäöüß].*))$/i);
  if (m) {
    const name = (m[2] ?? m[3] ?? m[4]).trim();
    return { loop: name.charAt(0).toUpperCase() + name.slice(1), number: Number(m[1]) };
  }
  // "Loch 3", "Hole 3", "Bahn Nr. 3", "Hoyo 3", "Loch 3A" – the word alone is no loop (night check 22.10.2026:
  // Freiburger Golfclub had six of its holes as "Loch 3" and lost them)
  m = r.match(/^(?:Loch|Hole|Bahn|Hoyo|Trou|Buca|Tee)\s*(?:Nr\.?|No\.?|#)?\s*(\d{1,2})\s*([A-Za-z])?$/i);
  if (m) return { loop: m[2] ? m[2].toUpperCase() : 'Main', number: Number(m[1]) };
  m = r.match(/^(.*?)[\s\-–:]*(?:Loch|Hole|Bahn)?\s*(\d{1,2})$/i);
  if (m && m[1].trim()) return { loop: m[1].trim(), number: Number(m[2]) };
  return null;
}

/** "11/12" → [11, 12]; "7" → [7]; anything else → []. */
export function parseStrokeIndex(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(/[\/,;]/)
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)
    .sort((a, b) => a - b);
}

export interface LoopOption {
  id: string; // "A+B", "Main", "Main:front"
  label: string;
  loops: string[]; // loop order
  part?: 'front' | 'back'; // for single 18-hole loops
}

/** Which rounds can be played: loop combinations for 9-hole loops, full/front/back for 18. */
export function loopOptions(holes: CourseHole[]): LoopOption[] {
  const byLoop = groupByLoop(holes);
  // Main first, then single-letter loops (A, B, C …), then named loops such as a short course.
  const rank = (l: string) => (l === 'Main' ? 0 : l.length === 1 ? 1 : 2);
  const loops = Object.keys(byLoop).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const nineHoleLoops = loops.filter((l) => byLoop[l].length === 9 && byLoop[l].every((h) => h.par != null));
  const options: LoopOption[] = [];

  for (const l of loops) {
    if (byLoop[l].length >= 18) {
      options.push({ id: l, label: loopLabel(l, tr('18 holes', '18 Löcher')), loops: [l] });
      options.push({ id: `${l}:front`, label: loopLabel(l, tr('Front 9', 'Vordere 9')), loops: [l], part: 'front' });
      options.push({ id: `${l}:back`, label: loopLabel(l, tr('Back 9', 'Hintere 9')), loops: [l], part: 'back' });
    }
  }
  for (const a of nineHoleLoops) {
    for (const b of nineHoleLoops) {
      if (a !== b) options.push({ id: `${a}+${b}`, label: `${a} + ${b} · ${tr('18 holes', '18 Löcher')}`, loops: [a, b] });
    }
  }
  for (const l of loops) {
    if (byLoop[l].length < 18) options.push({ id: l, label: `${l} · ${byLoop[l].length} ${tr('holes', 'Löcher')}`, loops: [l] });
  }
  return options;
}

/** Loops of a round for display: "A + B", or "Main course" for an 18-hole course. */
export const loopsText = (loops: string[]): string => loops.filter((l) => l !== 'Main').join(' + '); // a plain 18-hole course has no loop name

function loopLabel(loop: string, text: string): string {
  return loop === 'Main' ? text : `${loop} · ${text}`;
}

export function groupByLoop(holes: CourseHole[]): Record<string, CourseHole[]> {
  const out: Record<string, CourseHole[]> = {};
  for (const h of holes) (out[h.loop] ??= []).push(h);
  for (const l of Object.keys(out)) out[l].sort((a, b) => a.number - b.number);
  return out;
}

/**
 * Builds the playing order for a round.
 * Stroke index with two candidates ("11/12"): first nine takes the lower, second nine the higher value
 * (decision Sascha, 10.10.2026 – verify against the club's scorecard).
 * Missing par / stroke index stay 0 and must be completed by the player.
 */
export function buildRoundHoles(holes: CourseHole[], option: LoopOption): RoundHole[] {
  const byLoop = groupByLoop(holes);
  let sequence: { hole: CourseHole; nine: 0 | 1 }[] = [];
  option.loops.forEach((loop, pos) => {
    const list = byLoop[loop] ?? [];
    list.forEach((hole) => sequence.push({ hole, nine: pos === 0 ? 0 : 1 }));
  });
  if (option.part === 'front') sequence = sequence.slice(0, 9);
  if (option.part === 'back') sequence = sequence.slice(9, 18);

  return sequence.map(({ hole, nine }, index) => {
    const si = hole.strokeIndex;
    const strokeIndex = si.length === 0 ? 0 : si.length === 1 ? si[0] : nine === 0 ? si[0] : si[si.length - 1];
    return {
      index,
      label: hole.loop === 'Main' ? String(hole.number) : `${hole.number}${hole.loop.length === 1 ? hole.loop : ` ${hole.loop}`}`,
      loop: hole.loop,
      number: hole.number,
      par: hole.par ?? 0,
      strokeIndex,
    };
  });
}
