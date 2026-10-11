import { useMemo, useState } from 'react';
import type { CaptureMode, Course, Player, Round, RoundHole } from '../types';
import { buildRoundHoles, loopOptions } from '../lib/loops';
import { emptyEntry } from '../lib/scoring';
import { newId } from '../lib/storage';
import { TopBar } from '../components/ui';
import { TEE_COLOURS, TEES, teeName } from '../data/tees';
import { tr } from '../lib/i18n';

const ME_KEY = 'golfos.me.v1';

interface DraftPlayer {
  id: string;
  name: string;
  handicap: string; // text field, parsed on start
}

function loadMe(): DraftPlayer {
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (raw) return { ...JSON.parse(raw), id: 'me' };
  } catch {
    /* ignore */
  }
  return { id: 'me', name: tr('Me', 'Ich'), handicap: '' };
}

export function RoundSetup(props: { course: Course; onBack: () => void; onStart: (r: Round) => void; onBook: (holes: RoundHole[], tee: string | null) => void }) {
  const options = useMemo(() => loopOptions(props.course.holes), [props.course]);
  const [optionId, setOptionId] = useState(options[0]?.id ?? '');
  const [mode, setMode] = useState<CaptureMode>('quick');
  const teeData = TEES[props.course.id];
  const [tee, setTee] = useState<string | null>(teeData ? (teeData.tees.includes('Yellow') ? 'Yellow' : teeData.tees[0]) : null);
  const [me, setMe] = useState<DraftPlayer>(loadMe);
  const [others, setOthers] = useState<DraftPlayer[]>([]);

  const option = options.find((o) => o.id === optionId);
  const holes = option ? buildRoundHoles(props.course.holes, option) : [];
  const missing = holes.filter((h) => !h.par || !h.strokeIndex).length;

  const parseHcp = (s: string): number | null => {
    const n = Number(s.replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : Math.round(n);
  };

  const start = (preview = false) => {
    if (!option) return;
    try {
      localStorage.setItem(ME_KEY, JSON.stringify({ name: me.name, handicap: me.handicap }));
    } catch {
      /* ignore */
    }
    const players: Player[] = [
      { id: 'me', name: me.name.trim() || tr('Me', 'Ich'), playingHandicap: parseHcp(me.handicap), isMe: true },
      ...others.map((o, i) => ({ id: o.id, name: o.name.trim() || tr(`Player ${i + 2}`, `Spieler ${i + 2}`), playingHandicap: parseHcp(o.handicap), isMe: false })),
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
        <PlayerRow player={me} onChange={setMe} nameLabel={tr('Your name', 'Dein Name')} />
        {others.map((p, i) => (
          <PlayerRow
            key={p.id}
            player={p}
            nameLabel={tr(`Player ${i + 2}`, `Spieler ${i + 2}`)}
            onChange={(np) => setOthers(others.map((o) => (o.id === p.id ? np : o)))}
            onRemove={() => setOthers(others.filter((o) => o.id !== p.id))}
          />
        ))}
        {others.length < 3 && (
          <button type="button" className="btn-secondary" onClick={() => setOthers([...others, { id: newId(), name: '', handicap: '' }])}>
            {tr('+ Add player', '+ Spieler hinzufügen')}
          </button>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          {tr(
            'Playing handicap is needed for Stableford. Leave it empty to count gross only.',
            'Für Stableford braucht es die Spielvorgabe. Leer lassen, um nur brutto zu zählen.',
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

function PlayerRow(props: { player: DraftPlayer; onChange: (p: DraftPlayer) => void; onRemove?: () => void; nameLabel: string }) {
  const { player } = props;
  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end' }}>
      <div className="field">
        <label htmlFor={`name-${player.id}`}>{props.nameLabel}</label>
        <input id={`name-${player.id}`} className="input" value={player.name} onChange={(e) => props.onChange({ ...player, name: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`hcp-${player.id}`}>{tr('Playing hcp', 'Spielvorgabe')}</label>
        <input
          id={`hcp-${player.id}`}
          className="input"
          inputMode="numeric"
          value={player.handicap}
          onChange={(e) => props.onChange({ ...player, handicap: e.target.value })}
        />
      </div>
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
