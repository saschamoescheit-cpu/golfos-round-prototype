import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { CourseGeometry, LngLat, Ring } from '../types';
import { centroid, distanceM, greenFrontBack } from '../lib/geo';
import { paintedGreen } from '../lib/greenpaint';
import type { ImagerySource } from '../lib/imagery';
import { collapseAttribution, courseLayers, imageryStyle, OSM_ATTRIBUTION } from './mapStyle';
import { tr } from '../lib/i18n';
import { ActionBar } from './ActionBar';
import { FloatActions } from './FloatActions';

// "Set up hole": for courses where OpenStreetMap has no hole lines (e.g. Son Quint), and a hole drawn wrong.
// The player marks the tee (own GPS position or a tap) and draws round the green with one finger (Sascha 16.11.2026,
// Hawks Landing 2: a tapped green took the map's green within 15 m – there the wrong one); the app stores tee → the
// middle of the drawn green, and the green itself.

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
  /** tee → the middle of the green, and the green drawn round */
  onSave: (line: LngLat[], green: Ring) => void;
  onCancel: () => void;
  /** the hole marked by the player himself: take his marking away – the course's map again (Sascha 11.11.2026) */
  onReset?: () => void;
  /** …and every hole of the course he marked */
  onResetAll?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ tee?: maplibregl.Marker; player?: maplibregl.Marker }>({});
  const [tee, setTee] = useState<LngLat | null>(null);
  const [green, setGreen] = useState<Ring | null>(null);
  // "einmal ganz herum": a path that did not close or was no green's size
  const [again, setAgain] = useState(false);
  const state = useRef({ tee, green });
  state.current = { tee, green };
  const centeredOnPlayer = useRef(props.nearPlayer);
  const path = useRef<LngLat[] | null>(null);

  const showPath = (pts: LngLat[]) =>
    (map.current?.getSource('paint-path') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts.length >= 2 ? pts : [] } });

  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: imageryStyle(props.imagery),
      center: props.center,
      // On the course: close-up around the player. Otherwise an overview of the course to find the hole.
      zoom: props.nearPlayer ? 17 : 15.3,
      attributionControl: { compact: true },
    });
    m.once('style.load', () => { // not "load": that waits for aerial tiles, which may never come (LGL, 21.10.2026)
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
      // the green drawn round (the app's green) and the finger's path while drawing (white)
      m.addSource('paint-green', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'paint-green-fill', type: 'fill', source: 'paint-green', paint: { 'fill-color': '#8cc63f', 'fill-opacity': 0.3 } });
      m.addLayer({ id: 'paint-green-line', type: 'line', source: 'paint-green', paint: { 'line-color': '#8cc63f', 'line-width': 3 } });
      m.addSource('paint-path', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
      m.addLayer({ id: 'paint-path', type: 'line', source: 'paint-path', paint: { 'line-color': '#ffffff', 'line-width': 3 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      collapseAttribution(m);
    });
    m.on('click', (e) => {
      if (state.current.tee) return; // the green is drawn, not tapped
      setTee([e.lngLat.lng, e.lngLat.lat]);
    });
    // drawing round the green: one finger (or the mouse) draws; two fingers move and zoom the map
    const start = (p: LngLat) => {
      if (!state.current.tee) return;
      path.current = [p];
      setAgain(false);
    };
    const move = (p: LngLat) => {
      if (!path.current) return;
      path.current.push(p);
      showPath(path.current);
    };
    const end = () => {
      const pts = path.current;
      path.current = null;
      showPath([]);
      if (!pts || pts.length < 3) return; // a tap
      const ring = paintedGreen(pts);
      if (ring) setGreen(ring);
      else setAgain(true);
    };
    m.on('mousedown', (e) => e.originalEvent.button === 0 && start([e.lngLat.lng, e.lngLat.lat]));
    m.on('mousemove', (e) => move([e.lngLat.lng, e.lngLat.lat]));
    m.on('mouseup', end);
    m.on('touchstart', (e) => {
      if (e.originalEvent.touches.length === 1) start([e.lngLat.lng, e.lngLat.lat]);
      else {
        path.current = null; // a second finger: moving the map, not drawing
        showPath([]);
      }
    });
    m.on('touchmove', (e) => e.originalEvent.touches.length === 1 && move([e.lngLat.lng, e.lngLat.lat]));
    m.on('touchend', end);
    m.on('touchcancel', () => {
      path.current = null;
      showPath([]);
    });
    map.current = m;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // with the tee set the finger draws – the map moves with two fingers (or the mouse wheel)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (tee) m.dragPan.disable();
    else m.dragPan.enable();
  }, [tee]);

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

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const existing = markers.current.tee;
    if (!tee) {
      existing?.remove();
      markers.current.tee = undefined;
    } else if (existing) existing.setLngLat(tee);
    else {
      const el = document.createElement('div');
      el.className = 'setup-pin tee';
      el.textContent = 'T';
      markers.current.tee = new maplibregl.Marker({ element: el }).setLngLat(tee).addTo(m);
    }
    const src = m.getSource('paint-green') as maplibregl.GeoJSONSource | undefined;
    const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: green ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [green] } }] : [] };
    if (src) src.setData(data);
    else m.once('style.load', () => (m.getSource('paint-green') as maplibregl.GeoJSONSource | undefined)?.setData(data));
  }, [tee, green]);

  const fb = tee && green ? greenFrontBack(tee, green) : null;
  const step = !tee ? 1 : !green ? 2 : 3;

  return (
    <main className="map-screen setup">
      <div ref={container} className="hole-map" />
      <div className="map-top">
        <button type="button" className="map-btn round" aria-label={tr('Cancel', 'Abbrechen')} onClick={props.onCancel}>
          ✕
        </button>
        <div className="map-hole">
          <span className="map-hole-no">{tr('Set up', 'Einrichten')} {props.holeLabel}</span>
          <span>Par {props.par || '?'} · {tr('mark the tee, draw round the green', 'Abschlag markieren, Grün einmalen')}</span>
        </div>
      </div>
      <div className="map-bottom">
        <div className={`setup-card${step === 3 ? ' with-fab' : ''}`}>
          {step === 1 && (
            <>
              <strong>{tr(`1 · Where is the tee of hole ${props.holeLabel}?`, `1 · Wo ist der Abschlag von Loch ${props.holeLabel}?`)}</strong>
              {props.nearPlayer ? (
                <>
                  <span>{tr('Stand on the tee and use your GPS position, or tap the tee on the map.', 'Stell dich auf den Abschlag und nimm deine GPS-Position, oder tippe den Abschlag auf der Karte an.')}</span>
                  <button type="button" className="btn-primary" disabled={!props.player} onClick={() => props.player && setTee(props.player)}>
                    {tr('I’m on the tee', 'Ich stehe am Abschlag')}
                  </button>
                </>
              ) : (
                // away from the course (Sascha 27.10.2026: "it must work when you are not there"): the map, not the GPS
                <span>
                  {tr(
                    'This course’s holes are not on the map yet. Tap the tee on the aerial photo – from home too, best with the club’s course map at hand. Once drawn, the hole is there for every round.',
                    'Die Bahnen dieses Platzes sind noch nicht in der Karte. Tippe den Abschlag auf dem Luftbild an – geht auch von zu Hause, am besten mit dem Platzplan des Clubs. Einmal eingezeichnet, ist die Bahn bei jeder Runde da.',
                  )}
                </span>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <strong>{tr('2 · Draw once round the green', '2 · Fahr einmal um das Grün')}</strong>
              <span>
                {again
                  ? tr('Once right round the green – back to where you started.', 'Einmal ganz um das Grün herum – bis zum Anfang.')
                  : tr(
                      'With one finger along the edge of the green until you are back at the start; letting go closes it. Move and zoom the map with two fingers.',
                      'Mit einem Finger am Rand des Grüns entlang, bis du wieder am Anfang bist; loslassen schließt den Umriss. Verschieben und zoomen mit zwei Fingern.',
                    )}
              </span>
            </>
          )}
          {step === 3 && fb && (
            <>
              <strong>
                {tr('Tee → green', 'Abschlag → Grün')}: {Math.round(fb.center)} m · {tr('front', 'vorne')} {Math.round(fb.front)} · {tr('back', 'hinten')} {Math.round(fb.back)}
              </strong>
              <span>{tr('Drawing again replaces the outline – or save.', 'Nochmal malen ersetzt den Umriss – oder speichere.')}</span>
            </>
          )}
          {/* the other actions as one bar of icons (Facelift 11.11.2026, r6) – removing every marking red, last */}
          <ActionBar
            label={tr('Set up the hole', 'Loch einrichten')}
            actions={[
              step === 3 && { label: tr('Draw again', 'Neu malen'), icon: 'edit', onClick: () => setGreen(null) },
              step > 1 && { label: tr('Start over', 'Neu beginnen'), icon: 'reopen', onClick: () => { setTee(null); setGreen(null); setAgain(false); } },
              props.onScoreOnly && { label: tr('Score only', 'Nur Score'), aria: tr('Enter score only', 'Nur Score eintragen'), icon: 'card', onClick: props.onScoreOnly },
              props.onReset && { label: tr('Course map', 'Platzkarte'), aria: tr('Use the course map again (remove my marking)', 'Platzkarte verwenden (meine Markierung entfernen)'), icon: 'map', onClick: props.onReset },
              props.onResetAll && { label: tr('All holes', 'Alle Löcher'), aria: tr('Course map for every hole (remove all my markings here)', 'Platzkarte für alle Löcher (alle meine Markierungen hier entfernen)'), icon: 'delete', danger: true, onClick: props.onResetAll },
            ]}
          />
        </div>
      </div>
      {/* the hole marked: saved with the floating tick (Facelift 11.11.2026, r6) – above the layer of the round check, any other tick hidden meanwhile */}
      {step === 3 && green && <FloatActions overSheet save={{ label: tr('Save hole', 'Loch speichern'), onClick: () => props.onSave([tee!, centroid(green)], green) }} />}
    </main>
  );
}
