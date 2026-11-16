import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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
  it('never translate an identifier or a locale code', () => {
    for (const l of LANGS) {
      const d = dict(l);
      for (const k of ['tiger-gate', 'leadElbow', 'clubHead', 'en', 'en-GB']) expect(d[k], `${l} ${k}`).toBeUndefined();
    }
  });
});
