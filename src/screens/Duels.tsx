import { SaveButton } from '../components/ui';
import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { loadProfile, shownName } from '../lib/profile';
import { dayOf, sameName, type Wager } from '../lib/wagers';
import { answerDuel, challengeDuels, duelPoolsOn, loadPools, openChallenges, poolForDuel, sameDuel, takeBackDuel, type NewOpponent, type PoolEntry } from '../lib/wagerstore';
import { loadTours } from '../lib/tourstore';
import { loadFriends } from '../lib/friends';
import { inviteFriend, pushWagers } from '../lib/push';
import { prizeOf, prizeStakes, prizeSym } from '../lib/prize';
import { currencySymbol, fitsPlayers, formDef, money, playersText, type FormDef, type FormId } from '../lib/gameforms';
import { addSideGame, NEXT_ROUND, SIDE_FORMS, sideGamesOf } from '../lib/sidegames';
import { newId } from '../lib/storage';
import { ChoiceRow, DateRow, SettingsList, SettingsRow, ToggleList, ToggleRow, dayText } from '../components/Settings';
import { StakeRow } from '../components/StakePicker';

// 5+5+10 one against one (Sascha 09.11.2026, USA: "5+5+10 is always against the flight now, but it is played against
// one person only. Chris against Erik is a bet of its own, so is Chris against Moritz – and it must work across flights:
// Chris against Sascha, who plays in another flight"). A duel lives in the pool of bets: the one challenged accepts it
// (or declines), each phone keeps its owner's card of the day in the pool – from the round he plays anyway – and every
// phone compares the two cards the same way. The settlement goes into the pool's.

const NO_NET = () => tr('No connection – try again.', 'Keine Verbindung – bitte nochmal versuchen.');
const DUEL_STAKES = [0, 1, 2, 5, 10, 20, 50];

/** The duel's setup below the game form "5+5+10" (and as a side bet from a round – Sascha 10.11.2026): the pool (when
 *  several – without one a new one of the day), the day and its round, against whom – the pool's players, the round's,
 *  friends, or one made here –, who keeps the score, the stakes, gross or net with its share; "Herausfordern" at the end. */
