import { useEffect } from 'react';
import { canLink } from '../lib/friendlinks';
import { roundInvites } from '../lib/sharedround';
import { loadRounds } from '../lib/storage';
import { loadGames } from '../lib/gamestore';
import { setInboxInvites } from '../lib/inboxstore';

/**
 * The invitations to a round, a game or bets – into the inbox (Sascha 13.11.2026: "solche Meldungen nur ausschließlich
 * in der Box, an allen anderen Stellen entfernt"; before: a sheet on every screen, 03.11.2026). Looked up when the app
 * opens, comes back to the screen and every 30 seconds; the inbox's number shows them, a tap there joins.
 */
export function RoundInviteHost() {
  useEffect(() => {
    let gone = false;
    const look = async () => {
      if (gone || document.visibilityState !== 'visible' || !canLink()) return;
      const joined = [...loadRounds().map((r) => r.shared?.code), ...loadGames().map((g) => g.shared?.code)].filter((c): c is string => !!c);
      const found = await roundInvites(joined, true);
      if (!gone) setInboxInvites(found);
    };
    // a moment after the app opened – not in the middle of its loading
    const first = window.setTimeout(() => void look(), 2500);
    const t = window.setInterval(() => void look(), 30000);
    document.addEventListener('visibilitychange', look);
    window.addEventListener('golfos:synced', look);
    return () => {
      gone = true;
      window.clearTimeout(first);
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('golfos:synced', look);
    };
  }, []);
  return null;
}
