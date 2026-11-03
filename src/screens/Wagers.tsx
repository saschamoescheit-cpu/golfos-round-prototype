import { useEffect, useMemo, useState } from 'react';
import { useTop } from '../components/useTop';
import { tr } from '../lib/i18n';
import { loadCachedCourse, newId } from '../lib/storage';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import type { Course } from '../types';
import { loadProfile, shownName } from '../lib/profile';
import { joinLink } from '../lib/sharedgame';
import { money, transfers } from '../lib/gameforms';
import { isMoney, prizeOf, prizeStakes, prizeSym, type Prize } from '../lib/prize';
import { PrizeRow } from '../components/PrizeRow';
import { Chips, Segmented, Stepper, TopBar } from '../components/ui';
import { FriendChips } from './Home';
import { PlayerRow } from './RoundSetup';
import { copyLink, FriendInvite, InviteCard, shareLink } from '../components/InviteCard';
import { KINDS, LIBRARY, LIBRARY_GROUPS, METRICS, WHERES, afterPayments, balances, ledger, poolCounted, type Payment, type LedgerLine, dayOf, inPool, metricOf, provisional, type Metric, type Where, earlierGroups, fromEarlier, fromLibrary, progressText, roundLabel, shapeOf, stateOf, wagerLabel, wagerRules, type Payout, type PoolPlayer, type PoolRound, type Progress, type Wager, type WagerKind, type WagerPool, type WagerState } from '../lib/wagers';
import { poolRoundOf } from '../lib/poolround';
import { forgetMyBet, keepMyBet, loadMyBets, type MyBet, changePool, createPool, earlierBets, forgetPool, isHost, isLive, joinPool, loadPools, myAccount, refreshPool, rememberBets, reportWagers, restorePool, syncPools, type PoolEntry } from '../lib/wagerstore';
import { Bin } from '../components/Bin';
import { ChoiceRow, DateRow, SettingsList, SettingsRow, SheetRow, ToggleRow, dayText } from '../components/Settings';
import { StakeRow } from '../components/StakePicker';
import { SwipeRow } from '../components/SwipeRow';
import { PaidMarks } from '../components/PaidMarks';
import { SignedIcon } from '../components/SignedIcon';
import { DeletedIcon, PlayedIcon } from '../components/RoundIcons';
import { pushBet } from '../lib/push';
import { loadSeries, loadTours } from '../lib/tourstore';
import { CoursePicker } from './CoursePicker';