export function DuelSetup(props: { onDone: (code: string) => void; /** from a round: its day, its tournament, its players */ preset?: { day?: string; on?: Wager['on']; players?: { name: string; hcp?: string }[] } }) {
  const today = dayOf(new Date());
  // a round played already, added afterwards (Sascha 11.11.2026: "Chris played 5+5+10 against Moritz, Erik, Cedric and
  // Stefan – not set up on the phone; he adds it for his statistics"): back to the first day of a running pool of bets
  const earliest = loadPools().filter((e) => e.me && !e.pool.finishedAt && !e.pool.deletedAt && e.pool.from < today && e.pool.to >= today).reduce((m, e) => (e.pool.from < m ? e.pool.from : m), today);
  const [day, setDay] = useState(props.preset?.day ?? today);
  const pools = duelPoolsOn(day);
  const [code, setCode] = useState('');
  // "Ohne Wett-Pool" (Sascha 10.11.2026: "I must be able to play it without a pool of bets"): a pool of its own for these
  // duels, its own settlement – the trip's pool untouched
  const own = code === 'own';
  const entry = own ? null : (pools.find((e) => e.code === code) ?? pools[0] ?? null);
  const pool = entry?.pool ?? null;
  // the tournaments of the day on this phone – "all rounds of the day" or one of them (Sascha 10.11.2026)
  const tours = loadTours().filter((t) => !t.ev.deletedAt && t.ev.date === day);
  const [onCode, setOnCode] = useState(props.preset?.on?.code ?? '');
  const on = tours.find((t) => t.code === onCode) ?? null;
  // chosen: "p:<pool player>", "n:<name>" (a player of the round or one made here), "f:<friend>"
  const [against, setAgainst] = useState<string[]>([]);
  const [made, setMade] = useState<{ name: string; hcp?: string }[]>([]);
  const [typed, setTyped] = useState('');
  const [scorer, setScorer] = useState<'by' | 'own'>('by');
  const [parts, setParts] = useState({ front: 5, back: 5, total: 10 });
  const [net, setNet] = useState(false);
  const [share, setShare] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const meName = shownName(loadProfile()) || pool?.players.find((p) => p.id === entry?.me)?.name || tr('Me', 'Ich');
  const currency = pool?.currency ?? loadPools().find((e) => !e.pool.deletedAt)?.pool.currency ?? 'EUR';
  const sym = pool ? prizeSym(prizeOf(pool)) : currencySymbol(currency);
  const stakes = pool ? prizeStakes(prizeOf(pool), DUEL_STAKES) : DUEL_STAKES;
  const others = pool ? pool.players.filter((p) => p.id !== entry!.me) : [];
  const inPool = (name: string) => others.some((p) => sameName(p.name, name));
  // the round's players and those made here – not one of the pool, not me
  const named = [...(props.preset?.players ?? []), ...made].filter((x, k, all) => x.name.trim() && !sameName(x.name, meName) && !inPool(x.name) && all.findIndex((y) => sameName(y.name, x.name)) === k);
  const friends = loadFriends().filter((f) => f.name.trim() && !sameName(f.name, meName) && !inPool(f.name) && !named.some((x) => sameName(x.name, f.name)) && !others.some((p) => !!f.uid && (p.joined?.uid === f.uid || p.invited?.uid === f.uid)));
  // a duel with him on that day already – not offered twice
  const taken = (pid: string) => !!pool && pool.wagers.some((w) => sameDuel(w, { player: entry!.me, opponent: pid, day }));
  const chosen = against.filter((k) => (k.startsWith('p:') ? others.some((p) => `p:${p.id}` === k && !taken(p.id)) : k.startsWith('n:') ? named.some((x) => `n:${x.name}` === k) : friends.some((f) => `f:${f.id}` === k)));
  const nameOf = (k: string) => (k.startsWith('p:') ? (others.find((p) => `p:${p.id}` === k)?.name ?? '') : k.startsWith('n:') ? k.slice(2) : (friends.find((f) => `f:${f.id}` === k)?.name ?? ''));
  const names = chosen.map(nameOf).filter(Boolean);
  const flip = (k: string, v: boolean) => setAgainst(v ? [...new Set([...against, k])] : against.filter((x) => x !== k));
  const add = () => {
    const name = typed.trim();
    if (!name) return;
    if (!named.some((x) => sameName(x.name, name)) && !inPool(name)) setMade([...made, { name }]);
    const p = others.find((x) => sameName(x.name, name));
    flip(p ? `p:${p.id}` : `n:${named.find((x) => sameName(x.name, name))?.name ?? name}`, true);
    setTyped('');
  };
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const e = entry ?? (await poolForDuel(day, { me: meName, currency, own: own || !pools.length }));
    if (!e) {
      setBusy(false);
      return setMsg(NO_NET());
    }
    const opps: (string | NewOpponent)[] = chosen.map((k) => {
      if (k.startsWith('p:')) return k.slice(2);
      if (k.startsWith('n:')) {
        const x = named.find((y) => `n:${y.name}` === k)!;
        return { name: x.name, ...(x.hcp ? { hcp: x.hcp } : {}) };
      }
      const f = friends.find((y) => `f:${y.id}` === k)!;
      return { name: f.name, ...(f.hcp ? { hcp: f.hcp } : {}), ...(f.uid ? { friend: { uid: f.uid, name: f.fullName || f.name } } : {}) };
    });
    const r = await challengeDuels(e.code, e.me, opps, {
      day,
      parts,
      net,
      ...(net ? { allowance: share } : {}),
      scorer,
      ...(on ? { on: { code: on.code, name: on.ev.name, course: on.ev.course.name } } : {}),
      by: meName,
    });
    setBusy(false);
    if (!r) return setMsg(NO_NET());
    if (r.ids.length) pushWagers(e.code, r.ids); // the one challenged hears of it
    for (const f of r.invite) void inviteFriend(e.code, f.uid, f.name, meName); // a friend brought in: let in, told
    props.onDone(e.code);
  };
  return (
    <>
      {/* Was – gross or net first (Facelift 11.11.2026, g2: Was → Wo → Wann → Wer → Worum → Einstellungen) */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Scoring', 'Wertung')}</span>
        <SettingsList>
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
      {/* Wo – the pool of bets the duel goes into; without one a new one of the day */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Bets', 'Wetten')}</span>
        <SettingsList>
          <ChoiceRow<string>
            label={tr('Pool', 'Pool')}
            title={tr('Which pool of bets', 'Welche Wetten')}
            value={entry?.code ?? 'own'}
            onChange={(c) => {
              setCode(c);
              setAgainst([]);
            }}
            options={[
              ...pools.map((e) => ({ value: e.code, name: e.pool.name, text: `${dayText(e.pool.from)} – ${dayText(e.pool.to)}` })),
              { value: 'own', name: tr('Without a pool of bets', 'Ohne Wett-Pool'), text: tr(`5+5+10 on its own – only these duels, settled on their own ("5+5+10 · ${day.slice(8, 10)}.${day.slice(5, 7)}.", you the host).`, `5+5+10 für sich – nur diese Duelle, eigene Abrechnung („5+5+10 · ${day.slice(8, 10)}.${day.slice(5, 7)}.“, du bist Host).`) },
            ]}
          />
        </SettingsList>
      </section>
      {/* Wann – one round: the day, and which round of it */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Day', 'Tag')}</span>
        <SettingsList>
          <DateRow label={tr('Round of', 'Runde am')} value={day} min={earliest} onChange={(d) => { setDay(d); setOnCode(''); }} />
          {tours.length > 0 && (
            <ChoiceRow<string>
              label={tr('Round', 'Runde')}
              title={tr('Which round of the day', 'Welche Runde des Tages')}
              value={on ? on.code : ''}
              onChange={setOnCode}
              options={[
                { value: '', name: tr('All rounds of the day', 'Alle Runden des Tages'), text: tr('The first round you both play that day.', 'Die erste Runde, die ihr beide an dem Tag spielt.') },
                ...tours.map((t) => ({ value: t.code, name: t.ev.name, text: t.ev.course.name })),
              ]}
            />
          )}
        </SettingsList>
        {day < today && (
          <span className="small muted">
            {tr('Played already – once accepted, the result comes from both scorecards of that day.', 'Schon gespielt – sobald angenommen, kommt das Ergebnis aus euren Scorekarten des Tages.')}
          </span>
        )}
      </section>
      {/* Wer – one duel per opponent; across flights, anyone */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Against', 'Gegen wen')}</span>
        <SettingsList>
          <SettingsRow label={tr('Opponents', 'Gegner')} value={names.length ? names.join(', ') : tr('Choose opponents', 'Gegner wählen')} need={!names.length} onClick={() => setWhoOpen(true)} />
          <ChoiceRow<'by' | 'own'>
            label={tr('Who keeps the score', 'Wer erfasst')}
            value={scorer}
            onChange={setScorer}
            options={[
              { value: 'by', name: tr('Me for both', 'Ich für beide'), text: tr('From my round – one not in my flight counts with his own.', 'Aus meiner Runde – wer nicht in meinem Flight spielt, zählt mit seiner eigenen.') },
              { value: 'own', name: tr('Each his own', 'Jeder seinen'), text: tr('Each from his own round – across flights too.', 'Jeder aus seiner eigenen Runde – auch über Flights.') },
            ]}
          />
        </SettingsList>
      </section>
      {/* Worum – the stakes (Facelift 11.11.2026, g2) */}
      <section className="setup-part">
        <span className="eyebrow">{tr('Played for', 'Worum')}</span>
        <SettingsList>
          <StakeRow label={tr('Front nine', 'Vorne (9)')} value={parts.front} sym={sym} stakes={stakes} onChange={(front) => setParts({ ...parts, front })} />
          <StakeRow label={tr('Back nine', 'Hinten (9)')} value={parts.back} sym={sym} stakes={stakes} onChange={(back) => setParts({ ...parts, back })} />
          <StakeRow label={tr('All 18', 'Gesamt (18)')} value={parts.total} sym={sym} stakes={stakes} onChange={(total) => setParts({ ...parts, total })} />
        </SettingsList>
      </section>
      {/* Einstellungen – with how much of the handicap, when net */}
      {net && (
        <section className="setup-part">
          <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
          <SettingsList>
            <ChoiceRow<number>
              label={tr('Handicap share', 'Vorgabe')}
              title={tr('With how much of the handicap', 'Mit wie viel Prozent der Vorgabe')}
              value={share}
              onChange={setShare}
              options={[100, 95, 90, 85, 80, 75, 50].map((v) => ({ value: v, name: `${v} %`, ...(v === 100 ? { text: tr('The whole playing handicap.', 'Die ganze Spielvorgabe.') } : {}) }))}
            />
          </SettingsList>
        </section>
      )}
      {/* no connection: a green notice – nothing done wrong (Facelift 11.11.2026, o4) */}
      {msg && (
        <p className="notice" role="alert">
          {msg}
        </p>
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
              <span className="sheet-head-acts">
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setWhoOpen(false)}>
                  ✕
                </button>
                <SaveButton label={tr('Done', 'Fertig')} onClick={() => setWhoOpen(false)} />
              </span>
            </div>
            {others.length > 0 && <span className="eyebrow">{pool!.name}</span>}
            {others.length > 0 && (
              <ToggleList>
                {others.map((p) => (
                  <ToggleRow key={p.id} inList pick label={p.name} text={taken(p.id) ? tr('A duel on this day already', 'An diesem Tag schon ein Duell') : undefined} disabled={taken(p.id)} on={chosen.includes(`p:${p.id}`)} onChange={(v) => flip(`p:${p.id}`, v)} />
                ))}
              </ToggleList>
            )}
            {named.length > 0 && <span className="eyebrow">{props.preset?.players?.length ? tr('In your round', 'In deiner Runde') : tr('Players', 'Spieler')}</span>}
            {named.length > 0 && (
              <ToggleList>
                {named.map((x) => (
                  <ToggleRow key={x.name} inList pick label={x.name} text={tr('Without a phone – you keep his score', 'Ohne Handy – du erfasst seinen Score')} on={chosen.includes(`n:${x.name}`)} onChange={(v) => flip(`n:${x.name}`, v)} />
                ))}
              </ToggleList>
            )}
            {friends.length > 0 && <span className="eyebrow">{tr('Friends', 'Freunde')}</span>}
            {friends.length > 0 && (
              <ToggleList>
                {friends.map((f) => (
                  <ToggleRow key={f.id} inList pick label={f.name} text={f.uid ? tr('Gets the challenge on his phone', 'Bekommt die Herausforderung aufs Handy') : tr('Without a phone – you keep his score', 'Ohne Handy – du erfasst seinen Score')} on={chosen.includes(`f:${f.id}`)} onChange={(v) => flip(`f:${f.id}`, v)} />
                ))}
              </ToggleList>
            )}
            <span className="eyebrow">{tr('Add a player', 'Spieler anlegen')}</span>
            <div className="duel-add">
              <input className="input" aria-label={tr('Name of the player', 'Name des Spielers')} placeholder={tr('Name', 'Name')} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button type="button" className="btn-secondary" disabled={!typed.trim()} onClick={add}>
                {tr('Add', 'Hinzufügen')}
              </button>
            </div>

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
    w.net ? `${tr('net', 'netto')}${w.allowance != null && w.allowance !== 100 ? ` ${w.allowance} %` : ''}` : tr('gross', 'brutto'),
    w.on?.name ?? '',
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
    // the title above the card, as every section's (Facelift 11.11.2026, o6)
    <section className="setup-part duel-challenges-part" aria-label={tr('Challenges', 'Herausforderungen')}>
      <span className="eyebrow">{tr('5+5+10 challenges', '5+5+10-Herausforderungen')}</span>
      <div className="card duel-challenges">
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
        {/* one's own challenge in the same box as one to answer (Sascha 11.11.2026, design round 2: "Gegen Chris mit
            Zurückziehen geht optisch unter – im gleichen Stil wie ‚Erik fordert dich …‘") */}
        {mine.map((w) => (
          <div key={w.id} className="duel-challenge duel-mine">
            <span className="grow">
              <span className="title">
                {w.challenge!.state === 'open' ? tr(`You challenge ${name(w.opponent)}`, `Du forderst ${name(w.opponent)} heraus`) : tr(`${name(w.opponent)} declined`, `${name(w.opponent)} hat abgelehnt`)}
              </span>
              <span className="muted small">{duelText(w, sym)}</span>
            </span>
            <span className="duel-wait muted small">
              <DuelMark state={w.challenge!.state === 'open' ? 'open' : 'declined'} />
              {w.challenge!.state === 'open' ? tr(`Waiting for ${name(w.opponent)}`, `Wartet auf ${name(w.opponent)}`) : tr('Declined', 'Abgelehnt')}
            </span>
            <button type="button" className="btn-secondary duel-takeback" disabled={busy === w.id} onClick={() => void act(w.id, () => takeBackDuel(entry.code, w.id))}>
              {w.challenge!.state === 'open' ? tr('Take back', 'Zurückziehen') : tr('Remove', 'Entfernen')}
            </button>
          </div>
        ))}
      </div>
      {msg && (
        <p className="notice" role="alert">
          {msg}
        </p>
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

// ---------- a side bet from Rounds (Sascha 10.11.2026: "5+5+10 as a side game in the round's settings – between the
// players and the invitation; in a tournament's round in the menu by the code, the bag and the caddie") ----------

/** The duels of a day of this phone's owner (not declined) – his own and those against him. */
export const myDuelsOn = (day: string): { e: PoolEntry; w: Wager }[] =>
  duelPoolsOn(day).flatMap((e) => e.pool.wagers.filter((w) => !!w.challenge && w.kind === 'nassau' && w.day === day && w.challenge.state !== 'declined' && (w.player === e.me || w.opponent === e.me)).map((w) => ({ e, w })));

type SideBetPreset = { day?: string; on?: Wager['on']; players?: { name: string; hcp?: string; playing?: number | null }[]; me?: { playing?: number | null } };
/** The side bet's sheet (Sascha 10.11.2026: "choose the game form first"): the form – 5+5+10 a duel (also across
 *  flights, into a pool), the others a game judged from the round's strokes – then its setup. */
export function SideBetSheet(props: { preset: SideBetPreset; /** the round it belongs to – unset: the round being set up */ roundId?: string; onClose: () => void }) {
  const [form, setForm] = useState<FormId>('fivefiveten');
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet sidebet-sheet" role="dialog" aria-label={tr('Side bet', 'Side-Bet')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{tr('Side bet', 'Side-Bet')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <section className="setup-part">
          <span className="eyebrow">{tr('Game form', 'Spielform')}</span>
          <SettingsList>
            <ChoiceRow<FormId>
              label={tr('Game form', 'Spielform')}
              title={tr('Choose a game form', 'Spielform wählen')}
              value={form}
              onChange={setForm}
              options={SIDE_FORMS.map((id) => ({ value: id, name: formDef(id).name(), text: formDef(id).short() }))}
            />
          </SettingsList>
        </section>
        {form === 'fivefiveten' ? <DuelSetup preset={props.preset} onDone={() => props.onClose()} /> : <SideGameSetup key={form} form={form} preset={props.preset} roundId={props.roundId} onDone={props.onClose} />}
      </section>
    </div>
  );
}

/** A side game's setup: who plays (the round's players, the own one too), the stakes and the form's choices – "Starten"
 *  keeps it beside the round; its standing in the round's leaderboard, tab "Wetten". */
function SideGameSetup(props: { form: FormId; preset: SideBetPreset; roundId?: string; onDone: () => void }) {
  const f = formDef(props.form);
  const meName = shownName(loadProfile()) || tr('Me', 'Ich');
  const people = [{ name: meName, playing: props.preset.me?.playing ?? null }, ...(props.preset.players ?? []).filter((p) => p.name.trim() && !sameName(p.name, meName)).map((p) => ({ name: p.name.trim(), playing: p.playing ?? (p.hcp != null && p.hcp.trim() !== '' && Number.isFinite(Number(p.hcp.replace(',', '.'))) ? Math.round(Number(p.hcp.replace(',', '.'))) : null) }))];
  const [chosen, setChosen] = useState<string[]>(() => people.map((p) => p.name));
  const [settings, setSettings] = useState<Record<string, number | boolean | string>>(() => {
    const currency = loadPools().find((e) => !e.pool.deletedAt)?.pool.currency ?? 'EUR';
    return { ...Object.fromEntries(f.settings.map((s) => [s.key, s.default])), currency };
  });
  const sym = currencySymbol(settings.currency);
  const n = chosen.length;
  const fits = fitsPlayers(f, n);
  const go = () => {
    addSideGame({
      id: newId(),
      round: props.roundId ?? NEXT_ROUND,
      form: props.form,
      players: people.filter((p) => chosen.includes(p.name)).map((p, k) => ({ id: `p${k + 1}`, name: p.name, hcp: p.playing })),
      settings,
      createdAt: new Date().toISOString(),
    });
    props.onDone();
  };
  return (
    <>
      <div className="card">
        <FormRulesText form={f} />
      </div>
      <section className="setup-part">
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        <ToggleList>
          {people.map((p) => (
            <ToggleRow key={p.name} inList pick label={p.name} text={p.playing != null ? tr(`Playing handicap ${p.playing}`, `Spielvorgabe ${p.playing}`) : undefined} on={chosen.includes(p.name)} onChange={(v) => setChosen(v ? [...new Set([...chosen, p.name])] : chosen.filter((x) => x !== p.name))} />
          ))}
        </ToggleList>
        {!fits && <span className="small good-text">{tr(`${f.name()} needs ${playersText(f)} – ${n} chosen.`, `${f.name()} braucht ${playersText(f)} – ${n} gewählt.`)}</span>}
      </section>
      <section className="setup-part">
        <span className="eyebrow">{tr('Settings', 'Einstellungen')}</span>
        <SettingsList>
          {f.settings
            .filter((s) => (s.type === 'stake' || s.type === 'choice') && (!s.when || s.when(settings)))
            .map((s) =>
              s.type === 'stake' ? (
                <StakeRow key={s.key} label={s.label()} value={Number(settings[s.key] ?? 0)} sym={sym} onChange={(v) => setSettings({ ...settings, [s.key]: v })} />
              ) : (
                <ChoiceRow<string> key={s.key} label={s.label()} value={String(settings[s.key])} onChange={(v) => setSettings({ ...settings, [s.key]: v })} options={s.options!.map((o) => ({ value: o.value, name: o.label() }))} />
              ),
            )}
        </SettingsList>
      </section>
      {/* at the end, after the settings – not floating (docs/DESIGN.md) */}
      <button type="button" className="btn-primary" disabled={!fits} onClick={go}>
        {tr(`Start ${f.name()}`, `${f.name()} starten`)}
      </button>
    </>
  );
}
/** A form's rules as a list (the side game's sheet – the same words as in Games). */
function FormRulesText(props: { form: FormDef }) {
  return (
    <ul className="game-rules">
      {props.form.rules().map((r, k) => (
        <li key={k}>{r}</li>
      ))}
    </ul>
  );
}

/** "Sidebet" in the round's setup: one row – the day's duels and the round's side games, or "hinzufügen" –, its sheet the
 *  form, then its setup. */
export function SideBetRow(props: { preset: SideBetPreset }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const day = props.preset.day ?? dayOf(new Date());
  const duels = myDuelsOn(day).length;
  const games = sideGamesOf(NEXT_ROUND).map((s) => formDef(s.form).name());
  const value = [duels ? (duels === 1 ? tr('1 duel 5+5+10', '1 Duell 5+5+10') : tr(`${duels} duels 5+5+10`, `${duels} Duelle 5+5+10`)) : '', ...games].filter(Boolean).join(', ');
  return (
    <section className="setup-part">
      <span className="eyebrow">{tr('Played for', 'Worum')}</span>
      <SettingsList>
        <SettingsRow label={tr('Side bet', 'Side-Bet')} value={value || tr('Add', 'Hinzufügen')} onClick={() => setOpen(true)} />
      </SettingsList>
      {open && (
        <SideBetSheet
          preset={props.preset}
          onClose={() => {
            setOpen(false);
            setTick((t) => t + 1);
          }}
        />
      )}
    </section>
  );
}
