import { useEffect, useMemo, useState } from 'react';
import { tr } from '../lib/i18n';
import { newId } from '../lib/storage';
import { loadProfile, shownName } from '../lib/profile';
import { joinLink } from '../lib/sharedgame';
import { currencySymbol, money, transfers } from '../lib/gameforms';
import { Chips, Segmented, Stepper, TopBar } from '../components/ui';
import { FriendChips } from './Home';
import { Qr } from '../components/ShareGame';
import { KINDS, LIBRARY, LIBRARY_GROUPS, balances, dayOf, earlierGroups, fromEarlier, fromLibrary, progressText, shapeOf, stateOf, wagerLabel, wagerRules, type Payout, type PoolPlayer, type Progress, type Wager, type WagerKind, type WagerPool, type WagerState } from '../lib/wagers';
import { changePool, createPool, earlierBets, forgetPool, isLive, joinPool, loadPools, myAccount, refreshPool, rememberBets, reportWagers, restorePool, syncPools, type PoolEntry } from '../lib/wagerstore';
import { Bin } from '../components/Bin';
import { SignedIcon } from '../components/SignedIcon';
import { DeletedIcon, PlayedIcon } from '../components/RoundIcons';
import { pushBet } from '../lib/push';

// Bets in Games (Sascha 01.11.2026: "in America we have bets running – it must be possible to set up individual bets in
// Games, everything selectable and adjustable, invite people to the bets, and the flight counts each other as in a real
// tournament"). A pool over a period, its players and their bets; the standing comes from the rounds played in Rounds.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');
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
 *  start – setting up, changing and deleting the bets is in the menu "Bets". */
