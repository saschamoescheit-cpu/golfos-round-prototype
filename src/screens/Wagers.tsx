import { useEffect, useMemo, useState } from 'react';
import { goTour } from '../lib/nav';
import { useTop } from '../components/useTop';
import { tr } from '../lib/i18n';
import { loadCachedCourse, newId } from '../lib/storage';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import type { Course } from '../types';
import { loadProfile, shownName } from '../lib/profile';
import { joinGame, joinLink } from '../lib/sharedgame';
import { loadSession } from '../lib/sync';
import { money } from '../lib/gameforms';
import { isMoney, isNone, prizeOf, prizeStakes, prizeSym, whoOf, type Prize } from '../lib/prize';
import { PrizeRow } from '../components/PrizeRow';
import { Chips, Segmented, Stepper, TopBar } from '../components/ui';
import { FriendChips } from './Home';
import { PlayerRow } from './RoundSetup';
import { copyLink, FriendInvite, InviteCard, shareLink } from '../components/InviteCard';
import { ActionBar } from '../components/ActionBar';
import { duelWaits, flipDuel, type BetRound, owings, settleDebts, roundChoices, progressOf, type Owed, type Debt, editedPlayer, isPool, restake, perRoundBet, lower, tally, withDuels, openPoolTransfers, KINDS, LIBRARY, LIBRARY_GROUPS, METRICS, WHERES, balances, ledger, poolCounted, type Payment, type LedgerLine, dayOf, inPool, metricOf, provisional, reached, type Metric, type Where, earlierGroups, fromEarlier, fromLibrary, progressText, roundLabel, shapeOf, stateOf, wagerLabel, wagerRules, type Payout, type PoolPlayer, type PoolRound, type Progress, type RoundResult, type Wager, type WagerKind, type WagerPool, type WagerState } from '../lib/wagers';
import { poolRoundOf } from '../lib/poolround';
import { tourState } from '../lib/tourstore';
import { Challenges, DuelMark } from './Duels';
import { uninvitePlayer, forgetMyBet, keepMyBet, loadMyBets, type MyBet, canLinkInto, changePool, createPool, earlierBets, forgetPool, invitePlayer, isHost, isLive, joinPool, linkPlayer, loadPools, myAccount, refreshPool, rememberBets, reportWagers, restorePool, syncPools, type PoolEntry } from '../lib/wagerstore';
import { loadFriends } from '../lib/friends';
import { canLink } from '../lib/friendlinks';
import { inviteFriend } from '../lib/push';
import { Avatar } from '../components/Avatar';
import { Bin } from '../components/Bin';
import { ChoiceRow, DateRow, PickSheet, SettingsList, SettingsRow, SheetRow, StepPick, ToggleList, ToggleRow, dayText } from '../components/Settings';
import { StakeRow } from '../components/StakePicker';
import { SwipeRow } from '../components/SwipeRow';
import { PaidMarks } from '../components/PaidMarks';
import { SignedIcon } from '../components/SignedIcon';
import { DeletedIcon, PlayedIcon } from '../components/RoundIcons';
import { pushBet, pushWagers } from '../lib/push';
import { loadSeries, loadTours } from '../lib/tourstore';
import { CoursePicker } from './CoursePicker';
import { LiveShare } from '../components/LiveShare';

// Bets in Games (Sascha 01.11.2026: "in America we have bets running – it must be possible to set up individual bets in
// Games, everything selectable and adjustable, invite people to the bets, and the flight counts each other as in a real
// tournament"). A pool over a period, its players and their bets; the standing comes from the rounds played in Rounds.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');
const ONLY_HOST = () => tr('Only whoever set up the pool changes its bets – you see them, and your phone reports yours.', 'Nur wer den Pool angelegt hat, ändert die Wetten – du siehst sie, und dein Handy meldet deine.');
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** The pool a tapped push asks for (App puts it here) – once. */
export function takeOpenPool(keep = false): string | null {
  try {
    const code = sessionStorage.getItem('golfos.openPool');
    if (code && !keep) sessionStorage.removeItem('golfos.openPool');
    return code;
  } catch {
    return null;
  }
}

/** The pools on this phone, kept fresh when another screen changes them. */
export function usePools(): PoolEntry[] {
  const [list, setList] = useState(loadPools);
  useEffect(() => {
    const on = () => setList(loadPools());
    window.addEventListener('golfos:pools-changed', on);
    return () => window.removeEventListener('golfos:pools-changed', on);
  }, []);
  return list;
}

/** The menu's icon of the bets: a ticket. */
export const BETS_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 7.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2.2a2.3 2.3 0 0 0 0 4.6v2.2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2.2a2.3 2.3 0 0 0 0-4.6z" />
    <path d="M15 6.5v11" strokeDasharray="1.6 2" />
  </svg>
);

const live = isLive;

/** On the start page of Games (Sascha 01.11.2026: "from the start page both 'start a game' and 'start a bet'"): only the
 *  start – following, changing and deleting the bets is in the menu "Bets" (its dot shows bets running). */
export function StartBetCard(props: { canShare: boolean; onNew: () => void; onJoin: () => void }) {
  useEffect(() => {
    void syncPools(); // a phone emptied or new: the pools come back from the server
  }, []);
  return (
    <section className="card play-card" aria-label={tr('Start a bet', 'Wette starten')}>
      <strong className="play-course">{tr('Start a new bet', 'Neue Wette starten')}</strong>
      {props.canShare ? (
        <>
          {/* green as "Neues Spiel" (Sascha 02.11.2026) */}
          <button type="button" className="btn-primary" onClick={props.onNew}>
            {tr('New bet', 'Neue Wette')}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onJoin}>
            {tr('Join a bet', 'Wette beitreten')}
          </button>
        </>
      ) : (
        <span className="muted small">{tr('Sign in to set up bets: Profile → "On all your devices".', 'Für Wetten anmelden: Profil → „Auf allen Geräten“.')}</span>
      )}
    </section>
  );
}

function PoolRow(props: { e: PoolEntry; today: string; onOpen: () => void }) {
  const { pool } = props.e;
  const made = pool.wagers.filter((w) => stateOf(w, pool, props.today) === 'done').length;
  // one row as a game's row on the games list (Sascha: "Games and the bets like Rounds")
  return (
    <button type="button" className="list-item" onClick={props.onOpen}>
      <span className="round-date">
        <strong>{dm(pool.from)}</strong>
        <span className="muted small">{pool.from.slice(0, 4)}</span>
      </span>
      <span className="grow">
        <span className="title">{pool.name}</span>
        <span className="muted small one-line">
          {tr(`until ${dm(pool.to)}`, `bis ${dm(pool.to)}`)} · {pool.players.map((p) => p.name).join(', ')}
        </span>
      </span>
      <span className="game-row-result">
        <strong>
          {made}/{pool.wagers.length}
        </strong>
        <span className="muted small">{tr('made', 'geschafft')}</span>
      </span>
    </button>
  );
}

/** The menu "Bets" (Sascha 01.11.2026: "setting up, deleting, changing bets in a menu of its own") – built like the
 *  list of the rounds and of the games: the tiles at the top (Sascha: "as on Rounds and Games"), the list, the bin
 *  with "restore"; a new bet and joining one start on "Play". The pools come from the server too ("they must never
 *  vanish"): a phone without them – emptied, new – gets them back here. */
