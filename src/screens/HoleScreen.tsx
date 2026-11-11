import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PenGlyph } from '../components/Glyph';
import { ownDetailsOn, setOwnDetails } from '../lib/owndetails';
import { Avatar } from '../components/Avatar';
import { loadStrategy, savePlannedHole, type CourseStrategy } from '../lib/strategy';
import type { Club, DetailEntry, HoleEntry, LngLat, Round, Shot, TestEvent } from '../types';
import { atTheTee, deriveFromShots, emptyDetail, shotsComplete, firstPuttM, lieAt, lieName, onGreenAt, shotLengths, suggestClub } from '../lib/shots';
import { GreenSheet, ShotSheet } from '../components/ShotSheet';
import { commitParAt, emptyEntry, greenInRegulation, handicapStrokes, playerTotals, playing18 } from '../lib/scoring';
import { playerBag } from '../lib/stats';
import { SideBetSheet } from './Duels';
import { dayOf as poolDay } from '../lib/wagers';
import { addWatchFixes, autoShot, clubForLength, fixAt, lastFixBefore, loadTrack, recordFix, teeSpot } from '../lib/track';
import { DuelBar } from '../components/DuelBar';
import { feedFix, PositionFilter, sampleFix } from '../lib/gpsfilter';
import { isNative, watchPosition } from '../lib/native';
import { SpecialsAtHole } from '../components/Specials';
import { betLinked } from '../lib/betlinked';
import { ShotHereIcon } from '../components/RoundIcons';
import { recordCaddie } from '../lib/caddielog';
import { loadCachedCourse, loadGeometry, loadHoleLines, loadImagery, loadLive, loadRounds, loadOfflineStamp, loadUnit, saveHoleCorrection, saveHoleLine, saveLive, saveOfflineStamp } from '../lib/storage';
import { holeTileUrls, prefetchTiles } from '../lib/prefetch';
import { ensureCourseMap } from '../lib/courses';
import { IMAGERY, loadRegionalImagery, pickImagery, type ImageryId } from '../lib/imagery';
import { loadForecast, loadWeather, windOnHole, type Forecast, type Weather } from '../lib/weather';
import { WeatherIcon } from '../components/WeatherIcon';
import { adviseClub, clubName, DEFAULT_CARRY, levelName, readGreen, type LieKind } from '../lib/caddie';
import { clubDispersion } from '../lib/dispersion';
import { heights } from '../lib/elevation';
import { gridHeight, loadTerrainGrid, makeTerrainGrid, type TerrainGrid } from '../lib/terraingrid';
import { GREEN_CHARTS, type GreenChart } from '../data/greenCharts';
import { madeChartsFor, type MadeCharts } from '../lib/greenmaker';
import { greenSource } from '../data/greenSources';
import { hasNote, loadHoleNotes, saveHoleNote, type HoleNote } from '../lib/holenotes';
import { historyLines } from '../lib/holehistory';
import { clubReports } from '../lib/clubstats';
import { lineOfStored } from '../lib/holelines';
import { isSpeaking, onSpeaking, onSpeechDone, setMicPause, speak, summary } from '../lib/caddietalk';
import { addTestEvent, speechText } from '../lib/testlog';
import { CaddieCard, NotesSheet, TournamentCaddie } from '../components/CaddieCard';
import { hazardsAhead, holeBook } from '../lib/holebook';
import { listen, soundTestOn, type Listening } from '../lib/impact';
import { addWatchShot, onWatch, removeWatchShot, sendHole, sendRound, warmUpSwing, watchHoleFor, watchPlaceWins, watchReady, watchRound } from '../lib/watch';
import { RoundInviteSheet } from '../components/ShareRound';
import { fetchCourseLines, shareCourseLine } from '../lib/courselines';
import { cachedEvent, differences, exchangeRound, quietKeeper, setRetired, settle, shareLine, sharedLines, shareView, takeOver } from '../lib/sharedround';
import { myName } from '../components/ShareRound';
import { sharingAvailable } from '../lib/sharedgame';
import { courseStats } from '../lib/history';
import { holeForTee } from '../lib/teeline';
import { bestLeave, loadGreenGrids, onThisGreen, readPutt, setGreenSpeed, type GreenGrid, type PuttRead } from '../lib/greenread';
import { caddieAdvice, teeAimFor } from '../lib/caddieplan';
import { move } from '../lib/aimpoint';
import { clubSpread, spreadShape } from '../lib/spread';
import { loadCaddieSettings, loadCarryBag, newId } from '../lib/storage';
import { holdGeometry } from '../lib/storageguard';
import { woodsOf, landmarksOf, alongLine, lineLength, pointAt, bearingDeg, detectHole, distanceM, distToLine, formatDistance, greenFrontBack, holeMapData, pointInRing, type Unit, approachFrom } from '../lib/geo';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { HoleMap } from '../components/HoleMap';
import { pickUpAllowed, ScoreSheet } from '../components/ScoreSheet';
import { PuttEditor } from '../components/PuttEditor';
import { greenWalk } from '../lib/greenwalk';
import { LeaderboardSheet } from '../components/Leaderboard';
import { isTeamMode, isTeamRound, texasDrives } from '../lib/games';
import { HoleSetup } from '../components/HoleSetup';
import { clubCode, dec, getLang, tr } from '../lib/i18n';
import { swingMark, withPartials } from '../lib/partials';
import { FairwayPicker } from '../components/FairwayPicker';
import { HoleDrawer } from '../components/HoleDrawer';
import { statRounds } from '../lib/signing';
import { pushRound } from '../lib/push';
import { isLastHole, lastHole, nextHole, playPos, prevHole } from '../lib/holeorder';

const fairwayName = (f: string) => (f === 'ob' ? tr('out of bounds', 'Aus') : tr(f, ({ left: 'links', hit: 'getroffen', right: 'rechts' } as Record<string, string>)[f] ?? f));

/** Beyond this distance from the hole the app measures from the tee (planning at home or on another hole). */
const ON_HOLE_M = 15; // metres past the tee along the hole before the distances count from the player
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

/** The one-time tip how the shots are found – off: no introductions in the app (Sascha 16.10.2026). */
const SHOW_SHOT_TIP = false;

