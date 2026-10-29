import { useEffect, useState } from 'react';
import type { CourseSummary, Round } from '../types';
import { cleanCode } from '../lib/sharedgame';
import { addFlight, askToJoin, cachedEvent, differences, eventBoard, joinEvent, nearbyRounds, NEARBY_HOURS, newFlightRound, roundFromEvent, roundJoinLink, shareRound, showNearby, writerOf, type NearbyRound, type RoundEvent } from '../lib/sharedround';
import { isTeamMode, modeName, type GameMode } from '../lib/games';
import { loadCachedCourse, newId } from '../lib/storage';
import { loadCourse } from '../lib/courses';
import { loadProfile, shownName } from '../lib/profile';
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
                'Your flight on their own phones (signed in with Google): everyone keeps his own score – strokes, putts, penalties – and, as marker, a partner\'s; the scorecard shows both live. Several flights: a tournament with a live leaderboard.',
                'Dein Flight auf den eigenen Handys (mit Google angemeldet): Jeder erfasst seinen eigenen Score – Schläge, Putts, Strafschläge – und als Zähler den eines Mitspielers; die Scorekarte zeigt beides live. Mehrere Flights: ein Turnier mit Live-Leaderboard.',
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
          </div>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await shareRound(props.round, courseSummary(props.round), { name: name.trim() || props.round.courseName, tournament, who: myName() });
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
          ? tr('Scan, or type the code under "Join a round": your flight picks who it is, another flight starts its own.', 'Scannen oder Code unter „Runde beitreten“ eingeben: Dein Flight wählt, wer er ist – ein anderer Flight legt seinen eigenen an.')
          : tr('Scan, or type the code under "Join a round" – then pick who you are.', 'Scannen oder Code unter „Runde beitreten“ eingeben – dann wählen, wer man ist.')}
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
      {msg && <span className="muted small">{msg}</span>}
    </>
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

