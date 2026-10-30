import { useEffect, useRef, useState } from 'react';
import type { CourseSummary, Round } from '../types';
import { cleanCode } from '../lib/sharedgame';
import { addFlight, askByCode, askToJoin, cachedEvent, differences, eventStandings, flightStatus, joinEvent, nearbyRounds, NEARBY_HOURS, newFlightRound, roundFromEvent, refreshEvent, roundJoinLink, shareRound, showNearby, signable, signCard, isSigned, standingsCsv, writerOf, type Flight, type NearbyRound, type RoundEvent } from '../lib/sharedround';
import { isTeamMode, modeName, type GameMode } from '../lib/games';
import { loadCachedCourse, newId } from '../lib/storage';
import { loadCourse } from '../lib/courses';
import { loadProfile, saveProfile, shownName } from '../lib/profile';
import { loadSession, signIn, signInAnonymously } from '../lib/sync';
import { inviteByName, pushAsked } from '../lib/push';
import { tr } from '../lib/i18n';
import { Qr } from './ShareGame';
import { Avatar } from './Avatar';

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
 * The invitation: before the code the choice "tournament" (with its name), then the code, the QR code and "share the
 * link". `round` is the round – or, in the setup, the round as it would start now (its players and holes go to the
 * event; what changes before the start follows with the first exchange).
 */
