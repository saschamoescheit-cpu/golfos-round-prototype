import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { canLink, pendingAsk } from '../lib/friendlinks';
import { amHost, cachedEvent, confirmReopen, eventOwner, reopenAsked, roundInvites, type RoundInvite } from '../lib/sharedround';
import { answerJoins, inboxInvites, inboxJoins, setInboxInvites } from '../lib/inboxstore';
import { isTourHost, loadTours } from '../lib/tourstore';
import { loadRounds } from '../lib/storage';
import { loadGames } from '../lib/gamestore';
import { changePool, loadPools, openChallenges } from '../lib/wagerstore';
import { wagerLabel } from '../lib/wagers';
import { money } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';
import { goPool, goRound } from '../lib/nav';
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
  /** answered right in the inbox (the correction asked of the host, a request to join) */
  action?: { label: string; aria?: string; run: () => Promise<boolean> };
  /** the "no" beside it (a request to join: "Ablehnen") */
  decline?: { label: string; aria?: string; run: () => Promise<boolean> };
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

/** The cards asked to be opened again whose host this account is – tournaments and shared rounds this phone knows.
 *  `ask`: false – only what this phone knows (the number on the inbox), no server; true – the host asked on the server. */
async function reopenAsks(ask = true): Promise<ReopenAsk[]> {
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
    if (!c.host && (!ask || !amHost(await eventOwner(code)))) continue;
    for (const a of asks) out.push({ code, tournament: c.tournament, where: c.where, ...a });
  }
  return out;
}

// the bets against this account already known – a new one comes into the inbox once (Sascha 13.11.2026, Inbox-Mockups:
// "neue Wette gegen dich" – before only a push); the first time all there are counted as known, not a flood of old ones
const BETS_SEEN = 'golfos.inbox.betsseen.v1';
function betsSeen(now: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(BETS_SEEN);
    if (raw == null) {
      localStorage.setItem(BETS_SEEN, JSON.stringify(now));
      return new Set(now);
    }
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set(now);
  }
}
function betSeen(id: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(BETS_SEEN) ?? '[]') as string[];
    localStorage.setItem(BETS_SEEN, JSON.stringify([...all.filter((x) => x !== id), id].slice(-300)));
  } catch {
    /* storage full */
  }
}

