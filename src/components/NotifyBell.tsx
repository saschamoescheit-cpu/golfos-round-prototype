import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { canLink, pendingAsk } from '../lib/friendlinks';
import { amHost, cachedEvent, confirmReopen, eventOwner, reopenAsked, roundInvites, type RoundInvite } from '../lib/sharedround';
import { isTourHost, loadTours } from '../lib/tourstore';
import { loadRounds } from '../lib/storage';
import { loadGames } from '../lib/gamestore';
import { openChallenges } from '../lib/wagerstore';
import { prizeOf, prizeSym } from '../lib/prize';
import { goPool } from '../lib/nav';
import { roundsToSign } from '../screens/Rounds';

// The inbox (Sascha 13.11.2026: "neben der Sprache und dem Tag-/Nachtmodus noch eine Glocke für Notifications, wie
// Anfragen" – and then: "solche Meldungen und Freundesanfragen nicht unter solchen Masken, sondern alles in die Inbox"):
// the bell beside the language and the sun mode, a green number while something waits. In it what others ask of you –
// a card to be opened for a correction (confirmed right here), a friend's request, an invitation to a round, a game or
// bets (also one put aside), a 5+5+10 challenge – and what waits for you: rounds to check & sign, results to confirm.

interface InboxItem {
  key: string;
  title: string;
  line: string;
  /** a tap on the row: where it is answered */
  go?: () => void;
  /** answered right in the inbox (the correction asked of the host) */
  action?: { label: string; run: () => Promise<boolean> };
  /** asked of you by someone – else something to do (Sascha 13.11.2026: "in zwei Gruppen für die Übersichtlichkeit") */
  ask?: boolean;
}

interface ReopenAsk {
  code: string;
  fid: string;
  pid: string;
  tournament: boolean;
  by: string;
  player: string;
  where: string;
}

const pick = (m: 'rounds' | 'games') => window.dispatchEvent(new CustomEvent('golfos:pick-module', { detail: m }));

function inviteItem(inv: RoundInvite): InboxItem {
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
    ask: true,
  };
}

/** The cards asked to be opened again whose host this account is – tournaments and shared rounds this phone knows. */
async function reopenAsks(): Promise<ReopenAsk[]> {
  const tours = loadTours();
  const codes = new Map<string, { tournament: boolean; where: string; host: boolean }>();
  for (const t of tours) codes.set(t.code, { tournament: true, where: t.ev.name, host: isTourHost(t) });
  for (const r of loadRounds()) if (r.shared?.code && !codes.has(r.shared.code)) codes.set(r.shared.code, { tournament: !!r.shared.tournament, where: r.courseName, host: false });
  const out: ReopenAsk[] = [];
  for (const [code, c] of codes) {
    const ev = cachedEvent(code);
    const asks = Object.entries(ev?.flights ?? {}).flatMap(([fid, f]) => f.players.filter((p) => reopenAsked(f, p.id)).map((p) => ({ fid, pid: p.id, by: f.reopen![p.id].by, player: p.name })));
    if (!asks.length) continue;
    // the host asked on the server when this phone does not know it (a tournament kept without its owner)
    if (!c.host && !amHost(await eventOwner(code))) continue;
    for (const a of asks) out.push({ code, tournament: c.tournament, where: c.where, ...a });
  }
  return out;
}

