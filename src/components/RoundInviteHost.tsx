import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { canLink } from '../lib/friendlinks';
import { inviteSeen, roundInvites, type RoundInvite } from '../lib/sharedround';
import { loadRounds } from '../lib/storage';
import { loadGames } from '../lib/gamestore';

/**
 * "Sascha invites you to his round" on every screen of the app (Sascha 03.11.2026: "a push, or better a request right in
 * the app when it is open, so he joins straight away"): looked up when the app opens, comes back to the screen and every
 * 30 seconds; "Join" opens "Join a round" with the code – he is let in already, so he is in at once.
 */
export function RoundInviteHost() {
  const [inv, setInv] = useState<RoundInvite | null>(null);
  useEffect(() => {
    let gone = false;
    const look = async () => {
      if (gone || document.visibilityState !== 'visible' || !canLink()) return;
      const joined = [...loadRounds().map((r) => r.shared?.code), ...loadGames().map((g) => g.shared?.code)].filter((c): c is string => !!c);
      const found = await roundInvites(joined);
      if (!gone) setInv((now) => now ?? found[0] ?? null);
    };
    void look();
    const t = window.setInterval(() => void look(), 30000);
    document.addEventListener('visibilitychange', look);
    window.addEventListener('golfos:synced', look);
    return () => {
      gone = true;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('golfos:synced', look);
    };
  }, []);
  if (!inv) return null;
  const title = inv.kind === 'pool' ? tr('Invitation to bets', 'Einladung zu Wetten') : inv.kind === 'game' ? tr('Invitation to a game', 'Einladung zum Spiel') : tr('Invitation to a round', 'Einladung zur Runde');
  const text =
    inv.kind === 'pool'
      ? tr(`${inv.who} invites you to his bets "${inv.course}".`, `${inv.who} lädt dich zu seinen Wetten „${inv.course}“ ein.`)
      : inv.kind === 'game'
        ? tr(`${inv.who} invites you to his game${inv.course ? ` at ${inv.course}` : ''}.`, `${inv.who} lädt dich zu seinem Spiel${inv.course ? ` in ${inv.course}` : ''} ein.`)
        : inv.course
          ? tr(`${inv.who} invites you to his round at ${inv.course}.`, `${inv.who} lädt dich zu seiner Runde in ${inv.course} ein.`)
          : tr(`${inv.who} invites you to his round.`, `${inv.who} lädt dich zu seiner Runde ein.`);
  const close = () => {
    inviteSeen(inv.code);
    setInv(null);
  };
  return (
    <div className="sheet-backdrop" onClick={close}>
      <section className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={close}>
            ✕
          </button>
        </div>
        <p>{text}</p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            close();
            window.dispatchEvent(new CustomEvent(inv.kind === 'round' ? 'golfos:join-round' : 'golfos:join-game', { detail: inv.code }));
          }}
        >
          {tr('Join', 'Beitreten')}
        </button>
        <button type="button" className="btn-secondary" onClick={close}>
          {tr('Not now', 'Jetzt nicht')}
        </button>
      </section>
    </div>
  );
}
