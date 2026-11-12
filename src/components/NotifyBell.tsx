import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { canLink } from '../lib/friendlinks';
import { cachedEvent, reopenAsked, roundInvites, type RoundInvite } from '../lib/sharedround';
import { isTourHost, loadTours } from '../lib/tourstore';
import { loadRounds } from '../lib/storage';
import { loadGames } from '../lib/gamestore';
import { openChallenges } from '../lib/wagerstore';
import { prizeOf, prizeSym } from '../lib/prize';
import { goPool, goTour } from '../lib/nav';
import { roundsToSign } from '../screens/Rounds';

// The bell beside the language and the sun mode (Sascha 13.11.2026: "neben der Sprache und dem Tag-/Nachtmodus noch eine
// Glocke für Notifications, wie Anfragen usw."): what others ask of you and what waits for you, in one sheet – an
// invitation to a round, a game or bets (also one put aside with "Nicht jetzt"), a 5+5+10 challenge, rounds to check &
// sign, game results to confirm. A green dot with the number while something waits; each row goes straight there.

interface BellItem {
  key: string;
  title: string;
  line: string;
  go: () => void;
}

const pick = (m: 'rounds' | 'games') => window.dispatchEvent(new CustomEvent('golfos:pick-module', { detail: m }));

function inviteItem(inv: RoundInvite): BellItem {
  const title =
    inv.kind === 'pool'
      ? tr(`${inv.who} invites you to bets`, `${inv.who} lädt dich zu Wetten ein`)
      : inv.kind === 'game'
        ? tr(`${inv.who} invites you to a game`, `${inv.who} lädt dich zu einem Spiel ein`)
        : tr(`${inv.who} invites you to a round`, `${inv.who} lädt dich zu einer Runde ein`);
  return {
    key: `inv:${inv.code}`,
    title,
    line: inv.course || tr('Tap to join', 'Antippen zum Beitreten'),
    go: () => window.dispatchEvent(new CustomEvent(inv.kind === 'round' ? 'golfos:join-round' : 'golfos:join-game', { detail: inv.code })),
  };
}

function localItems(): BellItem[] {
  const out: BellItem[] = [];
  // a card handed in asked to be opened for a correction – the host confirms it on the tournament's page (Sascha
  // 13.11.2026: "Erik hat eine Anfrage geschickt … ich finde nicht, wo ich das bestätigen kann")
  for (const t of loadTours().filter(isTourHost)) {
    const ev = cachedEvent(t.code);
    for (const f of Object.values(ev?.flights ?? {}))
      for (const p of f.players.filter((x) => reopenAsked(f, x.id)))
        out.push({
          key: `reopen:${t.code}:${p.id}`,
          title: tr(`${f.reopen![p.id].by} asks to correct ${p.name}'s card`, `${f.reopen![p.id].by} möchte die Karte von ${p.name} korrigieren`),
          line: tr(`${t.ev.name} – confirm on its page`, `${t.ev.name} – auf der Turnierseite bestätigen`),
          go: () => goTour(t.code),
        });
  }
  for (const { e, w } of openChallenges()) {
    const by = e.pool.players.find((p) => p.id === w.player)?.name ?? '?';
    out.push({ key: `duel:${w.id}`, title: tr(`${by} challenges you to 5+5+10`, `${by} fordert dich zu 5+5+10 heraus`), line: `${e.pool.name} · ${prizeSym(prizeOf(e.pool))}`, go: () => goPool(e.code) });
  }
  const sign = roundsToSign(loadRounds());
  if (sign.length)
    out.push({
      key: 'sign',
      title: sign.length === 1 ? tr('1 round to check & sign', '1 Runde prüfen & signieren') : tr(`${sign.length} rounds to check & sign`, `${sign.length} Runden prüfen & signieren`),
      line: [...new Set(sign.map((r) => r.courseName))].slice(0, 2).join(', '),
      go: () => pick('rounds'),
    });
  const confirm = loadGames().filter((g) => g.finishedAt && !g.signedAt).length;
  if (confirm)
    out.push({
      key: 'confirm',
      title: confirm === 1 ? tr('1 result to confirm', '1 Ergebnis bestätigen') : tr(`${confirm} results to confirm`, `${confirm} Ergebnisse bestätigen`),
      line: 'Games',
      go: () => pick('games'),
    });
  return out;
}

export function NotifyBell() {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<RoundInvite[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    const look = async () => {
      if (gone || document.visibilityState !== 'visible' || !canLink()) return;
      const joined = [...loadRounds().map((r) => r.shared?.code), ...loadGames().map((g) => g.shared?.code)].filter((c): c is string => !!c);
      const found = await roundInvites(joined, true);
      if (!gone) setInvites(found);
    };
    const redraw = () => setTick((n) => n + 1);
    const first = window.setTimeout(() => void look(), 3000);
    const t = window.setInterval(() => void look(), 60000);
    document.addEventListener('visibilitychange', look);
    window.addEventListener('golfos:synced', look);
    window.addEventListener('golfos:pools-changed', redraw);
    return () => {
      gone = true;
      window.clearTimeout(first);
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('golfos:synced', look);
      window.removeEventListener('golfos:pools-changed', redraw);
    };
  }, []);
  const items = [...invites.map(inviteItem), ...localItems()];
  const n = items.length;
  return (
    <>
      <button
        type="button"
        className="lang-btn bell-btn"
        aria-label={n ? tr(`Notifications – ${n} waiting`, `Mitteilungen – ${n} offen`) : tr('Notifications', 'Mitteilungen')}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: 'auto' }}>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </svg>
        {n > 0 && (
          <span className="bell-count" aria-hidden="true">
            {n > 9 ? '9+' : n}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setOpen(false)}>
            <section className="sheet bell-sheet" role="dialog" aria-label={tr('Notifications', 'Mitteilungen')} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>{tr('Notifications', 'Mitteilungen')}</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              {n ? (
                <div className="settings-list">
                  {items.map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      className="settings-row bell-row"
                      onClick={() => {
                        setOpen(false);
                        it.go();
                      }}
                    >
                      <span className="grow">
                        <strong>{it.title}</strong>
                        {it.line && <span className="muted small">{it.line}</span>}
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="muted">{tr('Nothing waiting for you.', 'Nichts Neues für dich.')}</span>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
