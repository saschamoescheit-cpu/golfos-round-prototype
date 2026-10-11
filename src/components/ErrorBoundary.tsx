import { Component, type ReactNode } from 'react';
import { shareBackup } from '../lib/backup';

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
    try {
      localStorage.setItem('golfos.lasterror.v1', JSON.stringify({ at: new Date().toISOString(), message: String(error?.message ?? error), stack: String(error?.stack ?? '').slice(0, 2000) }));
    } catch {
      // storage blocked – nothing to keep
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="screen" style={{ justifyContent: 'center', gap: 16 }}>
        <h1 style={{ margin: 0 }}>Something went wrong</h1>
        <p className="muted" style={{ margin: 0 }}>
          Your round is saved. Tap “Continue” to go on where you were.
        </p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          Continue
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
          Go to start page
        </button>
        <button type="button" className="btn-secondary" onClick={() => shareBackup().catch(() => undefined)}>
          Save backup
        </button>
        <button
          type="button"
          className="btn-secondary btn-danger"
          onClick={() => {
            if (!confirm('Delete all rounds and settings on this phone? Save a backup first if you want to keep them.')) return;
            Object.keys(localStorage)
              .filter((k) => k.startsWith('golfos.'))
              .forEach((k) => localStorage.removeItem(k));
            location.reload();
          }}
        >
          Reset app data
        </button>
        <p className="muted small" style={{ margin: 0, wordBreak: 'break-word' }}>
          Error: {this.state.error.message}
        </p>
      </main>
    );
  }
}
