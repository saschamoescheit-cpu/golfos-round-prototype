import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CourseGeometry, LngLat } from '../types';
import { centroid, distanceM, pointInRing } from '../lib/geo';
import type { ImagerySource } from '../lib/imagery';
import { courseLayers, imageryStyle, OSM_ATTRIBUTION } from './mapStyle';

// "Set up hole": for courses where OpenStreetMap has no hole lines (e.g. Son Quint).
// The player marks the tee (own GPS position or a tap) and taps the green; the app stores tee → green.

export function HoleSetup(props: {
  holeLabel: string;
  par: number;
  geometry: CourseGeometry;
  center: LngLat; // where to start the map (player or course)
  nearPlayer: boolean; // true when `center` is the player's position on the course
  player: LngLat | null;
  imagery: ImagerySource;
  courseCenter: LngLat;
  /** Shown when the set-up opened instead of the map (hole without line): go to the score entry. */
  onScoreOnly?: () => void;
  onSave: (line: LngLat[]) => void;
  onCancel: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ tee?: maplibregl.Marker; green?: maplibregl.Marker; player?: maplibregl.Marker }>({});
  const [tee, setTee] = useState<LngLat | null>(null);
  const [green, setGreen] = useState<LngLat | null>(null);
  const [snapped, setSnapped] = useState(false);
  const state = useRef({ tee, green });
  state.current = { tee, green };
  const centeredOnPlayer = useRef(props.nearPlayer);

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: imageryStyle(props.imagery),
      center: props.center,
      // On the course: close-up around the player. Otherwise an overview of the course to find the hole.
      zoom: props.nearPlayer ? 17 : 15.3,
      attributionControl: { compact: true },
    });
    m.on('load', () => {
      // The whole course in course colours, so the player can find tee and green of the hole.
      const g = props.geometry;
      const kinds = { fairway: g.fairway, tee: g.tee, water: g.water, bunker: g.bunker, green: g.green };
      m.addSource('course', {
        type: 'geojson',
        attribution: OSM_ATTRIBUTION,
        data: {
          type: 'FeatureCollection',
          features: Object.entries(kinds).flatMap(([kind, rings]) =>
            rings.map((ring): GeoJSON.Feature => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring] } })),
          ),
        },
      });
      courseLayers('course').forEach((l) => m.addLayer(l));
    });
    m.on('click', (e) => {
      const p: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (!state.current.tee) setTee(p);
      else placeGreen(p);
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPS often arrives after the map opened: jump to the player once, if he is on the course.
  useEffect(() => {
    const m = map.current;
    if (!m || !props.player) return;
    const mk = markers.current;
    if (mk.player) mk.player.setLngLat(props.player);
    else {
      const el = document.createElement('div');
      el.className = 'map-player';
      mk.player = new maplibregl.Marker({ element: el }).setLngLat(props.player).addTo(m);
    }
    if (centeredOnPlayer.current || state.current.tee) return;
    if (distanceM(props.player, props.courseCenter) > 5000) return;
    centeredOnPlayer.current = true;
    m.jumpTo({ center: props.player, zoom: 17 });
  }, [props.player, props.courseCenter]);

  /** Snap a tap to the mapped green it hits (or one within 15 m), so front/back distances work. */
  const placeGreen = (p: LngLat) => {
    const hit =
      props.geometry.green.find((g) => pointInRing(p, g)) ??
      props.geometry.green.find((g) => g.some((q) => distanceM(p, q) < 15));
    setGreen(hit ? centroid(hit) : p);
    setSnapped(hit != null);
  };

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const put = (key: 'tee' | 'green', pos: LngLat | null, className: string, text: string) => {
      const existing = markers.current[key];
      if (!pos) {
        existing?.remove();
        markers.current[key] = undefined;
        return;
      }
      if (existing) existing.setLngLat(pos);
      else {
        const el = document.createElement('div');
        el.className = className;
        el.textContent = text;
        markers.current[key] = new maplibregl.Marker({ element: el }).setLngLat(pos).addTo(m);
      }
    };
    put('tee', tee, 'setup-pin tee', 'T');
    put('green', green, 'setup-pin green', 'G');
  }, [tee, green]);

  const length = tee && green ? Math.round(distanceM(tee, green)) : null;
  const step = !tee ? 1 : !green ? 2 : 3;

  return (
    <main className="map-screen setup">
      <div ref={container} className="hole-map" />
      <div className="map-top">
        <button type="button" className="map-btn round" aria-label="Cancel" onClick={props.onCancel}>
          ✕
        </button>
        <div className="map-hole">
          <span className="map-hole-no">Set up {props.holeLabel}</span>
          <span>Par {props.par || '?'} · mark tee and green once</span>
        </div>
      </div>
      <div className="map-bottom">
        <div className="setup-card">
          {step === 1 && (
            <>
              <strong>1 · Where is the tee?</strong>
              <span>Stand on the tee and use your GPS position, or tap the tee on the map.</span>
              <button type="button" className="btn-primary" disabled={!props.player} onClick={() => props.player && setTee(props.player)}>
                I’m on the tee
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <strong>2 · Tap the green</strong>
              <span>Mapped greens are outlined. Zoom and pan to find the green of hole {props.holeLabel}.</span>
              <button type="button" className="btn-secondary" onClick={() => setTee(null)}>
                Set tee again
              </button>
            </>
          )}
          {props.onScoreOnly && step < 3 && (
            <button type="button" className="btn-ghost" onClick={props.onScoreOnly}>
              Enter score only
            </button>
          )}
          {step === 3 && (
            <>
              <strong>
                Tee → green: {length} m {snapped ? '· green outline found ✓' : '· no green outline (center only)'}
              </strong>
              <span>Tap the map again to move the green, or save.</span>
              <div className="map-actions" style={{ gridTemplateColumns: '1fr 2fr' }}>
                <button type="button" className="btn-secondary" onClick={() => { setTee(null); setGreen(null); }}>
                  Start over
                </button>
                <button type="button" className="btn-primary" onClick={() => props.onSave([tee!, green!])}>
                  Save hole
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
