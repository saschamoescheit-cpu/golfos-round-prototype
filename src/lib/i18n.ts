import type { Club } from '../types';

// Language (feature 021): every text sits next to its German translation at the call site – tr('New round', 'Neue
// Runde'); the other languages (Sascha 13.11.2026: "neben Deutsch und Englisch auch alle anderen Sprachen") come from a
// dictionary per language, keyed by the English text (src/i18n/dict/<lang>.json, made by scripts/i18n-extract.mjs and
// the translators; a template's `${…}` as {0}, {1} …). A text not in it stays English. The first start: the phone's
// language when there is one of them, else English (Sascha 13.11.2026); changed in the profile.
// Golf terms as club golfers say them (Abschlag, Aus, Carry, Spielvorgabe, Eisen 7).

/** The languages, each in its own name – English and German first. */
export const LANGS = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
  { code: 'es', name: 'Español', locale: 'es-ES' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'it', name: 'Italiano', locale: 'it-IT' },
  { code: 'nl', name: 'Nederlands', locale: 'nl-NL' },
  { code: 'pt', name: 'Português', locale: 'pt-BR' },
  { code: 'sv', name: 'Svenska', locale: 'sv-SE' },
  { code: 'da', name: 'Dansk', locale: 'da-DK' },
  { code: 'nb', name: 'Norsk', locale: 'nb-NO' },
  { code: 'fi', name: 'Suomi', locale: 'fi-FI' },
  { code: 'pl', name: 'Polski', locale: 'pl-PL' },
  { code: 'ja', name: '日本語', locale: 'ja-JP' },
  { code: 'zh', name: '中文', locale: 'zh-CN' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];
const KEY = 'golfos.lang.v1';
const known = (c: string | null | undefined): c is Lang => !!c && LANGS.some((l) => l.code === c);

/** A phone's language as one of ours: "de-AT" → de, "no"/"nn" → nb, "zh-Hans" → zh; none of them: null. */
export function langOf(tag: string | null | undefined): Lang | null {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  const code = base === 'no' || base === 'nn' ? 'nb' : base;
  return known(code) ? code : null;
}

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (known(saved)) return saved;
  } catch {
    // storage blocked
  }
  // Outside the browser (unit tests, the caddie audit) the texts stay English.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'en';
  for (const t of [...(navigator.languages ?? []), navigator.language]) {
    const l = langOf(t);
    if (l) return l;
  }
  return 'en';
}

let lang: Lang = initial();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = (): Lang => lang;
/** The language's locale for dates and numbers ("de-DE", "es-ES" …). */
export const langLocale = (l: Lang = lang): string => LANGS.find((x) => x.code === l)?.locale ?? 'en-GB';

/** Switches the language and reloads the app (every screen reads its texts on render). */
export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // storage blocked – the choice lives for this session
  }
  if (typeof location !== 'undefined') location.reload();
}

// ---------- the dictionary of a language other than English and German ----------
let dict: Record<string, string> = {};
let templates: { re: RegExp; to: string; fixed: number }[] = [];
const done = new Map<string, string>();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The dictionary in use: its plain texts, and the templates as patterns (the longest fixed text first). */
export function useDict(d: Record<string, string>): void {
  dict = {};
  templates = [];
  done.clear();
  for (const [k, v] of Object.entries(d)) {
    if (!/\{\d\}/.test(k)) dict[k] = v;
    else {
      const parts = k.split(/\{(\d)\}/);
      let re = '^';
      for (let i = 0; i < parts.length; i++) re += i % 2 ? `(?<s${parts[i]}>[\\s\\S]*?)` : esc(parts[i]);
      templates.push({ re: new RegExp(re + '$'), to: v, fixed: parts.filter((_, i) => i % 2 === 0).join('').length });
    }
  }
  templates.sort((a, b) => b.fixed - a.fixed);
}

