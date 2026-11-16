import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { tr, trIn, useDict, useLangForTests } from '../lib/i18n';

// The merge of the translators' parts (scripts/i18n-merge.mjs): words written with a hyphen and short words ("3-wood",
// "left-handed", "to", "in") are texts and get translated; identifiers and locale codes never (night 16./17.11.2026 –
// before, "Holz 3", "Linkshänder", "an" stayed English in every language).
const LANGS = ['da', 'es', 'fi', 'fr', 'it', 'ja', 'nb', 'nl', 'pl', 'pt', 'sv', 'zh'];
const dict = (l: string): Record<string, string> => JSON.parse(readFileSync(`src/i18n/dict/${l}.json`, 'utf8'));

describe('the dictionaries', () => {
  it('translate words with a hyphen and short words', () => {
    for (const l of LANGS) {
      const d = dict(l);
      for (const k of ['left-handed', 'right-handed', 'set-up', 'to']) expect(d[k], `${l} ${k}`).toBeTruthy();
    }
  });
  it('a decimal point stays a point where the language writes one (zh had „。“)', () => {
    expect(dict('zh')['.']).toBeUndefined();
    expect(dict('ja')['.']).toBeUndefined();
    for (const l of ['da', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt', 'sv', 'fi']) expect(dict(l)['.'], l).toBe(',');
  });
  it('a word in its sense: the back and front of the green, the halves of a match, the 3D front view (17.11.2026)', () => {
    for (const l of LANGS) {
      const d = dict(l);
      for (const k of ['Back [green]', 'Front [green]', 'Front [nine]', 'Back [nine]', 'Front [view]']) expect(d[k], `${l} ${k}`).toBeTruthy();
      // never the navigation's "Back" (Zurück) on the green
      expect(d['Back [green]'], l).not.toBe(d['Back']);
    }
    useDict(dict('pt'));
    useLangForTests('pt');
    try {
      expect(trIn('green', 'Back', 'Hinten')).toBe('Fundo');
      expect(trIn('green', 'Front', 'Vorne')).toBe('Frente');
      expect(tr('Back', 'Zurück')).toBe('Voltar');
      // a sense without its own text: the plain word
      expect(trIn('nowhere', 'Back', 'Hinten')).toBe('Voltar');
      useLangForTests('de');
      expect(trIn('green', 'Back', 'Hinten')).toBe('Hinten');
      useLangForTests('en');
      expect(trIn('green', 'Back', 'Hinten')).toBe('Back');
    } finally {
      useLangForTests('en');
      useDict({});
    }
  });
  it('every word with a sense has its own text in every language, English shows the word without it', () => {
    const source: Record<string, string> = JSON.parse(readFileSync('src/i18n/source.json', 'utf8'));
    const senses = Object.keys(source).filter((k) => / \[[a-z]+\]$/.test(k));
    expect(senses.length).toBeGreaterThanOrEqual(17);
    for (const l of LANGS) for (const k of senses) expect(dict(l)[k], `${l} ${k}`).toBeTruthy();
    useLangForTests('en');
    expect(tr('Finish [swing]', 'Finish')).toBe('Finish');
    expect(tr('Watch [device]', 'Uhr')).toBe('Watch');
    useLangForTests('de');
    expect(tr('Watch [device]', 'Uhr')).toBe('Uhr');
    useDict(dict('fr'));
    useLangForTests('fr');
    try {
      // the swing's finish, not "Terminer"; the watch, not "Regarde"
      expect(tr('Finish [swing]', 'Finish')).toBe('Finish');
      expect(tr('Finish', 'Beenden')).toBe('Terminer');
      expect(tr('Watch [device]', 'Uhr')).toBe('Montre');
      expect(tr('Right [correct]', 'Richtig')).toBe('Correct');
    } finally {
      useLangForTests('en');
      useDict({});
    }
  });
  it('never translate an identifier or a locale code', () => {
    for (const l of LANGS) {
      const d = dict(l);
      for (const k of ['tiger-gate', 'leadElbow', 'clubHead', 'en', 'en-GB']) expect(d[k], `${l} ${k}`).toBeUndefined();
    }
  });
});