export function StartBetCard(props: { canShare: boolean; onNew: () => void; onJoin: () => void; onList: () => void }) {
  const pools = usePools().filter((e) => !e.pool.deletedAt);
  const running = pools.filter((e) => live(e, dayOf(new Date()))).length;
  useEffect(() => {
    void syncPools(); // a phone emptied or new: the pools come back from the server
  }, []);
  return (
    <>
    <section className="card play-card" aria-label={tr('Start a bet', 'Wette starten')}>
      <strong className="play-course">{tr('Start a new bet', 'Neue Wette starten')}</strong>
      {props.canShare ? (
        <>
          <button type="button" className="btn-secondary" onClick={props.onNew}>
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
    {running > 0 && (
      <button type="button" className="list-item" onClick={props.onList}>
        <span className="grow">
          <span className="title">{tr('Follow the bets', 'Wetten verfolgen')}</span>
          <span className="muted small">{running === 1 ? tr('1 pool of bets running', '1 Wett-Pool läuft') : tr(`${running} pools of bets running`, `${running} Wett-Pools laufen`)}</span>
        </span>
        <span className="count-badge">{running}</span>
        <span aria-hidden="true">›</span>
      </button>
    )}
    </>
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
export function BetsTab(props: { onOpen: (code: string) => void }) {
  const all = usePools();
  const [filter, setFilter] = useState<'running' | 'over' | 'bin' | null>(null);
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
  const pick = (f: 'running' | 'over' | 'bin') => setFilter(filter === f ? null : f);
  const shown = filter === 'running' ? running : filter === 'over' ? over : pools;
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
        <div className="tile">
          <span className="tile-head">
            <span className="tile-num">{made}</span>
            <span className="tile-mark">
              <SignedIcon />
            </span>
          </span>
          <span className="muted small">{tr('bets made', 'geschafft')}</span>
        </div>
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
        onRestore={async (code) => setMsg((await restorePool(code)) ? null : NO_NET())}
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
                <PoolRow e={e} today={today} onOpen={() => props.onOpen(e.code)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{tr('No bets yet – "New bet" is on "Play".', 'Noch keine Wetten – „Neue Wette“ unter „Spielen“.')}</p>
        ))}
    </>
  );
}

// ---------- a new pool ----------

export function PoolSetup(props: { onBack: () => void; onCreated: (code: string) => void }) {
  const today = new Date();
  const [name, setName] = useState(tr('Bets', 'Wetten'));
  const [from, setFrom] = useState(dayOf(today));
  const [to, setTo] = useState(dayOf(new Date(today.getTime() + 7 * 864e5)));
  const [names, setNames] = useState<{ id: string; name: string }[]>(() => [{ id: newId(), name: shownName(loadProfile()) || tr('Me', 'Ich') }, { id: newId(), name: '' }]);
  const [currency, setCurrencyOf] = useState<'EUR' | 'USD'>('EUR');
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
        <div className="card setup-part">
          <div className="pool-dates">
            <div className="field">
              <label htmlFor="pool-from">{tr('From', 'Von')}</label>
              <input id="pool-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pool-to">{tr('To', 'Bis')}</label>
              <input id="pool-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <span className="muted small">{tr('Rounds of these days count.', 'Es zählen die Runden dieser Tage.')}</span>
        </div>
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Currency', 'Währung')}</span>
        <CurrencyChips value={currency} onChange={setCurrencyOf} />
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        {names.map((p, k) => (
          <div key={p.id} className="card player-row pool-player-row">
            <div className="field">
              <label htmlFor={`pool-player-${p.id}`}>{tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}</label>
              <input id={`pool-player-${p.id}`} className="input" value={p.name} placeholder={k === 0 ? tr('You', 'Du') : ''} onChange={(e) => setNames(names.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
            </div>
            {k > 0 && (
              <button type="button" className="icon-btn player-remove" aria-label={tr(`Remove ${p.name || 'player'}`, `${p.name || 'Spieler'} entfernen`)} onClick={() => setNames(names.filter((x) => x.id !== p.id))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {/* a friend takes the first empty row, else a new one – as in "New game" */}
        <FriendChips
          taken={names.map((p) => p.name)}
          onAdd={(fr) => {
            const k = names.findIndex((p, j) => j > 0 && !p.name.trim());
            setNames(k > 0 ? names.map((p, j) => (j === k ? { ...p, name: fr.name } : p)) : [...names, { id: newId(), name: fr.name }]);
          }}
        />
        {names.length < 12 && (
          <button type="button" className="btn-secondary" onClick={() => setNames([...names, { id: newId(), name: '' }])}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
        <span className="muted small">{tr('The first is you. The others join with the code – or add themselves.', 'Der Erste bist du. Die anderen treten mit dem Code bei – oder tragen sich selbst ein.')}</span>
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
            .map((p, k) => ({ id: p.id, name: p.name, ...(k === 0 ? { joined: { name: account, at: new Date().toISOString(), ...(uid ? { uid } : {}) } } : {}) }));
          const pool: WagerPool = { kind: 'wager-pool', id: newId(), name: name.trim() || tr('Bets', 'Wetten'), from, to, createdAt: new Date().toISOString(), players, wagers: [], progress: {}, currency };
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

// ---------- the pool ----------

const SEEN = 'golfos.pools.seen.v1'; // bets made that this phone has already announced
const seenSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

/** A "5+5+10" from the opponent's side: what one won the other lost, front, back and 18 turned round. */
const mirrored = (p: Progress | undefined): Progress | undefined =>
  p && { ...p, amount: -(p.amount ?? 0), duels: p.duels?.map((d) => ({ ...d, front: d.front == null ? null : -d.front || 0, back: d.back == null ? null : -d.back || 0, total: d.total == null ? null : -d.total || 0 })) };

/** "5+5+10": what the player stands at against his opponent – won (green), lost (red), level or not played yet. */
function DuelBadge(props: { amount: number; played: boolean; sym: string }) {
  if (!props.played) return <span className="badge warn">{tr('Open', 'Offen')}</span>;
  const v = props.amount;
  return <span className={`badge ${v > 0 ? 'ok' : v < 0 ? 'bad' : 'warn'}`}>{`${v > 0 ? '+' : v < 0 ? '−' : '±'}${money(v, props.sym)}`}</span>;
}

function StateBadge(props: { state: WagerState }) {
  if (props.state === 'done') return <span className="badge ok">{tr('Made', 'Geschafft')}</span>;
  if (props.state === 'missed') return <span className="badge bad">{tr('Missed', 'Verloren')}</span>;
  return <span className="badge warn">{tr('Open', 'Offen')}</span>;
}

export function PoolScreen(props: { code: string; onBack: () => void }) {
  const pools = usePools();
  const entry = pools.find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | { edit: Wager | null } | { library: string } | 'invite' | 'finish' | 'pool'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seen, setSeen] = useState(seenSet);
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
  if (pool.deletedAt) {
    return (
      <main className="screen">
        <TopBar title={pool.name} onBack={props.onBack} backLabel={tr('Bets', 'Wetten')} />
        <p className="muted">{tr('This pool of bets was deleted. Its bets are kept – it can be restored.', 'Dieser Wett-Pool wurde gelöscht. Seine Wetten sind noch da – er lässt sich wiederherstellen.')}</p>
        <button type="button" className="btn-secondary" onClick={async () => setMsg((await restorePool(props.code)) ? null : NO_NET())}>
          {tr('Restore', 'Wiederherstellen')}
        </button>
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
  // bets made that this phone has not announced yet (Sascha: "a message to all when one made it")
  const fresh = pool.wagers.filter((w) => stateOf(w, pool, today) === 'done' && !seen.has(w.id));
  const pays = transfers(balances(pool, today));
  const settled = pool.wagers.filter((w) => stateOf(w, pool, today) !== 'open').length;
  return (
    <main className="screen pool-screen">
      <TopBar
        title={pool.name}
        onBack={props.onBack}
        backLabel={tr('Bets', 'Wetten')}
        right={
          <button type="button" className="icon-btn" aria-label={tr('Change the pool', 'Pool bearbeiten')} onClick={() => setSheet('pool')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </button>
        }
      />
      <span className="muted small">
        {dm(pool.from)}–{dm(pool.to)} · {tr(`${pool.players.length} players · ${pool.wagers.length} bets`, `${pool.players.length} Spieler · ${pool.wagers.length} Wetten`)}
        {pool.finishedAt ? ` · ${tr('finished', 'beendet')}` : ''}
      </span>
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
      {fresh.length > 0 && (
        <section className="card pool-made" role="status">
          <span className="eyebrow">{tr('Made it', 'Geschafft')}</span>
          {fresh.map((w) => (
            <strong key={w.id}>
              {name(w.player)}: {wagerLabel(w)}
              {pool.progress[w.id]?.where ? <span className="muted small"> · {pool.progress[w.id].where}</span> : null}
            </strong>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const s = new Set([...seen, ...fresh.map((w) => w.id)]);
              try {
                localStorage.setItem(SEEN, JSON.stringify([...s]));
              } catch {
                /* shown again next time */
              }
              setSeen(s);
            }}
          >
            OK
          </button>
        </section>
      )}
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
            {ws.map(({ w, shown, prog }) => (
              <button key={w.id} type="button" className="list-item pool-wager" onClick={() => setSheet({ edit: w })}>
                <span className="grow">
                  <span className="title">{wagerLabel(shown)}</span>
                  <span className="muted small">{wagerRules(shown, pool)}</span>
                  {w.kind !== 'free' && <span className="small">{progressText(shown, prog, pool.currency)}</span>}
                </span>
                {shapeOf(w.kind) === 'duel' ? <DuelBadge amount={prog?.amount ?? 0} played={!!prog?.duels?.length} sym={currencySymbol(pool.currency)} /> : <StateBadge state={stateOf(w, pool, today)} />}
              </button>
            ))}
            {!pool.finishedAt && (
              <button type="button" className="btn-secondary pool-add" aria-label={tr(`Add bets for ${p.name}`, `Wetten für ${p.name} hinzufügen`)} onClick={() => setSheet({ library: p.id })}>
                {tr('+ Bets', '+ Wetten')}
              </button>
            )}
          </section>
        );
      })}
      <button type="button" className="btn-secondary" onClick={() => setSheet('invite')}>
        {tr(`Invite players · code ${props.code}`, `Mitspieler einladen · Code ${props.code}`)}
      </button>
      <section className="card">
        <span className="eyebrow">{tr('Settlement', 'Abrechnung')}</span>
        {pays.length ? (
          <ul className="game-pays">
            {pays.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                <span>
                  {name(t.from)} → {name(t.to)}
                </span>
                <strong>{money(t.amount, currencySymbol(pool.currency))}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted small">{tr('Nobody owes anything yet.', 'Noch schuldet niemand etwas.')}</span>
        )}
        <span className="muted small">{tr(`${settled} of ${pool.wagers.length} bets decided.`, `${settled} von ${pool.wagers.length} Wetten entschieden.`)}</span>
      </section>
      <details className="card">
        <summary>{tr('How the bets are counted', 'So werden die Wetten gezählt')}</summary>
        <p className="small">
          {tr(
            'Play your rounds in Rounds as usual – your phone judges your bets from them (greens from the putts) and reports them here. Bets "with marker" count only rounds in which a flight partner marked you: in Rounds invite the flight, switch on "Play with a marker", and at the end you and your marker sign the card. A free bet is decided by hand – tap it.',
            'Spielt eure Runden ganz normal in Rounds – dein Handy wertet deine Wetten daraus aus (Grüns aus den Putts) und meldet sie hierher. Wetten „mit Zähler“ zählen nur Runden, in denen dich ein Flightpartner gezählt hat: in Rounds den Flight einladen, „Mit Zähler spielen“ einschalten, am Ende unterschreiben du und dein Zähler die Karte. Eine freie Wette wird von Hand entschieden – antippen.',
          )}
        </p>
      </details>
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {!pool.finishedAt && (
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
              return { ...p, name: x.name, from: x.from, to: x.to, currency: x.currency, players };
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
      {sheet === 'invite' && <PoolInviteSheet code={props.code} name={pool.name} onClose={() => setSheet(null)} />}
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

// ---------- one bet ----------

function Switch(props: { on: boolean; label: string; hint?: string; onChange: (on: boolean) => void }) {
  return (
    <div className="drawer-list settings-switches">
      <button type="button" className="drawer-row" role="switch" aria-checked={props.on} onClick={() => props.onChange(!props.on)}>
        <span className="switch-label">
          <span>{props.label}</span>
          {props.hint && <span className="muted small">{props.hint}</span>}
        </span>
        <span className={`drawer-switch${props.on ? ' on' : ''}`} aria-hidden="true" />
      </button>
    </div>
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

/** Stake, payout and attempts – the same for one bet and for the template. */
function PayFields(props: { pool: WagerPool; w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { pool, w, set } = props;
  const sym = currencySymbol(pool.currency);
  const duel = shapeOf(w.kind) === 'duel';
  return (
    <>
      {!duel && (
      <>
      <Field label={tr(`Stake (${sym})`, `Einsatz (${sym})`)}>
        <input className="input" inputMode="decimal" aria-label={tr('Stake', 'Einsatz')} value={String(w.stake)} onChange={(e) => set({ stake: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) })} />
      </Field>
      <Field label={tr('Paid', 'Auszahlung')}>
        <Chips<Payout>
          label={tr('Paid', 'Auszahlung')}
          value={w.payout}
          onChange={(v) => v && set({ payout: v })}
          options={[
            { value: 'success', label: tr('When made: everyone pays him', 'Bei Erfolg: jeder zahlt ihm') },
            { value: 'both', label: tr('Both ways: missed, he pays everyone', 'Beidseitig: verloren zahlt er jedem') },
            { value: 'opponent', label: tr('Against one player', 'Gegen einen Spieler') },
          ]}
        />
      </Field>
      </>
      )}
      {w.payout === 'opponent' && !duel && (
        <Field label={tr('Against', 'Gegen')}>
          <Chips<string> label={tr('Against', 'Gegen')} value={w.opponent ?? null} onChange={(v) => v && set({ opponent: v })} options={pool.players.filter((p) => p.id !== w.player).map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
      )}
      {w.kind !== 'free' && (
        <>
          <Field label={tr('Attempts', 'Versuche')}>
            <Chips<'any' | 'day'>
              label={tr('Attempts', 'Versuche')}
              value={w.attempts}
              onChange={(v) => v && set({ attempts: v, ...(v === 'day' && !w.day ? { day: pool.from } : {}) })}
              options={[
                { value: 'any', label: duel ? tr('Every round together', 'Jede gemeinsame Runde') : tr('Every round of the pool', 'Jede Runde des Pools') },
                { value: 'day', label: duel ? tr('Only the round of one day', 'Nur die Runde eines Tages') : tr('Only one day', 'Nur an einem Tag') },
              ]}
            />
          </Field>
          {w.attempts === 'day' && <input type="date" className="input" aria-label={tr('Day', 'Tag')} min={pool.from} max={pool.to} value={w.day ?? pool.from} onChange={(e) => set({ day: e.target.value })} />}
          <Switch on={!!w.counted} label={tr('Counted by a marker', 'Mit Zähler gezählt')} hint={tr('Only rounds where a flight partner marked him and both signed the card – as in a tournament', 'Nur Runden, in denen ihn ein Flightpartner gezählt hat und beide die Karte unterschrieben haben – wie im Turnier')} onChange={(on) => set({ counted: on })} />
        </>
      )}
    </>
  );
}

/** "5+5+10": the opponent, the three stakes, gross or net. */
function DuelFields(props: { pool: WagerPool; w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { pool, w, set } = props;
  const p = w.parts ?? { front: 5, back: 5, total: 10 };
  return (
    <>
      <Field label={tr('Against', 'Gegen')}>
        <Chips<string> label={tr('Against', 'Gegen')} value={w.opponent ?? null} onChange={(v) => v && set({ opponent: v })} options={pool.players.filter((x) => x.id !== w.player).map((x) => ({ value: x.id, label: x.name }))} />
      </Field>
      <DuelStakes parts={p} sym={currencySymbol(pool.currency)} onChange={(parts) => set({ parts })} />
      <Chips<'gross' | 'net'>
        label={tr('Score', 'Ergebnis')}
        value={w.net ? 'net' : 'gross'}
        onChange={(v) => v && set({ net: v === 'net' })}
        options={[
          { value: 'gross', label: tr('Gross', 'Brutto') },
          { value: 'net', label: tr('Net (strokes on the hardest holes)', 'Netto (Vorgabeschläge an den schwersten Löchern)') },
        ]}
      />
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
  return (
    <>
      {(w.kind === 'parRun' || w.kind === 'pars') && (
        <Chips<'better' | 'exact'>
          label={tr('Which holes count', 'Welche Löcher zählen')}
          value={w.orBetter === false ? 'exact' : 'better'}
          onChange={(v) => v && set({ orBetter: v === 'better' })}
          options={[
            { value: 'better', label: tr('Par or better', 'Par oder besser') },
            { value: 'exact', label: tr('Exactly par', 'Genau Par') },
          ]}
        />
      )}
      {(w.kind === 'birdieRun' || w.kind === 'birdies') && (
        <Chips<'better' | 'exact'>
          label={tr('Which holes count', 'Welche Löcher zählen')}
          value={w.orBetter === false ? 'exact' : 'better'}
          onChange={(v) => v && set({ orBetter: v === 'better' })}
          options={[
            { value: 'better', label: tr('Birdie or better', 'Birdie oder besser') },
            { value: 'exact', label: tr('Exactly birdie', 'Genau Birdie') },
          ]}
        />
      )}
      {(w.kind === 'parRun' || w.kind === 'birdieRun') && (
        <Chips<'round' | 'across'>
          label={tr('The run', 'Die Serie')}
          value={w.acrossRounds ? 'across' : 'round'}
          onChange={(v) => v && set({ acrossRounds: v === 'across' })}
          options={[
            { value: 'round', label: tr('Within one round', 'Innerhalb einer Runde') },
            { value: 'across', label: tr('Goes on into the next round', 'Läuft in die nächste Runde weiter') },
          ]}
        />
      )}
      {w.kind === 'score' && (
        <Chips<'gross' | 'net'>
          label={tr('Score', 'Ergebnis')}
          value={w.net ? 'net' : 'gross'}
          onChange={(v) => v && set({ net: v === 'net' })}
          options={[
            { value: 'gross', label: tr('Gross', 'Brutto') },
            { value: 'net', label: tr('Net (playing handicap)', 'Netto (Spielvorgabe)') },
          ]}
        />
      )}
      {shapeOf(w.kind) === 'count' && (
        <Chips<'round' | 'trip'>
          label={tr('Counted', 'Gezählt')}
          value={w.scope === 'trip' ? 'trip' : 'round'}
          onChange={(v) => v && set({ scope: v === 'trip' ? 'trip' : undefined })}
          options={[
            { value: 'round', label: tr('In one round', 'In einer Runde') },
            { value: 'trip', label: tr('All rounds of the trip added up', 'Alle Runden der Reise zusammen') },
          ]}
        />
      )}
      {(shapeOf(w.kind) === 'most' || shapeOf(w.kind) === 'points' || shapeOf(w.kind) === 'score' || (shapeOf(w.kind) === 'count' && w.scope !== 'trip')) && (
        <Chips<18 | 9>
          label={tr('Holes', 'Löcher')}
          value={w.holes ?? 18}
          onChange={(v) => v && set({ holes: v })}
          options={[
            { value: 18, label: tr('On 18 holes', 'Auf 18 Löchern') },
            { value: 9, label: tr('On 9 holes', 'Auf 9 Löchern') },
          ]}
        />
      )}
    </>
  );
}

/** The number a block starts with: the library's suggestion. */
const startOf = (kind: WagerKind): number => LIBRARY.find((b) => b.kind === kind && !b.patch)?.start ?? LIBRARY.find((b) => b.kind === kind)?.start ?? 1;
function newWager(pool: WagerPool, me: string, kind: WagerKind = 'birdieRun'): Wager {
  return { id: newId(), player: pool.players.some((p) => p.id === me) ? me : pool.players[0].id, kind, target: startOf(kind), stake: 20, payout: 'success', attempts: 'any', counted: true };
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
  const ok = (w.kind !== 'free' || !!w.text?.trim()) && (w.payout !== 'opponent' || (!!w.opponent && w.opponent !== w.player));
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
        <Field label={tr('What', 'Was')}>
          <Chips<WagerKind> label={tr('What', 'Was')} value={w.kind} onChange={(v) => v && setW({ ...w, kind: v, target: startOf(v), ...(shapeOf(v) !== 'count' ? { scope: undefined } : {}), ...(shapeOf(v) === 'duel' ? { payout: 'opponent' as const, parts: w.parts ?? { front: 5, back: 5, total: 10 } } : {}) })} options={KINDS.map((x) => ({ value: x.kind, label: x.name() }))} />
        </Field>
        {shapeOf(w.kind) === 'duel' ? (
          <DuelFields pool={pool} w={w} set={set} />
        ) : w.kind === 'free' ? (
          <Field label={tr('The bet in words', 'Die Wette in Worten')}>
            <input className="input" aria-label={tr('The bet in words', 'Die Wette in Worten')} placeholder={tr('Longest drive on hole 7', 'Längster Drive an Loch 7')} value={w.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          </Field>
        ) : (
          <Field label={k.number()}>
            <Stepper label={k.number()} value={w.target} min={k.min} onChange={(v) => set({ target: v })} />
          </Field>
        )}
        <CountFields w={w} set={set} />
        <PayFields pool={pool} w={w} set={set} />
        <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onSave(w)}>
          {props.wager ? tr('Save', 'Speichern') : tr('Add the bet', 'Wette anlegen')}
        </button>
        {props.wager && (
          <>
            {shapeOf(w.kind) !== 'duel' && (
            <Field label={w.kind === 'free' ? tr('Decided', 'Entschieden') : tr('Decided by hand (an argument, a mistake)', 'Von Hand entscheiden (Streitfall, Fehler)')}>
              <Chips<'done' | 'missed' | 'app'>
                label={tr('Decided', 'Entschieden')}
                value={manual ? (manual.done ? 'done' : 'missed') : 'app'}
                onChange={(v) => v && props.onJudge(props.wager!.id, v === 'app' ? null : v === 'done')}
                options={[
                  { value: 'done', label: tr('Made', 'Geschafft') },
                  { value: 'missed', label: tr('Missed', 'Verloren') },
                  { value: 'app', label: w.kind === 'free' ? tr('Open', 'Offen') : tr('The app judges', 'App wertet aus') },
                ]}
              />
              {manual && <span className="muted small">{tr(`set by ${manual.by}`, `gesetzt von ${manual.by}`)}</span>}
            </Field>
            )}
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

/** A person's library (Sascha 01.11.2026: "per person a library to pick single bets from; once bets are set up, pick
 *  from those as templates too"): tick the bets, set each one's number, the stake and the rest for all of them. */
export function LibrarySheet(props: { pool: WagerPool; player: string; onAdd: (ws: Wager[]) => void; onClose: () => void }) {
  const { pool } = props;
  const [player, setPlayer] = useState(props.player);
  const [picked, setPicked] = useState<Record<string, number>>({}); // library entry → its number
  const [text, setText] = useState(''); // the free bet in words
  const [base, setBase] = useState<Wager>(() => ({ ...newWager(pool, props.player), player: props.player }));
  const earlier = useMemo(() => earlierGroups(earlierBets()), []);
  const [tab, setTab] = useState<'library' | 'earlier'>('library');
  const [taken, setTaken] = useState<Set<string>>(new Set()); // earlier bets ticked: "group|index"
  // "5+5+10" (Sascha 01.11.2026: "everyone may bet against everyone"): against the players chosen, or every pair of the pool
  const [duel, setDuel] = useState<{ parts: { front: number; back: number; total: number }; net: boolean; everyone: boolean; against: string[] }>(() => ({ parts: { front: 5, back: 5, total: 10 }, net: false, everyone: false, against: pool.players.filter((p) => p.id !== props.player).map((p) => p.id) }));
  const name = pool.players.find((p) => p.id === player)?.name ?? '';
  const paired = (a: string, b: string, more: Wager[] = []) => [...pool.wagers, ...more].some((x) => shapeOf(x.kind) === 'duel' && ((x.player === a && x.opponent === b) || (x.player === b && x.opponent === a)));
  /** The pairs "5+5+10" adds – none twice (A against B is B against A). */
  const duelPairs = (): [string, string][] => {
    const ids = pool.players.map((p) => p.id);
    const all: [string, string][] = duel.everyone ? ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as [string, string])) : duel.against.filter((o) => o !== player).map((o) => [player, o] as [string, string]);
    return all.filter(([a, b]) => !paired(a, b));
  };
  const pickPlayer = (id: string) => {
    setPlayer(id);
    setDuel({ ...duel, against: pool.players.filter((p) => p.id !== id).map((p) => p.id) });
  };
  const toggle = (id: string, start: number) => setPicked((x) => (id in x ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== id)) : { ...x, [id]: start }));
  const lib = LIBRARY.filter((b) => b.id in picked);
  const ticked = earlier.flatMap((g, gi) => g.wagers.filter((_, wi) => taken.has(`${gi}|${wi}`)));
  const duels = 'nassau' in picked ? duelPairs() : [];
  const n = lib.filter((b) => shapeOf(b.kind) !== 'duel').length + duels.length + ticked.length;
  const ok = n > 0 && (!('free' in picked) || !!text.trim()) && (base.payout !== 'opponent' || (!!base.opponent && base.opponent !== player) || lib.every((b) => shapeOf(b.kind) === 'duel'));
  const flip = (keys: string[], on: boolean) => {
    const s = new Set(taken);
    keys.forEach((k) => (on ? s.add(k) : s.delete(k)));
    setTaken(s);
  };
  const add = () => {
    const { id: _i, kind: _k, target: _t, ...rest } = base;
    const nassau = LIBRARY.find((b) => b.kind === 'nassau')!;
    props.onAdd([
      ...lib.filter((b) => shapeOf(b.kind) !== 'duel').map((b) => fromLibrary(b, { ...rest, player }, picked[b.id], newId(), text)),
      ...duels.map(([a, o]) => ({ ...fromLibrary(nassau, { ...rest, player: a }, 0, newId()), opponent: o, parts: duel.parts, net: duel.net, stake: 0 })),
      ...ticked.map((w) => fromEarlier(w, player, pool, newId())),
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
        <Chips<string> label={tr('Whose bets', 'Wessen Wetten')} value={player} onChange={(v) => v && pickPlayer(v)} options={pool.players.map((p) => ({ value: p.id, label: p.name }))} />
        {/* bets set up before as templates – only once there are any (Sascha 01.11.2026) */}
        {earlier.length > 0 && (
          <Segmented<'library' | 'earlier'>
            label={tr('Choose from', 'Auswählen aus')}
            value={tab}
            onChange={(v) => v && setTab(v)}
            options={[
              { value: 'library', label: tr('Library', 'Bibliothek') },
              { value: 'earlier', label: tr('Set up before', 'Schon angelegt') },
            ]}
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
                    {on && shapeOf(b.kind) === 'duel' && (
                      <div className="lib-duel">
                        <DuelStakes parts={duel.parts} sym={currencySymbol(pool.currency)} onChange={(parts) => setDuel({ ...duel, parts })} />
                        <Chips<'gross' | 'net'>
                          label={tr('Score', 'Ergebnis')}
                          value={duel.net ? 'net' : 'gross'}
                          onChange={(v) => v && setDuel({ ...duel, net: v === 'net' })}
                          options={[
                            { value: 'gross', label: tr('Gross', 'Brutto') },
                            { value: 'net', label: tr('Net', 'Netto') },
                          ]}
                        />
                        <Switch on={duel.everyone} label={tr('Everyone against everyone in the pool', 'Jeder gegen jeden im Pool')} hint={tr('Every pair once – those already there are left out', 'Jede Paarung einmal – schon vorhandene bleiben weg')} onChange={(on) => setDuel({ ...duel, everyone: on })} />
                        {!duel.everyone && (
                          <div className="chip-row wrap chips-field" role="group" aria-label={tr(`${name} against`, `${name} gegen`)}>
                            {pool.players
                              .filter((p) => p.id !== player)
                              .map((p) => {
                                const sel = duel.against.includes(p.id);
                                return (
                                  <button key={p.id} type="button" aria-pressed={sel} disabled={paired(player, p.id)} onClick={() => setDuel({ ...duel, against: sel ? duel.against.filter((x) => x !== p.id) : [...duel.against, p.id] })}>
                                    {p.name}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                        <span className="muted small">
                          {duels.length
                            ? duels.map(([a, o]) => `${pool.players.find((p) => p.id === a)?.name} – ${pool.players.find((p) => p.id === o)?.name}`).join(' · ')
                            : tr('Every pair is set up already.', 'Alle Paarungen sind schon angelegt.')}
                        </span>
                      </div>
                    )}
                    {on && b.kind !== 'free' && shapeOf(b.kind) !== 'duel' && <Stepper compact label={b.name()} value={picked[b.id]} min={k.min} onChange={(v) => setPicked({ ...picked, [b.id]: v })} />}
                    {on && b.kind === 'free' && (
                      <input className="input" aria-label={tr('The bet in words', 'Die Wette in Worten')} placeholder={tr('Longest drive on hole 7', 'Längster Drive an Loch 7')} value={text} onChange={(e) => setText(e.target.value)} />
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
        {lib.length > 0 && (
          <>
            <span className="eyebrow">{tr('For the bets from the library', 'Für die Wetten aus der Bibliothek')}</span>
            <PayFields pool={pool} w={{ ...base, player, kind: lib.every((b) => b.kind === 'free') ? 'free' : lib.every((b) => shapeOf(b.kind) === 'duel') ? 'nassau' : 'birdies' }} set={(patch) => setBase({ ...base, ...patch })} />
          </>
        )}
        <span className="muted small">{tr('Each bet can be changed afterwards – tap it.', 'Jede Wette lässt sich danach ändern – antippen.')}</span>
        <button type="button" className="btn-primary" disabled={!ok} onClick={add}>
          {n === 1 ? tr(`Add 1 bet for ${name}`, `1 Wette für ${name} anlegen`) : tr(`Add ${n} bets for ${name}`, `${n} Wetten für ${name} anlegen`)}
        </button>
      </section>
    </div>
  );
}

/** Change a pool (Sascha 01.11.2026: "setting up, deleting, changing in a menu of its own"): name, days, players – a
 *  player with bets or a phone of his stays (his bets would be lost); or delete the pool for everyone. */
/** Euro or dollar (Sascha 01.11.2026). */
function CurrencyChips(props: { value: 'EUR' | 'USD'; onChange: (c: 'EUR' | 'USD') => void }) {
  return (
    <Chips<'EUR' | 'USD'>
      label={tr('Currency', 'Währung')}
      value={props.value}
      onChange={(v) => v && props.onChange(v)}
      options={[
        { value: 'EUR', label: 'Euro (€)' },
        { value: 'USD', label: 'Dollar ($)' },
      ]}
    />
  );
}

function PoolEditSheet(props: { pool: WagerPool; onSave: (patch: { name: string; from: string; to: string; players: PoolPlayer[]; currency: 'EUR' | 'USD' }) => void; onDelete: () => void; onClose: () => void }) {
  const { pool } = props;
  const [name, setName] = useState(pool.name);
  const [from, setFrom] = useState(pool.from);
  const [to, setTo] = useState(pool.to);
  const [players, setPlayers] = useState<PoolPlayer[]>(pool.players);
  const [currency, setCur] = useState<'EUR' | 'USD'>(pool.currency ?? 'EUR');
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
            <div className="pool-dates">
              <div className="field">
                <label htmlFor="pool-edit-from">{tr('From', 'Von')}</label>
                <input id="pool-edit-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pool-edit-to">{tr('To', 'Bis')}</label>
                <input id="pool-edit-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <span className="eyebrow">{tr('Currency', 'Währung')}</span>
            <CurrencyChips value={currency} onChange={setCur} />
            <span className="eyebrow">{tr('Players', 'Spieler')}</span>
            {players.map((p, k) => (
              <div className="pool-edit-player" key={p.id}>
                <input className="input" aria-label={tr(`Player ${k + 1}`, `Spieler ${k + 1}`)} value={p.name} onChange={(e) => setPlayers(players.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
                {!keeps(p) && (
                  <button type="button" className="icon-btn" aria-label={tr(`Remove ${p.name}`, `${p.name} entfernen`)} onClick={() => setPlayers(players.filter((x) => x.id !== p.id))}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setPlayers([...players, { id: newId(), name: '' }])}>
              {tr('+ Add player', '+ Spieler hinzufügen')}
            </button>
            <span className="muted small">{tr('A player who joined or has bets stays – delete his bets first.', 'Wer beigetreten ist oder Wetten hat, bleibt – erst seine Wetten löschen.')}</span>
            <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onSave({ name: name.trim(), from, to, currency, players: players.map((p) => ({ ...p, name: p.name.trim() })) })}>
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

function PoolInviteSheet(props: { code: string; name: string; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const url = joinLink(props.code);
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: { text: string; url: string }) => Promise<void> };
    const text = tr(`Join our bets "${props.name}" – code ${props.code}`, `Mach mit bei unseren Wetten „${props.name}“ – Code ${props.code}`);
    try {
      if (nav.share) await nav.share({ text, url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg(tr('Link copied.', 'Link kopiert.'));
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Invite players', 'Mitspieler einladen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Invite players', 'Mitspieler einladen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <Qr text={url} />
        <strong className="join-code" aria-label={tr(`Code ${props.code}`, `Code ${props.code}`)}>
          {props.code}
        </strong>
        <span className="muted small">{tr('Scan, or in Games type the code under "Join a game" – then pick who you are.', 'Scannen oder in Games den Code unter „Spiel beitreten“ eingeben – dann wählen, wer man ist.')}</span>
        <button type="button" className="btn-secondary" onClick={share}>
          {tr('Share the link', 'Link teilen')}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </section>
    </div>
  );
}
