import { useEffect, useMemo, useRef, useState } from 'react';
import { ShotHereIcon } from '../components/RoundIcons';
import type { DetailEntry, HoleEntry, LngLat, Round, Shot } from '../types';
import { distanceM, distToLine, holeMapData, pointInRing, type HoleMapData } from '../lib/geo';
import { deriveFromShots, emptyDetail, firstPuttM, KINDS, lieAt, lieName, shotLengths, shotOdd, suggestKind } from '../lib/shots';
import { clubForLength, detectWithScore, findStops, loadTrack, splitRound, teeSpot, type TrackPoint } from '../lib/track';
import { loadCachedCourse, loadCarryBag, loadGeometry, loadImagery, loadLive, loadRounds, loadUnit } from '../lib/storage';
import { loadHoleNotes, saveHoleNote } from '../lib/holenotes';
import { loadRegionalImagery, pickImagery } from '../lib/imagery';
import { analyse, playerBag } from '../lib/stats';
import { rollFactor } from '../lib/clubs';
import { formatDistance } from '../lib/geo';
import { HoleMap } from '../components/HoleMap';
import { ensureCourseMap } from '../lib/courses';
import { PuttEditor } from '../components/PuttEditor';
import { pickUpAllowed, ScoreSheet, scoreName } from '../components/ScoreSheet';
import { greenWalk } from '../lib/greenwalk';
import { approachFrom } from '../lib/geo';
import { holeForTee } from '../lib/teeline';
import { ShotSheet } from '../components/ShotSheet';
import { TopBar, formatToPar } from '../components/ui';
import { loadCaddieLog, rateCaddie, type CaddieLog } from '../lib/caddielog';
import { clubCode, getLang, tr } from '../lib/i18n';

// Round check after a detailed round (feature 007): every shot of every hole on the map, with club, shot type,
// lie, length and strokes gained. Shots detected from the GPS track are marked "check"; the player corrects
// them and confirms the hole.

/** How a putt really broke against the read (stored as the note of the verdict). */
/** The caddie's advice to rate after the round – off while the caddie is reworked (Sascha 16.10.2026: "makes no sense,
 *  I did not use the caddie"). */
const SHOW_CADDIE_REVIEW = false;
const puttVerdicts = () => [
  { note: 'bricht weniger', label: tr('Breaks less', 'Bricht weniger') },
  { note: 'bricht mehr', label: tr('Breaks more', 'Bricht mehr') },
];

