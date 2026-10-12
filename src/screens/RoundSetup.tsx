import { useMemo, useState } from 'react';
import type { CaptureMode, Course, Player, Round, RoundHole } from '../types';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { emptyEntry } from '../lib/scoring';
import { newId } from '../lib/storage';
import { TopBar } from '../components/ui';
import { TEE_COLOURS, TEES, teeName } from '../data/tees';
import { dec, tr } from '../lib/i18n';
import { courseHandicap, parseIndex } from '../lib/handicap';
import { RATINGS, type TeeRating } from '../data/ratings';

const ME_KEY = 'golfos.me.v1';

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

export function RoundSetup(props: { course: Course; onBack: () => void; onStart: (r: Round) => void; onBook: (holes: RoundHole[], tee: string | null) => void }) {
  const options = useMemo(() => loopOptions(props.course.holes), [props.course]);
  const [optionId, setOptionId] = useState(options[0]?.id ?? '');
  const remembered = useMemo(loadRemembered, []);
  const [mode, setMode] = useState<CaptureMode>(remembered?.mode ?? 'quick');
  const teeData = TEES[props.course.id];
  const lastTee = remembered?.tees?.[props.course.id];
  const [tee, setTee] = useState<string | null>(
    teeData ? (lastTee && teeData.tees.includes(lastTee) ? lastTee : teeData.tees.includes('Yellow') ? 'Yellow' : teeData.tees[Math.floor((teeData.tees.length - 1) / 2)]) : null,
  );
  const [me, setMe] = useState<DraftPlayer>(() => ({ id: 'me', name: remembered?.name ?? tr('Me', 'Ich'), index: remembered?.index ?? '', handicap: remembered?.handicap ?? '' }));
  const [others, setOthers] = useState<DraftPlayer[]>([]);

  const option = options.find((o) => o.id === optionId);
  const holes = option ? buildRoundHoles(props.course.holes, option) : [];
  const missing = holes.filter((h) => !h.par || !h.strokeIndex).length;

  // Course rating and slope of the chosen tee (18 holes): the playing handicap follows from the handicap index.
  // 9 holes: half the 18-hole course handicap (WHS uses 9-hole ratings; half of the 18-hole one is within a stroke).
  const rating: TeeRating | null = tee && (holes.length === 18 || holes.length === 9) ? (RATINGS[props.course.id]?.[tee] ?? null) : null;
  const nine = holes.length === 9;
  const par = nine ? props.course.holes.filter((h) => h.loop === holes[0]?.loop).reduce((sum, h) => sum + (h.par || 0), 0) : holes.reduce((sum, h) => sum + (h.par || 0), 0);
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
      const r: Remembered = { name: me.name, index: me.index, handicap: me.handicap, mode, tees: { ...remembered?.tees, ...(tee ? { [props.course.id]: tee } : {}) } };
      localStorage.setItem(ME_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
    const players: Player[] = [
      { id: 'me', name: me.name.trim() || tr('Me', 'Ich'), playingHandicap: playingHandicap(me), isMe: true },
      ...others.map((o, i) => ({ id: o.id, name: o.name.trim() || tr(`Player ${i + 2}`, `Spieler ${i + 2}`), playingHandicap: playingHandicap(o), isMe: false })),
    ];
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
            <button key={o.id} type="button" className="choice" aria-pressed={o.id === optionId} onClick={() => setOptionId(o.id)}>
              {o.label}
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
        <span className="eyebrow">{tr('Tracking', 'Erfassung')}</span>
        <div className="choice-grid">
          <button type="button" className="choice" aria-pressed={mode === 'quick'} onClick={() => setMode('quick')}>
            {tr('Quick', 'Schnell')}
            <small>{tr('Scorecard: strokes, putts, fairway, penalties, bunker', 'Scorekarte: Schläge, Putts, Fairway, Strafschläge, Bunker')}</small>
          </button>
          <button type="button" className="choice" aria-pressed={mode === 'detail'} onClick={() => setMode('detail')}>
            {tr('Detailed', 'Detailliert')}
            <small>{tr('Shot by shot with club and lie on the map · you can switch per hole', 'Schlag für Schlag mit Schläger und Lage auf der Karte · je Loch umschaltbar')}</small>
          </button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="eyebrow">{tr('Players', 'Spieler')}</span>
        <PlayerRow player={me} onChange={setMe} nameLabel={tr('Your name', 'Dein Name')} rating={rating} playing={playingHandicap(me)} />
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
      </section>

      <span className="spacer" />
      <button type="button" className="btn-secondary" onClick={() => props.onBook(holes, tee)} disabled={!option}>
        {tr('Course book – all holes at a glance', 'Lochbuch – alle Löcher auf einen Blick')}
      </button>
      <button type="button" className="btn-secondary" onClick={() => start(true)} disabled={!option}>
        {tr('Preview the holes (plan, nothing saved)', 'Löcher ansehen (planen, nichts wird gespeichert)')}
      </button>
      <button type="button" className="btn-primary" onClick={() => start()} disabled={!option}>
        {tr('Start round', 'Runde starten')}
      </button>
    </main>
  );
}

function PlayerRow(props: { player: DraftPlayer; onChange: (p: DraftPlayer) => void; onRemove?: () => void; nameLabel: string; rating: TeeRating | null; playing: number | null }) {
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
