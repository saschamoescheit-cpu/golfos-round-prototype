import { useEffect, useMemo, useRef, useState } from 'react';
import { loadStrategy } from '../lib/strategy';
import type { CaptureMode, Course, Player, Round, RoundHole } from '../types';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { FriendChips, roughPlaying } from './Home';
import { ROUND_KINDS, kindName, type RoundKind } from '../lib/roundkind';
import { emptyEntry } from '../lib/scoring';
import { loadCarryBag, loadGeometry, newId } from '../lib/storage';
import { ensureCourseMap } from '../lib/courses';
import { TopBar } from '../components/ui';
import { courseTees, defaultTee, profileTee, TEE_COLOURS, TEES, teeName } from '../data/tees';
import { inUsa } from '../lib/weather';
import { dec, tr } from '../lib/i18n';
import { courseHandicap, parseIndex, ratingFor, saveOwnRating } from '../lib/handicap';
import { fetchShared } from '../lib/sharedratings';
import type { TeeRating } from '../data/ratings';
import { isLady, shownName, loadProfile, saveProfile } from '../lib/profile';
import { DEFAULT_FORMAT, FORMATS, formatOf, isTeamMode, teamHandicap, teamsOf, whsAllowance, type RoundFormat } from '../lib/games';
import { sharingAvailable, sharingMissing } from '../lib/sharedgame';
import { InvitePanel } from '../components/ShareRound';

const ME_KEY = 'golfos.me.v1';
// Name and handicap index come from the profile when it is filled in (profile tab).
const profile = () => loadProfile();

export interface DraftPlayer {
  id: string;
  name: string;
  index: string; // handicap index as typed – the playing handicap follows from course rating and slope
  handicap: string; // playing handicap as typed, where the course has no rating
  tee: string | null; // each player's own tee (Sascha 21.10.2026) – mine sets the lengths on the map
}

/** What the setup remembers from the last round: the player, how they track and the tee per course. */
interface Remembered {
  name: string;
  index?: string;
  handicap?: string;
  handicap18?: string; // the playing handicap for 18 holes (a 9-hole round entered half of it)
  mode?: CaptureMode;
  tees?: Record<string, string>;
}

function loadRemembered(): Remembered | null {
  try {
    const raw = localStorage.getItem(ME_KEY);
    return raw ? (JSON.parse(raw) as Remembered) : null;
  } catch {
    return null;
  }
}