// Vite turns the call into the dictionaries' loaders; bundled for node (QA, esbuild) there is none – English and German
let dicts: Record<string, () => Promise<{ default: Record<string, string> }>> = {};
try {
  dicts = import.meta.glob<{ default: Record<string, string> }>('../i18n/dict/*.json');
} catch {
  /* not under Vite */
}
/** The dictionary of the language chosen, before the app is drawn; none needed for English and German. */
export async function loadLang(): Promise<void> {
  if (lang === 'en' || lang === 'de') return;
  const load = dicts[`../i18n/dict/${lang}.json`];
  if (!load) return;
  try {
    useDict((await load()).default);
  } catch {
    // not loaded (offline before it was cached): English
  }
}

/** A text in a language of the dictionary – the plain text, else a template filled with what the English one had. */
function fromDict(en: string): string {
  const hit = done.get(en);
  if (hit != null) return hit;
  let out = dict[en];
  if (out == null) {
    for (const t of templates) {
      // a template whose fixed words are only a small part of the text is a different text ("Play and review rounds" is
      // not "{0} rounds") – English rather than half translated
      if (t.fixed < en.length * 0.4) continue;
      const m = t.re.exec(en);
      if (!m) continue;
      const g = m.groups ?? {};
      out = t.to.replace(/\{(\d)\}/g, (_, n: string) => g[`s${n}`] ?? '');
      break;
    }
  }
  out ??= en;
  done.set(en, out);
  return out;
}

/** The text in the player's language. */
export function tr(en: string, de: string): string {
  if (lang === 'de') return de;
  if (lang === 'en') return en;
  // a locale or a language code asked for (dates, numbers, speech): the language's own
  if (/^[a-z]{2}-[A-Z]{2}$/.test(en)) return langLocale();
  if (/^[a-z]{2}$/.test(en) && /^[a-z]{2}$/.test(de)) return lang;
  return fromDict(en);
}

/** For tests: the language without reload. */
export function useLangForTests(l: Lang): void {
  lang = l;
}

// Short club labels as golfers write them, in both languages (Sascha 14.10.2026): D, 3W, 5W, 4H, 5i … 9i, PW, GW,
// SW, LW (P = putter). The bag has one hybrid: 4H.
const CLUB_CODE: Record<Club, string> = {
  Dr: 'D', '3W': '3W', '4W': '4W', '5W': '5W', '7W': '7W', '9W': '9W', '2H': '2H', '3H': '3H', Hy: '4H', '5H': '5H', '6H': '6H',
  '2i': '2i', '3i': '3i', '4i': '4i', '5i': '5i', '6i': '6i', '7i': '7i', '8i': '8i', '9i': '9i', PW: 'PW', GW: 'GW', SW: 'SW', LW: 'LW', Pt: 'P',
};
/** Short club label: "7i", "D", "4H". */
export const clubCode = (c: Club): string => CLUB_CODE[c];

/** Speech language for read-aloud and voice questions. */
export const speechLang = (): string => (lang === 'en' ? 'en-US' : langLocale());

const SIDE_DE: Record<string, string> = { left: 'links', right: 'rechts', long: 'hinten', short: 'kurz' };
/** left / right / long / short in the player's language ("links", "rechts", "hinten", "kurz"). */
export const sideWord = (s: string): string => tr(s, SIDE_DE[s] ?? s);

const HAZARD_DE: Record<string, string> = { water: 'Wasser', bunker: 'Bunker', rough: 'Rough', trees: 'Bäume', woods: 'Wald – Ball weg', drop: 'Abhang', ob: 'Aus' };
/** Hazard name in the player's language. */
export const hazardWord = (h: string): string => tr(({ woods: 'woods – ball lost', drop: 'steep drop', ob: 'out of bounds' } as Record<string, string>)[h] ?? h, HAZARD_DE[h] ?? h);

/** Decimal number as text: "34.8" in English, "34,8" in German. */
export const dec = (v: number | string): string => (lang === 'en' || lang === 'ja' || lang === 'zh' ? String(v) : String(v).replace('.', ','));
