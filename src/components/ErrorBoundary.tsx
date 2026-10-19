import { Component, type ReactNode } from 'react';
import { shareBackup } from '../lib/backup';
import { tr } from '../lib/i18n';
import { isStaleChunk, mayReloadForNewVersion, reloadForNewVersion } from '../lib/staleChunk';

/** Set before reloading so the app opens the start page instead of the round that crashed. */
export const NO_RESUME = 'golfos.noresume';

// Last line of defence on the course: instead of a blank screen the player sees what happened and can go on.
// Every input is already saved, so reloading brings the round back (the app reopens a round in play).

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // a new version went live while the app was open: reload onto it instead of this screen (once)
    if (isStaleChunk(error) && reloadForNewVersion()) return;
    try {
      localStorage.setItem('golfos.lasterror.v1', JSON.stringify({ at: new Date().toISOString(), message: String(error?.message ?? error), stack: String(error?.stack ?? '').slice(0, 2000) }));
    } catch {
      // storage blocked – nothing to keep
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (isStaleChunk(this.state.error) && mayReloadForNewVersion()) return <main className="screen" />; // the reload onto the new version is on its way
    return (
      <main className="screen" style={{ justifyContent: 'center', gap: 16 }}>
        <h1 style={{ margin: 0 }}>{tr('Something went wrong', 'Da ist etwas schiefgelaufen')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {tr('Your round is saved. Tap “Continue” to go on where you were.', 'Deine Runde ist gespeichert. Tippe auf „Weiter“, um dort weiterzumachen.')}
        </p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          {tr('Continue', 'Weiter')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            try {
              sessionStorage.setItem(NO_RESUME, '1');
            } catch {
              // storage blocked – the reload opens the round again
            }
            location.reload();
          }}
        >
          {tr('Go to start page', 'Zur Startseite')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => shareBackup().catch(() => undefined)}>
          {tr('Save backup', 'Sichern')}
        </button>
        <button
          type="button"
          className="btn-secondary btn-danger"
          onClick={() => {
            if (!confirm(tr('Delete all rounds and settings on this phone? Save a backup first if you want to keep them.', 'Alle Runden und Einstellungen auf diesem Handy löschen? Sichere sie vorher, wenn du sie behalten willst.'))) return;
            Object.keys(localStorage)
              .filter((k) => k.startsWith('golfos.'))
              .forEach((k) => localStorage.removeItem(k));
            location.reload();
          }}
        >
          {tr('Reset app data', 'App-Daten zurücksetzen')}
        </button>
        <p className="muted small" style={{ margin: 0, wordBreak: 'break-word' }}>
          {tr('Error', 'Fehler')}: {this.state.error.message}
        </p>
      </main>
    );
  }
}
