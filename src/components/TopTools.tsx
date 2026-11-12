import { useState } from 'react';
import { getLang, langLocale, tr } from '../lib/i18n';
import { isSun, setSun } from '../lib/theme';
import { NotifyBell } from './NotifyBell';

// The version in small print (so a new one is easy to spot, Sascha 14.10.2026), the language and the sun mode – the
// same header on the start page, in Rounds and in Games (Sascha 15.10.2026), right of the GOLFOS logo.
export function TopTools() {
  const [sun, setSunState] = useState(isSun);
  const locale = getLang() === 'en' ? undefined : langLocale();
  return (
    <>
      {/* two lines – "TT.MM." over "HH:MM" (Sascha 03.11.2026: beside the claim the version looked cramped) */}
      <span className="spacer topbar-version muted" title={__BUILD_TIME__} aria-label={`Version ${new Date(__BUILD_TIME__).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}>
        <span>{new Date(__BUILD_TIME__).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}</span>
        <span>{new Date(__BUILD_TIME__).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
      </span>
      {/* the language: in the profile (Sascha 13.11.2026) – here only the sun mode and the inbox */}
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
      {/* the inbox, on the far right (Sascha 13.11.2026: "platziere die Inbox ganz rechts") */}
      <NotifyBell />
    </>
  );
}
