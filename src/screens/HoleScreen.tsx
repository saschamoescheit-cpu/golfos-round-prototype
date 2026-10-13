import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetailEntry, FairwayResult, HoleEntry, LngLat, Round } from '../types';
import { deriveFromShots, emptyDetail, shotsComplete, firstPuttM, lieAt, lieName, onGreenAt, shotLengths, suggestClub } from '../lib/shots';
import { GreenSheet, ShotSheet } from '../components/ShotSheet';
import { commitParAt, greenInRegulation, handicapStrokes, playerTotals } from '../lib/scoring';
import { playerBag } from '../lib/stats';
import { autoShot, loadTrack, recordFix, teeSpot } from '../lib/track';
import { PositionFilter } from '../lib/gpsfilter';
import { recordCaddie } from '../lib/caddielog';
import { loadCachedCourse, loadGeometry, loadImagery, loadLive, loadRounds, loadOfflineStamp, loadUnit, saveHoleCorrection, saveHoleLine, saveImagery, saveLive, saveOfflineStamp } from '../lib/storage';
import { holeTileUrls, prefetchTiles } from '../lib/prefetch';
import { imageryOptions, pickImagery, type ImageryId } from '../lib/imagery';
import { loadForecast, loadWeather, weatherIcon, windOnHole, type Forecast, type Weather } from '../lib/weather';
import { DEFAULT_CARRY, levelName, readGreen, type LieKind } from '../lib/caddie';
import { clubDispersion } from '../lib/dispersion';
import { heights } from '../lib/elevation';
import { missMap } from '../lib/missmap';
import { GREEN_CHARTS } from '../data/greenCharts';
import { greenSource } from '../data/greenSources';
import { heightAt as terrainHeight } from '../lib/terrain';
import { loadHoleNotes, saveHoleNote, type HoleNote } from '../lib/holenotes';
import { speak, summary } from '../lib/caddietalk';
import { CaddieCard } from '../components/CaddieCard';
import { isSun, setSun } from '../lib/theme';
import { holeForTee } from '../lib/teeline';
import { bestLeave, loadGreenGrids, onThisGreen, readPutt, setGreenSpeed, type GreenGrid, type PuttRead } from '../lib/greenread';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { move } from '../lib/aimpoint';
import { sideOf } from '../lib/dispersion';
import { loadCaddieSettings, loadCarryBag } from '../lib/storage';
import { profileAlong, bearingDeg, detectHole, distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, pointInRing, suggestTarget, type Unit, approachFrom } from '../lib/geo';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { HoleMap } from '../components/HoleMap';
import { HoleSetup } from '../components/HoleSetup';
import { clubCode, tr } from '../lib/i18n';
import { swingMark, withPartials } from '../lib/partials';

const fairwayName = (f: string) => tr(f, ({ left: 'links', hit: 'getroffen', right: 'rechts' } as Record<string, string>)[f] ?? f);

