import { CATEGORIES, DRILLS } from './content';
import { PLANS } from './content/plans';
import type { CategoryId, L } from './types';

// Review mode for the golf pro (Sascha 16.10.2026: "next step: go through it with Chris" – and shorten it).
// Every drill, basics section, fault, plan and video can be marked ✓ keep · ✎ change (with a note) · ✕ cut.
// The marks stay on this device only; the reviewer shares them as a list (text or .md file) – nothing is sent.

export type Verdict = 'ok' | 'edit' | 'cut';
export interface ReviewMark {
  verdict: Verdict;
  note?: string;
  at: string;
  by?: string;
}
export type ReviewKind = 'drill' | 'section' | 'fault' | 'plan' | 'video';
export interface ReviewItem {
  key: string;
  kind: ReviewKind;
  cat?: CategoryId;
  title: L | string;
}

const KEY = 'golfos.training.review.v1';
const ON = 'golfos.training.reviewmode.v1';

function changed(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('golfos:training-changed'));
}

export function loadReview(): Record<string, ReviewMark> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
export function setMark(key: string, mark: ReviewMark | null): void {
  const all = loadReview();
  if (mark) all[key] = mark;
  else delete all[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full – the mark is kept for this visit only */
  }
  changed();
}
export function reviewOn(): boolean {
  try {
    return localStorage.getItem(ON) === '1';
  } catch {
    return false;
  }
}
export function setReviewOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(ON, '1');
    else localStorage.removeItem(ON);
  } catch {
    /* ignore */
  }
  changed();
}

export const drillKey = (id: string) => `drill:${id}`;
export const sectionKey = (cat: CategoryId, title: L) => `section:${cat}:${title.en}`;
export const faultKey = (cat: CategoryId, name: L) => `fault:${cat}:${name.en}`;
export const planKey = (id: string) => `plan:${id}`;
export const videoKey = (id: string) => `video:${id}`;

/** Everything that can be reviewed, in the order of the library. */
export function reviewItems(): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const c of CATEGORIES) {
    for (const d of DRILLS.filter((x) => x.cat === c.id)) out.push({ key: drillKey(d.id), kind: 'drill', cat: c.id, title: d.name });
    for (const s of c.sections) out.push({ key: sectionKey(c.id, s.title), kind: 'section', cat: c.id, title: s.title });
    for (const f of c.faults ?? []) out.push({ key: faultKey(c.id, f.name), kind: 'fault', cat: c.id, title: f.name });
    for (const v of c.videos ?? []) out.push({ key: videoKey(v.id), kind: 'video', cat: c.id, title: v.title });
  }
  for (const p of PLANS) out.push({ key: planKey(p.id), kind: 'plan', title: p.name });
  return out;
}

/** The next drill without a mark – the reviewer goes through the drills one by one. */
export function nextOpenDrill(after?: string): string | undefined {
  const marks = loadReview();
  const ids = CATEGORIES.flatMap((c) => DRILLS.filter((d) => d.cat === c.id).map((d) => d.id));
  const start = after ? ids.indexOf(after) + 1 : 0;
  return [...ids.slice(start), ...ids.slice(0, start)].find((id) => id !== after && !marks[drillKey(id)]);
}

const KIND: Record<ReviewKind, L> = {
  drill: { en: 'Drills', de: 'Übungen' },
  section: { en: 'Basics', de: 'Grundlagen' },
  fault: { en: 'Faults', de: 'Fehler' },
  video: { en: 'Videos', de: 'Videos' },
  plan: { en: 'Plans', de: 'Pläne' },
};
const SIGN: Record<Verdict, string> = { ok: '✓', edit: '✎', cut: '✕' };

/** The marks as a Markdown list, grouped by topic – to share with Sascha (or paste into Linear). */
export function exportMarkdown(lang: 'en' | 'de', who?: string): string {
  const tx = (x: L | string) => (typeof x === 'string' ? x : x[lang]);
  const de = lang === 'de';
  const marks = loadReview();
  const items = reviewItems();
  const done = items.filter((i) => marks[i.key]);
  const count = (v: Verdict) => done.filter((i) => marks[i.key].verdict === v).length;
  const date = new Date().toLocaleDateString(de ? 'de-DE' : 'en-GB');
  const lines: string[] = [
    `# GolfOS Training – ${de ? 'Prüfung' : 'Review'}${who ? ` (${who})` : ''}, ${date}`,
    '',
    `${de ? 'Geprüft' : 'Reviewed'}: ${done.length} / ${items.length} · ✓ ${count('ok')} · ✎ ${count('edit')} · ✕ ${count('cut')}`,
    '',
    de ? 'Legende: ✓ passt · ✎ ändern · ✕ streichen' : 'Legend: ✓ keep · ✎ change · ✕ cut',
  ];
  const groups: { title: string; list: ReviewItem[] }[] = [
    ...CATEGORIES.map((c) => ({ title: tx(c.name), list: items.filter((i) => i.cat === c.id) })),
    { title: tx(KIND.plan), list: items.filter((i) => i.kind === 'plan') },
  ];
  for (const g of groups) {
    const marked = g.list.filter((i) => marks[i.key]);
    if (!marked.length) continue;
    lines.push('', `## ${g.title}`, `${marked.length} / ${g.list.length} ${de ? 'geprüft' : 'reviewed'}`);
    for (const kind of Object.keys(KIND) as ReviewKind[]) {
      const k = marked.filter((i) => i.kind === kind);
      if (!k.length) continue;
      if (g.title !== tx(KIND.plan)) lines.push('', `### ${tx(KIND[kind])}`);
      // the changes and cuts first – that is the work to do
      const order: Verdict[] = ['cut', 'edit', 'ok'];
      for (const v of order)
        for (const i of k.filter((x) => marks[x.key].verdict === v)) {
          const m = marks[i.key];
          lines.push(`- ${SIGN[v]} ${tx(i.title)}${m.note ? ` – ${m.note.replace(/\s+/g, ' ').trim()}` : ''}`);
        }
    }
  }
  return lines.join('\n') + '\n';
}

