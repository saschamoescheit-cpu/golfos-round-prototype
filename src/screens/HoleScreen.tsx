import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetailEntry, FairwayResult, HoleEntry, LngLat, Round } from '../types';
import { deriveFromShots, emptyDetail, firstPuttM, lieAt, onGreenAt, shotLengths, suggestClub } from '../lib/shots';
import { GreenSheet, ShotSheet } from '../components/ShotSheet';
import { greenInRegulation, handicapStrokes, playerTotals } from '../lib/scoring';
import { playerBag } from '../lib/stats';
import { autoShot, loadTrack, recordFix } from '../lib/track';
import { loadCachedCourse, loadGeometry, loadImagery, loadLive, loadRounds, loadOfflineStamp, loadUnit, saveHoleCorrection, saveHoleLine, saveImagery, saveLive, saveOfflineStamp, saveUnit } from '../lib/storage';
import { holeTileUrls, prefetchTiles } from '../lib/prefetch';
import { imageryOptions, pickImagery, type ImageryId } from '../lib/imagery';
import { loadForecast, loadWeather, weatherIcon, windOnHole, type Forecast, type Weather } from '../lib/weather';
import { DEFAULT_CARRY, readGreen, type LieKind } from '../lib/caddie';
import { clubDispersion } from '../lib/dispersion';
import { heights } from '../lib/elevation';
import { missMap } from '../lib/missmap';
import { TEES } from '../data/tees';
import { GREEN_CHARTS } from '../data/greenCharts';
import { heightAt as terrainHeight } from '../lib/terrain';
import { loadHoleNotes, saveHoleNote, type HoleNote } from '../lib/holenotes';
import { speak, summary } from '../lib/caddietalk';
import { CaddieCard } from '../components/CaddieCard';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { move } from '../lib/aimpoint';
import { sideOf } from '../lib/dispersion';
import { loadCaddieSettings, loadCarryBag } from '../lib/storage';
import { alongLine, bearingDeg, detectHole, distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, suggestTarget, lineLength, shiftTee, teeDelta, type Unit } from '../lib/geo';
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
  // The hole from the tee the player chose (courses with tee data); the map line starts at one of the tees.
  const forTee = (d: ReturnType<typeof holeMapData>, label: string) => {
    const t = TEES[round.courseId];
    if (!d || !t || !round.tee) return d;
    return shiftTee(d, teeDelta(t.holes[label], t.tees.indexOf(round.tee), lineLength(d.line)));
  };
  const mapData = useMemo(() => forTee(holeMapData(geometry, hole.loop, hole.number), hole.label), [geometry, hole.loop, hole.number, round.tee]);
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
        // Detailed rounds keep the GPS track for the shot detection after the round (only while the app is open).
        // Every round keeps the GPS track (while the app is open): automatic shot length, shot detection.
        if (!round.preview) recordFix(round.id, { t: p.timestamp, p: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy });
      },
      () => setGpsError('No GPS – distances are measured from the tee.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Phone back out of the pocket (or app opened): with the first good GPS fix, move to the hole the player is on.
  const allMaps = useMemo(() => round.holes.map((h) => forTee(holeMapData(geometry, h.loop, h.number), h.label)), [geometry, round.holes, round.tee]);
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

  // Weather: on opening and every 10 minutes; saved with the hole when the player is on it.
  const [weather, setWeather] = useState<Weather | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  useEffect(() => {
    let alive = true;
    const get = () => {
      loadWeather(courseCenter).then((w) => alive && w && setWeather(w));
      loadForecast(courseCenter).then((f) => alive && f && setForecast(f));
    };
    get();
    const t = window.setInterval(get, 10 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.courseId]);
  const onThisHole = player != null && mapData != null && distToLine(player.pos, mapData.line) < 150;
  useEffect(() => {
    if (weather && onThisHole && !myEntry.weather) update(me.id, { weather: { tempC: weather.tempC, windKmh: weather.windKmh, windFromDeg: weather.windFromDeg } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, onThisHole, i]);

  // ---------- AI caddie (feature 008) ----------
  const caddieOn = useMemo(() => loadCaddieSettings().caddie, []);
  const greenSlopeOn = useMemo(() => loadCaddieSettings().greenSlope, []);
  const missMapOn = useMemo(() => loadCaddieSettings().missMap, []);
  const [showMiss, setShowMiss] = useState(missMapOn);
  // Green slope: automatic near the green, or shown any time with the "Green" button.
  const [showGreen, setShowGreen] = useState(false);
  const carryBag = useMemo(() => loadCarryBag() ?? DEFAULT_CARRY, []);
  // Own tendency per club (≥ 5 tracked shots) – the caddie aims against it.
  const tendency = useMemo(() => new Map(clubDispersion(loadRounds().filter((r) => r.finishedAt)).filter((d) => d.shots >= 5).map((d) => [d.club, d.sideMean])), []);
  const caddieSettings = useMemo(() => loadCaddieSettings(), []);
  // Hidden by the player until the caddie has something new to say (new hole, new shot, new warning).
  const [hiddenSig, setHiddenSig] = useState<string | null>(null);
  const [notes, setNotes] = useState(() => loadHoleNotes(round.courseId));
  // Lie of the ball for the next shot, set by the player; valid for this spot only (sig of hole + 25 m step).
  const [pinSheet, setPinSheet] = useState(false);
  const [lieSet, setLieSet] = useState<{ sig: string; lie: LieKind } | null>(null);
  const spokenSig = useRef<string | null>(null);
  // Heights of tee, green and player (for "plays shorter, downhill"); rounded positions keep requests rare.
  const [hts, setHts] = useState<Record<string, number | null>>({});
  const htKey = (p: LngLat) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const playerKey = player ? htKey(player.pos) : '';
  useEffect(() => {
    if (!mapData) return;
    const pts: LngLat[] = [mapData.tee, mapData.greenCenter, ...(player ? [player.pos] : [])];
    let alive = true;
    heights(pts).then((h) => alive && setHts((old) => ({ ...old, ...Object.fromEntries(pts.map((p, k) => [htKey(p), h[k]])) })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData, playerKey]);
  const heightAt = (p: LngLat) => hts[htKey(p)] ?? null;

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

  // ---------- Detailed tracking (feature 003) ----------
  const detailMode = round.mode === 'detail';
  const detail: DetailEntry = myEntry.detail ?? emptyDetail();
  const pinPos: LngLat | null = plans[i]?.pin ?? mapData?.greenCenter ?? null;
  const [sheet, setSheet] = useState<{ kind: 'shot'; index: number | null; pos: LngLat | null } | { kind: 'green'; pos: LngLat | null } | null>(null);
  const [placing, setPlacing] = useState<'shot' | 'green' | null>(null);
  const fmtU = (m: number) => formatDistance(m, unit);
  const lengths = shotLengths(detail);
  // Club suggestions use the player's own distances from finished detailed rounds (≥ 3 shots per club).
  const bag = useMemo(() => playerBag(loadRounds().filter((r) => r.finishedAt)), []);
  const hasShots = detail.shots.length > 0;
  const holeDone = detail.holedOut || (detail.onGreen != null && myEntry.putts != null);
  const saveDetail = (d: DetailEntry, putts: number | null = myEntry.putts) =>
    update(me.id, { detail: d, putts, ...deriveFromShots(d, putts, hole.par, mapData) });
  /** Opens the right sheet for a position: on the green → putts, else → next shot. */
  const openAt = (kind: 'shot' | 'green', pos: LngLat | null) => {
    if (kind === 'shot' && pos && mapData && onGreenAt(pos, mapData) && detail.shots.length > 0) setSheet({ kind: 'green', pos });
    else setSheet(kind === 'shot' ? { kind, index: null, pos } : { kind, pos });
  };
  const track: { pos: LngLat; label: string; green?: boolean }[] = detail.shots
    .map((s, k) => (s.pos ? { pos: s.pos, label: `${k + 1}${s.club ? ' ' + s.club : ''}${lengths[k] != null ? ' · ' + fmtU(lengths[k]!) : ''}${s.penalty ? ' +1' : ''}` } : null))
    .filter((t): t is { pos: LngLat; label: string } => t != null);
  if (detail.onGreen) track.push({ pos: detail.onGreen, label: myEntry.putts != null ? `${myEntry.putts} putt${myEntry.putts === 1 ? '' : 's'}` : 'green', green: true });

  let sheetEl: JSX.Element | null = null;
  if (sheet?.kind === 'shot') {
    const editing = sheet.index != null;
    const n = editing ? sheet.index! + 1 : detail.shots.length + 1;
    const existing = editing ? detail.shots[sheet.index!] : null;
    const pos = existing ? existing.pos : sheet.pos;
    const toPin = pos && pinPos ? distanceM(pos, pinPos) : null;
    sheetEl = (
      <ShotSheet
        title={`Shot ${n}${toPin != null ? ` · ${fmtU(toPin)} ${unit} to pin` : ''}`}
        lie={existing?.lie ?? (pos && mapData ? lieAt(pos, mapData, n === 1) : n === 1 ? 'tee' : 'fairway')}
        club={existing ? existing.club : suggestClub(hole.par || 4, n === 1, toPin ?? (hole.par >= 4 ? 300 : 150), bag)}
        bag={bag}
        penalty={existing?.penalty ?? false}
        kind={existing?.kind}
        toPinM={toPin}
        editing={editing}
        onCancel={() => setSheet(null)}
        onSave={(v) => {
          const shots = detail.shots.slice();
          if (editing) shots[sheet.index!] = { ...shots[sheet.index!], ...v };
          else shots.push({ pos: sheet.pos, ...v });
          saveDetail({ ...detail, shots });
          setSheet(null);
        }}
        onDelete={editing ? () => { saveDetail({ ...detail, shots: detail.shots.filter((_, k) => k !== sheet.index) }); setSheet(null); } : undefined}
        onHoledOut={
          editing
            ? undefined
            : () => {
                saveDetail({ ...detail, shots: [...detail.shots, { pos: sheet.pos, lie: pos && mapData ? lieAt(pos, mapData, n === 1) : 'fairway', club: null, penalty: false }], holedOut: true, onGreen: null, pin: pinPos }, 0);
                setSheet(null);
              }
        }
      />
    );
  } else if (sheet?.kind === 'green') {
    const d = { ...detail, onGreen: sheet.pos ?? detail.onGreen, pin: pinPos };
    sheetEl = (
      <GreenSheet
        title={`On the green · after ${detail.shots.length} shot${detail.shots.length === 1 ? '' : 's'}`}
        firstPuttM={firstPuttM(d)}
        unit={unit}
        fmt={fmtU}
        putts={myEntry.putts}
        onCancel={() => setSheet(null)}
        onSave={(putts) => {
          saveDetail({ ...d, holedOut: false }, putts);
          setSheet(null);
        }}
      />
    );
  }

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
    const conditions = weather ? { windKmh: weather.windKmh, gustKmh: weather.gustKmh, windFromDeg: weather.windFromDeg, tempC: weather.tempC } : null;
    const terrain = { slopes: geometry.fairwaySlopes?.[hole.label], boundary: geometry.boundary, trees: geometry.trees };
    // Par 4/5: target 1 is there from the start – the caddie's landing spot from the tee (driver carry, moved for
    // wind, slope and tendency, clear of trees). The player can drag or remove it; his own plan is kept then.
    const teeAim = teeAimFor({ data: mapData, par: hole.par, pin: plans[i]?.pin ?? mapData.greenCenter, bag: carryBag, conditions, tendency, ...terrain, note: notes[hole.label] ?? {}, style: caddieSettings.style, favourite: caddieSettings.favourite });
    const plan = plans[i] ?? { targets: teeAim && distanceM(teeAim.pos, mapData.greenCenter) > 60 ? [teeAim.pos] : [], pin: null };
    const pin = plan.pin ?? mapData.greenCenter;
    const onHole = player != null && distToLine(player.pos, mapData.line) < ON_HOLE_M;
    const from = onHole ? player!.pos : mapData.tee;
    // Without a mapped green outline (player-set green) only the centre distance is known.
    const green = mapData.green ? greenFrontBack(from, mapData.green) : { front: null, center: distanceM(from, mapData.greenCenter), back: null };
    const setPlan = (patch: Partial<{ targets: LngLat[]; pin: LngLat | null }>) => setPlans({ ...plans, [i]: { ...plan, ...patch } });
    const fmt = (m: number) => formatDistance(m, unit);
    /** Pin of the day on a 3 × 3 grid: depth front/middle/back × left/centre/right (thirds of the green). */
    const pinAt = (depth: -1 | 0 | 1, side: -1 | 0 | 1): LngLat => {
      const g = greenFrontBack(mapData.tee, mapData.green!);
      const along = depth < 0 ? -(g.center - g.front) * 0.6 : depth > 0 ? (g.back - g.center) * 0.6 : 0;
      const b = bearingDeg(mapData.tee, mapData.greenCenter);
      // half width across the line: furthest outline point to the side
      const half = Math.max(6, ...mapData.green!.map((q) => Math.abs(sideOf(mapData.greenCenter, move(mapData.greenCenter, b, 10), q))));
      const p1 = move(mapData.greenCenter, b, along);
      return side === 0 ? p1 : move(p1, b + 90 * side, half * 0.55);
    };

    const tapMap = (p: LngLat) => {
      if (placing) {
        openAt(placing, p);
        setPlacing(null);
        return;
      }
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
    // Automatic shot length: from the last place the player stood (or the tee) to here – no tapping needed.
    const autoLen = onHole && player && !round.preview ? autoShot(loadTrack(round.id), mapData, player.pos) : null;
    // ---------- AI caddie ----------
    const teeShot = !onHole || distanceM(from, mapData.tee) < 30;
    const note: HoleNote = notes[hole.label] ?? {};
    const lieSig = `${i}|${Math.round(distanceM(from, pin) / 25)}`;
    // Green slope when the player is on or next to the green (or planning from the sofa).
    const slope = greenSlopeOn ? geometry.greenSlopes?.[hole.label] : undefined;
    const nearGreen = distanceM(from, mapData.greenCenter) <= 40 || (round.preview === true && hole.par === 3);
    const greenVisible = nearGreen || showGreen;
    const chart = greenSlopeOn ? GREEN_CHARTS[round.courseId]?.[hole.label] : undefined;
    // Green chart on screen: keep the view free (caddie folded, no hint).
    const greenFocus = chart != null && greenVisible;
    const green_ = slope && greenVisible ? readGreen(slope, bearingDeg(from, pin)) : null;
    const prev = i > 0 ? round.entries[me.id][i - 1] : null;
    const prevHole = i > 0 ? round.holes[i - 1] : null;
    const cad = caddieOn
      ? caddieAdvice({
          data: mapData,
          par: hole.par,
          holeIndex: i,
          holeCount: round.holes.length,
          from,
          teeShot,
          pin,
          targets: plan.targets,
          teeAim,
          ...terrain,
          bag: carryBag,
          conditions,
          tendency,
          note,
          style: caddieSettings.style,
          favourite: caddieSettings.favourite,
          lieChoice: lieSet?.sig === lieSig ? lieSet.lie : null,
          unit,
          coarseHeight: heightAt,
          stableford: me.playingHandicap != null && !round.preview ? { received, shotsSoFar: teeShot ? 0 : (myEntry.detail?.shots.length ?? null) } : null,
          prev: prev && prevHole ? { toPar: prev.strokes != null ? prev.strokes - prevHole.par : null, pickedUp: !!prev.pickedUp } : null,
          forecast,
          wind: weather ? { gustKmh: weather.gustKmh, windKmh: weather.windKmh, label: windOnHole(weather, bearingDeg(from, pin)).label } : null,
          greenText: green_ ? (green_.level === 'flat' ? 'The green is almost flat.' : `${green_.level} slope, ${green_.text}.`) : null,
        })
      : null;
    const ap = cad?.ap ?? null;
    // Heights for the green box: terrain model along the hole, else the coarse elevation service.
    const tH = (p: LngLat) => (distToLine(p, mapData.line) <= 40 ? terrainHeight(geometry.fairwaySlopes?.[hole.label], alongLine(mapData.line, p)) : null);
    const fromH = tH(from) ?? heightAt(from);
    const greenH = tH(mapData.greenCenter) ?? heightAt(mapData.greenCenter);
    const slopeToGreen = fromH != null && greenH != null ? greenH - fromH : null;
    const miss = showMiss ? missMap(mapData, pin, plan.targets[0] ?? null) : undefined;

    // Something new to say = new hole, other club, new warning, or the player moved on (≈ 25 m steps).
    const caddieSig = cad ? `${i}|${cad.advice.club}|${cad.warning ?? ''}|${cad.ap.kind}|${Math.round(cad.pl.distance / 25)}` : '';
    const caddieShown = cad != null && !greenFocus && hiddenSig !== caddieSig;
    if (caddieSettings.voice && caddieShown && spokenSig.current !== caddieSig && !round.preview) {
      spokenSig.current = caddieSig;
      const said = summary(cad!.facts);
      setTimeout(() => speak(said), 300);
    }

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
          track={detailMode ? track : undefined}
          missMap={miss}
          aimPoint={ap && !plan.targets.some((t) => distanceM(t, ap.pos) < 15) && ap.kind !== 'approach' ? ap.pos : null}
          greenChart={chart && greenVisible ? { url: chart.file, corners: chart.corners } : null}
          greenSlope={!chart && slope && green_ && green_.level !== 'flat' ? { pos: mapData.greenCenter, downDeg: slope.downDeg, label: green_.level } : undefined}
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

        {weather && (
          <WeatherBadge weather={weather} holeBearing={bearingDeg(mapData.tee, mapData.greenCenter)} below={imageryChoices.length > 1} />
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
          {slopeToGreen != null && Math.abs(slopeToGreen) >= 2 && (
            <span className="map-slope-chip">
              Green {Math.abs(Math.round(slopeToGreen))} m {slopeToGreen < 0 ? 'lower' : 'higher'}
              <br />
              plays like {fmt(green.center + slopeToGreen)}
            </span>
          )}
          <span className="map-from">{onHole ? `GPS ±${Math.round(player!.accuracy)} m` : 'from tee'}</span>
        </div>

        {pinSheet && mapData.green && (
          <div className="sheet-backdrop" onClick={() => setPinSheet(false)}>
            <section className="sheet" role="dialog" aria-label="Pin position today" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>Where is the pin today?</strong>
                <button type="button" className="icon-btn" aria-label="Close" onClick={() => setPinSheet(false)}>
                  ✕
                </button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Seen from the fairway – back of the green at the top. You can also drag the flag on the map.
              </p>
              <div className="pin-grid" role="group" aria-label="Pin position">
                {([1, 0, -1] as const).flatMap((depth) =>
                  ([-1, 0, 1] as const).map((side) => {
                    const name = `${depth > 0 ? 'Back' : depth < 0 ? 'Front' : 'Middle'} ${side < 0 ? 'left' : side > 0 ? 'right' : 'centre'}`;
                    return (
                      <button
                        key={`${depth}${side}`}
                        type="button"
                        aria-label={`Pin ${name.toLowerCase()}`}
                        onClick={() => {
                          setPlan({ pin: pinAt(depth, side) });
                          setPinSheet(false);
                        }}
                      >
                        {name}
                      </button>
                    );
                  }),
                )}
              </div>
            </section>
          </div>
        )}

        <div className="map-bottom">
          {!greenFocus && (gpsError || (player && !onHole)) && (
            <div className="map-hint">{round.preview ? 'Preview · distances from the tee' : (gpsError ?? 'You are not on this hole – distances from the tee.')}</div>
          )}
          {detectedBanner}
          {offlineHint}
          <div className="map-tools">
            {(slope || chart) && !nearGreen && (
              <button type="button" className="map-btn round tool" aria-pressed={showGreen} aria-label={showGreen ? 'Hide green slope' : 'Show green slope'} title="Green slope" onClick={() => setShowGreen(!showGreen)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <ellipse cx="12" cy="17" rx="9" ry="4" fill="currentColor" opacity="0.35" />
                  <path d="M7 16.5l4-2.5 3 1.8 4-2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 13.2l2 0-.6 1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 15V3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M10.5 3.5h6l-1.8 2.2 1.8 2.2h-6z" fill="#FF6B5E" />
                </svg>
              </button>
            )}
            {mapData.green && !greenFocus && (
              <button type="button" className="map-btn round tool" aria-label="Set today's pin position" title="Pin position" onClick={() => setPinSheet(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <ellipse cx="12" cy="18" rx="9" ry="3.6" fill="currentColor" opacity="0.35" />
                  <path d="M11 18V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M11.5 4h6.5l-2 2.5 2 2.5h-6.5z" fill="#FF6B5E" />
                  <circle cx="11" cy="18" r="1.4" fill="currentColor" />
                </svg>
              </button>
            )}
            {missMapOn && (
              <button type="button" className="map-btn round tool" aria-pressed={showMiss} aria-label={showMiss ? 'Hide where not to miss' : 'Show where not to miss'} title="Where not to miss" onClick={() => setShowMiss(!showMiss)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <circle cx="12" cy="12" r="4.5" />
                  <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                </svg>
              </button>
            )}
            {caddieOn && !greenFocus && (
              <button
                type="button"
                className="map-btn round tool"
                aria-pressed={caddieShown}
                aria-label={caddieShown ? 'Hide caddie' : 'Show caddie'}
                title="AI caddie"
                onClick={() => setHiddenSig(caddieShown ? caddieSig : null)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8" y="9" width="8" height="12" rx="2.5" />
                  <path d="M8 13h8" />
                  <path d="M10 9V3.5M12.5 9V2.5M15 9V4" />
                  <path d="M9 3.5h2M11.5 2.5h2.2M14 4h2" />
                  <path d="M16 11c2.5 1 2.5 6 0 7" />
                </svg>
              </button>
            )}
          </div>
          {green_ && (
            <div className="map-hint detected" style={{ color: 'var(--text)' }}>
              <span>
                {green_.level === 'flat' ? 'Green: almost flat' : `Green: ${green_.level} slope · ${green_.text}`} <span className="muted small">(approx.)</span>
              </span>
            </div>
          )}
          {caddieShown && cad && (
            <CaddieCard
              facts={cad.facts}
              lines={cad.lines}
              alt={cad.alt}
              onHide={() => setHiddenSig(caddieSig)}
              note={note}
              holeLabel={hole.label}
              clubCode={cad.advice.club}
              lie={teeShot ? null : cad.lie}
              onLie={(l) => setLieSet({ sig: lieSig, lie: l })}
              onNote={(n) => {
                saveHoleNote(round.courseId, hole.label, n);
                setNotes({ ...notes, [hole.label]: n });
              }}
            />
          )}
          {shotStart && player && (
            <div className="map-shot">
              Shot <strong>{fmt(distanceM(shotStart, player.pos))} {unit}</strong>
            </div>
          )}
          {!shotStart && autoLen && (
            <div className="map-shot">
              {autoLen.fromTee ? 'Tee shot' : 'Last shot'} <strong>{fmt(autoLen.length)} {unit}</strong>
            </div>
          )}
          {!shotStart && !autoLen && live.lastShot != null && (
            <div className="map-shot">
              Last shot <strong>{fmt(live.lastShot)} {unit}</strong>
            </div>
          )}
          {placing && (
            <div className="map-hint detected">
              <span>{placing === 'shot' ? `Tap where shot ${detail.shots.length + 1} was hit from` : 'Tap where your ball is on the green'}</span>
              <button type="button" className="btn-ghost" onClick={() => setPlacing(null)}>
                Cancel
              </button>
            </div>
          )}
          {detailMode ? (
            <div className="map-actions detail">
              <button type="button" className="map-btn" onClick={addTarget} disabled={plan.targets.length >= MAX_TARGETS}>
                + Target
              </button>
              {holeDone ? (
                <button type="button" className="map-btn primary" onClick={() => goTo(i + 1)}>
                  Done · {myEntry.strokes} → {i === round.holes.length - 1 ? 'finish' : 'next'}
                </button>
              ) : (
                <button type="button" className="map-btn primary" onClick={() => (onHole ? openAt('shot', player!.pos) : setPlacing('shot'))}>
                  {detail.shots.length === 0 ? 'Tee shot' : `Shot ${detail.shots.length + 1}`} {onHole ? 'from here' : '· tap map'}
                </button>
              )}
              <button
                type="button"
                className="map-btn"
                disabled={detail.shots.length === 0 || detail.holedOut}
                onClick={() => (detail.onGreen ? openAt('green', detail.onGreen) : onHole ? openAt('green', player!.pos) : setPlacing('green'))}
              >
                {detail.onGreen ? 'Putts' : 'On green'}
              </button>
            </div>
          ) : (
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
                {shotStart ? 'Done measuring' : 'Measure shot'}
              </button>
            </div>
          )}
          <div className="map-nav">
            <button type="button" className="map-btn round" aria-label="Previous hole" onClick={() => goTo(i - 1)} disabled={i === 0}>
              ←
            </button>
            {round.preview ? (
              <span className="map-score">
                <span className="small">Preview</span>
                <strong>
                  {i + 1}/{round.holes.length}
                </strong>
              </span>
            ) : (
              <button type="button" className="map-score" onClick={() => setView('score')}>
                <span className="small">Score</span>
                <strong>{strokesShown}</strong>
                {myEntry.putts != null && <span className="small">{myEntry.putts} putts</span>}
              </button>
            )}
            <button type="button" className="map-btn round primary" aria-label={i === round.holes.length - 1 ? 'Finish round' : 'Next hole'} onClick={() => goTo(i + 1)}>
              →
            </button>
          </div>
        </div>
        {sheetEl}
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

      {detailMode && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row">
            <span className="row-label">Shots</span>
            <span className="muted small">{hasShots ? 'Strokes, fairway, penalties and bunker come from the shots' : 'Track shot by shot on the map, or enter the score below'}</span>
          </div>
          {hasShots && (
            <ol className="shot-list">
              {detail.shots.map((sh, k) => (
                <li key={k}>
                  <span className="n">{k + 1}</span>
                  <span>
                    <strong>{sh.club ?? '–'}</strong> <span className="muted">· {sh.lie}{sh.penalty ? ' · +1 penalty' : ''}</span>
                  </span>
                  <span className="muted">{lengths[k] != null ? `${fmtU(lengths[k]!)} ${unit}` : ''}</span>
                  <button type="button" className="icon-btn" aria-label={`Edit shot ${k + 1}`} onClick={() => setSheet({ kind: 'shot', index: k, pos: sh.pos })}>
                    ✎
                  </button>
                </li>
              ))}
              {detail.holedOut && <li><span className="n">⛳</span><span>Holed out</span><span /><span /></li>}
            </ol>
          )}
          <div className="nav-bottom" style={{ gridTemplateColumns: hasShots ? '1fr 1fr' : '1fr' }}>
            <button type="button" className="btn-secondary" onClick={() => setSheet({ kind: 'shot', index: null, pos: null })} disabled={detail.holedOut}>
              + Add shot
            </button>
            {hasShots && (
              <button type="button" className="btn-secondary btn-danger" onClick={() => update(me.id, { detail: undefined })}>
                Clear shots
              </button>
            )}
          </div>
        </section>
      )}

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row">
          <span className="row-label">{me.name} · Strokes</span>
          {myEntry.pickedUp ? (
            <span className="badge warn">Picked up</span>
          ) : hasShots ? (
            <span className="num" style={{ font: '700 28px var(--display)' }}>{myEntry.strokes ?? '…'}</span>
          ) : (
            <Stepper label="Strokes" value={myEntry.strokes} placeholder={hole.par || 4} min={1} onChange={(v) => update(me.id, { strokes: v })} />
          )}
        </div>

        <div className="field">
          <label>Putts {gir != null && myEntry.putts != null && (gir ? <span className="badge ok">✓ GIR</span> : <span className="badge bad">✕ GIR</span>)}</label>
          <Segmented<number>
            label="Putts"
            value={myEntry.putts}
            onChange={(v) => (hasShots ? saveDetail(detail, v) : update(me.id, { putts: v }))}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))}
          />
        </div>

        {hasShots && (
          <p className="muted small" style={{ margin: 0 }}>
            {hole.par >= 4 && `Fairway: ${myEntry.fairway ?? '–'} · `}Penalties: {myEntry.penalties}
            {myEntry.greensideBunker && ` · Greenside bunker${myEntry.upAndDown ? ' – sand save ✓' : ''}`}
          </p>
        )}

        {hole.par >= 4 && !hasShots && (
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

        {!hasShots && (
          <>
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
          </>
        )}

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
      {sheetEl}
    </main>
  );
}

/** Temperature and wind on the hole map; the arrow shows where the wind blows, turned with the map (tee at the bottom). */
function WeatherBadge(props: { weather: Weather; holeBearing: number; below: boolean }) {
  const w = props.weather;
  const rel = windOnHole(w, props.holeBearing);
  const rotate = w.windFromDeg + 180 - props.holeBearing;
  return (
    <div className={`map-weather${props.below ? ' below' : ''}`} aria-label={`${Math.round(w.tempC)} degrees, wind ${Math.round(w.windKmh)} km/h, ${rel.label}`}>
      <span className="temp">
        {weatherIcon(w.code)} {Math.round(w.tempC)}°
      </span>
      <span className="wind">
        {Math.round(w.windKmh) >= 5 && (
          <svg width="16" height="16" viewBox="0 0 24 24" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true">
            <path d="M12 3v18M12 3l-6 6M12 3l6 6" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          </svg>
        )}
        {Math.round(w.windKmh)} km/h
      </span>
      <span className="small">{rel.label}</span>
    </div>
  );
}
