import { useEffect, useState } from 'react';
import { lastSync, loadSession, signIn, signOut, syncConfigured, syncNow } from '../lib/sync';
import { getLang, tr } from '../lib/i18n';

// "On all your devices" in the profile (feature 013): sign in with Google, then rounds, games, profile, bag and
// friends are the same on iPhone, iPad and PC. Hidden until the Supabase project is set up.

export function SyncCard(props: { onSignedIn?: () => void }) {
  const [session, setSession] = useState(loadSession);
  const [last, setLast] = useState(lastSync);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const on = () => {
      setSession(loadSession());
      setLast(lastSync());
      props.onSignedIn?.();
    };
    window.addEventListener('golfos:synced', on);
    return () => window.removeEventListener('golfos:synced', on);
  }, []);
  if (!syncConfigured()) return null;
  const locale = getLang() === 'de' ? 'de-DE' : undefined;
  const when = last ? new Date(last).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <section className="card stats-card">
      <h2>{tr('On all your devices', 'Auf allen Geräten')}</h2>
      {!session ? (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            {tr(
              'Sign in, and your rounds, games, profile, bag and friends are the same on iPhone, iPad and computer. On the course the app keeps working without a network.',
              'Melde dich an, dann sind Runden, Spiele, Profil, Bag und Freunde auf iPhone, iPad und Computer gleich. Auf dem Platz funktioniert die App weiter ohne Netz.',
            )}
          </p>
          <button type="button" className="btn-secondary google-btn" onClick={signIn}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.7 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z" />
              <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.6 2.8C6.6 7.4 9.1 5.4 12 5.4z" />
            </svg>
            {tr('Sign in with Google', 'Mit Google anmelden')}
          </button>
        </>
      ) : (
        <>
          <span className="small">
            {tr('Signed in', 'Angemeldet')}
            {session.email ? ` · ${session.email}` : ''}
          </span>
          <span className="muted small">{when ? tr(`Last sync ${when}`, `Zuletzt abgeglichen ${when}`) : tr('Not synced yet', 'Noch nicht abgeglichen')}</span>
          <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await syncNow();
                setBusy(false);
                setMsg(r ? tr(`Synced · ${r.pushed} sent, ${r.pulled} received.`, `Abgeglichen · ${r.pushed} gesendet, ${r.pulled} empfangen.`) : tr('No connection right now – it syncs by itself later.', 'Gerade keine Verbindung – der Abgleich läuft später von selbst.'));
              }}
            >
              {busy ? tr('Syncing …', 'Gleiche ab …') : tr('Sync now', 'Jetzt abgleichen')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                signOut();
                setSession(null);
                setMsg(tr('Signed out. Your data stays on this device.', 'Abgemeldet. Deine Daten bleiben auf diesem Gerät.'));
              }}
            >
              {tr('Sign out', 'Abmelden')}
            </button>
          </div>
        </>
      )}
      {msg && <span className="muted small">{msg}</span>}
    </section>
  );
}
