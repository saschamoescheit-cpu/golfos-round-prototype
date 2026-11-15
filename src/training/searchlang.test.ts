import { afterEach, describe, expect, it } from 'vitest';
import { useDict, useLangForTests } from '../lib/i18n';
import fr from '../i18n/dict/fr.json';
import ja from '../i18n/dict/ja.json';
import pl from '../i18n/dict/pl.json';
import { search } from './search';

// The Training search in the player's language (16.11.2026): besides English and German it reads the texts in the
// language chosen – a French player finds the plugged ball by "œuf", a Japanese one by 目玉 (no spaces between words).

const shotIds = (q: string) => search(q).shots.map(({ s }) => s.id);

describe('search in the player’s language', () => {
  afterEach(() => {
    useLangForTests('en');
    useDict({});
  });

  it('French: œuf, enfoncée', () => {
    useLangForTests('fr');
    useDict(fr);
    expect(shotIds('œuf')).toContain('bunker-plugged');
    expect(shotIds('balle enfoncée')).toContain('bunker-plugged');
  });

  it('Polish: jajko (with its own letters)', () => {
    useLangForTests('pl');
    useDict(pl);
    expect(shotIds('jajko')).toContain('bunker-plugged');
  });

  it('Japanese: a word inside a line without spaces', () => {
    useLangForTests('ja');
    useDict(ja);
    expect(shotIds('目玉')).toContain('bunker-plugged');
  });

  it('English and German still as before – and German words in another language too', () => {
    expect(shotIds('Spiegelei')).toContain('bunker-plugged');
    expect(shotIds('fried egg')).toContain('bunker-plugged');
    useLangForTests('fr');
    useDict(fr);
    expect(shotIds('Spiegelei')).toContain('bunker-plugged');
  });
});
