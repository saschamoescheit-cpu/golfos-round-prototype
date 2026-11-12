import { afterEach, describe, expect, it } from 'vitest';
import { dec, langLocale, langOf, tr, useDict, useLangForTests } from './i18n';

// All languages (Sascha 13.11.2026): the phone's language when it is one of them, else English; the other languages
// from a dictionary keyed by the English text, templates with {0} {1} … filled from it; missing: English.
describe('languages', () => {
  afterEach(() => {
    useLangForTests('en');
    useDict({});
  });
  it("the phone's language as one of ours – else none (then English)", () => {
    expect(langOf('de-AT')).toBe('de');
    expect(langOf('es-419')).toBe('es');
    expect(langOf('nn-NO')).toBe('nb');
    expect(langOf('no')).toBe('nb');
    expect(langOf('zh-Hans-CN')).toBe('zh');
    expect(langOf('ko-KR')).toBe(null);
    expect(langOf('')).toBe(null);
  });
  it('English and German as ever', () => {
    expect(tr('New round', 'Neue Runde')).toBe('New round');
    useLangForTests('de');
    expect(tr('New round', 'Neue Runde')).toBe('Neue Runde');
  });
  it('another language: the plain text, a template filled (slots in its own order), a missing one in English', () => {
    useLangForTests('es');
    useDict({ 'New round': 'Nueva ronda', '{0} invites you to a round': '{0} te invita a una ronda', '{0} of {1} holes': '{1} hoyos, {0} jugados', '{0} holes': '{0} hoyos' });
    expect(tr('New round', 'Neue Runde')).toBe('Nueva ronda');
    expect(tr('Chris invites you to a round', 'Chris lädt dich zu einer Runde ein')).toBe('Chris te invita a una ronda');
    // the longer fixed text wins over a shorter template that would match too
    expect(tr('9 of 18 holes', '9 von 18 Löchern')).toBe('18 hoyos, 9 jugados');
    expect(tr('18 holes', '18 Löcher')).toBe('18 hoyos');
    expect(tr('Not translated yet', 'Noch nicht übersetzt')).toBe('Not translated yet');
    // a locale asked for: the language's own
    expect(tr('en-GB', 'de-DE')).toBe('es-ES');
    expect(langLocale()).toBe('es-ES');
    expect(dec(3.5)).toBe('3,5');
  });
});