export function BetsTab(props: { onOpen: (code: string) => void; /** "Neue Wette" right from the empty list (Rounds' review 02.11.2026) */ onNew?: () => void }) {
  const all = usePools();
  const [filter, setFilter] = useState<'running' | 'made' | 'over' | 'bin' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void syncPools();
  }, []);
  const today = dayOf(new Date());
  const pools = all.filter((e) => !e.pool.deletedAt);
  const deleted = all.filter((e) => e.pool.deletedAt);
  const running = pools.filter((e) => live(e, today));
  const over = pools.filter((e) => !live(e, today));
  const made = running.reduce((n, e) => n + e.pool.wagers.filter((w) => stateOf(w, e.pool, today) === 'done').length, 0);
  // a pool swiped away: marked deleted for everyone, as from its sheet – "Undo" for a moment, then the bin
  const removePool = async (e: PoolEntry): Promise<boolean> => {
    const ok = !!(await changePool(e.code, (p) => ({ ...p, deletedAt: new Date().toISOString() })));
    setMsg(ok ? null : NO_NET());
    if (ok) window.dispatchEvent(new CustomEvent('golfos:deleted', { detail: { kind: 'pool', id: e.code, label: e.pool.name, undo: () => void restorePool(e.code) } }));
    return ok;
  };
  const pick = (f: 'running' | 'made' | 'over' | 'bin') => setFilter(filter === f ? null : f);
  // "made": the running pools with a bet made in them (Sascha 02.11.2026: "the tile has a number but cannot be tapped")
  const withMade = running.filter((e) => e.pool.wagers.some((w) => stateOf(w, e.pool, today) === 'done'));
  const shown = filter === 'running' ? running : filter === 'made' ? withMade : filter === 'over' ? over : pools;
  // "geschafft" lists the bets made one by one (Sascha 12.11.2026: "the tiles have no function" – with one pool every tile
  // showed the same pool): whose, which bet, where, in which pool – a tap opens the pool
  const madeBets = withMade.flatMap((e) =>
    e.pool.wagers
      .filter((w) => stateOf(w, e.pool, today) === 'done')
      .map((w) => ({ e, w, who: e.pool.players.find((p) => p.id === w.player)?.name ?? '?', where: progressOf(e.pool, w)?.where })),
  );
  return (
    <>
      <h1 className="tab-title">{tr('Bets', 'Wetten')}</h1>
      {/* tiles as on the rounds and the games (Sascha: "the same usability everywhere") */}
      <div className="tile-row">
        <button type="button" className="tile" aria-pressed={filter === 'running'} disabled={!running.length} onClick={() => pick('running')}>
          <span className="tile-head">
            <span className={`tile-num${running.length ? ' good-text' : ''}`}>{running.length}</span>
            <span className="tile-mark">{BETS_ICON}</span>
          </span>
          <span className="muted small">{tr('running', 'laufend')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'made'} disabled={!made} onClick={() => pick('made')}>
          <span className="tile-head">
            <span className="tile-num">{made}</span>
            <span className="tile-mark">
              <SignedIcon />
            </span>
          </span>
          <span className="muted small">{tr('bets made', 'geschafft')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'over'} disabled={!over.length} onClick={() => pick('over')}>
          <span className="tile-head">
            <span className="tile-num">{over.length}</span>
            <span className="tile-mark">
              <PlayedIcon />
            </span>
          </span>
          <span className="muted small">{tr('finished', 'beendet')}</span>
        </button>
        <button type="button" className="tile" aria-pressed={filter === 'bin'} disabled={!deleted.length} onClick={() => pick('bin')}>
          <span className="tile-head">
            <span className="tile-num">{deleted.length}</span>
            <span className="tile-mark">
              <DeletedIcon />
            </span>
          </span>
          <span className="muted small">{tr('deleted', 'gelöscht')}</span>
        </button>
      </div>
      <Bin
        open={filter === 'bin' && deleted.length > 0}
        title={tr('Deleted pools', 'Gelöschte Pools')}
        items={deleted.map((e) => ({ id: e.code, date: e.pool.createdAt, title: e.pool.name, meta: e.pool.players.map((p) => p.name).join(', '), deletedAt: e.pool.deletedAt! }))}
        onRestore={async (code) => {
          const e = deleted.find((x) => x.code === code);
          if (e && !isHost(e)) return setMsg(ONLY_HOST());
          setMsg((await restorePool(code)) ? null : NO_NET());
        }}
        onPurge={forgetPool}
      />
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {filter === 'made' && madeBets.length > 0 && (
        <ul className="list made-bets">
          {madeBets.map(({ e, w, who, where }) => (
            <li key={`${e.code}:${w.id}`}>
              <button type="button" className="list-item" onClick={() => props.onOpen(e.code)}>
                <span className="grow">
                  <span className="title">
                    {who}: {wagerLabel(w)}
                  </span>
                  <span className="muted small one-line">{[where, e.pool.name].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="good-text" aria-hidden="true">
                  <SignedIcon />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {filter !== 'bin' && filter !== 'made' &&
        (shown.length ? (
          <ul className="list">
            {shown.map((e) => (
              <li key={e.code}>
                {/* swiped away as a mail (Sascha 02.11.2026) – only the host deletes, marked for everyone, "Undo" or the bin brings it back */}
                {isHost(e) ? (
                  <SwipeRow label={e.pool.name} onDelete={() => removePool(e)}>
                    <PoolRow e={e} today={today} onOpen={() => props.onOpen(e.code)} />
                  </SwipeRow>
                ) : (
                  <PoolRow e={e} today={today} onOpen={() => props.onOpen(e.code)} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <>
            {props.onNew && (
              <button type="button" className="btn-secondary" onClick={props.onNew}>
                {tr('New bet', 'Neue Wette')}
              </button>
            )}
          </>
        ))}
    </>
  );
}

// ---------- a new pool ----------

/** A player of the pool as in "Runde starten" / "Neue Runde" (Sascha 03.11.2026): PlayerRow – name, tee, HCP, the playing
 *  handicap; no course yet, so tee and playing handicap stay "–". The first is you. */
function PoolPlayerRow(props: { player: { id: string; name: string; hcp?: string }; k: number; onChange: (p: { name: string; hcp: string }) => void; onRemove?: () => void }) {
  const { player, k } = props;
  return (
    <PlayerRow
      player={{ id: `pool-${player.id}`, name: player.name, index: player.hcp ?? '', handicap: '', tee: null }}
      nameLabel={k === 0 ? tr('You', 'Du') : tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
      rating={null}
      playing={null}
      onChange={(np) => props.onChange({ name: np.name, hcp: np.index })}
      onRemove={props.onRemove}
    />
  );
}


export function PoolSetup(props: { onBack: () => void; onCreated: (code: string) => void }) {
  useTop();
  const today = new Date();
  const [name, setName] = useState(tr('Bets', 'Wetten'));
  const [from, setFrom] = useState(dayOf(today));
  const [to, setTo] = useState(dayOf(new Date(today.getTime() + 7 * 864e5)));
  const [names, setNames] = useState<{ id: string; name: string; hcp: string }[]>(() => [{ id: newId(), name: shownName(loadProfile()) || tr('Me', 'Ich'), hcp: loadProfile().hcpIndex ?? '' }, { id: newId(), name: '', hcp: '' }]);
  // no value until chosen – a required field (Sascha 03.11.2026)
  const [prize, setPrize] = useState<Prize | null>(null);
  // "Jeder seinen eigenen" by default (Sascha 02.11.2026: "the switch off by default")
  const [poolEntry, setPoolEntry] = useState<ScoreEntry>('own');
  const [settle, setSettle] = useState<'net' | 'single'>('net');
  const counted = poolEntry !== 'own';
  const [rounds, setRounds] = useState<PoolRound[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = !!names[0].name.trim() && from <= to && !!prize;
  // laid out as "New game" (Sascha 01.11.2026: "Games and the bets like Rounds"): titles over the parts, a card per
  // player with ✕, "+ Add player", the friends as chips
  return (
    <main className="screen">
      <TopBar title={tr('New bet', 'Neue Wette')} onBack={props.onBack} backLabel={tr('Back', 'Zurück')} />
      <section className="setup-part">
        <span className="eyebrow">{tr('Pool of bets', 'Wett-Pool')}</span>
        <div className="card">
          <div className="field">
            <label htmlFor="pool-name">{tr('Name', 'Name')}</label>
            <input id="pool-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('USA 2026', 'USA 2026')} />
          </div>
        </div>
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Days', 'Zeitraum')}</span>
        <SettingsList>
          <DateRow id="pool-from" label={tr('From', 'Von')} value={from} onChange={(d) => { setFrom(d); if (d > to) setTo(d); }} />
          <DateRow id="pool-to" label={tr('To', 'Bis')} value={to} min={from} onChange={setTo} />
        </SettingsList>
        <span className="muted small">{tr('Rounds of these days count.', 'Es zählen die Runden dieser Tage.')}</span>
      </section>
      <TripRounds from={from} to={to} rounds={rounds} onChange={setRounds} />
      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        {/* each player as in "Runde starten" (Sascha 03.11.2026): name, tee, HCP, playing handicap – tee and playing
            handicap follow once a round has its course */}
        {names.map((p, k) => (
          <PoolPlayerRow key={p.id} player={p} k={k} onChange={(np) => setNames(names.map((x) => (x.id === p.id ? { ...x, ...np } : x)))} onRemove={k > 0 ? () => setNames(names.filter((x) => x.id !== p.id)) : undefined} />
        ))}
        {/* a friend takes the first empty row, else a new one – as in "New game" */}
        <FriendChips
          taken={names.map((p) => p.name)}
          onAdd={(fr) => {
            const k = names.findIndex((p, j) => j > 0 && !p.name.trim());
            setNames(k > 0 ? names.map((p, j) => (j === k ? { ...p, name: fr.name, hcp: fr.hcp } : p)) : [...names, { id: newId(), name: fr.name, hcp: fr.hcp }]);
          }}
        />
        {names.length < 12 && (
          <button type="button" className="btn-secondary" onClick={() => setNames([...names, { id: newId(), name: '', hcp: '' }])}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
      </section>
      {/* Wer → Score-Erfassung → Worum, as Neue Runde and Neues Turnier (Sascha 03.11.2026: one order everywhere) */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Score entry', 'Score-Erfassung')}</span>
        <CountedSwitch value={poolEntry} onChange={setPoolEntry} />
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
        <SettingsList>
          <PrizeRow value={prize} onChange={setPrize} />
          {setsOff(prize) && <SettleRow value={settle} onChange={setSettle} />}
        </SettingsList>
      </section>
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      <button
        type="button"
        className="btn-primary"
        disabled={busy || !ok}
        onClick={async () => {
          setBusy(true);
          if (!prize) return;
          const account = shownName(loadProfile()) || names[0].name.trim();
          const uid = myAccount();
          const players = names
            .map((p) => ({ ...p, name: p.name.trim() }))
            .filter((p, k) => k === 0 || p.name)
            .map((p, k) => ({ id: p.id, name: p.name, ...(p.hcp.trim() ? { hcp: p.hcp.trim() } : {}), ...(k === 0 ? { joined: { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) } } : {}) }));
          const pool: WagerPool = { kind: 'wager-pool', id: newId(), name: name.trim() || tr('Bets', 'Wetten'), from, to, createdAt: new Date().toISOString(), players, wagers: [], progress: {}, currency: isMoney(prize) ? prize.currency : 'EUR', ...(isMoney(prize) ? {} : { prize }), counted, ...(poolEntry === 'one' ? { oneScorer: true } : {}), ...(settle === 'single' ? { settle } : {}), ...(rounds.length ? { rounds } : {}) };
          const e = await createPool(pool, players[0].id);
          setBusy(false);
          if (e) props.onCreated(e.code);
          else setMsg(NO_NET());
        }}
      >
        {busy ? tr('Creating …', 'Erzeuge …') : tr('Create the pool', 'Pool anlegen')}
      </button>
    </main>
  );
}

/** The rounds of the trip (Sascha 01.11.2026: "a bet can be tied to a course and to the day it is played – six rounds
 *  in our case; even tied to the tournaments"): each its day and course – picked here, or taken from a tournament planned
 *  in Games (and linked to it). Set, only rounds on these days on these courses count. */
const weekday = (d: string) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short' }).replace('.', '');
  } catch {
    return '';
  }
};

function TripRounds(props: { from: string; to: string; rounds: PoolRound[]; onChange: (r: PoolRound[]) => void }) {
  const [adding, setAdding] = useState<{ day: string; course?: { id: string; name: string }; src?: PoolRound['src']; holes?: string; holesName?: string; allDay?: boolean } | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // a round's id
  const [tourPick, setTourPick] = useState(false);
  const tours = loadTours().filter((e) => !e.ev.deletedAt && e.ev.date >= props.from && e.ev.date <= props.to && !props.rounds.some((r) => r.tour === e.code));
  // a tournament series: all its rounds in one tap (Sascha 01.11.2026: "the bets tied to the tournaments")
  const series = loadSeries()
    .filter((x) => !x.series.deletedAt)
    .map((x) => ({ ...x, add: x.series.rounds.filter((r) => r.date >= props.from && r.date <= props.to && !props.rounds.some((y) => y.tour === r.code)) }))
    .filter((x) => x.add.length > 0);
  const sorted = [...props.rounds].sort((a, b) => a.day.localeCompare(b.day));
  const last = sorted[sorted.length - 1]?.day;
  const nextDay = () => (last && last < props.to ? dayOf(new Date(new Date(`${last}T12:00:00`).getTime() + 864e5)) : props.from);
  if (picking && adding)
    return (
      <div className="full-overlay">
        <CoursePicker
          onBack={() => {
            setPicking(false);
            if (!adding.course) setAdding(null); // backed out before a course: nothing to add
          }}
          onPicked={(c) => {
            // the course's place kept with the round – another phone loads it from there (03.11.2026)
            setAdding({ ...adding, course: { id: c.id, name: c.name }, src: { id: c.id, source: c.source, name: c.name, lat: c.lat, lon: c.lon, ...(c.bbox ? { bbox: c.bbox } : {}) }, holes: undefined, holesName: undefined });
            setPicking(false);
          }}
        />
      </div>
    );
  return (
    <section className="setup-part trip-rounds" aria-label={tr('Rounds', 'Runden')}>
      <span className="eyebrow">{tr('Rounds (optional)', 'Runden (optional)')}</span>
      {/* each round on its own, as the rounds of a series (Sascha 04.11.2026: "a round set up shown on its own – 'Weitere
          Runde' gets lost"): its day, its course, its holes and what counts; tapped – its day, holes or removed. Below, apart,
          a round added as "Platz · Platz wählen ›" in "Neue Runde" / "Neues Spiel" (Sascha 03.11.2026) */}
      {sorted.length > 0 && (
        <ul className="list" aria-label={tr('The rounds', 'Die Runden')}>
          {sorted.map((r) => (
            <li key={r.id}>
              <button type="button" className="list-item trip-round" onClick={() => setEditing(r.id)}>
                <span className="round-date">
                  <strong>{`${r.day.slice(8, 10)}.${r.day.slice(5, 7)}.`}</strong>
                  <span className="muted small">{weekday(r.day)}</span>
                </span>
                <span className="grow">
                  <span className="title">{r.course}</span>
                  <span className="muted small one-line">
                    {r.tour
                      ? tr('From a tournament planned', 'Aus einem geplanten Turnier')
                      : r.holes
                        ? `${(r.holesName ?? '').split(' · ')[0] || tr('Holes chosen', 'Löcher gewählt')} · ${r.allDay ? tr('every round of the day', 'alle Runden des Tages') : tr('this round only', 'nur diese Runde')}`
                        : tr('Every round of the day', 'Alle Runden des Tages')}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <SettingsList label={tr('Add a round', 'Runde hinzufügen')}>
        {!adding?.course && (
          <SettingsRow
            label={sorted.length ? tr('Another round', 'Weitere Runde') : tr('Course', 'Platz')}
            value={tr('Choose a course', 'Platz wählen')}
            onClick={() => {
              setAdding({ day: nextDay() });
              setPicking(true);
            }}
          />
        )}
        {!adding?.course && (tours.length > 0 || series.length > 0) && (
          <SettingsRow label={tr('Tournament', 'Turnier')} value={tr('Choose a tournament', 'Turnier wählen')} onClick={() => setTourPick(true)} />
        )}
      </SettingsList>
      {editing && (() => {
        const r = props.rounds.find((x) => x.id === editing);
        if (!r) return null;
        return (
          <div className="sheet-backdrop" onClick={() => setEditing(null)}>
            <section className="sheet" role="dialog" aria-label={roundLabel(r)} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>{r.course}</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setEditing(null)}>
                  ✕
                </button>
              </div>
              {!r.tour && (
                <>
                  {r.courseId && loadCachedCourse(r.courseId) && <RoundHoles course={loadCachedCourse(r.courseId)!} holes={r.holes} onChange={(h) => props.onChange(props.rounds.map((x) => (x.id === r.id ? { ...x, ...h } : x)))} />}
                  <SettingsList>
                    <DateRow label={tr('Day', 'Tag')} min={props.from} max={props.to} value={r.day} onChange={(d) => props.onChange(props.rounds.map((x) => (x.id === r.id ? { ...x, day: d } : x)))} />
                    {r.holes && <ValidityRow allDay={!!r.allDay} onChange={(allDay) => props.onChange(props.rounds.map((x) => (x.id === r.id ? { ...x, allDay } : x)))} />}
                  </SettingsList>
                </>
              )}
              {r.tour && (
                <span className="muted small">
                  {tr('From a ', 'Aus einem ')}
                  {/* the tournament, a tap away (night 10./11.11.2026: click paths) */}
                  <button type="button" className="link-text" onClick={() => goTour(r.tour!)}>
                    {tr('tournament planned', 'geplanten Turnier')}
                  </button>
                  {tr(' – its day comes from there.', ' – der Tag kommt von dort.')}
                </span>
              )}
              <ActionBar
                label={tr('This round', 'Diese Runde')}
                actions={[{ label: tr('Remove the round', 'Runde entfernen'), icon: 'delete', danger: true, onClick: () => { props.onChange(props.rounds.filter((x) => x.id !== r.id)); setEditing(null); } }]}
              />
            </section>
          </div>
        );
      })()}
      {tourPick && (
        <PickSheet<string>
          title={tr('From a tournament planned', 'Aus geplantem Turnier')}
          current=""
          options={[
            ...series.map((x) => ({ value: `s:${x.code}`, name: x.series.name, text: tr(`Series · ${x.add.length} rounds`, `Serie · ${x.add.length} ${x.add.length === 1 ? 'Runde' : 'Runden'}`) })),
            ...tours.map((e) => ({ value: `t:${e.code}`, name: e.ev.name, text: `${dayText(e.ev.date)} · ${e.ev.course.name}` })),
          ]}
          onPick={(v) => {
            const x = series.find((y) => `s:${y.code}` === v);
            const e = tours.find((y) => `t:${y.code}` === v);
            if (x) props.onChange([...props.rounds, ...x.add.map((r) => ({ id: newId(), day: r.date, course: r.course.name, courseId: r.course.id, tour: r.code }))]);
            if (e) props.onChange([...props.rounds, { id: newId(), day: e.ev.date, course: e.ev.course.name, courseId: e.ev.course.id, tour: e.code, src: e.ev.course }]);
            setTourPick(false);
          }}
          onClose={() => setTourPick(false)}
        />
      )}
      {/* a round added as a game or a round is set up (Sascha 02.11.2026: "as in Games and Rounds"): "Platz wählen" opens
          the courses, then the course and the day as rows, the button below */}
      {adding?.course && (
        <div className="card trip-add" role="group" aria-label={tr('New round', 'Neue Runde')}>
          <div className="sheet-head">
            <strong>{tr('New round', 'Neue Runde')}</strong>
            <button type="button" className="icon-btn" aria-label={tr('Cancel', 'Abbrechen')} onClick={() => setAdding(null)}>
              ✕
            </button>
          </div>
          <SettingsList>
            <SettingsRow label={tr('Course', 'Platz')} value={adding.course.name} onClick={() => setPicking(true)} />
          </SettingsList>
          {loadCachedCourse(adding.course.id) && <RoundHoles course={loadCachedCourse(adding.course.id)!} holes={adding.holes} onChange={(h) => setAdding({ ...adding, ...h })} />}
          <SettingsList>
            <DateRow id="trip-day" label={tr('Day', 'Tag')} min={props.from} max={props.to} value={adding.day} onChange={(d) => setAdding({ ...adding, day: d })} />
            {adding.holes && <ValidityRow allDay={!!adding.allDay} onChange={(allDay) => setAdding({ ...adding, allDay })} />}
          </SettingsList>
          <button
            type="button"
            className="btn-primary"
            disabled={adding.day < props.from || adding.day > props.to}
            onClick={() => {
              props.onChange([...props.rounds, { id: newId(), day: adding.day, course: adding.course!.name, courseId: adding.course!.id, ...(adding.src ? { src: adding.src } : {}), ...(adding.holes ? { holes: adding.holes, holesName: adding.holesName, ...(adding.allDay ? { allDay: true } : {}) } : {}) }]);
              setAdding(null);
            }}
          >
            {tr('Add the round', 'Runde hinzufügen')}
          </button>
        </div>
      )}
      <span className="muted small">
        {props.rounds.length
          ? tr('Only rounds on these days on these courses count.', 'Es zählen nur Runden an diesen Tagen auf diesen Plätzen.')
          : tr('Without rounds every round of the days counts.', 'Ohne Runden zählt jede Runde im Zeitraum.')}
      </span>
    </section>
  );
}

/** The holes of a pool's round as in "Neue Runde" (Sascha 04.11.2026: "the combinations shown as in the rest of the app
 *  once a course is chosen; chosen, summed up – tapped again, all of them"): the tiles, then a row "Löcher · A + B". */
function RoundHoles(props: { course: Course; holes?: string; onChange: (h: { holes?: string; holesName?: string }) => void }) {
  const opts = loopOptions(props.course.holes).map((o) => ({ id: o.id, key: buildRoundHoles(props.course.holes, o).map((h) => h.label).join(), label: o.label }));
  const cur = opts.find((o) => o.key === props.holes);
  const [open, setOpen] = useState(!cur);
  // one way round the course only: it is taken
  useEffect(() => {
    if (opts.length === 1 && !cur) props.onChange({ holes: opts[0].key, holesName: opts[0].label });
  }, [props.course.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (opts.length < 2) return null;
  if (cur && !open)
    return (
      <SettingsList>
        <SettingsRow label={tr('Holes', 'Löcher')} value={cur.label.split(' · ')[0]} onClick={() => setOpen(true)} />
      </SettingsList>
    );
  return (
    <div className="choice-grid" role="group" aria-label={tr('Holes', 'Löcher')}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          className="choice choice-loop"
          aria-pressed={o.key === props.holes}
          onClick={() => {
            props.onChange({ holes: o.key, holesName: o.label });
            setOpen(false);
          }}
        >
          <strong>{o.label.split(' · ')[0]}</strong>
          {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
        </button>
      ))}
    </div>
  );
}

/** "Gilt für" (Sascha 04.11.2026: "Gültigkeit der Wette – only this round, or every round of the day"). */
function ValidityRow(props: { allDay: boolean; onChange: (allDay: boolean) => void }) {
  return (
    <ChoiceRow<boolean>
      label={tr('Counts for', 'Gilt für')}
      title={tr('Which rounds count', 'Welche Runden zählen')}
      value={props.allDay}
      onChange={props.onChange}
      options={[
        { value: false, name: tr('This round only', 'Nur diese Runde'), text: tr('Only the round on these holes counts.', 'Nur die Runde auf diesen Löchern zählt.') },
        { value: true, name: tr('Every round of the day', 'Alle Runden des Tages'), text: tr('Every round that day on this course counts.', 'Jede Runde an dem Tag auf dem Platz zählt.') },
      ]}
    />
  );
}

// ---------- the pool ----------

/** A "5+5+10" from the opponent's side: what one won the other lost, front, back and 18 turned round. */
const mirrored = (p: Progress | undefined): Progress | undefined =>
  p && { ...p, amount: -(p.amount ?? 0), duels: p.duels?.map(flipDuel) };

/** "5+5+10": what the player stands at against his opponent – won (green), lost (red), level or not played yet. */
function DuelBadge(props: { amount: number; played: boolean; sym: string }) {
  if (!props.played) return <span className="badge warn">{tr('Open', 'Offen')}</span>;
  const v = props.amount;
  return <span className={`badge ${v > 0 ? 'ok' : v < 0 ? 'bad' : 'warn'}`}>{`${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(v, props.sym)}`}</span>;
}

/** Whether a player is in the pool, as an icon (Sascha 04.11.2026: "you green, not joined red, joined green – icons
 *  even better"): you – a person, joined – a tick, not joined yet – a clock; the words for VoiceOver and as a tip. */
/** "Who is Chris?" (Sascha 06.11.2026: "invite Erik Hausotter right at Erik"; "Chris made by hand, Christopher joined –
 *  twice; let me edit Chris"): the host gives a player made by hand his phone – a player who joined on his own as a
 *  new one (then that one goes), or a linked friend invited right at him (his phone takes this player on opening). */
function WhoIsSheet(props: { code: string; pool: WagerPool; player: PoolPlayer; /** this phone's player – never offered as another */ me: string; onClose: () => void }) {
  const { pool, player } = props;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const joined = new Set(pool.players.map((p) => p.joined?.uid).filter(Boolean));
  const twins = pool.players.filter((p) => p.id !== player.id && p.id !== props.me && p.joined?.uid !== myAccount() && canLinkInto(pool, p));
  const friends = canLink() ? loadFriends().filter((f) => f.uid && !joined.has(f.uid)) : [];
  const link = async (from: PoolPlayer) => {
    setBusy(true);
    const r = await linkPlayer(props.code, player.id, from.id);
    setBusy(false);
    if (r) props.onClose();
    else setMsg(NO_NET());
  };
  const invite = async (uid: string, fname: string) => {
    setBusy(true);
    const r = await invitePlayer(props.code, player.id, { uid, name: fname });
    const sent = r ? await inviteFriend(props.code, uid, fname, shownName(loadProfile()) || tr('a player', 'ein Spieler')) : null;
    setBusy(false);
    if (!r) return setMsg(NO_NET());
    setMsg(
      sent === 'sent'
        ? tr(`${fname} gets a notification – on opening, his phone is ${player.name}.`, `${fname} bekommt eine Mitteilung – öffnet er den Pool, ist sein Handy ${player.name}.`)
        : tr(`${fname} is invited as ${player.name} – when he opens GolfOS, the request is there.`, `${fname} ist als ${player.name} eingeladen – öffnet er GolfOS, ist die Anfrage da.`),
    );
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={tr(`Who is ${player.name}?`, `Wer ist ${player.name}?`)} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr(`Who is ${player.name}?`, `Wer ist ${player.name}?`)}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {player.invited && !player.joined?.uid && <span className="muted small">{tr(`Invited: ${player.invited.name} – not in yet.`, `Eingeladen: ${player.invited.name} – noch nicht dabei.`)}</span>}
        {twins.length > 0 && (
          <div className="invite-friends" aria-label={tr('In the pool already', 'Schon im Pool')}>
            <span className="eyebrow">{tr('In the pool already', 'Schon im Pool')}</span>
            <span className="muted small">{tr(`Joined on his phone as a new player – his phone becomes ${player.name}, with all bets; the second one goes.`, `Auf seinem Handy als neuer Spieler beigetreten – sein Handy wird ${player.name}, mit allen Wetten; der zweite fällt weg.`)}</span>
            {twins.map((t) => (
              <div key={t.id} className="invite-friend">
                <Avatar name={t.name} size={32} />
                <span className="grow">
                  <strong>{t.name}</strong>
                  <span className="muted small"> · {tr('no bets', 'ohne Wetten')}</span>
                </span>
                <button type="button" className="btn-primary" disabled={busy} aria-label={tr(`${t.name} is ${player.name}`, `${t.name} ist ${player.name}`)} onClick={() => void link(t)}>
                  {tr(`Is ${player.name}`, `Ist ${player.name}`)}
                </button>
              </div>
            ))}
          </div>
        )}
        {friends.length > 0 && (
          <div className="invite-friends" aria-label={tr('Invite a linked friend', 'Verknüpften Freund einladen')}>
            <span className="eyebrow">{tr('Invite a linked friend', 'Verknüpften Freund einladen')}</span>
            {friends.map((f) => {
              const fname = f.fullName || f.name;
              const asHim = player.invited?.uid === f.uid;
              return (
                <div key={f.uid} className="invite-friend">
                  <Avatar name={f.name} photo={f.photo} size={32} />
                  <span className="grow">
                    <strong>{fname}</strong>
                    {f.hcp.trim() && <span className="muted small"> · HCP {f.hcp}</span>}
                  </span>
                  <button type="button" className={asHim ? 'btn-secondary' : 'btn-primary'} disabled={busy} aria-label={tr(`Invite ${f.name} as ${player.name}`, `${f.name} als ${player.name} einladen`)} onClick={() => void invite(f.uid!, fname)}>
                    {asHim ? tr('Again', 'Nochmal') : tr('Invite', 'Einladen')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!twins.length && !friends.length && !player.joined && <span className="muted">{tr('No linked friend and nobody joined without bets – invite with the QR code or the link below.', 'Kein verknüpfter Freund und niemand ohne Wetten beigetreten – einladen mit dem QR-Code oder dem Link unten.')}</span>}
        {/* taken back – an invitation still open, or the phone of one who accepted (Sascha 09.11.2026): then invited anew */}
        {(player.invited || player.joined) && (
          <button
            type="button"
            className="btn-secondary btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await uninvitePlayer(props.code, player.id);
              setBusy(false);
              if (!r) return setMsg(NO_NET());
              setMsg(player.joined ? tr(`${player.name} is no longer linked – invite him again.`, `${player.name} ist nicht mehr verknüpft – lade ihn neu ein.`) : tr('Invitation taken back.', 'Einladung zurückgenommen.'));
            }}
          >
            {player.joined ? tr(`Unlink ${player.joined.name || player.name}`, `Verknüpfung mit ${player.joined.name || player.name} lösen`) : tr('Take the invitation back', 'Einladung zurücknehmen')}
          </button>
        )}
        {msg && (
          <span className="muted small" role="status">
            {msg}
          </span>
        )}
      </section>
    </div>
  );
}

/** An invitation's state as an icon beside its words (Sascha 09.11.2026): accepted – a green tick, still open – a clock. */
/** A player's figure (Sascha 10.11.2026: "the figure for the host; a red figure when not invited at all; a grey one with
 *  an arrow as a sent e-mail while the invitation is not accepted"): 'host' the figure, 'in' with a tick (on a phone),
 *  'sent' grey with the arrow, 'out' red. */
export type PersonState = 'host' | 'in' | 'sent' | 'out';
export function PersonMark(props: { state: PersonState; size?: number }) {
  const label =
    props.state === 'host' ? tr('host', 'Host') : props.state === 'in' ? tr('accepted – on his phone', 'angenommen – auf seinem Handy') : props.state === 'sent' ? tr('invited – not accepted yet', 'eingeladen – noch nicht angenommen') : tr('not invited yet', 'noch nicht eingeladen');
  const s = props.size ?? 22;
  const cls = props.state === 'out' ? 'bad-text' : props.state === 'sent' ? 'muted' : 'good-text';
  const wide = props.state === 'in' || props.state === 'sent';
  return (
    <span className={`join-mark person-mark ${cls}`} role="img" aria-label={label} title={label}>
      {/* with a tick or an arrow the figure is wider – the sign clear of it (Sascha 10.11.2026, twice: "too close") */}
      <svg width={wide ? Math.round((s * 30) / 24) : s} height={s} viewBox={wide ? '0 0 30 24' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {props.state === 'host' || props.state === 'out' ? (
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </>
        ) : (
          <>
            {/* the figure smaller on the left, the tick or the arrow clear of it on the right (Sascha 10.11.2026: "the tick
                too close to the figure") */}
            <circle cx="8" cy="7.5" r="3.6" />
            <path d="M1.5 20.5c0-3.5 2.9-6.3 6.5-6.3s6.5 2.8 6.5 6.3" />
            {props.state === 'in' ? <path d="M19 15l3 3 6-6.5" /> : <path d="M19 15.5h9M24.5 12l3.5 3.5-3.5 3.5" />}
          </>
        )}
      </svg>
    </span>
  );
}
/** A pool player's state: the host, on his phone, invited, not invited. */
const personOf = (p: PoolPlayer, owner?: string): PersonState => (owner && p.joined?.uid === owner ? 'host' : p.joined ? 'in' : p.invited ? 'sent' : 'out');

function StateBadge(props: { state: WagerState; provisional?: boolean; /** each round on its own: in how many it was made – said always, 1× too (Sascha 10.11.2026) */ times?: number }) {
  if (props.state === 'done') return <span className="badge ok">{props.times ? tr(`Made ${props.times}×`, `${props.times}× geschafft`) : tr('Made', 'Geschafft')}</span>;
  if (props.state === 'missed') return <span className="badge bad">{tr('Missed', 'Verloren')}</span>;
  // made in a round not signed yet (Sascha 02.11.2026: "a result even when the marker has not signed")
  if (props.provisional) return <span className="badge warn">{tr('Made · provisional', 'Geschafft · vorläufig')}</span>;
  return <span className="badge warn">{tr('Open', 'Offen')}</span>;
}

export function PoolScreen(props: { code: string; onBack: () => void; /** where back leads, when not to "Wetten" */ backLabel?: string; onRound?: (code: string) => void; /** today's tournament: Rounds, to take part (Sascha 09.11.2026) */ onTour?: () => void }) {
  useTop(props.code);
  const pools = usePools();
  const entry = pools.find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | { edit: Wager | null } | { library: string } | { whois: string } | 'invite' | 'finish' | 'pool'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // not on this phone yet (a push tapped on another phone of the same account): fetched from the server
  const [lookup, setLookup] = useState<'busy' | 'none' | 'signin' | null>(null);
  useEffect(() => {
    if (entry) return;
    setLookup('busy');
    void (async () => {
      // not signed in: neither the invitation nor the code can let this phone in (Sascha 09.11.2026, Erik)
      if (!loadSession()) return setLookup('signin');
      let p = await refreshPool(props.code);
      // not in it yet – an invitation opened before the server let him in: in by the code, as "Spiel beitreten" does
      if (!p && isPool(await joinGame(props.code))) p = await refreshPool(props.code);
      setLookup(p ? null : 'none');
    })();
  }, [props.code]); // eslint-disable-line react-hooks/exhaustive-deps
  // the own bets judged from the rounds, then the pool as it is on the server – at once and every 20 s on screen
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      await reportWagers();
      if (alive) await refreshPool(props.code);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [props.code]);
  if (!entry) {
    return (
      <main className="screen">
        <TopBar title={tr('Bets', 'Wetten')} onBack={props.onBack} backLabel={props.backLabel ?? tr('Bets', 'Wetten')} />
        <p className="muted">
          {lookup === 'busy'
            ? tr('Loading the pool …', 'Lade den Pool …')
            : lookup === 'signin'
              ? tr('Sign in first (Profile → Sign in with Google) – then the invitation lets you in.', 'Bitte zuerst anmelden (Profil → Mit Google anmelden) – dann lässt dich die Einladung hinein.')
              : tr('The pool could not be loaded – no connection, or this account is not in it. Join it with its code under "Join a game".', 'Der Pool ließ sich nicht laden – keine Verbindung, oder dieses Konto ist nicht dabei. Mit dem Code unter „Spiel beitreten“ beitreten.')}
        </p>
      </main>
    );
  }
  // the duels (5+5+10) judged from the players' cards – the same on every phone (Sascha 09.11.2026)
  const pool = withDuels(entry.pool);
  // only the host changes the pool (Sascha 01.11.2026: "the invited ones cannot edit the bets – only the host")
  const host = isHost(entry);
  // a 5+5+10 this phone's player challenged with, not declined – he changes it too (the server lets him: golfos-duels3.sql)
  const ownDuel = (w: Wager) => shapeOf(w.kind) === 'duel' && !!entry.me && w.player === entry.me && w.challenge?.state !== 'declined';
  if (pool.deletedAt) {
    return (
      <main className="screen">
        <TopBar title={pool.name} onBack={props.onBack} backLabel={props.backLabel ?? tr('Bets', 'Wetten')} />
        <p className="muted">{tr('This pool of bets was deleted. Its bets are kept – it can be restored.', 'Dieser Wett-Pool wurde gelöscht. Seine Wetten sind noch da – er lässt sich wiederherstellen.')}</p>
        {host ? (
          <button type="button" className="btn-secondary" onClick={async () => setMsg((await restorePool(props.code)) ? null : NO_NET())}>
            {tr('Restore', 'Wiederherstellen')}
          </button>
        ) : (
          <p className="muted small">{tr('Whoever set it up can restore it.', 'Wer ihn angelegt hat, kann ihn wiederherstellen.')}</p>
        )}
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
      </main>
    );
  }
  const today = dayOf(new Date());
  const name = (id?: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  // a tournament of this account today, in the pool's days – a round of the series (Sascha 09.11.2026)
  const tourToday = today >= pool.from && today <= pool.to ? loadTours().find((e) => tourState(e, today) === 'today') : undefined;
  const change = async (fn: (p: WagerPool) => WagerPool | null) => {
    setMsg(null);
    const r = await changePool(props.code, fn);
    if (!r) setMsg(NO_NET());
    return !!r;
  };
  const bal = balances(pool, today, true);
  // every debt the bets decided, and those the pool pays: between each two, set off or one by one (Sascha 11.11.2026)
  const owed = owings(pool, today, true);
  const debts = settleDebts(pool, owed);
  // what is still to give, once the payments are off – counted per bet, or the loser for all / for the winner
  const pays = openPoolTransfers(pool, bal, debts);
  // the payments (Sascha 03.11.2026): the payer says he paid, the receiver that he got it
  const pay = (fn: (ps: Payment[]) => Payment[]) => void change((p) => ({ ...p, payments: fn(p.payments ?? []) }));
  const now = () => new Date().toISOString();
  const settled = pool.wagers.filter((w) => stateOf(w, pool, today) !== 'open').length;
  const pending = pool.wagers.filter((w) => stateOf(w, pool, today) === 'open' && provisional(w, pool.progress[w.id])).length;
  return (
    <main className="screen pool-screen">
      <TopBar
        title={pool.name}
        onBack={props.onBack}
        backLabel={props.backLabel ?? tr('Bets', 'Wetten')}
        right={
          host ? (
            <button type="button" className="icon-btn edit-btn" aria-label={tr('Change the pool', 'Pool bearbeiten')} onClick={() => setSheet('pool')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <span className="muted small">
        {dm(pool.from)}–{dm(pool.to)} · {tr(`${pool.players.length} players · ${pool.wagers.length} bets`, `${pool.players.length} Spieler · ${pool.wagers.length} Wetten`)}
        {pool.finishedAt ? ` · ${tr('finished', 'beendet')}` : ''}
      </span>
      {!host && <span className="muted small">{ONLY_HOST()}</span>}
      {!entry.me && (
        <section className="card play-card">
          <span className="eyebrow">{tr('Who are you?', 'Wer bist du?')}</span>
          <span className="muted small">{tr('Then this phone reports your bets.', 'Dann meldet dieses Handy deine Wetten.')}</span>
          <div className="chip-set">
            {pool.players.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={async () => setMsg((await joinPool(props.code, { id: p.id }, shownName(loadProfile()) || p.name)) ? null : NO_NET())}>
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {/* 5+5+10 challenged – answered here, the own ones waiting with a clock (Sascha 09.11.2026) */}
      <Standings pool={pool} today={today} me={entry.me} />
      {/* the standing on top, the 5+5+10 challenges below it (Sascha 10.11.2026) */}
      <Challenges entry={entry} />
      {pool.players.map((p) => {
        // his own bets – and a "5+5+10" against him, seen from his side (Erik sees he is 10 $ behind Chris)
        const ws = pool.wagers
          .filter((w) => (w.player === p.id || (shapeOf(w.kind) === 'duel' && w.opponent === p.id)) && w.challenge?.state !== 'declined')
          .map((w) => (w.player === p.id ? { w, shown: w, prog: pool.progress[w.id] } : { w, shown: { ...w, player: p.id, opponent: w.player }, prog: mirrored(pool.progress[w.id]) }));
        return (
          <section key={p.id} className="card pool-player" aria-label={p.name}>
            <div className="pool-player-head">
              <h2>{p.name}</h2>
              <PersonMark state={personOf(p, entry.owner)} />
            </div>
            {/* the host invites right at a player not on a phone yet – or gives him the one who joined as a new player */}
            {host && !p.joined?.uid && p.id !== entry.me && (
              <button type="button" className="btn-secondary pool-whois" aria-label={p.invited ? tr(`Invited: ${p.invited.name} – not accepted yet`, `Eingeladen: ${p.invited.name} – noch nicht angenommen`) : tr(`Invite ${p.name}`, `${p.name} einladen`)} onClick={() => setSheet({ whois: p.id })}>
                {p.invited ? <PersonMark state="sent" size={18} /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="10" cy="8" r="4" />
                    <path d="M3 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
                    <path d="M19 8v6M16 11h6" />
                  </svg>
                )}
                {p.invited ? tr(`Invited: ${p.invited.name}`, `Eingeladen: ${p.invited.name}`) : tr(`Invite ${p.name}`, `${p.name} einladen`)}
              </button>
            )}
            {/* how the invitation stands, with its icon (Sascha 09.11.2026: "accepted – an icon; still open – an icon too") */}
            {!host && p.invited && !p.joined?.uid && p.id !== entry.me && (
              <span className="pool-invite-state">
                <PersonMark state="sent" size={18} />
                {tr(`Invited: ${p.invited.name} – not accepted yet`, `Eingeladen: ${p.invited.name} – noch nicht angenommen`)}
              </span>
            )}
            {p.joined && p.id !== entry.me && (host ? (
              <button type="button" className="pool-invite-state pool-invite-edit" aria-label={tr(`Accepted: ${p.joined.name || p.name} – change`, `Angenommen: ${p.joined.name || p.name} – ändern`)} onClick={() => setSheet({ whois: p.id })}>
                <PersonMark state="in" size={18} />
                <span className="grow">{tr(`Accepted: ${p.joined.name || p.name}`, `Angenommen: ${p.joined.name || p.name}`)}</span>
                <span aria-hidden="true">›</span>
              </button>
            ) : (
              <span className="pool-invite-state">
                <PersonMark state="in" size={18} />
                {tr(`Accepted: ${p.joined.name || p.name}`, `Angenommen: ${p.joined.name || p.name}`)}
              </span>
            ))}
            {!ws.length && <span className="muted small">{tr('No bets yet.', 'Noch keine Wetten.')}</span>}
            {/* per person a library to pick single bets from (Sascha 01.11.2026) – below the bets there are */}
            {ws.map(({ w, shown, prog }) => {
              const row = (
                <>
                  <span className="grow">
                    <span className="title">{wagerLabel(shown)}</span>
                    <span className="muted small">{wagerRules(shown, pool, roundChoices(pool, [...tourChoices(), ...(shown.picks ?? [])]).length)}</span>
                    {w.kind !== 'free' && <span className="small">{progressText(shown, prog, prizeOf(pool))}</span>}
                  </span>
                  {duelWaits(w) ? <DuelMark state="open" /> : shapeOf(w.kind) === 'duel' ? <DuelBadge amount={prog?.amount ?? 0} played={!!prog?.duels?.length} sym={prizeSym(prizeOf(pool))} /> : <StateBadge state={stateOf(w, pool, today)} provisional={!tally(w, prog) && provisional(shown, prog)} times={tally(w, prog)?.made} />}
                </>
              );
              // the host taps a bet to change, decide or delete it; the challenger his own 5+5+10 (Sascha 11.11.2026: "Chris set
              // it up and challenged me – he must be able to change it afterwards"); the others only see it
              return host || ownDuel(w) ? (
                <button key={w.id} type="button" className="list-item pool-wager" onClick={() => setSheet({ edit: w })}>
                  {row}
                </button>
              ) : (
                <div key={w.id} className="list-item pool-wager">
                  {row}
                </div>
              );
            })}
            {host && !pool.finishedAt && (
              <button type="button" className="btn-secondary pool-add" aria-label={tr(`Add bets for ${p.name}`, `Wetten für ${p.name} hinzufügen`)} onClick={() => setSheet({ library: p.id })}>
                {tr('+ Bets', '+ Wetten')}
              </button>
            )}
          </section>
        );
      })}
      <Settlement pool={pool} bal={bal} lines={ledger(pool, today, true)} debts={debts} owed={owed} settled={settled} pending={pending} me={entry.me} name={name}>
        {!isNone(prizeOf(pool)) && <PaidMarks
          open={pays}
          payments={pool.payments ?? []}
          name={(id) => name(id)}
          sym={prizeSym(prizeOf(pool))}
          prize={prizeOf(pool)}
          me={entry.me}
          // only one's own payments (Sascha 12.11.2026) – the host's phone also for a player without the app
          standIn={(id) => host && !pool.players.find((x) => x.id === id)?.joined}
          onMark={(t, as, how) => pay((ps) => [...ps, { id: newId(), ...t, ...(as === 'paid' ? { paidAt: now() } : { receivedAt: now() }), ...(how ? { how } : {}) }])}
          onConfirm={(id, how) => pay((ps) => ps.map((x) => (x.id === id ? { ...x, receivedAt: now(), ...(how ? { how } : {}) } : x)))}
          paypalOf={(id) => pool.players.find((x) => x.id === id)?.joined?.paypal}
          currency={pool.currency === 'USD' ? 'USD' : 'EUR'}
          onUndo={(id) => pay((ps) => ps.filter((x) => x.id !== id))}
        />}
        {isNone(prizeOf(pool)) && <span className="muted small">{tr('No stake – for the honour: one point a bet won.', 'Ohne Einsatz – um die Ehre: ein Punkt je gewonnene Wette.')}</span>}
      </Settlement>
      {host && (pool.finishedAt || pool.players.every((p) => p.joined || p.id === entry.me) ? (
        // everyone in, or the pool over (Sascha 03.11.2026: "why 'invite players' when I open a bet from the balance?"):
        // a row only – tapped, the invitation as a sheet (one more joining late)
        <SettingsList>
          <SheetRow label={tr('Invite players', 'Mitspieler einladen')} value={pool.finishedAt ? tr('finished', 'beendet') : tr('everyone in', 'alle dabei')}>
            <PoolInvite code={props.code} name={pool.name} />
          </SheetRow>
        </SettingsList>
      ) : (
        // a section of its own, as "Mitspieler einladen" in the round setup (docs/DESIGN.md); below the settlement,
        // right before "Runde starten" (Sascha 03.11.2026)
        <section className="setup-part" aria-label={tr('Invite players', 'Mitspieler einladen')}>
          <span className="eyebrow">{tr('Invite players', 'Mitspieler einladen')}</span>
          <PoolInvite code={props.code} name={pool.name} />
        </section>
      ))}
      {/* the standing for people outside (Sascha 08.11.2026) – the money only when switched on */}
      {!pool.deletedAt && <LiveShare code={props.code} name={pool.name} money />}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {/* the pool's actions one bar of icons, as everywhere (Sascha 03.11.2026: docs/DESIGN.md) – Speichern (every change
          is on the server the moment it is made: it checks it is there and goes back), Pool beenden red, last */}
      {host && !pool.finishedAt && (
        <>
          <ActionBar
            label={tr('This pool', 'Dieser Pool')}
            actions={[
              { label: tr('Save', 'Speichern'), icon: 'save', onClick: async () => void ((await change(() => null)) && props.onBack()) },
              { label: tr('Finish the pool', 'Pool beenden'), icon: 'finish', danger: true, onClick: () => setSheet('finish') },
            ]}
          />
        </>
      )}
      {/* a tournament today – a round of the series (Sascha 09.11.2026: "'Runde starten' only makes sense for a single
          round – the bets run over all rounds of the series"): it is played in Rounds and counts for the bets anyway */}
      {entry.me && !pool.finishedAt && tourToday && !poolRoundOf(props.code) && props.onTour ? (
        <>
          <span className="muted small pool-tour-hint">
            {tr('Today: ', 'Heute: ')}
            {/* the tournament's page (Sascha 10.11.2026: click paths) */}
            <button type="button" className="link-text" onClick={() => goTour(tourToday.code)}>
              {tourToday.ev.name}
            </button>
            {tr(' – it counts for the bets.', ' – zählt für die Wetten.')}
          </span>
          <button type="button" className="btn-primary" onClick={props.onTour}>
            {tr('To the tournament', 'Zum Turnier')}
          </button>
        </>
      ) : entry.me && !pool.finishedAt && props.onRound && (
        <button type="button" className="btn-primary" onClick={() => props.onRound!(props.code)}>
          {poolRoundOf(props.code) ? tr('Continue the round', 'Runde fortsetzen') : tr('Start the round', 'Runde starten')}
        </button>
      )}
      {sheet && typeof sheet === 'object' && 'edit' in sheet && (
        <WagerSheet
          pool={pool}
          me={entry.me}
          wager={sheet.edit}
          own={!host}
          onClose={() => setSheet(null)}
          onSave={async (w) => {
            if (await change((p) => ({ ...p, wagers: p.wagers.some((x) => x.id === w.id) ? p.wagers.map((x) => (x.id === w.id ? w : x)) : [...p.wagers, w] }))) {
              setSheet(null);
              void reportWagers();
            }
          }}
          onDelete={async (id) => {
            if (await change((p) => ({ ...p, wagers: p.wagers.filter((x) => x.id !== id) }))) setSheet(null);
          }}
          onJudge={async (id, done) => {
            const by = name(entry.me);
            const was = stateOf(pool.wagers.find((x) => x.id === id)!, pool, today) === 'done';
            if (
              await change((p) => {
                const prev = p.progress[id] ?? { best: null, done: false, rounds: 0, at: new Date().toISOString() };
                const { manual: _m, ...rest } = prev;
                return { ...p, progress: { ...p.progress, [id]: done == null ? rest : { ...prev, manual: { done, by } } } };
              })
            ) {
              setSheet(null);
              if (done && !was) pushBet(props.code, id); // decided as made: everyone in the pool hears of it
            }
          }}
        />
      )}
      {sheet && typeof sheet === 'object' && 'library' in sheet && (
        <LibrarySheet
          pool={pool}
          player={sheet.library}
          onClose={() => setSheet(null)}
          onAdd={async (ws) => {
            if (await change((p) => ({ ...p, wagers: [...p.wagers, ...ws] }))) {
              rememberBets(pool, ws);
              pushWagers(props.code, ws.map((w) => w.id)); // the player and the one it is against hear of it (07.11.2026)
              setSheet(null);
              void reportWagers();
            }
          }}
        />
      )}
      {sheet === 'pool' && (
        <PoolEditSheet
          pool={pool}
          me={entry.me}
          onClose={() => setSheet(null)}
          onSave={async (x) => {
            const ok = await change((p) => {
              // the players as changed here; one added meanwhile on another phone stays; one taken out here goes – with his
              // bets and the bets against him (Sascha 04.11.2026: "players cannot be deleted")
              const out = (id: string) => x.removed.includes(id);
              const players = [...x.players.map((q) => editedPlayer(p.players.find((o) => o.id === q.id), q)), ...p.players.filter((q) => !x.players.some((y) => y.id === q.id) && !out(q.id) && !pool.players.some((o) => o.id === q.id))];
              const wagers = p.wagers.filter((w) => !out(w.player) && !(w.opponent && out(w.opponent)));
              const progress = Object.fromEntries(Object.entries(p.progress).filter(([id]) => wagers.some((w) => w.id === id)));
              // what is played for: money keeps `currency` (as phones from before read it), a thing `prize` beside it
              const { prize: _old, ...rest } = p;
              // what is played for changed between money and not money (audit 09.11.2026: 20 $ became "20 × Getränk"): the
              // stakes start again – 20 in money, 1 of a thing or a point; the 5+5+10's parts alike (5/5/10 or 1/1/2)
              const restaked = restake(wagers, isMoney(prizeOf(p)), isMoney(x.prize));
              return { ...rest, wagers: restaked, progress, name: x.name, from: x.from, to: x.to, currency: isMoney(x.prize) ? x.prize.currency : (p.currency ?? 'EUR'), ...(isMoney(x.prize) ? {} : { prize: x.prize }), rounds: x.rounds, counted: x.counted, oneScorer: x.oneScorer, settle: x.settle, players };
            });
            if (ok) {
              setSheet(null);
              void reportWagers(); // other days: other rounds count
            }
          }}
          onDelete={async () => {
            // only marked deleted – the bin of the menu "Bets" brings it back on every phone
            if (await change((p) => ({ ...p, deletedAt: new Date().toISOString() }))) props.onBack();
          }}
        />
      )}
      {sheet && typeof sheet === 'object' && 'whois' in sheet && pool.players.some((x) => x.id === sheet.whois) && (
        <WhoIsSheet code={props.code} pool={pool} player={pool.players.find((x) => x.id === sheet.whois)!} me={entry.me} onClose={() => setSheet(null)} />
      )}
      {sheet === 'finish' && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Finish the pool', 'Pool beenden')} onClick={(e) => e.stopPropagation()}>
            <strong>{tr('Finish the pool now?', 'Pool jetzt beenden?')}</strong>
            <span className="muted">{tr('Open bets count as missed; the settlement is final.', 'Offene Wetten gelten als verloren; die Abrechnung ist endgültig.')}</span>
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                await reportWagers();
                if (await change((p) => ({ ...p, finishedAt: new Date().toISOString() }))) setSheet(null);
              }}
            >
              {tr('Finish & settle', 'Beenden & abrechnen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSheet(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

/** What a bet's standing shows in a cell: the target, then the best – "3/2", "−5/+3", "10/7"; a round not signed
 *  yet with a better figure: that one (shown as provisional). */
export function cellOf(w: Wager, p: Progress | undefined): string {
  return figuresOf(w, p?.pending ?? p?.best ?? null);
}
/** The target, then a figure: "3/2", "−5/+3" – none yet, also a count of 0, a dash (Sascha 08.11.2026: "instead of the
 *  0 I'd prefer the dash"); a score's 0 is "E" and stays. */
export function figuresOf(w: Wager, n: number | null): string {
  const shape = shapeOf(w.kind);
  const par = (x: number) => (x === 0 ? 'E' : x > 0 ? `+${x}` : `−${-x}`);
  const v = (x: number) => (shape === 'score' || shape === 'sum' ? par(x) : String(x));
  // the target first (Sascha 03.11.2026: "8/9, not 9/8")
  const none = n == null || (n === 0 && shape !== 'score' && shape !== 'sum');
  return `${v(w.target)}/${none ? '–' : v(n)}`;
}
/** A bet made in one round – green in its cell: only a bet that holds for each round (Sascha 10.11.2026: "the bets over
 *  7 rounds must not be green in one round") – a sum over several rounds or the whole trip is judged as a whole. */
export const madeInRound = (w: Wager, value: number | null): boolean => value != null && perRoundBet(w) && reached(w, value);
/** A score added up over N rounds, its share of one round (Sascha 10.11.2026: "Erik +35 over 7 rounds – +5 a round"). */
export const shareOf = (w: Wager): number | null => (shapeOf(w.kind) === 'sum' && w.rounds ? w.target / w.rounds : null);
/** A score as the cells write it: "+5", "−1,4", "E". */
export const parText = (x: number): string => {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 'E' : `${v > 0 ? '+' : '−'}${String(Math.abs(v)).replace('.', ',')}`;
};
/** A bet in one round, once it is decided (Sascha 10.11.2026: "a round played – green when made, else red"): 'made',
 *  'missed' – or null while it is played, without a figure, or a bet not of single rounds (the trip as one). A score over
 *  N rounds by its share of the round. */
export function roundVerdict(w: Wager, r: RoundResult | undefined): 'made' | 'missed' | null {
  if (!r || r.value == null) return null;
  const share = shareOf(w);
  if (share != null) return r.open ? null : r.value <= share + 1e-9 ? 'made' : 'missed';
  if (!perRoundBet(w)) return null;
  if (reached(w, r.value) && (!r.open || !lower(w))) return 'made';
  return r.open ? null : 'missed';
}
/** A score over N rounds so far (Sascha 10.11.2026: "in the total the rounds added up – where one stands"): the rounds
 *  played added up, how many of how many; decided once all are played. */
export function sumSoFar(w: Wager, p: Progress | undefined): { sum: number; played: number; of: number; verdict: 'made' | 'missed' | null } | null {
  if (shapeOf(w.kind) !== 'sum' || !w.rounds) return null;
  const done = (p?.perRound ?? []).filter((r) => r.value != null && !r.open).slice(0, w.rounds);
  const sum = done.reduce((a, r) => a + (r.value ?? 0), 0);
  return { sum, played: done.length, of: w.rounds, verdict: done.length < w.rounds ? null : sum <= w.target ? 'made' : 'missed' };
}
/** A bet's target as the cells write it: "3", "−5", "E". */
export const targetOf = (w: Wager): string => figuresOf(w, null).split('/')[0];
/** What a round brought, under the target (Sascha 10.11.2026: "a 0 instead of the dash"): a count's 0 is "0"; a score
 *  not played yet stays a dash (its 0 would read as par). */
export function valueOf(w: Wager, n: number | null, unknown = false): string {
  const shape = shapeOf(w.kind);
  if (n == null) return unknown || shape === 'score' || shape === 'sum' ? '–' : '0';
  return shape === 'score' || shape === 'sum' ? figuresOf(w, n).split('/')[1] : String(n);
}
/** The rounds of a pool's standing – from every bet's rounds, by day and course, oldest first. */
export function standingRounds(pool: Pick<WagerPool, 'progress'> & Partial<Pick<WagerPool, 'wagers' | 'from' | 'to' | 'rounds'>>): { key: string; day: string; course: string }[] {
  const seen = new Map<string, { key: string; day: string; course: string }>();
  // only the bets still in the pool, only rounds that count (Sascha 10.11.2026: "Hetzenhof is in it though it is not
  // there" – the progress of bets deleted and a round outside the trip's rounds)
  const ids = pool.wagers ? new Set(pool.wagers.map((w) => w.id)) : null;
  const counts = (r: { day: string; course: string }) => !pool.from || !pool.to || inPool({ day: r.day, course: r.course }, { from: pool.from, to: pool.to, rounds: pool.rounds });
  for (const [id, p] of Object.entries(pool.progress ?? {})) {
    if (ids && !ids.has(id)) continue;
    for (const r of [...(p?.perRound ?? []), ...(p?.duels ?? [])]) {
      if (!counts(r)) continue;
      const key = `${r.day}|${r.course}`;
      if (!seen.has(key)) seen.set(key, { key, day: r.day, course: r.course });
    }
  }
  return [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}
/** A round's own among the standing's rounds (Sascha 12.11.2026: "the current round at once, not the total"): its course
 *  on its day, else its day's last – not counted yet: the latest round; none: null (the total). */
export function roundNowOf(rs: { key: string; day: string; course: string }[], round: { day: string; course?: string }): string | null {
  const c = (round.course ?? '').trim().toLowerCase();
  const day = rs.filter((r) => r.day === round.day);
  const same = (x: string) => !!c && (x.trim().toLowerCase().includes(c) || c.includes(x.trim().toLowerCase()));
  return (day.find((r) => same(r.course)) ?? day[day.length - 1] ?? rs[rs.length - 1])?.key ?? null;
}
/** The row a bet goes into: the same block, the same counting (birdies on 18, the whole trip, gross, 6 rounds …). */
const rowKey = (w: Wager) => [w.kind, w.scope ?? '', w.holes ?? 18, w.net ? 'net' : '', w.orBetter === false ? 'exact' : '', w.rounds ?? '', w.parts ? `${w.parts.front}+${w.parts.back}+${w.parts.total}` : ''].join('|');
const rowName = (w: Wager) => {
  if (shapeOf(w.kind) === 'duel') return wagerLabel(w); // "5+5+10 brutto"
  const rest = wagerLabel(w).replace(/^[+−-]?\d+\s*/, '');
  // the score's rows: "Ergebnis brutto", "Ergebnis brutto in 6 Runden"
  if (shapeOf(w.kind) === 'score' || shapeOf(w.kind) === 'sum') return `${tr('Score', 'Ergebnis')} ${rest}`;
  return rest.replace(/^(.)/, (c) => c.toUpperCase()) || wagerLabel(w);
};

/** The live standing of a pool (Sascha 01.11.2026: "a kind of live leaderboard of the bets running and where they
 *  stand – a nice matrix"; 02.11.2026: "every bet from the round analysis in the matrix, below only the free bets, with
 *  a heading"): the blocks down, the players across, each cell the best against the target – made green, missed struck
 *  through; a bet against one player says against whom, a "5+5+10" stands with both, each with his money. */
export function Standings(props: { pool: WagerPool; today: string; me: string; /** spectators without the money: a "5+5+10" only who is ahead */ noMoney?: boolean; /** in a round's leaderboard: this round shown first, not the total (Sascha 12.11.2026) – else the latest */ round?: { day: string; course?: string } }) {
  const { pool } = props;
  // "Gesamt" (null) or one round (Sascha 08.11.2026: "a bet holds for one round – an overview over all rounds for a
  // total, and then per round")
  // opened from a round (Sascha 11.11.2026: "it jumps to the total – it should be the round, Erik's in Kissimmee")
  // this round of the round's leaderboard among the pool's – its course on its day, else its day; not counted yet: the latest
  const roundNow = (): string | null => (props.round ? roundNowOf(standingRounds(pool), props.round) : null);
  const [picked, setPicked] = useState(false);
  const [shown, setShown] = useState<string | null>(() => {
    try {
      const d = sessionStorage.getItem('golfos.openPoolDay');
      if (d) return standingRounds(pool).find((r) => r.day === d)?.key ?? null;
      // in a round's leaderboard (Sascha 12.11.2026: "the current round at once, not the total"): this round – its
      // course on its day, else its day – and before it counts anywhere, the latest
      return props.round ? roundNow() : null;
    } catch {
      return null;
    }
  });
  // taken once shown (read above, not there: the first look may run twice)
  useEffect(() => {
    try {
      sessionStorage.removeItem('golfos.openPoolDay');
    } catch {
      /* nothing kept */
    }
  }, []);
  const roundsShown = standingRounds(pool);
  // the round coming into the standing once its first scores count – followed until a round is picked by hand
  const now = picked ? null : roundNow();
  useEffect(() => {
    if (now && now !== shown) setShown(now);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  // a round played to its end (Sascha 10.11.2026: "a round played – make it recognisable"): its chip with a tick
  const ids = new Set(pool.wagers.map((w) => w.id));
  const played = new Set(Object.entries(pool.progress ?? {}).flatMap(([id, p]) => (ids.has(id) ? (p?.perRound ?? []).filter((r) => r.value != null && !r.open).map((r) => `${r.day}|${r.course}`) : [])));
  const one = roundsShown.find((r) => r.key === shown) ?? null;
  const name = (id?: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  const grid = pool.wagers.filter((w) => w.kind !== 'free');
  const lines = pool.wagers.filter((w) => w.kind === 'free');
  const rows: { key: string; name: string; cells: Record<string, { w: Wager; against: boolean }[]> }[] = [];
  for (const w of grid) {
    let r = rows.find((x) => x.key === rowKey(w));
    if (!r) rows.push((r = { key: rowKey(w), name: rowName(w), cells: {} }));
    (r.cells[w.player] ??= []).push({ w, against: false });
    // "5+5+10": the opponent's side too – what he won or lost
    if (shapeOf(w.kind) === 'duel' && w.opponent && w.opponent !== w.player) (r.cells[w.opponent] ??= []).push({ w, against: true });
  }
  // a player's "5+5+10"s in one cell: his money from all of them – against one: whom, against several: how many
  const duels = (cs: { w: Wager; against: boolean }[]) => {
    if (!cs.length) return null;
    const amount = cs.reduce((sum, { w, against }) => sum + (pool.progress[w.id]?.amount ?? 0) * (against ? -1 : 1), 0);
    const vs = cs.map(({ w, against }) => name(against ? w.player : w.opponent));
    return (
      <span className={`bet-cell duel${amount > 0 ? ' up' : amount < 0 ? ' down' : ''}`} title={vs.join(', ')}>
        {props.noMoney ? (amount > 0 ? tr('ahead', 'vorn') : amount < 0 ? tr('behind', 'hinten') : tr('level', 'gleich')) : amount ? `${amount > 0 ? '+' : '−'}${money(Math.abs(amount), prizeSym(prizeOf(pool)))}` : '±0'}
        <small>{vs.length === 1 ? tr(`vs ${vs[0]}`, `gg. ${vs[0]}`) : tr(`${vs.length} opponents`, `${vs.length} Gegner`)}</small>
      </span>
    );
  };
  // the total (Sascha 09.11.2026: "every bet holds for each round on its own – the total shows how often it was made over
  // all rounds"; 10.11.2026: "the target on top in bold, without the word 'Ziel', below how far it is made: 0/1"):
  // green once made, no "provisional"
  const cell = ({ w }: { w: Wager; against: boolean }) => {
    // no round reported yet: "–" with its target, as the bets per round show it
    // only the rounds the bet counts (Sascha 11.11.2026: a round left out of it is not in its total)
    const t = tally(w, progressOf(pool, w)) ?? (perRoundBet(w) && !pool.progress[w.id] ? { made: 0, missed: 0, played: 0 } : null);
    if (t)
      return (
        <span key={w.id} className={`bet-cell ${t.made ? 'done' : 'open'}`} title={wagerLabel(w)} aria-label={tr(`target ${targetOf(w)}: made in ${t.made} of ${t.played} rounds`, `Ziel ${targetOf(w)}: in ${t.made} von ${t.played} Runden geschafft`)}>
          <strong>{targetOf(w)}</strong>
          <small className="bet-made">{`${t.made}/${t.played}`}</small>
          {w.payout === 'opponent' && w.opponent && <small>{tr(`vs ${name(w.opponent)}`, `gg. ${name(w.opponent)}`)}</small>}
        </span>
      );
    const s = sumSoFar(w, progressOf(pool, w));
    if (s)
      return (
        <span key={w.id} className={`bet-cell ${s.verdict === 'made' ? 'done' : s.verdict === 'missed' ? 'miss' : 'open'}`} title={wagerLabel(w)}>
          <strong>{targetOf(w)}</strong>
          <small className="bet-made">{s.played ? `${parText(s.sum)} · ${s.played}/${s.of}` : '–'}</small>
          {w.payout === 'opponent' && w.opponent && <small>{tr(`vs ${name(w.opponent)}`, `gg. ${name(w.opponent)}`)}</small>}
        </span>
      );
    return (
      <span key={w.id} className={`bet-cell ${state(w) === 'done' || provisional(w, pool.progress[w.id]) ? 'done' : state(w)}`} title={wagerLabel(w)}>
        <strong>{targetOf(w)}</strong>
        <small className="bet-made">{valueOf(w, pool.progress[w.id]?.pending ?? pool.progress[w.id]?.best ?? null)}</small>
        {w.payout === 'opponent' && w.opponent && <small>{tr(`vs ${name(w.opponent)}`, `gg. ${name(w.opponent)}`)}</small>}
      </span>
    );
  };
  // one round: each bet as it went in that round – made green, else its figure; no figure from that round: a dash
  const roundCell = ({ w }: { w: Wager; against: boolean }) => {
    const r = pool.progress[w.id]?.perRound?.find((x) => `${x.day}|${x.course}` === one!.key);
    const verdict = roundVerdict(w, r);
    const share = shareOf(w);
    return (
      <span key={w.id} className={`bet-cell ${verdict === 'made' ? 'done' : verdict === 'missed' ? 'miss' : 'open'}`} title={wagerLabel(w)}>
        {/* a round's share of a total in whole strokes (Sascha 12.11.2026: "18,2 does not work – only whole strokes") */}
        <strong>{share != null ? parText(Math.round(share)) : targetOf(w)}</strong>
        <small className="bet-made" title={r?.unknown ? tr('not entered (putts missing)', 'nicht erfasst (Putts fehlen)') : undefined}>{valueOf(w, r?.value ?? null, !!r?.unknown)}</small>
        {w.payout === 'opponent' && w.opponent && <small>{tr(`vs ${name(w.opponent)}`, `gg. ${name(w.opponent)}`)}</small>}
      </span>
    );
  };
  // a "5+5+10" in one round: who won it (front, back and total in that round)
  const roundDuels = (cs: { w: Wager; against: boolean }[]) =>
    cs.map(({ w, against }) => {
      const d = pool.progress[w.id]?.duels?.find((x) => `${x.day}|${x.course}` === one!.key);
      const t = d?.total == null ? null : d.total * (against ? -1 : 1);
      return (
        <span key={w.id + String(against)} className={`bet-cell duel${t != null && t > 0 ? ' up' : t != null && t < 0 ? ' down' : ''}`}>
          {t == null ? '–' : t > 0 ? tr('won', 'gewonnen') : t < 0 ? tr('lost', 'verloren') : tr('halved', 'geteilt')}
          <small>{tr(`vs ${name(against ? w.player : w.opponent)}`, `gg. ${name(against ? w.player : w.opponent)}`)}</small>
        </span>
      );
    });
  const players = pool.players.filter((p) => pool.wagers.some((w) => w.player === p.id || w.opponent === p.id));
  // one round: only the bets that round counts for (Sascha 12.11.2026: "bets in there that do not belong") – a 5+5+10 of
  // another day, a total over n rounds this round is not part of; the others as ever
  const inRound = (w: Wager): boolean => {
    if (!one) return true;
    const p = pool.progress[w.id];
    if (shapeOf(w.kind) === 'duel') return !!p?.duels?.some((x) => `${x.day}|${x.course}` === one.key);
    if (shapeOf(w.kind) === 'sum') return !!p?.perRound?.some((x) => `${x.day}|${x.course}` === one.key && x.value != null);
    return true;
  };
  const rowsShown = rows
    .map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).map(([id, cs]) => [id, cs.filter(({ w }) => inRound(w))])) }))
    .filter((r) => Object.values(r.cells).some((cs) => cs.length));
  if (!pool.wagers.length) return null;
  const state = (w: Wager) => stateOf(w, pool, props.today);
  return (
    <section className="card pool-standings" aria-label={tr('Standing of the bets', 'Stand der Wetten')}>
      <div className="pool-settle-head">
        <h2>{tr('Standing', 'Stand')}</h2>
        <span className="muted small">{tr('live from the rounds', 'live aus den Runden')}</span>
      </div>
      {/* the total, then each round – as the series' rounds (Sascha 08.11.2026) */}
      {rows.length > 0 && roundsShown.length > 0 && (
        <StepPick<string>
          label={tr('Rounds', 'Runden')}
          value={one?.key ?? ''}
          onChange={(v) => {
            setPicked(true);
            setShown(v || null);
          }}
          options={[
            { value: '', name: tr('Total', 'Gesamt'), text: tr('all rounds', 'alle Runden') },
            // no tick – only rounds played or in play are there (Sascha 11.11.2026); "läuft" for one in play
            ...roundsShown.map((r) => ({ value: r.key, name: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}. ${r.course}`, text: played.has(r.key) ? undefined : tr('in play', 'läuft') })),
          ]}
        />
      )}
      {rows.length > 0 && (
        <div className="matrix-wrap">
          {/* four players fit the phone's width – more than four: scrolled sideways (Sascha 02.11.2026) */}
          <table className="bet-matrix" style={players.length > 4 ? { minWidth: 96 + players.length * 72 } : undefined}>
            <thead>
              <tr>
                <th scope="col" />
                {players.map((p) => (
                  <th key={p.id} scope="col" className={p.id === props.me ? 'me' : ''}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsShown.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.name}</th>
                  {players.map((p) => (
                    <td key={p.id}>
                      {one ? (r.key.startsWith('nassau|') ? roundDuels(r.cells[p.id] ?? []) : (r.cells[p.id] ?? []).map(roundCell)) : r.key.startsWith('nassau|') ? duels(r.cells[p.id] ?? []) : (r.cells[p.id] ?? []).map(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > 0 && (
        <div className="bet-free" aria-label={tr('Free bets', 'Freie Wetten')} role="group">
          <span className="eyebrow">{tr('Free bets – decided by the host', 'Freie Wetten – entscheidet der Host')}</span>
          <ul className="bet-lines">
            {lines.map((w) => (
              <li key={w.id}>
                <span className="grow">
                  <strong>{name(w.player)}</strong>
                  {w.opponent && <span className="muted"> {tr('vs', 'gegen')} {name(w.opponent)}</span>}
                  <span className="muted small"> · {wagerLabel(w)}</span>
                </span>
                <span className={`bet-cell ${state(w)}`}>{state(w) === 'done' ? '✓' : state(w) === 'missed' ? '✗' : '…'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The settlement of a pool (Sascha 01.11.2026: "the settlement must look quite different – with zero euros too"): how
 *  far the bets are decided, where each player stands – from the start, at 0 – and who pays whom. */
function Settlement(props: { pool: WagerPool; bal: Record<string, number>; lines: Record<string, LedgerLine[]>; debts: Debt[]; owed: Owed[]; settled: number; pending: number; me: string; name: (id?: string) => string; children?: React.ReactNode }) {
  const { pool, bal } = props;
  const sym = prizeSym(prizeOf(pool));
  const n = pool.wagers.length;
  const rows = [...pool.players].sort((a, b) => (bal[b.id] ?? 0) - (bal[a.id] ?? 0));
  const most = Math.max(1, ...rows.map((p) => Math.abs(bal[p.id] ?? 0)));
  const signed = (v: number) => (Math.abs(v) < 0.005 ? money(0, sym) : `${v > 0 ? '+' : '−'}${money(Math.abs(v), sym)}`);
  return (
    <section className="card pool-settle" aria-label={tr('Settlement', 'Abrechnung')}>
      <div className="pool-settle-head">
        <h2>{tr('Settlement', 'Abrechnung')}</h2>
        <span className="muted small">
          {tr(`${props.settled} of ${n} bets decided`, `${props.settled} von ${n} Wetten entschieden`)}
          {props.pending > 0 && tr(` · ${props.pending} provisional`, ` · ${props.pending} vorläufig`)}
        </span>
      </div>
      <div className="pool-progress" role="progressbar" aria-label={tr('Bets decided', 'Wetten entschieden')} aria-valuemin={0} aria-valuemax={n} aria-valuenow={props.settled}>
        <i style={{ width: `${n ? (props.settled / n) * 100 : 0}%` }} />
      </div>
      <ul className="pool-standing" aria-label={tr('Where everyone stands', 'Stand je Spieler')}>
        {rows.map((p) => {
          const v = bal[p.id] ?? 0;
          const w = `${(Math.abs(v) / most) * 50}%`;
          return (
            <li key={p.id}>
              <span className="pool-standing-name">
                {p.name}
                {p.id === props.me && <span className="muted small"> · {tr('you', 'du')}</span>}
              </span>
              <span className="pool-bar" aria-hidden="true">
                {Math.abs(v) >= 0.005 && <i className={v > 0 ? 'up' : 'down'} style={v > 0 ? { left: '50%', width: w } : { right: '50%', width: w }} />}
              </span>
              <strong className={v > 0.004 ? 'good-text' : v < -0.004 ? 'bad-text' : 'muted'}>{signed(v)}</strong>
              {/* each bet on its own – what it brought or cost (Sascha 02.11.2026: "0 € – but I made my bet") */}
              {(props.lines[p.id] ?? []).length > 0 && (
                <ul className="pool-ledger">
                  {(props.lines[p.id] ?? []).map((l) => (
                    <li key={l.w.id}>
                      <span className="grow">
                        {l.w.player === p.id ? wagerLabel(l.w) : `${props.name(l.w.player)}: ${wagerLabel(l.w)}`}
                        {/* a duel of his: against whom (Sascha 11.11.2026: "the 5+5+10 lacks against whom") */}
                        {l.w.player === p.id && shapeOf(l.w.kind) === 'duel' && l.w.opponent && tr(` against ${props.name(l.w.opponent)}`, ` gegen ${props.name(l.w.opponent)}`)}
                        {l.provisional && <span className="muted"> · {tr('provisional', 'vorläufig')}</span>}
                        {l.w.player === p.id && shapeOf(l.w.kind) !== 'duel' && <WhoPays owed={props.owed} w={l.w} me={p.id} name={props.name} sym={sym} />}
                      </span>
                      <span className={l.amount > 0 ? 'good-text' : l.amount < 0 ? 'bad-text' : 'muted'}>{signed(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {/* how "Wer zahlt wem" comes about (Sascha 10.11.2026: "the app may set off – the way must be shown and traceable") */}
      {props.owed.length > 0 && setsOff(prizeOf(pool)) && (
        <SettingsList>
          <SheetRow label={tr('How it is worked out', 'Rechenweg')} value={wayText(pool, props.owed, props.debts)}>
            <SettleWay pool={pool} owed={props.owed} debts={props.debts} name={props.name} sym={sym} />
          </SheetRow>
        </SettingsList>
      )}
      {/* "Wer zahlt wem" with what was paid – PaidMarks */}
      {props.children}
    </section>
  );
}

/** Whom a player's own bet brought money from – or cost money to (Sascha 11.11.2026: "Erik's 80 – from whom does he get
 *  it"): "von Chris, Cedric, Moritz, Sascha – je 20 $". */
function WhoPays(props: { owed: Owed[]; w: Wager; me: string; name: (id?: string) => string; sym: string }) {
  const mine = props.owed.filter((o) => o.w.id === props.w.id && (o.to === props.me || o.from === props.me));
  if (!mine.length) return null;
  const m = (v: number) => money(Math.round(v * 100) / 100, props.sym);
  const part = (list: Owed[], word: string, other: (o: Owed) => string) => {
    if (!list.length) return '';
    const same = list.every((o) => Math.abs(o.amount - list[0].amount) < 0.005);
    return same && list.length > 1
      ? `${word} ${list.map((o) => props.name(other(o))).join(', ')} – ${tr('each', 'je')} ${m(list[0].amount)}`
      : `${word} ${list.map((o) => `${props.name(other(o))} ${m(o.amount)}`).join(', ')}`;
  };
  const text = [part(mine.filter((o) => o.to === props.me), tr('from', 'von'), (o) => o.from), part(mine.filter((o) => o.from === props.me), tr('to', 'an'), (o) => o.to)].filter(Boolean).join(' · ');
  return <span className="muted small pool-ledger-who">{text}</span>;
}

/** Does the pool settle in money owed between players – "Abrechnung" and "Rechenweg" mean something (not a meal the
 *  loser pays, not for the honour). */
const setsOff = (p: Prize | null): boolean => !p || (!isNone(p) && whoOf(p) === 'each');

/** "3 Schulden → 2 Zahlungen" – or, one by one, "3 Zahlungen". */
function wayText(pool: WagerPool, owed: Owed[], debts: Debt[]): string {
  const pay = (n: number) => tr(`${n} ${n === 1 ? 'payment' : 'payments'}`, `${n} ${n === 1 ? 'Zahlung' : 'Zahlungen'}`);
  if (pool.settle === 'single') return pay(debts.length);
  return `${tr(`${owed.length} ${owed.length === 1 ? 'debt' : 'debts'}`, `${owed.length} ${owed.length === 1 ? 'Schuld' : 'Schulden'}`)} → ${pay(debts.length)}`;
}

/** "Abrechnung" of the pool (Sascha 10.11.2026: "set off – or settled one by one; as the other settings"; 11.11.2026:
 *  set off only between the same two). */
function SettleRow(props: { value: 'net' | 'single'; onChange: (v: 'net' | 'single') => void }) {
  return (
    <ChoiceRow<'net' | 'single'>
      label={tr('Settlement', 'Abrechnung')}
      value={props.value}
      onChange={props.onChange}
      options={[
        { value: 'net', name: tr('Set off', 'Verrechnet'), text: tr('What two owe each other is set off – one payment between them; the way it is worked out is shown.', 'Was sich zwei gegenseitig schulden, wird gegeneinander verrechnet – eine Zahlung zwischen den beiden; der Rechenweg wird gezeigt.') },
        { value: 'single', name: tr('One by one', 'Einzeln'), text: tr('Nothing set off – each pays what he owes, also when the other owes him something.', 'Nichts verrechnet – jeder zahlt, was er schuldet, auch wenn der andere ihm etwas schuldet.') },
      ]}
    />
  );
}

/** The way the settlement is worked out (Sascha 10./11.11.2026: "traceable"; "±0 only when Chris gets 20 from Sascha
 *  and Sascha 20 from Chris"; "grouped per person – under Sascha: Sascha owes Erik 20, Chris X"): per player, what he owes
 *  whom for which bet – set off, what he gets back from the same one – and what he pays in the end. */
function SettleWay(props: { pool: WagerPool; owed: Owed[]; debts: Debt[]; name: (id?: string) => string; sym: string }) {
  const { pool, owed, debts, name, sym } = props;
  const m = (v: number) => money(Math.round(v * 100) / 100, sym);
  // a bet in words: whose it is, unless it is a duel – then its name
  const why = (o: Owed) => (shapeOf(o.w.kind) === 'duel' ? wagerLabel(o.w) : `${name(o.w.player)}: ${wagerLabel(o.w)}`);
  const single = pool.settle === 'single';
  const blocks = pool.players
    .map((p) => {
      const outs = owed.filter((o) => o.from === p.id);
      // set off: what he gets back from those he owes
      const backs = single ? [] : owed.filter((o) => o.to === p.id && outs.some((x) => x.to === o.from));
      const pays = debts.filter((d) => d.from === p.id).reduce((s, d) => s + d.amount, 0);
      return { p, outs, backs, pays };
    })
    .filter((x) => x.outs.length);
  // per one he owes: what is left between the two once set off
  const left = (p: string, q: string) => owed.filter((o) => o.from === p && o.to === q).reduce((s, o) => s + o.amount, 0) - owed.filter((o) => o.from === q && o.to === p).reduce((s, o) => s + o.amount, 0);
  return (
    <div className="settle-way">
      <ul className="settle-debts">
        {blocks.map(({ p, outs, backs, pays }) => {
          const others = [...new Set(backs.map((o) => o.from))];
          return (
            <li key={p.id}>
              <span className="grow">
                <strong>{p.name}</strong>
                {outs.map((o, k) => (
                  <span key={`o${k}`} className="small settle-why">
                    {tr(`owes ${name(o.to)} ${m(o.amount)}`, `schuldet ${name(o.to)} ${m(o.amount)}`)}
                    <span className="muted"> · {why(o)}</span>
                  </span>
                ))}
                {backs.map((o, k) => (
                  <span key={`b${k}`} className="small settle-why">
                    {tr(`gets ${m(o.amount)} from ${name(o.from)}`, `bekommt ${m(o.amount)} von ${name(o.from)}`)}
                    <span className="muted"> · {why(o)}</span>
                  </span>
                ))}
                {others.map((q) => {
                  const v = left(p.id, q);
                  return (
                    <span key={`n${q}`} className="small settle-result">
                      {Math.abs(v) < 0.005
                        ? tr(`set off with ${name(q)}: all in all ±0`, `mit ${name(q)} verrechnet: unterm Strich ±0`)
                        : v > 0
                          ? tr(`set off with ${name(q)}: pays ${m(v)}`, `mit ${name(q)} verrechnet: zahlt ${m(v)}`)
                          : tr(`set off with ${name(q)}: gets ${m(-v)}`, `mit ${name(q)} verrechnet: bekommt ${m(-v)}`)}
                    </span>
                  );
                })}
              </span>
              <strong className="settle-sum">{pays > 0.004 ? tr(`pays ${m(pays)}`, `zahlt ${m(pays)}`) : tr('pays nothing', 'zahlt nichts')}</strong>
            </li>
          );
        })}
      </ul>
      <span className="muted small">
        {single
          ? tr('One by one: nothing set off – what was paid already is off.', 'Einzeln: nichts verrechnet – bereits Bezahltes ist abgezogen.')
          : tr('Set off between the same two only – nobody pays for a third. What was paid already is off.', 'Verrechnet wird nur zwischen denselben zwei – niemand zahlt für einen Dritten. Bereits Bezahltes ist abgezogen.')}
      </span>
    </div>
  );
}

// ---------- one bet ----------

/** "Score-Erfassung" of the whole pool (Sascha 02.11.2026) – every bet of it counts so; a row "Wer erfasst ›" with its
 *  sheet, as in "Neue Runde" and "Neues Turnier" (Sascha 04.11.2026: "the score entry as in the rest of the app"). */
export type ScoreEntry = 'own' | 'marker' | 'one';
export const entryOf = (p: { counted?: boolean; oneScorer?: boolean }): ScoreEntry => (!p.counted ? 'own' : p.oneScorer ? 'one' : 'marker');
/** "Wer erfasst" of the whole pool – the three ways of Rounds and the tournaments (Sascha 04.11.2026: "one for all
 *  missing"); "Mit Zähler" and "Einer für alle" both count only marked, signed rounds. */
function CountedSwitch(props: { value: ScoreEntry; onChange: (v: ScoreEntry) => void }) {
  return (
    <>
      <SettingsList>
        <ChoiceRow<ScoreEntry>
          label={tr('Who enters', 'Wer erfasst')}
          value={props.value}
          onChange={props.onChange}
          options={[
            { value: 'own', name: tr('Everyone his own', 'Jeder seinen eigenen'), text: tr('Every round counts as the player entered it – nobody marks.', 'Jede Runde zählt so, wie der Spieler sie erfasst hat – ohne Zähler.') },
            { value: 'marker', name: tr('With a marker', 'Mit Zähler'), text: tr("Everyone enters his own score and his partner's – a round counts once the card is signed.", 'Jeder trägt seinen Score und den seines Partners ein – eine Runde zählt, sobald die Karte unterschrieben ist.') },
            { value: 'one', name: tr('One for all', 'Einer für alle'), text: tr('One player per flight keeps the score of all and marks everyone.', 'Ein Spieler je Flight erfasst die Scores aller und zählt alle.') },
          ]}
        />
      </SettingsList>
      {/* no hint under it (Sascha 04.11.2026) – what each way means is in its sheet */}
    </>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

/** A choice as a row with its sheet, where the bets had chip groups (Sascha 02.11.2026: "as Format in the round
 *  settings" – docs/DESIGN.md); inside a `SettingsList`. */
function Pick<T>(props: { label: string; value: T | null | undefined; onChange: (v: T) => void; options: { value: T; label: string; text?: string }[]; prompt?: string }) {
  return <ChoiceRow<T> label={props.label} options={props.options.map((o) => ({ value: o.value, name: o.label, text: o.text }))} value={props.value as T} onChange={props.onChange} prompt={props.prompt} />;
}

/** An own bet, built (Sascha 02.11.2026): what is counted, at least or at most, the number, on which holes, in a row. */
function CustomFields(props: { w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { w, set } = props;
  const m = metricOf(w.metric);
  const [holes, setHoles] = useState((w.holesOf ?? []).join(', '));
  return (
    <>
      <SettingsList>
        <Pick<Metric>
          label={tr('What counts', 'Was zählt')}
          value={m.id}
          onChange={(v) => set({ metric: v, ...(metricOf(v).sum ? { run: false } : {}), ...(v === 'strokes' ? { compare: 'max' as const, target: Math.min(w.target, 5) } : {}) })}
          options={METRICS.map((x) => ({ value: x.id, label: x.one(), text: x.details ? tr('needs the detail entry', 'braucht die Detailerfassung') : undefined }))}
        />
        {m.id !== 'strokes' && !w.run && (
          <Pick<'min' | 'max'>
            label={tr('Condition', 'Bedingung')}
            value={w.compare ?? 'min'}
            onChange={(v) => set({ compare: v })}
            options={[
              { value: 'min', label: tr('At least', 'Mindestens'), text: tr('The number or more', 'Die Zahl oder mehr') },
              { value: 'max', label: tr('At most', 'Höchstens'), text: tr('The number or fewer', 'Die Zahl oder weniger') },
            ]}
          />
        )}
        <Pick<Where> label={tr('Where', 'Wo')} value={w.where ?? 'all'} onChange={(v) => set({ where: v })} options={WHERES.map((x) => ({ value: x.id, label: x.name() }))} />
        {/* with the others of the bet (Sascha 03.11.2026: "these settings all belong together") */}
        {!m.sum && <ToggleRow inList on={!!w.run} label={tr('In a row', 'In Folge')} text={tr('Holes one after the other', 'Löcher hintereinander')} onChange={(on) => set({ run: on, ...(on ? { compare: 'min' as const } : {}) })} />}
      </SettingsList>
      <Field label={m.id === 'strokes' ? tr('To par, at most', 'Zu Par, höchstens') : tr('Number', 'Zahl')}>
        <Stepper label={tr('Number', 'Zahl')} value={w.target} min={m.id === 'strokes' ? -18 : 0} onChange={(v) => set({ target: v })} />
      </Field>
      {w.where === 'holes' && (
      <Field label={tr('The holes', 'Die Löcher')}>
        {(
          <input
            className="input"
            inputMode="numeric"
            required
            aria-label={tr('The holes', 'Die Löcher')}
            placeholder={tr('e.g. 7, 12', 'z. B. 7, 12')}
            value={holes}
            onChange={(e) => {
              setHoles(e.target.value);
              set({ holesOf: [...new Set(e.target.value.split(/[^0-9]+/).map(Number).filter((n) => n >= 1 && n <= 36))] });
            }}
          />
        )}
      </Field>
      )}
      <span className="muted small">
        {m.details ? tr('Needs the detail entry (putts, tee shot, sand) – the app asks for it where this bet counts.', 'Braucht die Detailerfassung (Putts, Abschlag, Sand) – die App fragt sie ab, wo diese Wette zählt.') : tr('The strokes incl. penalty strokes are enough.', 'Die Schläge inkl. Strafschläge genügen.')}
      </span>
    </>
  );
}
const CUSTOM_START: Partial<Wager> = { metric: 'birdie', compare: 'min', where: 'all', target: 2, run: false };
/** An own bet as it is kept for the library – and back. */
const myBetOf = (w: Wager): MyBet['bet'] => ({ metric: w.metric ?? 'birdie', compare: w.compare ?? 'min', where: w.where ?? 'all', holesOf: w.where === 'holes' ? (w.holesOf ?? []) : undefined, run: !!w.run, target: w.target });

/** "+ Eigene Wette bauen" in the library: built, kept in "Eigene Wetten". */
function CustomBetSheet(props: { onDone: (b: MyBet) => void; onClose: () => void }) {
  const [w, setW] = useState<Wager>({ id: 'x', player: '', kind: 'custom', stake: 0, payout: 'success', attempts: 'any', target: 2, ...CUSTOM_START });
  const ok = w.where !== 'holes' || !!w.holesOf?.length;
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Build an own bet', 'Eigene Wette bauen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Build an own bet', 'Eigene Wette bauen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <CustomFields w={w} set={(patch) => setW({ ...w, ...patch })} />
        <strong className="custom-preview">{wagerLabel(w)}</strong>
        <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onDone(keepMyBet(myBetOf(w)))}>
          {tr('Keep in "Own bets"', 'In „Eigene Wetten“ speichern')}
        </button>
      </section>
    </div>
  );
}

/** Stake, payout and attempts – the same for one bet and for the template. */
function PayFields(props: { pool: WagerPool; w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { pool, w, set } = props;
  const duel = shapeOf(w.kind) === 'duel';
  return (
    <>
      <SettingsList>
        {/* the stake as a game's (Rounds 02.11.2026: the shared StakePicker) – a bet's larger amounts */}
        {!duel && !isNone(prizeOf(pool)) && (
          <StakeRow label={tr('Stake', 'Einsatz')} stakes={prizeStakes(prizeOf(pool), [5, 10, 20, 50, 100])} sym={prizeSym(prizeOf(pool))} value={w.stake} onChange={(v) => set({ stake: v })} />
        )}
        {!duel && (
          <Pick<Payout>
            label={tr('Paid', 'Auszahlung')}
            value={w.payout}
            onChange={(v) => set({ payout: v })}
            options={[
              { value: 'success', label: tr('When made', 'Bei Erfolg'), text: tr('Made: everyone pays him the stake. Missed: nothing.', 'Geschafft: Jeder zahlt ihm den Einsatz. Verpasst: nichts.') },
              { value: 'both', label: tr('Both ways', 'Beidseitig'), text: tr('Made: everyone pays him. Missed: he pays everyone.', 'Geschafft: Jeder zahlt ihm. Verpasst: Er zahlt jedem.') },
              { value: 'opponent', label: tr('Against one player', 'Gegen einen Spieler'), text: tr('Only between him and the one chosen.', 'Nur zwischen ihm und dem Gewählten.') },
            ]}
          />
        )}
        {w.payout === 'opponent' && !duel && (
          <Pick<string> label={tr('Against', 'Gegen')} prompt={tr('Choose an opponent', 'Gegner wählen')} value={w.opponent ?? null} onChange={(v) => set({ opponent: v })} options={pool.players.filter((p) => p.id !== w.player).map((p) => ({ value: p.id, label: p.name }))} />
        )}
        {/* which rounds count (Sascha 01.11.2026: every round, or one of the trip's / one day; 10.11.2026: "built so that
            other ways can be set too" – a span of days, or the days chosen) */}
        {w.kind !== 'free' && (
          <Pick<Which>
            label={tr('Which rounds', 'Welche Runden')}
            value={whichOf(w)}
            onChange={(v) =>
              set({
                attempts: v === 'range' || v === 'days' ? 'any' : v,
                from: v === 'range' ? (w.from ?? pool.from) : undefined,
                until: v === 'range' ? (w.until ?? pool.to) : undefined,
                picks: v === 'days' ? (w.picks ?? []) : undefined,
                ...(v === 'day' && !w.day ? { day: pool.from } : {}),
                ...(v === 'round' && !w.round ? { round: pool.rounds?.[0]?.id } : {}),
              })
            }
            options={[
              { value: 'any', label: duel ? tr('Every round together', 'Jede gemeinsame Runde') : tr('Every round', 'Jede Runde'), text: tr('Every round of the pool counts.', 'Jede Runde des Pools zählt.') },
              { value: 'range', label: tr('From – to', 'Von – bis'), text: tr('The rounds from one day up to another – e.g. from today on.', 'Die Runden von einem Tag bis zu einem anderen – z. B. ab heute.') },
              { value: 'days', label: tr('Rounds chosen', 'Ausgewählte Runden'), text: tr('Only the rounds ticked – of the trip, the tournaments, those played, or one made here.', 'Nur die angehakten Runden – der Reise, der Turniere, schon gespielte oder selbst angelegte.') },
              ...(pool.rounds?.length
                ? [{ value: 'round' as const, label: tr('Only one round', 'Nur eine Runde'), text: tr('Only the round chosen below counts.', 'Nur die gewählte Runde zählt.') }]
                : [{ value: 'day' as const, label: duel ? tr('Only one day', 'Nur ein Tag') : tr('Only one day', 'Nur an einem Tag'), text: tr('Only the rounds of the day chosen below count.', 'Nur die Runden des gewählten Tages zählen.') }]),
            ]}
          />
        )}
        {w.kind !== 'free' && w.attempts === 'day' && <DateRow label={tr('Day', 'Tag')} min={pool.from} max={pool.to} value={w.day ?? pool.from} onChange={(d) => set({ day: d })} />}
        {w.kind !== 'free' && whichOf(w) === 'range' && (
          <>
            <DateRow label={tr('From', 'Ab')} min={pool.from} max={w.until ?? pool.to} value={w.from ?? pool.from} onChange={(d) => set({ from: d })} />
            <DateRow label={tr('Up to', 'Bis')} min={w.from ?? pool.from} max={pool.to} value={w.until ?? pool.to} onChange={(d) => set({ until: d })} />
          </>
        )}
        {w.kind !== 'free' && whichOf(w) === 'days' && (
          // a score over n rounds: exactly n chosen (Sascha 11.11.2026: "6 rounds set – then I cannot choose only 4")
          <SheetRow label={tr('Rounds', 'Runden')} value={picksText(w)}>
            <PickRounds pool={pool} picks={w.picks ?? []} need={w.kind === 'scoreSum' ? (w.rounds ?? 6) : undefined} onChange={(picks) => set({ picks })} />
          </SheetRow>
        )}
        {w.kind !== 'free' && w.attempts === 'round' && !!pool.rounds?.length && (
          <Pick<string> label={tr('The round', 'Die Runde')} value={w.round ?? pool.rounds[0].id} onChange={(v) => set({ round: v })} options={pool.rounds.map((x) => ({ value: x.id, label: roundLabel(x) }))} />
        )}
      </SettingsList>
    </>
  );
}

type Which = 'any' | 'range' | 'days' | 'day' | 'round';
/** Which rounds a bet counts, as the row shows it. */
const whichOf = (w: Wager): Which => (w.attempts !== 'any' ? w.attempts : w.picks ? 'days' : w.from || w.until ? 'range' : 'any');

/** The rounds a bet may count, to tick (Sascha 10.11.2026: "rounds chosen or made, not limited"): the trip's, the
 *  tournaments of the pool's days, the rounds played already – and one made here: a day, every round of it. */
/** The tournaments as rounds a bet can count. */
const tourChoices = (): BetRound[] => loadTours().flatMap((e) => (!e.ev.deletedAt && e.ev.date ? [{ day: e.ev.date, course: e.ev.course.name, ...(e.ev.course.id ? { courseId: e.ev.course.id } : {}) }] : []));
/** "Sa 07.11." – short, the row in one line (Sascha 11.11.2026). */
const shortDay = (d: string) => `${new Date(`${d}T12:00:00`).toLocaleDateString(tr('en-GB', 'de-DE'), { weekday: 'short' }).replace('.', '')} ${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** "4 ausgewählt" – over n rounds "4 von 6 ausgewählt – noch 2". */
function picksText(w: Wager): string {
  const n = w.picks?.length ?? 0;
  if (w.kind === 'scoreSum') {
    const need = w.rounds ?? 6;
    return n === need ? tr(`${n} of ${need} chosen`, `${n} von ${need} ausgewählt`) : n < need ? tr(`${n} of ${need} chosen – ${need - n} to go`, `${n} von ${need} ausgewählt – noch ${need - n}`) : tr(`${n} chosen – only ${need} count`, `${n} ausgewählt – nur ${need} zählen`);
  }
  return n ? tr(`${n} chosen`, `${n} ausgewählt`) : tr('none yet', 'noch keine');
}

function PickRounds(props: { pool: WagerPool; picks: BetRound[]; /** a score over n rounds: n to choose, no more */ need?: number; onChange: (p: BetRound[]) => void }) {
  const { pool, picks } = props;
  const [day, setDay] = useState(() => {
    const t = new Date().toISOString().slice(0, 10);
    return t >= pool.from && t <= pool.to ? t : pool.from;
  });
  const key = (x: BetRound) => `${x.day}|${(x.course ?? '').trim().toLowerCase()}`;
  const all = roundChoices(pool, [...tourChoices(), ...picks]);
  const on = (x: BetRound) => picks.some((p) => key(p) === key(x));
  const full = props.need != null && picks.length >= props.need;
  return (
    <>
      {props.need != null && (
        <span className={`small ${picks.length === props.need ? 'good-text' : 'muted'}`}>
          {picks.length === props.need
            ? tr(`All ${props.need} rounds chosen`, `Alle ${props.need} Runden ausgewählt`)
            : picks.length < props.need
              ? tr(`Choose ${props.need} rounds – ${props.need - picks.length} to go`, `${props.need} Runden auswählen – noch ${props.need - picks.length}`)
              : tr(`Only ${props.need} rounds count – take ${picks.length - props.need} off`, `Nur ${props.need} Runden zählen – ${picks.length - props.need} abwählen`)}
        </span>
      )}
      {/* the whole list scrolls with the sheet, each round in one line (Sascha 11.11.2026: "cannot scroll; all in one line") */}
      <div className="pick-rounds">
        <ToggleList>
          {all.map((x) => (
            <ToggleRow
              key={key(x)}
              inList
              label={`${shortDay(x.day)} · ${x.course ?? tr('every round of the day', 'jede Runde des Tages')}`}
              on={on(x)}
              disabled={full && !on(x)}
              onChange={(v) => props.onChange(v ? [...picks, x] : picks.filter((p) => key(p) !== key(x)))}
            />
          ))}
        </ToggleList>
      </div>
      {/* a round of its own: a day – every round of it counts */}
      <span className="eyebrow">{tr('Add a round', 'Runde anlegen')}</span>
      <SettingsList>
        <DateRow label={tr('Day', 'Tag')} min={pool.from} max={pool.to} value={day} onChange={setDay} />
      </SettingsList>
      <button type="button" className="btn-secondary" disabled={full || picks.some((p) => p.day === day && !p.course)} onClick={() => props.onChange([...picks, { day }])}>
        {tr('+ Add this day', '+ Diesen Tag hinzufügen')}
      </button>
    </>
  );
}

/** "5+5+10": the opponent, the three stakes, gross or net. */
function DuelFields(props: { pool: WagerPool; w: Wager; set: (patch: Partial<Wager>) => void; /** the challenger: against whom stays */ fixedOpponent?: boolean }) {
  const { pool, w, set } = props;
  const p = w.parts ?? { front: 5, back: 5, total: 10 };
  return (
    <>
      <SettingsList>
        {props.fixedOpponent ? (
          <div className="settings-row">
            <span>{tr('Against', 'Gegen')}</span>
            <span className="muted">{pool.players.find((x) => x.id === w.opponent)?.name ?? '?'}</span>
          </div>
        ) : (
        <Pick<string> label={tr('Against', 'Gegen')} prompt={tr('Choose an opponent', 'Gegner wählen')} value={w.opponent ?? null} onChange={(v) => set({ opponent: v })} options={pool.players.filter((x) => x.id !== w.player).map((x) => ({ value: x.id, label: x.name }))} />
        )}
        <Pick<'gross' | 'net'>
          label={tr('Score', 'Ergebnis')}
          value={w.net ? 'net' : 'gross'}
          onChange={(v) => set({ net: v === 'net' })}
          options={[
            { value: 'gross', label: tr('Gross', 'Brutto') },
            { value: 'net', label: tr('Net', 'Netto'), text: tr('Strokes on the hardest holes', 'Vorgabeschläge an den schwersten Löchern') },
          ]}
        />
        {/* the share of the handicap, changed afterwards too (Sascha 10.11.2026: Chris's 5+5+10 was set gross – it was
            played net with 75 %) – every phone judges it anew from the cards */}
        {w.net && (
          <Pick<number>
            label={tr('Handicap share', 'Vorgabe')}
            value={w.allowance ?? 100}
            onChange={(v) => set({ allowance: v })}
            options={[100, 95, 90, 85, 80, 75, 50].map((v) => ({ value: v, label: `${v} %`, ...(v === 100 ? { text: tr('The whole playing handicap.', 'Die ganze Spielvorgabe.') } : {}) }))}
          />
        )}
      </SettingsList>
      <DuelStakes parts={p} sym={prizeSym(prizeOf(pool))} onChange={(parts) => set({ parts })} />
    </>
  );
}
/** The three stakes of "5+5+10": front nine, back nine, 18. */
function DuelStakes(props: { parts: { front: number; back: number; total: number }; sym: string; onChange: (p: { front: number; back: number; total: number }) => void }) {
  const num = (s: string) => Math.max(0, Number(s.replace(',', '.')) || 0);
  const box = (key: 'front' | 'back' | 'total', label: string) => (
    <div className="field">
      <label htmlFor={`duel-${key}`}>{label}</label>
      <input id={`duel-${key}`} className="input" inputMode="decimal" value={String(props.parts[key])} onChange={(e) => props.onChange({ ...props.parts, [key]: num(e.target.value) })} />
    </div>
  );
  return (
    <div className="duel-stakes">
      {box('front', tr(`Front 9 (${props.sym})`, `Vorne 9 (${props.sym})`))}
      {box('back', tr(`Back 9 (${props.sym})`, `Hinten 9 (${props.sym})`))}
      {box('total', tr(`18 (${props.sym})`, `Gesamt 18 (${props.sym})`))}
    </div>
  );
}

/** How the block counts – only what matters for it. */
function CountFields(props: { w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { w, set } = props;
  // the rows in one box; the number of rounds, a stepper, below it
  return (
    <>
      <SettingsList>
      {(w.kind === 'parRun' || w.kind === 'pars') && (
        <Pick<'better' | 'exact'>
          label={tr('Which holes count', 'Welche Löcher zählen')}
          value={w.orBetter === false ? 'exact' : 'better'}
          onChange={(v) => set({ orBetter: v === 'better' })}
          options={[
            { value: 'better', label: tr('Par or better', 'Par oder besser') },
            { value: 'exact', label: tr('Exactly par', 'Genau Par') },
          ]}
        />
      )}
      {(w.kind === 'birdieRun' || w.kind === 'birdies') && (
        <Pick<'better' | 'exact'>
          label={tr('Which holes count', 'Welche Löcher zählen')}
          value={w.orBetter === false ? 'exact' : 'better'}
          onChange={(v) => set({ orBetter: v === 'better' })}
          options={[
            { value: 'better', label: tr('Birdie or better', 'Birdie oder besser') },
            { value: 'exact', label: tr('Exactly birdie', 'Genau Birdie') },
          ]}
        />
      )}
      {(w.kind === 'parRun' || w.kind === 'birdieRun') && (
        <Pick<'round' | 'across'>
          label={tr('The run', 'Die Serie')}
          value={w.acrossRounds ? 'across' : 'round'}
          onChange={(v) => set({ acrossRounds: v === 'across' })}
          options={[
            { value: 'round', label: tr('Within one round', 'Innerhalb einer Runde') },
            { value: 'across', label: tr('Goes on into the next round', 'Läuft in die nächste Runde weiter') },
          ]}
        />
      )}
      {(w.kind === 'score' || w.kind === 'scoreSum') && (
        <Pick<'gross' | 'net'>
          label={tr('Score', 'Ergebnis')}
          value={w.net ? 'net' : 'gross'}
          onChange={(v) => set({ net: v === 'net' })}
          options={[
            { value: 'gross', label: tr('Gross', 'Brutto') },
            { value: 'net', label: tr('Net (playing handicap)', 'Netto (Spielvorgabe)') },
          ]}
        />
      )}
      {shapeOf(w.kind) === 'count' && (
        <Pick<'round' | 'trip'>
          label={tr('Counted', 'Gezählt')}
          value={w.scope === 'trip' ? 'trip' : 'round'}
          onChange={(v) => set({ scope: v === 'trip' ? 'trip' : undefined })}
          options={[
            { value: 'round', label: tr('In one round', 'In einer Runde') },
            { value: 'trip', label: tr('All rounds of the trip added up', 'Alle Runden der Reise zusammen') },
          ]}
        />
      )}
      {(shapeOf(w.kind) === 'most' || shapeOf(w.kind) === 'points' || shapeOf(w.kind) === 'score' || (shapeOf(w.kind) === 'count' && w.scope !== 'trip')) && (
        <Pick<18 | 9>
          label={tr('Holes', 'Löcher')}
          value={w.holes ?? 18}
          onChange={(v) => set({ holes: v })}
          options={[
            { value: 18, label: tr('On 18 holes', 'Auf 18 Löchern') },
            { value: 9, label: tr('On 9 holes', 'Auf 9 Löchern') },
          ]}
        />
      )}
      </SettingsList>
      {w.kind === 'scoreSum' && (
        <Field label={tr('Over how many rounds', 'Über wie viele Runden')}>
          <Stepper label={tr('Rounds', 'Runden')} value={w.rounds ?? 6} min={2} onChange={(v) => set({ rounds: Math.max(2, v ?? 6) })} />
        </Field>
      )}
    </>
  );
}

/** The number a block starts with: the library's suggestion. */
const startOf = (kind: WagerKind): number => LIBRARY.find((b) => b.kind === kind && !b.patch)?.start ?? LIBRARY.find((b) => b.kind === kind)?.start ?? 1;
function newWager(pool: WagerPool, me: string, kind: WagerKind = 'birdieRun'): Wager {
  return { id: newId(), player: pool.players.some((p) => p.id === me) ? me : pool.players[0].id, kind, target: startOf(kind), stake: isMoney(prizeOf(pool)) ? 20 : 1, payout: 'success', attempts: 'any', counted: poolCounted(pool) };
}

export function WagerSheet(props: {
  pool: WagerPool;
  me: string;
  wager: Wager | null;
  /** the challenger's own duel, not the host: whose and against whom stay, no deleting */
  own?: boolean;
  onSave: (w: Wager) => void;
  onDelete: (id: string) => void;
  onJudge: (id: string, done: boolean | null) => void;
  onClose: () => void;
}) {
  const { pool } = props;
  const [w, setW] = useState<Wager>(() => props.wager ?? newWager(pool, props.me));
  const [asking, setAsking] = useState(false);
  const set = (patch: Partial<Wager>) => setW({ ...w, ...patch });
  const k = KINDS.find((x) => x.kind === w.kind)!;
  const manual = props.wager ? pool.progress[props.wager.id]?.manual : undefined;
  const ok = (w.kind !== 'free' || !!w.text?.trim()) && (w.kind !== 'custom' || w.where !== 'holes' || !!w.holesOf?.length) && (w.payout !== 'opponent' || (!!w.opponent && w.opponent !== w.player)) && (shapeOf(w.kind) !== 'duel' || (!!w.opponent && w.opponent !== w.player));
  // an own bet: its words for the push (the server says them as it is), and kept in "Eigene Wetten"
  const save = () => {
    if (w.kind === 'custom') keepMyBet(myBetOf(w));
    props.onSave(w.kind === 'custom' ? { ...w, text: wagerLabel(w) } : w);
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={props.wager ? tr('Bet', 'Wette') : tr('New bet', 'Neue Wette')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.wager ? wagerLabel(props.wager) : tr('New bet', 'Neue Wette')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!props.own && (
        <Field label={tr('Whose bet', 'Wessen Wette')}>
          <Chips<string> label={tr('Whose bet', 'Wessen Wette')} value={w.player} onChange={(v) => v && set({ player: v, ...(w.opponent === v ? { opponent: undefined } : {}) })} options={pool.players.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        )}
        {!props.own && (
        <SettingsList>
          <Pick<WagerKind> label={tr('What', 'Was')} value={w.kind} onChange={(v) => setW({ ...w, kind: v, target: v === 'custom' ? 2 : startOf(v), ...(v === 'custom' ? CUSTOM_START : {}), ...(shapeOf(v) !== 'count' ? { scope: undefined } : {}), ...(shapeOf(v) === 'duel' ? { payout: 'opponent' as const, parts: w.parts ?? { front: 5, back: 5, total: 10 } } : {}) })} options={KINDS.filter((x) => shapeOf(x.kind) !== 'duel' || x.kind === w.kind).map((x) => ({ value: x.kind, label: x.name() }))} />
        </SettingsList>
        )}
        {shapeOf(w.kind) === 'duel' ? (
          <DuelFields pool={pool} w={w} set={set} fixedOpponent={props.own} />
        ) : w.kind === 'custom' ? (
          <CustomFields w={w} set={set} />
        ) : w.kind === 'free' ? (
          <Field label={tr('The bet in words', 'Die Wette in Worten')}>
            <input className="input" required aria-label={tr('The bet in words', 'Die Wette in Worten')} placeholder={tr('e.g. longest drive on hole 7', 'z. B. Längster Drive an Loch 7')} value={w.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          </Field>
        ) : (
          <Field label={k.number()}>
            <Stepper label={k.number()} value={w.target} min={k.min} onChange={(v) => set({ target: v })} />
          </Field>
        )}
        <CountFields w={w} set={set} />
        <PayFields pool={pool} w={w} set={set} />
        {/* deciding by hand above, "Speichern" right above "Wette löschen" (Sascha 02.11.2026) */}
        {props.wager && (
          <>
            {shapeOf(w.kind) !== 'duel' && (
            <>
              <SettingsList>
                <Pick<'done' | 'missed' | 'app'>
                  label={w.kind === 'free' ? tr('Decided', 'Entschieden') : tr('Decided by hand', 'Von Hand entscheiden')}
                  value={manual ? (manual.done ? 'done' : 'missed') : 'app'}
                  onChange={(v) => props.onJudge(props.wager!.id, v === 'app' ? null : v === 'done')}
                  options={[
                    { value: 'done', label: tr('Made', 'Geschafft') },
                    { value: 'missed', label: tr('Missed', 'Verloren') },
                    { value: 'app', label: w.kind === 'free' ? tr('Open', 'Offen') : tr('The app judges', 'App wertet aus'), text: w.kind === 'free' ? undefined : tr('From the rounds – by hand only for an argument or a mistake', 'Aus den Runden – von Hand nur bei Streitfall oder Fehler') },
                  ]}
                />
              </SettingsList>
              {manual && <span className="muted small">{tr(`set by ${manual.by}`, `gesetzt von ${manual.by}`)}</span>}
            </>
            )}
          </>
        )}
        {/* the actions as a bar, the main button last (Sascha 03.11.2026: docs/DESIGN.md) */}
        {props.wager && !props.own && (
          <>
            {!asking ? (
              <ActionBar label={tr('This bet', 'Diese Wette')} actions={[{ label: tr('Delete the bet', 'Wette löschen'), icon: 'delete', danger: true, onClick: () => setAsking(true) }]} />
            ) : (
              <div className="play-confirm" role="group" aria-label={tr('Delete the bet?', 'Wette löschen?')}>
                <span>{tr(`Delete "${wagerLabel(props.wager)}" – for everyone in the pool?`, `„${wagerLabel(props.wager)}“ löschen – für alle im Pool?`)}</span>
                <div className="play-actions">
                  <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>
                    {tr('Keep', 'Behalten')}
                  </button>
                  <button type="button" className="btn-secondary btn-danger" onClick={() => props.onDelete(props.wager!.id)}>
                    {tr('Delete', 'Löschen')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <button type="button" className="btn-primary" disabled={!ok} onClick={save}>
          {props.wager ? tr('Save', 'Speichern') : tr('Add the bet', 'Wette anlegen')}
        </button>
      </section>
    </div>
  );
}

/**
 * Bets for one round, from Rounds (Sascha 01.11.2026: "a round played on the spur of the moment – a bet or several for
 * it at once"): the pools this round counts for – or a new pool for just this round with the flight's players – then a
 * player's library. players[0] is this phone's player. Rounds opens it from the round setup and the hole drawer.
 */
export function RoundBetsSheet(props: { date: string; course: { id: string; name: string }; players: { name: string; hcp?: number | null }[]; onClose: () => void }) {
  const pools = usePools().filter((e) => !e.pool.deletedAt && !e.pool.finishedAt && inPool({ day: props.date, course: props.course.name, courseId: props.course.id }, e.pool));
  const [open, setOpen] = useState<string | null>(null); // a pool's code
  const [lib, setLib] = useState<string | null>(null); // a player of it
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void syncPools();
  }, []);
  const entry = pools.find((e) => e.code === open) ?? null;
  const day = `${props.date.slice(8, 10)}.${props.date.slice(5, 7)}.`;
  const create = async () => {
    setBusy(true);
    setMsg(null);
    const account = shownName(loadProfile()) || props.players[0]?.name || tr('Me', 'Ich');
    const uid = myAccount();
    const players: PoolPlayer[] = props.players
      .filter((p) => p.name.trim())
      .map((p, k) => ({ id: newId(), name: p.name.trim(), ...(k === 0 ? { joined: { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) } } : {}) }));
    if (!players.length) players.push({ id: newId(), name: account, joined: { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) } });
    const pool: WagerPool = {
      kind: 'wager-pool',
      id: newId(),
      name: `${props.course.name} · ${day}`,
      from: props.date,
      to: props.date,
      createdAt: new Date().toISOString(),
      players,
      wagers: [],
      progress: {},
      currency: 'EUR',
      rounds: [{ id: newId(), day: props.date, course: props.course.name, courseId: props.course.id }],
    };
    const e = await createPool(pool, players[0].id);
    setBusy(false);
    if (e) setOpen(e.code);
    else setMsg(NO_NET());
  };
  if (entry && lib)
    return (
      <LibrarySheet
        pool={entry.pool}
        player={lib}
        onClose={() => setLib(null)}
        onAdd={async (ws) => {
          const ok = await changePool(entry.code, (p) => ({ ...p, wagers: [...p.wagers, ...ws] }));
          if (!ok) return setMsg(NO_NET());
          rememberBets(entry.pool, ws);
          pushWagers(entry.code, ws.map((w) => w.id));
          setLib(null);
          void reportWagers();
        }}
      />
    );
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Bets for this round', 'Wetten für diese Runde')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Bets for this round', 'Wetten für diese Runde')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">
          {props.course.name} · {day}
        </span>
        {entry ? (
          <>
            <strong>{entry.pool.name}</strong>
            {isHost(entry) ? (
              <>
                <span className="muted small">{tr('Whose bets?', 'Wessen Wetten?')}</span>
                <div className="chip-set">
                  {entry.pool.players.map((p) => (
                    <button key={p.id} type="button" className="chip" onClick={() => setLib(p.id)}>
                      {p.name}
                    </button>
                  ))}
                </div>
                <span className="muted small">
                  {tr(`${entry.pool.wagers.length} bets in it · code ${entry.code} – the others join in Games`, `${entry.pool.wagers.length} Wetten darin · Code ${entry.code} – die anderen treten in Games bei`)}
                </span>
              </>
            ) : (
              <span className="muted small">{tr('Only whoever set up the pool adds bets to it.', 'Wetten legt nur an, wer den Pool angelegt hat.')}</span>
            )}
            <button type="button" className="btn-secondary" onClick={() => setOpen(null)}>
              {tr('Back', 'Zurück')}
            </button>
          </>
        ) : (
          <>
            {pools.length > 0 && <span className="eyebrow">{tr('This round counts for', 'Diese Runde zählt für')}</span>}
            {pools.map((e) => (
              <button key={e.code} type="button" className="list-item" onClick={() => setOpen(e.code)}>
                <span className="grow">
                  <span className="title">{e.pool.name}</span>
                  <span className="muted small">{tr(`${e.pool.players.length} players · ${e.pool.wagers.length} bets`, `${e.pool.players.length} Spieler · ${e.pool.wagers.length} Wetten`)}</span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
            <button type="button" className={pools.length ? 'btn-secondary' : 'btn-primary'} disabled={busy} onClick={() => void create()}>
              {busy ? tr('Creating …', 'Erzeuge …') : tr('New bet for this round', 'Neue Wette für diese Runde')}
            </button>
            <span className="muted small">{tr('A pool of its own for this round, with the players of the flight.', 'Ein eigener Pool für diese Runde, mit den Spielern des Flights.')}</span>
          </>
        )}
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
      </section>
    </div>
  );
}

/** A person's library (Sascha 01.11.2026: "per person a library to pick single bets from; once bets are set up, pick
 *  from those as templates too"): tick the bets, set each one's number, the stake and the rest for all of them. */
export function LibrarySheet(props: { pool: WagerPool; player: string; onAdd: (ws: Wager[]) => void; onClose: () => void }) {
  const { pool } = props;
  const player = props.player; // the player's own library – no switching to another here (Sascha 03.11.2026)
  const [picked, setPicked] = useState<Record<string, number>>({}); // library entry → its number
  const [text, setText] = useState(''); // the free bet in words
  const [base, setBase] = useState<Wager>(() => ({ ...newWager(pool, props.player), player: props.player }));
  // a "5+5+10" set up before is no template – it is a game in Games now (Sascha 02.11.2026)
  const earlier = useMemo(() => earlierGroups(earlierBets().filter((b) => shapeOf(b.wager.kind) !== 'duel')), []);
  // three tabs (Sascha 03.11.2026: "Eigene Wetten" between "Bibliothek" and "Schon angelegt")
  const [tab, setTab] = useState<'library' | 'own' | 'earlier'>('library');
  const [taken, setTaken] = useState<Set<string>>(new Set()); // earlier bets ticked: "group|index"
  const [mine, setMine] = useState<MyBet[]>(loadMyBets); // own bets kept (Sascha 02.11.2026)
  const [building, setBuilding] = useState(false);
  const name = pool.players.find((p) => p.id === player)?.name ?? '';
  const toggle = (id: string, start: number) => setPicked((x) => (id in x ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== id)) : { ...x, [id]: start }));
  const lib = LIBRARY.filter((b) => b.id in picked);
  const ticked = earlier.flatMap((g, gi) => g.wagers.filter((_, wi) => taken.has(`${gi}|${wi}`)));
  const myPicked = mine.filter((b) => `my:${b.id}` in picked);
  const n = lib.length + ticked.length + myPicked.length;
  const ok = n > 0 && (!('free' in picked) || !!text.trim()) && (base.payout !== 'opponent' || (!!base.opponent && base.opponent !== player));
  const flip = (keys: string[], on: boolean) => {
    const s = new Set(taken);
    keys.forEach((k) => (on ? s.add(k) : s.delete(k)));
    setTaken(s);
  };
  const add = () => {
    const { id: _i, kind: _k, target: _t, ...rest } = base;
    props.onAdd([
      ...lib.map((b) => {
        const w = fromLibrary(b, { ...rest, player }, picked[b.id], newId(), text);
        return shapeOf(w.kind) === 'sum' && props.pool.rounds?.length ? { ...w, rounds: props.pool.rounds.length } : w;
      }),
      ...ticked.map((w) => fromEarlier(w, player, pool, newId())),
      ...myPicked.map((b) => {
        const w: Wager = { ...rest, player, ...b.bet, kind: 'custom', target: picked[`my:${b.id}`], id: newId() };
        return { ...w, text: wagerLabel(w) };
      }),
    ]);
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Bets library', 'Wetten-Bibliothek')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr(`Bets for ${name}`, `Wetten für ${name}`)}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {/* bets set up before as templates – only once there are any (Sascha 01.11.2026) */}
        <Segmented<'library' | 'own' | 'earlier'>
          label={tr('Choose from', 'Auswählen aus')}
          value={tab}
          onChange={(v) => v && setTab(v)}
          options={[
            { value: 'library', label: tr('Library', 'Bibliothek') },
            { value: 'own', label: tr('Own bets', 'Eigene Wetten') },
            ...(earlier.length > 0 ? [{ value: 'earlier' as const, label: tr('Set up before', 'Schon angelegt') }] : []),
          ]}
        />
        {/* the settings first, as in a setup (Sascha 03.11.2026: "not under the catalogue – as settings at the very top") */}
        {(tab !== 'earlier' || lib.length + myPicked.length > 0) && (
          <div className="lib-group lib-settings">
            <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
            <PayFields pool={pool} w={{ ...base, player, kind: lib.length > 0 && lib.every((b) => b.kind === 'free') && !myPicked.length ? 'free' : 'birdies' }} set={(patch) => setBase({ ...base, ...patch })} />
          </div>
        )}
        {tab === 'own' && (
          <div className="lib-group">
            <span className="eyebrow">{tr('Own bets', 'Eigene Wetten')}</span>
            {/* what is what (Sascha 02.11.2026: "where is the difference between a free bet, my bets and the library?") */}
            <span className="muted small lib-explain">
              {tr(
                'Built by you from blocks (what counts, at least or at most, which holes) – e.g. "at least 2 birdies on the par 3s" or "no three-putt on the back nine". The app judges them and keeps them for every pool. Under "Library": ready-made bets, judged by the app too; only the free bet in words is decided by the host.',
                'Von dir aus Bausteinen gebaut (was zählt, mindestens oder höchstens, welche Löcher) – z. B. „Mindestens 2 Birdies auf den Par 3s“ oder „Kein Drei-Putt auf der hinteren 9“. Die App wertet sie aus und bietet sie in jedem Pool wieder an. Unter „Bibliothek“: fertige Wetten, ebenfalls automatisch ausgewertet; nur die freie Wette in Worten entscheidet der Host.',
              )}
            </span>
            {mine.map((b) => {
              const key = `my:${b.id}`;
              const on = key in picked;
              const w: Wager = { id: b.id, player, kind: 'custom', stake: 0, payout: 'success', attempts: 'any', ...b.bet, target: on ? picked[key] : b.bet.target };
              return (
                <div key={b.id} className={`lib-row${on ? ' on' : ''}`}>
                  <button type="button" className="lib-pick" aria-pressed={on} onClick={() => toggle(key, b.bet.target)}>
                    <span className="lib-check" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span className="grow">
                      <span className="title">{wagerLabel(w)}</span>
                      <span className="muted small">{metricOf(b.bet.metric).details ? tr('with the details of the holes', 'mit Detailerfassung') : tr('from the strokes', 'aus den Schlägen')}</span>
                    </span>
                  </button>
                  {on && <Stepper compact label={wagerLabel(w)} value={picked[key]} min={b.bet.metric === 'strokes' ? -18 : 0} onChange={(v) => setPicked({ ...picked, [key]: v })} />}
                  {!on && (
                    <button
                      type="button"
                      className="icon-btn small"
                      aria-label={tr(`Remove "${wagerLabel(w)}" from own bets`, `„${wagerLabel(w)}“ aus Eigene Wetten entfernen`)}
                      onClick={() => {
                        forgetMyBet(b.id);
                        setMine(loadMyBets());
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn-secondary" onClick={() => setBuilding(true)}>
              {tr('+ Build an own bet', '+ Eigene Wette bauen')}
            </button>
          </div>
        )}
        {building && (
          <CustomBetSheet
            onClose={() => setBuilding(false)}
            onDone={(b) => {
              setMine(loadMyBets());
              setPicked((x) => ({ ...x, [`my:${b.id}`]: b.bet.target }));
              setBuilding(false);
            }}
          />
        )}
        {tab === 'library' &&
          LIBRARY_GROUPS.map((g) => (
            <div key={g.group} className="lib-group">
              <span className="eyebrow">{g.name()}</span>
              {LIBRARY.filter((b) => b.group === g.group).map((b) => {
                const on = b.id in picked;
                const k = KINDS.find((x) => x.kind === b.kind)!;
                return (
                  <div key={b.id} className={`lib-row${on ? ' on' : ''}`}>
                    <button type="button" className="lib-pick" aria-pressed={on} onClick={() => toggle(b.id, b.start)}>
                      <span className="lib-check" aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      <span className="grow">
                        <span className="title">{b.name()}</span>
                        <span className="muted small">{b.hint()}</span>
                      </span>
                    </button>
                    {on && b.kind !== 'free' && <Stepper compact label={b.name()} value={picked[b.id]} min={k.min} onChange={(v) => setPicked({ ...picked, [b.id]: v })} />}
                    {on && b.kind === 'free' && (
                      <input className="input" required aria-label={tr('The bet in words', 'Die Wette in Worten')} placeholder={tr('e.g. longest drive on hole 7', 'z. B. Längster Drive an Loch 7')} value={text} onChange={(e) => setText(e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        {tab === 'earlier' &&
          earlier.map((g, gi) => {
            const keys = g.wagers.map((_, wi) => `${gi}|${wi}`);
            const all = keys.every((k) => taken.has(k));
            return (
              <div key={g.from} className="lib-group">
                <div className="lib-group-head">
                  <strong className="lib-from">{g.from}</strong>
                  <button type="button" className="link-btn small" onClick={() => flip(keys, !all)}>
                    {all ? tr('none', 'keine') : tr('all', 'alle')}
                  </button>
                </div>
                {g.wagers.map((w, wi) => {
                  const key = `${gi}|${wi}`;
                  const on = taken.has(key);
                  return (
                    <div key={key} className={`lib-row${on ? ' on' : ''}`}>
                      <button type="button" className="lib-pick" aria-pressed={on} onClick={() => flip([key], !on)}>
                        <span className="lib-check" aria-hidden="true">
                          {on ? '✓' : ''}
                        </span>
                        <span className="grow">
                          <span className="title">{wagerLabel(w)}</span>
                          <span className="muted small">{wagerRules(w, pool, roundChoices(pool, [...tourChoices(), ...(w.picks ?? [])]).length)}</span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        <button type="button" className="btn-primary" disabled={!ok} onClick={add}>
          {n === 1 ? tr(`Add 1 bet for ${name}`, `1 Wette für ${name} anlegen`) : tr(`Add ${n} bets for ${name}`, `${n} Wetten für ${name} anlegen`)}
        </button>
      </section>
    </div>
  );
}

/** Change a pool (Sascha 01.11.2026: "setting up, deleting, changing in a menu of its own"): name, days, players – a
 *  player with bets or a phone of his stays (his bets would be lost); or delete the pool for everyone. */

function PoolEditSheet(props: { pool: WagerPool; me: string; onSave: (patch: { name: string; from: string; to: string; players: PoolPlayer[]; removed: string[]; prize: Prize; rounds: PoolRound[]; counted: boolean; oneScorer: boolean; settle: 'net' | 'single' }) => void; onDelete: () => void; onClose: () => void }) {
  const { pool } = props;
  const [name, setName] = useState(pool.name);
  const [from, setFrom] = useState(pool.from);
  const [to, setTo] = useState(pool.to);
  const [players, setPlayers] = useState<PoolPlayer[]>(pool.players);
  const [prize, setPrize] = useState<Prize>(prizeOf(pool));
  const [rounds, setRounds] = useState<PoolRound[]>(pool.rounds ?? []);
  const [poolEntry, setPoolEntry] = useState<ScoreEntry>(entryOf({ counted: poolCounted(pool), oneScorer: pool.oneScorer }));
  const [settle, setSettle] = useState<'net' | 'single'>(pool.settle ?? 'net');
  const counted = poolEntry !== 'own';
  const [del, setDel] = useState(false);
  // a player taken out – one who joined or has bets after asking: his bets go with him
  const [removed, setRemoved] = useState<string[]>([]);
  const [asking, setAsking] = useState<PoolPlayer | null>(null);
  const betsOf = (p: PoolPlayer) => pool.wagers.filter((w) => w.player === p.id || w.opponent === p.id).length;
  const remove = (p: PoolPlayer) => {
    setPlayers(players.filter((x) => x.id !== p.id));
    if (pool.players.some((x) => x.id === p.id)) setRemoved([...removed, p.id]);
    setAsking(null);
  };
  const ok = !!name.trim() && from <= to && players.length > 0 && players.every((p) => p.name.trim());
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Change the pool', 'Pool bearbeiten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Change the pool', 'Pool bearbeiten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!del ? (
          <>
            <div className="field">
              <label htmlFor="pool-edit-name">{tr('Name', 'Name')}</label>
              <input id="pool-edit-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <span className="eyebrow">{tr('Days', 'Zeitraum')}</span>
            <SettingsList>
              <DateRow id="pool-edit-from" label={tr('From', 'Von')} value={from} onChange={(d) => { setFrom(d); if (d > to) setTo(d); }} />
              <DateRow id="pool-edit-to" label={tr('To', 'Bis')} value={to} min={from} onChange={setTo} />
            </SettingsList>
            <TripRounds from={from} to={to} rounds={rounds} onChange={setRounds} />
            <span className="eyebrow">{tr('Players', 'Spieler')}</span>
            {players.map((p, k) => (
              <PoolPlayerRow key={p.id} player={p} k={k} onChange={(np) => setPlayers(players.map((x) => (x.id === p.id ? { ...x, name: np.name, ...(np.hcp.trim() ? { hcp: np.hcp } : { hcp: undefined }) } : x)))} onRemove={p.id !== props.me ? () => (p.joined || betsOf(p) ? setAsking(p) : remove(p)) : undefined} />
            ))}
            {/* your friends with a tap, as when setting the pool up (Sascha 03.11.2026) – an empty row first */}
            <FriendChips
              taken={players.map((p) => p.name)}
              onAdd={(fr) => {
                const k = players.findIndex((p) => !p.name.trim());
                setPlayers(k >= 0 ? players.map((p, j) => (j === k ? { ...p, name: fr.name, ...(fr.hcp ? { hcp: fr.hcp } : {}) } : p)) : [...players, { id: newId(), name: fr.name, ...(fr.hcp ? { hcp: fr.hcp } : {}) }]);
              }}
            />
            <button type="button" className="btn-secondary" onClick={() => setPlayers([...players, { id: newId(), name: '' }])}>
              {tr('+ Add player', '+ Spieler hinzufügen')}
            </button>
            {asking && (
              <div className="card pool-remove" role="alertdialog" aria-label={tr(`Remove ${asking.name}?`, `${asking.name} entfernen?`)}>
                <strong>{tr(`Remove ${asking.name}?`, `${asking.name} entfernen?`)}</strong>
                <span className="muted small">
                  {betsOf(asking)
                    ? tr(`His ${betsOf(asking)} bets go with him – for everyone in the pool.`, `Seine ${betsOf(asking)} ${betsOf(asking) === 1 ? 'Wette geht' : 'Wetten gehen'} mit – für alle im Pool.`)
                    : tr('He joined – he is out of the pool then.', 'Er ist beigetreten – dann ist er nicht mehr im Pool.')}
                </span>
                <ActionBar label={asking.name} actions={[{ label: tr('Keep', 'Behalten'), icon: 'reopen', onClick: () => setAsking(null) }, { label: tr('Remove', 'Entfernen'), icon: 'delete', danger: true, onClick: () => remove(asking) }]} />
              </div>
            )}
            {/* the order of "Neue Wette" (Sascha 03.11.2026: one order everywhere) */}
            <span className="eyebrow">{tr('Score entry', 'Score-Erfassung')}</span>
            <CountedSwitch value={poolEntry} onChange={setPoolEntry} />
            <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
            <SettingsList>
              <PrizeRow value={prize} onChange={setPrize} />
              {setsOff(prize) && <SettleRow value={settle} onChange={setSettle} />}
            </SettingsList>
            <ActionBar label={tr('This pool', 'Dieser Pool')} actions={[{ label: tr('Delete the pool', 'Pool löschen'), icon: 'delete', danger: true, onClick: () => setDel(true) }]} />
            <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onSave({ name: name.trim(), from, to, prize, rounds, counted, oneScorer: poolEntry === 'one', settle, removed, players: players.map(({ hcp, ...p }) => ({ ...p, name: p.name.trim(), ...(hcp?.trim() ? { hcp: hcp.trim() } : {}) })) })}>
              {tr('Save', 'Speichern')}
            </button>
          </>
        ) : (
          <>
            <strong>{tr(`Delete "${pool.name}"?`, `„${pool.name}“ löschen?`)}</strong>
            <span className="muted">{tr('For everyone in the pool: its bets and the settlement are gone on every phone.', 'Für alle im Pool: Wetten und Abrechnung sind auf jedem Handy weg.')}</span>
            <button type="button" className="btn-primary btn-danger-fill" onClick={props.onDelete}>
              {tr('Delete for everyone', 'Für alle löschen')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDel(false)}>
              {tr('Keep', 'Behalten')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function PoolInvite(props: { code: string; name: string }) {
  // the one look of every QR code in the app (Sascha 03.11.2026: "identical everywhere, as under Friends")
  const [msg, setMsg] = useState<string | null>(null);
  const url = joinLink(props.code);
  const text = tr(`Join our bets "${props.name}" – code ${props.code}`, `Mach mit bei unseren Wetten „${props.name}“ – Code ${props.code}`);
  return (
    <div className="card invite-card pool-invite">
      <InviteCard
        link={url}
        code={props.code}
        codeClass="join-code"
        codeLabel={tr(`Code ${props.code}`, `Code ${props.code}`)}
        hint={tr('Scan, or in Games type the code under "Join a bet" – then pick who you are.', 'Scannen oder in Games den Code unter „Wette beitreten“ eingeben – dann wählen, wer man ist.')}
        actions={[
          { label: tr('Invite', 'Einladen'), aria: tr('Send the invitation', 'Einladung senden'), icon: 'share', primary: true, onClick: () => void shareLink(text, url).then(setMsg) },
          { label: tr('Copy link', 'Link kopieren'), icon: 'copy', onClick: () => void copyLink(url).then(setMsg) },
        ]}
      />
      {msg && <span className="muted small">{msg}</span>}
      {/* linked friends invited with a tap (Sascha 03.11.2026: "for every 'invite players' in the whole app") */}
      <FriendInvite code={props.code} />
    </div>
  );
}