export function RoundReview(props: { round: Round; onChange: (r: Round) => void; onDone: () => void }) {
  const { round } = props;
  const me = round.players.find((p) => p.isMe)!;
  // a round looked at later whose course map made room when the storage was full: the map comes again (22.10.2026)
  const [geoTick, setGeoTick] = useState(0);
  useEffect(() => {
    ensureCourseMap(round.courseId).then((came) => came && setGeoTick((t) => t + 1));
  }, [round.courseId]);
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId, geoTick]);
  // the same holes as on the course: from the tee the player played (yellow, red …), not the back tee of the map
  const maps = useMemo(() => round.holes.map((h) => holeForTee(holeMapData(geometry, h.loop, h.number), round.courseId, h.label, round.tee, geometry.tee)), [geometry, round.holes, round.courseId, round.tee]);
  const track = useMemo(() => loadTrack(round.id), [round.id]);
  // where the pin was on the course ("Where is the pin today?" or the dragged flag) – else the middle of the green
  const coursePins = useMemo(() => loadLive(round.id).plans, [round.id]);
  // the pin the player set with his putts on the course wins, then the one from the hole map
  const pinFor = (index: number): LngLat | null => round.entries[me.id][index]?.puttsAt?.pin ?? coursePins[index]?.pin ?? maps[index]?.greenCenter ?? null;
  const parts = useMemo(() => (track.length > 20 ? splitRound(track, maps) : []), [track, maps]);
  // the clubs and distances of "My bag" (Sascha 18.10.2026: "the check does not follow the lengths in my bag"): the
  // carries as set there are shown; for the club from a measured length (carry + roll) the total is carry / 0.93 – the
  // same roll as the bag uses the other way round. Without a bag: own measured lengths or the standard.
  const bag = useMemo(() => {
    const own = loadCarryBag()?.filter((b) => !b.swing || b.swing === 'full');
    const others = loadRounds().filter((r) => r.finishedAt && r.id !== round.id);
    if (own?.length) {
      // for the club from a measured length: what the player really hits with it (full shots, from 3 on – Sascha's
      // rounds 16./18.10.: the bag said 230 m driver carry, he hits 205 m in all), else the carry with its roll
      const measured = new Map(analyse(others).clubs.filter((c) => c.shots >= 3).map((c) => [c.club, c.median]));
      return own.map((b) => ({ club: b.club, m: measured.get(b.club) ?? Math.round(b.carry * rollFactor(b.club)), carry: b.carry }));
    }
    return playerBag(others, 3, null);
  }, [round.id]);
  const unit = loadUnit();
  const course = loadCachedCourse(round.courseId);
  const imageryAt: LngLat = course ? [course.lon, course.lat] : (maps.find(Boolean)?.greenCenter ?? [0, 0]);
  // as on the course: the state's imagery down → Esri, Esri down too → the drawn hole (22.10.2026)
  const [imageryPref, setImageryPref] = useState(loadImagery);
  const imagery = pickImagery(imageryAt, imageryPref);
  const [, setImageryTick] = useState(0);
  useEffect(() => {
    loadRegionalImagery(imageryAt).then((found) => found && setImageryTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [`${imageryAt[0].toFixed(3)},${imageryAt[1].toFixed(3)}`]); // again once the course's position is known
  const entries = round.entries[me.id];
  const firstToCheck = entries.findIndex((e) => e.detail?.shots.some((s) => s.review));
  const [k, setK] = useState(firstToCheck >= 0 ? firstToCheck : 0);
  const [edit, setEdit] = useState<number | null>(null);
  // the putts placed on the course, shown and editable here too (Sascha 16.10.2026)
  const [puttEdit, setPuttEdit] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // aerial image or the drawn hole – the same choice as on the course (Sascha 16.10.2026)
  const [view2d, setView2d] = useState(() => {
    try {
      return localStorage.getItem('golfos.mapview.v1') === '2d';
    } catch {
      return false;
    }
  });
  const toggleView = () => {
    setView2d((v) => {
      try {
        localStorage.setItem('golfos.mapview.v1', v ? 'aerial' : '2d');
      } catch {
        /* this visit only */
      }
      return !v;
    });
  };
  // after a penalty: the next tap on the map is where the ball went into the water / out of bounds
  const [placingMiss, setPlacingMiss] = useState<number | null>(null);
  // "add a shot": the next tap on the map places a new shot there (Sascha 17.10.2026: "it says add a shot, but I
  // cannot") – also right beside another shot or on the green's edge, where a plain tap would open that shot
  const [adding, setAdding] = useState(false);
  useEffect(() => setAdding(false), [k]);
  // reorder the shots: hold the grip and move up or down (Sascha 17.10.2026)
  const listRef = useRef<HTMLOListElement>(null);
  const latestShots = useRef<Shot[]>([]);
  const reorderRef = useRef<(from: number, to: number) => void>(() => undefined);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const justDragged = useRef(false); // the click after a drag does not open the shot
  /** Moves shot `from` with the finger from y0 until it is lifted. While dragging the page does not scroll (iPhone). */
  const dragFrom = (y0: number, from: number) => {
    const rows = [...(listRef.current?.children ?? [])].slice(0, latestShots.current.length) as HTMLElement[];
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    let to = from;
    setDrag({ from, to, dy: 0 });
    navigator.vibrate?.(10);
    const at = (clientY: number) => {
      const y = mids[from] + (clientY - y0);
      to = mids.reduce((best, m, j) => (Math.abs(m - y) < Math.abs(mids[best] - y) ? j : best), from);
      setDrag({ from, to, dy: clientY - y0 });
    };
    const move = (e: PointerEvent) => at(e.clientY);
    // the iPhone: the finger is followed by its touch events, and the page must not scroll – Safari gives up the
    // pointer (pointercancel) as soon as it thinks of scrolling, so that is no end of the drag (Sascha 20.10.2026:
    // "still does not work")
    const touchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.touches[0]) at(e.touches[0].clientY);
    };
    // the iPhone ends a touch twice – pointerup and touchend: the move counts once (Sascha 20.10.2026: "neither holding
    // nor the grip works" – the second end moved the next shot as well)
    let ended = false;
    const up = () => {
      if (ended) return;
      ended = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
      setDrag(null);
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 350);
      if (to !== from) reorderRef.current(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
  };
  /** The grip: at once (mouse and pen – a finger goes by its touch events, below). */
  const startDrag = (ev: React.PointerEvent, from: number) => {
    if (ev.pointerType === 'touch') return;
    ev.preventDefault();
    dragFrom(ev.clientY, from);
  };
  // The finger on the iPhone (Sascha 20.10.2026: "neither holding nor the grip works"): by its own touch events, not
  // Safari's pointer events – the grip takes the shot at once and keeps the page still, a row is lifted after a moment
  // held still; moving first scrolls the page as usual.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const start = (ev: TouchEvent) => {
      const t = ev.target as HTMLElement;
      const li = t.closest('li');
      const idx = li ? [...list.children].indexOf(li) : -1;
      if (idx < 0 || idx >= latestShots.current.length || t.closest('.row-delete') || !ev.touches[0]) return;
      const t0 = ev.touches[0];
      if (t.closest('.row-grip')) {
        ev.preventDefault();
        dragFrom(t0.clientY, idx);
        return;
      }
      let y = t0.clientY;
      const follow = (e: TouchEvent) => {
        const f = e.touches[0];
        if (!f) return;
        y = f.clientY;
        if (Math.hypot(f.clientX - t0.clientX, f.clientY - t0.clientY) > 8) cancel();
      };
      const cancel = () => {
        clearTimeout(timer);
        window.removeEventListener('touchmove', follow);
        window.removeEventListener('touchend', cancel);
        window.removeEventListener('touchcancel', cancel);
      };
      const timer = setTimeout(() => {
        cancel();
        dragFrom(y, idx);
      }, 450);
      window.addEventListener('touchmove', follow, { passive: true });
      window.addEventListener('touchend', cancel);
      window.addEventListener('touchcancel', cancel);
    };
    list.addEventListener('touchstart', start, { passive: false });
    return () => list.removeEventListener('touchstart', start);
  });
  /** The whole row (Sascha 18.10.2026: "take hold of a shot and move it"): a long press lifts it; moving the finger
   *  before that scrolls the page as usual, a short tap opens the shot. */
  const holdRow = (ev: React.PointerEvent, from: number) => {
    if (ev.pointerType === 'touch' || (ev.pointerType === 'mouse' && ev.button !== 0)) return; // a finger: by touch, above
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let y = y0;
    const follow = (cx: number, cy: number) => {
      y = cy;
      if (Math.hypot(cx - x0, cy - y0) > 8) cancel(); // the finger moved first: that is scrolling
    };
    const track = (e: PointerEvent) => follow(e.clientX, e.clientY);
    const touchTrack = (e: TouchEvent) => e.touches[0] && follow(e.touches[0].clientX, e.touches[0].clientY);
    const cancel = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('touchmove', touchTrack);
      window.removeEventListener('touchend', cancel);
    };
    const timer = setTimeout(() => {
      cancel();
      dragFrom(y, from);
    }, 450);
    window.addEventListener('pointermove', track);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('touchmove', touchTrack, { passive: true });
    window.addEventListener('touchend', cancel);
  };
  // what the caddie said on the course, with the player's verdict
  const [cadLog, setCadLog] = useState<CaddieLog>(() => loadCaddieLog(round.id));
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [moreCad, setMoreCad] = useState<number | null>(null); // hole whose other caddie advice is shown
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const hole = round.holes[k];
  const data = maps[k];
  const e = entries[k];
  const d: DetailEntry | null = e.detail ?? null;
  // the flag the player set with his putts wins
  const pin = e?.puttsAt?.pin ?? d?.pin ?? data?.greenCenter ?? null;
  const placedPutts = e?.puttsAt?.balls ?? null;
  const lengths = d ? shotLengths(d) : [];
  const onGreenSpot = (pos: LngLat, m: HoleMapData) => (m.green ? pointInRing(pos, m.green) : distanceM(pos, m.greenCenter) <= 12);
  const fmt = (m: number) => `${formatDistance(m, unit)} ${unit}`;
  // The GPS track of this hole: the walked path and where the player stood still – a shot the detection missed
  // (or gave to a partner's ball) is one tap on a grey circle away.
  const part = parts[k] ?? [];
  const stopsHere = useMemo(() => (part.length ? findStops(part).map((s) => s.p) : []), [part]);
  const freeStops = stopsHere.filter(
    (s) =>
      !(d?.shots ?? []).some((x) => x.pos && distanceM(x.pos, s) < 12) &&
      !(d?.onGreen && distanceM(d.onGreen, s) < 12) &&
      !(data && onGreenSpot(s, data)) &&
      !(data && distanceM(s, data.tee) < 15 && d?.shots[0]?.pos && distanceM(d.shots[0].pos, data.tee) < 15),
  );
  const walked = part.length ? { line: part.filter((x) => x.acc <= 15).map((x) => x.p), stops: freeStops } : null;

  const save = (index: number, patch: Partial<HoleEntry>) => {
    const list = entries.slice();
    list[index] = { ...list[index], ...patch };
    props.onChange({ ...round, entries: { ...round.entries, [me.id]: list } });
  };
  /** Saves shots and recomputes the derived values; a score the player entered by hand is kept. */
  const saveDetail = (index: number, detail: DetailEntry, putts = entries[index].putts, extra: Partial<HoleEntry> = {}) => {
    const entry = entries[index];
    const derived = deriveFromShots(detail, putts, round.holes[index].par, maps[index]);
    // The score the player entered stays: confirming a hole whose detected shots miss one (or with a penalty not yet
    // placed) must not change it. The score field above changes it; a difference shows the hint to fix the shots.
    if (entry.strokes != null || extra.strokes != null) delete derived.strokes;
    // penalties entered on the course stay until the player marks the shots they belong to
    if ((entry.penalties ?? 0) > (derived.penalties ?? 0) && !detail.shots.some((s) => s.penalty)) delete derived.penalties;
    save(index, { detail, putts, ...derived, ...extra });
  };

  // ---- Setting shots by hand (Sascha, 13.10.2026: "nothing detected on hole 1 and I cannot set a shot") ----
  // A tap on the map = where the ball lay: a shot is played from there. On the green = the ball for the putts.
  // Shots stay in playing order (further from the pin first); the tee shot is added by itself.
  const nearTee = (pos: LngLat, m: HoleMapData) => distanceM(pos, m.tee) <= 25;
  const lieFor = (pos: LngLat, n: number, m: HoleMapData) => (n === 0 && nearTee(pos, m) ? 'tee' : lieAt(pos, m, false, true));
  /** Clubs for shots without one, from their length (the player can change them). */
  const withClubs = (det: DetailEntry, par = round.holes[k].par): DetailEntry => {
    const len = shotLengths(det);
    return { ...det, shots: det.shots.map((x, n) => (x.club || len[n] == null ? x : { ...x, club: clubForLength(len[n]!, n === 0 && par >= 4, bag) })) };
  };
  /** The shots of hole i from the places noted by hand ("shot here") – in the order they were noted, the tee shot
   *  added when the first one was not on the tee; a place on the green is where the putts began. */
  const handDetail = (i: number, m: HoleMapData, base: DetailEntry, partI: TrackPoint[]): DetailEntry | null => {
    const hs = (round.manualShots ?? []).filter((x) => x.hole === i).sort((a, b) => a.t - b.t);
    if (!hs.length) return null;
    const onGreen = hs.map((x) => x.pos).filter((p) => onGreenSpot(p, m));
    const off = hs.map((x) => x.pos).filter((p) => !onGreenSpot(p, m));
    const shots: Shot[] = off.map((pos, n) => ({ pos, lie: lieFor(pos, n, m), club: null, penalty: false, byHand: true }));
    if (!shots.length || !nearTee(shots[0].pos!, m)) shots.unshift({ pos: teeSpot(partI, m) ?? m.tee, lie: 'tee', club: null, penalty: false });
    return withClubs({ ...base, shots, onGreen: onGreen[0] ?? base.onGreen, holedOut: false, fromHand: true }, round.holes[i].par);
  };
  /** Outside the course boundary = out of bounds (only where the course outline is known). */
  const isOut = (p: LngLat) => (geometry.boundary?.length ? !geometry.boundary.some((r) => pointInRing(p, r)) : false);
  /**
   * A shot dragged out of bounds (Sascha 16.10.2026, 6C: "the first tee shot right out of bounds – the penalty and
   * another shot should be added by themselves"): the shot before it (the tee shot itself when it is dragged) went
   * out there – one penalty stroke, and the next shot is played again from the same spot.
   */
  const dragOut = (n: number, pos: LngLat) => {
    if (!d) return;
    const shots = d.shots.slice();
    const m = n === 0 ? 0 : n - 1; // the shot that went out
    const from = shots[m].pos;
    shots[m] = { ...shots[m], penalty: true, penaltyKind: 'ob', missPos: pos, review: false };
    const replay: Shot = { pos: from, lie: shots[m].lie, club: null, penalty: false };
    if (n === 0) shots.splice(1, 0, replay);
    else shots[n] = replay;
    saveDetail(k, withClubs({ ...d, shots }));
    setNotice(
      tr(
        `Shot ${m + 1} out of bounds: penalty stroke and a new shot from the same spot added.`,
        `Schlag ${m + 1} im Aus: Strafschlag und neuer Schlag vom selben Ort ergänzt.`,
      ),
    );
  };
  const tapMap = (tap: LngLat) => {
    if (!data) return;
    // a tap on (next to) a grey circle sets the shot exactly where the player stood
    const snap = freeStops.reduce<LngLat | null>((b, s) => (distanceM(s, tap) < 15 && (!b || distanceM(s, tap) < distanceM(b, tap)) ? s : b), null);
    const pos = snap ?? tap;
    if (placingMiss != null && d) {
      const n = placingMiss;
      const shots = d.shots.slice();
      shots[n] = { ...shots[n], missPos: pos };
      // out of bounds = stroke and distance: the next shot is played from the same spot again
      const from = shots[n].pos;
      if (shots[n].penaltyKind === 'ob' && from && !(shots[n + 1]?.pos && distanceM(shots[n + 1].pos!, from) <= 10))
        shots.splice(n + 1, 0, { pos: from, lie: shots[n].lie, club: null, penalty: false });
      setPlacingMiss(null);
      saveDetail(k, withClubs({ ...d, shots }));
      return;
    }
    const base: DetailEntry = d ?? { ...emptyDetail(), pin: pinFor(k) };
    // A tap on (or right after dragging) a shot opens it instead of adding one next to it.
    const hit = adding ? -1 : base.shots.findIndex((x) => x.pos != null && distanceM(x.pos, pos) < 8);
    if (hit >= 0) return setEdit(hit);
    if (!adding && base.onGreen && distanceM(base.onGreen, pos) < 4) return;
    if (!adding && onGreenSpot(pos, data)) {
      saveDetail(k, withClubs({ ...base, onGreen: pos, holedOut: false }));
      return;
    }
    const pinNow = base.pin ?? data.greenCenter;
    const shots = base.shots.slice();
    if (shots.length === 0 && !nearTee(pos, data)) shots.push({ pos: teeSpot(part, data) ?? data.tee, lie: 'tee', club: null, penalty: false });
    const toPin = distanceM(pos, pinNow);
    let at = shots.findIndex((x) => x.pos != null && distanceM(x.pos, pinNow) < toPin);
    if (at < 0) at = shots.length;
    shots.splice(at, 0, { pos, lie: lieFor(pos, at, data), club: null, penalty: false });
    saveDetail(k, withClubs({ ...base, shots }));
    if (adding) {
      setAdding(false);
      setEdit(at); // the club and the kind of the new shot right away
    }
  };
  const addTeeShot = () => {
    if (!data || !d) return;
    // The first shot was the tee shot dragged to where the ball lay: its club goes with the tee shot.
    const [first, ...rest] = d.shots;
    const shots: Shot[] = [{ pos: teeSpot(part, data) ?? data.tee, lie: 'tee', club: first.club, penalty: false }, { ...first, club: null, kind: undefined }, ...rest];
    saveDetail(k, withClubs({ ...d, shots }));
  };
  /** Label of a shot while it is dragged: how far from the spot before, how far to the next spot (or the pin). */
  const dragLabel = (id: string, pos: LngLat): string | null => {
    if (!d) return null;
    // only the metres to the pin – as one measures on the course: how far it is still to the flag (Sascha 20.10.2026)
    if (id.startsWith('miss-') || id === 'green' || id.startsWith('putt-')) return pin ? fmt(distanceM(pos, pin)) : null;
    const n = Number(id.slice(5));
    if (isOut(pos)) return tr(`Out of bounds – penalty + new shot from ${n === 0 ? 'the tee' : `shot ${n}`}`, `Aus – Strafschlag + neuer Schlag ${n === 0 ? 'vom Abschlag' : `von Schlag ${n}`}`);
    return pin ? fmt(distanceM(pos, pin)) : null;
  };

  /** Shots near a place noted by hand go to that place – each place takes the nearest shot within 40 m; with
   *  `onlyToCheck` only the suggestions not confirmed yet move (what the player set or confirmed stays). */
  const snapToHand = (shots: Shot[], i: number, m: HoleMapData, onlyToCheck: boolean): Shot[] => {
    const out = shots.slice();
    const taken = new Set<number>();
    for (const x of (round.manualShots ?? []).filter((y) => y.hole === i)) {
      let best = -1;
      out.forEach((s, n) => {
        if (taken.has(n) || !s.pos || (onlyToCheck && !s.review)) return;
        const dd = distanceM(s.pos, x.pos);
        if (dd <= 40 && (best < 0 || dd < distanceM(out[best].pos!, x.pos))) best = n;
      });
      if (best >= 0) {
        taken.add(best);
        if (distanceM(out[best].pos!, x.pos) > 0.5) out[best] = { ...out[best], pos: x.pos, lie: lieFor(x.pos, best, m), byHand: true };
      }
    }
    return out;
  };

  const detectAll = () => {
    let holes = 0;
    let byHand = 0;
    const list = entries.slice();
    const parts = splitRound(track, maps);
    round.holes.forEach((h, i) => {
      const m = maps[i];
      // holes the player touched (a shot moved, set, edited – or the hole confirmed) stay as they are; the rest is
      // detected again, so older rounds profit from a better detection
      if (!m || list[i].detail?.shots.some((x) => !x.review)) return;
      const part = parts[i] ?? [];
      // score, putts and penalties from the course: the number of swings, water and out of bounds (see track.ts)
      const e = list[i];
      // the places the player noted by hand on the course are the truth (Sascha 18.10.2026: "take them over by
      // themselves") – the GPS detection only where there are none; still to check like every first suggestion
      const hand = handDetail(i, m, { ...emptyDetail(), pin: pinFor(i) }, part);
      const gps = hand ? null : detectWithScore(part, m, h.par, bag, e);
      // a GPS shot near a place noted by hand goes to that place – the tap is the truth, the GPS is ±15 m (Sascha
      // 20.10.2026: "the club should show where the shot was noted"); each place takes the nearest shot within 40 m
      if (gps) gps.shots = snapToHand(gps.shots, i, m, false);
      const found = hand ? { ...hand, shots: hand.shots.map((s) => ({ ...s, review: true })) } : gps;
      if (!found) return;
      holes++;
      if (hand) byHand++;
      const derived = deriveFromShots(found, list[i].putts, h.par, m);
      if (list[i].strokes != null) delete derived.strokes; // keep the score entered on the course
      if ((e.penalties ?? 0) > (derived.penalties ?? 0)) delete derived.penalties; // and its penalties, not yet placed
      // what the player said on the course beats the GPS (a ball at the fairway edge is ±5 m): fairway and bunker
      if (e.fairway != null) delete derived.fairway;
      if (e.greensideBunker) {
        delete derived.greensideBunker;
        delete derived.upAndDown;
      }
      // putts placed on the course: the first putt is where the ball lay, nothing to check there any more
      const placed = e.puttsAt?.balls[0];
      list[i] = { ...list[i], detail: { ...found, ...(placed ? { onGreen: placed } : {}), pin: pinFor(i) }, ...derived };
    });
    props.onChange({ ...round, entries: { ...round.entries, [me.id]: list } });
    setNotice(
      byHand
        ? tr(
            `Shots on ${holes} ${holes === 1 ? 'hole' : 'holes'} – ${byHand} from your "shot here" places${holes > byHand ? `, ${holes - byHand} from the GPS track` : ''}. Please check them.`,
            `Schläge an ${holes} ${holes === 1 ? 'Loch' : 'Löchern'} – ${byHand} aus deinen „Schlag hier“-Punkten${holes > byHand ? `, ${holes - byHand} aus der GPS-Spur` : ''}. Bitte prüfen.`,
          )
        : holes
        ? tr(`Shots detected on ${holes} ${holes === 1 ? 'hole' : 'holes'} – please check them.`, `Schläge an ${holes} ${holes === 1 ? 'Loch' : 'Löchern'} erkannt – bitte prüfen.`)
        : tr('No shots found in the GPS track.', 'Keine Schläge in der GPS-Spur gefunden.'),
    );
  };

  // First visit after the round: no shots yet but a GPS track – find them right away (no extra button to tap).
  useEffect(() => {
    if (track.length > 20 && !entries.some((x) => x.detail?.shots.length)) detectAll();
    else if ((round.manualShots ?? []).length) {
      // shots still to check (suggestions of the detection) go to the places noted by hand nearby (Sascha 20.10.2026)
      let changed = false;
      const list = entries.map((x, i) => {
        const m = maps[i];
        if (!m || !x.detail?.shots.some((s) => s.review)) return x;
        const shots = snapToHand(x.detail.shots, i, m, true);
        if (shots.every((s, n) => s === x.detail!.shots[n])) return x;
        changed = true;
        return { ...x, detail: { ...x.detail, shots } };
      });
      if (changed) props.onChange({ ...round, entries: { ...round.entries, [me.id]: list } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Holes other than this one that still have shots marked for checking.
  const openHoles = entries.flatMap((x, i) => (i !== k && x.detail?.shots.some((s) => s.review) ? [i] : []));
  const last = k === round.holes.length - 1;
  const goTo = (i: number) => {
    setK(i);
    setEdit(null);
    window.scrollTo(0, 0); // the map is at the top
  };
  /** Shot 1 is played from the tee – a GPS point a few metres off the tee box must not make it "fairway" (Sascha
   *  18.10.2026: "it says a hole is not checked, but I checked them all"); a tee shot moved down gets its lie from the map. */
  const teeFirst = (shots: Shot[]): Shot[] =>
    shots.map((s, n) => (n === 0 ? { ...s, lie: 'tee' } : s.lie === 'tee' && s.pos && data ? { ...s, lie: lieAt(s.pos, data, false, true) } : s));
  const confirmHole = () => {
    if (d) saveDetail(k, { ...d, shots: teeFirst(d.shots.map((s) => ({ ...s, review: false }))) });
    setNotice(null);
    if (!last) return goTo(k + 1);
    // Last hole: on to the first hole still to check, otherwise the check is done.
    if (openHoles.length) {
      const n = openHoles.reduce((c, i) => c + entries[i].detail!.shots.filter((s) => s.review).length, 0);
      const labels = openHoles.map((i) => round.holes[i].label).join(', ');
      setNotice(
        tr(
          `${n} ${n === 1 ? 'shot' : 'shots'} still to check (hole ${labels}) – here is the first one.`,
          `Noch ${n} ${n === 1 ? 'Schlag' : 'Schläge'} zu prüfen (Loch ${labels}) – hier ist der erste.`,
        ),
      );
      return goTo(openHoles[0]);
    }
    props.onDone();
  };

  // The caddie's advice at the player's own shots first (that is what the verdict is about); advice given where he
  // only stood (a partner's ball, waiting) behind "more".
  const cadAll = (cadLog[k] ?? []).map((c, n) => {
    const putt = c.club === 'Putt'; // the putt read on the green
    const shot = putt ? -1 : (d?.shots ?? []).findIndex((s) => s.pos != null && distanceM(s.pos, c.pos) <= 20);
    return { c, n, shot: shot >= 0 ? shot : null, putt };
  });
  const cadMain = d?.shots.length ? cadAll.filter((x) => x.shot != null || x.putt) : cadAll;
  const cadOther = cadMain.length ? cadAll.filter((x) => !cadMain.includes(x)) : []; // none at a shot: all are shown
  const cadShown = moreCad === k ? [...cadMain, ...cadOther] : cadMain.length ? cadMain : cadAll;
  const editing: Shot | null = d && edit != null ? d.shots[edit] : null;
  const roundTotal = entries.reduce(
    (t, x, i) => (x.strokes != null && !x.pickedUp ? { strokes: t.strokes + x.strokes, par: t.par + round.holes[i].par, holes: t.holes + 1 } : t),
    { strokes: 0, par: 0, holes: 0 },
  );
  latestShots.current = d?.shots ?? [];
  reorderRef.current = (from: number, to: number) => {
    if (!d) return;
    const shots = d.shots.slice();
    const [x] = shots.splice(from, 1);
    shots.splice(to, 0, { ...x, review: false });
    saveDetail(k, { ...d, shots: teeFirst(shots) });
  };
  const shotCount = d ? d.shots.length + Math.max(d.shots.filter((s) => s.penalty).length, e.penalties ?? 0) + (d.holedOut ? 0 : (e.putts ?? 0)) : null;
  const unplacedPenalty = d != null && d.shots.length > 0 && (e.penalties ?? 0) > d.shots.filter((s) => s.penalty).length;
  // an unplaced penalty explains a difference by itself (out of bounds: the replay comes with marking the shot)
  const mismatch = d && e.strokes != null && shotCount != null && d.onGreen && e.putts != null && shotCount !== e.strokes && !unplacedPenalty;

  return (
    <main className="screen review">
      <TopBar title={tr('Check your shots', 'Schläge prüfen')} onBack={props.onDone} backLabel={tr('Done', 'Fertig')} />
      {notice && <div className="notice">{notice}</div>}

      <div className="review-nav">
        <button type="button" className="icon-btn" aria-label={tr('Previous hole', 'Voriges Loch')} disabled={k === 0} onClick={() => goTo(k - 1)}>
          ←
        </button>
        <div style={{ textAlign: 'center' }}>
          <strong>{tr('Hole', 'Loch')} {hole.label}</strong>
          <div className="muted small">
            Par {hole.par}{hole.strokeIndex ? ` · Hcp ${hole.strokeIndex}` : ''}
            {(e.penalties ?? 0) > 0 ? tr(` · ${e.penalties} penalty`, ` · ${e.penalties} Strafschlag${e.penalties === 1 ? '' : 'e'}`) : ''}
          </div>
          <div className="muted small">
            {tr('Round', 'Runde')}: {roundTotal.strokes} ({formatToPar(roundTotal.strokes - roundTotal.par)}) {tr(`after ${roundTotal.holes} holes`, `nach ${roundTotal.holes} Löchern`)}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label={tr('Next hole', 'Nächstes Loch')} disabled={last} onClick={() => goTo(k + 1)}>
          →
        </button>
      </div>

      {/* the score as entered – edited behind the pencil in the same panel as on the course: strokes, putts, sand shots,
          penalties, tee shot (Sascha 20.10.2026) */}
      {/* the hole's score as the scorecard shows the round's (Sascha 20.10.2026: "not nice yet"): the numbers in one row,
          the pencil at the right – it opens the course's score panel */}
      <section className="card sc-hero review-score">
        <div className="sc-hero-main">
          <div>
            <div className="sc-big">{e.pickedUp ? '–' : (e.strokes ?? '–')}</div>
            <div className="muted small">{tr('strokes', 'Schläge')}</div>
          </div>
          <div>
            <div className="sc-mid">{e.strokes != null && !e.pickedUp && hole.par > 0 ? scoreName(e.strokes - hole.par) : '–'}</div>
            <div className="muted small">{tr('to par', 'zu Par')}</div>
          </div>
          <div>
            <div className="sc-mid">{e.putts ?? '–'}</div>
            <div className="muted small">Putts</div>
          </div>
          {(e.sandShots ?? 0) > 0 && (
            <div>
              <div className="sc-mid">{e.sandShots}</div>
              <div className="muted small">Sand</div>
            </div>
          )}
          {(e.penalties ?? 0) > 0 && (
            <div>
              <div className="sc-mid">{e.penalties}</div>
              <div className="muted small">{tr('penalty', 'Strafe')}</div>
            </div>
          )}
        </div>
        <button type="button" className="pencil" aria-label={tr(`Edit the score of hole ${hole.label}`, `Score an Loch ${hole.label} bearbeiten`)} onClick={() => setScoreOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </button>
      </section>
      {scoreOpen && (
        <div className="score-panel-screen">
          <ScoreSheet
            hole={hole}
            players={[me]}
            entries={{ [me.id]: e }}
            toPar={{ [me.id]: null }}
            canPlacePutts={!!data}
            pickUp={pickUpAllowed(props.round)}
            onChange={(_, patch) => {
              // putts change the shots' detail too (0 putts = holed from off the green)
              if ('putts' in patch) {
                const base: DetailEntry = d ?? { ...emptyDetail(), pin: pinFor(k) };
                const { putts, ...rest } = patch;
                saveDetail(k, { ...base, holedOut: putts === 0 }, putts ?? null, rest);
              } else save(k, patch);
            }}
            onPlacePutts={() => {
              setScoreOpen(false);
              setPuttEdit(true);
            }}
            onClose={() => setScoreOpen(false)}
            closeLabel={tr('Back to the shot check', 'Zurück zu Schläge prüfen')}
          />
        </div>
      )}
      {data && (
        <div className="review-map">
          {/* aerial image or 2D – the same tool as on the course (Sascha 17.10.2026: "looks different again") */}
          <div className="map-toolbar review-tools">
            <button type="button" className="map-tool" aria-pressed={view2d} aria-label={view2d ? tr('Aerial image', 'Luftbild zeigen') : tr('Drawn hole (2D)', 'Gezeichnetes Loch (2D)')} title="2D" onClick={toggleView}>
              <span className="map-tool-text">2D</span>
            </button>
          </div>
          <HoleMap
            holeKey={`review-${k}`}
            plain
            padding={{ top: 24, bottom: 24, left: 24, right: 24 }}
            data={data}
            player={null}
            from={data.tee}
            pin={pin ?? data.greenCenter}
            targets={[]}
            unit={unit}
            imagery={imagery}
            onImageryFail={() => (imagery.id !== 'esri' ? setImageryPref('esri') : setView2d(true))}
            view={view2d ? '2d' : 'aerial'}
            trees={view2d ? [...(geometry.trees ?? []), ...(geometry.canopy ?? [])].filter((r) => r.some((q) => distToLine(q, data.line) <= 60)) : undefined}
            details={
              view2d
                ? {
                    treePoints: (geometry.treePoints ?? []).filter((q) => distToLine(q, data.line) <= 60),
                    treeRows: (geometry.treeRows ?? []).filter((l) => l.some((q) => distToLine(q, data.line) <= 60)),
                    paths: (geometry.paths ?? []).filter((l) => l.some((q) => distToLine(q, data.line) <= 60)),
                    rough: [],
                    ob: [],
                    around: { fairway: geometry.fairwayAuto?.[hole.label] ?? [], tee: [], green: [], bunker: [], water: geometry.water.filter((r) => r.some((q) => distToLine(q, data.line) <= 60)) },
                  }
                : undefined
            }
            walked={walked}
            track={[
              // the shots noted by hand on the course: shown and movable here too (Sascha 17.10.2026) – unless the hole's
              // shots are made of them: then each shot is drawn as its hand circle with its club, once (20.10.2026)
              ...(round.manualShots ?? [])
                .map((x, kk) => ({ x, kk }))
                .filter(({ x }) => x.hole === k && !(d?.shots ?? []).some((sh) => sh.pos && distanceM(sh.pos, x.pos) <= 5))
                .map(({ x, kk }, n) => ({ id: `hand-${kk}`, pos: x.pos, label: String(n + 1), hand: true })),
              // the cracks the microphone heard (test, Sascha 18.10.2026) – to compare with the shots
              ...(round.soundShots ?? [])
                .filter((x) => x.hole === k)
                .map((x) => ({ pos: x.pos, label: new Date(x.t).toLocaleTimeString(getLang() === 'de' ? 'de-DE' : undefined, { hour: '2-digit', minute: '2-digit' }), sound: true })),
              // Where strokes are won (green) and lost (red): every shot coloured by its strokes gained.
              ...(d?.shots ?? []).flatMap((s, n) => {
                const len = lengths[n];
                void len;
                const byHand = s.byHand || (!!s.pos && (round.manualShots ?? []).some((x) => x.hole === k && distanceM(x.pos, s.pos!) <= 5));
                const shot = s.pos
                  ? [{ id: `shot-${n}`, pos: s.pos, label: `${n + 1}${s.club ? ' ' + clubCode(s.club) : ''}${s.review ? ' ?' : ''}`, ...(byHand ? { shotByHand: { n: String(n + 1), club: s.club ? clubCode(s.club) : null } } : {}) }]
                  : [];
                // where the ball went into the water / out of bounds – between this shot and the next
                const miss = s.penalty && s.missPos ? [{ id: `miss-${n}`, pos: s.missPos, tone: 'bad' as const, label: '✕' }] : [];
                return [...shot, ...miss];
              }),
              ...(placedPutts?.length && pin
                ? // one label at the first ball (the balls lie close together on the whole hole), the others their number
                  placedPutts.map((b, n) => ({
                    id: n === 0 ? 'green' : `putt-${n}`,
                    pos: b,
                    label: `P${n + 1}`,
                    green: true,
                  }))
                : d?.onGreen
                  ? [{ id: 'green', pos: d.onGreen, label: 'P1', green: true }]
                  : []),
            ]}
            onTargetsChange={() => {}}
            onTargetRemove={() => {}}
            onPinChange={(p) => d && saveDetail(k, { ...d, pin: p })}
            onTrackMove={(id, pos) => {
              if (id.startsWith('hand-')) {
                const kk = Number(id.slice(5));
                const list = (round.manualShots ?? []).slice();
                if (list[kk]) list[kk] = { ...list[kk], pos, acc: 0, placed: true };
                return props.onChange({ ...round, manualShots: list });
              }
              if (!d) return;
              // Drag a shot (or the ball on the green) to where it really was; lengths and strokes gained follow.
              if (id === 'green' || id.startsWith('putt-')) {
                // a placed putt ball moved: the putts keep it, the first one is where the ball reached the green
                const n = id === 'green' ? 0 : Number(id.slice(5));
                if (placedPutts && e.puttsAt) save(k, { puttsAt: { ...e.puttsAt, balls: placedPutts.map((b, j) => (j === n ? pos : b)) } });
                if (n === 0) saveDetail(k, { ...d, onGreen: pos });
              }
              else if (id.startsWith('miss-')) {
                const n = Number(id.slice(5));
                const shots = d.shots.slice();
                shots[n] = { ...shots[n], missPos: pos };
                saveDetail(k, { ...d, shots });
              } else {
                const n = Number(id.slice(5));
                if (isOut(pos)) return dragOut(n, pos);
                const shots = d.shots.slice();
                shots[n] = { ...shots[n], pos, lie: data ? lieFor(pos, n, data) : shots[n].lie, review: false };
                saveDetail(k, { ...d, shots });
              }
            }}
            onTrackDrag={dragLabel}
            onMapTap={tapMap}
          />
        </div>
      )}

      {placingMiss != null && d?.shots[placingMiss] && (
        <div className="notice">
          {d.shots[placingMiss].penaltyKind === 'ob'
            ? tr(`Tap the map where shot ${placingMiss + 1} went out of bounds.`, `Tippe auf die Karte, wo Schlag ${placingMiss + 1} ins Aus ging.`)
            : tr(`Tap the map where shot ${placingMiss + 1} went into the water.`, `Tippe auf die Karte, wo Schlag ${placingMiss + 1} ins Wasser ging.`)}{' '}
          <button type="button" className="btn-ghost" onClick={() => setPlacingMiss(null)}>
            {tr('Skip', 'Überspringen')}
          </button>
        </div>
      )}

      {unplacedPenalty && (
        <div className="notice">
          {tr(
            `${e.penalties} penalty ${e.penalties === 1 ? 'stroke' : 'strokes'} from the course – tap the shot it belongs to and choose water or out of bounds.`,
            `${e.penalties} Strafschlag${e.penalties === 1 ? '' : 'e'} vom Platz – tippe den Schlag an, zu dem ${e.penalties === 1 ? 'er' : 'sie'} gehör${e.penalties === 1 ? 't' : 'en'}, und wähle Wasser oder Aus.`,
          )}
        </div>
      )}
      {mismatch && (
        <div className="notice">
          {tr(
            `Your score was ${e.strokes}, the shots add up to ${shotCount}. Please add or delete a shot, or correct the putts.`,
            `Dein Score war ${e.strokes}, die Schläge ergeben ${shotCount}. Bitte einen Schlag ergänzen oder löschen oder die Putts korrigieren.`,
          )}
        </div>
      )}

      {/* the shots: add one with the "shot here" symbol, delete in the row, reorder by the grip (Sascha 17.10.2026) */}
      {data && (
        <div className="review-shots-head">
          <span className="eyebrow">{tr('Shots', 'Schläge')}</span>
          <button
            type="button"
            className="map-shot-btn small"
            aria-pressed={adding}
            aria-label={tr('Add a shot', 'Schlag hinzufügen')}
            title={tr('Add a shot', 'Schlag hinzufügen')}
            onClick={() => {
              if (!adding) window.scrollTo({ top: 0, behavior: 'smooth' });
              setAdding(!adding);
            }}
          >
            <ShotHereIcon size={20} />
          </button>
        </div>
      )}
      {adding && (
        <div className="notice" role="status">
          {tr('Tap the map where the shot was played – a grey circle (where you stood) puts it there exactly.', 'Tippe auf die Karte, wo der Schlag gespielt wurde – ein grauer Kreis (wo du standest) setzt ihn genau dorthin.')}
        </div>
      )}

      {!d || d.shots.length === 0 ? (
        <p className="muted">{tr('No shots yet – tap the map.', 'Noch keine Schläge – tippe auf die Karte.')}</p>
      ) : (
        <ol className="shot-list review-list" ref={listRef}>
          {d.shots.map((s, n) => {
            const toPin = s.pos && pin ? distanceM(s.pos, pin) : null;
            const kind = s.kind ?? suggestKind(s.lie, toPin);
            const odd = shotOdd(d, n);
            const cls = [s.review || odd ? 'check' : '', drag?.from === n ? 'dragging' : '', drag && drag.from !== n && drag.to === n ? (drag.to < drag.from ? 'drop-before' : 'drop-after') : ''].join(' ').trim();
            return (
              <li key={n} className={cls || undefined} style={drag?.from === n ? { transform: `translateY(${drag.dy}px)` } : undefined} onPointerDown={(ev) => !(ev.target as HTMLElement).closest('.row-grip, .row-delete') && holdRow(ev, n)} onContextMenu={(e) => e.preventDefault()}>
                <span className="n">{n + 1}</span>
                <button type="button" className="shot-row" onClick={() => !justDragged.current && setEdit(n)}>
                  <strong>{s.club ? clubCode(s.club) : '–'}</strong> · {KINDS.find((x) => x.value === kind)!.label}
                  <span className="muted small" style={{ display: 'block' }}>
                    {lieName(s.lie)}
                    {lengths[n] != null ? ` · ${fmt(lengths[n]!)}` : ''}
                    {s.penalty ? (s.penaltyKind === 'ob' ? tr(' · out of bounds (+1)', ' · ins Aus (+1)') : s.penaltyKind === 'water' ? tr(' · water (+1)', ' · ins Wasser (+1)') : tr(' · +1 penalty', ' · +1 Strafschlag')) : ''}
                    {s.review && !odd ? tr(' · check', ' · prüfen') : ''}
                  </span>
                  {odd && <span className="bad-text small" style={{ display: 'block' }}>{tr('Impossible length – drag the shot to where the ball was', 'Unmögliche Länge – Schlag auf der Karte an die richtige Stelle ziehen')}</span>}
                </button>
                <button type="button" className="icon-btn row-delete" aria-label={tr(`Delete shot ${n + 1}`, `Schlag ${n + 1} löschen`)} onClick={() => saveDetail(k, { ...d, shots: d.shots.filter((_, j) => j !== n) })}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                  </svg>
                </button>
                {/* hold the grip and move the shot up or down in the order */}
                <span className="row-grip" role="button" tabIndex={-1} aria-label={tr(`Move shot ${n + 1}`, `Schlag ${n + 1} verschieben`)} onPointerDown={(ev) => startDrag(ev, n)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </span>
              </li>
            );
          })}
          {d.onGreen && (
            <li>
              <span className="n">⛳</span>
              <span>
                {e.putts ?? '–'} Putt{e.putts === 1 ? '' : 's'}
                <span className="muted small" style={{ display: 'block' }}>
                  {placedPutts?.length && pin
                    ? placedPutts.map((b, n) => `${n + 1}: ${fmt(distanceM(b, pin))}`).join(' · ')
                    : `${tr('first putt', 'erster Putt')} ${firstPuttM({ ...d, pin: pin ?? d.pin }) != null ? fmt(firstPuttM({ ...d, pin: pin ?? d.pin })!) : '–'}`}
                </span>
              </span>
              {/* the putts on the green: the pencil here, where the other shots are edited (Sascha 20.10.2026) */}
              {data && (e.putts ?? 0) > 0 ? (
                <button type="button" className="icon-btn row-edit" aria-label={placedPutts?.length ? tr('Edit the putts on the green', 'Putts auf dem Grün bearbeiten') : tr('Place the putts on the green', 'Putts auf dem Grün setzen')} onClick={() => setPuttEdit(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                    <path d="M13.5 6.5l4 4" />
                  </svg>
                </button>
              ) : (
                <span />
              )}
              <span />
            </li>
          )}
        </ol>
      )}

      {d && data && d.shots.length > 0 && (!d.shots[0].pos || !nearTee(d.shots[0].pos, data)) && (
        <button type="button" className="btn-secondary" onClick={addTeeShot}>
          {tr('Tee shot missing – add it at the tee', 'Abschlag fehlt – am Abschlag ergänzen')}
        </button>
      )}
      {puttEdit && data && (e.putts ?? 0) > 0 && (
        <PuttEditor
          title={tr(`Hole ${hole.label} · ${e.putts} ${e.putts === 1 ? 'putt' : 'putts'}`, `Loch ${hole.label} · ${e.putts} Putt${e.putts === 1 ? '' : 's'}`)}
          green={data.green}
          greenCenter={data.greenCenter}
          bunkers={data.bunkers}
          from={approachFrom(data)}
          pin={pin ?? data.greenCenter}
          putts={e.putts!}
          balls={placedPutts}
          ballOnGreen={d?.onGreen ?? null}
          walk={greenWalk(track, data.green, data.greenCenter)}
          onCancel={() => setPuttEdit(false)}
          onSave={(v) => {
            setPuttEdit(false);
            const base: DetailEntry = d ?? { ...emptyDetail(), pin: v.pin };
            const detail = { ...base, onGreen: v.balls[0], pin: v.pin };
            const derived = deriveFromShots(detail, e.putts, hole.par, data);
            if (e.strokes != null) delete derived.strokes;
            save(k, { puttsAt: v, detail, ...derived });
          }}
        />
      )}

      {SHOW_CADDIE_REVIEW && (cadLog[k]?.length ?? 0) > 0 && (
        <section className="caddie-review" aria-label={tr('What the caddie said', 'Was der Caddie gesagt hat')}>
          <h3>{tr('What the caddie said – and you?', 'Was der Caddie gesagt hat – und du?')}</h3>
          {cadShown.map(({ c, n, shot, putt }) => (
            <div key={n} className="caddie-review-item">
              <div>
                {putt ? (
                  <strong>
                    {tr('Putt read', 'Putt-Linie')} · {fmt(c.toPin)}
                  </strong>
                ) : (
                  <>
                    <strong>{shot != null ? `${tr('Shot', 'Schlag')} ${shot + 1} · ` : ''}{fmt(c.toPin)} {tr('to the pin', 'zur Fahne')} · {c.club}</strong>
                    <span className="muted small"> · {tr('plays like', 'spielt wie')} {fmt(c.playsLike)}</span>
                  </>
                )}
              </div>
              {c.aim && <div className="small">{c.aim}</div>}
              {c.plan && <div className="small muted">{c.plan}</div>}
              {c.warning && <div className="small bad-text">{c.warning}</div>}
              <div className="caddie-review-vote" role="group" aria-label={tr('Your view', 'Deine Einschätzung')}>
                <button type="button" aria-pressed={c.verdict === 'ok'} onClick={() => { setCadLog({ ...rateCaddie(round.id, k, n, c.verdict === 'ok' ? undefined : 'ok') }); setNoteFor(null); }}>
                  {tr('👍 Fits', '👍 Passt')}
                </button>
                {putt ? (
                  // the putt line: how the ball really broke – the data to calibrate green slope and speed
                  puttVerdicts().map((v) => (
                    <button key={v.note} type="button" aria-pressed={c.verdict === 'other' && c.note === v.note} onClick={() => setCadLog({ ...rateCaddie(round.id, k, n, 'other', v.note) })}>
                      {v.label}
                    </button>
                  ))
                ) : (
                  <button type="button" aria-pressed={c.verdict === 'other'} onClick={() => { setCadLog({ ...rateCaddie(round.id, k, n, 'other') }); setNoteFor(n); }}>
                    {tr('✋ I’d play it differently', '✋ Würde ich anders spielen')}
                  </button>
                )}
              </div>
              {c.verdict === 'other' && !putt && (noteFor === n || c.note) && (
                <textarea
                  className="input"
                  rows={2}
                  placeholder={tr('What would you do – club, target, why?', 'Was würdest du machen – Schläger, Ziel, warum?')}
                  defaultValue={c.note ?? ''}
                  onBlur={(ev) => setCadLog({ ...rateCaddie(round.id, k, n, 'other', ev.target.value.trim()) })}
                />
              )}
              {c.verdict === 'other' && c.note && c.club !== 'Putt' && (
                // the player's own knowledge for next time: the caddie card shows hole notes on this hole
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={savedNote === `${k}:${c.note}`}
                  onClick={() => {
                    const notes = loadHoleNotes(round.courseId);
                    saveHoleNote(round.courseId, hole.label, { ...(notes[hole.label] ?? {}), text: c.note });
                    setSavedNote(`${k}:${c.note}`);
                  }}
                >
                  {savedNote === `${k}:${c.note}` ? tr('Kept as hole note ✓', 'Als Lochnotiz gemerkt ✓') : tr('Keep as hole note for next time', 'Fürs nächste Mal als Lochnotiz merken')}
                </button>
              )}
            </div>
          ))}
          {cadOther.length > 0 && moreCad !== k && (
            <button type="button" className="btn-ghost" onClick={() => setMoreCad(k)}>
              {tr(`${cadOther.length} more (where you stood, not a shot)`, `${cadOther.length} weitere (wo du standest, kein Schlag)`)}
            </button>
          )}
        </section>
      )}

      <span className="spacer" />
      <div className="sticky-cta">
        <button type="button" className="btn-primary" onClick={confirmHole}>
          {!last
            ? tr(`Confirm hole ${hole.label} →`, `Loch ${hole.label} bestätigen →`)
            : openHoles.length
              ? tr(`Confirm hole ${hole.label} → still to check`, `Loch ${hole.label} bestätigen → noch offene prüfen`)
              : round.signedAt || round.capture === 'score'
                ? tr('Confirm round ✓', 'Runde bestätigen ✓')
                : tr('Confirm & sign the round ✓', 'Runde bestätigen & signieren ✓')}
        </button>
      </div>

      {editing && d && (
        <ShotSheet
          title={tr(`Hole ${hole.label} · shot ${edit! + 1}`, `Loch ${hole.label} · Schlag ${edit! + 1}`)}
          lie={editing.lie}
          club={editing.club}
          penalty={editing.penalty}
          kind={editing.kind}
          toPinM={editing.pos && pin ? distanceM(editing.pos, pin) : null}
          editing
          bag={bag}
          onCancel={() => setEdit(null)}
          penaltyKind={editing.penaltyKind}
          onSave={(v) => {
            const shots = d.shots.slice();
            shots[edit!] = { ...shots[edit!], ...v, missPos: v.penalty ? shots[edit!].missPos : null };
            saveDetail(k, { ...d, shots });
            if (v.penalty && !shots[edit!].missPos) setPlacingMiss(edit);
            setEdit(null);
          }}
          onDelete={() => {
            saveDetail(k, { ...d, shots: d.shots.filter((_, n) => n !== edit) });
            setEdit(null);
          }}
        />
      )}
    </main>
  );
}
