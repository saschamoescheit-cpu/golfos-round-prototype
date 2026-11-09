import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { loadProfile, shownName } from '../lib/profile';
import { dayOf, type Wager } from '../lib/wagers';
import { answerDuel, challengeDuels, duelPools, openChallenges, sameDuel, takeBackDuel, type PoolEntry } from '../lib/wagerstore';
import { pushWagers } from '../lib/push';
import { prizeOf, prizeStakes, prizeSym } from '../lib/prize';
import { money } from '../lib/gameforms';
import { ChoiceRow, DateRow, SettingsList, SettingsRow, ToggleList, ToggleRow, dayText } from '../components/Settings';
import { StakeRow } from '../components/StakePicker';

// 5+5+10 one against one (Sascha 09.11.2026, USA: "5+5+10 is always against the flight now, but it is played against
// one person only. Chris against Erik is a bet of its own, so is Chris against Moritz – and it must work across flights:
// Chris against Sascha, who plays in another flight"). A duel lives in the pool of bets: the one challenged accepts it
// (or declines), each phone keeps its owner's card of the day in the pool – from the round he plays anyway – and every
// phone compares the two cards the same way. The settlement goes into the pool's.

const NO_NET = () => tr('No connection – try again.', 'Keine Verbindung – bitte nochmal versuchen.');
const DUEL_STAKES = [0, 1, 2, 5, 10, 20, 50];

/** The duel's setup below the game form "5+5+10": the pool (when several), the day, against whom, the stakes, gross
 *  or net – and "Herausfordern" at the end. */
