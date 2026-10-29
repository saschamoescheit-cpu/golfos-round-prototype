import { useEffect, useState } from 'react';
import type { CourseSummary, Round } from '../types';
import { cleanCode } from '../lib/sharedgame';
import { addFlight, cachedEvent, eventBoard, joinEvent, newFlightRound, roundFromEvent, roundJoinLink, shareRound, type RoundEvent } from '../lib/sharedround';
import { loadCachedCourse } from '../lib/storage';
import { loadCourse } from '../lib/courses';
import { loadProfile, shownName } from '../lib/profile';
import { tr } from '../lib/i18n';
import { Qr } from './ShareGame';
import { Avatar } from './Avatar';

// Invite to a round and join one (Sascha 29.10.2026): the same scramble team on two phones, or a tournament over several
// flights with a live leaderboard. The host shows the code and the QR code; the others scan it or type the code under
// "Join a round" and play in a flight that is there – or start their own.

/** Where the course comes from, for the phones that join (they load it themselves). */
function courseSummary(round: Round): CourseSummary {
  const c = loadCachedCourse(round.courseId);
  return c
    ? { id: c.id, source: c.source, name: c.name, lat: c.lat, lon: c.lon, ...(c.bbox ? { bbox: c.bbox } : {}) }
    : { id: round.courseId, source: 'osm', name: round.courseName, lat: 0, lon: 0 };
}

export function RoundInviteSheet(props: { round: Round; onShared: (r: Round) => void; onClose: () => void }) {
  const shared = props.round.shared;
  const [tournament, setTournament] = useState(false);
  const [name, setName] = useState(() => `${props.round.courseName} · ${new Date(props.round.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Invite players', 'Mitspieler einladen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{shared?.tournament ? tr('Tournament', 'Turnier') : tr('Invite players', 'Mitspieler einladen')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!shared ? (
          <>
            <span className="muted">
              {tr(
                'Your flight on other phones: everyone enters the scores, everyone sees them (signed in with Google). Several flights: a tournament with a live leaderboard.',
                'Dein Flight auf weiteren Handys: Jeder trägt ein, jeder sieht die Scores (mit Google angemeldet). Mehrere Flights: ein Turnier mit Live-Leaderboard.',
              )}
            </span>
            <div className="drawer-list settings-switches">
              <button type="button" className="drawer-row" role="switch" aria-checked={tournament} onClick={() => setTournament(!tournament)}>
                <span className="switch-label">
                  <span>{tr('Tournament over several flights', 'Turnier über mehrere Flights')}</span>
                  <span className="muted small">{tr('Other flights join with the code and start their own flight', 'Weitere Flights treten mit dem Code bei und legen ihren eigenen Flight an')}</span>
                </span>
                <span className={`drawer-switch${tournament ? ' on' : ''}`} aria-hidden="true" />
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
                const r = await shareRound(props.round, courseSummary(props.round), { name: name.trim() || props.round.courseName, tournament });
                setBusy(false);
                if (r) props.onShared(r);
                else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
              }}
            >
              {busy ? tr('Creating …', 'Erzeuge …') : tr('Create a code', 'Code erzeugen')}
            </button>
          </>
        ) : (
          <>
            <Qr text={roundJoinLink(shared.code)} />
            <strong className="join-code" aria-label={tr(`Code ${shared.code}`, `Code ${shared.code}`)}>
              {shared.code}
            </strong>
            <span className="muted small">
              {shared.tournament
                ? tr('Scan, or type the code under "Join a round": your flight picks who it is, another flight starts its own.', 'Scannen oder Code unter „Runde beitreten“ eingeben: Dein Flight wählt, wer er ist – ein anderer Flight legt seinen eigenen an.')
                : tr('Scan, or type the code under "Join a round" – then pick who you are.', 'Scannen oder Code unter „Runde beitreten“ eingeben – dann wählen, wer man ist.')}
            </span>
            <button type="button" className="btn-secondary" onClick={share}>
              {tr('Share the link', 'Link teilen')}
            </button>
          </>
        )}
        {msg && <span className="muted small">{msg}</span>}
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
  // opened by the link: look it up straight away
  useEffect(() => {
    if (props.initial && cleanCode(props.initial).length === 6) void find(cleanCode(props.initial));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the course on this phone before the round starts: its map, par and stroke index
  const ready = async (e: RoundEvent) => {
    setBusy(tr('Loading the course …', 'Lade den Platz …'));
    await loadCourse(e.course).catch(() => null); // offline: the round still plays, the map as far as the phone has it
  };
  const flights = ev ? Object.values(ev.flights) : [];
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet invite-sheet" role="dialog" aria-label={tr('Join a round', 'Runde beitreten')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{ev ? ev.name : tr('Join a round', 'Runde beitreten')}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        {!ev && (
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
                  {f.players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="chip"
                      disabled={busy != null}
                      onClick={async () => {
                        await ready(ev);
                        setBusy(null);
                        props.onJoined(roundFromEvent(ev, f.id, p.id, code));
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
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
                const { round, flight } = newFlightRound(ev, players, code);
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

/** The live leaderboard of all flights of a tournament (updated with every exchange). */
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
  return (
    <section className="card stats-card leaderboard event-board">
      <h2>{ev.name}</h2>
      <span className="muted small">
        {tr(`Tournament · ${flights} ${flights === 1 ? 'flight' : 'flights'}`, `Turnier · ${flights} ${flights === 1 ? 'Flight' : 'Flights'}`)} · {b.title}
      </span>
      <ol className="lb-rows">
        {b.rows.map((r) => (
          <li key={r.key} className={mine.has(r.key) ? 'lb-mine' : undefined}>
            <span className="lb-rank">{r.rank}</span>
            <span className="lb-name">
              <Avatar name={r.name} me={mine.has(r.key)} size={24} />
              {r.name}
            </span>
            <span className="lb-value">{r.value}</span>
            <span className="lb-thru muted small">{r.thru ? tr(`thru ${r.thru}`, `nach ${r.thru}`) : '–'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
