import { useEffect, useMemo, useState } from 'react';
import type { DetailEntry, HoleEntry, LngLat, Round, Shot } from '../types';
import { distanceM, distToLine, holeMapData, pointInRing, type HoleMapData } from '../lib/geo';
import { deriveFromShots, emptyDetail, firstPuttM, KINDS, lieAt, lieName, shotLengths, suggestKind } from '../lib/shots';
import { clubForLength, detectWithScore, findStops, loadTrack, splitRound, teeSpot } from '../lib/track';
import { loadCachedCourse, loadCarryBag, loadGeometry, loadImagery, loadLive, loadRounds, loadUnit } from '../lib/storage';
import { loadHoleNotes, saveHoleNote } from '../lib/holenotes';
import { loadRegionalImagery, pickImagery } from '../lib/imagery';
import { playerBag } from '../lib/stats';
import { formatDistance } from '../lib/geo';
import { HoleMap } from '../components/HoleMap';
import { PuttEditor } from '../components/PuttEditor';
import { greenWalk } from '../lib/greenwalk';
import { approachFrom } from '../lib/geo';
import { holeForTee } from '../lib/teeline';
import { ShotSheet } from '../components/ShotSheet';
import { Segmented, Stepper, TopBar, formatToPar } from '../components/ui';
import { loadCaddieLog, rateCaddie, type CaddieLog } from '../lib/caddielog';
import { clubCode, tr } from '../lib/i18n';
import { buildExport, exportFileName, shareExport } from '../lib/roundexport';
import { isTestMode } from '../lib/testmode';

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
  const geometry = useMemo(() => loadGeometry(round.courseId), [round.courseId]);
  // the same holes as on the course: from the tee the player played (yellow, red …), not the back tee of the map
  const maps = useMemo(() => round.holes.map((h) => holeForTee(holeMapData(geometry, h.loop, h.number), round.courseId, h.label, round.tee, geometry.tee)), [geometry, round.holes, round.courseId, round.tee]);
  const track = useMemo(() => loadTrack(round.id), [round.id]);
  // where the pin was on the course ("Where is the pin today?" or the dragged flag) – else the middle of the green
  const coursePins = useMemo(() => loadLive(round.id).plans, [round.id]);
  // the pin the player set with his putts on the course wins, then the one from the hole map
  const pinFor = (index: number): LngLat | null => round.entries[me.id][index]?.puttsAt?.pin ?? coursePins[index]?.pin ?? maps[index]?.greenCenter ?? null;
  const parts = useMemo(() => (track.length > 20 ? splitRound(track, maps) : []), [track, maps]);
  const bag = useMemo(() => playerBag(loadRounds().filter((r) => r.finishedAt && r.id !== round.id), 3, loadCarryBag()?.map((b) => b.club) ?? null), [round.id]);
  const unit = loadUnit();
  const course = loadCachedCourse(round.courseId);
  const imageryAt: LngLat = course ? [course.lon, course.lat] : (maps.find(Boolean)?.greenCenter ?? [0, 0]);
  const imagery = pickImagery(imageryAt, loadImagery());
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
  const saveDetail = (index: number, detail: DetailEntry, putts = entries[index].putts) => {
    const entry = entries[index];
    const derived = deriveFromShots(detail, putts, round.holes[index].par, maps[index]);
    // The score the player entered stays: confirming a hole whose detected shots miss one (or with a penalty not yet
    // placed) must not change it. The score field above changes it; a difference shows the hint to fix the shots.
    if (entry.strokes != null) delete derived.strokes;
    // penalties entered on the course stay until the player marks the shots they belong to
    if ((entry.penalties ?? 0) > (derived.penalties ?? 0) && !detail.shots.some((s) => s.penalty)) delete derived.penalties;
    save(index, { detail, putts, ...derived });
  };

  // ---- Setting shots by hand (Sascha, 13.10.2026: "nothing detected on hole 1 and I cannot set a shot") ----
  // A tap on the map = where the ball lay: a shot is played from there. On the green = the ball for the putts.
  // Shots stay in playing order (further from the pin first); the tee shot is added by itself.
  const nearTee = (pos: LngLat, m: HoleMapData) => distanceM(pos, m.tee) <= 25;
  const lieFor = (pos: LngLat, n: number, m: HoleMapData) => (n === 0 && nearTee(pos, m) ? 'tee' : lieAt(pos, m, false));
  /** Clubs for shots without one, from their length (the player can change them). */
  const withClubs = (det: DetailEntry): DetailEntry => {
    const len = shotLengths(det);
    return { ...det, shots: det.shots.map((x, n) => (x.club || len[n] == null ? x : { ...x, club: clubForLength(len[n]!, n === 0 && round.holes[k].par >= 4, bag) })) };
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
    const hit = base.shots.findIndex((x) => x.pos != null && distanceM(x.pos, pos) < 8);
    if (hit >= 0) return setEdit(hit);
    if (base.onGreen && distanceM(base.onGreen, pos) < 4) return;
    if (onGreenSpot(pos, data)) {
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
    if (id === 'green') return pin ? `${fmt(distanceM(pos, pin))} ${tr('to the pin', 'zur Fahne')}` : null;
    if (id.startsWith('miss-')) {
      const from = d.shots[Number(id.slice(5))]?.pos;
      return from ? `✕ ${fmt(distanceM(from, pos))}` : null;
    }
    const n = Number(id.slice(5));
    if (isOut(pos)) return tr(`Out of bounds – penalty + new shot from ${n === 0 ? 'the tee' : `shot ${n}`}`, `Aus – Strafschlag + neuer Schlag ${n === 0 ? 'vom Abschlag' : `von Schlag ${n}`}`);
    const next = n + 1 < d.shots.length ? d.shots[n + 1].pos : d.onGreen;
    const prev = n > 0 ? d.shots[n - 1].pos : null;
    const parts = [`${n + 1}`];
    if (prev) parts.push(`${tr('from', 'von')} ${n}: ${fmt(distanceM(prev, pos))}`);
    if (next) parts.push(`→ ${fmt(distanceM(pos, next))}`);
    else if (pin) parts.push(`${fmt(distanceM(pos, pin))} ${tr('to pin', 'z. Fahne')}`);
    return parts.join(' · ');
  };

  const detectAll = () => {
    let holes = 0;
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
      const found = detectWithScore(part, m, h.par, bag, e);
      if (!found) return;
      holes++;
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
      holes
        ? tr(`Shots detected on ${holes} ${holes === 1 ? 'hole' : 'holes'} – please check them.`, `Schläge an ${holes} ${holes === 1 ? 'Loch' : 'Löchern'} erkannt – bitte prüfen.`)
        : tr('No shots found in the GPS track.', 'Keine Schläge in der GPS-Spur gefunden.'),
    );
  };

  // First visit after the round: no shots yet but a GPS track – find them right away (no extra button to tap).
  useEffect(() => {
    if (track.length > 20 && !entries.some((x) => x.detail?.shots.length)) detectAll();
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
  const confirmHole = () => {
    if (d) saveDetail(k, { ...d, shots: d.shots.map((s) => ({ ...s, review: false })) });
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
            Par {hole.par} · Score {e.strokes ?? '–'}{e.putts != null ? ` · ${e.putts} Putt${e.putts === 1 ? '' : 's'}` : ''}
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

      <div className="row">
        <span className="row-label">{tr(`Score on hole ${hole.label}`, `Score an Loch ${hole.label}`)}</span>
        <Stepper label={tr('Score', 'Score')} value={e.strokes} placeholder={hole.par} min={1} onChange={(v) => save(k, { strokes: v, pickedUp: false })} />
      </div>
      {data && (
        <div className="field">
          <label>{tr('Putts on this hole', 'Putts an diesem Loch')}</label>
          <Segmented<number>
            label="Putts"
            value={e.putts}
            onChange={(v) => {
              const base: DetailEntry = d ?? { ...emptyDetail(), pin: pinFor(k) };
              // 0 putts = holed from off the green (chip-in)
              saveDetail(k, { ...base, holedOut: v === 0 }, v);
            }}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4+' : String(n) }))}
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
              // Where strokes are won (green) and lost (red): every shot coloured by its strokes gained.
              ...(d?.shots ?? []).flatMap((s, n) => {
                const len = lengths[n];
                void len;
                const shot = s.pos ? [{ id: `shot-${n}`, pos: s.pos, label: `${n + 1}${s.club ? ' ' + clubCode(s.club) : ''}${s.review ? ' ?' : ''}` }] : [];
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

      {!d || d.shots.length === 0 ? (
        <p className="muted">{tr('No shots yet – tap the map.', 'Noch keine Schläge – tippe auf die Karte.')}</p>
      ) : (
        <ol className="shot-list review-list">
          {d.shots.map((s, n) => {
            const toPin = s.pos && pin ? distanceM(s.pos, pin) : null;
            const kind = s.kind ?? suggestKind(s.lie, toPin);
            return (
              <li key={n} className={s.review ? 'check' : undefined}>
                <span className="n">{n + 1}</span>
                <button type="button" className="shot-row" onClick={() => setEdit(n)}>
                  <strong>{s.club ? clubCode(s.club) : '–'}</strong> · {KINDS.find((x) => x.value === kind)!.label}
                  <span className="muted small" style={{ display: 'block' }}>
                    {lieName(s.lie)}
                    {lengths[n] != null ? ` · ${fmt(lengths[n]!)}` : ''}
                    {s.penalty ? (s.penaltyKind === 'ob' ? tr(' · out of bounds (+1)', ' · ins Aus (+1)') : s.penaltyKind === 'water' ? tr(' · water (+1)', ' · ins Wasser (+1)') : tr(' · +1 penalty', ' · +1 Strafschlag')) : ''}
                    {s.review ? tr(' · check', ' · prüfen') : ''}
                  </span>
                </button>
                <span />
                <span />
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
              <span />
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
      {data && (e.putts ?? 0) > 0 && (
        <button type="button" className="btn-secondary" onClick={() => setPuttEdit(true)}>
          {placedPutts?.length ? tr('Edit the putts on the green', 'Putts auf dem Grün bearbeiten') : tr('Place the putts on the green', 'Putts auf dem Grün setzen')}
        </button>
      )}
      {puttEdit && data && (e.putts ?? 0) > 0 && (
        <PuttEditor
          title={tr(`Hole ${hole.label} · ${e.putts} ${e.putts === 1 ? 'putt' : 'putts'}`, `Loch ${hole.label} · ${e.putts} Putt${e.putts === 1 ? '' : 's'}`)}
          green={data.green}
          greenCenter={data.greenCenter}
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
              : tr('Confirm round ✓', 'Runde bestätigen ✓')}
        </button>
      </div>

      {/* test mode: the round as a file for the analysis of the shot detection */}
      {isTestMode() && (
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            const detectedNow = round.holes.map((h, i) => {
              const m = maps[i];
              const found = m && parts[i]?.length ? detectWithScore(parts[i], m, h.par, bag, entries[i]) : null;
              return found ? { shots: found.shots.map((x) => ({ pos: x.pos, club: x.club ?? null })), onGreen: found.onGreen ?? null } : null;
            });
            const data = buildExport({ app: __BUILD_TIME__, round, track, caddieLog: cadLog, detectedNow });
            const how = await shareExport(data, exportFileName(round));
            if (how === 'downloaded') setNotice(tr('Round saved as a file (Downloads).', 'Runde als Datei gespeichert (Downloads).'));
          }}
        >
          {tr('Export round (test)', 'Runde exportieren (Test)')}
        </button>
      )}
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
