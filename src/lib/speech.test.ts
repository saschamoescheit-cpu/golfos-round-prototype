import { afterAll, describe, expect, it } from 'vitest';
import { forSpeech } from './caddietalk';
import { useLangForTests } from './i18n';
import { FORMS } from './gameforms';
import { rulesSpoken } from '../screens/Games';

// Read aloud everywhere (Sascha 28.10.2026: "check that the speaker and the read-aloud work everywhere"): what goes to
// the voice has no signs a voice spells out or skips – the screen's "·", the minus sign, "&", "km/h", arrows.
const BAD = /[·→×≈~&…/−]|undefined|NaN|\.\./;

describe('the texts a voice reads', () => {
  afterAll(() => useLangForTests('en'));
  it('signs as words, in German', () => {
    useLangForTests('de');
    expect(forSpeech('Eisen 7. 150 m zur Fahne · spielt wie 155 m.')).toBe('Eisen 7. 150 m zur Fahne, spielt wie 155 m.');
    expect(forSpeech('Normal Eisen 8 – mit 25 km/h Rückenwind (−11 m) heute Eisen 9.')).toBe('Normal Eisen 8 – mit 25 Kilometer pro Stunde Rückenwind (minus 11 m) heute Eisen 9.');
    expect(forSpeech('Gegenwind 24 km/h (böig): +26 m · 15 °C: +2 m')).toBe('Gegenwind 24 Kilometer pro Stunde (böig): plus 26 m, 15 °C: plus 2 m');
    expect(forSpeech('Teams 1 & 2 gegen 3 & 4.')).toBe('Teams 1 und 2 gegen 3 und 4.');
    expect(forSpeech('gewonnen (z. B. 3&2).')).toBe('gewonnen (z. B. 3 und 2).');
    expect(forSpeech('Loch 1–9 · Holz 3')).toBe('Loch 1–9, Holz 3'); // a range keeps its dash
    expect(forSpeech('Einsatz ×2 → Punkte halbiert …')).toBe('Einsatz mal 2, Punkte halbiert');
  });
  it('and in English', () => {
    useLangForTests('en');
    expect(forSpeech('With 25 km/h behind you (−11 m) today the 7-iron · ±3 m')).toBe('With 25 kilometres per hour behind you (minus 11 m) today the 7-iron, plus or minus 3 m');
  });
  it('the rules of every game form, in both languages, read cleanly', () => {
    const bad: string[] = [];
    for (const lang of ['de', 'en'] as const) {
      useLangForTests(lang);
      for (const f of FORMS) {
        const t = forSpeech(rulesSpoken(f));
        const m = t.match(BAD);
        if (m) bad.push(`${f.id} ${lang}: "${t.slice(Math.max(0, m.index! - 25), m.index! + 15)}"`);
        expect(t.length).toBeGreaterThan(20);
      }
    }
    expect(bad).toEqual([]);
  });
});
