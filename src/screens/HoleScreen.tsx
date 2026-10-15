import { useEffect, useMemo, useRef, useState } from 'react';
import type { DetailEntry, HoleEntry, LngLat, Round } from '../types';
import { deriveFromShots, emptyDetail, shotsComplete, firstPuttM, lieAt, lieName, onGreenAt, shotLengths, suggestClub } from '../lib/shots';
import { GreenSheet, ShotSheet } from '../components/ShotSheet';
import { commitParAt, greenInRegulation, handicapStrokes, playerTotals, playing18 } from '../lib/scoring';
import { playerBag } from '../lib/stats';
import { autoShot, loadTrack, recordFix, teeSpot } from '../lib/track';
import { PositionFilter } from '../lib/gpsfilter';
import { recordCaddie } from '../lib/caddielog';
import { loadCachedCourse, loadGeometry, loadImagery, loadLive, loadRounds, loadOfflineStamp, loadUnit, saveHoleCorrection, saveHoleLine, saveLive, saveOfflineStamp } from '../lib/storage';
import { holeTileUrls, prefetchTiles } from '../lib/prefetch';
import { pickImagery, type ImageryId } from '../lib/imagery';
import { loadForecast, loadWeather, weatherIcon, windOnHole, type Forecast, type Weather } from '../lib/weather';
import { DEFAULT_CARRY, levelName, readGreen, type LieKind } from '../lib/caddie';
import { clubDispersion } from '../lib/dispersion';
import { heights } from '../lib/elevation';
import { gridHeight, loadTerrainGrid, type TerrainGrid } from '../lib/terraingrid';
import { missMap } from '../lib/missmap';
import { GREEN_CHARTS } from '../data/greenCharts';
import { greenSource } from '../data/greenSources';
import { loadHoleNotes, saveHoleNote, type HoleNote } from '../lib/holenotes';
import { speak, summary } from '../lib/caddietalk';
import { CaddieCard } from '../components/CaddieCard';
import { holeBook } from '../lib/holebook';
import { courseStats } from '../lib/history';
import { isSun, setSun } from '../lib/theme';
import { holeForTee } from '../lib/teeline';
import { bestLeave, loadGreenGrids, onThisGreen, readPutt, setGreenSpeed, type GreenGrid, type PuttRead } from '../lib/greenread';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { move } from '../lib/aimpoint';
import { loadCaddieSettings, loadCarryBag } from '../lib/storage';
import { bearingDeg, detectHole, distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, pointInRing, type Unit, approachFrom } from '../lib/geo';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { HoleMap } from '../components/HoleMap';
import { ScoreSheet } from '../components/ScoreSheet';
import { PuttEditor } from '../components/PuttEditor';
import { LeaderboardSheet } from '../components/Leaderboard';
import { isTeamRound } from '../lib/games';
import { HoleSetup } from '../components/HoleSetup';
import { clubCode, tr } from '../lib/i18n';
import { swingMark, withPartials } from '../lib/partials';
import { FairwayPicker } from '../components/FairwayPicker';
import { HoleDrawer } from '../components/HoleDrawer';

const fairwayName = (f: string) => (f === 'ob' ? tr('out of bounds', 'Aus') : tr(f, ({ left: 'links', hit: 'getroffen', right: 'rechts' } as Record<string, string>)[f] ?? f));

/** Beyond this distance from the hole the app measures from the tee (planning at home or on another hole). */
const ON_HOLE_M = 1500;
/** 2D view: what is drawn beside the hole (Sascha 15.10.2026: 60 m). */
const CORRIDOR_2D = 60;
/** The parts of the course outline within `max` metres of the hole line (the out-of-bounds line along this hole only). */
function nearRuns(rings: LngLat[][], line: LngLat[], max: number): LngLat[][] {
  const out: LngLat[][] = [];
  for (const ring of rings) {
    let run: LngLat[] = [];
    for (const p of ring) {
      if (distToLine(p, line) <= max) run.push(p);
      else {
        if (run.length >= 2) out.push(run);
        run = [];
      }
    }
    if (run.length >= 2) out.push(run);
  }
  return out;
}
/** Landing points the player can plan per hole (e.g. drive, layup, approach). */
// Shots are not logged by hand on the map any more (Sascha, 13.10.2026): they come from the GPS track and are
// checked after the round. The code stays for Ben (spec 004 decides); false = the quick-mode buttons in every mode.
const MANUAL_SHOTS = false;