/** Beyond this distance from the hole the app measures from the tee (planning at home or on another hole). */
const ON_HOLE_M = 1500;
/** Landing points the player can plan per hole (e.g. drive, layup, approach). */
// Shots are not logged by hand on the map any more (Sascha, 13.10.2026): they come from the GPS track and are
// checked after the round. The code stays for Ben (spec 004 decides); false = the quick-mode buttons in every mode.
const MANUAL_SHOTS = false;
const GREEN_AUTO_M = 120; // green chart comes up by itself from here on
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
  const commitPar = (r: Round): Round => commitParAt(r, i);

  /** `byGps`: the GPS moved the round on – the player confirmed nothing, so no par is written for the last hole. */
  const goTo = (target: number, byGps = false) => {
    setDetected(null);
    const committed = byGps ? round : commitPar(round);
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
  const forTee = (d: ReturnType<typeof holeMapData>, label: string) => holeForTee(d, round.courseId, label, round.tee, geometry.tee);
  const mapData = useMemo(() => forTee(holeMapData(geometry, hole.loop, hole.number), hole.label), [geometry, hole.loop, hole.number, round.tee]);
  // The map is the main view. A hole without a hole line opens the set-up on the map (Sascha 10.10.2026).
  const [view, setView] = useState<'map' | 'score'>('map');
  const [setupOpen, setSetupOpen] = useState(false);
  const [editHole, setEditHole] = useState(false);
  const [unit] = useState<Unit>(loadUnit);
  const [imageryPref, setImageryPref] = useState<ImageryId | null>(loadImagery);
  const [player, setPlayer] = useState<{ pos: LngLat; accuracy: number; still?: boolean } | null>(null);
  const detectArmed = useRef(true); // the next good fix may move the round to the hole the player is on
  // Battery: iOS delivers a fix about every second. The screen (map, caddie, labels) is only redrawn when the player
  // moved (≥ 1 m), the accuracy changed or 3 s passed – standing still at the ball redraws rarely.
  // Accuracy: the shown position is filtered – averaged while standing at the ball, the newest fix while walking.
  const filter = useRef(new PositionFilter());
  const shownFix = useRef<{ pos: LngLat; accuracy: number; t: number; still?: boolean } | null>(null);
  const showFix = (f: { pos: LngLat; accuracy: number; t: number; still?: boolean }) => {
    shownFix.current = f;
    setPlayer({ pos: f.pos, accuracy: f.accuracy, still: f.still });
  };
  // The app was opened again (phone out of the pocket, often at the ball): the next fix is marked in the track –
  // a strong hint for the shot detection – and the hole is looked up again.
  const reopened = useRef(true);
  const visibleAt = useRef(Date.now());
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Targets, pin and the marked ball survive a reload (iOS may drop the page while the phone is in the pocket).
  const [live, setLive] = useState(() => loadLive(round.id));
  useEffect(() => saveLive(round.id, live), [round.id, live]);
  const plans = live.plans;
  const setPlans = (p: typeof plans) => setLive((l) => ({ ...l, plans: p }));
  const shotStart = live.shotStart;
  // GPS runs while the hole screen is open (map or score), so the hole is recognised in both views.
  // No fix yet (cold start, trees) is no reason to give up: the watch is restarted and the player sees "searching".
  // Only a refused permission needs the player – the hint says where to switch it on.
  const [gpsTry, setGpsTry] = useState(0);
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError(tr('This browser has no GPS – distances are measured from the tee.', 'Dieser Browser hat kein GPS – Distanzen werden vom Abschlag gemessen.'));
      return;
    }
    let restart: number | undefined;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGpsError(null);
        // Just unlocked: a fix from before the phone went into the pocket is the old place, not where the player stands
        // (only right after unlocking, so a phone with an odd GPS clock is never locked out).
        if (Date.now() - visibleAt.current < 5000 && p.timestamp < visibleAt.current - 10000) return;
        const fix = filter.current.push({ pos: [p.coords.longitude, p.coords.latitude] as LngLat, accuracy: p.coords.accuracy, t: Date.now() });
        const was = shownFix.current;
        if (!was || distanceM(was.pos, fix.pos) >= 1 || Math.abs(was.accuracy - fix.accuracy) >= 3 || fix.t - was.t >= 3000 || was.still !== fix.still) showFix(fix);
        // Every round keeps the GPS track (while the app is open, raw fixes): automatic shot length, shot detection.
        // only a fresh fix: right after unlocking, iOS may first hand out the old position (where the phone was put away)
        const open = reopened.current && p.coords.accuracy <= 30 && p.timestamp >= visibleAt.current - 2000;
        if (open) reopened.current = false;
        if (!round.preview) recordFix(round.id, { t: p.timestamp, p: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy, ...(open ? { open: true } : {}) });
      },
      (err) => {
        if (err.code === 1) {
          setGpsError(
            tr(
              'Location not allowed. iPhone: Settings → Privacy & Security → Location Services → Safari Websites → “While Using” and Precise Location on. Then reload.',
              'Standort nicht erlaubt. iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden“ und „Genauer Standort“ an. Dann neu laden.',
            ),
          );
          return;
        }
        setGpsError(tr('GPS is searching … distances from the tee until there is a fix.', 'GPS sucht … bis dahin Distanzen vom Abschlag.'));
        window.clearTimeout(restart);
        restart = window.setTimeout(() => setGpsTry((n) => n + 1), 3000); // start a fresh watch
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    return () => {
      window.clearTimeout(restart);
      navigator.geolocation.clearWatch(id);
    };
  }, [gpsTry]);

  // Phone back out of the pocket (or app opened): with the first good GPS fix, move to the hole the player is on.
  const allMaps = useMemo(() => round.holes.map((h) => forTee(holeMapData(geometry, h.loop, h.number), h.label)), [geometry, round.holes, round.tee]);
  const [detected, setDetected] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        detectArmed.current = true;
        reopened.current = true;
        visibleAt.current = Date.now();
        filter.current = new PositionFilter(); // the player has moved meanwhile: no average across the gap
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    if (!player || !detectArmed.current || player.accuracy > 30 || setupOpen) return;
    detectArmed.current = false;
    const k = detectHole(player.pos, allMaps, i);
    if (k == null) return;
    goTo(k, true);
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
    // the green charts and green heights of the course too, so the green read works without network (feature 028)
    const charts = Object.values(GREEN_CHARTS[round.courseId] ?? {}).map((c) => c.file);
    const urls = [...holeTileUrls(imagery, holes), ...charts, ...(charts.length ? [charts[0].replace(/[^/]+$/, 'heights.json')] : [])];
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
      <div className="map-shot">{tr('Map saved for offline ✓', 'Karte offline gespeichert ✓')}</div>
    ) : offline ? (
      <div className="map-shot">
        {tr('Saving map for offline', 'Karte wird offline gespeichert')} · {Math.round((offline.done / offline.total) * 100)}%
      </div>
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
  useMemo(() => setGreenSpeed(loadCaddieSettings().greenSpeed), []); // putt reads at the chosen green speed
  const greenSlopeOn = useMemo(() => loadCaddieSettings().greenSlope, []);
  const missMapOn = useMemo(() => loadCaddieSettings().missMap, []);
  const [showMiss, setShowMiss] = useState(missMapOn);
  // Green slope: automatic from 120 m before the green (Sascha, 13.10.2026), or any time with the "Green" button.
  // null = automatic; true/false = the player switched it on or off on this hole.
  const [showGreen, setShowGreen] = useState<boolean | null>(null);
  // map camera: follows the player unless he zoomed or panned himself (then a button centres it again)
  const [camByHand, setCamByHand] = useState(false);
  const [recenter, setRecenter] = useState(0);
  useEffect(() => setShowGreen(null), [i]); // a green opened on the last hole does not follow to the next tee
  const carryBag = useMemo(() => withPartials(loadCarryBag() ?? DEFAULT_CARRY), []); // with the wedges' partial swings
  // Own tendency per club (≥ 5 tracked shots) – the caddie aims against it.
  const tendency = useMemo(() => new Map(clubDispersion(loadRounds().filter((r) => r.finishedAt)).filter((d) => d.shots >= 5).map((d) => [d.club, d.sideMean])), []);
  const caddieSettings = useMemo(() => loadCaddieSettings(), []);
  // Hidden by the player until the caddie has something new to say (new hole, new shot, new warning).
  // The caddie card opens only on a tap; new advice shows as a dot on the caddie button ("!" with a warning).
  const [caddieOpen, setCaddieOpen] = useState(false);
  const [seenSig, setSeenSig] = useState<string | null>(null);
  useEffect(() => setCaddieOpen(false), [i]); // every hole starts with the map
  const [notes, setNotes] = useState(() => loadHoleNotes(round.courseId));
  // Lie of the ball for the next shot, set by the player; valid for this spot only (sig of hole + 25 m step).
  const [pinSheet, setPinSheet] = useState(false);
  const [scoreSheet, setScoreSheet] = useState(false); // quick score + putts over the map
  // Green heights for the putt read and the best leave (feature 024), loaded on demand per course.
  const [grids, setGrids] = useState<Record<string, GreenGrid> | null>(null);
  useEffect(() => {
    let alive = true;
    if (loadCaddieSettings().greenSlope) loadGreenGrids(round.courseId).then((g) => alive && setGrids(g));
    return () => {
      alive = false;
    };
  }, [round.courseId]);
  // The ball on the green: tapped by the player (per hole), else the GPS position when standing on the green.
  const [puttBall, setPuttBall] = useState<{ hole: number; pos: LngLat } | null>(null);
  const greenCache = useRef<{ key: string; putt: PuttRead | null; leave: string | null }>({ key: '', putt: null, leave: null });
  const [lieSet, setLieSet] = useState<{ sig: string; lie: LieKind } | null>(null);
  const spokenSig = useRef<string | null>(null);
  const loggedSig = useRef<string | null>(null);
  // Heights of tee, green and player (for "plays shorter, downhill"); rounded positions keep requests rare.
  const [hts, setHts] = useState<Record<string, number | null>>({});
  const htKey = (p: LngLat) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  // The height grid is 90 m: the player's position is snapped to ~50 m, so walking does not fetch a height every 10 m.
  const snap = (p: LngLat): LngLat => [Math.round(p[0] * 2000) / 2000, Math.round(p[1] * 2000) / 2000];
  const playerKey = player ? htKey(snap(player.pos)) : '';
  useEffect(() => {
    if (!mapData) return;
    const pts: LngLat[] = [mapData.tee, mapData.greenCenter, ...(player ? [snap(player.pos)] : [])];
    let alive = true;
    heights(pts).then((h) => alive && setHts((old) => ({ ...old, ...Object.fromEntries(pts.map((p, k) => [htKey(p), h[k]])) })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData, playerKey]);
  const heightAt = (p: LngLat) => hts[htKey(p)] ?? hts[htKey(snap(p))] ?? null;

  const switchImagery = () => {
    const next = imageryChoices[(imageryChoices.indexOf(imagery) + 1) % imageryChoices.length];
    setImageryPref(next.id);
    saveImagery(next.id);
  };

  // Moved on to the next hole without a score on the last one: score and putts are what the round check needs to
  // find the shots – one tap back to enter them.
  const left = detected && detected.to === i && detected.to > detected.from ? round.entries[me.id][detected.from] : null;
  const leftEmpty = left != null && !left.pickedUp && (left.strokes == null || left.putts == null);
  const detectedBanner = detected && detected.to === i && (
    <div className="map-hint detected">
      {leftEmpty ? (
        <>
          <span>
            {left!.strokes == null
              ? tr(`Hole ${hole.label} · score for ${round.holes[detected.from].label} missing`, `Loch ${hole.label} · Score für ${round.holes[detected.from].label} fehlt`)
              : tr(`Hole ${hole.label} · putts for ${round.holes[detected.from].label} missing`, `Loch ${hole.label} · Putts für ${round.holes[detected.from].label} fehlen`)}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              goTo(detected.from);
              setView('score');
            }}
          >
            {tr('Enter', 'Eintragen')}
          </button>
        </>
      ) : (
        <>
          <span>{tr(`Hole ${hole.label} detected by GPS`, `Loch ${hole.label} per GPS erkannt`)}</span>
          <button type="button" className="btn-ghost" onClick={() => goTo(detected.from)}>
            {tr('Undo', 'Rückgängig')}
          </button>
        </>
      )}
    </div>
  );

  // ---------- Detailed tracking (feature 003) ----------
  const detailMode = round.mode === 'detail';
  const detail: DetailEntry = myEntry.detail ?? emptyDetail();
  const pinPos: LngLat | null = plans[i]?.pin ?? mapData?.greenCenter ?? null;
  const [sheet, setSheet] = useState<{ kind: 'shot'; index: number | null; pos: LngLat | null } | { kind: 'green'; pos: LngLat | null } | null>(null);
  const [placing, setPlacing] = useState<'shot' | 'green' | null>(null);
  const [sun, setSunState] = useState(isSun);
  // After saving: a short buzz and a few seconds to take it back (a wrong tap with a glove).
  const [undo, setUndo] = useState<{ text: string; detail: DetailEntry; putts: number | null; hole: number } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const confirmSaved = (text: string) => {
    setUndo({ text, detail, putts: myEntry.putts, hole: i });
    try {
      navigator.vibrate?.(25);
    } catch {
      /* not supported (iPhone) */
    }
  };
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
    .map((s, k) => (s.pos ? { pos: s.pos, label: `${k + 1}${s.club ? ' ' + clubCode(s.club) : ''}${lengths[k] != null ? ' · ' + fmtU(lengths[k]!) : ''}${s.penalty ? ' +1' : ''}` } : null))
    .filter((t): t is { pos: LngLat; label: string } => t != null);
  if (detail.onGreen) track.push({ pos: detail.onGreen, label: myEntry.putts != null ? `${myEntry.putts} Putt${myEntry.putts === 1 ? '' : 's'}` : tr('green', 'Grün'), green: true });

  let sheetEl: JSX.Element | null = null;
  if (sheet?.kind === 'shot') {
    const editing = sheet.index != null;
    const n = editing ? sheet.index! + 1 : detail.shots.length + 1;
    const existing = editing ? detail.shots[sheet.index!] : null;
    const pos = existing ? existing.pos : sheet.pos;
    const toPin = pos && pinPos ? distanceM(pos, pinPos) : null;
    sheetEl = (
      <ShotSheet
        title={tr(`Shot ${n}`, `Schlag ${n}`) + (toPin != null ? tr(` · ${fmtU(toPin)} ${unit} to pin`, ` · ${fmtU(toPin)} ${unit} zur Fahne`) : '')}
        lie={existing?.lie ?? (pos && mapData ? lieAt(pos, mapData, n === 1) : n === 1 ? 'tee' : 'fairway')}
        club={existing ? existing.club : suggestClub(hole.par || 4, n === 1, toPin ?? (hole.par >= 4 ? 300 : 150), bag)}
        bag={bag}
        penalty={existing?.penalty ?? false}
        penaltyKind={existing?.penaltyKind}
        kind={existing?.kind}
        toPinM={toPin}
        editing={editing}
        onCancel={() => setSheet(null)}
        onSave={(v) => {
          const shots = detail.shots.slice();
          if (editing) shots[sheet.index!] = { ...shots[sheet.index!], ...v };
          else shots.push({ pos: sheet.pos, ...v });
          confirmSaved(tr(`Shot ${n}${v.club ? ' · ' + clubCode(v.club) : ''} saved`, `Schlag ${n}${v.club ? ' · ' + clubCode(v.club) : ''} gespeichert`));
          saveDetail({ ...detail, shots });
          setSheet(null);
        }}
        onDelete={editing ? () => { saveDetail({ ...detail, shots: detail.shots.filter((_, k) => k !== sheet.index) }); setSheet(null); } : undefined}
        onHoledOut={
          editing
            ? undefined
            : () => {
                confirmSaved(tr('Holed out – saved', 'Eingelocht – gespeichert'));
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
        title={tr(`On the green · after ${detail.shots.length} shot${detail.shots.length === 1 ? '' : 's'}`, `Auf dem Grün · nach ${detail.shots.length} ${detail.shots.length === 1 ? 'Schlag' : 'Schlägen'}`)}
        firstPuttM={firstPuttM(d)}
        read={grids?.[hole.label] && d.onGreen && pinPos ? (readPutt(grids[hole.label], d.onGreen, pinPos)?.text ?? null) : null}
        unit={unit}
        fmt={fmtU}
        putts={myEntry.putts}
        onCancel={() => setSheet(null)}
        onSave={(putts) => {
          confirmSaved(tr(`${putts} putt${putts === 1 ? '' : 's'} saved`, `${putts} Putt${putts === 1 ? '' : 's'} gespeichert`));
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
    const teeAim = teeAimFor({ data: mapData, par: hole.par, pin: plans[i]?.pin ?? mapData.greenCenter, bag: carryBag, conditions, tendency, ...terrain, note: notes[hole.label] ?? {}, style: caddieSettings.style, favourite: caddieSettings.favourite, playing: me.playingHandicap });
    const plan = plans[i] ?? { targets: teeAim && distanceM(teeAim.pos, mapData.greenCenter) > 60 ? [teeAim.pos] : [], pin: null };
    const pin = plan.pin ?? mapData.greenCenter;
    const onHole = player != null && distToLine(player.pos, mapData.line) < ON_HOLE_M;
    // really playing this hole (not on the next fairway or in the clubhouse): for the camera, the shot lengths and
    // the caddie log
    const onThisHole = player != null && distToLine(player.pos, mapData.line) <= 60;
    const shotButtons = detailMode && MANUAL_SHOTS;
    const from = onHole ? player!.pos : mapData.tee;
    // Without a mapped green outline (player-set green) only the centre distance is known.
    const green = mapData.green ? greenFrontBack(from, mapData.green) : { front: null, center: distanceM(from, mapData.greenCenter), back: null };
    const setPlan = (patch: Partial<{ targets: LngLat[]; pin: LngLat | null }>) => setPlans({ ...plans, [i]: { ...plan, ...patch } });
    const fmt = (m: number) => formatDistance(m, unit);
    /** Pin of the day on a 3 × 3 grid: depth front/middle/back × left/centre/right (thirds of the green). */
    const pinAt = (depth: -1 | 0 | 1, side: -1 | 0 | 1): LngLat => {
      // front/back as on a pin sheet: seen from where the green is played (not from the tee – doglegs)
      const origin = approachFrom(mapData);
      const g = greenFrontBack(origin, mapData.green!);
      const along = depth < 0 ? -(g.center - g.front) * 0.6 : depth > 0 ? (g.back - g.center) * 0.6 : 0;
      const b = bearingDeg(origin, mapData.greenCenter);
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
      // Green shown: a tap on the green puts the ball there for the putt read.
      if (greenVisible && grid && mapData.green && (pointInRing(p, mapData.green) || distanceM(p, mapData.greenCenter) < 15) && onThisGreen(grid, p)) {
        setPuttBall({ hole: i, pos: p });
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
    const strokesShown = myEntry.pickedUp ? 'PU' : String(myEntry.strokes ?? hole.par);
    // Targets the player has walked past or reached (e.g. the tee shot's landing zone) are hidden; they stay in the plan.
    // The caddie's own tee target (not moved by the player) is for the tee shot only: gone once the player left the tee.
    const autoTeeTarget = (t: LngLat) => !plans[i] && teeAim != null && distanceM(t, teeAim.pos) < 3 && onThisHole && distanceM(from, mapData.tee) > 40;
    const passed = (t: LngLat) => onHole && !round.preview && (distanceM(t, pin) > distanceM(from, pin) - 5 || distanceM(t, from) < 30 || autoTeeTarget(t));
    const passedTargets = plan.targets.filter(passed);
    const shownTargets = plan.targets.filter((t) => !passed(t));
    // Automatic shot length: from the last place the player stood (or the tee) to here – no tapping needed.
    const autoLen = onThisHole && player && !round.preview ? autoShot(loadTrack(round.id), mapData, player.pos) : null;
    // from where the player stood on the tee (GPS), else the tee of the map
    const teeDist = onThisHole && player && !round.preview ? distanceM(teeSpot(loadTrack(round.id), mapData) ?? mapData.tee, player.pos) : null;
    const fromTee = teeDist != null && teeDist >= 20 ? teeDist : null;
    // ---------- AI caddie ----------
    const teeShot = !onHole || distanceM(from, mapData.tee) < 30;
    const note: HoleNote = notes[hole.label] ?? {};
    const lieSig = `${i}|${Math.round(distanceM(from, pin) / 25)}`;
    // Green slope when the player is on or next to the green (or planning from the sofa).
    const slope = greenSlopeOn ? geometry.greenSlopes?.[hole.label] : undefined;
    const nearGreen = distanceM(from, mapData.greenCenter) <= 40 || (round.preview === true && hole.par === 3);
    const greenAuto = distanceM(from, mapData.greenCenter) <= GREEN_AUTO_M || nearGreen;
    const greenVisible = nearGreen || (showGreen ?? greenAuto);
    const chart = greenSlopeOn ? GREEN_CHARTS[round.courseId]?.[hole.label] : undefined;
    // Green chart on screen: keep the view free (caddie folded, no hint).
    // Only around the green (≤ 40 m) – on the approach the caddie stays at hand next to the green chart.
    const greenFocus = chart != null && greenVisible && nearGreen;
    const green_ = slope && greenVisible ? readGreen(slope, bearingDeg(from, pin)) : null;
    const grid = grids?.[hole.label] ?? null;
    const gpsBall = player && onHole && grid && distanceM(player.pos, mapData.greenCenter) <= 25 && onThisGreen(grid, player.pos)
        ? ([Math.round(player.pos[0] * 1e5) / 1e5, Math.round(player.pos[1] * 1e5) / 1e5] as LngLat) // ~1 m: GPS jitter does not re-roll the putt
        : null;
    const ball = puttBall?.hole === i ? puttBall.pos : gpsBall;
    // Rolling a putt takes a moment – computed once per ball, pin and hole.
    const leaveFrom = !nearGreen && distanceM(from, pin) <= 230 ? from : null;
    const gKey = `${i}|${grid ? 1 : 0}|${ball?.join(',')}|${pin.join(',')}|${leaveFrom ? Math.round(bearingDeg(leaveFrom, pin) / 15) : '-'}`;
    if (greenCache.current.key !== gKey) {
      greenCache.current = {
        key: gKey,
        putt: grid && ball && greenVisible ? readPutt(grid, ball, pin) : null,
        leave: grid && leaveFrom ? (bestLeave(grid, pin, leaveFrom, mapData.green)?.text ?? null) : null,
      };
    }
    const putt = greenVisible ? greenCache.current.putt : null;
    const puttAim = putt && ball ? move(pin, bearingDeg(ball, pin) + 90, putt.aimCm / 100) : null;
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
          leave: greenCache.current.leave,
          playing: me.playingHandicap,
          grid,
          greenText: putt ? putt.text : green_ ? (green_.level === 'flat' ? tr('The green is almost flat.', 'Das Grün ist fast flach.') : tr(`${green_.level} slope, ${green_.text}.`, `${levelName(green_.level)} Neigung, ${green_.text}.`)) : null,
        })
      : null;
    // Heights for the green box: terrain model along the hole, else the coarse elevation service.
    const tH = (p: LngLat) => (distToLine(p, mapData.line) <= 40 ? terrainHeight(geometry.fairwaySlopes?.[hole.label], profileAlong(mapData, p)) : null);
    const fromH = tH(from) ?? heightAt(from);
    const greenH = tH(mapData.greenCenter) ?? heightAt(mapData.greenCenter);
    const slopeToGreen = fromH != null && greenH != null ? greenH - fromH : null;
    const miss = showMiss ? missMap(mapData, pin, plan.targets[0] ?? null) : undefined;

    // Something new to say = new hole, other club, new warning, or the player moved on (≈ 25 m steps).
    const caddieSig = cad ? `${i}|${cad.advice.club}${cad.advice.swing ?? ''}|${cad.warning ?? ''}|${cad.ap.kind}|${Math.round(cad.pl.distance / 25)}` : '';
    const caddieShown = cad != null && !greenFocus && caddieOpen;
    const caddieNews = cad != null && !greenFocus && !caddieOpen && seenSig !== caddieSig;
    const toggleCaddie = () => {
      setSeenSig(caddieSig);
      setCaddieOpen(!caddieShown);
    };
    if (caddieSettings.voice && cad != null && !greenFocus && spokenSig.current !== caddieSig && !round.preview) {
      spokenSig.current = caddieSig;
      const said = summary(cad!.facts);
      // read the setting again: the player may have muted the caddie in the meantime
      setTimeout(() => loadCaddieSettings().voice && speak(said), 300);
    }
    // Keep what the caddie advised on the course – the round check shows it again for the player's verdict.
    // only standing (by the ball, on the tee) – what the caddie says while the player walks is not advice for a shot
    if (cad != null && onThisHole && player?.still && !round.preview && loggedSig.current !== caddieSig) {
      loggedSig.current = caddieSig;
      recordCaddie(round.id, i, {
        t: Date.now(),
        pos: from,
        toPin: Math.round(distanceM(from, pin)),
        club: clubCode(cad.advice.club) + swingMark(cad.advice.swing),
        playsLike: Math.round(cad.pl.playsLike),
        aim: cad.aim,
        plan: cad.holePlan || null,
        warning: cad.warning,
      });
    }

    return (
      <main className="map-screen">
        <HoleMap
          camera={
            onThisHole && !round.preview && distanceM(player!.pos, mapData.tee) > 40
              ? { from: player!.pos, key: `${i}:${Math.round(player!.pos[0] * 6000)},${Math.round(player!.pos[1] * 9000)}` } // a new view every ~12 m
              : null
          }
          recenter={recenter}
          onUserCamera={setCamByHand}
          credit={greenSource(round.courseId, GREEN_CHARTS[round.courseId] != null)}
          holeKey={`${round.id}-${i}`}
          data={mapData}
          player={player?.pos ?? null}
          from={from}
          pin={pin}
          targets={shownTargets}
          unit={unit}
          imagery={imagery}
          track={detailMode ? track : undefined}
          missMap={miss}
          aimPoint={null}
          greenChart={chart && greenVisible ? { url: chart.file, corners: chart.corners, roomy: !greenFocus } : null}
          putt={putt && ball ? { ball, line: putt.path, aim: Math.abs(putt.aimCm) >= 5 ? puttAim : null } : null}
          greenSlope={!chart && slope && green_ && green_.level !== 'flat' ? { pos: mapData.greenCenter, downDeg: slope.downDeg, label: levelName(green_.level, true) } : undefined}
          onTargetsChange={(targets) => setPlan({ targets: [...passedTargets, ...targets] })}
          onPinChange={(p) => setPlan({ pin: p })}
          onTargetRemove={(index) => setPlan({ targets: plan.targets.filter((t) => t !== shownTargets[index]) })}
          onMapTap={tapMap}
        />

        <div className="map-top">
          <button type="button" className="map-btn round" aria-label={tr('Pause round', 'Runde pausieren')} onClick={props.onExit}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className="map-hole">
            <span className="map-hole-no">{hole.label}</span>
            <span>Par {hole.par || '?'} · Hcp {hole.strokeIndex || '?'}</span>
          </div>
          {detailMode && !round.preview && (
            <button type="button" className="map-btn map-score-chip" onClick={() => setView('score')} aria-label={tr(`Score ${strokesShown ?? '–'}, tap to edit`, `Score ${strokesShown ?? '–'}, antippen zum Ändern`)}>
              <span className="small">Score</span>
              <strong className={myEntry.strokes == null && !myEntry.pickedUp ? 'placeholder' : undefined}>{strokesShown ?? '–'}</strong>
            </button>
          )}
          <button type="button" className="map-btn round" aria-pressed={sun} aria-label={sun ? tr('Sun mode off', 'Sonnenmodus aus') : tr('Sun mode on', 'Sonnenmodus an')} onClick={() => { setSun(!sun); setSunState(!sun); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
          </button>
          <button type="button" className="map-btn round" aria-label={tr('Scorecard', 'Scorekarte')} onClick={() => props.onShowScorecard(round)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
          </button>
        </div>

        {imageryChoices.length > 1 && (
          <button type="button" className="map-btn map-imagery" onClick={switchImagery} aria-label={tr(`Satellite image: ${imagery.label}, tap to switch`, `Satellitenbild: ${imagery.label}, antippen zum Wechseln`)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
          </button>
        )}

        {weather && (
          <WeatherBadge weather={weather} holeBearing={bearingDeg(mapData.tee, mapData.greenCenter)} below={imageryChoices.length > 1} />
        )}

        <div className="map-green" aria-label={tr('Distance to the green', 'Distanz zum Grün')}>
          {green.back != null && (
            <>
              <span className="small">{tr('Back', 'Hinten')}</span>
              <span className="map-green-num">{fmt(green.back)}</span>
            </>
          )}
          <span className="small">{tr('Center', 'Mitte')}</span>
          <span className="map-green-num big">{fmt(green.center)}</span>
          {green.front != null && (
            <>
              <span className="small">{tr('Front', 'Vorne')}</span>
              <span className="map-green-num">{fmt(green.front)}</span>
            </>
          )}
          {slopeToGreen != null && Math.abs(slopeToGreen) >= 2 && (
            <span className="map-slope-chip">
              {tr(
                `Green ${Math.abs(Math.round(slopeToGreen))} m ${slopeToGreen < 0 ? 'lower' : 'higher'}`,
                `Grün ${Math.abs(Math.round(slopeToGreen))} m ${slopeToGreen < 0 ? 'tiefer' : 'höher'}`,
              )}
              <br />
              {tr('plays like', 'spielt wie')} {fmt(green.center + slopeToGreen)}
            </span>
          )}
          {/* Distances follow the GPS position on the hole; elsewhere (at home, no signal) they count from the tee – say why. */}
          <span className={`map-from${onHole ? '' : ' off'}`}>
            {onHole ? `GPS ±${Math.round(player!.accuracy)} m` : player ? tr('from tee · GPS not on the course', 'ab Abschlag · GPS nicht am Platz') : tr('from tee · no GPS', 'ab Abschlag · kein GPS')}
          </span>
        </div>

        {scoreSheet && (
          // Score and putts in two taps, without leaving the map (they tell the round check how many shots to find).
          <div className="sheet-backdrop" onClick={() => setScoreSheet(false)}>
            <section className="sheet score-sheet" role="dialog" aria-label={tr('Score on this hole', 'Score an diesem Loch')} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>
                  {tr('Hole', 'Loch')} {hole.label} · Par {hole.par}
                </strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setScoreSheet(false)}>
                  ✕
                </button>
              </div>
              <div className="field">
                <label>{tr('Strokes', 'Schläge')}</label>
                <Segmented<number>
                  label={tr('Strokes', 'Schläge')}
                  value={myEntry.strokes}
                  onChange={(v) => {
                    update(me.id, { strokes: v, pickedUp: false });
                    if (v != null && myEntry.putts != null) setScoreSheet(false);
                  }}
                  options={[...new Set([...[-1, 0, 1, 2, 3].map((d) => (hole.par || 4) + d), ...(myEntry.strokes != null ? [myEntry.strokes] : [])])]
                    .filter((n) => n >= 1)
                    .sort((a, b) => a - b)
                    .map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
              <div className="field">
                <label>Putts</label>
                <Segmented<number>
                  label="Putts"
                  value={myEntry.putts}
                  onChange={(v) => {
                    update(me.id, { putts: v });
                    if (v != null && myEntry.strokes != null) setScoreSheet(false);
                  }}
                  options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))}
                />
              </div>
              <div className="score-sheet-foot">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setScoreSheet(false);
                    setView('score');
                  }}
                >
                  {tr('Penalties, fairway …', 'Strafschläge, Fairway …')}
                </button>
                <button type="button" className="btn-primary" onClick={() => setScoreSheet(false)}>
                  {tr('Done', 'Fertig')}
                </button>
              </div>
            </section>
          </div>
        )}
        {pinSheet && mapData.green && (
          <div className="sheet-backdrop" onClick={() => setPinSheet(false)}>
            <section className="sheet" role="dialog" aria-label={tr('Pin position today', 'Fahnenposition heute')} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>{tr('Where is the pin today?', 'Wo steckt die Fahne heute?')}</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPinSheet(false)}>
                  ✕
                </button>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {tr(
                  'Seen from the fairway – back of the green at the top. You can also drag the flag on the map.',
                  'Vom Fairway aus gesehen – hinterer Grünteil oben. Du kannst die Fahne auch auf der Karte ziehen.',
                )}
              </p>
              <div className="pin-grid" role="group" aria-label={tr('Pin position', 'Fahnenposition')}>
                {([1, 0, -1] as const).flatMap((depth) =>
                  ([-1, 0, 1] as const).map((side) => {
                    const name = tr(
                      `${depth > 0 ? 'Back' : depth < 0 ? 'Front' : 'Middle'}${side < 0 ? ' left' : side > 0 ? ' right' : depth === 0 ? '' : ' centre'}`,
                      `${depth > 0 ? 'Hinten' : depth < 0 ? 'Vorne' : 'Mitte'}${side < 0 ? ' links' : side > 0 ? ' rechts' : depth === 0 ? '' : ' Mitte'}`,
                    );
                    return (
                      <button
                        key={`${depth}${side}`}
                        type="button"
                        aria-label={`${tr('Pin', 'Fahne')} ${name.toLowerCase()}`}
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
          {!greenFocus && gpsError && !round.preview && (
            <div className="map-hint gps-hint">
              <span>{gpsError}</span>
              <button type="button" className="btn-ghost" onClick={() => setGpsTry((n) => n + 1)}>
                {tr('Try again', 'Erneut versuchen')}
              </button>
            </div>
          )}
          {detectedBanner}
          {offlineHint}
          <div className="map-tools">
            {camByHand && (
              <button type="button" className="map-btn round tool" aria-label={tr('Centre the map again', 'Karte wieder zentrieren')} title={tr('Centre', 'Zentrieren')} onClick={() => setRecenter((n) => n + 1)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="6.5" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
                </svg>
              </button>
            )}
            {detailMode && (
              <button type="button" className="map-btn round tool" aria-label={tr('Add a target on the map', 'Ziel auf der Karte hinzufügen')} title={tr('Target', 'Ziel')} onClick={addTarget} disabled={plan.targets.length >= MAX_TARGETS}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="13" r="6.5" />
                  <path d="M11 4.5v3M11 18.5v3M2.5 13h3M16.5 13h3" />
                  <path d="M19 2v6M16 5h6" strokeWidth="2.2" />
                </svg>
              </button>
            )}
            {(slope || chart) && !nearGreen && (
              <button type="button" className="map-btn round tool" aria-pressed={greenVisible} aria-label={greenVisible ? tr('Hide green slope', 'Grün-Neigung ausblenden') : tr('Show green slope', 'Grün-Neigung zeigen')} title={tr('Green slope', 'Grün-Neigung')} onClick={() => setShowGreen(!greenVisible)}>
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
              <button type="button" className="map-btn round tool" aria-label={tr("Set today's pin position", 'Fahnenposition von heute setzen')} title={tr('Pin position', 'Fahnenposition')} onClick={() => setPinSheet(true)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <ellipse cx="12" cy="18" rx="9" ry="3.6" fill="currentColor" opacity="0.35" />
                  <path d="M11 18V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M11.5 4h6.5l-2 2.5 2 2.5h-6.5z" fill="#FF6B5E" />
                  <circle cx="11" cy="18" r="1.4" fill="currentColor" />
                </svg>
              </button>
            )}
            {missMapOn && (
              <button type="button" className="map-btn round tool" aria-pressed={showMiss} aria-label={showMiss ? tr('Hide where not to miss', 'Fehlschlag-Karte ausblenden') : tr('Show where not to miss', 'Zeigen, wo ich nicht verfehlen darf')} title={tr('Where not to miss', 'Wo nicht verfehlen')} onClick={() => setShowMiss(!showMiss)}>
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
                aria-label={
                  caddieShown
                    ? tr('Hide caddie', 'Caddie ausblenden')
                    : caddieNews
                      ? cad?.warning
                        ? tr('Show caddie – warning', 'Caddie zeigen – Warnung')
                        : tr('Show caddie – new advice', 'Caddie zeigen – neuer Hinweis')
                      : tr('Show caddie', 'Caddie zeigen')
                }
                title={tr('AI caddie', 'KI-Caddie')}
                onClick={toggleCaddie}
              >
                {caddieNews && <span className={`tool-badge${cad?.warning ? ' warn' : ''}`} aria-hidden="true">{cad?.warning ? '!' : ''}</span>}
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
          {putt && !(detailMode && holeDone) ? (
            <div className="map-hint detected putt-read" style={{ color: 'var(--text)' }}>
              <span>
                {putt.text} <span className="muted small">{tr('(approx.)', '(ca.)')}</span>
              </span>
            </div>
          ) : (
            green_ && (
              <div className="map-hint detected" style={{ color: 'var(--text)' }}>
                <span>
                  {green_.level === 'flat' ? tr('Green: almost flat', 'Grün: fast flach') : tr(`Green: ${green_.level} slope · ${green_.text}`, `Grün: ${levelName(green_.level)} Neigung · ${green_.text}`)}{' '}
                  <span className="muted small">{grid ? tr('· tap your ball for the putt', '· tippe auf deinen Ball für den Putt') : tr('(approx.)', '(ca.)')}</span>
                </span>
              </div>
            )
          )}
          {caddieShown && cad && (
            <CaddieCard
              facts={cad.facts}
              lines={cad.lines}
              alt={cad.alt}
              onHide={toggleCaddie}
              note={note}
              holeLabel={hole.label}
              clubCode={clubCode(cad.advice.club) + swingMark(cad.advice.swing)}
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
              {tr('Shot', 'Schlag')} <strong>{fmt(distanceM(shotStart, player.pos))} {unit}</strong>
            </div>
          )}
          {/* Always the whole way from the tee to here (Sascha, 13.10.2026: stops – e.g. with a cart – must not
              restart it); the last shot only as a small addition when one was recognised after the tee shot. */}
          {!shotStart && fromTee != null && (
            <div className="map-shot">
              {tr('From tee', 'Vom Abschlag')} <strong>{fmt(fromTee)} {unit}</strong>
              {autoLen && !autoLen.fromTee && (
                <span className="map-shot-last">
                  {tr('last shot', 'letzter Schlag')} {fmt(autoLen.length)} {unit}
                </span>
              )}
            </div>
          )}
          {!shotStart && fromTee == null && live.lastShot != null && (
            <div className="map-shot">
              {tr('Last shot', 'Letzter Schlag')} <strong>{fmt(live.lastShot)} {unit}</strong>
            </div>
          )}
          {placing && (
            <div className="map-hint detected">
              <span>{placing === 'shot' ? tr(`Tap where shot ${detail.shots.length + 1} was hit from`, `Tippe, wo Schlag ${detail.shots.length + 1} gespielt wurde`) : tr('Tap where your ball is on the green', 'Tippe, wo dein Ball auf dem Grün liegt')}</span>
              <button type="button" className="btn-ghost" onClick={() => setPlacing(null)}>
                {tr('Cancel', 'Abbrechen')}
              </button>
            </div>
          )}
          {undo && undo.hole === i && !placing && (
            <div className="map-hint detected" role="status">
              <span>✓ {undo.text}</span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  saveDetail(undo.detail, undo.putts);
                  setUndo(null);
                }}
              >
                {tr('Undo', 'Rückgängig')}
              </button>
            </div>
          )}
          {shotButtons ? (
            <div className="map-nav detail">
              <button type="button" className="map-btn round" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => goTo(i - 1)} disabled={i === 0}>
                ←
              </button>
              {holeDone ? (
                <button type="button" className="map-btn primary" onClick={() => goTo(i + 1)}>
                  {tr('Done', 'Fertig')} · {myEntry.strokes} → {i === round.holes.length - 1 ? tr('finish', 'beenden') : tr('next', 'weiter')}
                </button>
              ) : (
                <button type="button" className="map-btn primary" onClick={() => (onHole ? openAt('shot', player!.pos) : setPlacing('shot'))}>
                  {detail.shots.length === 0 ? tr('Tee shot', 'Abschlag') : tr(`Shot ${detail.shots.length + 1}`, `Schlag ${detail.shots.length + 1}`)} {onHole ? tr('from here', 'von hier') : tr('· tap map', '· Karte antippen')}
                </button>
              )}
              <button
                type="button"
                className="map-btn"
                disabled={detail.shots.length === 0 || detail.holedOut}
                onClick={() => (detail.onGreen ? openAt('green', detail.onGreen) : onHole ? openAt('green', player!.pos) : setPlacing('green'))}
              >
                {detail.onGreen ? 'Putts' : tr('Green', 'Grün')}
              </button>
              <button type="button" className="map-btn round primary" aria-label={i === round.holes.length - 1 ? tr('Finish round', 'Runde beenden') : tr('Next hole', 'Nächstes Loch')} onClick={() => goTo(i + 1)}>
                →
              </button>
            </div>
          ) : (
          <div className="map-nav with-target">
            <button type="button" className="map-btn round" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => goTo(i - 1)} disabled={i === 0}>
              ←
            </button>
            <button type="button" className="map-btn" onClick={addTarget} disabled={shownTargets.length >= MAX_TARGETS} aria-label={tr('Add a target on the map', 'Ziel auf der Karte hinzufügen')}>
              {tr('+ Target', '+ Ziel')}
            </button>
            {round.preview ? (
              <span className="map-score">
                <span className="small">{tr('Preview', 'Vorschau')}</span>
                <strong>
                  {i + 1}/{round.holes.length}
                </strong>
              </span>
            ) : (
              <button type="button" className="map-score" onClick={() => (hasShots ? setView('score') : setScoreSheet(true))}>
                <span className="small">Score</span>
                {/* nothing entered yet: par in grey, as a suggestion – entered values in full colour */}
                <strong className={myEntry.strokes == null && !myEntry.pickedUp ? 'placeholder' : undefined}>{strokesShown}</strong>
                {myEntry.putts != null && <span className="small">{myEntry.putts} Putt{myEntry.putts === 1 ? '' : 's'}</span>}
              </button>
            )}
            <button type="button" className="map-btn round primary" aria-label={i === round.holes.length - 1 ? tr('Finish round', 'Runde beenden') : tr('Next hole', 'Nächstes Loch')} onClick={() => goTo(i + 1)}>
              →
            </button>
          </div>
          )}
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
        backLabel={tr('Pause round', 'Runde pausieren')}
        right={
          <>
            <button type="button" className="icon-btn" aria-label={mapData ? tr('Hole map', 'Lochkarte') : tr('Set up hole map', 'Lochkarte einrichten')} onClick={() => setView('map')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
                <path d="M9 4v14M15 6v14" />
              </svg>
            </button>
            <button type="button" className="icon-btn" aria-label={tr('Scorecard', 'Scorekarte')} onClick={() => props.onShowScorecard(round)}>
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
          <span className="eyebrow">{tr(`Hole ${i + 1} of ${round.holes.length}`, `Loch ${i + 1} von ${round.holes.length}`)}</span>
          <div className="hole-no">{hole.label}</div>
        </div>
        <button
          type="button"
          className="hole-meta"
          style={{ background: 'none', border: 0, padding: '6px 0', cursor: 'pointer' }}
          aria-expanded={editHole}
          aria-label={tr('Edit par and stroke index of this hole', 'Par und Hcp dieses Lochs bearbeiten')}
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
          {tr('Set up hole map (tee + green)', 'Lochkarte einrichten (Abschlag + Grün)')}
        </button>
      )}

      {(needsData || editHole) && (
        <section className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong>{needsData ? tr('Missing course data – please complete once:', 'Platzdaten fehlen – bitte einmal ergänzen:') : tr('Correct par / stroke index (saved for this course):', 'Par / Hcp korrigieren (wird für diesen Platz gespeichert):')}</strong>
          <div className="row">
            <span>Par</span>
            <Stepper compact label="Par" value={hole.par || null} placeholder={4} min={3} onChange={(v) => fixHole({ par: v })} />
          </div>
          <div className="row">
            <span>{tr('Stroke index', 'Hcp (Lochvorgabe)')}</span>
            <Stepper compact label={tr('Stroke index', 'Hcp')} value={hole.strokeIndex || null} placeholder={9} min={1} onChange={(v) => fixHole({ strokeIndex: Math.min(18, v) })} />
          </div>
          {mapData && (
            <button type="button" className="btn-ghost" onClick={() => setSetupOpen(true)}>
              {tr('Hole map wrong? Mark tee and green again', 'Lochkarte falsch? Abschlag und Grün neu markieren')}
            </button>
          )}
        </section>
      )}

      {detailMode && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row">
            <span className="row-label">{tr('Shots', 'Schläge')}</span>
            <span className="muted small">{hasShots && shotsComplete(detail) ? tr('Strokes, fairway, penalties and bunker come from the shots', 'Schläge, Fairway, Strafschläge und Bunker ergeben sich aus den Schlägen') : MANUAL_SHOTS ? tr('Track shot by shot on the map, or enter the score below', 'Erfasse Schlag für Schlag auf der Karte oder trage unten den Score ein') : tr('Enter the score below – the shots come from the GPS track, check them after the round', 'Trag unten den Score ein – die Schläge kommen aus der GPS-Spur, du prüfst sie nach der Runde')}</span>
          </div>
          {hasShots && (
            <ol className="shot-list">
              {detail.shots.map((sh, k) => (
                <li key={k}>
                  <span className="n">{k + 1}</span>
                  <span>
                    <strong>{sh.club ? clubCode(sh.club) : '–'}</strong> <span className="muted">· {lieName(sh.lie)}{sh.penalty ? tr(' · +1 penalty', ' · +1 Strafschlag') : ''}</span>
                  </span>
                  <span className="muted">{lengths[k] != null ? `${fmtU(lengths[k]!)} ${unit}` : ''}</span>
                  <button type="button" className="icon-btn" aria-label={tr(`Edit shot ${k + 1}`, `Schlag ${k + 1} bearbeiten`)} onClick={() => setSheet({ kind: 'shot', index: k, pos: sh.pos })}>
                    ✎
                  </button>
                </li>
              ))}
              {detail.holedOut && <li><span className="n">⛳</span><span>{tr('Holed out', 'Eingelocht')}</span><span /><span /></li>}
            </ol>
          )}
          <div className="nav-bottom" style={{ gridTemplateColumns: hasShots ? '1fr 1fr' : '1fr' }}>
            <button type="button" className="btn-secondary" onClick={() => setSheet({ kind: 'shot', index: null, pos: null })} disabled={detail.holedOut}>
              {tr('+ Add shot', '+ Schlag hinzufügen')}
            </button>
            {hasShots && (
              <button
                type="button"
                className="btn-secondary btn-danger"
                onClick={() => {
                  if (window.confirm(tr(`Delete all ${detail.shots.length} shots of this hole?`, `Alle ${detail.shots.length} Schläge dieses Lochs löschen?`))) update(me.id, { detail: undefined, strokes: null, putts: null });
                }}
              >
                {tr('Clear shots', 'Schläge löschen')}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row">
          <span className="row-label">{me.name} · {tr('Strokes', 'Schläge')}</span>
          {myEntry.pickedUp ? (
            <span className="badge warn">{tr('Picked up', 'Aufgehoben')}</span>
          ) : hasShots && shotsComplete(detail) ? (
            <span className="num" style={{ font: '700 28px var(--display)' }}>{myEntry.strokes ?? '…'}</span>
          ) : (
            <Stepper label={tr('Strokes', 'Schläge')} value={myEntry.strokes} placeholder={hole.par || 4} min={1} onChange={(v) => update(me.id, { strokes: v })} />
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
            {hole.par >= 4 && `Fairway: ${myEntry.fairway ? fairwayName(myEntry.fairway) : '–'} · `}
            {tr('Penalties', 'Strafschläge')}: {myEntry.penalties}
            {myEntry.greensideBunker && tr(` · Greenside bunker${myEntry.upAndDown ? ' – sand save ✓' : ''}`, ` · Grünbunker${myEntry.upAndDown ? ' – Sand Save ✓' : ''}`)}
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
                { value: 'left', label: tr('← Left', '← Links') },
                { value: 'hit', label: tr('Hit', 'Getroffen') },
                { value: 'right', label: tr('Right →', 'Rechts →') },
              ]}
            />
          </div>
        )}

        {!hasShots && (
          <>
            <div className="row">
              <span className="row-label">{tr('Penalties', 'Strafschläge')}</span>
              <Stepper compact label={tr('Penalties', 'Strafschläge')} value={myEntry.penalties} min={0} onChange={(v) => update(me.id, { penalties: v })} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="toggle"
                aria-pressed={myEntry.greensideBunker}
                onClick={() => update(me.id, { greensideBunker: !myEntry.greensideBunker, upAndDown: null })}
              >
                {myEntry.greensideBunker ? '✓' : '○'} {tr('Greenside bunker', 'Grünbunker')}
              </button>
              {myEntry.greensideBunker && (
                <div className="field">
                  <label>{tr('Up & down from the bunker?', 'Up & Down aus dem Bunker?')}</label>
                  <Segmented<string>
                    label={tr('Up and down', 'Up & Down')}
                    value={myEntry.upAndDown == null ? null : myEntry.upAndDown ? 'yes' : 'no'}
                    onChange={(v) => update(me.id, { upAndDown: v == null ? null : v === 'yes' })}
                    options={[
                      { value: 'yes', label: tr('Yes', 'Ja') },
                      { value: 'no', label: tr('No', 'Nein') },
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
          {myEntry.pickedUp ? '✓' : '○'} {tr('Picked up (0 points)', 'Aufgehoben (0 Punkte)')}
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
                    <span className="badge warn">{tr('Picked up', 'Aufgehoben')}</span>
                  ) : (
                    <Stepper compact label={tr(`${p.name} strokes`, `${p.name} Schläge`)} value={e.strokes} placeholder={hole.par || 4} min={1} onChange={(v) => update(p.id, { strokes: v })} />
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={e.pickedUp ? tr(`${p.name}: undo picked up`, `${p.name}: Aufheben rückgängig`) : tr(`${p.name}: picked up`, `${p.name}: aufgehoben`)}
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
          <div className="muted small">{tr('Gross', 'Brutto')}</div>
        </div>
        <div>
          <div className="num">{totals.holesPlayed ? formatToPar(totals.toPar) : '–'}</div>
          <div className="muted small">{tr('To par', 'Zu Par')}</div>
        </div>
        <div>
          <div className="num">{totals.stableford ?? '–'}</div>
          <div className="muted small">Stableford</div>
        </div>
      </section>

      <span className="spacer" />
      <div className="nav-bottom">
        <button type="button" className="btn-secondary" onClick={() => goTo(i - 1)} disabled={i === 0}>
          {tr('← Back', '← Zurück')}
        </button>
        <button type="button" className="btn-primary" onClick={() => goTo(i + 1)}>
          {i === round.holes.length - 1 ? tr('Finish round', 'Runde beenden') : tr(`Next · hole ${round.holes[i + 1].label}`, `Weiter · Loch ${round.holes[i + 1].label}`)}
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
    <div className={`map-weather${props.below ? ' below' : ''}`} aria-label={tr(`${Math.round(w.tempC)} degrees, wind ${Math.round(w.windKmh)} km/h, ${rel.label}`, `${Math.round(w.tempC)} Grad, Wind ${Math.round(w.windKmh)} km/h, ${rel.label}`)}>
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
