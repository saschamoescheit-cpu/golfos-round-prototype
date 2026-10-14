import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureMode, Course, Player, Round, RoundHole } from '../types';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { emptyEntry } from '../lib/scoring';
import { loadCarryBag, newId } from '../lib/storage';
import { Segmented, TopBar } from '../components/ui';
import { TEE_COLOURS, TEES, teeName } from '../data/tees';
import { dec, tr } from '../lib/i18n';
import { courseHandicap, parseIndex } from '../lib/handicap';
import { RATINGS, type TeeRating } from '../data/ratings';
import { fullName, loadProfile, saveProfile } from '../lib/profile';
import { DEFAULT_FORMAT, isTeamMode, modeName, modesFor, scoringName, teamHandicap, teamsOf, type GameMode, type RoundFormat, type Scoring } from '../lib/games';

const ME_KEY = 'golfos.me.v1';
// Name and handicap index come from the profile when it is filled in (profile tab).
const profile = () => loadProfile();

interface DraftPlayer {
  id: string;
  name: string;
  index: string; // handicap index as typed – the playing handicap follows from course rating and slope
  handicap: string; // playing handicap as typed, where the course has no rating
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

export function RoundSetup(props: { course: Course; onBack: () => void; onStart: (r: Round) => void; onBook: (holes: RoundHole[], tee: string | null, playing: number | null) => void }) {
  const options = useMemo(() => loopOptions(props.course.holes), [props.course]);
  const [optionId, setOptionId] = useState(options[0]?.id ?? '');
  const remembered = useMemo(loadRemembered, []);
  // One way to play (13.10.2026): the score on the course, the shots afterwards from the GPS track – the old choice
  // "quick / detailed" promised shot-by-shot buttons that are gone. Rounds keep the field for older data.
  const mode: CaptureMode = 'quick';
  const teeData = TEES[props.course.id];
  const lastTee = remembered?.tees?.[props.course.id];
  const [tee, setTee] = useState<string | null>(
    teeData ? (lastTee && teeData.tees.includes(lastTee) ? lastTee : teeData.tees.includes('Yellow') ? 'Yellow' : teeData.tees[Math.floor((teeData.tees.length - 1) / 2)]) : null,
  );
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
    return { id: 'me', name: fullName(p) || remembered?.name || tr('Me', 'Ich'), index: p.hcpIndex || remembered?.index || '', handicap: autoFor(false) };
  });
  const [others, setOthers] = useState<DraftPlayer[]>([]);
  // Game mode and scoring (as in Hole19): the modes on offer follow the number of players
  const [format, setFormat] = useState<RoundFormat>(DEFAULT_FORMAT);
  const modes = modesFor(others.length + 1);
  const shownFormat: RoundFormat = modes.includes(format.mode) ? format : { ...format, mode: 'single' };

  const option = options.find((o) => o.id === optionId);
  const holes = option ? buildRoundHoles(props.course.holes, option) : [];
  const hasCarries = useMemo(() => loadCarryBag() != null, []);
  const missing = holes.filter((h) => !h.par || !h.strokeIndex).length;

  // Course rating and slope of the chosen tee (18 holes): the playing handicap follows from the handicap index.
  // 9 holes: half the 18-hole course handicap (WHS uses 9-hole ratings; half of the 18-hole one is within a stroke).
  const rating: TeeRating | null = tee && (holes.length === 18 || holes.length === 9) ? (RATINGS[props.course.id]?.[tee] ?? null) : null;
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
  const parseHcp = (s: string): number | null => {
    const n = Number(s.replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : Math.round(n);
  };
  const playingHandicap = (p: DraftPlayer): number | null => {
    if (rating) {
      const idx = parseIndex(p.index);
      if (idx == null) return null;
      if (!nine) return courseHandicap(idx, rating, par);
      return Math.round((idx * (rating.slope / 113) + (rating.cr - par)) / 2);
    }
    return parseHcp(p.handicap);
  };

  const start = (preview = false) => {
    if (!option) return;
    try {
      const entered = Number(me.handicap.replace(',', '.'));
      const handicap18 = me.handicap.trim() !== '' && Number.isFinite(entered) && nine ? String(entered * 2) : me.handicap;
      const r: Remembered = { name: me.name, index: me.index, handicap: me.handicap, handicap18, mode, tees: { ...remembered?.tees, ...(tee ? { [props.course.id]: tee } : {}) } };
      localStorage.setItem(ME_KEY, JSON.stringify(r));
      // a changed handicap index is the player's new index – the profile keeps it
      const p = profile();
      if (me.index.trim() && me.index.trim() !== p.hcpIndex) saveProfile({ ...p, hcpIndex: me.index.trim() });
    } catch {
      /* ignore */
    }
    const single: Player[] = [
      { id: 'me', name: me.name.trim() || tr('Me', 'Ich'), playingHandicap: playingHandicap(me), isMe: true },
      ...others.map((o, i) => ({ id: o.id, name: o.name.trim() || tr(`Player ${i + 2}`, `Spieler ${i + 2}`), playingHandicap: playingHandicap(o), isMe: false })),
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
    props.onStart({
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
      format: shownFormat,
      ...(tee ? { tee } : {}),
      ...(preview ? { preview: true } : {}),
    });
  };

  return (
    <main className="screen">
      <TopBar title={props.course.name} onBack={props.onBack} />

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
        {teeData && (
          <>
            <span className="eyebrow">{tr('Tee', 'Abschlag')}</span>
            <div className="tee-row" role="group" aria-label={tr('Tee', 'Abschlag')}>
              {teeData.tees.map((t) => {
                const total = holes.reduce((sum, h) => sum + (teeData.holes[h.label]?.[teeData.tees.indexOf(t)] ?? 0), 0);
                return (
                  <button key={t} type="button" aria-pressed={tee === t} onClick={() => setTee(t)}>
                    <span className="tee-dot" style={{ background: TEE_COLOURS[t] ?? '#999' }} />
                    {teeName(t)}
                    {total > 0 && <small>{total} m</small>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        <PlayerRow player={me} onChange={setMe} nameLabel={tr('Your name', 'Dein Name')} rating={rating} playing={playingHandicap(me)} nine={nine} />
        {others.map((p, i) => (
          <PlayerRow
            key={p.id}
            player={p}
            nameLabel={tr(`Player ${i + 2}`, `Spieler ${i + 2}`)}
            rating={rating}
            playing={playingHandicap(p)}
            onChange={(np) => setOthers(others.map((o) => (o.id === p.id ? np : o)))}
            onRemove={() => setOthers(others.filter((o) => o.id !== p.id))}
          />
        ))}
        {others.length < 3 && (
          <button type="button" className="btn-secondary" onClick={() => setOthers([...others, { id: newId(), name: '', index: '', handicap: '' }])}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          {rating
            ? tr(
                `Your handicap index – the app works out the playing handicap for this tee (course rating ${dec(rating.cr.toFixed(1))}, slope ${rating.slope}). Leave it empty to count gross only.`,
                `Dein Handicap (Index) – die App rechnet die Spielvorgabe für diesen Abschlag aus (Course Rating ${dec(rating.cr.toFixed(1))}, Slope ${rating.slope}). Leer lassen, um nur brutto zu zählen.`,
              )
            : tr(
                'Playing handicap is needed for Stableford (from the club’s table). Leave it empty to count gross only.',
                'Für Stableford braucht es die Spielvorgabe (aus der Tabelle des Clubs). Leer lassen, um nur brutto zu zählen.',
              )}
        </p>
        {/* the caddie picks clubs by the player's carries – without them it uses standard ones */}
        {!hasCarries && (
          <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>
            {tr(
              'The caddie uses standard distances (driver 200 m … PW 115 m) – enter your own carries in your profile under “My bag”.',
              'Der Caddie rechnet mit Standard-Weiten (Driver 200 m … PW 115 m) – deine eigenen Carry-Weiten trägst du im Profil unter „Mein Bag“ ein.',
            )}
          </p>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Format', 'Format')}</span>
        <div className="field">
          <label>{tr('Game mode', 'Spielmodus')}</label>
          <div className="format-list" role="group" aria-label={tr('Game mode', 'Spielmodus')}>
            {(['single', 'match', 'fourball', 'scramble', 'foursome'] as GameMode[]).map((m) => (
              <button key={m} type="button" className="format-option" aria-pressed={shownFormat.mode === m} disabled={!modes.includes(m)} onClick={() => setFormat({ ...shownFormat, mode: m })}>
                <strong>{modeName(m)}</strong>
                <span className="muted small">
                  {m === 'single'
                    ? tr('Lowest score or most Stableford points wins.', 'Wenigste Schläge oder meiste Stableford-Punkte gewinnen.')
                    : m === 'match'
                      ? tr('Hole by hole, net – 2 players.', 'Loch für Loch, netto – 2 Spieler.')
                      : m === 'fourball'
                        ? tr('Players 1 & 2 against 3 & 4, the better score of the team counts – 4 players.', 'Spieler 1 & 2 gegen 3 & 4, das bessere Ergebnis des Teams zählt – 4 Spieler.')
                        : m === 'scramble'
                          ? tr('Everyone hits, the team picks the best ball and all play on from there – one team score. 2–4 players (4: 1 & 2 against 3 & 4).', 'Alle schlagen, das Team wählt den besten Ball, alle spielen von dort weiter – ein Team-Score. 2–4 Spieler (4: 1 & 2 gegen 3 & 4).')
                          : tr('Two players share one ball and hit in turn – one team score. 2 or 4 players (4: 1 & 2 against 3 & 4).', 'Zwei Spieler teilen sich einen Ball und schlagen abwechselnd – ein Team-Score. 2 oder 4 Spieler (4: 1 & 2 gegen 3 & 4).')}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{tr('Scoring', 'Wertung')}</label>
          <Segmented<Scoring>
            label={tr('Scoring', 'Wertung')}
            value={shownFormat.scoring}
            onChange={(v) => v && setFormat({ ...shownFormat, scoring: v })}
            options={(['stroke', 'net', 'stableford'] as Scoring[]).map((x) => ({ value: x, label: x === 'stroke' ? tr('Gross', 'Brutto') : x === 'net' ? tr('Net', 'Netto') : 'Stableford' }))}
          />
          <span className="muted small">
            {scoringName(shownFormat.scoring)} · {tr('live leaderboard of your flight on the hole map', 'Live-Leaderboard deines Flights auf der Lochkarte')}
            {isTeamMode(shownFormat.mode) &&
              tr(
                ' · team handicap from the players’ handicaps (foursomes 50 %, scramble 35/15 % for two). Team rounds do not count for your own stats.',
                ' · Team-Vorgabe aus den Vorgaben der Spieler (Vierer 50 %, Scramble zu zweit 35/15 %). Team-Runden zählen nicht für deine eigene Statistik.',
              )}
          </span>
        </div>
      </section>

      <span className="spacer" />
      <button type="button" className="btn-secondary" onClick={() => props.onBook(holes, tee, playingHandicap(me))} disabled={!option}>
        {tr('Course book – all holes', 'Lochbuch – alle Löcher')}
      </button>
      <button type="button" className="btn-secondary" onClick={() => start(true)} disabled={!option}>
        {tr('Preview the holes – no round', 'Löcher ansehen – ohne Runde')}
      </button>
      <button type="button" className="btn-primary" onClick={() => start()} disabled={!option}>
        {tr('Start round', 'Runde starten')}
      </button>
    </main>
  );
}

function PlayerRow(props: { player: DraftPlayer; onChange: (p: DraftPlayer) => void; onRemove?: () => void; nameLabel: string; rating: TeeRating | null; playing: number | null; nine?: boolean }) {
  const { player } = props;
  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end' }}>
      <div className="field">
        <label htmlFor={`name-${player.id}`}>{props.nameLabel}</label>
        <input id={`name-${player.id}`} className="input" value={player.name} onChange={(e) => props.onChange({ ...player, name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`hcp-${player.id}`}>{props.rating ? 'Handicap' : tr('Playing hcp', 'Spielvorgabe')}</label>
        <input
          id={`hcp-${player.id}`}
          className="input"
          inputMode="decimal"
          placeholder={props.rating ? dec('7.4') : ''}
          value={props.rating ? player.index : player.handicap}
          onChange={(e) => props.onChange(props.rating ? { ...player, index: e.target.value } : { ...player, handicap: e.target.value })}
        />
      </div>
      {!props.rating && props.nine && (
        <span className="muted small" style={{ gridColumn: '1 / -1' }}>
          {tr('9 holes: enter the playing handicap for 9 holes (for Stableford). The caddie works with the 18-hole value by itself.', '9 Löcher: die Spielvorgabe für 9 Löcher eintragen (für Stableford). Der Caddie rechnet selbst mit dem 18-Loch-Wert.')}
        </span>
      )}
      {props.rating && props.playing != null && (
        <span className="muted small" style={{ gridColumn: '1 / -1' }}>
          {tr('Playing handicap here: ', 'Spielvorgabe hier: ')}
          {props.playing < 0 ? `+${-props.playing}` : props.playing}
        </span>
      )}
      {(props.rating ? player.index : player.handicap).trim() !== '' && props.playing == null && (
        <span className="bad-text small" style={{ gridColumn: '1 / -1' }} role="alert">
          {props.rating
            ? tr('Please enter your handicap as a number, e.g. 7.4 or +1.2', 'Bitte das Handicap als Zahl eingeben, z. B. 7,4 oder +1,2')
            : tr('Please enter the playing handicap as a number, e.g. 12', 'Bitte die Spielvorgabe als Zahl eingeben, z. B. 12')}
        </span>
      )}
      {props.onRemove ? (
        <button type="button" className="icon-btn" aria-label={tr(`Remove ${player.name || 'player'}`, `${player.name || 'Spieler'} entfernen`)} onClick={props.onRemove} style={{ marginBottom: 3 }}>
          ✕
        </button>
      ) : (
        <span style={{ width: 44 }} />
      )}
    </div>
  );
}
