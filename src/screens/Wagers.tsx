import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { newId } from '../lib/storage';
import { loadProfile, shownName } from '../lib/profile';
import { joinLink } from '../lib/sharedgame';
import { money, transfers } from '../lib/gameforms';
import { Chips, Stepper, TopBar } from '../components/ui';
import { Qr } from '../components/ShareGame';
import { KINDS, TEMPLATE, balances, dayOf, progressText, stateOf, wagerLabel, wagerRules, type Payout, type Wager, type WagerKind, type WagerPool, type WagerState } from '../lib/wagers';
import { changePool, createPool, forgetPool, loadPools, refreshPool, reportWagers, type PoolEntry } from '../lib/wagerstore';

// Bets in Games (Sascha 01.11.2026: "in America we have bets running – it must be possible to set up individual bets in
// Games, everything selectable and adjustable, invite people to the bets, and the flight counts each other as in a real
// tournament"). A pool over a period, its players and their bets; the standing comes from the rounds played in Rounds.

const NO_NET = () => tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.');
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

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

/** On the play tab of Games: the pools running, and a new one. */
export function PoolsCard(props: { canShare: boolean; onOpen: (code: string) => void; onNew: () => void }) {
  const pools = usePools();
  const today = dayOf(new Date());
  const running = pools.filter((e) => !e.pool.finishedAt && e.pool.to >= today);
  return (
    <section className="card play-card" aria-label={tr('Bets', 'Wetten')}>
      <strong className="play-course">{tr('Bets', 'Wetten')}</strong>
      <span className="muted small">{tr('Everyone his own targets – birdies in a row, greens, the score … The app judges them from the rounds in Rounds.', 'Jeder seine eigenen Ziele – Birdies in Folge, Grüns, Ergebnis … Die App wertet sie aus den Runden in Rounds aus.')}</span>
      {running.map((e) => {
        const open = e.pool.wagers.filter((w) => stateOf(w, e.pool, today) === 'open').length;
        return (
          <button key={e.code} type="button" className="list-item" onClick={() => props.onOpen(e.code)}>
            <span className="grow">
              <span className="title">{e.pool.name}</span>
              <span className="muted small">
                {dm(e.pool.from)}–{dm(e.pool.to)} · {tr(`${e.pool.wagers.length} bets, ${open} open`, `${e.pool.wagers.length} Wetten, ${open} offen`)}
              </span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        );
      })}
      {props.canShare ? (
        <button type="button" className="btn-secondary" onClick={props.onNew}>
          {tr('New pool of bets', 'Neuer Wett-Pool')}
        </button>
      ) : (
        <span className="muted small">{tr('Sign in to set up bets: Profile → "On all your devices".', 'Für Wetten anmelden: Profil → „Auf allen Geräten“.')}</span>
      )}
      {pools.length > running.length && (
        <details>
          <summary className="muted small">{tr('Finished pools', 'Beendete Pools')}</summary>
          {pools
            .filter((e) => !running.includes(e))
            .map((e) => (
              <button key={e.code} type="button" className="list-item" onClick={() => props.onOpen(e.code)}>
                <span className="grow">
                  <span className="title">{e.pool.name}</span>
                  <span className="muted small">
                    {dm(e.pool.from)}–{dm(e.pool.to)}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
        </details>
      )}
    </section>
  );
}

// ---------- a new pool ----------

export function PoolSetup(props: { onBack: () => void; onCreated: (code: string) => void }) {
  const today = new Date();
  const [name, setName] = useState(tr('Bets', 'Wetten'));
  const [from, setFrom] = useState(dayOf(today));
  const [to, setTo] = useState(dayOf(new Date(today.getTime() + 7 * 864e5)));
  const [names, setNames] = useState<string[]>([shownName(loadProfile()) || tr('Me', 'Ich'), '', '']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ok = !!names[0].trim() && from <= to;
  return (
    <main className="screen">
      <TopBar title={tr('New pool of bets', 'Neuer Wett-Pool')} onBack={props.onBack} backLabel={tr('Games', 'Spiele')} />
      <section className="card play-card">
        <div className="field">
          <label htmlFor="pool-name">{tr('Name', 'Name')}</label>
          <input id="pool-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('USA 2026', 'USA 2026')} />
        </div>
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
      </section>
      <section className="card play-card">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        <span className="muted small">{tr('The first name is you. The others join with the code – or add themselves.', 'Der erste Name bist du. Die anderen treten mit dem Code bei – oder tragen sich selbst ein.')}</span>
        {names.map((n, k) => (
          <input
            key={k}
            className="input"
            aria-label={tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
            placeholder={k === 0 ? tr('You', 'Du') : tr(`Player ${k + 1}`, `Spieler ${k + 1}`)}
            value={n}
            onChange={(e) => setNames(names.map((x, j) => (j === k ? e.target.value : x)))}
          />
        ))}
        {names.length < 12 && (
          <button type="button" className="btn-secondary" onClick={() => setNames([...names, ''])}>
            {tr('+ Player', '+ Spieler')}
          </button>
        )}
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
          const account = shownName(loadProfile()) || names[0].trim();
          const players = names.map((n) => n.trim()).filter((n, k) => k === 0 || n).map((n, k) => ({ id: newId(), name: n, ...(k === 0 ? { joined: { name: account, at: new Date().toISOString() } } : {}) }));
          const pool: WagerPool = { kind: 'wager-pool', id: newId(), name: name.trim() || tr('Bets', 'Wetten'), from, to, createdAt: new Date().toISOString(), players, wagers: [], progress: {} };
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

function StateBadge(props: { state: WagerState }) {
  if (props.state === 'done') return <span className="badge ok">{tr('Made', 'Geschafft')}</span>;
  if (props.state === 'missed') return <span className="badge bad">{tr('Missed', 'Verloren')}</span>;
  return <span className="badge warn">{tr('Open', 'Offen')}</span>;
}

export function PoolScreen(props: { code: string; onBack: () => void }) {
  const pools = usePools();
  const entry = pools.find((e) => e.code === props.code);
  const [sheet, setSheet] = useState<null | { edit: Wager | null } | 'template' | 'invite' | 'finish'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [seen, setSeen] = useState(seenSet);
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
        <TopBar title={tr('Bets', 'Wetten')} onBack={props.onBack} backLabel={tr('Games', 'Spiele')} />
        <p className="muted">{tr('This pool is not on this phone any more.', 'Dieser Pool ist nicht mehr auf diesem Handy.')}</p>
      </main>
    );
  }
  const pool = entry.pool;
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
      <TopBar title={pool.name} onBack={props.onBack} backLabel={tr('Games', 'Spiele')} />
      <span className="muted small">
        {dm(pool.from)}–{dm(pool.to)} · {tr(`${pool.players.length} players · ${pool.wagers.length} bets`, `${pool.players.length} Spieler · ${pool.wagers.length} Wetten`)}
        {pool.finishedAt ? ` · ${tr('finished', 'beendet')}` : ''}
      </span>
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
        const ws = pool.wagers.filter((w) => w.player === p.id);
        return (
          <section key={p.id} className="card pool-player" aria-label={p.name}>
            <div className="pool-player-head">
              <h2>{p.name}</h2>
              <span className="muted small">{p.id === entry.me ? tr('you', 'du') : p.joined ? tr('joined', 'dabei') : tr('not joined yet', 'noch nicht beigetreten')}</span>
            </div>
            {!ws.length && <span className="muted small">{tr('No bets yet.', 'Noch keine Wetten.')}</span>}
            {ws.map((w) => (
              <button key={w.id} type="button" className="list-item pool-wager" onClick={() => setSheet({ edit: w })}>
                <span className="grow">
                  <span className="title">{wagerLabel(w)}</span>
                  <span className="muted small">{wagerRules(w, pool)}</span>
                  {w.kind !== 'free' && <span className="small">{progressText(w, pool.progress[w.id])}</span>}
                </span>
                <StateBadge state={stateOf(w, pool, today)} />
              </button>
            ))}
          </section>
        );
      })}
      {!pool.finishedAt && (
        <div className="play-actions">
          <button type="button" className="btn-primary" onClick={() => setSheet({ edit: null })}>
            {tr('+ Bet', '+ Wette')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSheet('template')}>
            {tr('Zocker pool template', 'Vorlage Zocker-Pool')}
          </button>
        </div>
      )}
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
                <strong>{money(t.amount)}</strong>
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
      {!pool.finishedAt ? (
        <button type="button" className="btn-secondary btn-danger" onClick={() => setSheet('finish')}>
          {tr('Finish the pool', 'Pool beenden')}
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            forgetPool(props.code);
            props.onBack();
          }}
        >
          {tr('Remove from this phone', 'Von diesem Handy entfernen')}
        </button>
      )}
      {sheet && typeof sheet === 'object' && (
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
            if (
              await change((p) => {
                const prev = p.progress[id] ?? { best: null, done: false, rounds: 0, at: new Date().toISOString() };
                const { manual: _m, ...rest } = prev;
                return { ...p, progress: { ...p.progress, [id]: done == null ? rest : { ...prev, manual: { done, by } } } };
              })
            )
              setSheet(null);
          }}
        />
      )}
      {sheet === 'template' && (
        <TemplateSheet
          pool={pool}
          me={entry.me}
          onClose={() => setSheet(null)}
          onAdd={async (ws) => {
            if (await change((p) => ({ ...p, wagers: [...p.wagers, ...ws] }))) {
              setSheet(null);
              void reportWagers();
            }
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
  return (
    <>
      <Field label={tr('Stake (€)', 'Einsatz (€)')}>
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
      {w.payout === 'opponent' && (
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
                { value: 'any', label: tr('Every round of the pool', 'Jede Runde des Pools') },
                { value: 'day', label: tr('Only one day', 'Nur an einem Tag') },
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

/** How the block counts – only what matters for it. */
function CountFields(props: { w: Wager; set: (patch: Partial<Wager>) => void }) {
  const { w, set } = props;
  return (
    <>
      {w.kind === 'parRun' && (
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
      {(w.kind === 'birdies' || w.kind === 'greens' || w.kind === 'score') && (
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

function newWager(pool: WagerPool, me: string, kind: WagerKind = 'birdieRun'): Wager {
  const k = KINDS.find((x) => x.kind === kind)!;
  return { id: newId(), player: pool.players.some((p) => p.id === me) ? me : pool.players[0].id, kind, target: k.start, stake: 20, payout: 'success', attempts: 'any', counted: true };
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
          <Chips<WagerKind> label={tr('What', 'Was')} value={w.kind} onChange={(v) => v && setW({ ...w, kind: v, target: KINDS.find((x) => x.kind === v)!.start })} options={KINDS.map((x) => ({ value: x.kind, label: x.name() }))} />
        </Field>
        {w.kind === 'free' ? (
          <Field label={tr('The bet in words', 'Die Wette in Worten')}>
            <input className="input" aria-label={tr('The bet in words', 'Die Wette in Worten')} placeholder={tr('Longest drive on hole 7', 'Längster Drive an Loch 7')} value={w.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          </Field>
        ) : (
          <Field label={k.number()}>
            <Stepper label={k.number()} value={w.target} min={w.kind === 'score' ? -30 : 1} onChange={(v) => set({ target: v })} />
          </Field>
        )}
        <CountFields w={w} set={set} />
        <PayFields pool={pool} w={w} set={set} />
        <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onSave(w)}>
          {props.wager ? tr('Save', 'Speichern') : tr('Add the bet', 'Wette anlegen')}
        </button>
        {props.wager && (
          <>
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
            <button type="button" className="btn-secondary btn-danger" onClick={() => props.onDelete(props.wager!.id)}>
              {tr('Delete the bet', 'Wette löschen')}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

/** The "Zocker-Pool" (Sascha's list): five bets for one player at once – only the numbers differ per player. */
export function TemplateSheet(props: { pool: WagerPool; me: string; onAdd: (ws: Wager[]) => void; onClose: () => void }) {
  const { pool } = props;
  const [base, setBase] = useState<Wager>(() => newWager(pool, props.me));
  const [targets, setTargets] = useState<Record<string, number>>(() => Object.fromEntries(TEMPLATE.map((k) => [k, KINDS.find((x) => x.kind === k)!.start])));
  const set = (patch: Partial<Wager>) => setBase({ ...base, ...patch });
  const ok = base.payout !== 'opponent' || (!!base.opponent && base.opponent !== base.player);
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet wager-sheet" role="dialog" aria-label={tr('Zocker pool template', 'Vorlage Zocker-Pool')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Zocker pool template', 'Vorlage Zocker-Pool')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">{tr('Five bets for one player – then the next player.', 'Fünf Wetten für einen Spieler – danach der nächste.')}</span>
        <Field label={tr('Whose bets', 'Wessen Wetten')}>
          <Chips<string> label={tr('Whose bets', 'Wessen Wetten')} value={base.player} onChange={(v) => v && set({ player: v })} options={pool.players.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        {TEMPLATE.map((kind) => {
          const k = KINDS.find((x) => x.kind === kind)!;
          return (
            <div className="template-row" key={kind}>
              <span>{k.name()}</span>
              <Stepper compact label={k.name()} value={targets[kind]} min={kind === 'score' ? -30 : 1} onChange={(v) => setTargets({ ...targets, [kind]: v })} />
            </div>
          );
        })}
        <span className="muted small">{tr('Pars: par or better; runs within a round; birdies, greens and the score on 18 holes, gross. Each bet can be changed afterwards.', 'Pars: Par oder besser; Serien innerhalb einer Runde; Birdies, Grüns und Ergebnis auf 18 Löchern, brutto. Jede Wette lässt sich danach ändern.')}</span>
        <PayFields pool={pool} w={{ ...base, kind: 'birdies' }} set={set} />
        <button type="button" className="btn-primary" disabled={!ok} onClick={() => props.onAdd(TEMPLATE.map((kind) => ({ ...base, id: newId(), kind, target: targets[kind] })))}>
          {tr(`Add 5 bets for ${pool.players.find((p) => p.id === base.player)?.name ?? ''}`, `5 Wetten für ${pool.players.find((p) => p.id === base.player)?.name ?? ''} anlegen`)}
        </button>
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
