import { useEffect, useMemo, useState } from 'react';
import type { CourseSummary, LngLat, RoundHole } from '../types';
import { tr } from '../lib/i18n';
import { loadCourse } from '../lib/courses';
import { formatDistance, holeMapData, lineLength } from '../lib/geo';
import { holeForTee } from '../lib/teeline';
import { ensureGeometry, loadGeometry, loadImagery, loadUnit } from '../lib/storage';
import { loadRegionalImagery, pickImagery } from '../lib/imagery';
import { HoleMap } from './HoleMap';

// The course for spectators (Sascha 08.11.2026: "they should also be able to look at the course played and its holes"):
// the holes of the round, one at a time on the aerial image as in the review – par, length, stroke index – with the
// players' scores on it. Only looking: no GPS, no caddie, nothing of the viewer's own.

export interface HoleScore {
  name: string;
  /** strokes – null: not played yet */
  s: number | null;
}

export function LiveCourse(props: { course: CourseSummary; holes: RoundHole[]; tee?: string | null; scores?: (hole: number) => HoleScore[] }) {
  const [k, setK] = useState(0);
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  // the course's map loaded once (into this browser's cache – as on any phone)
  useEffect(() => {
    let alive = true;
    // the course, then its map (a bundled course's map comes on demand – ensureGeometry, as before the hole map)
    loadCourse(props.course)
      .then(() => ensureGeometry(props.course.id))
      .then(() => alive && setTick((t) => t + 1))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [props.course]);
  const geometry = useMemo(() => loadGeometry(props.course.id), [props.course.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const maps = useMemo(() => props.holes.map((h) => holeForTee(holeMapData(geometry, h.loop, h.number), props.course.id, h.label, props.tee ?? null, geometry.tee)), [geometry, props.holes, props.course.id, props.tee]);
  const at: LngLat = [props.course.lon, props.course.lat];
  const [pref, setPref] = useState(loadImagery);
  const imagery = pickImagery(at, pref);
  const [, setImageryTick] = useState(0);
  useEffect(() => {
    loadRegionalImagery(at).then((found) => found && setImageryTick((t) => t + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [`${at[0].toFixed(3)},${at[1].toFixed(3)}`]);
  const unit = loadUnit();
  const hole = props.holes[k];
  const data = maps[k];
  if (!hole) return null;
  const length = data ? lineLength(data.line) : null;
  const scores = props.scores?.(k) ?? [];
  const go = (d: number) => setK((x) => Math.min(props.holes.length - 1, Math.max(0, x + d)));
  return (
    <section className="card live-course" aria-label={tr('The course', 'Der Platz')}>
      <div className="live-hole-head">
        <button type="button" className="icon-btn" aria-label={tr('Previous hole', 'Vorheriges Loch')} disabled={k === 0} onClick={() => go(-1)}>
          <Chevron left />
        </button>
        <span className="grow">
          <strong>{tr(`Hole ${hole.label}`, `Loch ${hole.label}`)}</strong>
          <span className="muted small">
            {' '}
            · Par {hole.par ?? '–'}
            {length ? ` · ${formatDistance(length, unit)} ${unit === 'yd' ? 'yd' : 'm'}` : ''}
            {hole.strokeIndex ? ` · HCP ${hole.strokeIndex}` : ''}
          </span>
        </span>
        <button type="button" className="icon-btn" aria-label={tr('Next hole', 'Nächstes Loch')} disabled={k === props.holes.length - 1} onClick={() => go(1)}>
          <Chevron />
        </button>
      </div>
      {data ? (
        <div className="review-map live-map">
          <HoleMap
            holeKey={`live-${props.course.id}-${k}`}
            plain
            padding={{ top: 24, bottom: 24, left: 24, right: 24 }}
            data={data}
            player={null}
            from={data.tee}
            pin={data.greenCenter}
            targets={[]}
            unit={unit}
            imagery={imagery}
            onImageryFail={() => {
              if (imagery.id !== 'esri') setPref('esri');
            }}
            view="aerial"
            // only looking: nothing to move or set
            onTargetsChange={() => {}}
            onTargetRemove={() => {}}
            onPinChange={() => {}}
            onMapTap={() => {}}
          />
        </div>
      ) : (
        <span className="muted small">{failed ? tr('The course map could not be loaded.', 'Die Platzkarte ließ sich nicht laden.') : tr('Loading the course …', 'Lade den Platz …')}</span>
      )}
      {scores.some((x) => x.s != null) && (
        <ul className="live-hole-scores" aria-label={tr('Scores on this hole', 'Scores an diesem Loch')}>
          {scores.map((x) => (
            <li key={x.name}>
              <span>{x.name}</span>
              <strong className={x.s == null ? 'muted' : hole.par != null && x.s < hole.par ? 'good-text' : undefined}>{x.s ?? '–'}</strong>
            </li>
          ))}
        </ul>
      )}
      {/* every hole at a glance: a tap goes there */}
      <div className="chip-set live-hole-chips" role="group" aria-label={tr('Holes', 'Löcher')}>
        {props.holes.map((h, i) => (
          <button key={i} type="button" className={`chip${i === k ? ' on' : ''}`} aria-pressed={i === k} aria-label={tr(`Hole ${h.label}`, `Loch ${h.label}`)} onClick={() => setK(i)}>
            {h.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Chevron(props: { left?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={props.left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}
