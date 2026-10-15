import { useState } from 'react';
import { getLang, setLang, tr } from '../lib/i18n';
import { isSun, setSun } from '../lib/theme';

// The version in small print (so a new one is easy to spot, Sascha 14.10.2026), the language and the sun mode – the
// same header on the start page, in Rounds and in Games (Sascha 15.10.2026), right of the GOLFOS logo.
export function TopTools() {
  const [sun, setSunState] = useState(isSun);
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  return (
    <>
      <span className="spacer topbar-version muted" title={__BUILD_TIME__}>
        <span className="topbar-version-word">Version </span>
        <span>{new Date(__BUILD_TIME__).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      <button
        type="button"
        className="lang-btn"
        aria-label={getLang() === 'de' ? 'Sprache: Deutsch – switch to English' : 'Language: English – auf Deutsch umstellen'}
        onClick={() => setLang(getLang() === 'de' ? 'en' : 'de')}
      >
        {getLang() === 'de' ? 'DE' : 'EN'}
      </button>
      <button
        type="button"
        className="lang-btn"
        aria-pressed={sun}
        aria-label={sun ? tr('Sun mode off', 'Sonnenmodus aus') : tr('Sun mode on – light screen for bright sunshine', 'Sonnenmodus an – heller Bildschirm für grelles Sonnenlicht')}
        onClick={() => {
          setSun(!sun);
          setSunState(!sun);
        }}
      >
        ☀
      </button>
    </>
  );
}
