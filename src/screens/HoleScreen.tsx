import { useEffect, useMemo, useRef, useState } from 'react';
import type { FairwayResult, HoleEntry, LngLat, Round } from '../types';
import { greenInRegulation, handicapStrokes, playerTotals } from '../lib/scoring';
import { loadGeometry, loadUnit, saveHoleCorrection, saveUnit } from '../lib/storage';
import { distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, type Unit } from '../lib/geo';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { HoleMap } from '../components/HoleMap';

/** Beyond this distance from the hole the app measures from the tee (planning at home or on another hole). */
const ON_HOLE_M = 1500;

export function HoleScreen(props: {
  round: Round;
  onChange: (r: Round) => void;
  onExit: () => void;
  onShowScorecard: (r: Round) => void;
}) {
  const { round } = props;
  const i = round.currentHole;
  const hole = round.holes[i];
  const me = round.players.find((p) => p.isMe)!;
  const others = round.players.filter((p) => !p.isMe);
  const touchX = useRef<number | null>(null);

  const entry = (playerId: string): HoleEntry => round.entries[playerId][i];

  const update = (playerId: string, patch: Partial<HoleEntry>) => {
    const list = round.entries[playerId].slice();
    list[i] = { ...list[i], ...patch };
    props.onChange({ ...round, entries: { ...round.entries, [playerId]: list } });
  };

  /** Strokes are pre-filled with par: leaving a hole commits par for players who did not change it. */
  const commitPar = (r: Round): Round => {
    const entries = { ...r.entries };
    for (const p of r.players) {
      const e = entries[p.id][i];
      if (e.strokes == null && !e.pickedUp && hole.par > 0) {
        const list = entries[p.id].slice();
        list[i] = { ...e, strokes: hole.par };
        entries[p.id] = list;
      }
    }
    return { ...r, entries };
  };

  const goTo = (target: number) => {
    const committed = commitPar(round);
    if (target >= round.holes.length) {
      props.onShowScorecard({ ...committed, currentHole: round.holes.length - 1 });
      return;
    }
    if (target < 0) return;
    props.onChange({ ...committed, currentHole: target });
  };

  const fixHole = (patch: { par?: number; strokeIndex?: number }) => {
    const holes = round.holes.slice();
    holes[i] = { ...hole, ...patch };
    saveHoleCorrection(round.courseId, hole.loop, hole.number, holes[i].par, holes[i].strokeIndex);
    props.onChange({ ...round, holes });
  };

  const received = handicapStrokes(round.holes, me.playingHandicap)[i];
  const myEntry = entry(me.id);
  const totals = playerTotals(round.holes, round.entries[me.id], me.playingHandicap);
  const gir = greenInRegulation({ ...myEntry, strokes: myEntry.strokes ?? hole.par }, hole.par);
  const needsData = !hole.par || !hole.strokeIndex;

  // ---------- Map view ----------
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId]);
  const mapData = useMemo(() => (geometry ? holeMapData(geometry, hole.loop, hole.number) : null), [geometry, hole.loop, hole.number]);
  const [view, setView] = useState<'map' | 'score'>(mapData ? 'map' : 'score');
  const [unit, setUnit] = useState<Unit>(loadUnit);
  const [player, setPlayer] = useState<{ pos: LngLat; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<number, { targets: LngLat[]; pin: LngLat | null }>>({});
  const [shotStart, setShotStart] = useState<LngLat | null>(null);

  useEffect(() => {
    if (view !== 'map' || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        setPlayer({ pos: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy });
      },
      () => setGpsError('No GPS – distances are measured from the tee.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [view]);

  if (view === 'map' && mapData) {
    const plan = plans[i] ?? { targets: [], pin: null };
    const pin = plan.pin ?? mapData.greenCenter;
    const onHole = player != null && distToLine(player.pos, mapData.line) < ON_HOLE_M;
    const from = onHole ? player!.pos : mapData.tee;
    const green = mapData.green ? greenFrontBack(from, mapData.green) : null;
    const setPlan = (patch: Partial<{ targets: LngLat[]; pin: LngLat | null }>) => setPlans({ ...plans, [i]: { ...plan, ...patch } });
    const fmt = (m: number) => formatDistance(m, unit);

    const tapMap = (p: LngLat) => {
      if (distanceM(p, pin) < 12 || plan.targets.some((t) => distanceM(p, t) < 12)) return; // tap on a marker
      if (plan.targets.length < 2) {
        // Keep targets in playing order: the one nearer to the player comes first.
        const next = [...plan.targets, p].sort((a, b) => distanceM(from, a) - distanceM(from, b));
        setPlan({ targets: next });
      } else {
        const d = plan.targets.map((t) => distanceM(t, p));
        const next = plan.targets.slice();
        next[d[0] <= d[1] ? 0 : 1] = p;
        setPlan({ targets: next });
      }
    };
    const addTarget = () => {
      if (plan.targets.length >= 2) return;
      const a = plan.targets[plan.targets.length - 1] ?? from;
      tapMap([(a[0] + pin[0]) / 2, (a[1] + pin[1]) / 2]);
    };
    const toggleUnit = () => {
      const u = unit === 'm' ? 'yd' : 'm';
      setUnit(u);
      saveUnit(u);
    };
    const strokesShown = myEntry.pickedUp ? 'PU' : String(myEntry.strokes ?? hole.par);

    return (
      <main className="map-screen">
        <HoleMap
          holeKey={`${round.id}-${i}`}
          data={mapData}
          player={player?.pos ?? null}
          from={from}
          pin={pin}
          targets={plan.targets}
          unit={unit}
          onTargetsChange={(targets) => setPlan({ targets })}
          onPinChange={(p) => setPlan({ pin: p })}
          onMapTap={tapMap}
        />

        <div className="map-top">
          <button type="button" className="map-btn round" aria-label="Pause round" onClick={props.onExit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className="map-hole">
            <span className="map-hole-no">{hole.label}</span>
            <span>Par {hole.par || '?'} · Hcp {hole.strokeIndex || '?'}</span>
          </div>
          <button type="button" className="map-btn" onClick={toggleUnit} aria-label={`Unit: ${unit === 'm' ? 'metres' : 'yards'}, tap to switch`}>
            {unit === 'm' ? 'm' : 'yd'}
          </button>
          <button type="button" className="map-btn round" aria-label="Scorecard" onClick={() => props.onShowScorecard(commitPar(round))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
          </button>
        </div>

        {green && (
          <div className="map-green" aria-label="Distance to the green">
            <span className="small">Back</span>
            <span className="map-green-num">{fmt(green.back)}</span>
            <span className="small">Center</span>
            <span className="map-green-num big">{fmt(green.center)}</span>
            <span className="small">Front</span>
            <span className="map-green-num">{fmt(green.front)}</span>
            <span className="map-from">{onHole ? `GPS ±${Math.round(player!.accuracy)} m` : 'from tee'}</span>
          </div>
        )}

        <div className="map-bottom">
          {(gpsError || (player && !onHole)) && (
            <div className="map-hint">{gpsError ?? 'You are not on this hole – distances from the tee.'}</div>
          )}
          {shotStart && player && (
            <div className="map-shot">
              Shot <strong>{fmt(distanceM(shotStart, player.pos))} {unit}</strong>
            </div>
          )}
          <div className="map-actions">
            <button type="button" className="map-btn" onClick={addTarget} disabled={plan.targets.length >= 2}>
              + Target
            </button>
            <button type="button" className="map-btn" onClick={() => setPlan({ targets: [], pin: null })} disabled={plan.targets.length === 0 && !plan.pin}>
              Clear
            </button>
            <button
              type="button"
              className="map-btn"
              disabled={!player}
              onClick={() => setShotStart(shotStart ? null : player!.pos)}
              aria-pressed={shotStart != null}
            >
              {shotStart ? 'End shot' : 'Mark ball'}
            </button>
          </div>
          <div className="map-nav">
            <button type="button" className="map-btn round" aria-label="Previous hole" onClick={() => goTo(i - 1)} disabled={i === 0}>
              ←
            </button>
            <button type="button" className="map-score" onClick={() => setView('score')}>
              <span className="small">Score</span>
              <strong>{strokesShown}</strong>
              {myEntry.putts != null && <span className="small">{myEntry.putts} putts</span>}
            </button>
            <button type="button" className="map-btn round primary" aria-label={i === round.holes.length - 1 ? 'Finish round' : 'Next hole'} onClick={() => goTo(i + 1)}>
              →
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="screen"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 70) goTo(dx < 0 ? i + 1 : i - 1);
      }}
    >
      <TopBar
        title={round.courseName}
        onBack={props.onExit}
        backLabel="Pause round"
        right={
          <>
            {mapData && (
              <button type="button" className="icon-btn" aria-label="Hole map" onClick={() => setView('map')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
                  <path d="M9 4v14M15 6v14" />
                </svg>
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Scorecard" onClick={() => props.onShowScorecard(commitPar(round))}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 8h8M8 12h8M8 16h5" />
              </svg>
            </button>
          </>
        }
      />
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${((i + 1) / round.holes.length) * 100}%` }} />
      </div>

      <div className="hole-header">
        <div>
          <span className="eyebrow">Hole {i + 1} of {round.holes.length}</span>
          <div className="hole-no">{hole.label}</div>
        </div>
        <div className="hole-meta">
          <span>Par {hole.par || '?'}</span>
          <span>Hcp {hole.strokeIndex || '?'}</span>
          {received > 0 && <span style={{ color: 'var(--brand-text)' }}>+{received}</span>}
        </div>
      </div>

      {needsData && (
        <section className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong>Missing course data – please complete once:</strong>
          <div className="row">
            <span>Par</span>
            <Stepper compact label="Par" value={hole.par || null} placeholder={4} min={3} onChange={(v) => fixHole({ par: v })} />
          </div>
          <div className="row">
            <span>Stroke index</span>
            <Stepper compact label="Stroke index" value={hole.strokeIndex || null} placeholder={9} min={1} onChange={(v) => fixHole({ strokeIndex: Math.min(18, v) })} />
          </div>
        </section>
      )}

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row">
          <span className="row-label">{me.name} · Strokes</span>
          {myEntry.pickedUp ? (
            <span className="badge warn">Picked up</span>
          ) : (
            <Stepper label="Strokes" value={myEntry.strokes} placeholder={hole.par || 4} min={1} onChange={(v) => update(me.id, { strokes: v })} />
          )}
        </div>

        <div className="field">
          <label>Putts {gir != null && myEntry.putts != null && (gir ? <span className="badge ok">✓ GIR</span> : <span className="badge bad">✕ GIR</span>)}</label>
          <Segmented<number>
            label="Putts"
            value={myEntry.putts}
            onChange={(v) => update(me.id, { putts: v })}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))}
          />
        </div>

        {hole.par >= 4 && (
          <div className="field">
            <label>Fairway</label>
            <Segmented<FairwayResult>
              label="Fairway"
              value={myEntry.fairway}
              onChange={(v) => update(me.id, { fairway: v })}
              options={[
                { value: 'left', label: '← Left' },
                { value: 'hit', label: 'Hit' },
                { value: 'right', label: 'Right →' },
              ]}
            />
          </div>
        )}

        <div className="row">
          <span className="row-label">Penalties</span>
          <Stepper compact label="Penalties" value={myEntry.penalties} min={0} onChange={(v) => update(me.id, { penalties: v })} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="toggle"
            aria-pressed={myEntry.greensideBunker}
            onClick={() => update(me.id, { greensideBunker: !myEntry.greensideBunker, upAndDown: null })}
          >
            {myEntry.greensideBunker ? '✓' : '○'} Greenside bunker
          </button>
          {myEntry.greensideBunker && (
            <div className="field">
              <label>Up &amp; down from the bunker?</label>
              <Segmented<string>
                label="Up and down"
                value={myEntry.upAndDown == null ? null : myEntry.upAndDown ? 'yes' : 'no'}
                onChange={(v) => update(me.id, { upAndDown: v == null ? null : v === 'yes' })}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />
            </div>
          )}
        </div>

        <button
          type="button"
          className="toggle"
          aria-pressed={myEntry.pickedUp}
          onClick={() => update(me.id, { pickedUp: !myEntry.pickedUp, strokes: myEntry.pickedUp ? myEntry.strokes : null })}
        >
          {myEntry.pickedUp ? '✓' : '○'} Picked up (0 points)
        </button>
      </section>

      {others.length > 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {others.map((p) => {
            const e = entry(p.id);
            return (
              <div key={p.id} className="row">
                <span className="row-label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {e.pickedUp ? (
                    <span className="badge warn">Picked up</span>
                  ) : (
                    <Stepper compact label={`${p.name} strokes`} value={e.strokes} placeholder={hole.par || 4} min={1} onChange={(v) => update(p.id, { strokes: v })} />
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={e.pickedUp ? `${p.name}: undo picked up` : `${p.name}: picked up`}
                    aria-pressed={e.pickedUp}
                    onClick={() => update(p.id, { pickedUp: !e.pickedUp, strokes: null })}
                  >
                    {e.pickedUp ? '↺' : 'PU'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="totals card">
        <div>
          <div className="num">{totals.gross || '–'}</div>
          <div className="muted small">Gross</div>
        </div>
        <div>
          <div className="num">{totals.holesPlayed ? formatToPar(totals.toPar) : '–'}</div>
          <div className="muted small">To par</div>
        </div>
        <div>
          <div className="num">{totals.stableford ?? '–'}</div>
          <div className="muted small">Stableford</div>
        </div>
      </section>

      <span className="spacer" />
      <div className="nav-bottom">
        <button type="button" className="btn-secondary" onClick={() => goTo(i - 1)} disabled={i === 0}>
          ← Back
        </button>
        <button type="button" className="btn-primary" onClick={() => goTo(i + 1)}>
          {i === round.holes.length - 1 ? 'Finish round' : `Next · hole ${round.holes[i + 1].label}`}
        </button>
      </div>
    </main>
  );
}