// Bets in Games (Sascha 01.11.2026: "in America we have bets running – it must be possible to set up individual bets in
// Games, everything selectable and adjustable, invite people to the bets, and the flight counts each other as in a real
// tournament"). A pool over a period, its players and their bets; the standing comes from the rounds played in Rounds.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');
const ONLY_HOST = () => tr('Only whoever set up the pool changes its bets – you see them, and your phone reports yours.', 'Nur wer den Pool angelegt hat, ändert die Wetten – du siehst sie, und dein Handy meldet deine.');
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/** The pool a tapped push asks for (App puts it here) – once. */
export function takeOpenPool(): string | null {
  try {
    const code = sessionStorage.getItem('golfos.openPool');
    if (code) sessionStorage.removeItem('golfos.openPool');
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
      {filter !== 'bin' &&
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
  const [prize, setPrize] = useState<Prize>({ kind: 'money', currency: 'EUR' });
  const [counted, setCounted] = useState(false); // off by default (Sascha 02.11.2026: "the switch off by default")
  const [rounds, setRounds] = useState<PoolRound[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = !!names[0].name.trim() && from <= to;
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
        <span className="muted small">{tr('The first is you. The others join with the code – or add themselves.', 'Der Erste bist du. Die anderen treten mit dem Code bei – oder tragen sich selbst ein.')}</span>
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
        <SettingsList>
          <PrizeRow value={prize} onChange={setPrize} />
        </SettingsList>
        <CountedSwitch on={counted} onChange={setCounted} />
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
          const account = shownName(loadProfile()) || names[0].name.trim();
          const uid = myAccount();
          const players = names
            .map((p) => ({ ...p, name: p.name.trim() }))
            .filter((p, k) => k === 0 || p.name)
            .map((p, k) => ({ id: p.id, name: p.name, ...(p.hcp.trim() ? { hcp: p.hcp.trim() } : {}), ...(k === 0 ? { joined: { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) } } : {}) }));
          const pool: WagerPool = { kind: 'wager-pool', id: newId(), name: name.trim() || tr('Bets', 'Wetten'), from, to, createdAt: new Date().toISOString(), players, wagers: [], progress: {}, currency: isMoney(prize) ? prize.currency : 'EUR', ...(isMoney(prize) ? {} : { prize }), counted, ...(rounds.length ? { rounds } : {}) };
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
function TripRounds(props: { from: string; to: string; rounds: PoolRound[]; onChange: (r: PoolRound[]) => void }) {
  const [adding, setAdding] = useState<{ day: string; course?: { id: string; name: string }; src?: PoolRound['src']; holes?: string; holesName?: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // a round's id
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
      {/* each round a row as the settings of a setup (docs/DESIGN.md); tapped: its day changed or the round removed.
          The last row adds one as "Platz · Platz wählen ›" in "Neue Runde" / "Neues Spiel" (Sascha 03.11.2026) */}
      <SettingsList label={tr('The rounds', 'Die Runden')}>
        {sorted.map((r) => (
          <SettingsRow key={r.id} label={dayText(r.day)} value={r.tour ? `${r.course} · ${tr('tournament', 'Turnier')}` : r.holesName ? `${r.course} · ${r.holesName}` : r.course} onClick={() => setEditing(r.id)} />
        ))}
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
                <SettingsList>
                  <DateRow label={tr('Day', 'Tag')} min={props.from} max={props.to} value={r.day} onChange={(d) => props.onChange(props.rounds.map((x) => (x.id === r.id ? { ...x, day: d } : x)))} />
                  {r.courseId && loadCachedCourse(r.courseId) && (
                    <HolesRow course={loadCachedCourse(r.courseId)!} value={r.holes} onChange={(holes, holesName) => props.onChange(props.rounds.map((x) => (x.id === r.id ? { ...x, holes, holesName } : x)))} />
                  )}
                </SettingsList>
              )}
              {r.tour && <span className="muted small">{tr('From a tournament planned – its day comes from there.', 'Aus einem geplanten Turnier – der Tag kommt von dort.')}</span>}
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  props.onChange(props.rounds.filter((x) => x.id !== r.id));
                  setEditing(null);
                }}
              >
                {tr('Remove the round', 'Runde entfernen')}
              </button>
            </section>
          </div>
        );
      })()}
      {(tours.length > 0 || series.length > 0) && (
        <div className="trip-tours">
          <span className="muted small">{tr('From the tournaments planned', 'Aus den geplanten Turnieren')}</span>
          <div className="chip-set">
            {series.map((x) => (
              <button
                key={x.code}
                type="button"
                className="chip"
                onClick={() => props.onChange([...props.rounds, ...x.add.map((r) => ({ id: newId(), day: r.date, course: r.course.name, courseId: r.course.id, tour: r.code }))])}
              >
                + {x.series.name} · {tr(`${x.add.length} rounds`, `${x.add.length} Runden`)}
              </button>
            ))}
            {tours.map((e) => (
              <button
                key={e.code}
                type="button"
                className="chip"
                onClick={() => props.onChange([...props.rounds, { id: newId(), day: e.ev.date, course: e.ev.course.name, courseId: e.ev.course.id, tour: e.code, src: e.ev.course }])}
              >
                + {e.ev.name} · {e.ev.date.slice(8, 10)}.{e.ev.date.slice(5, 7)}.
              </button>
            ))}
          </div>
        </div>
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
            <DateRow id="trip-day" label={tr('Day', 'Tag')} min={props.from} max={props.to} value={adding.day} onChange={(d) => setAdding({ ...adding, day: d })} />
            {loadCachedCourse(adding.course.id) && <HolesRow course={loadCachedCourse(adding.course.id)!} value={adding.holes} onChange={(holes, holesName) => setAdding({ ...adding, holes, holesName })} />}
          </SettingsList>
          <button
            type="button"
            className="btn-primary"
            disabled={adding.day < props.from || adding.day > props.to}
            onClick={() => {
              props.onChange([...props.rounds, { id: newId(), day: adding.day, course: adding.course!.name, courseId: adding.course!.id, ...(adding.src ? { src: adding.src } : {}), ...(adding.holes ? { holes: adding.holes, holesName: adding.holesName } : {}) }]);
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

/** "Löcher" of a pool's round (Sascha 03.11.2026: "twice 9 holes today, the bets only for the A course"): every round of
 *  the day on the course, or one – "A · 9 Löcher", "A + B · 18 Löcher". */
function HolesRow(props: { course: Course; value?: string; onChange: (holes: string | undefined, name: string | undefined) => void }) {
  const opts = loopOptions(props.course.holes).map((o) => ({ value: buildRoundHoles(props.course.holes, o).map((h) => h.label).join(), name: o.label }));
  return (
    <ChoiceRow<string>
      label={tr('Holes', 'Löcher')}
      value={props.value ?? ''}
      onChange={(v) => props.onChange(v || undefined, v ? opts.find((o) => o.value === v)?.name : undefined)}
      options={[{ value: '', name: tr('Every round of the day', 'Alle Runden des Tages'), text: tr('Each round that day on this course counts', 'Jede Runde an dem Tag auf dem Platz zählt') }, ...opts]}
    />
  );
}

// ---------- the pool ----------

/** A "5+5+10" from the opponent's side: what one won the other lost, front, back and 18 turned round. */
const mirrored = (p: Progress | undefined): Progress | undefined =>
  p && { ...p, amount: -(p.amount ?? 0), duels: p.duels?.map((d) => ({ ...d, front: d.front == null ? null : -d.front || 0, back: d.back == null ? null : -d.back || 0, total: d.total == null ? null : -d.total || 0 })) };

/** "5+5+10": what the player stands at against his opponent – won (green), lost (red), level or not played yet. */
function DuelBadge(props: { amount: number; played: boolean; sym: string }) {
  if (!props.played) return <span className="badge warn">{tr('Open', 'Offen')}</span>;
  const v = props.amount;
  return <span className={`badge ${v > 0 ? 'ok' : v < 0 ? 'bad' : 'warn'}`}>{`${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(v, props.sym)}`}</span>;
}

function StateBadge(props: { state: WagerState; provisional?: boolean }) {
  if (props.state === 'done') return <span className="badge ok">{tr('Made', 'Geschafft')}</span>;
  if (props.state === 'missed') return <span className="badge bad">{tr('Missed', 'Verloren')}</span>;
  // made in a round not signed yet (Sascha 02.11.2026: "a result even when the marker has not signed")
  if (props.provisional) return <span className="badge warn">{tr('Made · provisional', 'Geschafft · vorläufig')}</span>;
  return <span className="badge warn">{tr('Open', 'Offen')}</span>;
}

export function PoolScreen(props: { code: string; onBack: () => void; onRound?: (code: string) => void }) {
  useTop(props.code);
  const pools = usePools();
  const entry = pools.find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | { edit: Wager | null } | { library: string } | 'invite' | 'finish' | 'pool'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // not on this phone yet (a push tapped on another phone of the same account): fetched from the server
  const [lookup, setLookup] = useState<'busy' | 'none' | null>(null);
  useEffect(() => {
    if (entry) return;
    setLookup('busy');
    void refreshPool(props.code).then((p) => setLookup(p ? null : 'none'));
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
        <TopBar title={tr('Bets', 'Wetten')} onBack={props.onBack} backLabel={tr('Bets', 'Wetten')} />
        <p className="muted">
          {lookup === 'busy'
            ? tr('Loading the pool …', 'Lade den Pool …')
            : tr('The pool could not be loaded – no connection, or this account is not in it. Join it with its code under "Join a game".', 'Der Pool ließ sich nicht laden – keine Verbindung, oder dieses Konto ist nicht dabei. Mit dem Code unter „Spiel beitreten“ beitreten.')}
        </p>
      </main>
    );
  }
  const pool = entry.pool;
  // only the host changes the pool (Sascha 01.11.2026: "the invited ones cannot edit the bets – only the host")
  const host = isHost(entry);
  if (pool.deletedAt) {
    return (
      <main className="screen">
        <TopBar title={pool.name} onBack={props.onBack} backLabel={tr('Bets', 'Wetten')} />
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
  const change = async (fn: (p: WagerPool) => WagerPool | null) => {
    setMsg(null);
    const r = await changePool(props.code, fn);
    if (!r) setMsg(NO_NET());
    return !!r;
  };
  const bal = balances(pool, today, true);
  const pays = transfers(afterPayments(bal, pool.payments)); // what is still to pay, once the payments are off
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
        backLabel={tr('Bets', 'Wetten')}
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
        {poolCounted(pool) ? ` · ${tr('with marker', 'mit Zähler')}` : ''}
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
      <Standings pool={pool} today={today} me={entry.me} />
      {pool.players.map((p) => {
        // his own bets – and a "5+5+10" against him, seen from his side (Erik sees he is 10 $ behind Chris)
        const ws = pool.wagers
          .filter((w) => w.player === p.id || (shapeOf(w.kind) === 'duel' && w.opponent === p.id))
          .map((w) => (w.player === p.id ? { w, shown: w, prog: pool.progress[w.id] } : { w, shown: { ...w, player: p.id, opponent: w.player }, prog: mirrored(pool.progress[w.id]) }));
        return (
          <section key={p.id} className="card pool-player" aria-label={p.name}>
            <div className="pool-player-head">
              <h2>{p.name}</h2>
              <span className="muted small">{p.id === entry.me ? tr('you', 'du') : p.joined ? tr('joined', 'dabei') : tr('not joined yet', 'noch nicht beigetreten')}</span>
            </div>
            {!ws.length && <span className="muted small">{tr('No bets yet.', 'Noch keine Wetten.')}</span>}
            {/* per person a library to pick single bets from (Sascha 01.11.2026) – below the bets there are */}
            {ws.map(({ w, shown, prog }) => {
              const row = (
                <>
                  <span className="grow">
                    <span className="title">{wagerLabel(shown)}</span>
                    <span className="muted small">{wagerRules(shown, pool)}</span>
                    {w.kind !== 'free' && <span className="small">{progressText(shown, prog, prizeOf(pool))}</span>}
                  </span>
                  {shapeOf(w.kind) === 'duel' ? <DuelBadge amount={prog?.amount ?? 0} played={!!prog?.duels?.length} sym={prizeSym(prizeOf(pool))} /> : <StateBadge state={stateOf(w, pool, today)} provisional={provisional(shown, prog)} />}
                </>
              );
              // the host taps a bet to change, decide or delete it; the others only see it
              return host ? (
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
      <Settlement pool={pool} bal={bal} lines={ledger(pool, today, true)} settled={settled} pending={pending} me={entry.me} name={name}>
        <PaidMarks
          open={pays}
          payments={pool.payments ?? []}
          name={(id) => name(id)}
          sym={prizeSym(prizeOf(pool))}
          prize={prizeOf(pool)}
          me={entry.me}
          anyone={host}
          onMark={(t, as) => pay((ps) => [...ps, { id: newId(), ...t, ...(as === 'paid' ? { paidAt: now() } : { receivedAt: now() }) }])}
          onConfirm={(id) => pay((ps) => ps.map((x) => (x.id === id ? { ...x, receivedAt: now() } : x)))}
          onUndo={(id) => pay((ps) => ps.filter((x) => x.id !== id))}
        />
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
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {/* the round right from the bets, at the bottom as everywhere in the app (Sascha 02.11.2026: "else again through Rounds, the players set up again"; "at the very bottom") */}
      {entry.me && !pool.finishedAt && props.onRound && (
        <button type="button" className="btn-primary" onClick={() => props.onRound!(props.code)}>
          {poolRoundOf(props.code) ? tr('Continue the round', 'Runde fortsetzen') : tr('Start the round', 'Runde starten')}
        </button>
      )}
      {/* only set up, finished later (Sascha 03.11.2026: "the bets set up only saved, finished at a later time"):
          every change is on the server the moment it is made – "Speichern" checks it is there and goes back */}
      {host && !pool.finishedAt && (
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              if (await change(() => null)) props.onBack();
            }}
          >
            {tr('Save', 'Speichern')}
          </button>
          <span className="muted small">{tr('Every change is saved at once – change the bets any time later.', 'Jede Änderung ist sofort gespeichert – die Wetten lassen sich jederzeit weiter bearbeiten.')}</span>
        </>
      )}
      {host && !pool.finishedAt && (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setSheet('finish')}>
          {tr('Finish the pool', 'Pool beenden')}
        </button>
      )}
      {sheet && typeof sheet === 'object' && 'edit' in sheet && (
        <WagerSheet
          pool={pool}
          me={entry.me}
          wager={sheet.edit}
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
              setSheet(null);
              void reportWagers();
            }
          }}
        />
      )}
      {sheet === 'pool' && (
        <PoolEditSheet
          pool={pool}
          onClose={() => setSheet(null)}
          onSave={async (x) => {
            const ok = await change((p) => {
              // the players as changed here; one added meanwhile on another phone stays, one with bets now too
              const keep = (id: string) => p.players.find((q) => q.id === id)?.joined || p.wagers.some((w) => w.player === id || w.opponent === id);
              const players = [...x.players.map((q) => ({ ...p.players.find((o) => o.id === q.id), ...q })), ...p.players.filter((q) => !x.players.some((y) => y.id === q.id) && (keep(q.id) || !pool.players.some((o) => o.id === q.id)))];
              // what is played for: money keeps `currency` (as phones from before read it), a thing `prize` beside it
              const { prize: _old, ...rest } = p;
              return { ...rest, name: x.name, from: x.from, to: x.to, currency: isMoney(x.prize) ? x.prize.currency : (p.currency ?? 'EUR'), ...(isMoney(x.prize) ? {} : { prize: x.prize }), rounds: x.rounds, counted: x.counted, players };
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
function cellOf(w: Wager, p: Progress | undefined): string {
  const shape = shapeOf(w.kind);
  const par = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`);
  const v = (n: number) => (shape === 'score' || shape === 'sum' ? par(n) : String(n));
  const best = p?.pending ?? p?.best;
  // the target first, then the best (Sascha 03.11.2026: "8/9, not 9/8")
  return `${v(w.target)}/${best == null ? '–' : v(best)}`;
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
export function Standings(props: { pool: WagerPool; today: string; me: string }) {
  const { pool } = props;
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
        {amount ? `${amount > 0 ? '+' : '−'}${money(Math.abs(amount), prizeSym(prizeOf(pool)))}` : '±0'}
        <small>{vs.length === 1 ? tr(`vs ${vs[0]}`, `gg. ${vs[0]}`) : tr(`${vs.length} opponents`, `${vs.length} Gegner`)}</small>
      </span>
    );
  };
  const cell = ({ w }: { w: Wager; against: boolean }) => {
    return (
      <span key={w.id} className={`bet-cell ${state(w)}${provisional(w, pool.progress[w.id]) ? ' provisional' : ''}`} title={wagerLabel(w)}>
        {cellOf(w, pool.progress[w.id])}
        {pool.progress[w.id]?.pending != null && <small>{tr('provisional', 'vorläufig')}</small>}
        {w.payout === 'opponent' && w.opponent && <small>{tr(`vs ${name(w.opponent)}`, `gg. ${name(w.opponent)}`)}</small>}
      </span>
    );
  };
  const players = pool.players.filter((p) => pool.wagers.some((w) => w.player === p.id || w.opponent === p.id));
  if (!pool.wagers.length) return null;
  const state = (w: Wager) => stateOf(w, pool, props.today);
  return (
    <section className="card pool-standings" aria-label={tr('Standing of the bets', 'Stand der Wetten')}>
      <div className="pool-settle-head">
        <h2>{tr('Standing', 'Stand')}</h2>
        <span className="muted small">{tr('live from the rounds', 'live aus den Runden')}</span>
      </div>
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
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.name}</th>
                  {players.map((p) => (
                    <td key={p.id}>
                      {r.key.startsWith('nassau|') ? duels(r.cells[p.id] ?? []) : (r.cells[p.id] ?? []).map(cell)}
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
function Settlement(props: { pool: WagerPool; bal: Record<string, number>; lines: Record<string, LedgerLine[]>; settled: number; pending: number; me: string; name: (id?: string) => string; children?: React.ReactNode }) {
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
                        {l.provisional && <span className="muted"> · {tr('provisional', 'vorläufig')}</span>}
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
      {/* "Wer zahlt wem" with what was paid – PaidMarks */}
      {props.children}
    </section>
  );
}

// ---------- one bet ----------

/** "With marker" for the whole pool (Sascha 02.11.2026) – every bet of it counts so. */
function CountedSwitch(props: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <ToggleRow
      on={props.on}
      label={tr('With marker – for all bets', 'Mit Zähler – für alle Wetten')}
      text={tr(
        'A flight partner marks each player (or one keeps the score of all), as in a tournament; until the card is signed a result is provisional. Off: every round of the player counts as he entered it.',
        'Ein Flightpartner zählt jeden Spieler (oder einer erfasst für alle), wie im Turnier; bis die Karte unterschrieben ist, gilt ein Ergebnis als vorläufig. Aus: Jede Runde zählt so, wie der Spieler sie erfasst hat.',
      )}
      onChange={props.onChange}
    />
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
        {!duel && (
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
        {/* with the rounds of the trip: every round or one of them (Sascha 01.11.2026) – without, every round or one day */}
        {w.kind !== 'free' && (
          <Pick<'any' | 'day' | 'round'>
            label={tr('Attempts', 'Versuche')}
            value={w.attempts}
            onChange={(v) => set({ attempts: v, ...(v === 'day' && !w.day ? { day: pool.from } : {}), ...(v === 'round' && !w.round ? { round: pool.rounds?.[0]?.id } : {}) })}
            options={[
              { value: 'any', label: duel ? tr('Every round together', 'Jede gemeinsame Runde') : tr('Every round', 'Jede Runde'), text: tr('Every round of the pool counts – the best one decides.', 'Jede Runde des Pools zählt – die beste entscheidet.') },
              ...(pool.rounds?.length
                ? [{ value: 'round' as const, label: tr('Only one round', 'Nur eine Runde'), text: tr('Only the round chosen below counts.', 'Nur die gewählte Runde zählt.') }]
                : [{ value: 'day' as const, label: duel ? tr('Only one day', 'Nur ein Tag') : tr('Only one day', 'Nur an einem Tag'), text: tr('Only the rounds of the day chosen below count.', 'Nur die Runden des gewählten Tages zählen.') }]),
            ]}
          />
        )}
        {w.kind !== 'free' && w.attempts === 'day' && <DateRow label={tr('Day', 'Tag')} min={pool.from} max={pool.to} value={w.day ?? pool.from} onChange={(d) => set({ day: d })} />}
        {w.kind !== 'free' && w.attempts === 'round' && !!pool.rounds?.length && (
          <Pick<string> label={tr('The round', 'Die Runde')} value={w.round ?? pool.rounds[0].id} onChange={(v) => set({ round: v })} options={pool.rounds.map((x) => ({ value: x.id, label: roundLabel(x) }))} />
        )}
      </SettingsList>
    </>
  );
}

/** "5+5+10": the opponent, the three stakes, gross or net. */
function DuelFields(props: { pool: WagerPool; w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { pool, w, set } = props;
  const p = w.parts ?? { front: 5, back: 5, total: 10 };
  return (
    <>
      <SettingsList>
        <Pick<string> label={tr('Against', 'Gegen')} prompt={tr('Choose an opponent', 'Gegner wählen')} value={w.opponent ?? null} onChange={(v) => set({ opponent: v })} options={pool.players.filter((x) => x.id !== w.player).map((x) => ({ value: x.id, label: x.name }))} />
        <Pick<'gross' | 'net'>
          label={tr('Score', 'Ergebnis')}
          value={w.net ? 'net' : 'gross'}
          onChange={(v) => set({ net: v === 'net' })}
          options={[
            { value: 'gross', label: tr('Gross', 'Brutto') },
            { value: 'net', label: tr('Net', 'Netto'), text: tr('Strokes on the hardest holes', 'Vorgabeschläge an den schwersten Löchern') },
          ]}
        />
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
        <Field label={tr('Whose bet', 'Wessen Wette')}>
          <Chips<string> label={tr('Whose bet', 'Wessen Wette')} value={w.player} onChange={(v) => v && set({ player: v, ...(w.opponent === v ? { opponent: undefined } : {}) })} options={pool.players.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <SettingsList>
          <Pick<WagerKind> label={tr('What', 'Was')} value={w.kind} onChange={(v) => setW({ ...w, kind: v, target: v === 'custom' ? 2 : startOf(v), ...(v === 'custom' ? CUSTOM_START : {}), ...(shapeOf(v) !== 'count' ? { scope: undefined } : {}), ...(shapeOf(v) === 'duel' ? { payout: 'opponent' as const, parts: w.parts ?? { front: 5, back: 5, total: 10 } } : {}) })} options={KINDS.filter((x) => shapeOf(x.kind) !== 'duel' || x.kind === w.kind).map((x) => ({ value: x.kind, label: x.name() }))} />
        </SettingsList>
        {shapeOf(w.kind) === 'duel' ? (
          <DuelFields pool={pool} w={w} set={set} />
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
        <button type="button" className="btn-primary" disabled={!ok} onClick={save}>
          {props.wager ? tr('Save', 'Speichern') : tr('Add the bet', 'Wette anlegen')}
        </button>
        {props.wager && (
          <>
            {!asking ? (
              <button type="button" className="btn-secondary btn-danger" onClick={() => setAsking(true)}>
                {tr('Delete the bet', 'Wette löschen')}
              </button>
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
                          <span className="muted small">{wagerRules(w, pool)}</span>
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

function PoolEditSheet(props: { pool: WagerPool; onSave: (patch: { name: string; from: string; to: string; players: PoolPlayer[]; prize: Prize; rounds: PoolRound[]; counted: boolean }) => void; onDelete: () => void; onClose: () => void }) {
  const { pool } = props;
  const [name, setName] = useState(pool.name);
  const [from, setFrom] = useState(pool.from);
  const [to, setTo] = useState(pool.to);
  const [players, setPlayers] = useState<PoolPlayer[]>(pool.players);
  const [prize, setPrize] = useState<Prize>(prizeOf(pool));
  const [rounds, setRounds] = useState<PoolRound[]>(pool.rounds ?? []);
  const [counted, setCounted] = useState(poolCounted(pool));
  const [del, setDel] = useState(false);
  const keeps = (p: PoolPlayer) => !!p.joined || pool.wagers.some((w) => w.player === p.id || w.opponent === p.id);
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
              <PoolPlayerRow key={p.id} player={p} k={k} onChange={(np) => setPlayers(players.map((x) => (x.id === p.id ? { ...x, name: np.name, ...(np.hcp.trim() ? { hcp: np.hcp } : { hcp: undefined }) } : x)))} onRemove={!keeps(p) ? () => setPlayers(players.filter((x) => x.id !== p.id)) : undefined} />
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
            <span className="muted small">{tr('A player who joined or has bets stays – delete his bets first.', 'Wer beigetreten ist oder Wetten hat, bleibt – erst seine Wetten löschen.')}</span>
            <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
            <SettingsList>
              <PrizeRow value={prize} onChange={setPrize} />
            </SettingsList>
            <CountedSwitch on={counted} onChange={setCounted} />
            <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onSave({ name: name.trim(), from, to, prize, rounds, counted, players: players.map(({ hcp, ...p }) => ({ ...p, name: p.name.trim(), ...(hcp?.trim() ? { hcp: hcp.trim() } : {}) })) })}>
              {tr('Save', 'Speichern')}
            </button>
            <button type="button" className="btn-secondary btn-danger" onClick={() => setDel(true)}>
              {tr('Delete the pool', 'Pool löschen')}
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