export function RoundSetup(props: { course: Course; from?: { holes: RoundHole[]; tee: string | null }; onBack: () => void; onStart: (r: Round) => void; onBook: (holes: RoundHole[], tee: string | null, playing: number | null) => void }) {
  const options = useMemo(() => loopOptions(props.course.holes), [props.course]);
  // back from the preview or the birdie book: the loops chosen before
  const [optionId, setOptionId] = useState(() => {
    const want = props.from?.holes.map((h) => h.label).join();
    return (want && options.find((o) => buildRoundHoles(props.course.holes, o).map((h) => h.label).join() === want)?.id) || (options[0]?.id ?? '');
  });
  const remembered = useMemo(loadRemembered, []);
  // One way to play (13.10.2026): the score on the course, the shots afterwards from the GPS track – the old choice
  // "quick / detailed" promised shot-by-shot buttons that are gone. Rounds keep the field for older data.
  const mode: CaptureMode = 'quick';
  // the tees the course offers: its scorecard, else what its map knows, else the usual colours (Sascha 22.10.2026:
  // "at Frielinghausen I cannot choose a tee at all"); a tee the player typed himself counts too
  const [geoTick, setGeoTick] = useState(0);
  const offered = useMemo(() => courseTees(props.course.id, loadGeometry(props.course.id).teeColours), [props.course.id, geoTick]);
  // a map saved before the app read the tees from it: fetched again once, then its tees are offered
  useEffect(() => {
    if (loadGeometry(props.course.id).teeColours !== undefined) return;
    ensureCourseMap(props.course.id, true).then((came) => came && setGeoTick((t) => t + 1));
  }, [props.course.id]);
  const lastTee = remembered?.tees?.[props.course.id];
  // the standard tee from the profile first (Sascha 22.10.2026: "yellow as a rule, white now and then" – a round from
  // white does not make white the start of the next), else the one played here last, else yellow / red
  const lady = isLady();
  // only the course's own tees (Sascha 22.10.2026: "we show only the official tees")
  const own = (t: string | null | undefined) => (t && offered.tees.includes(t) ? t : null);
  const startTee: string | null = own(props.from?.tee) ?? profileTee(offered, loadProfile().tee, props.course.id, inUsa([props.course.lon, props.course.lat])) ?? own(lastTee) ?? defaultTee(offered.tees, lady);
  // The playing handicap is remembered for 18 holes; a 9-hole round is pre-filled with half of it.
  // Nothing remembered yet: the rounded handicap index from the profile is the start value ("+1,2" = plus handicap).
  const fromProfile = (() => {
    const t = loadProfile().hcpIndex.trim().replace(',', '.');
    const n = Number(t.replace('+', ''));
    return t === '' || !Number.isFinite(n) ? '' : String(Math.round(t.startsWith('+') ? -n : n));
  })();
  const h18 = remembered?.handicap18 ?? remembered?.handicap ?? fromProfile;
  const autoFor = (nineHoles: boolean): string => {
    const n = Number(h18.replace(',', '.'));
    return h18.trim() === '' || !Number.isFinite(n) || !nineHoles ? h18 : String(Math.round(n / 2));
  };
  const autoHcp = useRef<string | null>(autoFor(false));
  const [me, setMe] = useState<DraftPlayer>(() => {
    const p = profile();
    return { id: 'me', name: shownName(p) || remembered?.name || tr('Me', 'Ich'), index: p.hcpIndex || remembered?.index || '', handicap: autoFor(false), tee: startTee };
  });
  const [others, setOthers] = useState<DraftPlayer[]>([]);
  const tee = me.tee; // my tee: the lengths, the caddie, the round's course rating
  // Game mode, scoring and handicap allowance, chosen as in Hole19 (Sascha 14.10.2026): three rows, each opens a list
  const [format, setFormat] = useState<RoundFormat>(DEFAULT_FORMAT);
  const [picker, setPicker] = useState<null | 'mode' | 'scoring' | 'allowance' | 'drives'>(null);
  // the allowance chosen by hand stays; else the WHS value of the format (Sascha's concept 30.10.2026)
  const [allowanceSet, setAllowanceSet] = useState(false);
  // the kind of round – the first row of the format block, chosen like the game mode (Sascha 15.10.2026)
  const [kind, setKind] = useState<RoundKind>('social');
  const [kindOpen, setKindOpen] = useState(false);
  const fmt = formatOf(format);
  const playerCount = others.length + 1;
  const fits = fmt.fits(playerCount);
  const allowance = format.allowance ?? 100;
  // stroke play with 0 % allowance is gross
  const shownFormat: RoundFormat = { ...format, matchplay: fmt.matchplay, scoring: format.scoring === 'stableford' ? 'stableford' : allowance > 0 ? 'net' : 'stroke' };

  const option = options.find((o) => o.id === optionId);
  const holes = option ? buildRoundHoles(props.course.holes, option) : [];
  const hasCarries = useMemo(() => loadCarryBag() != null, []);
  const missing = holes.filter((h) => !h.par || !h.strokeIndex).length;

  // Course rating and slope of the chosen tee (18 holes): the playing handicap follows from the handicap index.
  // 9 holes: half the 18-hole course handicap (WHS uses 9-hole ratings; half of the 18-hole one is within a stroke).
  // per combination of loops where the course has them; the player's own values from the club's scorecard first
  // (Sascha 21.10.2026: "every course has a course rating – it has to count")
  const teeKey = tee ?? '–'; // a course without tee data: the player's values for "the" tee
  const [ratingsSeen, setRatingsSeen] = useState(0); // re-read after the player saved his own values
  // the values other players entered for this course – read again when new ones came (night run 22./23.10.2026)
  useEffect(() => {
    let alive = true;
    // read again after every answer: a second request (React's double start in development) finds nothing new itself
    fetchShared(props.course.id).then(() => alive && setRatingsSeen((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [props.course.id]);
  const rating: TeeRating | null = useMemo(() => (holes.length === 18 || holes.length === 9 ? ratingFor(props.course.id, teeKey, holes, lady) : null), [props.course.id, teeKey, holes.map((h) => h.label).join(), ratingsSeen, lady]);
  // every player by his own tee
  const ratingOf = (p: DraftPlayer): TeeRating | null => (p.id === 'me' ? rating : holes.length === 18 || holes.length === 9 ? ratingFor(props.course.id, p.tee ?? '–', holes) : null);
  // the tees to choose from, with their length for the chosen holes and their course rating
  const teeChoices = teeChoicesFor(props.course.id, holes, offered.tees, lady);
  const nine = holes.length === 9;
  // 9 or 18 holes chosen: the remembered playing handicap follows (unless the player typed his own)
  useEffect(() => {
    if (me.handicap !== autoHcp.current) return;
    const v = autoFor(nine);
    autoHcp.current = v;
    setMe((m) => ({ ...m, handicap: v }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nine]);
  // the rating is for 18 holes: its par too (a loop of 9 holes counts twice)
  const loopHoles = props.course.holes.filter((h) => h.loop === holes[0]?.loop);
  const par = nine ? loopHoles.reduce((sum, h) => sum + (h.par || 0), 0) * (loopHoles.length <= 9 ? 2 : 1) : holes.reduce((sum, h) => sum + (h.par || 0), 0);
  // Always from the handicap index (Sascha 21.10.2026: "you do not always know your partners' playing handicap –
  // enter the HCP, the playing handicap follows and cannot be edited"). Without course rating and slope for the tee
  // it is estimated with slope 113 and rating = par, i.e. the rounded index (half of it for 9 holes).
  const playingHandicap = (p: DraftPlayer): number | null => {
    const idx = parseIndex(p.index);
    if (idx == null) return null;
    const rating = ratingOf(p);
    const rPar = rating?.par ?? par; // shorter tees can have their own par
    if (rating) return nine ? Math.round((idx * (rating.slope / 113) + (rating.cr - rPar)) / 2) : courseHandicap(idx, rating, rPar);
    return Math.round(nine ? idx / 2 : idx);
  };

  // the holes of the chosen loops with a plan – a loop planned once counts in every combination (A+B, C+A, B+C)
  const strategy = loadStrategy(props.course.id);
  const planned = holes.filter((h) => strategy[h.label]).length;
  // an HCP other than the profile's: asked once whether it is the new one (Sascha 21.10.2026) – or only for this round
  const [askHcp, setAskHcp] = useState<{ preview: boolean; planning: boolean } | null>(null);
  const profileHcp = profile().hcpIndex.trim();
  const hcpDiffers = me.index.trim() !== '' && profileHcp !== '' && parseIndex(me.index) != null && parseIndex(me.index) !== parseIndex(profileHcp);
  const begin = (preview = false, planning = false) => (hcpDiffers ? setAskHcp({ preview, planning }) : start(preview, planning, true));
  const start = (preview = false, planning = false, saveHcp = false) => {
    if (!option) return;
    try {
      const entered = Number(me.handicap.replace(',', '.'));
      const handicap18 = me.handicap.trim() !== '' && Number.isFinite(entered) && nine ? String(entered * 2) : me.handicap;
      const r: Remembered = { name: me.name, index: me.index, handicap: me.handicap, handicap18, mode, tees: { ...remembered?.tees, ...(tee ? { [props.course.id]: tee } : {}) } };
      localStorage.setItem(ME_KEY, JSON.stringify(r));
      // a changed handicap index is the player's new index – the profile keeps it
      const p = profile();
      if (saveHcp && me.index.trim() && me.index.trim() !== p.hcpIndex) saveProfile({ ...p, hcpIndex: me.index.trim() });
    } catch {
      /* ignore */
    }
    const r = draft(preview, planning);
    // invited in the setup: the round is the event's (the preview of the course stays on this phone)
    if (r) props.onStart(share && !preview ? { ...r, shared: share } : r);
  };
  /** The round as it would start now – for the start, and for the invitation made before it. */
  const draft = (preview = false, planning = false): Round | null => {
    if (!option) return null;
    const single: Player[] = [
      { id: 'me', name: me.name.trim() || tr('Me', 'Ich'), playingHandicap: playingHandicap(me), isMe: true, ...(me.tee ? { tee: me.tee } : {}) },
      ...others.map((o, i) => ({ id: o.id, name: o.name.trim() || tr(`Player ${i + 2}`, `Spieler ${i + 2}`), playingHandicap: playingHandicap(o), isMe: false, ...(o.tee ? { tee: o.tee } : {}) })),
    ];
    // Scramble and foursomes: one ball per team – the teams are the round's players (one score per hole each)
    const players: Player[] = isTeamMode(shownFormat.mode)
      ? teamsOf(shownFormat.mode, single.length).map((t, k) => ({
          id: k === 0 ? 'me' : `team-${k + 1}`,
          name: t.map((j) => single[j].name).join(' & '),
          playingHandicap: teamHandicap(shownFormat.mode, t.map((j) => single[j].playingHandicap)),
          isMe: k === 0,
        }))
      : single;
    const entries: Round['entries'] = {};
    for (const p of players) entries[p.id] = holes.map(() => emptyEntry());
    return {
      id: newId(),
      createdAt: new Date().toISOString(),
      finishedAt: null,
      courseId: props.course.id,
      courseName: props.course.name,
      loopOrder: option.loops,
      holes,
      mode,
      players,
      entries,
      currentHole: 0,
      // on several phones: with a marker, when chosen (Sascha 30.10.2026 – by default everyone keeps only his own)
      format: withMarker && !isTeamMode(shownFormat.mode) ? { ...shownFormat, marker: true } : shownFormat,
      kind,
      ...(tee ? { tee } : {}),
      ...(rating ? { rating: { cr: rating.cr, slope: rating.slope } } : {}),
      ...(preview ? { preview: true } : {}),
      ...(planning ? { planning: true } : {}),
    };
  };
  // the flight partners on their own phones (Sascha 29.10.2026: "invite where the round is set up, with the flight
  // partners – not only once it has begun"): the code made here, the round starts with it
  const [share, setShare] = useState<Round['shared'] | null>(null);
  const [withMarker, setWithMarker] = useState(false);
  const [canShare, setCanShare] = useState<boolean | null>(null);
  useEffect(() => {
    void sharingAvailable().then(setCanShare);
  }, []);
  const invitable = useMemo(() => (canShare ? draft() : null), [canShare, share, me, others, format, optionId, kind, withMarker]); // eslint-disable-line react-hooks/exhaustive-deps
  // let in and not in the list yet (Sascha 30.10.2026: scanned, asked, let in – no typing for the host): he becomes a
  // player here, with the handicap index from his profile; the joining phone finds its name and is in
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ code: string; name: string; hcp: string }>).detail;
      if (!share || d.code !== share.code || share.tournament || !d.name.trim()) return; // a tournament: his own flight
      const known = (n: string) => n.trim().toLowerCase() === d.name.trim().toLowerCase();
      setOthers((os) => {
        if (known(me.name) || os.some((o) => known(o.name)) || os.length >= 3) return os;
        const blank = os.findIndex((o) => !o.name.trim() && !o.index.trim());
        const p = { id: newId(), name: d.name.trim(), index: d.hcp, handicap: roughPlaying(d.hcp), tee: me.tee };
        return blank >= 0 ? os.map((o, k) => (k === blank ? { ...p, id: o.id } : o)) : [...os, p];
      });
    };
    window.addEventListener('golfos:join-approved', on);
    return () => window.removeEventListener('golfos:join-approved', on);
  }, [share, me.name, me.tee]);

  return (
    <main className="screen">
      <TopBar title={props.course.name} onBack={props.onBack} />

      {kindOpen && (
        <div className="sheet-backdrop" onClick={() => setKindOpen(false)}>
          <section className="sheet" role="dialog" aria-label={tr('Kind of round', 'Rundenart')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Kind of round', 'Rundenart')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setKindOpen(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {ROUND_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className="pick-option"
                  aria-pressed={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    // single play: 95 % in a competition, 100 % with friends – unless chosen by hand
                    if (!allowanceSet) setFormat((f) => ({ ...f, allowance: whsAllowance(f.mode, formatOf(f).matchplay, k.id === 'tournament') }));
                    setKindOpen(false);
                  }}
                >
                  <span className="grow">
                    <strong>{k.name()}</strong>
                    <span className="muted small">{k.text()}</span>
                  </span>
                  {kind === k.id && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Holes', 'Löcher')}</span>
        <div className="choice-grid">
          {options.map((o) => (
            <button key={o.id} type="button" className="choice choice-loop" aria-label={o.label} aria-pressed={o.id === optionId} onClick={() => setOptionId(o.id)}>
              {/* "A + B · 18 holes": the loops large, the number of holes small below (no odd wrap on small phones) */}
              <strong>{o.label.split(' · ')[0]}</strong>
              {o.label.includes(' · ') && <span className="small muted">{o.label.split(' · ').slice(1).join(' · ')}</span>}
            </button>
          ))}
        </div>
        {missing > 0 && (
          <div className="notice">
            {tr(
              `${missing} ${missing === 1 ? 'hole is' : 'holes are'} missing par or stroke index. You can fill them in on the hole; the app remembers them for this course.`,
              `Bei ${missing} ${missing === 1 ? 'Loch fehlt' : 'Löchern fehlen'} Par oder Hcp. Du kannst sie am Loch eintragen; die App merkt sie sich für diesen Platz.`,
            )}
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        <PlayerRow player={me} onChange={setMe} nameLabel={tr('Your name', 'Dein Name')} rating={rating} playing={playingHandicap(me)} nine={nine} tees={teeChoices} />
        {others.map((p, i) => (
          <PlayerRow
            key={p.id}
            player={p}
            nameLabel={tr(`Player ${i + 2}`, `Spieler ${i + 2}`)}
            rating={ratingOf(p)}
            playing={playingHandicap(p)}
            tees={teeChoices}
            onChange={(np) => setOthers(others.map((o) => (o.id === p.id ? np : o)))}
            onRemove={() => setOthers(others.filter((o) => o.id !== p.id))}
          />
        ))}
        {others.length < 3 && (
          <FriendChips
            taken={[me.name, ...others.map((o) => o.name)]}
            onAdd={(f) => setOthers([...others.filter((o) => o.name.trim() || o.index.trim() || o.handicap.trim()), { id: newId(), name: f.name, index: f.hcp, handicap: roughPlaying(f.hcp), tee: me.tee }].slice(0, 3))}
          />
        )}
        {others.length < 3 && (
          <button type="button" className="btn-secondary" onClick={() => setOthers([...others, { id: newId(), name: '', index: '', handicap: '', tee: me.tee }])}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
        {/* the flight on their own phones – or a tournament over several flights (Sascha 29.10.2026); every round, social
            or competition, any format ("not only scramble or a tournament") */}
        {invitable && (
          <div className="card invite-card" aria-label={tr('Invite players', 'Mitspieler einladen')}>
            <strong>{share?.tournament ? tr('Tournament', 'Turnier') : tr('Invite players', 'Mitspieler einladen')}</strong>
            {!isTeamMode(shownFormat.mode) && (
              <div className="drawer-list settings-switches">
                <button type="button" className="drawer-row" role="switch" aria-checked={withMarker} onClick={() => setWithMarker(!withMarker)}>
                  <span className="switch-label">
                    <span>{tr('Play with a marker', 'Mit Zähler spielen')}</span>
                    <span className="muted small">{withMarker ? tr('Everyone enters his own score and his partner\'s – a difference shows', 'Jeder trägt seinen Score und den seines Partners ein – Abweichungen werden angezeigt') : tr('Off: everyone enters only his own score and sees the others', 'Aus: Jeder trägt nur seinen eigenen Score ein und sieht die anderen')}</span>
                  </span>
                  <span className={`drawer-switch${withMarker ? ' on' : ''}`} aria-hidden="true" />
                </button>
              </div>
            )}
            <InvitePanel round={{ ...invitable, ...(share ? { shared: share } : {}) }} onShared={(r) => setShare(r.shared ?? null)} compact />
          </div>
        )}
        {canShare === false && (
          <span className="muted small">
            {sharingMissing() === 'server'
              ? tr('Inviting is not set up on the server yet: run the SQL "golfos-shared-games" once in Supabase, then open the app again.', 'Einladen ist auf dem Server noch nicht eingerichtet: das SQL „golfos-shared-games“ einmal in Supabase ausführen, dann die App neu öffnen.')
              : sharingMissing() === 'offline'
                ? tr('Inviting needs a connection – no connection right now.', 'Einladen braucht eine Verbindung – gerade keine Verbindung.')
                : tr('To invite your flight to their own phones: sign in with Google (Profile → "On all your devices").', 'Flightpartner auf ihre eigenen Handys einladen: mit Google anmelden (Profil → „Auf allen Geräten“).')}
          </span>
        )}
        {/* where the playing handicap comes from – once for all players; missing or wrong: typed from the club's
            scorecard, kept for this course, these loops and this tee */}
        {(holes.length === 18 || nine) && (
          <RatingLine
            rating={rating}
            nine={nine}
            onSave={(v) => {
              saveOwnRating(props.course.id, teeKey, holes, v);
              setRatingsSeen((n) => n + 1);
            }}
          />
        )}
        {/* the caddie picks clubs by the player's carries – without them it uses standard ones */}
        {!hasCarries && (
          <p className="small good-text" style={{ margin: 0 }}>
            {tr(
              'The caddie uses standard distances (driver 200 m … PW 115 m) – enter your own carries in your profile under “My bag”.',
              'Der Caddie rechnet mit Standard-Weiten (Driver 200 m … PW 115 m) – deine eigenen Carry-Weiten trägst du im Profil unter „Mein Bag“ ein.',
            )}
          </p>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Format', 'Format')}</span>
        <div className="settings-list">
          {/* the kind of round first, in the format block (Sascha 15.10.2026) */}
          <button type="button" className="settings-row" onClick={() => setKindOpen(true)}>
            <span>{tr('Kind of round', 'Rundenart')}</span>
            <span className="settings-value">{kindName(kind)}</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="settings-row" onClick={() => setPicker('mode')}>
            <span>{tr('Mode', 'Modus')}</span>
            <span className="settings-value">{fmt.name()}</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="settings-row" onClick={() => setPicker('scoring')}>
            <span>Scoring</span>
            <span className="settings-value">{format.scoring === 'stableford' ? 'Stableford' : tr('Stroke play', 'Zählspiel')}</span>
            <span aria-hidden="true">›</span>
          </button>
          <button type="button" className="settings-row" onClick={() => setPicker('allowance')}>
            <span>{tr('Handicap allowance', 'HCP-Vorgabe')}</span>
            <span className="settings-value">{allowance > 0 ? `${allowance} %` : tr('0 % (gross)', '0 % (brutto)')}</span>
            <span aria-hidden="true">›</span>
          </button>
          {/* Texas scramble (Sascha's concept 30.10.2026): every player's drive used at least so often */}
          {format.mode === 'scramble' && (
            <button type="button" className="settings-row" onClick={() => setPicker('drives')}>
              <span>{tr('Texas: drives per player', 'Texas: Drives je Spieler')}</span>
              <span className="settings-value">{format.minDrives ? tr(`at least ${format.minDrives}`, `mindestens ${format.minDrives}`) : tr('free', 'frei')}</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
        {!fits && (
          <p className="small good-text" style={{ margin: 0 }}>
            {tr(`${fmt.name()} needs ${fmt.need()} – you have ${playerCount}. Add players below or choose another mode.`, `${fmt.name()} braucht ${fmt.need()} – ihr seid ${playerCount}. Füge oben Spieler hinzu oder wähle einen anderen Modus.`)}
          </p>
        )}
        {isTeamMode(format.mode) && <span className="muted small">{tr('Team rounds do not count for your own stats.', 'Team-Runden zählen nicht für deine eigene Statistik.')}</span>}
      </section>
      {picker && (
        <div className="sheet-backdrop" onClick={() => setPicker(null)}>
          <section className="sheet" role="dialog" aria-label={picker === 'mode' ? tr('Choose game mode', 'Spielmodus wählen') : picker === 'scoring' ? tr('Choose scoring', 'Zählmodus wählen') : picker === 'drives' ? tr('Texas scramble', 'Texas Scramble') : tr('Handicap allowance', 'HCP-Vorgabe')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{picker === 'mode' ? tr('Choose game mode', 'Spielmodus wählen') : picker === 'scoring' ? tr('Choose scoring', 'Zählmodus wählen') : picker === 'drives' ? tr('Texas scramble', 'Texas Scramble') : tr('Handicap allowance', 'HCP-Vorgabe')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPicker(null)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {picker === 'mode' &&
                FORMATS.map((o) => (
                  <button key={o.id} type="button" className="pick-option" aria-pressed={o.id === fmt.id} onClick={() => { setFormat({ ...format, mode: o.mode, matchplay: o.matchplay, ...(allowanceSet ? {} : { allowance: whsAllowance(o.mode, o.matchplay, kind === 'tournament') }), ...(o.mode === 'scramble' ? {} : { minDrives: undefined }) }); setPicker(null); }}>
                    <span className="grow">
                      <strong>{o.name()}</strong>
                      <span className="muted small">{o.text()}</span>
                      {!o.fits(playerCount) && <span className="small good-text">{tr(`needs ${o.need()}`, `braucht ${o.need()}`)}</span>}
                    </span>
                    {o.id === fmt.id && <span className="pick-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              {picker === 'scoring' &&
                ([
                  ['stableford', 'Stableford', tr('Collect points on every hole from your strokes and handicap – most points win.', 'Auf jedem Loch Punkte sammeln, aus deinen Schlägen und deiner Vorgabe – die meisten Punkte gewinnen.')],
                  ['net', tr('Stroke play', 'Zählspiel'), tr('The fewest strokes over the whole round win (net with the handicap allowance).', 'Die wenigsten Schläge über die ganze Runde gewinnen (netto mit der HCP-Vorgabe).')],
                ] as const).map(([v, name, text]) => {
                  const on = v === 'stableford' ? format.scoring === 'stableford' : format.scoring !== 'stableford';
                  return (
                    <button key={v} type="button" className="pick-option" aria-pressed={on} onClick={() => { setFormat({ ...format, scoring: v }); setPicker(null); }}>
                      <span className="grow">
                        <strong>{name}</strong>
                        <span className="muted small">{text}</span>
                      </span>
                      {on && <span className="pick-check" aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              {picker === 'allowance' &&
                [100, 95, 90, 85, 75, 50, 0].map((v) => (
                  <button key={v} type="button" className="pick-option" aria-pressed={allowance === v} onClick={() => { setFormat({ ...format, allowance: v }); setAllowanceSet(true); setPicker(null); }}>
                    <span className="grow">
                      <strong>{v} %</strong>
                      <span className="muted small">
                        {v === 100
                          ? tr('Full handicap – usual for single play.', 'Volle Vorgabe – üblich im Einzel.')
                          : v === 95
                            ? tr('WHS recommendation for single stroke play and Stableford in a competition.', 'WHS-Empfehlung für Einzel-Zählspiel und Stableford im Wettspiel.')
                          : v === 85
                            ? tr('WHS recommendation for four-ball stroke play.', 'WHS-Empfehlung für Better Ball im Zählspiel.')
                            : v === 90
                              ? tr('WHS recommendation for four-ball match play.', 'WHS-Empfehlung für Better Ball im Lochspiel.')
                              : v === 0
                                ? tr('Gross – strokes only, no handicap.', 'Brutto – nur Schläge, ohne Vorgabe.')
                                : tr('Share of the playing handicap that counts.', 'Anteil der Spielvorgabe, der zählt.')}
                      </span>
                    </span>
                    {allowance === v && <span className="pick-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
              {picker === 'drives' &&
                [0, 2, 3, 4, 6].map((v) => (
                  <button key={v} type="button" className="pick-option" aria-pressed={(format.minDrives ?? 0) === v} onClick={() => { setFormat({ ...format, minDrives: v || undefined }); setPicker(null); }}>
                    <span className="grow">
                      <strong>{v ? tr(`At least ${v} drives each`, `Mindestens ${v} Drives je Spieler`) : tr('Free (ordinary scramble)', 'Frei (normaler Scramble)')}</strong>
                      <span className="muted small">
                        {v
                          ? tr('On every hole the team notes whose drive it plays – the app counts and warns in time.', 'An jedem Loch hält das Team fest, wessen Drive es spielt – die App zählt mit und warnt rechtzeitig.')
                          : tr('Any drive, as often as you like.', 'Jeder Drive, so oft ihr wollt.')}
                      </span>
                    </span>
                    {(format.minDrives ?? 0) === v && <span className="pick-check" aria-hidden="true">✓</span>}
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}

      <span className="spacer" />
      <button type="button" className="btn-secondary" onClick={() => props.onBook(holes, tee, playingHandicap(me))} disabled={!option}>
        {tr('Birdie book', 'Birdiebook')}
      </button>
      <button type="button" className="btn-secondary" onClick={() => begin(true)} disabled={!option}>
        {tr('Course preview', 'Platzvorschau')}
      </button>
      {/* plan the round: targets and clubs per hole, used by the caddie in the live round (Sascha 16.10.2026) */}
      <button type="button" className="btn-secondary" onClick={() => begin(true, true)} disabled={!option}>
        {tr('Plan round', 'Runde planen')}
        {planned > 0 ? <span className="muted small"> · {planned === holes.length ? tr(`all ${planned} holes planned`, `alle ${planned} Löcher geplant`) : tr(`${planned} of ${holes.length} holes planned`, `${planned} von ${holes.length} Löchern geplant`)}</span> : null}
      </button>
      <div className="sticky-cta">
        <button type="button" className="btn-primary" onClick={() => begin()} disabled={!option || !fits}>
          {tr('Start round', 'Runde starten')}
        </button>
      </div>
      {askHcp && (
        <div className="sheet-backdrop" onClick={() => setAskHcp(null)}>
          <section className="sheet" role="dialog" aria-label={tr('Update your HCP?', 'HCP aktualisieren?')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('Update your HCP?', 'HCP aktualisieren?')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Back to the settings', 'Zurück zu den Einstellungen')} onClick={() => setAskHcp(null)}>
                ✕
              </button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {tr(`Your profile says ${profileHcp} – today you entered ${me.index.trim()}.`, `Im Profil steht ${profileHcp} – heute hast du ${me.index.trim()} eingetragen.`)}
            </p>
            <div className="pick-list">
              <button type="button" className="pick-option" onClick={() => { const a = askHcp; setAskHcp(null); start(a.preview, a.planning, true); }}>
                <span className="grow">
                  <strong>{tr(`Yes – save HCP ${me.index.trim()} in the profile`, `Ja – HCP ${me.index.trim()} im Profil speichern`)}</strong>
                  <span className="muted small">{tr('It is your new handicap index.', 'Das ist dein neues Handicap.')}</span>
                </span>
              </button>
              <button type="button" className="pick-option" onClick={() => { const a = askHcp; setAskHcp(null); start(a.preview, a.planning, false); }}>
                <span className="grow">
                  <strong>{tr('No – only for this round', 'Nein – nur für diese Runde')}</strong>
                  <span className="muted small">{tr(`The profile keeps ${profileHcp}.`, `Im Profil bleibt ${profileHcp}.`)}</span>
                </span>
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export type TeeChoice = { id: string; name: string; colour: string; total: number; rating: TeeRating | null };

/** The tees to choose from, with their length for these holes (where the scorecard has it) and their course rating. */
export function teeChoicesFor(courseId: string, holes: RoundHole[], ids: string[], lady = false): TeeChoice[] {
  const data = TEES[courseId];
  const rated = holes.length === 18 || holes.length === 9;
  return [...new Set(ids.filter(Boolean))].map((t) => {
    const i = data ? data.tees.indexOf(t) : -1;
    return { id: t, name: teeName(t), colour: TEE_COLOURS[t] ?? '#999', total: i >= 0 ? holes.reduce((s, h) => s + (data!.holes[h.label]?.[i] ?? 0), 0) : 0, rating: rated ? ratingFor(courseId, t, holes, lady) : null };
  });
}

export function PlayerRow(props: { player: DraftPlayer; onChange: (p: DraftPlayer) => void; onRemove?: () => void; nameLabel: string; rating: TeeRating | null; playing: number | null; nine?: boolean; tees?: TeeChoice[]; className?: string }) {
  const { player } = props;
  const [teeOpen, setTeeOpen] = useState(false);
  const myTee = props.tees?.find((t) => t.id === player.tee);
  const shown = props.playing == null ? '–' : props.playing < 0 ? `+${-props.playing}` : String(props.playing);
  // one line (Sascha 21.10.2026): name, HCP typed, the playing handicap following from it – shown, not typed
  return (
    <div className={`card player-row${props.className ? ' ' + props.className : ''}`}>
      <div className="field">
        <label htmlFor={`name-${player.id}`}>{props.nameLabel}</label>
        <input id={`name-${player.id}`} className="input" value={player.name} onChange={(e) => props.onChange({ ...player, name: e.target.value })} />
      </div>
      {/* the tee: its colour, a tap chooses it */}
      <div className="field">
        <span className="field-label">Tee</span>
        {props.tees ? (
          <button
            type="button"
            className="tee-pick"
            aria-label={myTee ? tr(`Tee of ${player.name || props.nameLabel}: ${myTee.name} – change`, `Tee von ${player.name || props.nameLabel}: ${myTee.name} – ändern`) : tr(`Choose the tee of ${player.name || props.nameLabel}`, `Tee von ${player.name || props.nameLabel} wählen`)}
            onClick={() => setTeeOpen(true)}
          >
            {myTee ? <span className="tee-dot" style={{ background: myTee.colour }} /> : <span className="tee-none">–</span>}
            <span className="tee-pick-chev" aria-hidden="true">▾</span>
          </button>
        ) : (
          <span className="tee-pick none" aria-label={tr('No course chosen yet', 'Noch kein Platz gewählt')}>–</span>
        )}
      </div>
      <div className="field">
        <label htmlFor={`hcp-${player.id}`}>HCP</label>
        <input id={`hcp-${player.id}`} className="input player-num" inputMode="decimal" value={player.index} onChange={(e) => props.onChange({ ...player, index: e.target.value })} />
      </div>
      <div className="field">
        <span className="field-label" id={`pl-${player.id}`}>{tr('Playing', 'Vorgabe')}</span>
        <output className="playing-hcp" aria-labelledby={`pl-${player.id}`} aria-label={tr(`Playing handicap ${shown}`, `Spielvorgabe ${shown}`)}>{shown}</output>
      </div>
      {props.onRemove && (
        <button type="button" className="icon-btn player-remove" aria-label={tr(`Remove ${player.name || 'player'}`, `${player.name || 'Spieler'} entfernen`)} onClick={props.onRemove}>
          ✕
        </button>
      )}
      {teeOpen && props.tees && (
        <div className="sheet-backdrop" onClick={() => setTeeOpen(false)}>
          <section className="sheet" role="dialog" aria-label="Tee" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{`Tee – ${player.name || props.nameLabel}`}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setTeeOpen(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {props.tees.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="pick-option"
                  aria-pressed={t.id === player.tee}
                  onClick={() => {
                    props.onChange({ ...player, tee: t.id });
                    setTeeOpen(false);
                  }}
                >
                  <span className="tee-dot" style={{ background: t.colour }} />
                  <span className="grow">
                    <strong>{t.name}</strong>
                    <span className="muted small">
                      {[t.total > 0 ? `${t.total} m` : '', t.rating ? `Course Rating ${dec(t.rating.cr.toFixed(1))} · Slope ${t.rating.slope}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {t.id === player.tee && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>

          </section>
        </div>
      )}
      {player.index.trim() !== '' && props.playing == null && (
        <span className="bad-text small player-note" role="alert">
          {tr('Please enter the HCP as a number, e.g. 18.4 or +1.2', 'Bitte das HCP als Zahl eingeben, z. B. 18,4 oder +1,2')}
        </span>
      )}
    </div>
  );
}

/**
 * Where the playing handicap comes from – once for all players; missing or wrong: typed from the club's scorecard,
 * kept for this course, these loops and this tee (Sascha 21.10.2026). The round setup and the game setup use the same
 * (Sascha 25.10.2026: Games like Rounds).
 */
export function RatingLine(props: { rating: TeeRating | null; nine: boolean; onSave: (v: { cr: number; slope: number }) => void }) {
  const { rating, nine } = props;
  const [edit, setEdit] = useState(false);
  const [crIn, setCrIn] = useState('');
  const [slopeIn, setSlopeIn] = useState('');
  const crNum = Number(crIn.replace(',', '.'));
  const slopeNum = Number(slopeIn);
  const valid = crNum >= 50 && crNum <= 85 && Number.isInteger(slopeNum) && slopeNum >= 55 && slopeNum <= 155;
  if (!edit)
    return (
      <button
        type="button"
        className="rating-line"
        onClick={() => {
          setCrIn(rating ? dec(rating.cr.toFixed(1)) : '');
          setSlopeIn(rating ? String(rating.slope) : '');
          setEdit(true);
        }}
      >
        <span className="grow">
          {rating ? (
            <>
              Course Rating <strong>{dec(rating.cr.toFixed(1))}</strong> · Slope <strong>{rating.slope}</strong>
              {nine ? tr(' · playing handicap for 9 holes', ' · Vorgabe für 9 Löcher') : ''}
            </>
          ) : (
            <>
              <strong>{tr('Enter course rating and slope', 'Course Rating und Slope eintragen')}</strong>
              <span className="muted small" style={{ display: 'block' }}>{tr('From the club’s scorecard – until then the playing handicap is estimated from the HCP', 'Von der Scorekarte des Clubs – bis dahin ist die Vorgabe aus dem HCP geschätzt')}</span>
            </>
          )}
        </span>
        <span aria-hidden="true">›</span>
      </button>
    );
  return (
    <div className="card rating-form">
      <div className="field">
        <label htmlFor="setup-cr">Course Rating</label>
        <input id="setup-cr" className="input" inputMode="decimal" placeholder={dec('71.6')} value={crIn} onChange={(e) => setCrIn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="setup-slope">Slope</label>
        <input id="setup-slope" className="input" inputMode="numeric" placeholder="130" value={slopeIn} onChange={(e) => setSlopeIn(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn-primary"
        disabled={!valid}
        onClick={() => {
          props.onSave({ cr: crNum, slope: slopeNum });
          setEdit(false);
        }}
      >
        {tr('Save', 'Speichern')}
      </button>
    </div>
  );
}
