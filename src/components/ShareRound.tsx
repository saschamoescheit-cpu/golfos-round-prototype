import { useEffect, useRef, useState } from 'react';
import type { CourseSummary, Round } from '../types';
import { cleanCode, showCode } from '../lib/sharedgame';
import { shareView, type ShareView } from '../lib/sharedround';
import { addFlight, CLASS_NAMES, netClasses, askByCode, askToJoin, cachedEvent, differences, exchangeRound, settle, eventStandings, flightOfName, flightStatus, isSeries, joinEvent, markerOf, signAsScorer, liveFlights, localDay, plannedAhead, nearbyRounds, hideNearby, nearbyUntil, setNearbyUntil, newFlightRound, roundFromEvent, refreshEvent, roundJoinLink, shareRound, showNearby, signable, signCard, isSigned, standingsCsv, writerOf, type Flight, type NearbyRound, type RoundEvent, type TourSeries, reopenFlight, samePerson, nameIs } from '../lib/sharedround';
import { isTeamMode, modeName, type GameMode } from '../lib/games';
import { loadCachedCourse, loadRounds, newId } from '../lib/storage';
import { loadCourse } from '../lib/courses';
import { loadProfile, saveProfile, shownName } from '../lib/profile';
import { loadSession, signIn, signInAnonymously } from '../lib/sync';
import { pushAsked } from '../lib/push';
import { getLang, tr } from '../lib/i18n';
import { copyLink, FriendInvite, InviteCard, shareLink } from './InviteCard';
import { SettingsList, SheetRow } from './Settings';
import { ScanCodeButton } from './QrScan';

/** A planned tournament's day: "Fr., 6.11." */
export const dayText = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString(getLang() === 'de' ? 'de-DE' : undefined, { weekday: 'short', day: 'numeric', month: 'numeric' });
import { Avatar } from './Avatar';
import { leaderText } from './Specials';
import { specialName } from '../lib/specials';

// Invite to a round and join one (Sascha 29.10.2026): the flight partners on their own phones – each keeps his own
// score, a team's card one of the team – or a tournament over several flights with a live leaderboard. The invitation
// sits where the round is set up, with the flight partners ("not only once the round has begun"), and stays in the
// round's menu. The host shows the code and the QR code; the others scan it or type the code under "Join a round".

/** Where the course comes from, for the phones that join (they load it themselves). */
function courseSummary(round: Round): CourseSummary {
  const c = loadCachedCourse(round.courseId);
  return c
    ? { id: c.id, source: c.source, name: c.name, lat: c.lat, lon: c.lon, ...(c.bbox ? { bbox: c.bbox } : {}) }
    : { id: round.courseId, source: 'osm', name: round.courseName, lat: 0, lon: 0 };
}

/** The phone's owner as the others see him ("kept by Sascha"). */
export const myName = (): string => shownName(loadProfile()) || tr('a player', 'ein Spieler');