export function JoinRoundSheet(props: { initial?: string; onJoined: (r: Round) => void; onClose: () => void; /** a game's code: join it in Games */ onGameCode?: (code: string) => void }) {
  const [code, setCode] = useState(cleanCode(props.initial ?? ''));
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ev, setEv] = useState<RoundEvent | null>(null);
  const [own, setOwn] = useState<NewPlayer[] | null>(null); // a flight of one's own (tournament)
  const find = async (c = code) => {
    setBusy(tr('Joining …', 'Trete bei …'));
    const found = await joinEvent(c);
    setBusy(null);
    // a game's code here (Sascha 29.10.2026: Games as Rounds): on to Games, which joins it
    if (found === 'game' && props.onGameCode) props.onGameCode(cleanCode(c));
    else if (found === 'game') setMsg(tr('This code is a game – join it under Games.', 'Dieser Code ist ein Spiel – das unter Games beitreten.'));
    else if (found === 'none') setMsg(tr('No round with this code – check the code.', 'Keine Runde mit diesem Code – Code prüfen.'));
    else if (!found) setMsg(tr('No connection – check the code or the connection.', 'Keine Verbindung – Code oder Verbindung prüfen.'));
    else setEv(found);
  };
  // the rounds shown nearby (Sascha 29.10.2026): null while looking, [] none – not when opened by the link
  const [near, setNear] = useState<NearbyRound[] | null>(null);
  // asked to join a round nearby: waiting till the host lets this phone in (Sascha 29.10.2026)
  const [asking, setAsking] = useState<NearbyRound | null>(null);
  useEffect(() => {
    if (!asking) return;
    let gone = false;
    const look = async () => {
      const a = await askToJoin(asking.ref, myName());
      if (gone || !a || a.state === 'asked') return;
      setAsking(null);
      if (a.state === 'ok') {
        setCode(a.code);
        void find(a.code);
      } else
        setMsg(
          a.state === 'no'
            ? tr(`${asking.host || 'The host'} did not let you in.`, `${asking.host || 'Der Gastgeber'} hat den Beitritt abgelehnt.`)
            : tr('The round is no longer shown nearby – ask for the code.', 'Die Runde ist nicht mehr in der Nähe sichtbar – nach dem Code fragen.'),
        );
    };
    void look();
    const t = window.setInterval(() => void look(), 3000);
    return () => {
      gone = true;
      window.clearInterval(t);
    };
  }, [asking]); // eslint-disable-line react-hooks/exhaustive-deps
  // opened by the link: look it up straight away
  useEffect(() => {
    if (props.initial && cleanCode(props.initial).length === 6) void find(cleanCode(props.initial));
    else
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
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Join a round', 'Runde beitreten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{ev ? ev.name : tr('Join a round', 'Runde beitreten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {asking && (
          <div className="join-wait" role="status">
            <strong>{asking.host ? tr(`Asked ${asking.host} to let you in …`, `Anfrage an ${asking.host} gesendet …`) : tr('Asked to join …', 'Anfrage gesendet …')}</strong>
            <span className="muted small">{tr('As soon as the host lets you in, the round opens here.', 'Sobald der Gastgeber zustimmt, geht es hier weiter.')}</span>
            <button type="button" className="btn-secondary" onClick={() => setAsking(null)}>
              {tr('Cancel', 'Abbrechen')}
            </button>
          </div>
        )}
        {!ev && !asking && !props.initial && (
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
                  setAsking(n);
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
            <button type="button" className="btn-primary" disabled={busy != null || code.length !== 6} onClick={() => void find()}>
              {busy ?? tr('Join', 'Beitreten')}
            </button>
          </>
        )}
        {ev && !own && (
          <>
            <span className="muted small">{ev.course.name}</span>
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
                        disabled={busy != null}
                        onClick={async () => {
                          await ready(ev);
                          setBusy(null);
                          props.onJoined(roundFromEvent(ev, f.id, p.id, code, newId(), myName()));
                        }}
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
export function EventBoardCard(props: { code: string; myFlight: string }) {
  const [ev, setEv] = useState(() => cachedEvent(props.code));
  useEffect(() => {
    const on = () => setEv(cachedEvent(props.code));
    window.addEventListener('golfos:event-changed', on);
    return () => window.removeEventListener('golfos:event-changed', on);
  }, [props.code]);
  if (!ev) return null;
  const b = eventBoard(ev);
  const mine = new Set((ev.flights[props.myFlight]?.players ?? []).map((p) => `${props.myFlight}/${p.id}`));
  const flights = Object.keys(ev.flights).length;
  const diff = (key: string): string | null => {
    const [fid, pid] = key.split('/');
    const f = ev.flights[fid];
    const holes = f ? differences(f, pid) : [];
    return holes.length ? holes.map((i) => ev.holes[i]?.label ?? String(i + 1)).join(', ') : null;
  };
  return (
    <section className="card stats-card leaderboard event-board">
      <h2>{ev.name}</h2>
      <span className="muted small">
        {ev.tournament ? tr(`Tournament · ${flights} ${flights === 1 ? 'flight' : 'flights'}`, `Turnier · ${flights} ${flights === 1 ? 'Flight' : 'Flights'}`) : tr('Live · the phones of the flight', 'Live · alle Handys des Flights')} · {b.title}
      </span>
      <ol className="lb-rows">
        {b.rows.map((r) => {
          const d = diff(r.key);
          return (
            <li key={r.key} className={mine.has(r.key) ? 'lb-mine' : undefined}>
              <span className="lb-rank">{r.rank}</span>
              <span className="lb-name">
                <Avatar name={r.name} me={mine.has(r.key)} size={24} />
                <span>
                  {r.name}
                  {d && <small className="lb-diff">{tr(`marker differs: ${d}`, `Zähler weicht ab: ${d}`)}</small>}
                </span>
              </span>
              <span className="lb-value">{r.value}</span>
              <span className="lb-thru muted small">{r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '–'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
