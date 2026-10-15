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
        {/* a line drawing like the menu icons (Sascha 15.10.2026) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" style={{ display: 'block', margin: 'auto' }}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      </button>
    </>
  );
}