/** Where this phone is now (for rounds nearby) – null without GPS or when it takes too long. */
function here(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((done) => {
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/**
 * The invitation: the code, the QR code and "share the
 * link". `round` is the round – or, in the setup, the round as it would start now (its players and holes go to the
 * event; what changes before the start follows with the first exchange).
 */
export function InvitePanel(props: { round: Round; onShared: (r: Round) => void; compact?: boolean; /** make the code by itself (a flight with partners, or the sheet opened in the round) */ auto?: boolean }) {
  const shared = props.round.shared;
  const [name] = useState(() => `${props.round.courseName} · ${new Date(props.round.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // the round shown to signed-in phones nearby (Sascha 29.10.2026) – here, or (no GPS) on the course; asked by the switch under the code
  const [nearState, setNearState] = useState<'here' | 'course' | 'failed' | 'busy' | null>(() => (shared && nearbyUntil(shared.code) > Date.now() ? 'here' : null));
  // everyone in with a phone of his own: the block folds to one row (docs/DESIGN.md, Sascha 03.11.2026)
  const [liveEv, setLiveEv] = useState(() => (shared ? cachedEvent(shared.code) : null));
  useEffect(() => {
    if (!shared) return;
    const on = () => setLiveEv(cachedEvent(shared.code));
    on();
    window.addEventListener('golfos:event-changed', on);
    return () => window.removeEventListener('golfos:event-changed', on);
  }, [shared?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const putNearby = async (code: string) => {
    setNearState('busy');
    const pos = await here();
    const course = courseSummary(props.round);
    const at = pos ? { ...pos, radius: 300 } : course.lat || course.lon ? { lat: course.lat, lon: course.lon, radius: 2000 } : null;
    setNearState(at && (await showNearby(code, at, myName())) ? (pos ? 'here' : 'course') : 'failed');
  };
  // off again (Sascha 04.11.2026)
  const offNearby = async (code: string) => {
    setNearState('busy');
    const ok = await hideNearby(code);
    if (ok) setNearbyUntil(code, 0);
    setNearState(ok ? null : 'here');
  };
  const nearOn = nearState === 'here' || nearState === 'course';
  const create = async () => {
    setBusy(true);
    const r = await shareRound(props.round, courseSummary(props.round), { name: name.trim() || props.round.courseName, tournament: false, who: myName() });
    setBusy(false);
    if (r) props.onShared(r);
    else setMsg(tr('No connection – it is tried again by itself.', 'Keine Verbindung – es wird gleich von selbst noch einmal versucht.'));
    return !!r;
  };
  // the code made by itself – no "Code erzeugen" anywhere (Sascha 03.11.2026); without a connection tried again every few seconds
  // once per sheet (React's test run mounts twice – two codes otherwise), again only after a failure, while it is open
  const started = useRef(false);
  const alive = useRef(true);
  const retry = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(retry.current);
    };
  }, []);
  useEffect(() => {
    if (shared || started.current) return;
    started.current = true;
    const go = async () => {
      if (!(await create()) && alive.current) retry.current = window.setTimeout(() => void go(), 8000);
    };
    void go();
  }, [shared]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async () => {
    if (!shared) return;
    const text = shared.tournament ? tr(`Join the tournament – code ${shared.code}`, `Spiel im Turnier mit – Code ${shared.code}`) : tr(`Join my round – code ${shared.code}`, `Spiel in meiner Runde mit – Code ${shared.code}`);
    setMsg(await shareLink(text, roundJoinLink(shared.code)));
  };
  // while the code is made: the same card, waiting (as the friend code)
  if (!shared)
    return (
      <InviteCard
        link={null}
        code={null}
        waiting={busy || !msg ? tr('Making the code …', 'Code wird erstellt …') : msg}
        actions={[
          { label: tr('Invite', 'Einladen'), aria: tr('Share the link', 'Link teilen'), icon: 'share', primary: true, disabled: true, onClick: () => undefined },
          { label: tr('Copy link', 'Link kopieren'), icon: 'copy', disabled: true, onClick: () => undefined },
        ]}
      />
    );
  const flight = liveEv?.flights[shared.flight];
  const allIn = !!flight && flight.players.length > 1 && flight.players.every((pl) => Object.values(flight.phones ?? {}).some((ph) => ph.player === pl.id));
  const block = (
    <>
      <InviteCard
        link={roundJoinLink(shared.code)}
        code={shared.code}
        codeClass="join-code"
        codeLabel={tr(`Code ${shared.code}`, `Code ${shared.code}`)}
        hint={
          <>
            {shared.tournament
              ? tr('Scan, or type the code under "Join a round" – no account needed. You let each one in; another flight starts its own.', 'Scannen oder Code unter „Runde beitreten“ eingeben – ohne Konto. Du bestätigst jeden; ein anderer Flight legt seinen eigenen an.')
              : tr('Scan, or type the code under "Join a round" – no account needed. You let each one in, and he is in the round.', 'Scannen oder Code unter „Runde beitreten“ eingeben – ohne Konto. Du bestätigst jeden, dann ist er in der Runde.')}
            {props.compact ? tr(' What you change here goes with the start.', ' Was du hier noch änderst, geht beim Start mit.') : ''}
          </>
        }
        actions={[
          { label: tr('Invite', 'Einladen'), aria: tr('Share the link', 'Link teilen'), icon: 'share', primary: true, onClick: () => void share() },
          { label: tr('Copy link', 'Link kopieren'), icon: 'copy', onClick: () => void copyLink(roundJoinLink(shared.code)).then(setMsg) },
        ]}
        top={
          // shown to players nearby: a switch above the QR code, off by default, no explanation (Sascha 04.11.2026) – part of
          // "Mitspieler einladen", no box of its own, space to the QR code; on and off again
          <button
            type="button"
            className="near-switch"
            role="switch"
            aria-checked={nearOn}
            disabled={nearState === 'busy'}
            onClick={() => void (nearOn ? offNearby(shared.code) : putNearby(shared.code))}
          >
            <span className="switch-label">
              <span>{tr('Show to players nearby', 'In der Nähe anzeigen')}</span>
              {nearState === 'failed' && <span className="muted small">{tr('Not possible right now', 'Gerade nicht möglich')}</span>}
            </span>
            <span className={`drawer-switch${nearOn ? ' on' : ''}`} aria-hidden="true" />
          </button>
        }
      />
      <FriendInvite code={shared.code} only={props.round.players.filter((p) => !p.isMe).map((p) => p.name)} />
      {msg && <span className="muted small">{msg}</span>}
    </>
  );
  return allIn ? (
    <SettingsList>
      <SheetRow label={tr('Invite players', 'Mitspieler einladen')} value={tr('Everyone in ✓', 'Alle dabei ✓')}>
        {block}
      </SheetRow>
    </SettingsList>
  ) : (
    block
  );
}

// (inviting by GolfOS user name is gone – Sascha 03.11.2026: "not needed"; linked friends are invited with a tap)

export function RoundInviteSheet(props: { round: Round; onShared: (r: Round) => void; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Invite players', 'Mitspieler einladen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{props.round.shared?.tournament ? tr('Tournament', 'Turnier') : tr('Invite players', 'Mitspieler einladen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <InvitePanel round={props.round} onShared={props.onShared} auto />
      </section>
    </div>
  );
}

type NewPlayer = { name: string; hcp: string };
/** A code being joined when the player went off to sign in with Google: Play opens it again on the way back. */
export const PENDING_JOIN = 'golfos.join.pending';

export function JoinRoundSheet(props: {
  initial?: string;
  onJoined: (r: Round) => void;
  onClose: () => void;
  /** a game's code: join it in Games */
  onGameCode?: (code: string) => void;
  /** a planned tournament joined before its day: on to the module Tournaments */
  onTours?: () => void;
}) {
  const [code, setCode] = useState(cleanCode(props.initial ?? ''));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ev, setEv] = useState<RoundEvent | null>(null);
  const [series, setSeries] = useState<TourSeries | null>(null);
  // the own flight in the series' first round: "dein Flight in Runde 1 · 09:20"
  const [seriesFlight, setSeriesFlight] = useState<string | null>(null);
  useEffect(() => {
    const first = series?.rounds[0];
    if (!first) return setSeriesFlight(null);
    void refreshEvent(first.code).then((e) => {
      const f = e ? flightOfName(e, who()) : null;
      setSeriesFlight(f ? tr(`your flight in round 1${f.teeTime ? ` ${f.teeTime}` : ''}`, `dein Flight in Runde 1${f.teeTime ? ` ${f.teeTime}` : ''}`) : null);
    });
  }, [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const [own, setOwn] = useState<NewPlayer[] | null>(null); // a flight of one's own (tournament)
  // joining must be simple (Sascha 30.10.2026): no account needed – the name is enough (an anonymous account in the
  // background); the host lets every phone in, by code, QR, link or nearby
  const [name, setName] = useState(() => shownName(loadProfile()));
  const [signedIn, setSignedIn] = useState(() => loadSession() != null);
  const [needGoogle, setNeedGoogle] = useState(false);
  const hcp = (loadProfile().hcpIndex ?? '').trim();
  const account = async (): Promise<boolean> => {
    if (loadSession()) return true;
    if (!name.trim()) {
      setMsg(tr('Your name first – the host sees who asks.', 'Zuerst dein Name – der Gastgeber sieht, wer anfragt.'));
      return false;
    }
    setBusy(tr('One moment …', 'Einen Moment …'));
    const ok = await signInAnonymously(name);
    setBusy(null);
    if (!ok) {
      setNeedGoogle(true);
      setMsg(tr('Without an account it does not work yet – sign in with Google, it goes on by itself afterwards.', 'Ohne Konto geht es gerade nicht – mit Google anmelden, danach geht es von selbst weiter.'));
      return false;
    }
    const p = loadProfile();
    if (!p.firstName.trim()) saveProfile({ ...p, firstName: name.trim().split(/\s+/)[0], lastName: p.lastName || name.trim().split(/\s+/).slice(1).join(' ') });
    setSignedIn(true);
    return true;
  };
  const who = () => name.trim() || myName();
  const find = async (c = code) => {
    if (!(await account())) return;
    setBusy(tr('Joining …', 'Trete bei …'));
    const found = await joinEvent(c);
    setBusy(null);
    // a round: the host lets this phone in first
    if (found === 'ask') {
      setBusy(tr('Asking …', 'Frage an …'));
      const a = await askByCode(c, who(), hcp);
      setBusy(null);
      if (a?.state === 'asked') {
        pushAsked({ code: cleanCode(c) });
        setAsking({ code: cleanCode(c) });
      } else if (a?.state === 'ok') {
        const again = await joinEvent(c);
        if (again && typeof again === 'object' && !isSeries(again)) setEv(again);
      } else if (a?.state === 'no') setMsg(tr('The host did not let you in.', 'Der Gastgeber hat den Beitritt abgelehnt.'));
      else if (a?.state === 'none') setMsg(tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.'));
      else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
    }
    // a game's code here (Sascha 29.10.2026: Games as Rounds): on to Games, which joins it
    else if (found === 'game' && props.onGameCode) props.onGameCode(cleanCode(c));
    else if (found === 'game') setMsg(tr('This code is a game – join it under Games.', 'Dieser Code ist ein Spiel – das unter Games beitreten.'));
    else if (found === 'none') setMsg(tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.'));
    else if (!found) setMsg(tr('No connection – check the code or the connection.', 'Keine Verbindung – Code oder Verbindung prüfen.'));
    // a series of tournaments (Sascha 01.11.2026): in all its rounds now – which, when, the own flight
    else if (isSeries(found)) setSeries(found);
    else {
      setEv(found);
      if (let_in.current) awaitName.current = Date.now(); // let in just now: the host's phone adds the name in a moment
    }
  };
  // the rounds shown nearby (Sascha 29.10.2026): null while looking, [] none – not when opened by the link
  const [near, setNear] = useState<NearbyRound[] | null>(null);
  // asked to join (nearby or by code): waiting till the host lets this phone in (Sascha 29./30.10.2026)
  const [asking, setAsking] = useState<{ near?: NearbyRound; code?: string } | null>(null);
  const let_in = useRef(false);
  const awaitName = useRef(0);
  useEffect(() => {
    if (!asking) return;
    let gone = false;
    let told = false;
    const look = async () => {
      const a = asking.near ? await askToJoin(asking.near.ref, who(), hcp) : await askByCode(asking.code!, who(), hcp);
      if (gone || !a || a.state === 'asked') {
        if (a?.state === 'asked' && asking.near && !told) pushAsked({ ref: asking.near.ref });
        told = true;
        return;
      }
      setAsking(null);
      if (a.state === 'ok') {
        let_in.current = true;
        setCode(a.code);
        void find(a.code);
      } else {
        const host = asking.near?.host;
        setMsg(
          a.state === 'no'
            ? tr(`${host || 'The host'} did not let you in.`, `${host || 'Der Gastgeber'} hat den Beitritt abgelehnt.`)
            : a.state === 'none' || a.state === 'direct'
              ? tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.')
              : tr('The round is no longer shown nearby – ask for the code.', 'Die Runde ist nicht mehr in der Nähe sichtbar – nach dem Code fragen.'),
        );
      }
    };
    void look();
    const t = window.setInterval(() => void look(), 3000);
    return () => {
      gone = true;
      window.clearInterval(t);
    };
  }, [asking]); // eslint-disable-line react-hooks/exhaustive-deps
  // opened by the link: look it up straight away (without an account: once the name is in)
  useEffect(() => {
    if (props.initial && cleanCode(props.initial).length === 6) {
      if (loadSession()) void find(cleanCode(props.initial));
    } else if (loadSession())
      void here().then(async (pos) => {
        setNear(pos ? await nearbyRounds(pos.lat, pos.lon) : []);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the course on this phone before the round starts: its map, par and stroke index
  const ready = async (e: RoundEvent) => {
    setBusy(tr('Loading the course …', 'Lade den Platz …'));
    await loadCourse(e.course).catch(() => null); // offline: the round still plays, the map as far as the phone has it
  };
  const flights = ev ? liveFlights(ev) : [];
  const team = isTeamMode(ev?.format?.mode);
  const join = async (e: RoundEvent, f: Flight, pid: string) => {
    await ready(e);
    // his flight ended (a round finished, by him or another phone of it): taking part again opens it again (07.11.2026)
    let ev2 = e;
    if (f.finishedAt) {
      setBusy(tr('Opening the flight again …', 'Flight wird wieder geöffnet …'));
      ev2 = (await reopenFlight(code, f.id)) ?? e;
    }
    setBusy(null);
    const f2 = ev2.flights[f.id] ?? f;
    // taking part again (Sascha 10.11.2026: Erik's round after "Wieder teilnehmen" had no shots of the watch and no
    // track – a new round had begun): this phone's round of the flight for this player goes on, with all it holds
    const prev = f.finishedAt ? loadRounds().find((r) => !r.preview && r.shared?.code === code && r.shared.flight === f2.id && r.players.find((p) => p.isMe)?.id === pid) : undefined;
    props.onJoined(prev ? { ...prev, finishedAt: null } : roundFromEvent(ev2, f2.id, pid, code, newId(), who()));
  };
  // the own name in the flight: in at once – no "who are you?" (Sascha 30.10.2026: "not many taps"); let in just now
  // and not there yet: the host's phone adds it in a moment, looked for a little while
  // every player has his own profile (Sascha 08.11.2026: "such questions must not come"): his name is his place – on
  // another phone or not; the newest phone of a player keeps his score
  const mine = (e: RoundEvent): { f: Flight; pid: string } | null => {
    const t = isTeamMode(e.format?.mode);
    const hits = liveFlights(e).flatMap((f) => f.players.filter((p) => nameIs(p.name, who(), t)).map((p) => ({ f, pid: p.id })));
    return hits.length === 1 ? hits[0] : null;
  };
  useEffect(() => {
    if (!ev || own || busy || plannedAhead(ev) || ev.deletedAt) return; // a planned tournament: on its day, not called off
    const hit = mine(ev);
    if (hit) {
      void join(ev, hit.f, hit.pid);
      return;
    }
    // (in the setup the host's players reach the round with its start – looked for while this sheet is open)
    if (!awaitName.current || Date.now() - awaitName.current > 15 * 60000) return;
    const t = window.setTimeout(async () => {
      const again = await joinEvent(code);
      if (again && typeof again === 'object' && !isSeries(again)) setEv({ ...again });
    }, 3000);
    return () => window.clearTimeout(t);
  }, [ev]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameField = !signedIn || !shownName(loadProfile());
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Join a round', 'Runde beitreten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{ev ? ev.name : tr('Join a round', 'Runde beitreten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {/* no account yet: the name is all it takes */}
        {!ev && !series && !asking && nameField && (
          <div className="field join-name">
            <label htmlFor="join-name">{tr('Your name', 'Dein Name')}</label>
            <input id="join-name" className="input" value={name} autoComplete="name" placeholder={tr('e.g. Cedric', 'z. B. Cedric')} onChange={(e) => { setName(e.target.value); setMsg(null); }} />
            {!signedIn && <span className="muted small">{tr('No account needed – the host lets you in.', 'Kein Konto nötig – der Gastgeber lässt dich rein.')}</span>}
          </div>
        )}
        {asking && (
          <div className="join-wait" role="status">
            <strong>{asking.near?.host ? tr(`Asked ${asking.near.host} to let you in …`, `Anfrage an ${asking.near.host} gesendet …`) : tr('Asked the host to let you in …', 'Anfrage an den Gastgeber gesendet …')}</strong>
            <span className="muted small">{tr('As soon as the host lets you in, the round opens here.', 'Sobald der Gastgeber zustimmt, geht es hier weiter.')}</span>
            <button type="button" className="btn-secondary" onClick={() => setAsking(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </div>
        )}
        {!ev && !series && !asking && !props.initial && !signedIn && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy != null || !name.trim()}
            onClick={async () => {
              if (!(await account())) return;
              const pos = await here();
              setNear(pos ? await nearbyRounds(pos.lat, pos.lon) : []);
            }}
          >
            {tr('Find rounds nearby', 'Runden in der Nähe suchen')}
          </button>
        )}
        {!ev && !series && !asking && !props.initial && signedIn && (
          <div className="near-rounds" aria-label={tr('Rounds nearby', 'Runden in der Nähe')}>
            <span className="eyebrow">{tr('Nearby', 'In der Nähe')}</span>
            {near == null && <span className="muted small">{tr('Looking for rounds nearby …', 'Suche Runden in der Nähe …')}</span>}
            {near?.length === 0 && <span className="muted small">{tr('No round nearby – type the code instead.', 'Keine Runde in der Nähe – dann den Code eingeben.')}</span>}
            {near?.map((n) => (
              <button
                key={n.ref}
                type="button"
                className="list-item near-round"
                disabled={busy != null}
                onClick={() => {
                  setMsg(null);
                  setAsking({ near: n });
                }}
              >
                <span className="grow">
                  <span className="title">
                    {n.tournament ? n.name : n.host ? tr(`${n.host}'s round`, `Runde von ${n.host}`) : n.name}
                    {n.mode ? ` · ${modeName(n.mode as GameMode)}` : ''}
                  </span>
                  <span className="muted small">
                    {n.course} · {n.dist < 1000 ? `${n.dist} m` : `${(n.dist / 1000).toFixed(1).replace('.', ',')} km`}
                  </span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}
        {!ev && !series && !asking && (
          <>
            <input
              className="input join-input"
              value={showCode(code)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123-456"
              aria-label={tr('Code of the round', 'Code der Runde')}
              onChange={(e) => {
                setCode(cleanCode(e.target.value));
                setMsg(null);
              }}
            />
            <button type="button" className="btn-primary" disabled={busy != null || code.length !== 6 || (nameField && !name.trim())} onClick={() => void find()}>
              {busy ?? tr('Join', 'Beitreten')}
            </button>
            <ScanCodeButton
              disabled={busy != null || (nameField && !name.trim())}
              onCode={(c) => {
                setCode(c);
                setMsg(null);
                void find(c);
              }}
            />
            {needGoogle && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  // back from Google: on with this code by itself (Play reads it)
                  try {
                    sessionStorage.setItem(PENDING_JOIN, code);
                  } catch {
                    /* private mode */
                  }
                  signIn();
                }}
              >
                {tr('Sign in with Google', 'Mit Google anmelden')}
              </button>
            )}
          </>
        )}
        {/* a series of tournaments (Sascha 01.11.2026): in every round – its days and courses, the own flight; a round
            today: on to it */}
        {series && series.deletedAt && (
          <span className="small bad-text" role="alert">
            {tr('The host has called this series off.', 'Der Gastgeber hat diese Serie abgesagt.')}
          </span>
        )}
        {series && !series.deletedAt && (
          <div className="join-wait" role="status" aria-label={tr('Series', 'Serie')}>
            <strong>{tr(`You're in: ${series.name}`, `Du bist dabei: ${series.name}`)}</strong>
            <span className="muted small">{tr(`${series.rounds.length} rounds`, `${series.rounds.length} Runden`)}{seriesFlight ? ` · ${seriesFlight}` : ''}</span>
            <ul className="series-rounds">
              {series.rounds.map((r) => (
                <li key={r.code} className="small">
                  {dayText(r.date)} · {r.course.name}
                  {r.name && r.name !== series.name ? ` · ${r.name}` : ''}
                </li>
              ))}
            </ul>
            {((today) =>
              today ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setSeries(null);
                    setCode(today.code);
                    void find(today.code);
                  }}
                >
                  {tr('Take part today', 'Heute teilnehmen')}
                </button>
              ) : (
                <span className="muted small">{tr('On each day of the series it is in Rounds from 00:01 – before that under Tournaments.', 'An jedem Spieltag ab 00:01 in Rounds – vorab unter Tournaments.')}</span>
              ))(series.rounds.find((r) => r.date === localDay()))}
            {props.onTours && (
              <button type="button" className="btn-secondary" onClick={props.onTours}>
                {tr('To the tournaments', 'Zu den Turnieren')}
              </button>
            )}
          </div>
        )}
        {/* a tournament planned in Games (Sascha 01.11.2026): called off – or joined before its day, played on the day */}
        {ev?.planned && ev.deletedAt && (
          <span className="small bad-text" role="alert">
            {tr('The host has called this tournament off.', 'Der Gastgeber hat dieses Turnier abgesagt.')}
          </span>
        )}
        {ev?.planned && !ev.deletedAt && plannedAhead(ev) && (
          <div className="join-wait" role="status">
            <strong>{tr("You're in", 'Du bist dabei')}</strong>
            <span>
              {[ev.name, dayText(ev.date!), ev.course.name, ((f) => (f ? tr(`your flight${f.teeTime ? ` ${f.teeTime}` : ''}`, `dein Flight${f.teeTime ? ` ${f.teeTime}` : ''}`) : ''))(flightOfName(ev, who()))].filter(Boolean).join(' · ')}
            </span>
            <span className="muted small">{tr('On the day of the tournament it is in Rounds from 00:01 – before that under Tournaments.', 'Am Turniertag ab 00:01 in Rounds – vorab unter Tournaments.')}</span>
            {props.onTours && (
              <button type="button" className="btn-secondary" onClick={props.onTours}>
                {tr('To the tournaments', 'Zu den Turnieren')}
              </button>
            )}
          </div>
        )}
        {ev && !own && !(ev.planned && (ev.deletedAt || plannedAhead(ev))) && (
          <>
            <span className="muted small">{ev.course.name}</span>
            {awaitName.current > 0 && !mine(ev) && (
              <span className="near-state small" role="status">
                {tr('You are in – the host adds your name in a moment (at the latest when he starts). Or tap it below.', 'Du bist zugelassen – der Gastgeber trägt dich gleich ein (spätestens beim Start). Oder tippe unten deinen Namen an.')}
              </span>
            )}
            {flights.map((f) => (
              <div className="field" key={f.id}>
                <label>
                  {flights.length > 1 ? tr(`Flight ${f.name}${f.teeTime ? ` · ${f.teeTime}` : ''} – who are you?`, `Flight ${f.name}${f.teeTime ? ` · ${f.teeTime}` : ''} – wer bist du?`) : tr('Who are you?', 'Wer bist du?')}
                </label>
                <div className="chip-set">
                  {f.players.map((p) => {
                    // already on a phone: a single player is taken; a team's second phone joins it (and can take the card over)
                    const w = writerOf(f, p.id, team);
                    // an earlier phone of his own (joined before): his again, not taken (07.11.2026)
                    const own = (w != null && samePerson(f.phones?.[w], who())) || (!team && nameIs(p.name, who()));
                    const on = w && !own ? (f.phones?.[w]?.name ?? '') : '';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="chip join-chip"
                        // a single player already on his phone is his – nobody else takes his score over by a tap
                        disabled={busy != null || (!team && w != null && !own)}
                        onClick={() => void join(ev, f, p.id)}
                      >
                        <span>{p.name}</span>
                        {on && <small className="muted">{team ? tr(`card: ${on}`, `Scorecard: ${on}`) : tr(`on ${on}'s phone`, `auf dem Handy von ${on}`)}</small>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* a planned tournament: its flights come from the plan */}
            {ev.tournament && !ev.planned && (
              <button type="button" className="btn-secondary" onClick={() => setOwn([{ name: shownName(loadProfile()), hcp: '' }, { name: '', hcp: '' }])}>
                {tr('Start a flight of my own', 'Eigenen Flight anlegen')}
              </button>
            )}
          </>
        )}
        {ev && own && (
          <>
            <span className="muted small">{tr('Your flight – the first name is you. The playing handicap is optional (gross without it).', 'Dein Flight – der erste Name bist du. Die Spielvorgabe ist freiwillig (ohne: brutto).')}</span>
            {own.map((p, k) => (
              <div className="new-flight-row" key={k}>
                <input className="input" aria-label={tr(`Player ${k + 1}`, `Spieler ${k + 1}`)} placeholder={k === 0 ? tr('You', 'Du') : tr(`Player ${k + 1}`, `Spieler ${k + 1}`)} value={p.name} onChange={(e) => setOwn(own.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
                <input className="input hcp-input" inputMode="numeric" aria-label={tr(`Playing handicap of player ${k + 1}`, `Spielvorgabe von Spieler ${k + 1}`)} placeholder={tr('Hcp', 'Vorg.')} value={p.hcp} onChange={(e) => setOwn(own.map((x, j) => (j === k ? { ...x, hcp: e.target.value } : x)))} />
              </div>
            ))}
            {own.length < 4 && (
              <button type="button" className="btn-secondary" onClick={() => setOwn([...own, { name: '', hcp: '' }])}>
                {tr('+ Player', '+ Spieler')}
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              disabled={busy != null || !own[0].name.trim()}
              onClick={async () => {
                const players = own
                  .filter((p, k) => k === 0 || p.name.trim())
                  .map((p) => ({ name: p.name.trim(), playingHandicap: p.hcp.trim() && Number.isFinite(Number(p.hcp.replace(',', '.'))) ? Math.round(Number(p.hcp.replace(',', '.'))) : null }));
                const { round, flight } = newFlightRound(ev, players, code, newId(), myName());
                await ready(ev);
                setBusy(tr('Joining …', 'Trete bei …'));
                const ok = await addFlight(code, flight);
                setBusy(null);
                if (ok) props.onJoined(round);
                else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
              }}
            >
              {busy ?? tr('Start the flight', 'Flight starten')}
            </button>
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

/** The live leaderboard of all flights of a tournament (updated with every exchange); a player whose own score and his
 *  marker's differ is flagged with the holes. */
export function EventBoardCard(props: { code: string; myFlight: string; /** away from the hole map: read the event now and then */ refresh?: boolean; /** a tournament's name tapped: its page (a finished round's scorecard) */ onOpenTour?: () => void }) {
  const [ev, setEv] = useState(() => cachedEvent(props.code));
  // a tournament (Sascha's concept 30.10.2026): gross or net, one class or all
  const [gross, setGross] = useState(false);
  const [cls, setCls] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setEv(cachedEvent(props.code));
    window.addEventListener('golfos:event-changed', on);
    const t = props.refresh ? window.setInterval(() => document.visibilityState === 'visible' && void refreshEvent(props.code), 10000) : 0;
    if (props.refresh) void refreshEvent(props.code);
    return () => {
      window.removeEventListener('golfos:event-changed', on);
      window.clearInterval(t);
    };
  }, [props.code, props.refresh]);
  if (!ev) return null;
  const b = eventStandings(ev, { gross, cls });
  const mine = new Set((ev.flights[props.myFlight]?.players ?? []).map((p) => `${props.myFlight}/${p.id}`));
  const flights = liveFlights(ev).length;
  const net = (ev.format?.allowance ?? 100) > 0 && ev.format?.scoring !== 'stroke';
  const classes = netClasses(ev).length ? CLASS_NAMES.slice(0, netClasses(ev).length + 1) : [];
  const diff = (key: string): string | null => {
    const [fid, pid] = key.split('/');
    const f = ev.flights[fid];
    const holes = f ? differences(f, pid) : [];
    return holes.length ? holes.map((i) => ev.holes[i]?.label ?? String(i + 1)).join(', ') : null;
  };
  const csv = async () => {
    const text = standingsCsv(ev, gross);
    const file = new File([`\uFEFF${text}`], `${ev.name.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'Ergebnis'}.csv`, { type: 'text/csv' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; title?: string }) => Promise<void> };
    try {
      if (nav.canShare?.({ files: [file] }) && nav.share) return await nav.share({ files: [file], title: ev.name });
    } catch {
      return; // cancelled
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const status = ev.tournament && flights > 1 ? flightStatus(ev) : [];
  return (
    <section className="card stats-card leaderboard event-board">
      <h2>
        {ev.tournament && props.onOpenTour ? (
          <button type="button" className="link-text" style={{ textDecoration: 'none' }} onClick={props.onOpenTour}>
            {ev.name} <span className="muted" aria-hidden="true">›</span>
          </button>
        ) : (
          ev.name
        )}
      </h2>
      <span className="muted small">
        {ev.tournament ? tr(`Tournament · ${flights} ${flights === 1 ? 'flight' : 'flights'}`, `Turnier · ${flights} ${flights === 1 ? 'Flight' : 'Flights'}`) : tr('Live · the phones of the flight', 'Live · alle Handys des Flights')} · {b.title}
      </span>
      {ev.tournament && (net || classes.length > 0) && (
        <div className="chip-set lb-filters">
          {net && (
            <>
              <button type="button" className={`chip${!gross ? ' on' : ''}`} aria-pressed={!gross} onClick={() => setGross(false)}>
                {ev.format?.scoring === 'stableford' ? 'Stableford' : tr('Net', 'Netto')}
              </button>
              <button type="button" className={`chip${gross ? ' on' : ''}`} aria-pressed={gross} onClick={() => setGross(true)}>
                {tr('Gross', 'Brutto')}
              </button>
            </>
          )}
          {classes.length > 0 && (
            <>
              <button type="button" className={`chip${cls == null ? ' on' : ''}`} aria-pressed={cls == null} onClick={() => setCls(null)}>
                {tr('All', 'Alle')}
              </button>
              {classes.map((c) => (
                <button key={c} type="button" className={`chip${cls === c ? ' on' : ''}`} aria-pressed={cls === c} onClick={() => setCls(c)}>
                  {tr(`Class ${c}`, `Klasse ${c}`)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <ol className="lb-rows">
        {b.rows.map((r) => {
          const d = diff(r.key);
          return (
            <li key={r.key} className={mine.has(r.key) ? 'lb-mine' : undefined}>
              <span className="lb-rank">{r.pos}</span>
              <span className="lb-name">
                <Avatar name={r.name} me={mine.has(r.key)} size={24} />
                <span>
                  {r.name}
                  {r.cls && <small className="muted"> · {r.cls}</small>}
                  {d && <small className="lb-diff">{tr(`marker differs: ${d}`, `Zähler weicht ab: ${d}`)}</small>}
                  {r.countback && <small className="muted lb-cb">{tr('placed by countback', 'nach Stechen')}</small>}
                  {r.signed && <small className="lb-signed">{tr('✓ signed', '✓ unterschrieben')}</small>}
                </span>
              </span>
              <span className="lb-value">{r.value}</span>
              <span className="lb-thru muted small">{r.retired ? tr(`WD after ${r.thru}`, `Aufg. nach ${r.thru}`) : r.finished ? 'F' : r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '–'}</span>
            </li>
          );
        })}
      </ol>
      {/* the special prizes with their leaders (Sascha 01.11.2026) */}
      {(ev.specials?.length ?? 0) > 0 && (
        <div className="flight-status special-leaders">
          <span className="eyebrow">{tr('Special prizes', 'Sonderwertungen')}</span>
          {ev.specials!.map((s) => (
            <span key={s.id} className="small">
              {specialName(s.kind)} · {tr('hole', 'Loch')} {ev.holes[s.hole]?.label}: <strong>{leaderText(ev, s)}</strong>
            </span>
          ))}
        </div>
      )}
      {/* the flights as they stand – who is where, a flight gone quiet (Sascha's concept: the organiser's view) */}
      {status.length > 0 && (
        <div className="flight-status">
          <span className="eyebrow">{tr('Flights', 'Flights')}</span>
          {status.map((s) => (
            <span key={s.id} className="small">
              <strong>{s.name}</strong>
              <span className="muted">
                {' · '}
                {s.finished ? tr('finished', 'fertig') : s.thru ? tr(`thru ${s.thru}`, `nach ${s.thru} ${s.thru === 1 ? 'Loch' : 'Löchern'}`) : tr('not started', 'noch nicht gestartet')}
                {!s.finished && s.quietMin != null && s.quietMin >= 15 ? tr(` · quiet for ${s.quietMin} min`, ` · seit ${s.quietMin} Min. still`) : ''}
              </span>
            </span>
          ))}
        </div>
      )}
      {ev.tournament && (
        <button type="button" className="btn-secondary" onClick={() => void csv()}>
          {tr('Results as a list (CSV)', 'Ergebnisliste (CSV)')}
        </button>
      )}
    </section>
  );
}

/**
 * Handing the card in (Sascha's concept 30.10.2026: "player and marker confirm – then it is locked"): on the scorecard
 * of a round with a marker, the own card to sign as the player and the partner's as his marker – once every hole has
 * both counts and none differs. Signed by both, the score is locked on every phone.
 */
/** The holes where the own count and the marker's differ, per player (the scorecard marks them red – Sascha 03.11.2026). */
function useSharedEvent(round: Round) {
  const s = round.shared;
  const [ev, setEv] = useState(() => (s ? cachedEvent(s.code) : null));
  useEffect(() => {
    if (!s) return;
    const on = () => setEv(cachedEvent(s.code));
    on();
    window.addEventListener('golfos:event-changed', on);
    return () => window.removeEventListener('golfos:event-changed', on);
  }, [s?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  return ev;
}

/** For a score panel away from the hole map (the scorecard's): per player what this phone may do – as on the course
 *  (Sascha 08.11.2026, "Jeder seinen eigenen": a hole opened on Erik's scorecard showed steppers for everyone). */
export function useShareViews(round: Round): Record<string, ShareView> {
  const ev = useSharedEvent(round);
  const s = round.shared;
  return s && ev ? shareView(round, ev.flights[s.flight], !!ev.tournament) : {};
}

export function useDiffers(round: Round): Record<string, number[]> {
  const s = round.shared;
  const ev = useSharedEvent(round);
  const f = s && ev?.flights[s.flight];
  if (!f || f.scorer || !f.markers) return {};
  return Object.fromEntries(round.players.map((p) => [p.id, differences(f, p.id)]).filter(([, d]) => (d as number[]).length));
}

export function SignCard(props: { round: Round; onHole?: (index: number) => void; onChange?: (r: Round) => void }) {
  const s = props.round.shared;
  const [ev, setEv] = useState(() => (s ? cachedEvent(s.code) : null));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const latest = useRef(props.round);
  latest.current = props.round;
  const change = useRef(props.onChange);
  change.current = props.onChange;
  useEffect(() => {
    if (!s) return;
    const on = () => setEv(cachedEvent(s.code));
    window.addEventListener('golfos:event-changed', on);
    // away from the hole map the scores are exchanged here too, every few seconds (Sascha 03.11.2026: all scores the
    // same, and still "open: 18" – the last hole and the corrections on the scorecard never left the phone); the
    // partner's signature comes with it
    let going = false;
    const tick = async () => {
      if (going || document.visibilityState !== 'visible') return;
      going = true;
      const sent = latest.current;
      const got = change.current ? await exchangeRound(sent, myName()).finally(() => (going = false)) : await refreshEvent(s.code).finally(() => (going = false));
      if (!got || !change.current || !('players' in got)) return;
      const next = settle(latest.current, sent, got);
      if (JSON.stringify(next) !== JSON.stringify(latest.current)) change.current(next);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 5000);
    return () => {
      window.removeEventListener('golfos:event-changed', on);
      window.clearInterval(t);
    };
  }, [s?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  // a score corrected on the card: to the others at once
  const sentRef = useRef('');
  useEffect(() => {
    if (!s || !props.onChange) return;
    const key = JSON.stringify(props.round.entries);
    if (sentRef.current && sentRef.current !== key) void exchangeRound(props.round, myName());
    sentRef.current = key;
  }, [props.round.entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = s && ev?.flights[s.flight];
  if (!s || !f || (!f.markers && !f.scorer)) return null;
  const me = props.round.players.find((p) => p.isMe);
  // the cards this phone signs as marker – the scorer signs everyone's (02.11.2026)
  const marked = props.round.players.filter((p) => !p.isMe && !!me && markerOf(f, p.id) === me.id);
  const cards: { pid: string; name: string; as: 'player' | 'marker' }[] = [
    ...(me ? [{ pid: me.id, name: me.name, as: 'player' as const }] : []),
    ...marked.map((p) => ({ pid: p.id, name: p.name, as: 'marker' as const })),
  ];
  // the hole as the scorecard shows it ("2", not "2 Kurzplatz")
  const label = (i: number) => props.round.holes[i]?.label ?? ev!.holes[i]?.label ?? String(i + 1);
  const sign = async (pid: string, as: 'player' | 'marker') => {
    setBusy(true);
    const ok = await signCard(props.round, pid, as);
    setBusy(false);
    setMsg(ok ? null : tr('Not signed – check the holes, or no connection.', 'Nicht unterschrieben – Löcher prüfen oder keine Verbindung.'));
  };
  // one scorer for all (Sascha 10.11.2026: "three signatures at the end – not ideal"; 11.11.2026: "Erik must not sign for
  // all three – Cedric and Stefan get a push, see their card and sign on their own device"): the scorer signs once – his
  // own card and the others' count – then every player signs his own on his phone; the others' phones show the usual row
  if (f.scorer && me?.id === f.scorer) {
    const others = f.players.filter((p) => p.id !== f.scorer);
    const open = f.players.map((p) => ({ p, can: signable(f, p.id, ev!.holes.length) })).filter((x) => !x.can.ok);
    const mineDone = !!f.signed?.[f.scorer]?.player && others.every((p) => !!f.signed?.[p.id]?.marker);
    const locked = f.players.every((p) => isSigned(f, p.id));
    const names = others.map((p) => p.name).join(', ');
    return (
      <section className="card sign-card" aria-label={tr('Hand the card in', 'Scorekarte abgeben')}>
        <h2>{tr('Hand the cards in', 'Scorekarten abgeben')}</h2>
        <div className="sign-row">
          <span className="grow">
            <strong>{tr('Sign as scorer', 'Als Schreiber unterschreiben')}</strong>
            <span className={`small ${locked ? 'good-text' : 'muted'}`}>
              {locked
                ? tr('All signed – handed in, locked', 'Alle unterschrieben – abgegeben, gesperrt')
                : mineDone
                  ? others.map((p) => (isSigned(f, p.id) ? tr(`${p.name}: signed`, `${p.name}: unterschrieben`) : tr(`${p.name}: signs on his phone`, `${p.name}: unterschreibt auf seinem Handy`))).join(' · ')
                  : open.length
                    ? open.map((x) => `${x.p.name}: ${x.can.ok ? '' : tr(`still open ${x.can.missing.map(label).join(', ')}`, `noch offen ${x.can.missing.map(label).join(', ')}`)}`).join(' · ')
                    : tr(`Your card and the count of ${names} – then each signs his own on his phone`, `Deine Karte und die Zählung von ${names} – danach unterschreibt jeder seine eigene auf seinem Handy`)}
            </span>
          </span>
          {!mineDone && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || open.length > 0}
              onClick={async () => {
                setBusy(true);
                const ok = await signAsScorer(props.round);
                setBusy(false);
                setMsg(ok ? null : tr('Not signed – check the holes, or no connection.', 'Nicht unterschrieben – Löcher prüfen oder keine Verbindung.'));
              }}
            >
              {tr('Sign', 'Unterschreiben')}
            </button>
          )}
        </div>
        {msg && <span className="small bad-text">{msg}</span>}
      </section>
    );
  }
  return (
    <section className="card sign-card" aria-label={tr('Hand the card in', 'Scorekarte abgeben')}>
      <h2>{tr('Hand the card in', 'Scorekarte abgeben')}</h2>
      {cards.map((c) => {
        const done = f.signed?.[c.pid]?.[c.as];
        const locked = isSigned(f, c.pid);
        const can = signable(f, c.pid, ev!.holes.length);
        // the other one signed already – said, so it is clear the own signature is all that is missing (Sascha
        // 08.11.2026: "Erik signed, but it does not sync to me" – it did, the row only said "ready to sign")
        const theirs = !locked && !done && can.ok && !!f.signed?.[c.pid]?.[c.as === 'player' ? 'marker' : 'player'];
        return (
          // the words above, the button below across the card (Sascha 03.11.2026: the text was squeezed into a column beside it)
          <div key={c.pid + c.as} className="sign-row">
            <span className="grow">
              <strong>{c.as === 'player' ? tr('Your card', 'Deine Karte') : f.scorer === me?.id ? tr(`As scorer of ${c.name}`, `Als Schreiber von ${c.name}`) : tr(`As marker of ${c.name}`, `Als Zähler von ${c.name}`)}</strong>
              <span className={`small ${!locked && !done && !can.ok && can.differ.length ? 'bad-text' : theirs ? 'good-text' : 'muted'}`}>
                {theirs
                  ? c.as === 'player'
                    ? f.scorer
                      ? tr('Your scorer signed – now you', 'Dein Schreiber hat unterschrieben – jetzt du')
                      : tr('Your marker signed – now you', 'Dein Zähler hat unterschrieben – jetzt du')
                    : tr(`${c.name} signed – now you`, `${c.name} hat unterschrieben – jetzt du`)
                  : locked
                  ? // "everyone his own" (no marker – Sascha 09.11.2026, audit): signed by him alone
                    !markerOf(f, c.pid)
                    ? tr('Signed – handed in, locked', 'Unterschrieben – abgegeben, gesperrt')
                    : f.scorer
                      ? tr('Signed by you and the scorer – handed in, locked', 'Von dir und dem Schreiber unterschrieben – abgegeben, gesperrt')
                      : tr('Signed by player and marker – handed in, locked', 'Von Spieler und Zähler unterschrieben – abgegeben, gesperrt')
                  : done
                    ? c.as === 'player'
                      ? f.scorer
                        ? tr('Signed by you – your scorer confirms next', 'Von dir unterschrieben – jetzt bestätigt dein Schreiber')
                        : tr('Signed by you – the marker signs next', 'Von dir unterschrieben – jetzt unterschreibt der Zähler')
                      : tr(`Signed by you – ${c.name} signs his own next`, `Von dir unterschrieben – jetzt unterschreibt ${c.name} selbst`)
                    : can.ok
                      ? tr('All holes agree – ready to sign', 'Alle Löcher stimmen überein – bereit zum Unterschreiben')
                      : can.differ.length
                        ? tr('The counts differ – agree them first, then sign:', 'Die Zählung weicht ab – erst abstimmen, dann unterschreiben:')
                        : tr(`Still open: ${can.missing.map(label).join(', ')}`, `Noch offen: ${can.missing.map(label).join(', ')}`)}
              </span>
            </span>
            {/* every hole that differs: a tap opens it (Sascha 03.11.2026: "jump into the holes from here") */}
            {!locked && !done && !can.ok && can.differ.length > 0 && (
              <span className="chip-set sign-differ">
                {can.differ.map((i) => (
                  <button key={i} type="button" className="chip diff-chip" disabled={!props.onHole} aria-label={tr(`Hole ${label(i)} differs – open it`, `Loch ${label(i)} weicht ab – öffnen`)} onClick={() => props.onHole?.(i)}>
                    {tr(`Hole ${label(i)}`, `Loch ${label(i)}`)}
                  </button>
                ))}
              </span>
            )}
            {!done && !locked && (
              <button type="button" className="btn-primary" disabled={busy || !can.ok} onClick={() => void sign(c.pid, c.as)}>
                {tr('Sign', 'Unterschreiben')}
              </button>
            )}
          </div>
        );
      })}
      {msg && <span className="small bad-text">{msg}</span>}
    </section>
  );
}