export function InvitePanel(props: { round: Round; onShared: (r: Round) => void; compact?: boolean }) {
  const shared = props.round.shared;
  const [tournament, setTournament] = useState(false);
  // a tournament's net classes by playing handicap (Sascha's concept 30.10.2026)
  const [classes, setClasses] = useState<number[]>([]);
  const [name, setName] = useState(() => `${props.round.courseName} · ${new Date(props.round.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // the round shown to signed-in phones nearby (Sascha 29.10.2026) – here, or (no GPS) on the course
  const [near, setNear] = useState(true);
  const [nearState, setNearState] = useState<'here' | 'course' | 'failed' | null>(null);
  const team = isTeamMode(props.round.format?.mode);
  const putNearby = async (code: string) => {
    const pos = await here();
    const course = courseSummary(props.round);
    const at = pos ? { ...pos, radius: 300 } : course.lat || course.lon ? { lat: course.lat, lon: course.lon, radius: 2000 } : null;
    setNearState(at && (await showNearby(code, at, myName())) ? (pos ? 'here' : 'course') : 'failed');
  };
  const share = async () => {
    if (!shared) return;
    const url = roundJoinLink(shared.code);
    const nav = navigator as Navigator & { share?: (d: { text: string; url: string }) => Promise<void> };
    const text = shared.tournament ? tr(`Join the tournament – code ${shared.code}`, `Spiel im Turnier mit – Code ${shared.code}`) : tr(`Join my round – code ${shared.code}`, `Spiel in meiner Runde mit – Code ${shared.code}`);
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
  if (!shared)
    return (
      <>
        <span className="muted small">
          {team
            ? tr(
                'Your flight on their own phones (signed in with Google): one of the team keeps the card – another can take it over. Several flights: a tournament with a live leaderboard.',
                'Dein Flight auf den eigenen Handys (mit Google angemeldet): Einer des Teams führt die Scorecard – ein anderer kann sie übernehmen. Mehrere Flights: ein Turnier mit Live-Leaderboard.',
              )
            : tr(
                'Your flight on their own phones (signed in with Google): everyone keeps his own score – strokes, putts, penalties – and sees the others live; with a marker also a partner\'s. Several flights: a tournament with a live leaderboard.',
                'Dein Flight auf den eigenen Handys (mit Google angemeldet): Jeder erfasst seinen eigenen Score – Schläge, Putts, Strafschläge – und sieht die anderen live; mit Zähler auch den eines Mitspielers. Mehrere Flights: ein Turnier mit Live-Leaderboard.',
              )}
        </span>
        <div className="drawer-list settings-switches">
          <button type="button" className="drawer-row" role="switch" aria-checked={tournament} onClick={() => setTournament(!tournament)}>
            <span className="switch-label">
              <span>{tr('Tournament over several flights', 'Turnier über mehrere Flights')}</span>
              <span className="muted small">{tr('Other flights join with the code and start their own flight; everyone marks a partner', 'Weitere Flights treten mit dem Code bei und legen ihren eigenen Flight an; jeder zählt einen Mitspieler')}</span>
            </span>
            <span className={`drawer-switch${tournament ? ' on' : ''}`} aria-hidden="true" />
          </button>
          <button type="button" className="drawer-row" role="switch" aria-checked={near} onClick={() => setNear(!near)}>
            <span className="switch-label">
              <span>{tr('Show to players nearby', 'In der Nähe anzeigen')}</span>
              <span className="muted small">{tr(`Signed-in players within about 300 m see the round under "Join a round" and ask with a tap – you let each one in. For ${NEARBY_HOURS} hours`, `Angemeldete Spieler im Umkreis von etwa 300 m sehen die Runde unter „Runde beitreten“ und fragen mit einem Tipp an – du bestätigst jeden. ${NEARBY_HOURS} Stunden lang`)}</span>
            </span>
            <span className={`drawer-switch${near ? ' on' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {tournament && (
          <div className="field">
            <label htmlFor="event-name">{tr('Name of the tournament', 'Name des Turniers')}</label>
            <input id="event-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <span className="muted small">{tr('Net classes by playing handicap', 'Netto-Klassen nach Spielvorgabe')}</span>
            <div className="chip-set">
              {([[], [18], [12, 24]] as number[][]).map((c) => (
                <button key={c.join()} type="button" className={`chip${classes.join() === c.join() ? ' on' : ''}`} aria-pressed={classes.join() === c.join()} onClick={() => setClasses(c)}>
                  {!c.length ? tr('None', 'Keine') : c.length === 1 ? tr(`A up to ${c[0]} · B`, `A bis ${c[0]} · B`) : tr(`A up to ${c[0]} · B up to ${c[1]} · C`, `A bis ${c[0]} · B bis ${c[1]} · C`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await shareRound(props.round, courseSummary(props.round), { name: name.trim() || props.round.courseName, tournament, who: myName(), ...(tournament && classes.length ? { classes } : {}) });
            setBusy(false);
            if (r) {
              props.onShared(r);
              if (near && r.shared) void putNearby(r.shared.code);
            } else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
          }}
        >
          {busy ? tr('Creating …', 'Erzeuge …') : tr('Create a code', 'Code erzeugen')}
        </button>
        {msg && <span className="muted small">{msg}</span>}
      </>
    );
  return (
    <>
      <Qr text={roundJoinLink(shared.code)} />
      <strong className="join-code" aria-label={tr(`Code ${shared.code}`, `Code ${shared.code}`)}>
        {shared.code}
      </strong>
      <span className="muted small">
        {shared.tournament
          ? tr('Scan, or type the code under "Join a round" – no account needed. You let each one in; another flight starts its own.', 'Scannen oder Code unter „Runde beitreten“ eingeben – ohne Konto. Du bestätigst jeden; ein anderer Flight legt seinen eigenen an.')
          : tr('Scan, or type the code under "Join a round" – no account needed. You let each one in, and he is in the round.', 'Scannen oder Code unter „Runde beitreten“ eingeben – ohne Konto. Du bestätigst jeden, dann ist er in der Runde.')}
        {props.compact ? tr(' They can join now already; what you change here goes with the start.', ' Sie können schon jetzt beitreten; was du hier noch änderst, geht beim Start mit.') : ''}
      </span>
      {nearState && (
        <span className={`small ${nearState === 'failed' ? 'muted' : 'near-state'}`}>
          {nearState === 'here'
            ? tr(`Shown nearby for ${NEARBY_HOURS} hours – your partners find it under "Join a round"; you let each one in.`, `In der Nähe sichtbar, ${NEARBY_HOURS} Stunden lang – deine Partner finden sie unter „Runde beitreten“, du bestätigst jeden.`)
            : nearState === 'course'
              ? tr(`No GPS – shown on the course for ${NEARBY_HOURS} hours.`, `Kein GPS – auf dem Platz sichtbar, ${NEARBY_HOURS} Stunden lang.`)
              : tr('Not shown nearby – the code and the QR code work as ever.', 'In der Nähe nicht sichtbar – Code und QR-Code gehen wie gewohnt.')}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={share}>
        {tr('Share the link', 'Link teilen')}
      </button>
      <InviteByName code={shared.code} />
      {msg && <span className="muted small">{msg}</span>}
    </>
  );
}

/** A player with a GolfOS account invited by his user name (Sascha 30.10.2026): a push, a tap – he is in, no asking. */
function InviteByName(props: { code: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    const r = await inviteByName(props.code, name, myName());
    setBusy(false);
    const n = name.trim().replace(/^@/, '');
    setSaid(
      r === 'sent'
        ? tr(`Invited – ${n} gets a notification and is in with a tap.`, `Eingeladen – ${n} bekommt eine Mitteilung und ist mit einem Tipp dabei.`)
        : r === 'silent'
          ? tr(`Invited – ${n} has notifications off: send him the link, he is in at once.`, `Eingeladen – ${n} hat Mitteilungen aus: schick ihm den Link, er ist sofort drin.`)
          : r === 'unknown'
            ? tr(`No GolfOS account with the user name "${n}".`, `Kein GolfOS-Konto mit dem Benutzernamen „${n}“.`)
            : r === 'not-set-up'
              ? tr('Inviting by user name is not set up on the server yet – share the link instead.', 'Einladen per Benutzername ist auf dem Server noch nicht eingerichtet – teile den Link.')
              : tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'),
    );
    if (r === 'sent' || r === 'silent') setName('');
  };
  return (
    <div className="field invite-name">
      <label htmlFor="invite-name">{tr('Or invite by GolfOS user name', 'Oder per GolfOS-Benutzername einladen')}</label>
      <div className="invite-name-row">
        <input id="invite-name" className="input" value={name} autoCapitalize="none" autoComplete="off" placeholder="cedric.m" onChange={(e) => { setName(e.target.value); setSaid(null); }} />
        <button type="button" className="btn-secondary" disabled={busy || name.trim().length < 3} onClick={() => void go()}>
          {busy ? '…' : tr('Invite', 'Einladen')}
        </button>
      </div>
      {said && <span className="muted small" role="status">{said}</span>}
    </div>
  );
}

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
        <InvitePanel round={props.round} onShared={props.onShared} />
      </section>
    </div>
  );
}

type NewPlayer = { name: string; hcp: string };
/** A code being joined when the player went off to sign in with Google: Play opens it again on the way back. */
export const PENDING_JOIN = 'golfos.join.pending';

export function JoinRoundSheet(props: { initial?: string; onJoined: (r: Round) => void; onClose: () => void; /** a game's code: join it in Games */ onGameCode?: (code: string) => void }) {
  const [code, setCode] = useState(cleanCode(props.initial ?? ''));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ev, setEv] = useState<RoundEvent | null>(null);
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
        if (again && typeof again === 'object') setEv(again);
      } else if (a?.state === 'no') setMsg(tr('The host did not let you in.', 'Der Gastgeber hat den Beitritt abgelehnt.'));
      else if (a?.state === 'none') setMsg(tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.'));
      else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
    }
    // a game's code here (Sascha 29.10.2026: Games as Rounds): on to Games, which joins it
    else if (found === 'game' && props.onGameCode) props.onGameCode(cleanCode(c));
    else if (found === 'game') setMsg(tr('This code is a game – join it under Games.', 'Dieser Code ist ein Spiel – das unter Games beitreten.'));
    else if (found === 'none') setMsg(tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.'));
    else if (!found) setMsg(tr('No connection – check the code or the connection.', 'Keine Verbindung – Code oder Verbindung prüfen.'));
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
  const flights = ev ? Object.values(ev.flights) : [];
  const team = isTeamMode(ev?.format?.mode);
  const join = async (e: RoundEvent, f: Flight, pid: string) => {
    await ready(e);
    setBusy(null);
    props.onJoined(roundFromEvent(e, f.id, pid, code, newId(), who()));
  };
  // the own name in the flight: in at once – no "who are you?" (Sascha 30.10.2026: "not many taps"); let in just now
  // and not there yet: the host's phone adds it in a moment, looked for a little while
  const mine = (e: RoundEvent): { f: Flight; pid: string } | null => {
    const me = who().toLowerCase();
    const t = isTeamMode(e.format?.mode);
    const hits = Object.values(e.flights).flatMap((f) =>
      f.players.filter((p) => (t ? p.name.toLowerCase().split(' & ').includes(me) : p.name.toLowerCase() === me && writerOf(f, p.id, false) == null)).map((p) => ({ f, pid: p.id })),
    );
    return hits.length === 1 ? hits[0] : null;
  };
  useEffect(() => {
    if (!ev || own || busy) return;
    const hit = mine(ev);
    if (hit) {
      void join(ev, hit.f, hit.pid);
      return;
    }
    // (in the setup the host's players reach the round with its start – looked for while this sheet is open)
    if (!awaitName.current || Date.now() - awaitName.current > 15 * 60000) return;
    const t = window.setTimeout(async () => {
      const again = await joinEvent(code);
      if (again && typeof again === 'object') setEv({ ...again });
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
        {!ev && !asking && nameField && (
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
        {!ev && !asking && !props.initial && !signedIn && (
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
        {!ev && !asking && !props.initial && signedIn && (
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
        {!ev && !asking && (
          <>
            <input
              className="input join-input"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="K7P4QX"
              aria-label={tr('Code of the round', 'Code der Runde')}
              onChange={(e) => {
                setCode(cleanCode(e.target.value));
                setMsg(null);
              }}
            />
            <button type="button" className="btn-primary" disabled={busy != null || code.length !== 6 || (nameField && !name.trim())} onClick={() => void find()}>
              {busy ?? tr('Join', 'Beitreten')}
            </button>
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
        {ev && !own && (
          <>
            <span className="muted small">{ev.course.name}</span>
            {awaitName.current > 0 && !mine(ev) && (
              <span className="near-state small" role="status">
                {tr('You are in – the host adds your name in a moment (at the latest when he starts). Or tap it below.', 'Du bist zugelassen – der Gastgeber trägt dich gleich ein (spätestens beim Start). Oder tippe unten deinen Namen an.')}
              </span>
            )}
            {flights.map((f) => (
              <div className="field" key={f.id}>
                <label>{flights.length > 1 ? tr(`Flight ${f.name} – who are you?`, `Flight ${f.name} – wer bist du?`) : tr('Who are you?', 'Wer bist du?')}</label>
                <div className="chip-set">
                  {f.players.map((p) => {
                    // already on a phone: a single player is taken; a team's second phone joins it (and can take the card over)
                    const w = writerOf(f, p.id, team);
                    const on = w ? (f.phones?.[w]?.name ?? '') : '';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="chip join-chip"
                        // a single player already on his phone is his – nobody else takes his score over by a tap
                        disabled={busy != null || (!team && w != null)}
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
            {ev.tournament && (
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
export function EventBoardCard(props: { code: string; myFlight: string; /** away from the hole map: read the event now and then */ refresh?: boolean }) {
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
  const flights = Object.keys(ev.flights).length;
  const net = (ev.format?.allowance ?? 100) > 0;
  const classes = ev.classes?.length ? CLASS_LETTERS.slice(0, ev.classes.length + 1) : [];
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
      <h2>{ev.name}</h2>
      <span className="muted small">
        {ev.tournament ? tr(`Tournament · ${flights} ${flights === 1 ? 'flight' : 'flights'}`, `Turnier · ${flights} ${flights === 1 ? 'Flight' : 'Flights'}`) : tr('Live · the phones of the flight', 'Live · alle Handys des Flights')} · {b.title}
      </span>
      {ev.tournament && (net || classes.length > 0) && (
        <div className="chip-set lb-filters">
          {net && (
            <>
              <button type="button" className={`chip${!gross ? ' on' : ''}`} aria-pressed={!gross} onClick={() => setGross(false)}>
                {tr('Net', 'Netto')}
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
              <span className="lb-thru muted small">{r.finished ? 'F' : r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '–'}</span>
            </li>
          );
        })}
      </ol>
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
const CLASS_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Handing the card in (Sascha's concept 30.10.2026: "player and marker confirm – then it is locked"): on the scorecard
 * of a round with a marker, the own card to sign as the player and the partner's as his marker – once every hole has
 * both counts and none differs. Signed by both, the score is locked on every phone.
 */
export function SignCard(props: { round: Round }) {
  const s = props.round.shared;
  const [ev, setEv] = useState(() => (s ? cachedEvent(s.code) : null));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!s) return;
    const on = () => setEv(cachedEvent(s.code));
    window.addEventListener('golfos:event-changed', on);
    // away from the hole map (no exchange there): the partner's signature read every few seconds
    const t = window.setInterval(() => document.visibilityState === 'visible' && void refreshEvent(s.code), 5000);
    void refreshEvent(s.code);
    return () => {
      window.removeEventListener('golfos:event-changed', on);
      window.clearInterval(t);
    };
  }, [s?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = s && ev?.flights[s.flight];
  if (!s || !f || !f.markers) return null;
  const me = props.round.players.find((p) => p.isMe);
  const marked = props.round.players.filter((p) => !p.isMe && s.roles?.[p.id] === 'mark');
  const cards: { pid: string; name: string; as: 'player' | 'marker' }[] = [
    ...(me ? [{ pid: me.id, name: me.name, as: 'player' as const }] : []),
    ...marked.map((p) => ({ pid: p.id, name: p.name, as: 'marker' as const })),
  ];
  const label = (i: number) => ev!.holes[i]?.label ?? String(i + 1);
  const sign = async (pid: string, as: 'player' | 'marker') => {
    setBusy(true);
    const ok = await signCard(props.round, pid, as);
    setBusy(false);
    setMsg(ok ? null : tr('Not signed – check the holes, or no connection.', 'Nicht unterschrieben – Löcher prüfen oder keine Verbindung.'));
  };
  return (
    <section className="card sign-card" aria-label={tr('Hand the card in', 'Scorekarte abgeben')}>
      <h2>{tr('Hand the card in', 'Scorekarte abgeben')}</h2>
      {cards.map((c) => {
        const done = f.signed?.[c.pid]?.[c.as];
        const locked = isSigned(f, c.pid);
        const can = signable(f, c.pid, ev!.holes.length);
        return (
          <div key={c.pid + c.as} className="sign-row">
            <span className="grow">
              <strong>{c.as === 'player' ? tr('Your card', 'Deine Karte') : tr(`As marker of ${c.name}`, `Als Zähler von ${c.name}`)}</strong>
              <span className="muted small">
                {locked
                  ? tr('Signed by player and marker – handed in, locked', 'Von Spieler und Zähler unterschrieben – abgegeben, gesperrt')
                  : done
                    ? c.as === 'player'
                      ? tr('Signed by you – the marker signs next', 'Von dir unterschrieben – jetzt unterschreibt der Zähler')
                      : tr(`Signed by you – ${c.name} signs his own next`, `Von dir unterschrieben – jetzt unterschreibt ${c.name} selbst`)
                    : can.ok
                      ? tr('All holes agree – ready to sign', 'Alle Löcher stimmen überein – bereit zum Unterschreiben')
                      : can.differ.length
                        ? tr(`Counts differ on ${can.differ.map(label).join(', ')} – agree first`, `Zählung weicht ab auf ${can.differ.map(label).join(', ')} – erst abstimmen`)
                        : tr(`Still open: ${can.missing.map(label).join(', ')}`, `Noch offen: ${can.missing.map(label).join(', ')}`)}
              </span>
            </span>
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