export function DuelSetup(props: { onDone: (code: string) => void }) {
  const today = dayOf(new Date());
  const pools = duelPools(today);
  const [code, setCode] = useState(pools[0]?.code ?? '');
  const entry = pools.find((e) => e.code === code) ?? pools[0];
  const first = entry ? (entry.pool.from > today ? entry.pool.from : today) : today;
  const [day, setDay] = useState(first);
  const [against, setAgainst] = useState<string[]>([]);
  const [parts, setParts] = useState({ front: 5, back: 5, total: 10 });
  const [net, setNet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  if (!entry) return null;
  const pool = entry.pool;
  const sym = prizeSym(prizeOf(pool));
  const others = pool.players.filter((p) => p.id !== entry.me);
  // a duel with him on that day already – not offered twice
  const taken = (pid: string) => pool.wagers.some((w) => sameDuel(w, { player: entry.me, opponent: pid, day }));
  const chosen = against.filter((id) => others.some((p) => p.id === id) && !taken(id));
  const names = chosen.map((id) => others.find((p) => p.id === id)?.name ?? '').filter(Boolean);
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const r = await challengeDuels(entry.code, entry.me, chosen, { day, parts, net, by: shownName(loadProfile()) || pool.players.find((p) => p.id === entry.me)?.name || '' });
    setBusy(false);
    if (!r) return setMsg(NO_NET());
    if (r.ids.length) pushWagers(entry.code, r.ids); // the one challenged hears of it
    props.onDone(entry.code);
  };
  return (
    <>
      {/* Wo – the pool of bets the duel goes into */}
      {pools.length > 1 && (
        <section className="setup-part">
          <span className="eyebrow">{tr('Bets', 'Wetten')}</span>
          <SettingsList>
            <ChoiceRow<string>
              label={tr('Pool', 'Pool')}
              title={tr('Which pool of bets', 'Welche Wetten')}
              value={entry.code}
              onChange={(c) => {
                setCode(c);
                setAgainst([]);
              }}
              options={pools.map((e) => ({ value: e.code, name: e.pool.name, text: `${dayText(e.pool.from)} – ${dayText(e.pool.to)}` }))}
            />
          </SettingsList>
        </section>
      )}
      {/* Wann – one round: the day */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Day', 'Tag')}</span>
        <SettingsList>
          <DateRow label={tr('Round of', 'Runde am')} value={day} min={first} max={pool.to} onChange={setDay} />
        </SettingsList>
      </section>
      {/* Wer – one duel per opponent; across flights, any player of the pool */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Against', 'Gegen wen')}</span>
        <SettingsList>
          <SettingsRow label={tr('Opponents', 'Gegner')} value={names.length ? names.join(', ') : tr('Choose opponents', 'Gegner wählen')} need={!names.length} onClick={() => setWhoOpen(true)} />
        </SettingsList>
        {names.length > 1 && <span className="muted small">{tr(`${names.length} duels – each one on its own.`, `${names.length} Duelle – jedes für sich.`)}</span>}
      </section>
      {/* Worum – the stakes and gross or net */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Stakes', 'Einsätze')}</span>
        <SettingsList>
          <StakeRow label={tr('Front nine', 'Vorne (9)')} value={parts.front} sym={sym} stakes={prizeStakes(prizeOf(pool), DUEL_STAKES)} onChange={(front) => setParts({ ...parts, front })} />
          <StakeRow label={tr('Back nine', 'Hinten (9)')} value={parts.back} sym={sym} stakes={prizeStakes(prizeOf(pool), DUEL_STAKES)} onChange={(back) => setParts({ ...parts, back })} />
          <StakeRow label={tr('All 18', 'Gesamt (18)')} value={parts.total} sym={sym} stakes={prizeStakes(prizeOf(pool), DUEL_STAKES)} onChange={(total) => setParts({ ...parts, total })} />
          <ChoiceRow<'gross' | 'net'>
            label={tr('Scoring', 'Wertung')}
            value={net ? 'net' : 'gross'}
            onChange={(v) => setNet(v === 'net')}
            options={[
              { value: 'gross', name: tr('Gross', 'Brutto'), text: tr('The strokes as played.', 'Die Schläge, wie gespielt.') },
              { value: 'net', name: tr('Net', 'Netto'), text: tr('Minus the strokes received on each hole – from the playing handicap of each one’s round.', 'Abzüglich der Vorgabeschläge je Loch – aus der Spielvorgabe der eigenen Runde.') },
            ]}
          />
        </SettingsList>
      </section>
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
      {/* at the end, after the settings – not floating (docs/DESIGN.md) */}
      <button type="button" className="btn-primary" disabled={!chosen.length || busy} onClick={() => void go()}>
        {chosen.length > 1 ? tr(`Challenge ${chosen.length}`, `${chosen.length} herausfordern`) : tr('Challenge', 'Herausfordern')}
      </button>
      {whoOpen && (
        <div className="sheet-backdrop" onClick={() => setWhoOpen(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Opponents', 'Gegner')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Against whom', 'Gegen wen')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setWhoOpen(false)}>
                ✕
              </button>
            </div>
            <ToggleList>
              {others.map((p) => (
                <ToggleRow
                  key={p.id}
                  inList
                  label={p.name}
                  text={taken(p.id) ? tr('A duel on this day already', 'An diesem Tag schon ein Duell') : undefined}
                  disabled={taken(p.id)}
                  on={chosen.includes(p.id)}
                  onChange={(on) => setAgainst(on ? [...new Set([...against, p.id])] : against.filter((x) => x !== p.id))}
                />
              ))}
            </ToggleList>
            <button type="button" className="btn-primary" onClick={() => setWhoOpen(false)}>
              {tr('Done', 'Fertig')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}

/** The challenges to answer, on Games' start page (Sascha 09.11.2026) – each opens its pool; there the moment the pools
 *  come from the server. */
export function ChallengeInvites(props: { onOpen: (code: string) => void }) {
  const [list, setList] = useState(openChallenges);
  useEffect(() => {
    const on = () => setList(openChallenges());
    window.addEventListener('golfos:pools-changed', on);
    return () => window.removeEventListener('golfos:pools-changed', on);
  }, []);
  return (
    <>
      {list.map(({ e, w }) => {
        const by = e.pool.players.find((p) => p.id === w.player)?.name ?? '?';
        return (
          <button key={w.id} type="button" className="list-item duel-invite" onClick={() => props.onOpen(e.code)}>
            <span className="grow">
              <span className="title">{tr(`${by} challenges you to 5+5+10`, `${by} fordert dich zu 5+5+10 heraus`)}</span>
              <span className="muted small">{`${e.pool.name} · ${duelText(w, prizeSym(prizeOf(e.pool)))}`}</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        );
      })}
    </>
  );
}

/** A duel in words: "5+5+10 · 5/5/10 $ · brutto · 10.11." */
export const duelText = (w: Wager, sym: string): string =>
  [
    `${money(w.parts?.front ?? 0, sym)} / ${money(w.parts?.back ?? 0, sym)} / ${money(w.parts?.total ?? 0, sym)}`,
    w.net ? tr('net', 'netto') : tr('gross', 'brutto'),
    w.day ? (w.day === dayOf(new Date()) ? tr('today', 'heute') : `${w.day.slice(8, 10)}.${w.day.slice(5, 7)}.`) : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** The challenges of a pool, on top of it (Sascha 09.11.2026): to this phone's owner – "Annehmen" / "Ablehnen"; his
 *  own still open – a clock, "Zurückziehen"; declined – said so, "Entfernen". */
export function Challenges(props: { entry: PoolEntry; onChanged?: () => void }) {
  const { entry } = props;
  const pool = entry.pool;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const name = (id?: string) => pool.players.find((p) => p.id === id)?.name ?? '?';
  const sym = prizeSym(prizeOf(pool));
  const toMe = pool.wagers.filter((w) => w.opponent === entry.me && w.challenge?.state === 'open');
  const mine = pool.wagers.filter((w) => w.player === entry.me && (w.challenge?.state === 'open' || w.challenge?.state === 'declined'));
  if (!toMe.length && !mine.length) return null;
  const act = async (id: string, f: () => Promise<unknown>) => {
    setBusy(id);
    setMsg(null);
    const ok = await f();
    setBusy(null);
    if (!ok) setMsg(NO_NET());
    else props.onChanged?.();
  };
  return (
    <section className="card duel-challenges" aria-label={tr('Challenges', 'Herausforderungen')}>
      <h2>{tr('5+5+10 challenges', '5+5+10-Herausforderungen')}</h2>
      {toMe.map((w) => (
        <div key={w.id} className="duel-challenge">
          <span className="grow">
            <span className="title">{tr(`${name(w.player)} challenges you`, `${name(w.player)} fordert dich heraus`)}</span>
            <span className="muted small">{duelText(w, sym)}</span>
          </span>
          <div className="duel-answer">
            <button type="button" className="btn-secondary" disabled={busy === w.id} onClick={() => void act(w.id, () => answerDuel(entry.code, w.id, 'declined'))}>
              {tr('Decline', 'Ablehnen')}
            </button>
            <button type="button" className="btn-primary" disabled={busy === w.id} onClick={() => void act(w.id, () => answerDuel(entry.code, w.id, 'accepted'))}>
              {tr('Accept', 'Annehmen')}
            </button>
          </div>
        </div>
      ))}
      {mine.map((w) => (
        <div key={w.id} className="duel-challenge">
          <DuelMark state={w.challenge!.state === 'open' ? 'open' : 'declined'} />
          <span className="grow">
            <span className="title">{tr(`Against ${name(w.opponent)}`, `Gegen ${name(w.opponent)}`)}</span>
            <span className="muted small">
              {w.challenge!.state === 'open' ? tr('waiting for the answer', 'wartet auf Annahme') : tr('declined', 'abgelehnt')} · {duelText(w, sym)}
            </span>
          </span>
          <button type="button" className="btn-secondary duel-takeback" disabled={busy === w.id} onClick={() => void act(w.id, () => takeBackDuel(entry.code, w.id))}>
            {w.challenge!.state === 'open' ? tr('Take back', 'Zurückziehen') : tr('Remove', 'Entfernen')}
          </button>
        </div>
      ))}
      {msg && (
        <span className="small bad-text" role="alert">
          {msg}
        </span>
      )}
    </section>
  );
}

/** A duel's state as an icon (as the invitations – Sascha 09.11.2026): accepted a green tick, open a clock, declined a
 *  cross in red. */
export function DuelMark(props: { state: 'accepted' | 'open' | 'declined' }) {
  const label = props.state === 'accepted' ? tr('accepted', 'angenommen') : props.state === 'open' ? tr('waiting for the answer', 'wartet auf Annahme') : tr('declined', 'abgelehnt');
  return (
    <svg className={`invite-mark ${props.state === 'accepted' ? 'good-text' : props.state === 'declined' ? 'bad-text' : 'muted'}`} role="img" aria-label={label} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      {props.state === 'accepted' ? <path d="M8 12.5l2.6 2.6L16 9.5" /> : props.state === 'open' ? <path d="M12 7v5l3 2" /> : <path d="M9 9l6 6M15 9l-6 6" />}
    </svg>
  );
}