function localItems(markReceived: (code: string, id: string) => Promise<boolean>): InboxItem[] {
  const out: InboxItem[] = [];
  const pools = loadPools().filter((e) => e.me && !e.pool.deletedAt);
  // a new bet against you (a 5+5+10 challenge has its own row below)
  const against = pools.flatMap((e) => e.pool.wagers.filter((w) => w.opponent === e.me && w.player !== e.me && !w.challenge).map((w) => ({ e, w })));
  const seen = betsSeen(against.map(({ w }) => w.id));
  for (const { e, w } of against) {
    if (seen.has(w.id)) continue;
    const by = e.pool.players.find((p) => p.id === w.player)?.name ?? '?';
    out.push({
      key: `bet:${w.id}`,
      title: tr(`${by} made a bet against you`, `${by} hat eine Wette gegen dich angelegt`),
      line: `${e.pool.name} · ${wagerLabel(w)}`,
      go: () => {
        betSeen(w.id);
        goPool(e.code);
      },
      ask: true,
    });
  }
  // a payment to you marked paid – its receipt confirmed right here (Inbox-Mockups: "Zahlung bestätigen")
  for (const e of pools)
    for (const pm of e.pool.payments ?? []) {
      if (pm.to !== e.me || !pm.paidAt || pm.receivedAt) continue;
      const by = e.pool.players.find((p) => p.id === pm.from)?.name ?? '?';
      const sum = money(pm.amount, prizeSym(prizeOf(e.pool)));
      out.push({
        key: `paid:${e.code}:${pm.id}`,
        title: tr(`${by} paid you ${sum}`, `${by} hat dir ${sum} bezahlt`),
        line: tr(`${e.pool.name} · confirm the receipt`, `${e.pool.name} · Erhalt bestätigen`),
        ask: true,
        action: { label: tr('Received', 'Erhalten'), aria: tr(`Received ${sum} from ${by}`, `${sum} von ${by} erhalten`), run: () => markReceived(e.code, pm.id) },
      });
    }
  // a friend's request waiting: its sheet with "Annehmen" / "Ablehnen"
  if (pendingAsk()) out.push({ key: 'friend', title: tr('Friend request', 'Freundschaftsanfrage'), line: tr('Accept or decline', 'Annehmen oder ablehnen'), go: () => window.dispatchEvent(new Event('golfos:friend-ask')), ask: true });
  for (const { e, w } of openChallenges()) {
    const by = e.pool.players.find((p) => p.id === w.player)?.name ?? '?';
    out.push({ key: `duel:${w.id}`, title: tr(`${by} challenges you to 5+5+10`, `${by} fordert dich zu 5+5+10 heraus`), line: `${e.pool.name} · ${prizeSym(prizeOf(e.pool))}`, go: () => goPool(e.code), ask: true });
  }
  // the marker or the scorer signed this phone's card – its own signature waits (Sascha 13.11.2026, Inbox-Mockups: "Bitte
  // Scorekarte unterschreiben" – before only a push)
  for (const r of loadRounds()) {
    const s = r.shared;
    const me = r.players.find((p) => p.isMe)?.id;
    const f = s && me ? cachedEvent(s.code)?.flights[s.flight] : undefined;
    const signed = me ? f?.signed?.[me] : undefined;
    if (!f || !me || !signed?.marker || signed.player) continue;
    const by = f.players.find((p) => p.id === (f.scorer ?? f.markers?.[me]))?.name;
    out.push({
      key: `signask:${s!.code}`,
      title: tr('Please sign your scorecard', 'Bitte deine Scorekarte unterschreiben'),
      line: [by ? (f.scorer ? tr(`${by} signed as the scorer`, `${by} hat als Schreiber unterschrieben`) : tr(`${by} signed as your marker`, `${by} hat als Zähler unterschrieben`)) : '', r.courseName].filter(Boolean).join(' · '),
      go: () => goRound(r.id),
      ask: true,
    });
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
  // the invitations and the requests to join from the store – looked up in the background (RoundInviteHost, JoinRequests)
  const [invites, setInvites] = useState<RoundInvite[]>(inboxInvites);
  const [joins, setJoins] = useState(inboxJoins);
  useEffect(() => {
    const on = () => {
      setInvites(inboxInvites());
      setJoins(inboxJoins());
    };
    window.addEventListener('golfos:inbox', on);
    return () => window.removeEventListener('golfos:inbox', on);
  }, []);
  const [asks, setAsks] = useState<ReopenAsk[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // the number from what this phone knows – the server asked only when the inbox is opened (its lookups in the
  // background disturbed the screens below, 13.11.2026)
  useEffect(() => {
    let gone = false;
    const local = () => void reopenAsks(false).then((a) => !gone && setAsks((now) => (now.length > a.length ? now : a)));
    const redraw = () => {
      setTick((n) => n + 1);
      local();
    };
    local();
    const t = window.setInterval(redraw, 30000);
    window.addEventListener('golfos:pools-changed', redraw);
    window.addEventListener('golfos:friend-ask', redraw);
    return () => {
      gone = true;
      window.clearInterval(t);
      window.removeEventListener('golfos:pools-changed', redraw);
      window.removeEventListener('golfos:friend-ask', redraw);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let gone = false;
    void reopenAsks().then((a) => !gone && setAsks(a));
    if (canLink()) {
      const joined = [...loadRounds().map((r) => r.shared?.code), ...loadGames().map((g) => g.shared?.code)].filter((c): c is string => !!c);
      void roundInvites(joined, true).then((found) => !gone && setInboxInvites(found));
    }
    return () => {
      gone = true;
    };
  }, [open]);
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
  // someone asks to join a round this phone hosts (its notice stays on every screen – here too, Sascha 13.11.2026)
  const joinItems: InboxItem[] = joins.map((a) => ({
    key: `join:${a.code}:${a.id}`,
    title: tr(`${a.name} wants to join your round`, `${a.name} möchte deiner Runde beitreten`),
    line: a.hcp ? `HCP ${a.hcp}` : '',
    ask: true,
    action: { label: tr('Let in', 'Zulassen'), aria: tr(`Let ${a.name} in`, `${a.name} zulassen`), run: () => answerJoins([a], true) },
    decline: { label: tr('Decline', 'Ablehnen'), aria: tr(`Decline ${a.name}`, `${a.name} ablehnen`), run: () => answerJoins([a], false) },
  }));
  const markReceived = async (code: string, id: string): Promise<boolean> => {
    const r = await changePool(code, (p) => ({ ...p, payments: (p.payments ?? []).map((x) => (x.id === id ? { ...x, receivedAt: new Date().toISOString() } : x)) }));
    setTick((n) => n + 1);
    return !!r;
  };
  const items = [...joinItems, ...askItems, ...localItems(markReceived), ...invites.map(inviteItem)];
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
                      <div key={it.key} className="settings-row bell-row bell-ask" role="group" aria-label={it.title}>
                        <span className="grow">
                          <strong>{it.title}</strong>
                          {it.line && <span className="muted small">{it.line}</span>}
                        </span>
                        {it.decline && (
                          <button
                            type="button"
                            className="btn-secondary bell-act"
                            aria-label={it.decline.aria}
                            disabled={busy === it.key}
                            onClick={async () => {
                              setBusy(it.key);
                              const done = await it.decline!.run();
                              setBusy(null);
                              setMsg(done ? null : tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.'));
                            }}
                          >
                            {it.decline.label}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-primary bell-act"
                          aria-label={it.action.aria}
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
