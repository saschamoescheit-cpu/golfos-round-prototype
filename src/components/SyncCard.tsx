import { useEffect, useState } from 'react';
import { lastSyncError, loadSession, signIn, syncConfigured } from '../lib/sync';
import { tr } from '../lib/i18n';
import { AccountForm } from './AccountForm';

// "On all your devices" in the profile (feature 013): sign in with Google or a user name, then rounds, games, profile,
// bag and friends are the same on iPhone, iPad and PC. Signed in, the card is gone for good (Sascha 23.10.2026: "the
// whole sync without this section and without having to click anything") – the sync runs by itself (start, every 20 s,
// after each change), the account and "Abmelden" stand by the profile photo. A new device simply takes the settings
// of the others; this device's earlier ones stay stored (never deleted). Hidden until the Supabase project is set up.

export function SyncCard(props: { onSignedIn?: () => void }) {
  const [session, setSession] = useState(loadSession);
  const [err, setErr] = useState(lastSyncError);
  useEffect(() => {
    const on = () => {
      setSession(loadSession());
      setErr(lastSyncError());
      props.onSignedIn?.();
    };
    window.addEventListener('golfos:synced', on);
    return () => window.removeEventListener('golfos:synced', on);
  }, []);
  if (!syncConfigured() || session) return null;
  return (
    <section className="card stats-card">
      <h2>{tr('On all your devices', 'Auf allen Geräten')}</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {tr('Rounds, games and bag on iPhone, iPad and computer.', 'Runden, Spiele und Bag auf iPhone, iPad und Computer.')}
      </p>
      {/* why the player is signed out again (e.g. the sign-in ran out on the server) */}
      {err && <span className="small bad-text">{err.text}</span>}
      <button type="button" className="btn-secondary google-btn" onClick={signIn}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" /> {/* ci-allow: Google logo */}
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" />
        </svg>
        {tr('Sign in with Google', 'Mit Google anmelden')}
      </button>
      {/* or with a user name and password (Sascha 22.10.2026, as in Schlaufuchs) */}
      <span className="muted small account-or">{tr('or with a user name', 'oder mit Benutzername')}</span>
      <AccountForm
        onDone={() => {
          setSession(loadSession());
          props.onSignedIn?.();
        }}
      />
    </section>
  );
}
