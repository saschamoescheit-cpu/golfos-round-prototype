import { useEffect, useMemo, useRef, useState } from 'react';
import type { FairwayResult, HoleEntry, LngLat, Round } from '../types';
import { greenInRegulation, handicapStrokes, playerTotals } from '../lib/scoring';
import { loadCachedCourse, loadGeometry, loadImagery, loadLive, loadOfflineStamp, loadUnit, saveHoleCorrection, saveHoleLine, saveImagery, saveLive, saveOfflineStamp, saveUnit } from '../lib/storage';
import { holeTileUrls, prefetchTiles } from '../lib/prefetch';
import { imageryOptions, pickImagery, type ImageryId } from '../lib/imagery';
import { detectHole, distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, suggestTarget, type Unit } from '../lib/geo';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { HoleMap } from '../components/HoleMap';
import { HoleSetup } from '../components/HoleSetup';

/** Beyond this distance from the hole the app measures from the tee (planning at home or on another hole). */
const ON_HOLE_M = 1500;
/** Landing points the player can plan per hole (e.g. drive, layup, approach). */
const MAX_TARGETS = 3;

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
    setDetected(null);
    const committed = commitPar(round);
    if (target >= round.holes.length) {
      props.onShowScorecard({ ...committed, currentHole: round.holes.length - 1 });
      return;
    }
    if (target < 0) return;
    props.onChange({ ...committed, currentHole: target });
    setView('map'); // every new hole starts on the map
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
  const [geoVersion, setGeoVersion] = useState(0); // bumps after the player set up a hole
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId, geoVersion]);
  const mapData = useMemo(() => holeMapData(geometry, hole.loop, hole.number), [geometry, hole.loop, hole.number]);
  // The map is the main view. A hole without a hole line opens the set-up on the map (Sascha 10.10.2026).
  const [view, setView] = useState<'map' | 'score'>('map');
  const [setupOpen, setSetupOpen] = useState(false);
  const [editHole, setEditHole] = useState(false);
  const [unit, setUnit] = useState<Unit>(loadUnit);
  const [imageryPref, setImageryPref] = useState<ImageryId | null>(loadImagery);
  const [player, setPlayer] = useState<{ pos: LngLat; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Targets, pin and the marked ball survive a reload (iOS may drop the page while the phone is in the pocket).
  const [live, setLive] = useState(() => loadLive(round.id));
  useEffect(() => saveLive(round.id, live), [round.id, live]);
  const plans = live.plans;
  const setPlans = (p: typeof plans) => setLive((l) => ({ ...l, plans: p }));
  const shotStart = live.shotStart;
  // GPS runs while the hole screen is open (map or score), so the hole is recognised in both views.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        setPlayer({ pos: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy });
      },
      () => setGpsError('No GPS – distances are measured from the tee.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Phone back out of the pocket (or app opened): with the first good GPS fix, move to the hole the player is on.
  const allMaps = useMemo(() => round.holes.map((h) => holeMapData(geometry, h.loop, h.number)), [geometry, round.holes]);
  const [detected, setDetected] = useState<{ from: number; to: number } | null>(null);
  const detectArmed = useRef(true);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') detectArmed.current = true;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    if (!player || !detectArmed.current || player.accuracy > 30 || setupOpen) return;
    detectArmed.current = false;
    const k = detectHole(player.pos, allMaps, i);
    if (k == null) return;
    goTo(k);
    setDetected({ from: i, to: k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  const course = loadCachedCourse(round.courseId);
  const courseCenter: LngLat = course ? [course.lon, course.lat] : (mapData?.greenCenter ?? player?.pos ?? [0, 0]);
  // Best imagery for the course's country (e.g. Spanish national orthophoto) unless the player picked another one.
  const imagery = pickImagery(courseCenter, imageryPref);
  const imageryChoices = imageryOptions(courseCenter);
  // Offline map: save the imagery of all holes of the round once (again after 30 days, or for another imagery source).
  const [offline, setOffline] = useState<{ done: number; total: number } | 'ready' | null>(null);
  useEffect(() => {
    const holes = allMaps.filter((m): m is NonNullable<typeof m> => m != null);
    const fresh = Date.now() - loadOfflineStamp(round.courseId, imagery.id) < 30 * 24 * 3600 * 1000;
    if (holes.length === 0 || fresh || !navigator.serviceWorker?.controller) return; // without service worker nothing is kept
    const ctrl = new AbortController();
    const urls = holeTileUrls(imagery, holes);
    setOffline({ done: 0, total: urls.length });
    prefetchTiles(urls, (done, total) => setOffline({ done, total }), ctrl.signal).then((failed) => {
      if (ctrl.signal.aborted) return;
      if (failed < urls.length * 0.05) saveOfflineStamp(round.courseId, imagery.id);
      setOffline('ready');
      setTimeout(() => setOffline(null), 4000);
    });
    return () => ctrl.abort();
  }, [round.courseId, imagery, allMaps]);
  const offlineHint =
    offline === 'ready' ? (
      <div className="map-shot">Map saved for offline ✓</div>
    ) : offline ? (
      <div className="map-shot">Saving map for offline · {Math.round((offline.done / offline.total) * 100)}%</div>
    ) : null;

  const switchImagery = () => {
    const next = imageryChoices[(imageryChoices.indexOf(imagery) + 1) % imageryChoices.length];
    setImageryPref(next.id);
    saveImagery(next.id);
  };

  const detectedBanner = detected && detected.to === i && (
    <div className="map-hint detected">
      <span>Hole {hole.label} detected by GPS</span>
      <button type="button" className="btn-ghost" onClick={() => goTo(detected.from)}>
        Undo
      </button>
    </div>
  );

  if (setupOpen || (view === 'map' && !mapData)) {
    const nearCourse = player != null && distanceM(player.pos, courseCenter) < 5000;
    return (
      <HoleSetup
        key={i}
        holeLabel={hole.label}
        par={hole.par}
        geometry={geometry}
        center={nearCourse ? player!.pos : courseCenter}
        nearPlayer={nearCourse}
        player={player?.pos ?? null}
        imagery={imagery}
        courseCenter={courseCenter}
        onCancel={() => {
          setSetupOpen(false);
          if (!mapData) setView('score');
        }}
        onScoreOnly={mapData ? undefined : () => setView('score')}
        onSave={(line) => {
          saveHoleLine(round.courseId, hole.loop, hole.number, line);
          setGeoVersion((v) => v + 1);
          setSetupOpen(false);
          setView('map');
        }}
      />
    );
  }

  if (view === 'map' && mapData) {
    const plan = plans[i] ?? { targets: [], pin: null };
    const pin = plan.pin ?? mapData.greenCenter;
    const onHole = player != null && distToLine(player.pos, mapData.line) < ON_HOLE_M;
    const from = onHole ? player!.pos : mapData.tee;
    // Without a mapped green outline (player-set green) only the centre distance is known.
    const green = mapData.green ? greenFrontBack(from, mapData.green) : { front: null, center: distanceM(from, mapData.greenCenter), back: null };
    const setPlan = (patch: Partial<{ targets: LngLat[]; pin: LngLat | null }>) => setPlans({ ...plans, [i]: { ...plan, ...patch } });
    const fmt = (m: number) => formatDistance(m, unit);

    const tapMap = (p: LngLat) => {
      if (distanceM(p, pin) < 12 || plan.targets.some((t) => distanceM(p, t) < 12)) return; // tap on a marker
      if (plan.targets.length < MAX_TARGETS) {
        // Keep targets in playing order: the one nearer to the player comes first.
        const next = [...plan.targets, p].sort((a, b) => distanceM(from, a) - distanceM(from, b));
        setPlan({ targets: next });
      } else {
        // All targets set: the tap moves the nearest one.
        const d = plan.targets.map((t) => distanceM(t, p));
        const next = plan.targets.slice();
        next[d.indexOf(Math.min(...d))] = p;
        setPlan({ targets: next });
      }
    };
    const addTarget = () => {
      if (plan.targets.length >= MAX_TARGETS) return;
      // New target on the hole's playing line (follows doglegs), then drag it where you want.
      const last = plan.targets[plan.targets.length - 1] ?? from;
      setPlan({ targets: [...plan.targets, suggestTarget(mapData.line, last)] });
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
          imagery={imagery}
          onTargetsChange={(targets) => setPlan({ targets })}
          onPinChange={(p) => setPlan({ pin: p })}
          onTargetRemove={(index) => setPlan({ targets: plan.targets.filter((_, j) => j !== index) })}
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
          <button type="button" className="map-btn round" aria-label="Set up this hole on the map again" onClick={() => setSetupOpen(true)}>
            ✎
          </button>
          <button type="button" className="map-btn" onClick={toggleUnit} aria-label={`Unit: ${unit === 'm' ? 'metres' : 'yards'}, tap to switch`}>
            {unit === 'm' ? 'm' : 'yd'}
          </button>
          <button type="button" className="map-btn round" aria-label="Scorecard" onClick={() => props.onShowScorecard(commitPar(round))}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
          </button>
        </div>

        {imageryChoices.length > 1 && (
          <button type="button" className="map-btn map-imagery" onClick={switchImagery} aria-label={`Satellite image: ${imagery.label}, tap to switch`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
            {imagery.label}
          </button>
        )}

        <div className="map-green" aria-label="Distance to the green">
          {green.back != null && (
            <>
              <span className="small">Back</span>
              <span className="map-green-num">{fmt(green.back)}</span>
            </>
          )}
          <span className="small">Center</span>
          <span className="map-green-num big">{fmt(green.center)}</span>
          {green.front != null && (
            <>
              <span className="small">Front</span>
              <span className="map-green-num">{fmt(green.front)}</span>
            </>
          )}
          <span className="map-from">{onHole ? `GPS ±${Math.round(player!.accuracy)} m` : 'from tee'}</span>
        </div>

        <div className="map-bottom">
          {(gpsError || (player && !onHole)) && (
            <div className="map-hint">{gpsError ?? 'You are not on this hole – distances from the tee.'}</div>
          )}
          {detectedBanner}
          {offlineHint}
          {shotStart && player && (
            <div className="map-shot">
              Shot <strong>{fmt(distanceM(shotStart, player.pos))} {unit}</strong>
            </div>
          )}
          {!shotStart && live.lastShot != null && (
            <div className="map-shot">
              Last shot <strong>{fmt(live.lastShot)} {unit}</strong>
            </div>
          )}
          <div className="map-actions">
            <button type="button" className="map-btn" onClick={addTarget} disabled={plan.targets.length >= MAX_TARGETS}>
              {plan.targets.length >= MAX_TARGETS ? `${MAX_TARGETS} targets` : `+ Target ${plan.targets.length + 1}`}
            </button>
            <button type="button" className="map-btn" onClick={() => setPlan({ targets: plan.targets.slice(0, -1) })} disabled={plan.targets.length === 0}>
              − Target
            </button>
            <button
              type="button"
              className="map-btn"
              disabled={!player}
              onClick={() =>
                setLive((l) =>
                  l.shotStart
                    ? { ...l, shotStart: null, lastShot: player ? distanceM(l.shotStart, player.pos) : null }
                    : { ...l, shotStart: player!.pos, lastShot: null },
                )
              }
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
            <button type="button" className="icon-btn" aria-label={mapData ? 'Hole map' : 'Set up hole map'} onClick={() => setView('map')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
                <path d="M9 4v14M15 6v14" />
              </svg>
            </button>
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
      {detectedBanner}

      <div className="hole-header">
        <div>
          <span className="eyebrow">Hole {i + 1} of {round.holes.length}</span>
          <div className="hole-no">{hole.label}</div>
        </div>
        <button
          type="button"
          className="hole-meta"
          style={{ background: 'none', border: 0, padding: '6px 0', cursor: 'pointer' }}
          aria-expanded={editHole}
          aria-label="Edit par and stroke index of this hole"
          onClick={() => setEditHole(!editHole)}
        >
          <span>Par {hole.par || '?'}</span>
          <span>Hcp {hole.strokeIndex || '?'}</span>
          {received > 0 && <span style={{ color: 'var(--brand-text)' }}>+{received}</span>}
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>✎</span>
        </button>
      </div>

      {!mapData && (
        <button type="button" className="btn-secondary" onClick={() => setSetupOpen(true)}>
          Set up hole map (tee + green)
        </button>
      )}

      {(needsData || editHole) && (
        <section className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong>{needsData ? 'Missing course data – please complete once:' : 'Correct par / stroke index (saved for this course):'}</strong>
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