/** Whether the app is on screen – in the background iOS cuts running downloads. */
const onVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
};
function usePageVisible(): boolean {
  return useSyncExternalStore(onVisibility, () => document.visibilityState !== 'hidden', () => true);
}

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
  /** A game on the map (Games): its name and standing in a bar over the hole bar, opening the game sheet. */
  game?: {
    name: string;
    line: string;
    onOpen: () => void;
    onInvite: (() => void) | null;
    shared: string | null;
    /** the two sides on this hole – shown as two coloured teams (Sascha 16.10.2026: the teams "go under") */
    teams?: [{ name: string; me: boolean }[], { name: string; me: boolean }[]] | null;
    /** what the game enters (Sascha 02.11.2026: "only the strokes per hole – or with details"): 'strokes' – everyone the
     *  score with penalty strokes; 'details' (default) – the own card in full */
    entry?: 'strokes' | 'details';
    /** a shared game (Sascha 07.11.2026): the scores another phone enters – the player, the name of who does */
    keptBy?: Record<string, string>;
    /** "Einer für alle": the players who also enter their own details (by name – 07.11.2026) */
    ownDetails?: string[];
    /** every player in detail (a pool's round whose bets need the details of all – Sascha 02.11.2026) */
    detailsAll?: boolean;
    /** the putts of every player before the next hole – a bet on greens or putts counts them (Sascha 02.11.2026: "the
     *  putts a must; the next hole only once all putts are entered") */
    puttsRequired?: boolean;
    /** what the game's form needs on this hole, in the score entry (Sascha 08.11.2026) */
    extras?: import('react').ReactNode;
  };
  /** Course preview: the birdie book of the course, back to this hole afterwards. */
  onBook?: () => void;
}) {
  const { round } = props;
  const i = round.currentHole;
  const hole = round.holes[i];
  const me = round.players.find((p) => p.isMe)!;
  const others = round.players.filter((p) => !p.isMe);
  const touchX = useRef<number | null>(null);
  /** the holes the player went back to – each one's score sheet opens again on the way forward (Sascha 28.10.2026:
   *  two holes back and forward again – the first of them did not ask any more) */
  const revisit = useRef(new Set<number>());

  const entry = (playerId: string): HoleEntry => round.entries[playerId][i];

  const update = (playerId: string, patch: Partial<HoleEntry>) => {
    const list = round.entries[playerId].slice();
    list[i] = { ...list[i], ...patch };
    props.onChange({ ...round, entries: { ...round.entries, [playerId]: list } });
  };

  /** Strokes are pre-filled with par: leaving a hole commits par for players who did not change it. */
  const commitPar = (r: Round): Round => commitParAt(r, i);

  /** `byGps`: the GPS moved the round on – the player confirmed nothing, so no par is written for the last hole.
   *  Back to an earlier hole writes nothing either: the hole left is not played yet (Sascha 22.10.2026: back to a hole
   *  to correct its score, then forward again – the score sheet no longer opened, the unplayed hole had got par). */
  const goTo = (target: number, byGps = false, base: Round = round) => {
    if (target < 0) return;
    // forward and back in the order played – off tee 10: 10 … 18, then 1 … 9 (lib/holeorder, 04.11.2026); holes.length: finished
    const done = target >= round.holes.length;
    const back = !done && playPos(round, target) < playPos(round, i);
    const ahead = done || playPos(round, target) > playPos(round, i);
    // a bet counts the putts: on only with every player's putts (the GPS moving on is not held – its sheet asks anyway)
    const lacking = props.game?.puttsRequired && !byGps && ahead && !isTeamRound(base) ? base.players.filter((p) => { const e = base.entries[p.id]?.[i]; return !e?.pickedUp && e?.putts == null; }) : [];
    if (lacking.length) {
      setPuttsMissing(lacking.map((p) => p.name));
      setScoreSheet('next');
      return;
    }
    setPuttsMissing(null);
    setDetected(null);
    // a hole gone back to asks for its score again on the way forward (Sascha 27.10.2026)
    if (back) revisit.current.add(target);
    else revisit.current.delete(i); // the hole left forward is done with
    const committed = byGps || back ? base : commitPar(base);
    if (done) {
      props.onShowScorecard({ ...committed, currentHole: lastHole(round) }, true);
      return;
    }
    props.onChange({ ...committed, currentHole: target });
    setView('map'); // every new hole starts on the map
  };

  const goToRef = useRef(goTo);
  goToRef.current = goTo;

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
  // the holes other players set up on this course (12.11.2026): read once, the map gets them where it has none
  useEffect(() => {
    if (round.preview && !round.courseId) return;
    void fetchCourseLines(round.courseId).then((changed) => changed && setGeoVersion((v) => v + 1));
  }, [round.courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId, geoVersion]);
  // the course map gone (storage full, the round was finished then): it comes again (22.10.2026)
  useEffect(() => {
    ensureCourseMap(round.courseId).then((came) => came && setGeoVersion((v) => v + 1));
  }, [round.courseId]);
  // The hole from the tee the player chose (courses with tee data); the map line starts at one of the tees.
  const forTee = (d: ReturnType<typeof holeMapData>, label: string) => holeForTee(d, round.courseId, label, round.tee, geometry.tee);
  const woods = useMemo(() => woodsOf(geometry), [geometry]);
  const landmarks = useMemo(() => landmarksOf(geometry), [geometry]);
  const mapData = useMemo(() => forTee(holeMapData(geometry, hole.loop, hole.number), hole.label), [geometry, hole.loop, hole.number, round.tee]);
  // The map is the main view. A hole without a hole line opens the set-up on the map (Sascha 10.10.2026).
  const [view, setView] = useState<'map' | 'score'>('map');
  const [setupOpen, setSetupOpen] = useState(false);
  // "Nur Score eintragen" once (Sascha 08.11.2026, Celebration: the set-up came on every hole): the holes without a map
  // open on the score entry for the rest of the round – "Loch einrichten" up top still sets one up
  const scoreOnlyKey = `golfos.scoreonly.${round.id}`;
  const [scoreOnly, setScoreOnlyState] = useState(() => {
    try {
      return sessionStorage.getItem(scoreOnlyKey) === '1';
    } catch {
      return false;
    }
  });
  const setScoreOnly = (on: boolean) => {
    setScoreOnlyState(on);
    try {
      sessionStorage.setItem(scoreOnlyKey, on ? '1' : '0');
    } catch {
      /* private mode */
    }
  };
  // the course map on screen: it never makes room while the storage is full, whatever plays on it (a game, a bet)
  useEffect(() => holdGeometry(round.courseId), [round.courseId]);
  const [editHole, setEditHole] = useState(false);
  const [unit] = useState<Unit>(loadUnit);
  // the player's record per hole from earlier rounds here (course book, feature 012)
  const holeRecords = useMemo(() => new Map(courseStats(statRounds(loadRounds()), round.courseName).holes.map((h) => [h.hole.label, h])), [round.courseName]);
  // the player's strategy per hole from his rounds here – shown with the caddie (Sascha 22.10.2026)
  const holeHistories = useMemo(() => {
    const rs = statRounds(loadRounds());
    return new Map(round.holes.map((h) => [h.label, historyLines(rs, round.courseId, h.label)]));
  }, [round.courseId, round.holes]);
  const [imageryPref, setImageryPref] = useState<ImageryId | null>(loadImagery);
  const [player, setPlayer] = useState<{ pos: LngLat; accuracy: number; still?: boolean } | null>(null);
  const detectArmed = useRef(true); // the next good fix may move the round to the hole the player is on
  // the hole by GPS while open (07.11.2026): the last look, the hole found once, a move by GPS, a hole chosen by hand
  const lastLook = useRef(0);
  const seenOnce = useRef<number | null>(null);
  const byGps = useRef(false);
  const manualAt = useRef(0);
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
  const lastFix = useRef<{ pos: LngLat; accuracy: number; t: number; still?: boolean } | null>(null);
  // the watch's live place (10.11.2026): shown instead of the phone's while the phone lies elsewhere (in the cart)
  const watchFix = useRef<{ pos: LngLat; accuracy: number; t: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // Targets, pin and the marked ball survive a reload (iOS may drop the page while the phone is in the pocket).
  const [live, setLive] = useState(() => loadLive(round.id));
  useEffect(() => saveLive(round.id, live), [round.id, live]);
  const plans = live.plans;
  // the round plan of this course (Sascha 16.10.2026): targets and clubs per hole – made in "Plan round"
  const [strategy, setStrategy] = useState<CourseStrategy>(() => loadStrategy(round.courseId));
  const setPlans = (p: typeof plans) => setLive((l) => ({ ...l, plans: p }));
  // planning: a hole looked at counts as planned – the caddie's suggestion taken as it is (Sascha 16.10.2026: "nur 13
  // Löcher geplant, obwohl ich alle 18 geplant habe" – only moved targets or chosen clubs were saved)
  const planDefault = useRef<{ label: string; targets: LngLat[] } | null>(null);
  useEffect(() => {
    const d = planDefault.current;
    if (!round.planning || !d || strategy[d.label]) return;
    setStrategy(savePlannedHole(round.courseId, d.label, { targets: d.targets, clubs: [], at: new Date().toISOString() }));
  });
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
    // in the iOS app iOS's own watch: it goes on with the phone locked (Sascha 01.11.2026)
    const stop = watchPosition(
      (p) => {
        setGpsError(null);
        // Just unlocked: a fix from before the phone went into the pocket is the old place, not where the player stands
        // (only right after unlocking, so a phone with an odd GPS clock is never locked out).
        if (Date.now() - visibleAt.current < 5000 && p.timestamp < visibleAt.current - 10000) {
          // the app measured on in the pocket: a fix handed over late is still where the player was then – into the
          // track with its own time, only not shown
          if (isNative() && !round.preview) recordFix(round.id, { t: p.timestamp, p: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy });
          return;
        }
        const fix = filter.current.push({ pos: [p.coords.longitude, p.coords.latitude] as LngLat, accuracy: p.coords.accuracy, t: Date.now() });
        feedFix({ pos: [p.coords.longitude, p.coords.latitude], accuracy: p.coords.accuracy, t: p.timestamp });
        const was = shownFix.current;
        lastFix.current = fix;
        // only a real change is drawn – every fix goes into the track
        if (!watchPlaceWins(watchFix.current, fix) && (!was || distanceM(was.pos, fix.pos) >= 1 || Math.abs(was.accuracy - fix.accuracy) >= 3 || fix.t - was.t >= 3000 || was.still !== fix.still)) showFix(fix);
        // Every round keeps the GPS track (while the app is open, raw fixes): automatic shot length, shot detection.
        // only a fresh fix: right after unlocking, iOS may first hand out the old position (where the phone was put away)
        const open = reopened.current && p.coords.accuracy <= 30 && p.timestamp >= visibleAt.current - 2000;
        if (open) reopened.current = false;
        if (!round.preview) recordFix(round.id, { t: p.timestamp, p: [p.coords.longitude, p.coords.latitude], acc: p.coords.accuracy, ...(open ? { open: true } : {}) });
      },
      (err) => {
        if (err.code === 1) {
          setGpsError(
            isNative()
              ? tr(
                  'Location not allowed. iPhone: Settings → GolfOS → Location → “Always” and Precise Location on.',
                  'Standort nicht erlaubt. iPhone: Einstellungen → GolfOS → Standort → „Immer“ und „Genauer Standort“ an.',
                )
              : tr(
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
      stop();
    };
  }, [gpsTry]);

  // Phone back out of the pocket (or app opened): with the first good GPS fix, move to the hole the player is on.
  const allMaps = useMemo(() => round.holes.map((h) => forTee(holeMapData(geometry, h.loop, h.number), h.label)), [geometry, round.holes, round.tee]);
  // the maps as they are now – for the watch's swings, which come in an effect set up once
  const allMapsNow = useRef(allMaps);
  allMapsNow.current = allMaps;
  // warming up on the range before the round – a swing of the watch or a crack the phone heard (Sascha 09./10.11.2026:
  // the range's cracks at 11:27 and 11:47 were the phone's microphone): before the tee time, or away from every tee
  const warmUp = (r: Round, t: number, pos: LngLat | null, acc: number | null | undefined, manual = false) => {
    const fl = r.shared ? cachedEvent(r.shared.code) : null;
    const tt = fl?.flights[r.shared!.flight]?.teeTime;
    const teeTime = tt ? new Date(`${fl?.date ?? r.createdAt.slice(0, 10)}T${tt}:00`).getTime() : null;
    return warmUpSwing(r, { t, manual, acc }, { pos, tees: allMapsNow.current.map((m) => m?.tee), teeTime: Number.isFinite(teeTime) ? teeTime : null });
  };
  const warmText = (w: 'early' | 'away') => (w === 'early' ? tr('Warming up before the tee time – not counted', 'Einspielen vor der Startzeit – nicht gezählt') : tr('Away from the tees (range) – not counted', 'Weg vom Abschlag (Range) – nicht gezählt'));
  // green charts made on the phone for a course without built-in ones (below, with the green heights)
  const [made, setMade] = useState<{ m: MadeCharts; urls: Record<string, string> } | null>(null);
  const [making, setMaking] = useState<{ done: number; total: number } | null>(null);
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
  // the hole by GPS while the app stays open too (Sascha 07.11.2026: "automatic hole changes by GPS would be good") –
  // before only at the start and when the phone came out of the pocket: every 15 s a look, a new hole only when it is
  // found twice in a row (a ball beside the hole does not pull the round on); a hole chosen by hand is left alone for
  // three minutes
  // a look every 15 s also while standing still (the position may not change on a tee)
  const [gpsTick, setGpsTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && setGpsTick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, []);
  // a hole changed – by the GPS or by hand (the hole the round opened on is neither; the strict mode runs this twice)
  const shownHole = useRef(i);
  useEffect(() => {
    if (shownHole.current === i) return;
    shownHole.current = i;
    if (byGps.current) byGps.current = false;
    else manualAt.current = Date.now();
  }, [i]);
  useEffect(() => {
    if (!player || player.accuracy > 30 || setupOpen) return;
    const armed = detectArmed.current;
    if (!armed) {
      const now = Date.now();
      if (scoreSheet || now - lastLook.current < 15000 || now - manualAt.current < 3 * 60000) return;
      lastLook.current = now;
    }
    detectArmed.current = false;
    // holes left out: the tee of any later hole without a score takes the round there (Sascha 04.11.2026: 1, 2, 8, 9)
    const meP = round.players.find((p) => p.isMe) ?? round.players[0];
    const open = (k: number) => {
      const e = meP ? round.entries[meP.id]?.[k] : undefined;
      return e?.strokes == null && !e?.pickedUp;
    };
    const k = detectHole(player.pos, allMaps, i, { start: round.startHole, open });
    if (k == null) {
      seenOnce.current = null;
      return;
    }
    // while open: the same hole twice in a row before moving on
    if (!armed && seenOnce.current !== k) {
      seenOnce.current = k;
      return;
    }
    seenOnce.current = null;
    byGps.current = true;
    const gap = playPos(round, k) - playPos(round, i);
    // walked on to a later hole without a score for this one (Sascha 16.10.2026: "beim Weiterschalten sollte die
    // Erfassung des Scores aufklappen"): first this hole's score, then on to the hole the GPS found – not when holes
    // were left out on purpose (more than three on: the ones between are not played)
    if (gap > 0 && gap <= 3 && !round.preview && (scoreToAsk(i) || (!myScoreElsewhere && !scoreSeen.current.has(i)))) {
      setPendingHole(k);
      setScoreSheet('next');
      return;
    }
    goTo(k, true);
    setDetected({ from: i, to: k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, gpsTick]);

  const course = loadCachedCourse(round.courseId);
  const courseCenter: LngLat = course ? [course.lon, course.lat] : (mapData?.greenCenter ?? player?.pos ?? [0, 0]);
  // Best imagery for the course's country (e.g. Spanish national orthophoto) unless the player picked another one.
  const imagery = pickImagery(courseCenter, imageryPref);
  // a course in the USA: the state's or county's orthoimagery once its list is loaded (17.10.2026)
  const [, setImageryTick] = useState(0);
  useEffect(() => {
    loadRegionalImagery(courseCenter).then((found) => found && setImageryTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [`${courseCenter[0].toFixed(3)},${courseCenter[1].toFixed(3)}`]); // again once the course's position is known
  // a round on the course: the push function watches the forecast there for thunderstorms (final list, Sascha 23.10.2026)
  useEffect(() => {
    if (round.preview || round.finishedAt || (!courseCenter[0] && !courseCenter[1])) return;
    pushRound({ id: round.id, course: round.courseName, lat: courseCenter[1], lng: courseCenter[0] });
  }, [round.id, round.preview, !!round.finishedAt, `${courseCenter[0].toFixed(2)},${courseCenter[1].toFixed(2)}`]); // eslint-disable-line react-hooks/exhaustive-deps
  // Offline map: save the imagery of all holes of the round once (again after 30 days, or for another imagery source).
  const [offline, setOffline] = useState<{ done: number; total: number } | 'ready' | null>(null);
  // saved per course AND loops (Sascha 16.10.2026: "C much worse than A and B" – after an A+B round the course counted
  // as saved, so the C holes were never fetched and showed coarse tiles on a weak network)
  const offlineKey = round.loopOrder?.length ? `${round.courseId}.${[...round.loopOrder].sort().join('')}` : round.courseId;
  // the tiles to keep – the effect below starts again only when this list really changes (25.10.2026: a game's sync, a
  // new geometry or a saved score gave new hole objects, and every new object started the download from 0)
  const offlineUrls = useMemo(() => {
    const holes = allMaps.filter((m): m is NonNullable<typeof m> => m != null);
    if (holes.length === 0) return [];
    // the green charts and green heights of the course too, so the green read works without network (feature 028)
    const charts = Object.values(GREEN_CHARTS[round.courseId] ?? {}).map((c) => c.file);
    const extra = [...charts, ...(charts.length ? [charts[0].replace(/[^/]+$/, 'heights.json')] : [])];
    return [...holeTileUrls(imagery, holes), ...extra];
  }, [allMaps, imagery, round.courseId]);
  const urlsKey = `${offlineUrls.length}:${offlineUrls[0] ?? ''}:${offlineUrls[offlineUrls.length - 1] ?? ''}`;
  const urlsRef = useRef(offlineUrls);
  urlsRef.current = offlineUrls;
  const holesRef = useRef(allMaps);
  holesRef.current = allMaps;
  // tiles that arrived – a restart (the app was in the background, the list changed) goes on from there
  const offlineGot = useRef(new Set<string>());
  const visible = usePageVisible();
  useEffect(() => {
    const fresh = Date.now() - loadOfflineStamp(offlineKey, imagery.id) < 30 * 24 * 3600 * 1000;
    const urls = urlsRef.current;
    // without service worker nothing is kept (the iOS app: its own tile store); in the background iOS cuts the
    // downloads – go on when the app is back
    if (urls.length === 0 || fresh || !(navigator.serviceWorker?.controller || isNative()) || !visible) return;
    const ctrl = new AbortController();
    const got = offlineGot.current;
    const todo = urls.filter((u) => !got.has(u));
    const before = urls.length - todo.length;
    setOffline({ done: before, total: urls.length });
    const finish = (failed: number) => {
      // "saved ✓" only when it is (nearly) all there – else no promise; the next opening tries again
      if (failed < urls.length * 0.05) {
        saveOfflineStamp(offlineKey, imagery.id);
        setOffline('ready');
        setTimeout(() => setOffline(null), 4000);
      } else setOffline(null);
    };
    // the count at most twice a second (31.10.2026): each one drew the whole hole again – every mark on the map ~30 times
    // a second while the tiles came in
    let shownAt = 0;
    const progress = (done: number, total: number) => {
      if (ctrl.signal.aborted || (done < total && Date.now() - shownAt < 500)) return;
      shownAt = Date.now();
      setOffline({ done, total });
    };
    prefetchTiles(todo, (done) => progress(before + done, urls.length), ctrl.signal, (u) => got.add(u)).then(async (failed) => {
      if (ctrl.signal.aborted) return;
      // the state's service is down (LGL 25.10.2026: error pages instead of pictures): the map shows Esri then – keep Esri
      if (imagery.id !== 'esri' && failed > todo.length * 0.5) {
        const holes = holesRef.current.filter((m): m is NonNullable<typeof m> => m != null);
        const esri = holeTileUrls(IMAGERY.esri, holes).filter((u) => !got.has(u));
        setOffline({ done: 0, total: esri.length });
        await prefetchTiles(esri, (done) => progress(done, esri.length), ctrl.signal, (u) => got.add(u));
        if (!ctrl.signal.aborted) setOffline(null); // no stamp: the next opening tries the state's pictures again
        return;
      }
      finish(failed);
    });
    return () => {
      ctrl.abort();
      setOffline((o) => (o === 'ready' ? o : null)); // never a percentage left standing
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineKey, imagery.id, urlsKey, visible]);
  const offlineHint = making ? (
    <div className="map-shot">
      {tr('Working out the green slopes', 'Grün-Neigungen werden berechnet')} · {making.done}/{making.total}
    </div>
  ) : offline === 'ready' ? (
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
    if (weather && onThisHole && !myEntry.weather) update(me.id, { weather: { tempC: weather.tempC, windKmh: weather.windKmh, gustKmh: weather.gustKmh, windFromDeg: weather.windFromDeg } }); // gusts too: a shot's length as it played (Sascha 23.10.2026)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weather, onThisHole, i]);

  // ---------- AI caddie (feature 008) ----------
  const caddieOn = useMemo(() => loadCaddieSettings().caddie, []);
  // a tournament (Rule 4.3): no wind, no caddie advice, no green slopes – distances and the player's own notes only
  // (Sascha 18.10.2026)
  // … unless the tournament is an internal one with every function (Sascha 07.11.2026: "we play internal tournaments
  // and want to use everything") – set in its format
  const tournament = round.kind === 'tournament' && !round.format?.aids;
  useMemo(() => setGreenSpeed(loadCaddieSettings().greenSpeed), []); // putt reads at the chosen green speed
  const greenSlopeOn = useMemo(() => loadCaddieSettings().greenSlope && !tournament, []);
  // Green slope: automatic from 120 m before the green (Sascha, 13.10.2026), or any time with the "Green" button.
  // null = automatic; true/false = the player switched it on or off on this hole.
  const [showGreen, setShowGreen] = useState<boolean | null>(null);
  // map camera: follows the player unless he zoomed or panned himself (then a button centres it again)
  const [camByHand, setCamByHand] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recenter, setRecenter] = useState(0);
  useEffect(() => setShowGreen(null), [i]); // a green opened on the last hole does not follow to the next tee
  const carryBag = useMemo(() => withPartials(loadCarryBag() ?? DEFAULT_CARRY), []); // with the wedges' partial swings
  // Own tendency per club (≥ 5 tracked shots) – the caddie aims against it.
  const tendency = useMemo(() => new Map(clubDispersion(loadRounds().filter((r) => r.finishedAt)).filter((d) => d.shots >= 5).map((d) => [d.club, d.sideMean])), []);
  // Own corridor per club (≥ 5 checked shots): the caddie keeps water and out of bounds out of it (Sascha 22.10.2026)
  const clubReps = useMemo(() => new Map(clubReports(statRounds(loadRounds()), lineOfStored()).map((c) => [c.club, c] as const)), []);
  const corridor = useMemo(() => new Map([...clubReps.values()].flatMap((c) => (c.corridor ? [[c.club, { lo: c.corridor.lo, hi: c.corridor.hi }] as const] : []))), [clubReps]);
  const caddieSettings = useMemo(() => loadCaddieSettings(), []);
  // Hidden by the player until the caddie has something new to say (new hole, new shot, new warning).
  // The caddie card opens only on a tap; new advice shows as a dot on the caddie button ("!" with a warning).
  // closed in the course preview too (Sascha 21.10.2026, pre-final list: "the caddie off by default in the preview");
  // its hole notes are behind the caddie button, planning has its own "Hole note"
  const [caddieOpen, setCaddieOpen] = useState(false);
  const [seenSig, setSeenSig] = useState<string | null>(null);
  useEffect(() => setCaddieOpen(false), [i]); // every hole starts with the map
  const [planNoteOpen, setPlanNoteOpen] = useState(false);
  const [notes, setNotes] = useState(() => loadHoleNotes(round.courseId));
  // Lie of the ball for the next shot, set by the player; valid for this spot only (sig of hole + 25 m step).
  // score after the hole over the map (Hole19); 'next': opened by "→" without a score – done = on to the next hole
  const [scoreSheet, setScoreSheet] = useState<false | 'score' | 'next'>(false);
  const [puttsMissing, setPuttsMissing] = useState<string[] | null>(null); // who still lacks putts (props.game.puttsRequired)
  // the hole the GPS found while this one still needs its score – reached after the score sheet
  const [pendingHole, setPendingHole] = useState<number | null>(null);
  const onAfterScore = (entered: boolean) => {
    const k = pendingHole;
    const from = i;
    setPendingHole(null);
    if (k == null) return;
    goTo(k, !entered);
    // closed without a score: the reminder on the new hole stays ("Score für 2A fehlt · Eintragen")
    if (!entered) setDetected({ from, to: k });
  };
  useEffect(() => setScoreSheet(false), [i]); // on to the next hole: the sheet closes, the map shows (Sascha 15.10.2026)
  // the holes whose score entry was open on this phone (Sascha 28.10.2026: "the score entry does not always open when I
  // change hole" – a score from another phone of the game, or one entered on someone else's sheet, counted as done)
  // – kept on the phone per round: iOS starts the app anew in the pocket, a score entered here is not asked again
  const seenKey = `golfos.scoreseen.v1.${round.id}`;
  const scoreSeen = useRef<Set<number>>(null as unknown as Set<number>);
  if (!scoreSeen.current) {
    try {
      scoreSeen.current = new Set(JSON.parse(localStorage.getItem(seenKey) ?? '[]') as number[]);
    } catch {
      scoreSeen.current = new Set();
    }
  }
  useEffect(() => {
    if (!(scoreSheet || view === 'score') || scoreSeen.current.has(i)) return;
    scoreSeen.current.add(i);
    try {
      localStorage.setItem(seenKey, JSON.stringify([...scoreSeen.current]));
    } catch {
      // storage full – asked once more after a restart
    }
  }, [scoreSheet, view, i]);
  /** On to the next hole: a hole without a score first opens its score sheet ("→" and the swipe alike) – so does a
   *  hole whose score entry was not open on this phone yet, and a hole gone back to (Sascha 27.10.2026: "back a hole
   *  and forward again – the score entry should open again"), once: the next "→" goes on. A hole with shots opens its
   *  score page. */
  const forward = () => {
    if (pendingHole != null) return onAfterScore(true);
    const ask = !round.preview && !scoreSheet && (scoreToAsk(i) || (!myScoreElsewhere && (revisit.current.has(i) || !scoreSeen.current.has(i))));
    revisit.current.delete(i);
    if (!ask) return goTo(nextHole(round, i) ?? round.holes.length);
    if (hasShots) setView('score');
    else setScoreSheet('next');
  };
  const [puttEditor, setPuttEditor] = useState(false);
  const [hazardsOn, setHazardsOn] = useState(false); // distances to bunkers and water, on demand
  // the spread of the caddie's club on the map (Sascha 23.10.2026) – a map tool, remembered; on at first
  const [spreadOn, setSpreadOnState] = useState(() => {
    try {
      return localStorage.getItem('golfos.spread.v1') !== '0';
    } catch {
      return true;
    }
  });
  const [spreadClub, setSpreadClub] = useState<Club | null>(null); // a club picked for the spread – null: the caddie's
  const [spreadPick, setSpreadPick] = useState(false);
  useEffect(() => setSpreadClub(null), [i]); // each hole starts with the caddie's club again
  const setSpreadOn = (on: boolean) => {
    setSpreadOnState(on);
    try {
      localStorage.setItem('golfos.spread.v1', on ? '1' : '0');
    } catch {
      // storage full – the switch holds for this round
    }
  };
  const [boardOpen, setBoardOpen] = useState(false); // live leaderboard of the flight
  const [boardTab, setBoardTab] = useState<'board' | 'bets'>('board'); // its tab to open on
  // the round on several phones (Sascha 29.10.2026): invite the flight, or other flights to a tournament
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sideBetOpen, setSideBetOpen] = useState(false); // 5+5+10 as a side bet (Sascha 10.11.2026)
  // a bet counts this round: the marked player in detail too (Sascha 02.11.2026) – looked at when the sheet opens
  const withBets = useMemo(() => !round.preview && betLinked(round), [round.id, scoreSheet]); // eslint-disable-line react-hooks/exhaustive-deps
  const [canShareRound, setCanShareRound] = useState(false);
  useEffect(() => {
    if (!round.preview && !props.game) void sharingAvailable().then(setCanShareRound);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
      <section className="sheet" role="dialog" aria-label={(props.game ? tr('Leave the game', 'Spiel verlassen') : tr('Leave the round', 'Runde verlassen'))} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{round.courseName}</strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={closeExit}>
            ✕
          </button>
        </div>
        {exitConfirm === null && (
          // the action bar (docs/DESIGN.md, Sascha 03.11.2026) – cancelling red and last – then the one main button: finishing
          <div className="sheet-actions">
            <div className="sc-actions" role="group" aria-label={props.game ? tr('This game', 'Dieses Spiel') : tr('This round', 'Diese Runde')}>
                <button type="button" className="sc-action" aria-label={tr('Pause – continue later', 'Pausieren – später fortsetzen')} onClick={props.onExit}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 5v14M15 5v14" />
                  </svg>
                  <span>{tr('Pause', 'Pausieren')}</span>
                </button>
                  <button type="button" className="sc-action danger" aria-label={props.game ? tr('Cancel game', 'Spiel abbrechen') : tr('Cancel round', 'Runde abbrechen')} onClick={() => props.onAbort(round)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                  <span>{tr('Cancel', 'Abbrechen')}</span>
                </button>
              </div>
            <button type="button" className="btn-primary" onClick={() => setExitConfirm('end')}>
              {props.game ? tr('Finish game', 'Spiel beenden') : tr('Finish round', 'Runde beenden')}
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
                : (props.game ? tr('Finish the game and settle?', 'Spiel beenden und abrechnen?') : tr('Finish and save the round?', 'Runde beenden und speichern?'))}
            </span>
            <div className="sheet-actions">
              <div className="sc-actions" role="group" aria-label={tr('Or', 'Oder')}>
                <button type="button" className="sc-action" aria-label={tr('Back', 'Zurück')} onClick={() => setExitConfirm(null)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                  </svg>
                  <span>{tr('Back', 'Zurück')}</span>
                </button>
                  <button type="button" className="sc-action danger" aria-label={props.game ? tr('Delete game', 'Spiel löschen') : tr('Delete round', 'Runde löschen')} onClick={() => props.onAbort(round)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                  </svg>
                  <span>{tr('Delete', 'Löschen')}</span>
                </button>
                </div>
              <button type="button" className="btn-primary" onClick={() => props.onEnd(round)}>
                {tr('Save & finish', 'Speichern & beenden')}
              </button>
            </div>
          </>
        )}
        {exitConfirm === 'abort' && (
          <>
            <span>{props.game ? tr('Cancel and delete the game? You can restore it under "deleted" in Games.', 'Spiel abbrechen und löschen? In Games unter „gelöscht“ kannst du es wiederherstellen.') : tr('Cancel and delete the round? You can restore it under "Deleted rounds".', 'Runde abbrechen und löschen? Unter „Gelöschte Runden“ kannst du sie wiederherstellen.')}</span>
            <div className="sheet-actions">
              <button type="button" className="btn-secondary btn-danger" onClick={() => props.onAbort(round)}>
                {props.game ? tr('Delete game', 'Spiel löschen') : tr('Delete round', 'Runde löschen')}
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
  // Off since 17.10.2026: no introductions in the app (SHOW_SHOT_TIP).
  const [shotTip, setShotTip] = useState(() => {
    try {
      return SHOW_SHOT_TIP && !round.preview && !props.game && localStorage.getItem('golfos.tip.shots.v1') == null; // games: no shot check afterwards
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
  // A course without built-in charts: made on the phone from the region's official terrain model (Sascha 19.10.2026:
  // "every course should have green slopes"), once, then kept on the phone.
  const greensKey = allMaps.map((m, k) => (m?.green ? round.holes[k].label : '')).join(',');
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    let urls: Record<string, string> = {};
    if (greenSlopeOn && GREEN_CHARTS[round.courseId]) loadGreenGrids(round.courseId).then((g) => alive && setGrids(g));
    else if (greenSlopeOn) {
      const greens = allMaps.flatMap((m, k) => (m?.green ? [{ ref: round.holes[k].label, ring: m.green }] : []));
      madeChartsFor(round.courseId, greens, (done, total) => alive && done < total && setMaking({ done, total }), ctrl.signal).then((m) => {
        if (!alive) return;
        setMaking(null);
        if (!m) return;
        urls = Object.fromEntries(Object.entries(m.charts).map(([ref, c]) => [ref, URL.createObjectURL(c.png)]));
        setMade({ m, urls });
        setGrids(m.heights);
      });
    }
    return () => {
      alive = false;
      ctrl.abort();
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [round.courseId, greensKey]);
  const chartOf = (label: string): GreenChart | undefined =>
    GREEN_CHARTS[round.courseId]?.[label] ?? (made?.urls[label] ? { file: made.urls[label], corners: made.m.charts[label].corners } : undefined);
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
    // built in (Hetzenhof, Frielinghausen) – or made once from the region's terrain model (19.10.2026)
    loadTerrainGrid(round.courseId)
      .then((g) => g ?? makeTerrainGrid(round.courseId, allMaps.flatMap((m) => (m ? [m.tee, m.greenCenter, ...m.line] : []))))
      .then((g) => alive && setTgrid(g));
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
  // After saving: a short buzz and a few seconds to take it back (a wrong tap with a glove).
  const [undo, setUndo] = useState<{ text: string; detail: DetailEntry; putts: number | null; hole: number } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const [removeShot, setRemoveShot] = useState<number | null>(null);
  const [shotList, setShotList] = useState(false); // the shots noted by hand on this hole, to remove one
  useEffect(() => setShotList(false), [i]);
  const latestRound = useRef(round); // the round as it is now – for a measurement that finishes seconds later
  latestRound.current = round; // index in round.manualShots offered for removal
  // a round on several phones: the flight's scores exchanged every few seconds while the map is on screen (and at once
  // when the app comes back) – a score entered meanwhile stays
  const shareCode = round.shared?.code ?? null;
  const exchangeChange = useRef(props.onChange);
  exchangeChange.current = props.onChange;
  const exchangeNow = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!shareCode) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const sent = latestRound.current;
      const got = await exchangeRound(sent, myName()).finally(() => (busy = false));
      if (!got) return;
      const next = settle(latestRound.current, sent, got);
      if (JSON.stringify(next) !== JSON.stringify(latestRound.current)) exchangeChange.current(next);
    };
    exchangeNow.current = tick;
    void tick();
    const t = window.setInterval(() => void tick(), 5000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [shareCode]);
  // who keeps which score (Sascha 29.10.2026): a player's own phone his, a team's card one phone of the team, in a
  // tournament everyone also marks a partner – the score panel locks what another phone keeps and shows both counts
  const [shareEvent, setShareEvent] = useState(() => (shareCode ? cachedEvent(shareCode) : null));
  useEffect(() => {
    if (!shareCode) return;
    const on = () => setShareEvent(cachedEvent(shareCode));
    on();
    window.addEventListener('golfos:event-changed', on);
    return () => window.removeEventListener('golfos:event-changed', on);
  }, [shareCode]);
  const views = useMemo(() => (round.shared ? shareView(round, shareEvent?.flights[round.shared.flight], !!shareEvent?.tournament) : {}), [round, shareEvent]);
  // holes set up by hand on another phone of the event (Sascha 12.11.2026: "only one has to set them"): taken where this
  // phone has none of its own – its own stay
  useEffect(() => {
    if (!shareEvent || shareEvent.course?.id !== round.courseId) return;
    const got = sharedLines(shareEvent, round.shared?.flight);
    const mine = loadHoleLines(round.courseId);
    let took = false;
    for (const [key, line] of Object.entries(got)) {
      const [loop, n] = [key.slice(0, key.lastIndexOf('#')), Number(key.slice(key.lastIndexOf('#') + 1))];
      if (mine[key] || !loop || !Number.isFinite(n) || !Array.isArray(line) || line.length < 2) continue;
      saveHoleLine(round.courseId, loop, n, line);
      took = true;
    }
    if (took) setGeoVersion((v) => v + 1);
  }, [shareEvent, round.courseId]); // eslint-disable-line react-hooks/exhaustive-deps
  /** this phone does not keep its own score (the team's card is kept on another phone): no score asked on the way on */
  const myScoreElsewhere = views[me.id]?.role === 'view' || props.game?.keptBy?.[me.id] != null;
  // a scorer keeps the card (Sascha 07.11.2026): this phone may still enter its own details – set per player in the
  // setup, changed here on the phone; then the score entry asks on every hole for them
  const ownEligible = (views[me.id]?.role === 'view' && !!shareEvent?.flights[round.shared!.flight]?.scorer) || props.game?.keptBy?.[me.id] != null;
  const [ownOn, setOwnOn] = useState(() => ownDetailsOn(round.id, me.name, round.format?.ownDetails ?? props.game?.ownDetails));
  const ownEmpty = (k: number): boolean => {
    const e = round.entries[me.id]?.[k];
    return !!e && !e.pickedUp && e.putts == null && e.fairway == null && !e.sandShots;
  };
  /** a hole still wanting a score from this phone: its own (unless kept elsewhere) – and the partner it marks (Sascha
   *  29.10.2026: "Sascha keeps his own score and, as marker, Cedric's") */
  const scoreToAsk = (k: number): boolean =>
    // the own details, wanted: once on a hole where none are entered yet
    (ownEligible && ownOn && ownEmpty(k) && !scoreSeen.current.has(k)) ||
    // (a scorer: every player's – 02.11.2026)
    [...(myScoreElsewhere ? [] : [me.id]), ...round.players.filter((p) => views[p.id]?.role === 'mark' || (views[p.id]?.role === 'free' && !!shareEvent?.flights[round.shared!.flight]?.scorer)).map((p) => p.id)].some((pid) => {
      const e = round.entries[pid]?.[k];
      return !!e && e.strokes == null && !e.pickedUp;
    });
  // let in during the round and not in the flight yet (Sascha 30.10.2026): a player here – on the phone that sets the
  // flight's players up; the joining phone finds its name with the next exchange (teams: the host picks the team)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ code: string; name: string; hcp: string }>).detail;
      const r = latestRound.current;
      // (a tournament: the one let in plays in his own flight, or picks his name in one)
      if (!r.shared || d.code !== r.shared.code || r.shared.tournament || !d.name.trim() || isTeamMode(r.format?.mode) || r.players.length >= 4) return;
      const ev = cachedEvent(d.code);
      if (ev?.flights[r.shared.flight]?.by && ev.flights[r.shared.flight].by !== r.shared.phone) return;
      if (r.players.some((p) => p.name.trim().toLowerCase() === d.name.trim().toLowerCase())) return;
      const idx = Number(d.hcp.replace(',', '.').replace('+', '-'));
      const id = newId();
      onChangeNow.current({
        ...r,
        players: [...r.players, { id, name: d.name.trim(), playingHandicap: d.hcp.trim() && Number.isFinite(idx) ? Math.round(idx) : null, isMe: false }],
        entries: { ...r.entries, [id]: r.holes.map(() => emptyEntry()) },
      });
    };
    window.addEventListener('golfos:join-approved', on);
    return () => window.removeEventListener('golfos:join-approved', on);
  }, []);
  const takeTheCard = async (team: string) => {
    if (!(await takeOver(round, team))) return setTestMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
    await exchangeNow.current();
    setTestMsg(tr('You keep the card now.', 'Du führst jetzt die Scorekarte.'));
  };
  const [testMsg, setTestMsg] = useState<string | null>(null);
  // on several phones, on the map (Sascha 30.10.2026, the night run): a count that differs as soon as it does – not
  // only at the end; and a team's keeper quiet for ten minutes (battery) – the card offered
  const [shareNote, setShareNote] = useState<{ text: string; act?: { label: string; run: () => void } } | null>(null);
  useEffect(() => {
    if (!shareNote) return;
    const t = setTimeout(() => setShareNote(null), 12000);
    return () => clearTimeout(t);
  }, [shareNote]);
  const toldDiffs = useRef<Set<string> | null>(null);
  const toldQuiet = useRef(false);
  useEffect(() => {
    const s = round.shared;
    const f = s ? shareEvent?.flights[s.flight] : undefined;
    if (!s || !f) return;
    const counted = round.players.filter((p) => (views[p.id]?.role === 'own' || views[p.id]?.role === 'mark') && f.markers?.[p.id]).map((p) => p.id);
    const now = new Set(counted.flatMap((pid) => differences(f, pid).map((k) => `${pid}:${k}`)));
    const fresh = toldDiffs.current ? [...now].filter((x) => !toldDiffs.current!.has(x)) : [];
    toldDiffs.current = now; // what differed when the map opened is on the score panel – not said again
    if (fresh.length) {
      const [pid, at] = fresh[0].split(':');
      const k = Number(at);
      const name = round.players.find((p) => p.id === pid)?.name ?? '';
      const own = f.scores[pid]?.[k]?.s ?? '–';
      const mark = f.marks?.[pid]?.[k]?.s ?? '–';
      const label = round.holes[k]?.label ?? String(k + 1);
      navigator.vibrate?.(40);
      setShareNote({ text: tr(`Hole ${label}: the counts of ${name} differ (${own} / ${mark}) – agree on the score`, `Loch ${label}: Die Zählung bei ${name} weicht ab (${own} / ${mark}) – Score abstimmen`) });
      return;
    }
    const quiet = isTeamRound(round) && views[me.id]?.role === 'view' ? quietKeeper(f, me.id, s.phone ?? '') : null;
    if (!quiet) toldQuiet.current = false;
    else if (!toldQuiet.current) {
      toldQuiet.current = true;
      setShareNote({
        text: tr(`${quiet.name}'s phone has been quiet for ${quiet.minutes} min – take the card over?`, `Das Handy von ${quiet.name} meldet sich seit ${quiet.minutes} Min. nicht – Scorekarte übernehmen?`),
        act: { label: tr('Take over', 'Übernehmen'), run: () => void takeTheCard(me.id) },
      });
    }
  }, [shareEvent, views]); // eslint-disable-line react-hooks/exhaustive-deps
  // shot by sound (Sascha 18.10.2026): listening while this screen is open, every crack kept with time and place – in the
  // iOS app always (03.11.2026), on the website only for the tests
  const soundTest = useMemo(() => (isNative() || soundTestOn()) && !round.preview && !props.game, []);
  // what the pocket screen says: hearing, held up (being restarted), or off (never allowed)
  const [mic, setMicState] = useState<'on' | 'stalled' | 'off'>('off');
  // set only when it changes: the watch below asks every second, and a render redraws every mark on the map
  const micNow = useRef(mic);
  const setMic = (v: typeof mic) => {
    if (micNow.current === v) return;
    micNow.current = v;
    setMicState(v);
  };
  const micEverOn = useRef(false); // allowed once on this screen – only then it is opened again by itself (no asking over and over)
  const stopListen = useRef<Listening | null>(null);
  const holeRef = useRef(i);
  holeRef.current = i;
  const playerRef = useRef(player);
  playerRef.current = player;
  const gone = useRef(false); // the screen closed – a microphone opened only now is closed again
  useEffect(() => {
    gone.current = false; // React's test run mounts twice
    return () => {
      gone.current = true;
      stopListen.current?.();
    };
  }, []);
  // the caddie talks: the microphone pauses and listens again afterwards
  const resumeMic = useRef(false);
  useEffect(() => {
    setMicPause(() => {
      if (!stopListen.current) return false;
      stopListen.current();
      stopListen.current = null;
      resumeMic.current = true;
      return true;
    });
    const off = onSpeaking(() => {
      if (!isSpeaking() && resumeMic.current) {
        resumeMic.current = false;
        void toggleListenRef.current();
      }
    });
    return () => {
      setMicPause(null);
      off();
    };
  }, []);
  const starting = useRef(false); // the microphone is being opened (the iPhone may be asking for it)
  const onChangeNow = useRef(props.onChange); // opened by itself at the start: a crack saved with today's handler
  onChangeNow.current = props.onChange;
  // the test protocol (Sascha 30.10.2026, for the tournament): what the microphone, the app and the read-
  // aloud really did – kept with the round while a test switch is on, shown on the scorecard
  const testing = soundTest;
  const logTest = (what: TestEvent['what'], text?: string) => {
    if (!testing) return;
    latestRound.current = addTestEvent(latestRound.current, what, text); // two in one moment: both kept
    onChangeNow.current(latestRound.current);
  };
  const logTestRef = useRef(logTest);
  logTestRef.current = logTest;
  useEffect(() => {
    if (!testing) return;
    let hiddenAt: number | null = null;
    // another app in front (Sascha 30.10.2026: "I take the phone out and another app is open") – how long
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        logTestRef.current('app-hidden');
      } else if (hiddenAt != null) {
        logTestRef.current('app-back', tr(`after ${Math.round((Date.now() - hiddenAt) / 1000)} s`, `nach ${Math.round((Date.now() - hiddenAt) / 1000)} s`));
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const off = onSpeechDone((r) => logTestRef.current('speech', speechText(r)));
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      off();
    };
  }, []);
  const toggleListen = async () => {
    if (stopListen.current) {
      stopListen.current();
      stopListen.current = null;
      setMic('off');
      return;
    }
    if (starting.current) return;
    starting.current = true;
    try {
      stopListen.current = await listen((hit) => {
        // the newest fix, not the one on the screen (28.10.2026). The app hears
        // with the phone locked and may hand the crack over later: where the track was at the crack's time
        const pl = (isNative() ? fixAt(loadTrack(round.id), hit.t) : null) ?? lastFix.current ?? playerRef.current;
        const time = new Date(hit.t).toLocaleTimeString(getLang() === 'de' ? 'de-DE' : undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (!pl) {
          setTestMsg(tr(`Crack heard at ${time} – no GPS`, `Knall gehört um ${time} – kein GPS`));
          return;
        }
        // walked on in the pocket: the hole where the crack was heard – also a hole further on without a score (Sascha
        // 04.11.2026: holes 1, 2, then 8 and 9 – the app still on 3 put the cracks of 8 and 9 on 3)
        const lr = latestRound.current;
        // a crack on the range before the round (Sascha 10.11.2026: 11:27 and 11:47 on hole 1): not a shot
        if (!lr.preview) {
          const warm = warmUp(lr, hit.t, pl.pos, pl.accuracy);
          if (warm) {
            setTestMsg(`${time} · ${warmText(warm)}`);
            return;
          }
        }
        const meP = lr.players.find((p) => p.isMe) ?? lr.players[0];
        const open = (k: number) => {
          const e = meP ? lr.entries[meP.id]?.[k] : undefined;
          return e?.strokes == null && !e?.pickedUp;
        };
        // from the hole of the last crack when that one came later in the round (the phone in the pocket, the screen
        // still on an earlier hole): the shots after the tee shot stay on the hole the tee shot found
        const last = (lr.soundShots ?? []).at(-1);
        const base = last && hit.t - last.t < 20 * 60000 && playPos(lr, last.hole) > playPos(lr, holeRef.current) ? last.hole : holeRef.current;
        const hole = isNative() ? (detectHole(pl.pos, allMaps, base, { start: lr.startHole, open }) ?? base) : holeRef.current;
        const r = latestRound.current;
        // kept as the latest at once: a protocol line in the same moment must not drop the crack
        latestRound.current = { ...r, soundShots: [...(r.soundShots ?? []), { hole, pos: pl.pos, t: hit.t, level: hit.level, acc: Math.round(pl.accuracy) }] };
        onChangeNow.current(latestRound.current);
        // as a shot noted by hand: its number on the hole and a short buzz (Sascha 29.10.2026: "check it on the course")
        const n = (r.soundShots ?? []).filter((x) => x.hole === hole).length + 1;
        const label = r.holes[hole]?.label ?? String(hole + 1);
        setTestMsg(tr(`Shot ${n} on ${label} by sound – crack at ${time} (loudness ${Math.round(hit.level * 100)})`, `Schlag ${n} an ${label} per Ton – Knall gehört um ${time} (Lautstärke ${Math.round(hit.level * 100)})`));
        try {
          navigator.vibrate?.(25);
        } catch {
          /* no vibration */
        }
      });
      if (gone.current) {
        stopListen.current();
        stopListen.current = null;
        return;
      }
      if (!micEverOn.current) logTest('mic-on', tr('listening', 'hört mit'));
      micEverOn.current = true;
      setMic('on');
    } catch (e) {
      // opened again by the watch below: it says "held up" on the pocket screen, no message each time
      if (!micEverOn.current) setTestMsg(tr('No microphone – allow it in the settings', 'Kein Mikrofon – bitte in den Einstellungen erlauben'));
      logTest('mic-failed', `${tr('could not open', 'ließ sich nicht öffnen')}: ${(e as Error)?.name ?? e}`);
    } finally {
      starting.current = false;
    }
  };
  const toggleListenRef = useRef(toggleListen);
  toggleListenRef.current = toggleListen;
  // on by itself when the profile switch is on – no microphone button on the map (Sascha 29.10.2026); back from the
  // background (iOS ends the microphone there) it listens again
  useEffect(() => {
    if (!soundTest) return;
    void toggleListenRef.current();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || resumeMic.current) return;
      if (starting.current || (stopListen.current?.alive() ?? false)) return;
      stopListen.current?.();
      stopListen.current = null;
      logTestRef.current('mic-restart', tr('app in front again – microphone opened again', 'App wieder vorne – Mikrofon neu geöffnet'));
      void toggleListenRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    // the watch (Sascha 30.10.2026: "fix it tonight"): iOS may hold the microphone up without the page going away – a
    // call, Siri, Guided Access coming up. Every second: is sound really arriving? Held up: wake the sound (a page that
    // is recording may do so without a touch – with Guided Access no touch reaches it); still held up after 3 s, or
    // ended: open the microphone again – after 5 s, then 10, 20 … at most every minute while it does not come back.
    let badSince: number | null = null;
    let restarted = false;
    let lastTry = 0;
    let wait = 5000;
    const watch = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || resumeMic.current || starting.current) return;
      const l = stopListen.current;
      const h = l ? l.health() : 'dead';
      if (h === 'on') {
        // in the protocol: how long it was gone, and whether it took a restart
        if (badSince != null) {
          const s = Math.round((Date.now() - badSince) / 1000);
          logTestRef.current('mic-on', tr(`back after ${s} s${restarted ? ' (restarted)' : ' (woken)'}`, `wieder da nach ${s} s${restarted ? ' (neu gestartet)' : ' (geweckt)'}`));
        }
        badSince = null;
        restarted = false;
        wait = 5000;
        setMic('on');
        return;
      }
      if (!micEverOn.current) return; // never allowed: it stays "off"
      setMic('stalled');
      const now = Date.now();
      if (badSince == null) {
        badSince = now;
        logTestRef.current('mic-stalled', l ? l.why() : tr('microphone ended', 'Mikrofon beendet'));
      }
      if (h === 'stalled') {
        l?.wake();
        if (now - badSince < 3000) return;
      }
      if (now - lastTry < wait) return;
      if (lastTry) wait = Math.min(wait * 2, 60000);
      lastTry = now;
      stopListen.current?.();
      stopListen.current = null;
      restarted = true;
      void toggleListenRef.current();
    }, 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(watch);
    };
  }, []);
  // the Apple Watch (Sascha 08.11.2026: "the shot detection by the watch – the phone often lies in the cart"): the round
  // goes to the watch, its workout starts once per round; every swing it feels comes back with the watch's place and
  // is a "shot here" of the round – in a game too (10.11.2026)
  const [watchOn, setWatchOn] = useState(false);
  useEffect(() => {
    if (!isNative() || round.preview) return;
    let gone = false;
    let stop = () => undefined as void;
    void watchReady().then((ready) => {
      if (!ready || gone) return;
      setWatchOn(true);
      const key = `golfos.watch.started.${round.id}`;
      let started = false;
      try {
        started = sessionStorage.getItem(key) === '1' || localStorage.getItem(key) === '1';
      } catch {
        /* asked again – harmless */
      }
      const json = watchRound(round, allMaps, unit === 'yd' ? 'yd' : 'm', getLang());
      void sendRound(json, holeRef.current, !started).then((ok) => {
        if (!ok || started) return;
        setTestMsg(tr('Apple Watch connected – it counts your shots', 'Apple Watch verbunden – sie zählt deine Schläge'));
        try {
          sessionStorage.setItem(key, '1');
        } catch {
          /* this time only */
        }
      });
      stop = onWatch((it) => {
        const r = latestRound.current;
        // the hole changed on the watch by hand (in the last minute): the phone goes along – as by GPS, no par written
        if (it.kind === 'hole') {
          if (it.hole !== holeRef.current && watchHoleFor(it, r.id, r.holes.length)) goToRef.current(it.hole, true, r);
          return;
        }
        // the watch's own track (Sascha 09.11.2026): the player's way in the round's track, also in a game on the map
        if (it.kind === 'track') {
          if (it.round === r.id && !r.preview) addWatchFixes(r.id, it.pts);
          return;
        }
        // a game counts the shots too (Sascha 10.11.2026: "why does it count no shots? always – someone may want his own
        // round analysis of a game afterwards")
        if (it.kind === 'remove') {
          const next = removeWatchShot(r, it.id);
          if (next !== r) {
            latestRound.current = next;
            onChangeNow.current(next);
          }
          return;
        }
        // the watch's place, live: the player's when the phone lies elsewhere
        if (it.kind === 'pos') {
          if (it.round !== r.id || it.p.length < 4 || r.preview) return;
          const w = { pos: [it.p[1], it.p[2]] as LngLat, accuracy: it.p[3], t: Date.now() };
          watchFix.current = w;
          if (watchPlaceWins(w, lastFix.current)) showFix({ ...w, still: false });
          return;
        }
        if (it.kind !== 'shot' || it.shot.round !== r.id) return;
        const s = it.shot;
        // no fix of the watch's and none of the phone's at its moment: the last place of the round – a swing is never
        // dropped for want of a place (night 10./11.11.2026); placed roughly, it waits under "Schläge prüfen"
        const fb = fixAt(loadTrack(r.id), s.t) ?? lastFixBefore(loadTrack(r.id), s.t) ?? (lastFix.current ? { pos: lastFix.current.pos, accuracy: Math.max(30, lastFix.current.accuracy) } : null);
        const pos: LngLat | null = s.lng != null && s.lat != null ? [s.lng, s.lat] : (fb?.pos ?? null);
        const meP = r.players.find((p) => p.isMe) ?? r.players[0];
        const open = (k: number) => {
          const e = meP ? r.entries[meP.id]?.[k] : undefined;
          return e?.strokes == null && !e?.pickedUp;
        };
        // warming up on the range before the round (Sascha 09.11.2026): not a shot of the round
        const warm = warmUp(r, s.t, pos, s.acc, s.manual);
        if (warm) {
          setTestMsg(warmText(warm));
          return;
        }
        const base = s.hole >= 0 && s.hole < r.holes.length ? s.hole : holeRef.current;
        const hole = pos ? (detectHole(pos, allMaps, base, { start: r.startHole, open }) ?? base) : base;
        const next = addWatchShot(r, s, hole, fb);
        if (next === r) return;
        latestRound.current = next;
        onChangeNow.current(next);
        const n = (next.manualShots ?? []).filter((x) => x.hole === hole).length;
        const label = r.holes[hole]?.label ?? String(hole + 1);
        setTestMsg(tr(`Shot ${n} on ${label} – from the watch`, `Schlag ${n} an ${label} – von der Uhr`));
      });
    });
    return () => {
      gone = true;
      stop();
    };
  }, [round.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // the hole on the screen to the watch
  useEffect(() => {
    if (watchOn) sendHole(i);
  }, [i, watchOn]);
  useEffect(() => {
    if (!testMsg) return;
    const t = setTimeout(() => setTestMsg(null), 6000);
    return () => clearTimeout(t);
  }, [testMsg]);
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
  // the shots noted by hand on this hole, on the map – a tap offers to remove one (Sascha 17.10.2026)
  const manualTrack = (round.manualShots ?? [])
    .map((x, k) => ({ x, k }))
    .filter(({ x }) => x.hole === i)
    .map(({ x, k }, n) => ({ pos: x.pos, label: String(n + 1), tone: 'good' as const, id: `m${k}`, hand: true }));
  // the cracks the microphone heard on this hole (test) – numbered as the shots by hand, with the time (29.10.2026)
  const soundTrack = (round.soundShots ?? [])
    .filter((x) => x.hole === i)
    .sort((a, b) => a.t - b.t)
    .map((x, n) => ({ pos: x.pos, label: String(n + 1), time: new Date(x.t).toLocaleTimeString(getLang() === 'de' ? 'de-DE' : undefined, { hour: '2-digit', minute: '2-digit' }), sound: true }));
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
    // the first shot is the tee shot only at the tee (Sascha 08.11.2026: the phone in the cart, the first shot noted
    // 80 m before the green got the tee and the driver): noted further on, the tee shot was missed – it is added from
    // the tee with the club for its length, and this one is shot 2 with the club for its distance
    const teeMissing = !editing && detail.shots.length === 0 && !!pos && !!mapData && !atTheTee(pos, mapData);
    const teeShot = (): Shot[] => (teeMissing && pos && mapData ? [{ pos: mapData.tee, lie: 'tee', club: clubForLength(distanceM(mapData.tee, pos), (hole.par || 4) >= 4, bag), penalty: false }] : []);
    const nShown = teeMissing ? 2 : n;
    const isTeeShot = nShown === 1;
    sheetEl = (
      <ShotSheet
        title={tr(`Shot ${nShown}`, `Schlag ${nShown}`) + (toPin != null ? tr(` · ${fmtU(toPin)} ${unit} to pin`, ` · ${fmtU(toPin)} ${unit} zur Fahne`) : '')}
        lie={existing?.lie ?? (pos && mapData ? lieAt(pos, mapData, isTeeShot) : isTeeShot ? 'tee' : 'fairway')}
        club={existing ? existing.club : suggestClub(hole.par || 4, isTeeShot, toPin ?? (hole.par >= 4 ? 300 : 150), bag)}
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
          else shots.push(...teeShot(), { pos: sheet.pos, ...v });
          confirmSaved(tr(`Shot ${nShown}${v.club ? ' · ' + clubCode(v.club) : ''} saved`, `Schlag ${nShown}${v.club ? ' · ' + clubCode(v.club) : ''} gespeichert`));
          saveDetail({ ...detail, shots });
          setSheet(null);
        }}
        onDelete={editing ? () => { saveDetail({ ...detail, shots: detail.shots.filter((_, k) => k !== sheet.index) }); setSheet(null); } : undefined}
        onHoledOut={
          editing
            ? undefined
            : () => {
                confirmSaved(tr('Holed out – saved', 'Eingelocht – gespeichert'));
                saveDetail({ ...detail, shots: [...detail.shots, ...teeShot(), { pos: sheet.pos, lie: pos && mapData ? lieAt(pos, mapData, isTeeShot) : 'fairway', club: null, penalty: false }], holedOut: true, onGreen: null, pin: pinPos }, 0);
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

  if (setupOpen || (view === 'map' && !mapData && !scoreOnly)) {
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
        onScoreOnly={
          mapData
            ? undefined
            : () => {
                setSetupOpen(false);
                setView('score');
                setScoreOnly(true);
              }
        }
        onSave={(line) => {
          saveHoleLine(round.courseId, hole.loop, hole.number, line);
          // the flight's other phones take it (Sascha 12.11.2026, Cypress: "each of us had to set tees and greens") – and
          // every GolfOS player on this course (courselines)
          if (round.shared) void shareLine(round, hole.loop, hole.number, line);
          void shareCourseLine(round.courseId, hole.loop, hole.number, line);
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
    const terrain = { slopes: geometry.fairwaySlopes?.[hole.label], boundary: geometry.boundary, trees: geometry.trees, woods };
    // Par 4/5: target 1 is there from the start – the caddie's landing spot from the tee (driver carry, moved for
    // wind, slope and tendency, clear of trees). The player can drag or remove it; his own plan is kept then.
    const teeAim = teeAimFor({ data: mapData, par: hole.par, pin: plans[i]?.pin ?? mapData.greenCenter, bag: carryBag, conditions, tendency, corridor, ...terrain, note: notes[hole.label] ?? {}, style: caddieSettings.style, favourite: caddieSettings.favourite, playing: caddiePlaying });
    const planned = strategy[hole.label];
    // planning a par 5 (Sascha 16.10.2026): three shots – two targets from the start, the second where the
    // favourite distance is left
    const defaultTargets = (): LngLat[] => {
      // a par 3 too has a target to move – aim left, or lay up (Sascha 24.10.2026); it starts in the middle of the green
      // and leaves the caddie as he is until it is moved
      if (hole.par === 3) return [mapData.greenCenter];
      const first = teeAim && distanceM(teeAim.pos, mapData.greenCenter) > 60 ? [teeAim.pos] : [];
      if (!round.planning || hole.par < 5 || !first.length) return first;
      const L = lineLength(mapData.line);
      const at = L - Math.min(200, Math.max(30, caddieSettings.favourite || 90));
      return at > alongLine(mapData.line, first[0]) + 40 ? [first[0], pointAt(mapData.line, at)] : first;
    };
    const plan = plans[i] ?? (planned?.targets.length ? { targets: planned.targets, pin: null } : { targets: defaultTargets(), pin: null });
    // every hole looked at counts as planned – a par 3 has no target, nor has a short par 4 whose landing spot lies
    // within 60 m of the green (Sascha 21.10.2026: "16 of 18 holes planned, but I planned every hole"); the live round
    // then takes the caddie's targets of the day
    planDefault.current = round.planning && !planned ? { label: hole.label, targets: plan.targets } : null;
    // The flag stays on the green (Sascha 15.10.2026: it stood 50 m short on the fairway after a stray drag): a pin
    // off the green – dragged there or saved so – counts as not set.
    const pinOk = (p: LngLat) => (mapData.green ? pointInRing(p, mapData.green) || distToLine(p, mapData.green) <= 3 : distanceM(p, mapData.greenCenter) <= 25);
    const pin = plan.pin && pinOk(plan.pin) ? plan.pin : mapData.greenCenter;
    // really playing this hole (not on the next fairway or in the clubhouse): for the camera, the shot lengths and
    // the caddie log
    const onThisHole = player != null && distToLine(player.pos, mapData.line) <= 60;
    // Distances from the player only once he is on the hole, past the tee; until then always from the tee (Sascha
    // 17.10.2026: "the GPS should always start from the tee" – beside the course it measured across from there)
    const onHole = onThisHole && alongLine(mapData.line, player!.pos) > ON_HOLE_M;
    const shotButtons = detailMode && MANUAL_SHOTS;
    const from = onHole ? player!.pos : mapData.tee;
    // Without a mapped green outline (player-set green) only the centre distance is known.
    const green = mapData.green ? greenFrontBack(from, mapData.green) : { front: null, center: distanceM(from, mapData.greenCenter), back: null };
    const setPlan = (patch: Partial<{ targets: LngLat[]; pin: LngLat | null }>) => {
      setPlans({ ...plans, [i]: { ...plan, ...patch } });
      // planning: the targets are the course's plan for this hole
      if (round.planning && patch.targets) setStrategy(savePlannedHole(round.courseId, hole.label, { targets: patch.targets, clubs: planned?.clubs ?? [], at: new Date().toISOString() }));
    };
    // every shot of the plan: from the tee over the targets into the green, with its club (chosen or suggested)
    const planPoints = [mapData.tee, ...plan.targets, mapData.greenCenter];
    const planShots = planPoints.slice(1).map((to, k) => {
      const len = distanceM(planPoints[k], to);
      const suggested = adviseClub(len, carryBag, k === 0 && hole.par >= 4).club;
      return { len, club: (planned?.clubs[k] ?? suggested) as Club, own: planned?.clubs[k] != null };
    });
    const setPlanClub = (k: number, club: Club) => {
      const clubs = planShots.map((_, j) => (j === k ? club : planned?.clubs[j] ?? null));
      setStrategy(savePlannedHole(round.courseId, hole.label, { targets: plan.targets, clubs, at: new Date().toISOString() }));
    };
    const fmt = (m: number) => formatDistance(m, unit);
    const tapMap = (p: LngLat) => {
      if (placing) {
        openAt(placing, p);
        setPlacing(null);
        return;
      }
      // the caddie open: a tap on the map above it closes it – and only that (Sascha 04.11.2026, on the course)
      if (caddieShown) {
        setCaddieOpen(false);
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
    const slope = greenSlopeOn ? (geometry.greenSlopes?.[hole.label] ?? made?.m.slopes[hole.label]) : undefined;
    const nearGreen = distanceM(from, mapData.greenCenter) <= 40 || (round.preview === true && hole.par === 3);
    // The green slope only when the player asks for it (Sascha 15.10.2026: also on a par 3 the whole hole comes
    // first) – never by itself near the green.
    const greenVisible = showGreen === true;
    const chart = greenSlopeOn ? chartOf(hole.label) : undefined;
    // Green chart on screen: keep the view free (caddie folded, no hint).
    // Only around the green (≤ 40 m) – on the approach the caddie stays at hand next to the green chart.
    const greenFocus = chart != null && greenVisible && nearGreen;
    const green_ = slope && greenVisible ? readGreen(slope, bearingDeg(from, pin)) : null;
    const grid = grids?.[hole.label] ?? null;
    // the course book's facts on this hole, also in the caddie (Sascha 15.10.2026)
    const book = holeBook({ data: mapData, slopes: geometry.fairwaySlopes?.[hole.label], greenSlope: geometry.greenSlopes?.[hole.label] ?? made?.m.slopes[hole.label], grid, unit, record: holeRecords.get(hole.label), tip: (notes[hole.label] ?? {}).tip, history: holeHistories.get(hole.label) });
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
    const before = prevHole(round, i);
    const prev = before != null ? round.entries[me.id][before] : null;
    const prevHoleOf = before != null ? round.holes[before] : null;
    const cad = caddieOn && !tournament
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
          defaultTarget: hole.par === 3 ? mapData.greenCenter : null,
          ...terrain,
          bag: carryBag,
          conditions,
          tendency,
          corridor,
          note,
          style: caddieSettings.style,
          favourite: caddieSettings.favourite,
          lieChoice: lieSet?.sig === lieSig ? lieSet.lie : null,
          unit,
          coarseHeight: heightAt,
          stableford: me.playingHandicap != null && !round.preview ? { received, shotsSoFar: teeShot ? 0 : (myEntry.detail?.shots.length ?? null) } : null,
          prev: prev && prevHoleOf ? { toPar: prev.strokes != null ? prev.strokes - prevHoleOf.par : null, pickedUp: !!prev.pickedUp } : null,
          forecast,
          wind: weather ? { gustKmh: weather.gustKmh, windKmh: weather.windKmh, label: windOnHole(weather, bearingDeg(from, pin)).label } : null,
          leave: greenCache.current.leave,
          playing: caddiePlaying,
          grid,
          landmarks,
          strokeIndex: hole.strokeIndex || null,
          fairwaysAuto: geometry.fairwayAuto?.[hole.label],
          planned: planned ? { clubs: planShots.map((x) => x.club), shot: teeShot ? 0 : Math.min(planShots.length - 1, passedTargets.length) } : null,
          greenText: putt ? putt.text : green_ ? (green_.level === 'flat' ? tr('The green is almost flat.', 'Das Grün ist fast flach.') : tr(`${green_.level} slope, ${green_.text}.`, `${levelName(green_.level)} Neigung, ${green_.text}.`)) : null,
        })
      : null;

    // Something new to say = new hole, other club, new warning, or the player moved on (≈ 25 m steps).
    const caddieSig = cad ? `${i}|${cad.advice.club}${cad.advice.swing ?? ''}|${cad.warning ?? ''}|${cad.ap.kind}|${Math.round(cad.pl.distance / 25)}` : '';
    const caddieShown = (cad != null || (tournament && caddieOn)) && caddieOpen; // the tool bar is the same on every hole (Sascha 15.10.2026)
    // the spread of the caddie's club around his landing spot – on the map and in the card (Sascha 23.10.2026: "plan
    // holes and single shots with the dispersion"); own shots from 5 on, else estimated from the handicap
    // (the caddie aims against the club's own tendency already – the balls spread around his spot less that tendency)
    const spread0 = cad && !cad.shortGame && !putt && !greenFocus ? clubSpread(cad.advice.club, distanceM(from, cad.target), clubReps.get(cad.advice.club), caddiePlaying) : null;
    const tend = spread0 ? (tendency.get(spread0.club) ?? 0) : 0;
    const spreadNow = spread0 ? { ...spread0, side: { lo: spread0.side.lo - tend, hi: spread0.side.hi - tend } } : null;
    // any club of the bag on the map, not only the caddie's (Sascha 23.10.2026: "depending on a club or the caddie's
    // advice"): its typical length along the line to the caddie's spot
    const lenOf = (c: Club) => clubReps.get(c)?.median || carryBag.find((b) => b.club === c && !b.swing)?.carry || 0;
    const picked = spreadClub && spread0 && cad && lenOf(spreadClub) > 0 ? spreadClub : null;
    const pickedTarget = picked && cad ? move(from, bearingDeg(from, cad.target), lenOf(picked)) : null;
    const pickedSpread0 = picked ? clubSpread(picked, lenOf(picked), clubReps.get(picked), caddiePlaying) : null;
    const pickedTend = picked ? (tendency.get(picked) ?? 0) : 0;
    const mapSpread = pickedSpread0 ? { ...pickedSpread0, side: { lo: pickedSpread0.side.lo - pickedTend, hi: pickedSpread0.side.hi - pickedTend } } : spreadNow;
    const mapTarget = pickedTarget ?? cad?.target ?? null;
    const spreadOnMap = mapSpread && mapTarget && spreadOn ? { ...spreadShape(from, mapTarget, mapSpread), own: mapSpread.shots > 0 } : null;
    const spreadChoices = carryBag.filter((b) => !b.swing && b.club !== 'Pt' && lenOf(b.club) > 0).sort((a, b) => lenOf(b.club) - lenOf(a.club));
    // unread: a small green dot until the caddie was opened on this hole – on the next hole it comes back (Sascha 17.10.2026)
    const caddieNews = cad != null && !greenFocus && !caddieOpen && seenSig !== String(i);
    const toggleCaddie = () => {
      setSeenSig(String(i));
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
        plan: cad.facts.plan ?? null, // what the card said (no "misses cost the same" next to a warning)
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
          credit={made ? made.m.credit : greenSource(round.courseId, GREEN_CHARTS[round.courseId] != null)}
          holeKey={`${round.id}-${i}`}
          data={mapData}
          player={player?.pos ?? null}
          from={from}
          pin={pin}
          targets={shownTargets}
          unit={unit}
          imagery={imagery}
          // the state's aerial service does not answer: Esri for this visit (the choice stays as it is)
          // the state's imagery down: Esri; Esri down too: the drawn hole (not kept for the next round) – never a black
          // map (night check 22.10.2026)
          onImageryFail={() => (imagery.id !== 'esri' ? setImageryPref('esri') : view2d ? undefined : (setView2d(true), setTestMsg(tr('No aerial photo right now – the drawn hole instead', 'Gerade kein Luftbild – dafür die gezeichnete Bahn'))))}
          track={detailMode ? [...track, ...soundTrack] : [...manualTrack, ...soundTrack]}
          onTrackTap={detailMode ? undefined : (id) => setRemoveShot(Number(id.slice(1)))}
          // a shot noted by hand moves with the finger to the exact spot on the aerial – to the metre (Sascha 17.10.2026)
          onTrackMove={
            detailMode
              ? undefined
              : (id, pos) => {
                  const k = Number(id.slice(1));
                  const list = (round.manualShots ?? []).slice();
                  if (!list[k]) return;
                  list[k] = { ...list[k], pos, acc: 0, placed: true };
                  props.onChange({ ...round, manualShots: list });
                  setTestMsg(tr('Shot moved to the spot', 'Schlag an die Stelle verschoben'));
                }
          }
          aimPoint={null}
          spread={spreadOnMap}
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



        {weather && !tournament && <WeatherBadge weather={weather} holeBearing={bearingDeg(mapData.tee, mapData.greenCenter)} below={false} />}
        {spreadPick && cad && (
          <div className="sheet-backdrop" onClick={() => setSpreadPick(false)}>
            <section className="sheet" role="dialog" aria-label={tr('Spread of which club?', 'Streuung welches Schlägers?')} onClick={(e) => e.stopPropagation()}>
              <div className="sheet-head">
                <strong>{tr('Spread of which club?', 'Streuung welches Schlägers?')}</strong>
                <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setSpreadPick(false)}>
                  ✕
                </button>
              </div>
              <div className="pick-list">
                <button type="button" className="pick-option" aria-pressed={!picked} onClick={() => { setSpreadClub(null); setSpreadPick(false); }}>
                  <span className="grow">
                    <strong>{tr(`The caddie's club (${clubCode(cad.advice.club)})`, `Schläger des Caddies (${clubCode(cad.advice.club)})`)}</strong>
                    <span className="muted small">{tr('follows his advice for each shot', 'folgt seiner Empfehlung bei jedem Schlag')}</span>
                  </span>
                  {!picked && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
                {spreadChoices.map((b) => {
                  const n = clubReps.get(b.club)?.corridor?.shots ?? 0;
                  return (
                    <button key={b.club} type="button" className="pick-option" aria-pressed={picked === b.club} onClick={() => { setSpreadClub(b.club); setSpreadPick(false); }}>
                      <span className="grow">
                        <strong>{clubName(b.club)}</strong>
                        <span className="muted small">
                          {fmt(lenOf(b.club))} {unit} · {n >= 5 ? tr(`spread from ${n} shots`, `Streuung aus ${n} Schlägen`) : tr('spread estimated from your handicap', 'Streuung nach Handicap geschätzt')}
                        </span>
                      </span>
                      {picked === b.club && <span className="pick-check" aria-hidden="true">✓</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

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
        <div className="map-side">
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
                    ? tr('Show caddie – unread', 'Caddie zeigen – ungelesen')
                    : tr('Show caddie', 'Caddie zeigen')
              }
              title={tr('AI caddie', 'KI-Caddie')}
              onClick={toggleCaddie}
            >
              {caddieNews && <span className="tool-dot" aria-hidden="true" />}
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
          {/* not in Games on a small phone (iPhone SE): the tool bar would reach under the game bar – the spread keeps its setting */}
          {cad && !tournament && !(props.game && window.innerHeight < 620) && (
            <span className="map-tool-wrap">
              {/* whose spread the map shows, beside its tool (Sascha 24.10.2026): the club and an arrow – a tap picks another */}
              {spreadOnMap && mapSpread && (
                <button type="button" className="map-spread-chip" aria-label={tr(`Spread of ${clubName(mapSpread.club)} – choose a club`, `Streuung von ${clubName(mapSpread.club)} – Schläger wählen`)} onClick={() => setSpreadPick(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <ellipse cx="12" cy="7" rx="8" ry="3.5" />
                    <path d="M12 21L4.6 8.4M12 21l7.4-12.6" strokeDasharray="2 2.4" />
                  </svg>
                  <span>{clubCode(mapSpread.club)}</span>
                  <span aria-hidden="true">›</span>
                </button>
              )}
              <button type="button" className="map-tool" aria-pressed={spreadOn} aria-label={spreadOn ? tr('Hide the spread', 'Streuung ausblenden') : tr('Show the spread of the club', 'Streuung des Schlägers zeigen')} title={tr('Spread', 'Streuung')} onClick={() => setSpreadOn(!spreadOn)}>
                {/* spread: the cone from the ball to the ellipse where 80 % of the balls land */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <ellipse cx="12" cy="7" rx="8" ry="3.5" />
                  <path d="M12 21L4.6 8.4M12 21l7.4-12.6" strokeDasharray="2 2.4" />
                </svg>
              </button>
            </span>
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
          <button type="button" className="map-tool" aria-pressed={view2d} aria-label={view2d ? tr('Aerial image', 'Luftbild zeigen') : tr('Drawn hole (2D)', 'Gezeichnetes Loch (2D)')} title="2D" onClick={toggleView}>
            <span className="map-tool-text">2D</span>
          </button>
        </div>
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
            texas={round.format?.minDrives ? Object.fromEntries(round.players.map((p) => [p.id, texasDrives(round, p.id, i)])) : undefined}
            pickUp={pickUpAllowed(round, !!props.game)}
            // in detail: the one this phone marks (or, as scorer, everyone) when a bet counts the round; else the score with
            // penalty strokes (Sascha 02.11.2026)
            entry={props.game?.entry}
            everyone={!!props.game?.detailsAll}
            extras={props.game?.extras}
            notice={puttsMissing?.length ? tr(`Putts missing for ${puttsMissing.join(', ')} – a bet counts them; then on to the next hole.`, `Putts fehlen bei ${puttsMissing.join(', ')} – eine Wette zählt sie; dann geht es zum nächsten Loch.`) : undefined}
            analysis={(pid) => pid === me.id && ownEligible}
            analysisOn={ownOn}
            onAnalysis={(on) => {
              setOwnDetails(round.id, on);
              setOwnOn(on);
            }}
            // the scorer of all ("Einer für alle") enters everyone in full – putts, sand, penalties, tee shot (Sascha 12.11.2026: "Erik
            // could enter only the scores for Cedric and Moritz, not the putts") – but not who keeps his own details; the
            // marker in a tournament as before when a bet counts the round
            details={(pid) => (withBets && views[pid]?.role === 'mark') || (views[pid]?.role === 'free' && !!shareEvent?.flights[round.shared!.flight]?.scorer && !(round.format?.ownDetails ?? []).some((n) => n.trim().toLowerCase() === (round.players.find((p) => p.id === pid)?.name ?? '').trim().toLowerCase()))}
            shared={{
              ...Object.fromEntries(Object.entries(props.game?.keptBy ?? {}).map(([pid, by]) => [pid, { keptBy: by }])),
              ...Object.fromEntries(
                Object.entries(views).map(([pid, v]) => [
                  pid,
                  {
                    keptBy: v.role === 'view' ? (v.keptBy ?? '') : null,
                    takeOver: v.canTakeOver ? () => void takeTheCard(pid) : undefined,
                    other: v.other ? { label: v.other.label, cell: v.other.cells[i] ?? null } : undefined,
                    locked: v.locked,
                  },
                ]),
              ),
            }}
            onChange={update}
            holeIndex={i}
            // gave up (Sascha 12.11.2026): kept on this round and in the flight – the leaderboard and the signing know
            retired={{ ...(round.retired ?? {}), ...(round.shared ? (shareEvent?.flights[round.shared.flight]?.retired ?? {}) : {}) }}
            onRetire={
              round.preview
                ? undefined
                : (pid, from, fill) => {
                    const retired = { ...(round.retired ?? {}) };
                    if (from == null) delete retired[pid];
                    else retired[pid] = from;
                    props.onChange({ ...round, retired });
                    if (round.shared) void setRetired(round, pid, from, fill).then(() => setShareEvent(cachedEvent(round.shared!.code)));
                  }
            }
            onPlacePutts={() => setPuttEditor(true)}
            onClose={() => {
              setScoreSheet(false);
              setPuttsMissing(null);
              if (pendingHole != null) onAfterScore(myEntry.strokes != null || !!myEntry.pickedUp);
            }}
          />
        )}
        {boardOpen && <LeaderboardSheet round={round} tab={boardTab} onClose={() => { setBoardOpen(false); setBoardTab('board'); }} />}
        {inviteOpen && <RoundInviteSheet round={round} onShared={(r) => props.onChange(r)} onClose={() => setInviteOpen(false)} />}
        {sideBetOpen && (
          <SideBetSheet
            roundId={round.id}
            preset={{
              day: poolDay(round.createdAt),
              players: round.players.filter((p) => !p.isMe && p.name.trim()).map((p) => ({ name: p.name.trim(), playing: p.playingHandicap ?? null })),
              me: { playing: round.players.find((p) => p.isMe)?.playingHandicap ?? null },
              ...(round.shared?.tournament ? { on: { code: round.shared.code, name: round.courseName, course: round.courseName } } : {}),
            }}
            onClose={() => setSideBetOpen(false)}
          />
        )}
        {drawerOpen && (
          <HoleDrawer
            round={round}
            current={i}
            onGo={(k) => {
              setDrawerOpen(false);
              if (k === i) return;
              // on to the next hole from the overview: a hole without a score first asks for it, as "→" does (Sascha
              // 28.10.2026) – then on to the hole picked, as after the GPS found the next hole
              if (k === i + 1 && !round.preview && scoreToAsk(i)) {
                setPendingHole(k);
                setScoreSheet('next');
                return;
              }
              goTo(k, true); // jumping to a hole writes no par for this one
            }}
            onClose={() => setDrawerOpen(false)}
            onBag={() => props.onOpenBag?.('bag')}
            onCaddie={() => props.onOpenBag?.('caddie')}
            onScorecard={() => props.onShowScorecard(round)}
            onLeaderboard={props.game ? () => { setDrawerOpen(false); props.game!.onOpen(); } : (round.players.length > 1 || round.shared?.tournament) && !round.preview ? () => { setDrawerOpen(false); setBoardOpen(true); } : null}
            leaderboardLabel={props.game ? `${props.game.name} · ${tr('standing', 'Stand')}` : round.shared?.tournament ? tr('Leaderboard · tournament', 'Leaderboard · Turnier') : undefined}
            extraRows={
              props.game?.onInvite
                ? [{ label: props.game.shared ? tr(`Players' phones · code ${props.game.shared}`, `Handys der Mitspieler · Code ${props.game.shared}`) : tr('Invite players', 'Mitspieler einladen'), onClick: () => { setDrawerOpen(false); props.game!.onInvite!(); } }]
                : !props.game && !round.preview
                  ? [
                      // a side bet in the round – in a tournament too (Sascha 10.11.2026: "in the menu by the code, the bag
                      // and the caddie")
                      { label: tr('Side bet', 'Sidebet'), onClick: () => { setDrawerOpen(false); setSideBetOpen(true); } },
                      ...(round.shared || canShareRound
                        ? [{ label: round.shared ? tr(`${round.shared.tournament ? 'Tournament' : "Players' phones"} · code ${round.shared.code}`, `${round.shared.tournament ? 'Turnier' : 'Handys der Mitspieler'} · Code ${round.shared.code}`) : tr('Invite players', 'Mitspieler einladen'), onClick: () => { setDrawerOpen(false); setInviteOpen(true); } }]
                        : []),
                    ]
                  : undefined
            }
            preview={round.preview}
            onBook={props.onBook}
            onPause={props.onExit}
            onEnd={() => {
              setDrawerOpen(false);
              // the preview ends at once (nothing saved); a round asks first
              if (round.preview) return props.onAbort(round);
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
            bunkers={mapData.bunkers}
            from={approachFrom(mapData)}
            pin={myEntry.puttsAt?.pin ?? pin}
            putts={myEntry.putts}
            balls={myEntry.puttsAt?.balls ?? null}
            ballOnGreen={player && mapData.green && pointInRing(player.pos, mapData.green) ? player.pos : null}
            walk={round.preview ? null : greenWalk(loadTrack(round.id), mapData.green, mapData.greenCenter)}
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
          {/* today's 5+5+10 duels, live – also against a player in another flight (Sascha 09.11.2026) */}
          {!greenFocus && !round.preview && <DuelBar onOpen={() => { setBoardTab('bets'); setBoardOpen(true); }} />}
          {props.game && !greenFocus && (
            <button type="button" className={`game-bar${props.game.teams ? ' with-teams' : ''}`} onClick={props.game.onOpen} aria-label={tr(`${props.game.name} – standing and input`, `${props.game.name} – Stand und Eingabe`)}>
              <span className="game-bar-head">
                <strong>{props.game.name}</strong>
                <span className="grow">{props.game.line}</span>
                <span aria-hidden="true">›</span>
              </span>
              {props.game.teams && (
                <span className="game-teams">
                  {props.game.teams.map((side, k) => (
                    <span key={k} className={`game-team ${k ? 'team-b' : 'team-a'}`}>
                      {side.map((m) => (
                        <span key={m.name} className="game-team-player">
                          <Avatar name={m.name} me={m.me} size={20} />
                          <span className="game-team-name">{m.name}</span>
                        </span>
                      ))}
                    </span>
                  ))}
                  <span className="game-vs">{tr('vs', 'gegen')}</span>
                </span>
              )}
            </button>
          )}
          {round.planning && !greenFocus && (
            <section className="plan-panel" aria-label={tr('Plan for this hole', 'Plan für dieses Loch')}>
              <span className="plan-panel-title">{tr(`Plan ${hole.label}`, `Plan ${hole.label}`)}</span>
              {planShots.map((x, k) => (
                <label key={k} className="plan-shot">
                  <span className="plan-shot-what">
                    {k === 0 ? tr('Tee', 'Abschlag') : tr(`Target ${k}`, `Ziel ${k}`)} → {k === planShots.length - 1 ? tr('green', 'Grün') : tr(`target ${k + 1}`, `Ziel ${k + 1}`)}
                    <span className="muted"> · {fmt(x.len)} {unit}</span>
                  </span>
                  <select value={x.club} className={x.own ? 'own' : ''} aria-label={tr(`Club for shot ${k + 1}`, `Schläger für Schlag ${k + 1}`)} onChange={(e) => setPlanClub(k, e.target.value as Club)}>
                    {carryBag.filter((b) => !b.swing || b.swing === 'full').map((b) => (
                      <option key={b.club} value={b.club}>
                        {clubCode(b.club)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="plan-actions">
                {plan.targets.length < (hole.par === 3 ? 2 : 3) && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      // a new target between the last one (or the tee) and the green
                      const from = plan.targets[plan.targets.length - 1] ?? mapData.tee;
                      const a0 = alongLine(mapData.line, from);
                      const a1 = lineLength(mapData.line);
                      setPlan({ targets: [...plan.targets, pointAt(mapData.line, a0 + (a1 - a0) / 2)] });
                    }}
                  >
                    + {tr('Target', 'Ziel')}
                  </button>
                )}
                {plan.targets.length > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => setPlan({ targets: plan.targets.slice(0, -1) })}>
                    − {tr(`Target ${plan.targets.length}`, `Ziel ${plan.targets.length}`)}
                  </button>
                )}
                {/* the hole note while planning (Sascha 21.10.2026) – the same as the caddie's "Hole notes" */}
                {/* a green dot when the hole has a note (Sascha 23.10.2026) */}
                <button type="button" className="btn-secondary has-dot" aria-label={hasNote(note) ? tr('Hole note – there is one', 'Lochnotiz – eine ist gespeichert') : tr('Hole note', 'Lochnotiz')} onClick={() => setPlanNoteOpen(true)}>
                  {tr('Hole note', 'Lochnotiz')}
                  {hasNote(note) && <i className="note-dot" aria-hidden="true" />}
                </button>
              </div>
              {planNoteOpen && (
                <NotesSheet
                  hole={hole.label}
                  note={note}
                  onSave={(n) => {
                    saveHoleNote(round.courseId, hole.label, n);
                    setNotes({ ...notes, [hole.label]: n });
                  }}
                  onClose={() => setPlanNoteOpen(false)}
                />
              )}
              <span className="muted small">{tr('Drag the targets on the map.', 'Ziele auf der Karte ziehen.')}</span>
            </section>
          )}
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
          {/* the bottom row (Sascha 17.10.2026): the map info bottom left, "shot here" bottom right where "centre" was,
              "centre" above it */}
          <div className="map-tools map-bottom-tools">
            <button type="button" className="map-btn round tool map-info" aria-pressed={infoOpen} aria-label={tr('Map information', 'Karteninfo')} title={tr('Map information', 'Karteninfo')} onClick={() => setInfoOpen(!infoOpen)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6" />
                <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
              </svg>
            </button>
            <span className="grow" />
            <div className="map-tools-stack">
              {camByHand && (
                <button type="button" className="map-btn round tool" aria-label={tr('Centre the map again', 'Karte wieder zentrieren')} title={tr('Centre', 'Zentrieren')} onClick={() => setRecenter((n) => n + 1)}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="6.5" />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
                  </svg>
                </button>
              )}
              <span className="shot-wrap">
            {/* the ball's spot by hand, at the ball: the truth for the shot detection – on the map for every round, not
                  in the profile, below the tools on its own (Sascha 17.10.2026); the GPS detection runs as always, both kept */}
              {/* always bottom right; with the caddie open it is simply not there (Sascha 21.10.2026: it lay over the tools);
                  only on the website, for testing – the iOS app finds the shots by itself (Sascha 02.11.2026) */}
              {!round.preview && !props.game && !caddieShown && !isNative() && (
                <button
                  type="button"
                  className="map-shot-btn"
                  disabled={!player}
                  aria-label={tr('Note the ball here', 'Schlag hier erfassen')}
                  title={tr('Shot here', 'Schlag hier')}
                  onClick={() => {
                    if (!player) return;
                    const mine = (round.manualShots ?? []).filter((x) => x.hole === i).length;
                    const t = Date.now();
                    props.onChange({ ...round, manualShots: [...(round.manualShots ?? []), { hole: i, pos: player.pos, t, acc: Math.round(player.accuracy) }] });
                    setTestMsg(tr(`Shot ${mine + 1} on ${hole.label}: measuring – stand still for 5 s …`, `Schlag ${mine + 1} an ${hole.label}: wird gemessen – 5 s stehen bleiben …`));
                    // as exact as the phone allows: the fixes of the next 5 s averaged, then the shot's spot corrected
                    sampleFix(5000, shownFix.current).then((f) => {
                      const r = latestRound.current;
                      const k = (r.manualShots ?? []).findIndex((x) => x.t === t);
                      if (k < 0) return;
                      if (!f) return setTestMsg(tr(`Shot ${mine + 1} on ${hole.label} noted`, `Schlag ${mine + 1} an ${hole.label} erfasst`));
                      const list = (r.manualShots ?? []).slice();
                      list[k] = { ...list[k], pos: f.pos, acc: Math.round(f.accuracy * 10) / 10 };
                      props.onChange({ ...r, manualShots: list });
                      setTestMsg(tr(`Shot ${mine + 1} on ${hole.label} noted (±${dec(f.accuracy.toFixed(1))} m, ${f.n} ${f.n === 1 ? 'fix' : 'fixes'})`, `Schlag ${mine + 1} an ${hole.label} erfasst (±${dec(f.accuracy.toFixed(1))} m, ${f.n} ${f.n === 1 ? 'Messung' : 'Messungen'})`));
                    });
                  }}
                >
                  <ShotHereIcon />
                </button>
              )}
              {!round.preview && !props.game && (round.manualShots ?? []).some((x) => x.hole === i) && (
                // the count on the shot button: the list of this hole's shots, to remove one (Sascha 17.10.2026: "pressed by mistake")
                <button type="button" className="shot-count" aria-pressed={shotList} aria-label={tr('Shots noted on this hole', 'Erfasste Schläge an diesem Loch')} onClick={() => { setShotList(!shotList); setRemoveShot(null); }}>
                  {(round.manualShots ?? []).filter((x) => x.hole === i).length}
                </button>
              )}
              </span>
            </div>
          </div>
          {infoOpen && (
            // the credits of the map (imagery, OSM, green heights) – a tap closes them
            <div
              className="map-hint map-credits"
              role="button"
              tabIndex={0}
              onClick={() => setInfoOpen(false)}
              dangerouslySetInnerHTML={{ __html: document.querySelector('.map-screen .maplibregl-ctrl-attrib-inner')?.innerHTML ?? '' }}
            />
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
          {caddieShown && tournament && (
            <TournamentCaddie
              holeLabel={hole.label}
              note={note}
              ahead={hazardsAhead(mapData, from)}
              unit={unit}
              onHide={toggleCaddie}
              onNote={(n) => {
                saveHoleNote(round.courseId, hole.label, n);
                setNotes({ ...notes, [hole.label]: n });
              }}
            />
          )}
          {caddieShown && cad && (
            <CaddieCard
              book={book}
              facts={cad.facts}
              pl={cad.pl}
              weather={weather ? { tempC: weather.tempC, windKmh: weather.windKmh } : null}
              ob={cad.ob}
              ahead={hazardsAhead(mapData, from)}
              unit={unit}
              spread={spreadNow}
              lines={cad.lines}
              alt={cad.alt}
              onHide={toggleCaddie}
              note={note}
              holeLabel={hole.label}
              clubCode={cad.shortGame ? (cad.shortGame.club === 'Putter' ? 'Pt' : '8i') : clubCode(cad.advice.club) + swingMark(cad.advice.swing)}
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
          {shotList && !scoreSheet && (
            <div className="test-shot-row">
              <div className="map-hint detected hand-list" role="dialog" aria-label={tr('Shots noted on this hole', 'Erfasste Schläge an diesem Loch')}>
                <div className="shot-list-head">
                  <strong>{tr(`Shots on ${hole.label}`, `Schläge an ${hole.label}`)}</strong>
                  <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setShotList(false)}>
                    ✕
                  </button>
                </div>
                {(round.manualShots ?? [])
                  .map((x, k) => ({ x, k }))
                  .filter(({ x }) => x.hole === i)
                  .map(({ x, k }, n) => (
                    <div key={x.t} className="shot-list-row">
                      <span className="shot-list-no">{n + 1}</span>
                      <span className="grow">
                        {new Date(x.t).toLocaleTimeString(getLang() === 'de' ? 'de-DE' : undefined, { hour: '2-digit', minute: '2-digit' })}
                        <span className="muted"> · {x.placed ? tr('set on the map', 'auf der Karte gesetzt') : `±${dec(String(x.acc))} m`}</span>
                      </span>
                      <button
                        type="button"
                        className="btn-ghost danger"
                        onClick={() => {
                          const list = (round.manualShots ?? []).slice();
                          list.splice(k, 1);
                          props.onChange({ ...round, manualShots: list });
                          if (!list.some((y) => y.hole === i)) setShotList(false);
                        }}
                      >
                        {tr('Remove', 'Entfernen')}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {removeShot != null && round.manualShots?.[removeShot] && !scoreSheet && (
            <div className="test-shot-row">
              <span className="map-hint detected" role="status">
                <span>{round.manualShots[removeShot].watch ? tr(`Shot ${(round.manualShots ?? []).slice(0, removeShot + 1).filter((x) => x.hole === i).length} from the watch`, `Schlag ${(round.manualShots ?? []).slice(0, removeShot + 1).filter((x) => x.hole === i).length} (von der Uhr)`) : tr(`Shot ${(round.manualShots ?? []).slice(0, removeShot + 1).filter((x) => x.hole === i).length} noted by hand`, `Schlag ${(round.manualShots ?? []).slice(0, removeShot + 1).filter((x) => x.hole === i).length} (von Hand erfasst)`)}</span>
                <button
                  type="button"
                  className="btn-ghost danger"
                  onClick={() => {
                    const list = (round.manualShots ?? []).slice();
                    list.splice(removeShot, 1);
                    props.onChange({ ...round, manualShots: list });
                    setRemoveShot(null);
                  }}
                >
                  {tr('Remove', 'Entfernen')}
                </button>
                <button type="button" className="icon-btn" aria-label={tr('Keep it', 'Behalten')} onClick={() => setRemoveShot(null)}>
                  ✕
                </button>
              </span>
            </div>
          )}
          {shareNote && !scoreSheet && (
            <div className="test-shot-row">
              <span className="map-hint detected share-note" role="status">
                <span>{shareNote.text}</span>
                {shareNote.act && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      shareNote.act!.run();
                      setShareNote(null);
                    }}
                  >
                    {shareNote.act.label}
                  </button>
                )}
              </span>
            </div>
          )}
          {/* the ball's spot by hand noted (the map tool) – a toast with undo */}
          {/* a planned tournament's special prizes on this hole: the leader, the own entry (Sascha 01.11.2026) */}
          {shareEvent?.specials?.length && round.shared && !scoreSheet && !round.preview ? (
            <SpecialsAtHole
              ev={shareEvent}
              code={round.shared.code}
              flight={round.shared.flight}
              player={me.id}
              phone={round.shared.phone ?? ''}
              hole={i}
              fromTee={onThisHole && player ? Math.round(distanceM(teeSpot(loadTrack(round.id), mapData) ?? mapData.tee, player.pos)) : null}
            />
          ) : null}
          {testMsg && !scoreSheet && (
            <div className="test-shot-row">
              <span className="map-hint detected" role="status">
                <span>✓ {testMsg}</span>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    const list = (round.manualShots ?? []).slice();
                    const last = list.map((x) => x.hole).lastIndexOf(i);
                    if (last >= 0) list.splice(last, 1);
                    props.onChange({ ...round, manualShots: list });
                    setTestMsg(null);
                  }}
                >
                  {tr('Undo', 'Rückgängig')}
                </button>
              </span>
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
              <button type="button" className="map-btn round" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => goTo(prevHole(round, i) ?? -1)} disabled={prevHole(round, i) == null}>
                ←
              </button>
              {holeDone ? (
                <button type="button" className="map-btn primary" onClick={() => goTo(nextHole(round, i) ?? round.holes.length)}>
                  {tr('Done', 'Fertig')} · {myEntry.strokes} → {isLastHole(round, i) ? tr('finish', 'beenden') : tr('next', 'weiter')}
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
              <button type="button" className="map-btn round primary" aria-label={isLastHole(round, i) ? (props.game ? tr('Finish game', 'Spiel beenden') : tr('Finish round', 'Runde beenden')) : tr('Next hole', 'Nächstes Loch')} onClick={forward}>
                →
              </button>
            </div>
          ) : (
          <div
            className="hole-bar"
            onTouchStart={(e) => (barTouch.current = e.touches[0].clientY)}
            onTouchEnd={(e) => {
              if (barTouch.current != null && barTouch.current - e.changedTouches[0].clientY > 40) setDrawerOpen(true);
              barTouch.current = null;
            }}
          >
            <button type="button" className="hole-bar-handle" aria-label={tr('Open the hole overview', 'Lochübersicht öffnen')} onClick={() => setDrawerOpen(true)}>
              <span />
            </button>
            <button type="button" className="hole-bar-arrow" aria-label={tr('Previous hole', 'Voriges Loch')} onClick={() => goTo(prevHole(round, i) ?? -1)} disabled={prevHole(round, i) == null}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button
              type="button"
              className="map-score"
              disabled={round.preview}
              aria-label={round.preview ? undefined : tr(`Hole ${hole.label}, score ${strokesShown} – tap to enter`, `Loch ${hole.label}, Score ${strokesShown} – antippen zum Eintragen`)}
              onClick={() => (hasShots ? setView('score') : setScoreSheet(scoreSheet ? false : 'score'))}
            >
              {/* fixed columns, a small label over each value – nothing cut off (Sascha 11.11.2026, design rounds 2–4): Loch and
                  Par big; the hole's Hcp and one's PHCP (strokes received, a dot each) small, one under the other */}
              <span className="hole-cell" aria-hidden="true">
                <small>{tr('Hole', 'Loch')}</small>
                <span className="map-hole-no">{hole.label}</span>
              </span>
              <span className="hole-cell" aria-hidden="true">
                <small>Par</small>
                <strong>{hole.par || '?'}</strong>
              </span>
              <span className="hole-bar-mini" aria-hidden="true">
                <span>
                  <small>Hcp</small>
                  <em>{hole.strokeIndex || '?'}</em>
                </span>
                {!round.preview && (
                  <span>
                    <small>PHCP</small>
                    <i className="hole-bar-dots">{received > 0 ? '•'.repeat(Math.min(received, 3)) : '–'}</i>
                  </span>
                )}
              </span>
              <span className="sr-only">
                {`Par ${hole.par || '?'} · Hcp ${hole.strokeIndex || '?'}`}
                {received > 0 && !round.preview ? tr(` · ${received} handicap ${received === 1 ? 'stroke' : 'strokes'} on this hole`, ` · ${received} ${received === 1 ? 'Vorgabeschlag' : 'Vorgabeschläge'} auf diesem Loch`) : ''}
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
            <button type="button" className="hole-bar-arrow" aria-label={isLastHole(round, i) ? (props.game ? tr('Finish game', 'Spiel beenden') : tr('Finish round', 'Runde beenden')) : tr('Next hole', 'Nächstes Loch')} onClick={forward}>
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
        if (Math.abs(dx) > 70) {
          if (dx < 0) forward();
          else goTo(prevHole(round, i) ?? -1);
        }
      }}
    >
      <TopBar
        title={round.courseName}
        onBack={askExit}
        backLabel={tr('Leave round', 'Runde verlassen')}
        right={
          <>
            <button type="button" className="icon-btn" aria-label={mapData ? tr('Hole map', 'Karte') : tr('Set up the hole', 'Loch einrichten')} onClick={() => (mapData ? setView('map') : setSetupOpen(true))}>
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
        <div style={{ width: `${((playPos(round, i) + 1) / round.holes.length) * 100}%` }} />
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
          <span aria-hidden="true" style={{ color: 'var(--brand-text)', display: 'inline-flex' }}>
            <PenGlyph />
          </span>
        </button>
      </div>

      {!mapData && (
        <button type="button" className="btn-secondary" onClick={() => setSetupOpen(true)}>
          {tr('Set up the hole (tee + green)', 'Loch einrichten (Abschlag + Grün)')}
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
              {tr('Hole drawn wrong? Mark tee and green again', 'Loch falsch eingezeichnet? Abschlag und Grün neu markieren')}
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
                  <button type="button" className="icon-btn edit-btn" aria-label={tr(`Edit shot ${k + 1}`, `Schlag ${k + 1} bearbeiten`)} onClick={() => setSheet({ kind: 'shot', index: k, pos: sh.pos })}>
                    <PenGlyph />
                  </button>
                </li>
              ))}
              {detail.holedOut && <li><span className="n putt-n"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 21V3l11 4-11 4" /></svg></span><span>{tr('Holed out', 'Eingelocht')}</span><span /><span /></li>}
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
        <button type="button" className="btn-secondary" onClick={() => goTo(prevHole(round, i) ?? -1)} disabled={prevHole(round, i) == null}>
          {tr('← Back', '← Zurück')}
        </button>
        <button type="button" className="btn-primary" onClick={() => goTo(nextHole(round, i) ?? round.holes.length)}>
          {isLastHole(round, i) ? (props.game ? tr('Finish game', 'Spiel beenden') : tr('Finish round', 'Runde beenden')) : tr(`Next · hole ${round.holes[nextHole(round, i) ?? i].label}`, `Weiter · Loch ${round.holes[nextHole(round, i) ?? i].label}`)}
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
        <WeatherIcon code={w.code} /> {Math.round(w.tempC)}°
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