function localItems(): InboxItem[] {
  const out: InboxItem[] = [];
  // a friend's request waiting: its sheet with "Annehmen" / "Ablehnen"
  if (pendingAsk()) out.push({ key: 'friend', title: tr('Friend request', 'Freundschaftsanfrage'), line: tr('Accept or decline', 'Annehmen oder ablehnen'), go: () => window.dispatchEvent(new Event('golfos:friend-ask')), ask: true });
  for (const { e, w } of openChallenges()) {
    const by = e.pool.players.find((p) => p.id === w.player)?.name ?? '?';
    out.push({ key: `duel:${w.id}`, title: tr(`${by} challenges you to 5+5+10`, `${by} fordert dich zu 5+5+10 heraus`), line: `${e.pool.name} · ${prizeSym(prizeOf(e.pool))}`, go: () => goPool(e.code), ask: true });
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
  const [asks, setAsks] = useState<ReopenAsk[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    const look = async () => {
      if (gone || document.visibilityState !== 'visible') return;
      void reopenAsks().then((a) => !gone && setAsks(a));
      if (!canLink()) return;
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
    window.addEventListener('golfos:friend-ask', redraw);
    return () => {
      gone = true;
      window.clearTimeout(first);
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', look);
      window.removeEventListener('golfos:synced', look);
      window.removeEventListener('golfos:pools-changed', redraw);
      window.removeEventListener('golfos:friend-ask', redraw);
    };
  }, []);
  const askItems: InboxItem[] = asks.map((a) => ({
    key: `reopen:${a.code}:${a.pid}`,
    title: tr(`${a.by} asks to correct ${a.player}'s card`, `${a.by} möchte die Karte von ${a.player} korrigieren`),
    line: tr(`${a.where} – its signatures go back, it is corrected and signed anew`, `${a.where} – die Unterschriften gehen zurück, dann wird korrigiert und neu unterschrieben`),
    ask: true,
    action: {
      label: tr('Confirm', 'Bestätigen'),
      run: async () => {
        const ev = await confirmReopen(a.code, a.fid, a.tournament, a.pid);
        if (ev) setAsks((x) => x.filter((y) => !(y.code === a.code && y.pid === a.pid)));
        return !!ev;
      },
    },
  }));
  const items = [...askItems, ...localItems(), ...invites.map(inviteItem)];
  const n = items.length;
  return (
    <>
      <button type="button" className="lang-btn bell-btn" aria-label={n ? tr(`Inbox – ${n} waiting`, `Inbox – ${n} offen`) : 'Inbox'} onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: 'auto' }}>
          {/* an inbox tray, not a bell (Sascha 13.11.2026: "nicht als Glocke, sondern als Inbox darstellen") */}
          <path d="M3.5 13.5 6 5.5h12l2.5 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
          <path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5" />
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
            <section className="sheet bell-sheet" role="dialog" aria-label="Inbox" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>Inbox</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              {n ? (
                [
                  { name: tr('Asked of you', 'Anfragen an dich'), list: items.filter((x) => x.ask) },
                  { name: tr('To do', 'Zu erledigen'), list: items.filter((x) => !x.ask) },
                ]
                  .filter((g) => g.list.length)
                  .map((g) => (
                <div key={g.name} className="bell-group">
                <span className="eyebrow">{g.name}</span>
                <div className="settings-list">
                  {g.list.map((it) =>
                    it.action ? (
                      <div key={it.key} className="settings-row bell-row bell-ask">
                        <span className="grow">
                          <strong>{it.title}</strong>
                          {it.line && <span className="muted small">{it.line}</span>}
                        </span>
                        <button
                          type="button"
                          className="btn-primary bell-act"
                          disabled={busy === it.key}
                          onClick={async () => {
                            setBusy(it.key);
                            const done = await it.action!.run();
                            setBusy(null);
                            setMsg(done ? null : tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.'));
                          }}
                        >
                          {it.action.label}
                        </button>
                      </div>
                    ) : (
                      <button
                        key={it.key}
                        type="button"
                        className="settings-row bell-row"
                        onClick={() => {
                          setOpen(false);
                          it.go?.();
                        }}
                      >
                        <span className="grow">
                          <strong>{it.title}</strong>
                          {it.line && <span className="muted small">{it.line}</span>}
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ),
                  )}
                </div>
                </div>
                  ))
              ) : (
                <span className="muted">{tr('Nothing waiting for you.', 'Nichts Neues für dich.')}</span>
              )}
              {msg && (
                <span className="small good-text" role="status">
                  {msg}
                </span>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
