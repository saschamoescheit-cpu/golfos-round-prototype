// "Nicht aktuell" over a standing, a settlement or a leaderboard while the server does not answer (Sascha 14.11.2026: the
// standing showed Moritz's two birdies, corrected long since, as if right – "Alle Auswertungen müssen richtig sein").
import { useEffect, useState } from 'react';
import { serverDownSince } from '../lib/serverstate';
import { tr } from '../lib/i18n';

export function ServerStale() {
  const [since, setSince] = useState(serverDownSince);
  useEffect(() => {
    const on = () => setSince(serverDownSince());
    window.addEventListener('golfos:server', on);
    return () => window.removeEventListener('golfos:server', on);
  }, []);
  if (!since) return null;
  const at = new Date(since);
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = at.toDateString() === new Date().toDateString() ? time : `${at.getDate()}.${at.getMonth() + 1}. ${time}`;
  return (
    <div className="server-stale" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <span>
        <strong>{tr('Not up to date', 'Nicht aktuell')}</strong>
        {' · '}
        {tr(`no connection to the server since ${day} – what the other phones entered is missing here.`, `keine Verbindung zum Server seit ${day} – was die anderen Handys eingetragen haben, fehlt hier.`)}
      </span>
    </div>
  );
}
