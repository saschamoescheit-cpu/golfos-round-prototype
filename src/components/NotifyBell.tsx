import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../lib/i18n';
import { canLink, pendingAsk } from '../lib/friendlinks';
import { amHost, cachedEvent, confirmReopen, eventOwner, liveFlights, reopenAsked, roundInvites, type RoundInvite } from '../lib/sharedround';
import { tourPrizeResult } from './TourPrizeBoard';
import { seriesPrizeResult, settledInSeries } from './SeriesPrizeBoard';
import { seriesOver, seriesStandings } from '../lib/seriesstandings';
import { keyName, wonBy } from '../lib/tourprizes';
import { prizeAmount } from '../lib/prize';
import { answerJoins, dismissInbox, inboxDismissed, inboxInvites, inboxJoins, inboxRead, joinedCodes, markInboxRead, setInboxInvites } from '../lib/inboxstore';
import { SwipeRow } from './SwipeRow';
import { isTourHost, loadSeries, loadTours } from '../lib/tourstore';
import { loadRounds } from '../lib/storage';
import type { SharedCell } from '../types';
import { loadGames, saveGame } from '../lib/gamestore';
import { exchange } from '../lib/sharedgame';
import { gamePrize, meIn } from '../lib/gamepay';
import { changePool, loadPools, openChallenges } from '../lib/wagerstore';
import { wagerLabel } from '../lib/wagers';
import { money } from '../lib/gameforms';
import { prizeOf, prizeSym } from '../lib/prize';
import { goPool, goRound, goTour } from '../lib/nav';
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
  action?: { label: string; aria?: string; run: () => Promise<boolean>; /** the inbox closes (it goes to a screen) */ closes?: boolean };
  /** the "no" beside it (a request to join: "Ablehnen") */
  decline?: { label: string; aria?: string; run: () => Promise<boolean> };
  /** asked of you by someone – else something to do (Sascha 13.11.2026: "in zwei Gruppen für die Übersichtlichkeit") */
  ask?: boolean;
  /** swiped away: what it does instead of hiding the row (a request to join: declined) */
  remove?: () => Promise<boolean>;
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
  const join = () => window.dispatchEvent(new CustomEvent(inv.kind === 'round' ? 'golfos:join-round' : 'golfos:join-game', { detail: inv.code }));
  // answered right here (Sascha 14.11.2026: "Einladungen zu Turnieren und Wetten auch vom Gegenüber angenommen") –
  // "Annehmen" goes on to joining, "Ablehnen" takes it out of the inbox
  return {
    key: `inv:${inv.code}`,
    title,
    line: inv.course,
    go: join,
    ask: true,
    action: { label: tr('Accept', 'Annehmen'), aria: tr(`Accept: ${title}`, `Annehmen: ${title}`), closes: true, run: async () => (join(), true) },
    decline: { label: tr('Decline', 'Ablehnen'), aria: tr(`Decline: ${title}`, `Ablehnen: ${title}`), run: async () => (dismissInbox(`inv:${inv.code}`), true) },
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

/** A game's payment confirmed from the inbox: on this phone and to the game's other phones. */
async function markGameReceived(gameId: string, id: string): Promise<boolean> {
  const g = loadGames().find((x) => x.id === gameId);
  if (!g) return false;
  const next = { ...g, payments: (g.payments ?? []).map((x) => (x.id === id ? { ...x, receivedAt: new Date().toISOString() } : x)) };
  saveGame(next);
  window.dispatchEvent(new Event('golfos:games-changed'));
  if (next.shared) {
    const m = await exchange(next);
    if (m) saveGame(m);
  }
  return true;
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
  // a game's payment to you marked paid on the other phone – the same (Sascha 16.11.2026: "Wenn jemand bezahlt klickt, muss
  // der andere eine Inbox-Nachricht bekommen, um den Erhalt zu bestätigen. Erst dann darf in der Bilanz abgebucht werden")
  for (const g of loadGames().filter((x) => x.finishedAt && x.shared)) {
    const me = meIn(g).id;
    for (const pm of g.payments ?? []) {
      if (pm.to !== me || !pm.paidAt || pm.receivedAt || pm.undoneAt) continue;
      const by = g.players.find((p) => p.id === pm.from)?.name ?? '?';
      const sum = money(pm.amount, prizeSym(gamePrize(g)));
      out.push({
        key: `gpaid:${g.id}:${pm.id}`,
        title: tr(`${by} paid you ${sum}`, `${by} hat dir ${sum} bezahlt`),
        line: tr(`${g.courseName} · confirm the receipt`, `${g.courseName} · Erhalt bestätigen`),
        ask: true,
        action: { label: tr('Received', 'Erhalten'), aria: tr(`Received ${sum} from ${by}`, `${sum} von ${by} erhalten`), run: () => markGameReceived(g.id, pm.id) },
      });
    }
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
  // a tournament's prizes, once every card is in (Sascha 14.11.2026, mock-up 7): "Du hast 50 $ gewonnen" – and what this
  // phone's player still pays
  const tours = loadTours();
  const series = loadSeries().filter((x) => !x.series.deletedAt);
  for (const t of tours) {
    if (!t.ev.prizes || t.ev.deletedAt) continue;
    // a tournament of a series: paid once at the series' end (Sascha 15.11.2026) – its own line there
    const sr = t.ev.series ? series.find((x) => x.code === t.ev.series!.code) : undefined;
    const inSeries = !!sr && settledInSeries(sr.series, sr.series.rounds.map((r) => tours.find((x) => x.code === r.code)?.ev.prizes), t.ev.prizes);
    const live = cachedEvent(t.code);
    if (!live || !liveFlights(live).length) continue;
    const res = tourPrizeResult({ ...live, prizes: t.ev.prizes });
    if (!res?.done) continue;
    const mine = loadRounds().find((r) => r.shared?.code === t.code)?.players.find((p) => p.isMe)?.name;
    if (!res || !mine) continue;
    const amt = (v: number) => prizeAmount(v, res.tp.prize);
    const w = wonBy(res.awards).get(keyName(mine));
    if (w && w.amount > 0) {
      const labels = res.awards.filter((a) => a.winners.some((x) => keyName(x.name) === keyName(mine))).map((a) => a.label);
      out.push({ key: `prizewon:${t.code}:${w.amount}`, title: tr(`You won ${amt(w.amount)}`, `Du hast ${amt(w.amount)} gewonnen`), line: `${t.ev.name} · ${labels.join(', ')}`, go: () => goTour(t.code), ask: true });
    }
    for (const x of inSeries ? [] : res.settle.transfers) {
      if (keyName(x.from) !== keyName(mine) || res.tp.paid?.[x.key]) continue;
      out.push({ key: `prizepay:${t.code}:${x.key}:${x.amount}`, title: tr(`Pay ${amt(x.amount)} to ${x.to}`, `${amt(x.amount)} an ${x.to} zahlen`), line: tr(`${t.ev.name} · prizes and entry fee`, `${t.ev.name} · Preise und Startgeld`), go: () => goTour(t.code) });
    }
  }
  // a card left empty in a tournament played (Sascha 16.11.2026, Moritz on the Oaks 12.11.: he played, not one score on his
  // card – the bets count him, nobody had noticed): the host is told, to enter the scores ("Scores eintragen")
  for (const t of tours) {
    if (t.ev.deletedAt || !isTourHost(t)) continue;
    const live = cachedEvent(t.code);
    if (!live) continue;
    const filled = (c?: (SharedCell | null)[] | null) => (c ?? []).some((x) => !!x && (x.s != null || !!x.p));
    for (const f of liveFlights(live)) {
      if (!f.finishedAt) continue;
      for (const pl of f.players)
        if (!filled(f.scores?.[pl.id]) && !filled(f.marks?.[pl.id]))
          out.push({ key: `emptycard:${t.code}:${f.id}:${pl.id}`, title: tr(`${pl.name}'s card is empty`, `Karte von ${pl.name} ist leer`), line: tr(`${live.name} · enter the scores`, `${live.name} · Scores nachtragen`), go: () => goTour(t.code) });
    }
  }
  // a series' one settlement once its last round is in (Sascha 15.11.2026): what it won – and what this phone's player pays
  for (const sr of series) {
    const evs = sr.series.rounds.map((r) => {
      const live = cachedEvent(r.code);
      return live ? { ...live, prizes: tours.find((x) => x.code === r.code)?.ev.prizes } : null;
    });
    const codes = new Set(sr.series.rounds.map((r) => r.code));
    const mine = loadRounds().find((r) => !!r.shared && codes.has(r.shared.code))?.players.find((p) => p.isMe)?.name;
    // the series is over – its final standing for everyone who played in it (Sascha 17.11.2026: "Nach heute ist die
    // offizielle Turnierserie beendet. Es gab aber keine Meldung in der Inbox"); swiped away, it stays away
    if (mine && seriesOver(evs)) {
      const st = seriesStandings(evs.filter((e): e is NonNullable<typeof e> => !!e), { field: evs });
      const me = st.rows.find((r) => keyName(r.name) === keyName(mine));
      const ranked = st.rows.filter((r) => !r.guest).length;
      const sum = me ? (st.higherBetter ? tr(`${me.sum} pts`, `${me.sum} P.`) : me.sum === 0 ? 'Par' : me.sum > 0 ? `+${me.sum}` : `−${-me.sum}`) : '';
      const line = !me ? sr.series.name : me.guest ? tr(`Final standing · you played as a guest (${sum})`, `Endstand · du warst Gast (${sum})`) : tr(`Final standing: ${me.pos.replace(/^T/, '')}. of ${ranked} · ${sum}`, `Endstand: Platz ${me.pos.replace(/^T/, '')} von ${ranked} · ${sum}`);
      out.push({ key: `seriesend:${sr.code}`, title: tr(`${sr.series.name} is finished`, `${sr.series.name} ist beendet`), line, go: () => goTour(sr.code) });
    }
    const res = seriesPrizeResult(sr.series, evs);
    if (!res.any || !res.done || !res.ref) continue;
    if (!mine) continue;
    const amt = (v: number) => prizeAmount(v, res.ref!);
    const w = wonBy(res.own).get(keyName(mine));
    if (w && w.amount > 0) {
      const labels = res.own.filter((a) => a.winners.some((x) => keyName(x.name) === keyName(mine))).map((a) => a.label);
      out.push({ key: `serieswon:${sr.code}:${w.amount}`, title: tr(`You won ${amt(w.amount)}`, `Du hast ${amt(w.amount)} gewonnen`), line: `${sr.series.name} · ${labels.join(', ')}`, go: () => goTour(sr.code), ask: true });
    }
    for (const x of res.transfers) {
      if (keyName(x.from) !== keyName(mine) || sr.series.paid?.[x.key]) continue;
      out.push({ key: `seriespay:${sr.code}:${x.key}:${x.amount}`, title: tr(`Pay ${amt(x.amount)} to ${x.to}`, `${amt(x.amount)} an ${x.to} zahlen`), line: tr(`${sr.series.name} · prizes and entry fees`, `${sr.series.name} · Preise und Startgelder`), go: () => goTour(sr.code) });
    }
  }
  const sign = roundsToSign(loadRounds());
  if (sign.length)
    out.push({
      key: `sign:${sign.map((r) => r.id).join(',')}`,
      title: sign.length === 1 ? tr('1 round to check & sign', '1 Runde prüfen & signieren') : tr(`${sign.length} rounds to check & sign`, `${sign.length} Runden prüfen & signieren`),
      line: [...new Set(sign.map((r) => r.courseName))].slice(0, 2).join(', '),
      go: () => pick('rounds'),
    });
  const toConfirm = loadGames().filter((g) => g.finishedAt && !g.signedAt);
  const confirm = toConfirm.length;
  if (confirm)
    out.push({
      key: `confirm:${toConfirm.map((g) => g.id).join(',')}`,
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
    // a series' rounds fetched (refreshSeriesEnds): "… ist beendet" at once (17.11.2026)
    window.addEventListener('golfos:tours-changed', redraw);
    return () => {
      gone = true;
      window.clearInterval(t);
      window.removeEventListener('golfos:pools-changed', redraw);
      window.removeEventListener('golfos:friend-ask', redraw);
      window.removeEventListener('golfos:tours-changed', redraw);
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
    remove: () => answerJoins([a], false),
  }));
  const markReceived = async (code: string, id: string): Promise<boolean> => {
    const r = await changePool(code, (p) => ({ ...p, payments: (p.payments ?? []).map((x) => (x.id === id ? { ...x, receivedAt: new Date().toISOString() } : x)) }));
    setTick((n) => n + 1);
    return !!r;
  };
  // an invitation already joined goes at once (not only with the next look); what was swiped away stays away
  const joined = new Set(joinedCodes());
  const gone = inboxDismissed();
  const items = [...joinItems, ...askItems, ...localItems(markReceived), ...invites.filter((x) => !joined.has(x.code)).map(inviteItem)].filter((x) => !gone.has(x.key));
  const swipe = async (it: InboxItem): Promise<boolean> => {
    if (it.remove) {
      const done = await it.remove();
      if (!done) setMsg(tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.'));
      return done;
    }
    dismissInbox(it.key);
    setTick((x) => x + 1);
    return true;
  };
  // read and unread (Sascha 14.11.2026, mock-up A + E): the number counts the unread; what the open inbox showed is read
  // once it closes – except what was turned by a swipe right while it was open
  const read = inboxRead();
  const n = items.filter((x) => !read.has(x.key)).length;
  const shown = useRef<string[]>([]);
  const turned = useRef(new Set<string>());
  if (open) shown.current = items.map((x) => x.key);
  useEffect(() => {
    if (open || !shown.current.length) return;
    markInboxRead(shown.current.filter((k) => !turned.current.has(k)));
    shown.current = [];
    turned.current = new Set();
    setTick((x) => x + 1);
  }, [open]);
  const turn = (key: string) => {
    turned.current.add(key);
    markInboxRead([key], !read.has(key));
    setTick((x) => x + 1);
  };
  const READ_ICON = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
  const UNREAD_ICON = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
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
              {items.length ? (
                [
                  { name: tr('Asked of you', 'Anfragen an dich'), list: items.filter((x) => x.ask) },
                  { name: tr('To do', 'Zu erledigen'), list: items.filter((x) => !x.ask) },
                ]
                  .filter((g) => g.list.length)
                  .map((g) => (
                <div key={g.name} className="bell-group">
                <span className="eyebrow">{g.name}</span>
                <div className="settings-list">
                  {g.list.map((it) => (
                    <SwipeRow
                      key={it.key}
                      label={it.title}
                      className="bell-swipe"
                      onDelete={() => swipe(it)}
                      right={read.has(it.key) ? { word: tr('Unread', 'Ungelesen'), icon: UNREAD_ICON, run: () => turn(it.key) } : { word: tr('Read', 'Gelesen'), icon: READ_ICON, run: () => turn(it.key) }}
                    >
                    {it.action ? (
                      <div className={`settings-row bell-row bell-ask ${read.has(it.key) ? 'read' : 'unread'}`} role="group" aria-label={it.title}>
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
                            if (done && it.action!.closes) setOpen(false);
                            setMsg(done ? null : tr('That did not work – check the connection and try again.', 'Das hat nicht geklappt – Verbindung prüfen und nochmal.'));
                          }}
                        >
                          {it.action.label}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`settings-row bell-row ${read.has(it.key) ? 'read' : 'unread'}`}
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
                    )}
                    </SwipeRow>
                  ))}
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
