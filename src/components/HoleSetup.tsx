import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { CourseGeometry, LngLat } from '../types';
import { centroid, distanceM, pointInRing } from '../lib/geo';
import type { ImagerySource } from '../lib/imagery';
import { collapseAttribution, courseLayers, imageryStyle, OSM_ATTRIBUTION } from './mapStyle';
import { tr } from '../lib/i18n';
import { ActionBar } from './ActionBar';
import { FloatActions } from './FloatActions';

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
  /** the hole marked by the player himself: take his marking away – the course's map again (Sascha 11.11.2026) */
  onReset?: () => void;
  /** …and every hole of the course he marked */
  onResetAll?: () => void;
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
      collapseAttribution(m);
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
        <button type="button" className="map-btn round" aria-label={tr('Cancel', 'Abbrechen')} onClick={props.onCancel}>
          ✕
        </button>
        <div className="map-hole">
          <span className="map-hole-no">{tr('Set up', 'Einrichten')} {props.holeLabel}</span>
          <span>Par {props.par || '?'} · {tr('mark tee and green once', 'Abschlag und Grün einmal markieren')}</span>
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
              <strong>{tr('2 · Tap the green', '2 · Tippe auf das Grün')}</strong>
              <span>{tr(`Mapped greens are outlined. Zoom and pan to find the green of hole ${props.holeLabel}.`, `Bekannte Grüns sind umrandet. Zoome und verschiebe die Karte, um das Grün von Loch ${props.holeLabel} zu finden.`)}</span>
            </>
          )}
          {step === 3 && (
            <>
              <strong>
                {tr('Tee → green', 'Abschlag → Grün')}: {length} m {snapped ? tr('· green outline found', '· Grün-Umriss gefunden') : tr('· no green outline (center only)', '· kein Grün-Umriss (nur Mitte)')}
              </strong>
              <span>{tr('Tap the map again to move the green, or save.', 'Tippe erneut auf die Karte, um das Grün zu verschieben, oder speichere.')}</span>
            </>
          )}
          {/* the other actions as one bar of icons (Facelift 11.11.2026, r6) – removing every marking red, last */}
          <ActionBar
            label={tr('Set up the hole', 'Loch einrichten')}
            actions={[
              step > 1 && { label: tr('Start over', 'Neu beginnen'), icon: 'reopen', onClick: () => { setTee(null); setGreen(null); } },
              props.onScoreOnly && { label: tr('Score only', 'Nur Score'), aria: tr('Enter score only', 'Nur Score eintragen'), icon: 'card', onClick: props.onScoreOnly },
              props.onReset && { label: tr('Course map', 'Platzkarte'), aria: tr('Use the course map again (remove my marking)', 'Platzkarte verwenden (meine Markierung entfernen)'), icon: 'map', onClick: props.onReset },
              props.onResetAll && { label: tr('All holes', 'Alle Löcher'), aria: tr('Course map for every hole (remove all my markings here)', 'Platzkarte für alle Löcher (alle meine Markierungen hier entfernen)'), icon: 'delete', danger: true, onClick: props.onResetAll },
            ]}
          />
        </div>
      </div>
      {/* the hole marked: saved with the floating tick (Facelift 11.11.2026, r6) – above the layer of the round check, any other tick hidden meanwhile */}
      {step === 3 && <FloatActions overSheet save={{ label: tr('Save hole', 'Loch speichern'), onClick: () => props.onSave([tee!, green!]) }} />}
    </main>
  );
}