export function HoleScreen(props: {
  round: Round;
  onChange: (r: Round) => void;
  onExit: () => void; // pause: back to the start page, the round can be continued
  onEnd: (r: Round) => void; // finish now: saved with the holes played so far
  onAbort: (r: Round) => void; // cancel: the round is deleted
  /** `finishing`: past the last hole – the scorecard offers to save or delete; else just a look at the score. */
  onShowScorecard: (r: Round, finishing?: boolean) => void;
  /** From the hole overview: my bag or the caddie settings, back to this hole afterwards. */
  onOpenBag?: (part: 'bag' | 'caddie') => void;
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
  const goTo = (target: number, byGps = false, base: Round = round) => {
    setDetected(null);
    const committed = byGps ? base : commitPar(base);
    if (target >= round.holes.length) {
      props.onShowScorecard({ ...committed, currentHole: round.holes.length - 1 }, true);
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
  // the player's record per hole from earlier rounds here (course book, feature 012)
  const holeRecords = useMemo(() => new Map(courseStats(loadRounds(), round.courseName).holes.map((h) => [h.hole.label, h])), [round.courseName]);
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
    // the timer sleeps while the phone is locked: on unlocking (at the ball) the wind is fetched again if it is old
    const onVisible = () => document.visibilityState === 'visible' && get();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
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
  // score after the hole over the map (Hole19); 'next': opened by "→" without a score – done = on to the next hole
  const [scoreSheet, setScoreSheet] = useState<false | 'score' | 'next'>(false);
  const [puttEditor, setPuttEditor] = useState(false);
  const [hazardsOn, setHazardsOn] = useState(false); // distances to bunkers and water, on demand
  const [boardOpen, setBoardOpen] = useState(false); // live leaderboard of the flight
  const [drawerOpen, setDrawerOpen] = useState(false); // hole overview pulled up from the hole bar (Hole19)
  const barTouch = useRef<number | null>(null);
  // aerial image or the drawn hole (2D, as in BeBrassie) – kept for the next round
  const [view2d, setView2d] = useState(() => {
    try {
      return localStorage.getItem('golfos.mapview.v1') === '2d';
    } catch {
      return false;
    }
  });
  const toggleView = () => {
    setView2d(!view2d);
    try {
      localStorage.setItem('golfos.mapview.v1', view2d ? 'aerial' : '2d');
    } catch {
      /* storage blocked – this visit only */
    }
  };
  // Leaving the round (back arrow): pause, finish or cancel – so a round never stays "in progress" by accident.
  const [exitOpen, setExitOpen] = useState(false);
  const [exitConfirm, setExitConfirm] = useState<null | 'end' | 'abort'>(null);
  const askExit = () => (round.preview ? props.onExit() : setExitOpen(true));
  const closeExit = () => {
    setExitOpen(false);
    setExitConfirm(null);
  };
  const holesScored = round.entries[me.id].filter((e) => e.strokes != null || e.pickedUp).length;
  const exitEl = exitOpen && (
    <div className="sheet-backdrop" onClick={closeExit}>
      <section className="sheet" role="dialog" aria-label={tr('Leave the round', 'Runde verlassen')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{round.courseName}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={closeExit}>
            ✕
          </button>
        </div>
        {exitConfirm === null && (
          <div className="sheet-actions">
            <button type="button" className="btn-secondary" onClick={props.onExit}>
              {tr('Pause – continue later', 'Pausieren – später fortsetzen')}
            </button>
            <button type="button" className="btn-primary" onClick={() => setExitConfirm('end')}>
              {tr('Finish round', 'Runde beenden')}
            </button>
            <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(round)}>
              {tr('Cancel round', 'Runde abbrechen')}
            </button>
          </div>
        )}
        {exitConfirm === 'end' && (
          <>
            <span>
              {holesScored < round.holes.length
                ? tr(
                    `Finish now? ${holesScored} of ${round.holes.length} holes have a score – they are saved, the others stay empty.`,
                    `Jetzt beenden? ${holesScored} von ${round.holes.length} Löchern haben einen Score – sie werden gespeichert, die anderen bleiben leer.`,
                  )
                : tr('Finish and save the round?', 'Runde beenden und speichern?')}
            </span>
            <div className="sheet-actions">
              <button type="button" className="btn-primary" onClick={() => props.onEnd(round)}>
                {tr('Save & finish', 'Speichern & beenden')}
              </button>
              <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(round)}>
                {tr('Delete round', 'Runde löschen')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setExitConfirm(null)}>
                {tr('Back', 'Zurück')}
              </button>
            </div>
          </>
        )}
        {exitConfirm === 'abort' && (
          <>
            <span>{tr('Cancel and delete the round? Everything entered for it is lost.', 'Runde abbrechen und löschen? Alle Eingaben dieser Runde gehen verloren.')}</span>
            <div className="sheet-actions">
              <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(round)}>
                {tr('Delete round', 'Runde löschen')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setExitConfirm(null)}>
                {tr('Back', 'Zurück')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
  // Once per device: how the round check finds the shots (it depends on how the phone is used on the course).
  const [shotTip, setShotTip] = useState(() => {
    try {
      return !round.preview && localStorage.getItem('golfos.tip.shots.v1') == null;
    } catch {
      return false;
    }
  });
  // Safari keeps the scroll position of the page before (e.g. the scrolled start page): the full-screen map is then
  // drawn shifted against where taps land – start at the top (Sascha 15.10.2026: "OK did not close the hint").
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const closeShotTip = () => {
    setShotTip(false);
    try {
      localStorage.setItem('golfos.tip.shots.v1', '1');
    } catch {
      /* storage blocked – shown again next time */
    }
  };
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
  const loggedPutt = useRef<number | null>(null); // hole whose first putt read is in the caddie log
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
  // The course height grid (10 m from the 1 m terrain model) where there is one – exact also off the hole line.
  const [tgrid, setTgrid] = useState<TerrainGrid | null>(null);
  useEffect(() => {
    let alive = true;
    loadTerrainGrid(round.courseId).then((g) => alive && setTgrid(g));
    return () => {
      alive = false;
    };
  }, [round.courseId]);
  const heightAt = (p: LngLat) => (tgrid ? gridHeight(tgrid, p) : null) ?? hts[htKey(p)] ?? hts[htKey(snap(p))] ?? null;

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
  const bag = useMemo(() => playerBag(loadRounds().filter((r) => r.finishedAt), 3, loadCarryBag()?.map((b) => b.club) ?? null), []);
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
    // The caddie's spread model works with the 18-hole playing handicap; a 9-hole round carries the 9-hole value
    // (about half – right for Stableford), so it is doubled here.
    const caddiePlaying = playing18(round.holes.length, me.playingHandicap);
    const terrain = { slopes: geometry.fairwaySlopes?.[hole.label], boundary: geometry.boundary, trees: geometry.trees };
    // Par 4/5: target 1 is there from the start – the caddie's landing spot from the tee (driver carry, moved for
    // wind, slope and tendency, clear of trees). The player can drag or remove it; his own plan is kept then.
    const teeAim = teeAimFor({ data: mapData, par: hole.par, pin: plans[i]?.pin ?? mapData.greenCenter, bag: carryBag, conditions, tendency, ...terrain, note: notes[hole.label] ?? {}, style: caddieSettings.style, favourite: caddieSettings.favourite, playing: caddiePlaying });
    const plan = plans[i] ?? { targets: teeAim && distanceM(teeAim.pos, mapData.greenCenter) > 60 ? [teeAim.pos] : [], pin: null };
    // The flag stays on the green (Sascha 15.10.2026: it stood 50 m short on the fairway after a stray drag): a pin
    // off the green – dragged there or saved so – counts as not set.
    const pinOk = (p: LngLat) => (mapData.green ? pointInRing(p, mapData.green) || distToLine(p, mapData.green) <= 3 : distanceM(p, mapData.greenCenter) <= 25);
    const pin = plan.pin && pinOk(plan.pin) ? plan.pin : mapData.greenCenter;
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
      // A tap sets the target only when none is on screen; a target that is there moves only by dragging it – a stray
      // tap (or a tap landing beside a button) must not throw it off the hole (Sascha 15.10.2026).
      if (shownTargets.length === 0) setPlan({ targets: [p] });
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
    // The green slope only when the player asks for it (Sascha 15.10.2026: also on a par 3 the whole hole comes
    // first) – never by itself near the green.
    const greenVisible = showGreen === true;
    const chart = greenSlopeOn ? GREEN_CHARTS[round.courseId]?.[hole.label] : undefined;
    // Green chart on screen: keep the view free (caddie folded, no hint).
    // Only around the green (≤ 40 m) – on the approach the caddie stays at hand next to the green chart.
    const greenFocus = chart != null && greenVisible && nearGreen;
    const green_ = slope && greenVisible ? readGreen(slope, bearingDeg(from, pin)) : null;
    const grid = grids?.[hole.label] ?? null;
    // the course book's facts on this hole, also in the caddie (Sascha 15.10.2026)
    const book = holeBook({ data: mapData, slopes: geometry.fairwaySlopes?.[hole.label], greenSlope: geometry.greenSlopes?.[hole.label], grid, unit, record: holeRecords.get(hole.label) });
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
    // The first putt read of the hole goes into the caddie log too – the round check asks whether the line was right
    // (the data to calibrate green slopes and speed). Short putts need no read.
    if (putt && ball && !round.preview && loggedPutt.current !== i && distanceM(ball, pin) >= 2.5 && (puttBall?.hole === i || player?.still)) {
      loggedPutt.current = i;
      recordCaddie(round.id, i, { t: Date.now(), pos: ball, toPin: Math.round(distanceM(ball, pin)), club: 'Putt', playsLike: Math.round(distanceM(ball, pin)), aim: putt.text, plan: null, warning: null });
    }
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
          playing: caddiePlaying,
          grid,
          greenText: putt ? putt.text : green_ ? (green_.level === 'flat' ? tr('The green is almost flat.', 'Das Grün ist fast flach.') : tr(`${green_.level} slope, ${green_.text}.`, `${levelName(green_.level)} Neigung, ${green_.text}.`)) : null,
        })
      : null;
    const miss = showMiss ? missMap(mapData, pin, plan.targets[0] ?? null) : undefined;

    // Something new to say = new hole, other club, new warning, or the player moved on (≈ 25 m steps).
    const caddieSig = cad ? `${i}|${cad.advice.club}${cad.advice.swing ?? ''}|${cad.warning ?? ''}|${cad.ap.kind}|${Math.round(cad.pl.distance / 25)}` : '';
    const caddieShown = cad != null && caddieOpen; // the tool bar is the same on every hole (Sascha 15.10.2026)
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
    // not on the green itself: there the putt read is logged (a wedge "advice" from the green is no advice)
    const onTheGreen = mapData.green ? pointInRing(from, mapData.green) : distanceM(from, mapData.greenCenter) <= 10;
    if (cad != null && onThisHole && player?.still && !onTheGreen && !round.preview && loggedSig.current !== caddieSig) {
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
          // the state's aerial service does not answer: Esri for this visit (the choice stays as it is)
          onImageryFail={() => imagery.id !== 'esri' && setImageryPref('esri')}
          track={detailMode ? track : undefined}
          missMap={miss}
          aimPoint={null}
          greenChart={chart && greenVisible ? { url: chart.file, corners: chart.corners, roomy: !greenFocus && showGreen !== true, fit: showGreen === true && mapData.green ? mapData.green : undefined } : null}
          putt={putt && ball ? { ball, line: putt.path, aim: Math.abs(putt.aimCm) >= 5 ? puttAim : null } : null}
          greenSlope={!chart && slope && green_ && green_.level !== 'flat' ? { pos: mapData.greenCenter, downDeg: slope.downDeg, label: levelName(green_.level, true) } : undefined}
          onTargetsChange={(targets) => setPlan({ targets: [...passedTargets, ...targets] })}
          onPinChange={(p) => pinOk(p) && setPlan({ pin: p })}
          onTargetRemove={(index) => setPlan({ targets: plan.targets.filter((t) => t !== shownTargets[index]) })}
          onMapTap={tapMap}
          clean
          hazards={hazardsOn}
          view={view2d ? '2d' : 'aerial'}
          // 2D: only this hole and what lies up to 60 m beside it – water, woods, trees, hedges, paths, out of bounds
          // (Sascha 15.10.2026: "no neighbouring holes, only the hole I am on with the hazards left and right")
          trees={view2d ? [...(geometry.trees ?? []), ...(geometry.canopy ?? [])].filter((r) => r.some((q) => distToLine(q, mapData.line) <= CORRIDOR_2D)) : undefined}
          details={
            view2d
              ? {
                  treePoints: (geometry.treePoints ?? []).filter((q) => distToLine(q, mapData.line) <= CORRIDOR_2D),
                  treeRows: (geometry.treeRows ?? []).filter((l) => l.some((q) => distToLine(q, mapData.line) <= CORRIDOR_2D)),
                  paths: (geometry.paths ?? []).filter((l) => l.some((q) => distToLine(q, mapData.line) <= CORRIDOR_2D)),
                  rough: (geometry.rough ?? []).filter((r) => r.some((q) => distToLine(q, mapData.line) <= CORRIDOR_2D)),
                  ob: nearRuns(geometry.boundary ?? [], mapData.line, CORRIDOR_2D),
                  // the fairway of this hole as mown, read from the aerial image (OSM maps many only in part)
                  around: { fairway: geometry.fairwayAuto?.[hole.label] ?? [], tee: [], green: [], bunker: [], water: geometry.water.filter((r) => r.some((q) => distToLine(q, mapData.line) <= CORRIDOR_2D)) },
                }
              : undefined
          }
        />

        {/* the hole preview can always be left (Sascha 15.10.2026: the old arrow sat under the weather badge) */}
        {round.preview && (
          <button type="button" className="preview-exit" onClick={askExit}>
            ✕ {tr('End preview', 'Vorschau beenden')}
          </button>
        )}

        {weather && <WeatherBadge weather={weather} holeBearing={bearingDeg(mapData.tee, mapData.greenCenter)} below={false} />}

        {/* back, middle (large), front one below the other (Sascha 14.10.2026: clearer than one number) */}
        <div className="map-green stacked" aria-label={tr('Distance to the green', 'Distanz zum Grün')}>
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
          {/* only back, middle and front – the caddie card has "plays like" (Sascha 14.10.2026) */}
        </div>

        {/* the tools in one column on the right, as in Hole19: caddie, green slope, hazards, imagery, scorecard */}
        <div className="map-toolbar" role="toolbar" aria-label={tr('Map tools', 'Kartenwerkzeuge')}>
          {caddieOn && (
            <button
              type="button"
              className="map-tool"
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="8" y="9" width="8" height="12" rx="2.5" />
                <path d="M8 13h8" />
                <path d="M10 9V3.5M12.5 9V2.5M15 9V4" />
                <path d="M9 3.5h2M11.5 2.5h2.2M14 4h2" />
                <path d="M16 11c2.5 1 2.5 6 0 7" />
              </svg>
            </button>
          )}
          {(slope || chart) && (
            <button type="button" className="map-tool" aria-pressed={greenVisible} aria-label={greenVisible ? tr('Hide green slope', 'Grün-Neigung ausblenden') : tr('Show green slope', 'Grün-Neigung zeigen')} title={tr('Green slope', 'Grün-Neigung')}
              onClick={() => {
                // always onto the green with the slopes – also after the player moved the map himself (Sascha 15.10.2026)
                setShowGreen(!greenVisible);
                setRecenter((n) => n + 1);
              }}
            >
              {/* green slope: the green with the arrow of its fall line */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <ellipse cx="12" cy="13" rx="9.5" ry="6.5" />
                <path d="M7.5 10.5l8 4.5" />
                <path d="M15.5 15l-3.4.3M15.5 15l-1.4-3.1" />
              </svg>
            </button>
          )}
          {(mapData.bunkers.length > 0 || mapData.water.length > 0) && (
            <button type="button" className="map-tool" aria-pressed={hazardsOn} aria-label={hazardsOn ? tr('Hide hazard distances', 'Distanzen zu Hindernissen ausblenden') : tr('Show hazard distances', 'Distanzen zu Hindernissen zeigen')} title={tr('Hazards', 'Hindernisse')} onClick={() => setHazardsOn(!hazardsOn)}>
              {/* hazards: a bunker with the distance marks over it */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 17c1.6-2.6 4.6-4 8.5-4s6.9 1.4 8.5 4c-1.9 2-5 3-8.5 3s-6.6-1-8.5-3z" />
                <path d="M5 8h14M5 6v4M19 6v4" />
              </svg>
            </button>
          )}
          {missMapOn && (
            <button type="button" className="map-tool" aria-pressed={showMiss} aria-label={showMiss ? tr('Hide where not to miss', 'Fehlschlag-Karte ausblenden') : tr('Show where not to miss', 'Zeigen, wo ich nicht verfehlen darf')} title={tr('Where not to miss', 'Wo nicht verfehlen')} onClick={() => setShowMiss(!showMiss)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <circle cx="12" cy="12" r="4.5" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              </svg>
            </button>
          )}
          <button type="button" className="map-tool" aria-pressed={view2d} aria-label={view2d ? tr('Aerial image', 'Luftbild zeigen') : tr('Drawn hole (2D)', 'Gezeichnetes Loch (2D)')} title="2D" onClick={toggleView}>
            <span className="map-tool-text">2D</span>
          </button>
        </div>

        {exitEl}
        {scoreSheet && (
          <ScoreSheet
            hole={hole}
            players={round.players}
            entries={Object.fromEntries(round.players.map((p) => [p.id, round.entries[p.id][i]]))}
            toPar={Object.fromEntries(
              round.players.map((p) => {
                const t = playerTotals(round.holes, round.entries[p.id], p.playingHandicap);
                return [p.id, t.holesPlayed ? t.toPar : null];
              }),
            )}
            canPlacePutts={!round.preview && !isTeamRound(round)}
            team={isTeamRound(round)}
            onChange={update}
            onPlacePutts={() => setPuttEditor(true)}
            onClose={() => setScoreSheet(false)}
          />
        )}
        {boardOpen && <LeaderboardSheet round={round} onClose={() => setBoardOpen(false)} />}
        {drawerOpen && (
          <HoleDrawer
            round={round}
            current={i}
            view2d={view2d}
            hazards={hazardsOn}
            sun={sun}
            onGo={(k) => {
              setDrawerOpen(false);
              if (k !== i) goTo(k, true); // jumping to a hole writes no par for this one
            }}
            onClose={() => setDrawerOpen(false)}
            onToggle2d={toggleView}
            onToggleHazards={() => setHazardsOn(!hazardsOn)}
            onToggleSun={() => {
              setSun(!sun);
              setSunState(!sun);
            }}
            onBag={() => props.onOpenBag?.('bag')}
            onCaddie={() => props.onOpenBag?.('caddie')}
            onScorecard={() => props.onShowScorecard(round)}
            onLeaderboard={round.players.length > 1 ? () => { setDrawerOpen(false); setBoardOpen(true); } : null}
            onPause={props.onExit}
            onEnd={() => {
              setDrawerOpen(false);
              setExitOpen(true);
              setExitConfirm('end');
            }}
          />
        )}
        {puttEditor && myEntry.putts != null && myEntry.putts > 0 && (
          <PuttEditor
            title={tr(`Hole ${hole.label} · ${myEntry.putts} ${myEntry.putts === 1 ? 'putt' : 'putts'}`, `Loch ${hole.label} · ${myEntry.putts} Putt${myEntry.putts === 1 ? '' : 's'}`)}
            green={mapData.green}
            greenCenter={mapData.greenCenter}
            from={approachFrom(mapData)}
            pin={myEntry.puttsAt?.pin ?? pin}
            putts={myEntry.putts}
            balls={myEntry.puttsAt?.balls ?? null}
            ballOnGreen={player && mapData.green && pointInRing(player.pos, mapData.green) ? player.pos : null}
            onCancel={() => setPuttEditor(false)}
            onSave={(v) => {
              setPuttEditor(false);
              update(me.id, { puttsAt: v });
              setPlan({ pin: v.pin });
            }}
          />
        )}

        <div className={`map-bottom${scoreSheet ? ' with-panel' : ''}`}>
          {!scoreSheet && (
            <>
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
          {shotTip && !detectedBanner && (
            // a tap anywhere on the hint closes it (a small "OK" was missed on the iPhone, Sascha 15.10.2026)
            <div className="map-hint detected" role="button" tabIndex={0} onClick={closeShotTip}>
              <span>
                {tr('Shots are found after the round: at the ball glance at the phone, after each hole enter score and putts.', 'Die Schläge findet die App nach der Runde: am Ball kurz aufs Handy schauen, nach jedem Loch Score und Putts eintragen.')}
              </span>
              <button type="button" className="btn-ghost" onClick={(e) => { e.stopPropagation(); closeShotTip(); }}>
                OK
              </button>
            </div>
          )}
          {camByHand && (
            <div className="map-tools">
              <button type="button" className="map-btn round tool" aria-label={tr('Centre the map again', 'Karte wieder zentrieren')} title={tr('Centre', 'Zentrieren')} onClick={() => setRecenter((n) => n + 1)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="6.5" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
                </svg>
              </button>
            </div>
          )}
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
              book={book}
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
            </>
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
          <div
            className="hole-bar"
            onTouchStart={(e) => (barTouch.current = e.touches[0].clientY)}
            onTouchEnd={(e) => {
              if (barTouch.current != null && barTouch.current - e.changedTouches[0].clientY > 40 && !round.preview) setDrawerOpen(true);
              barTouch.current = null;
            }}
          >
            {!round.preview && (
              <button type="button" className="hole-bar-handle" aria-label={tr('Open the hole overview', 'Lochübersicht öffnen')} onClick={() => setDrawerOpen(true)}>
                <span />
              </button>
            )}
            <button type="button" className="hole-bar-arrow" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => goTo(i - 1)} disabled={i === 0}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button
              type="button"
              className="map-score"
              disabled={round.preview}
              aria-label={round.preview ? undefined : tr(`Hole ${hole.label}, score ${strokesShown} – tap to enter`, `Loch ${hole.label}, Score ${strokesShown} – antippen zum Eintragen`)}
              onClick={() => (hasShots ? setView('score') : setScoreSheet(scoreSheet ? false : 'score'))}
            >
              <span className="map-hole-no">{hole.label}</span>
              <span className="hole-bar-par">
                <span>Par {hole.par || '?'}</span>
                <span>
                  Hcp {hole.strokeIndex || '?'}
                  {/* strokes received on this hole – one yellow dot each, as on the scorecard */}
                  {received > 0 && !round.preview && (
                    <i className="hole-bar-dots" aria-label={tr(`${received} handicap ${received === 1 ? 'stroke' : 'strokes'} on this hole`, `${received} ${received === 1 ? 'Vorgabeschlag' : 'Vorgabeschläge'} auf diesem Loch`)}>
                      {'•'.repeat(Math.min(received, 3))}
                    </i>
                  )}
                </span>
              </span>
              {round.preview ? (
                <span className="hole-bar-score muted small">
                  {i + 1}/{round.holes.length}
                </span>
              ) : (
                <span className={`hole-bar-score${myEntry.strokes == null && !myEntry.pickedUp ? ' placeholder' : ''}`}>
                  {/* nothing entered yet: a dash, not the par (Sascha 14.10.2026: "par twice") */}
                  {myEntry.strokes == null && !myEntry.pickedUp ? '–' : strokesShown}
                  {myEntry.putts != null && <small>{myEntry.putts} P</small>}
                </span>
              )}
            </button>
            <button type="button" className="hole-bar-arrow" aria-label={i === round.holes.length - 1 ? tr('Finish round', 'Runde beenden') : tr('Next hole', 'Nächstes Loch')} onClick={() => (myEntry.strokes == null && !myEntry.pickedUp && !round.preview && !scoreSheet ? setScoreSheet('next') : goTo(i + 1))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
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
        onBack={askExit}
        backLabel={tr('Leave round', 'Runde verlassen')}
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
            <FairwayPicker value={myEntry.fairway} onChange={(v) => update(me.id, { fairway: v, ...(v === 'ob' ? { penalties: Math.max(1, myEntry.penalties ?? 0) } : {}) })} />
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
      {exitEl}
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
