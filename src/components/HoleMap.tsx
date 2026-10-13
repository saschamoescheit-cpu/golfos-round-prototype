import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { LngLat, Ring } from '../types';
import { bearingDeg, centroid, distanceM, formatDistance, hazardToCarry, isAhead, type HoleMapData, type Unit } from '../lib/geo';
import { collapseAttribution, courseLayers, imageryStyle, OSM_ATTRIBUTION, setImagery } from './mapStyle';
import type { ImagerySource } from '../lib/imagery';
import { tr } from '../lib/i18n';

// Satellite hole map: imagery (see lib/imagery.ts) with the hole drawn on top in course colours.

export interface HoleMapProps {
  holeKey: string; // changes when the hole changes → camera refits
  data: HoleMapData;
  player: LngLat | null; // GPS position, null when unknown
  from: LngLat; // measuring point: player on the course, else the tee
  pin: LngLat;
  targets: LngLat[]; // planned landing points (max 3), in playing order
  unit: Unit;
  imagery: ImagerySource;
  credit?: string | null; // extra data credit for the map's ⓘ (green heights)
  /** Detailed tracking: recorded shots (and the ball on the green), drawn as a yellow line with numbered dots. */
  track?: { pos: LngLat; label: string; green?: boolean; tone?: 'good' | 'bad'; id?: string }[];
  /** Review: the path the player walked (GPS) and where he stood still – the places a shot may have been played. */
  walked?: { line: LngLat[]; stops: LngLat[] } | null;
  /** Track points can be dragged (round check); called on release with the point's id. */
  onTrackMove?: (id: string, pos: LngLat) => void;
  /** While a shot is dragged: the text its marker shows (e.g. the shot length), null = keep the label. */
  onTrackDrag?: (id: string, pos: LngLat) => string | null;
  /** "Where not to miss": points with relative cost 0 (good miss) … 1 (expensive miss). */
  missMap?: { pos: LngLat; cost: number }[];
  /** A marker for the caddie's aim point with a dashed line from the player (not used on the hole map any more). */
  aimPoint?: LngLat | null;
  /** Green chart image (slope colours, arrows, contours) placed by its corners. */
  greenChart?: { url: string; corners: [LngLat, LngLat, LngLat, LngLat]; roomy?: boolean } | null; // roomy: map buttons still on screen
  /** Green slope: arrow on the green pointing where it falls (compass degrees). */
  greenSlope?: { pos: LngLat; downDeg: number; label: string };
  /** Putt read on the green: the ball, the rolling line and the point to aim at next to the hole. */
  putt?: { ball: LngLat; line: LngLat[]; aim: LngLat | null } | null;
  /** Round check: only the shots – no plan line, no distance or hazard labels that would cover the shot labels. */
  plain?: boolean;
  /** Space kept free around the hole when fitting the camera (full screen: room for the overlays). */
  padding?: { top: number; bottom: number; left: number; right: number };
  /**
   * Camera that walks with the player (Sascha, 13.10.2026: "always zooming in again is annoying – Hole19 and
   * Bebressie do it better"): the view from the player to the green, turned in the playing direction. A new `key`
   * (the player moved on) moves the camera; null = the whole hole. After the player zoomed or panned himself the
   * camera stays put until `recenter` changes.
   */
  camera?: { from: LngLat; key: string } | null;
  recenter?: number;
  onUserCamera?: (moved: boolean) => void;
  onTargetsChange: (t: LngLat[]) => void;
  onTargetRemove: (index: number) => void;
  onPinChange: (p: LngLat) => void;
  onMapTap: (p: LngLat) => void;
}

export function HoleMap(props: HoleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const markers = useRef<{ player?: maplibregl.Marker; pin?: maplibregl.Marker; targets: maplibregl.Marker[]; labels: maplibregl.Marker[]; track: maplibregl.Marker[]; slope?: maplibregl.Marker; aim?: maplibregl.Marker; puttBall?: maplibregl.Marker; puttAim?: maplibregl.Marker }>({ targets: [], labels: [], track: [] });
  const latest = useRef(props);
  latest.current = props;
  const userCam = useRef(false);

  /** The automatic view: green chart > player → green > whole hole. */
  function autoCamera(m: maplibregl.Map, duration: number) {
    const p = latest.current;
    if (p.greenChart) return chartCamera(m, p.greenChart);
    if (p.camera) return follow(m, p.camera.from, p.data, p.padding, duration);
    fit(m, p.data, p.padding);
  }

  // Create the map once.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: container.current!,
      style: imageryStyle(props.imagery),
      center: props.data.greenCenter,
      zoom: 16,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true, ...(props.credit ? { customAttribution: props.credit } : {}) },
    });
    m.touchZoomRotate.disableRotation();
    m.on('load', () => {
      m.addSource('shapes', { type: 'geojson', data: shapes(latest.current.data), attribution: OSM_ATTRIBUTION });
      m.addSource('plan', { type: 'geojson', data: planLine(latest.current) });
      courseLayers('shapes').forEach((l) => m.addLayer(l));
      m.addSource('miss', { type: 'geojson', data: missData(latest.current) });
      syncGreenChart(m, latest.current.greenChart ?? null);
      m.addLayer({
        id: 'miss',
        type: 'circle',
        source: 'miss',
        paint: {
          'circle-color': ['interpolate', ['linear'], ['get', 'cost'], 0, '#2ECC71', 0.25, '#FFE14D', 0.5, '#FF9F1A', 1, '#FF2D2D'],
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 15, 1.5, 17, 4.5, 19, 16],
          'circle-opacity': 0.8,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#0E1418',
        },
      });
      m.addLayer({ id: 'hole', type: 'line', source: 'shapes', filter: ['==', 'kind', 'hole'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 3] } });
      m.addSource('walked', { type: 'geojson', data: walkedData(latest.current) });
      m.addLayer({ id: 'walked-line', type: 'line', source: 'walked', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [1, 2] } });
      m.addLayer({ id: 'walked-stop', type: 'circle', source: 'walked', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 9, 'circle-color': 'rgba(255,255,255,0.25)', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } });
      m.addSource('track', { type: 'geojson', data: trackLine(latest.current) });
      m.addLayer({ id: 'track-casing', type: 'line', source: 'track', paint: { 'line-color': '#0E1418', 'line-width': 5, 'line-opacity': 0.5 } });
      m.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#FFD54A', 'line-width': 2.5 } });
      m.addLayer({ id: 'plan-casing', type: 'line', source: 'plan', paint: { 'line-color': '#0E1418', 'line-width': 5, 'line-opacity': 0.6 } });
      m.addLayer({ id: 'plan', type: 'line', source: 'plan', paint: { 'line-color': '#FFFFFF', 'line-width': 2.5 } });
      m.addSource('putt', { type: 'geojson', data: puttLine(latest.current) });
      m.addLayer({ id: 'putt-casing', type: 'line', source: 'putt', paint: { 'line-color': '#0E1418', 'line-width': 5, 'line-opacity': 0.55 }, layout: { 'line-cap': 'round' } });
      m.addLayer({ id: 'putt', type: 'line', source: 'putt', paint: { 'line-color': '#FFD54A', 'line-width': 2.5 }, layout: { 'line-cap': 'round' } });
      ready.current = true;
      m.on('moveend', () => render()); // labels are spaced out for the current view
      collapseAttribution(m);
      autoCamera(m, 0);
      render();
    });
    // The player zooms or pans himself (a real touch, not the camera): leave the view to him.
    const byHand = (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent || userCam.current) return;
      userCam.current = true;
      latest.current.onUserCamera?.(true);
    };
    m.on('dragstart', byHand);
    m.on('zoomstart', byHand);
    m.on('click', (e) => latest.current.onMapTap([e.lngLat.lng, e.lngLat.lat]));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New hole → new shapes and camera.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('shapes') as maplibregl.GeoJSONSource).setData(shapes(props.data));
    userCam.current = false; // a new hole: the automatic view again
    latest.current.onUserCamera?.(false);
    autoCamera(m, 0);
  }, [props.holeKey, props.data]);

  // The player moved on (or asked to centre again): the camera follows – unless he is looking around himself.
  const camKey = props.camera?.key ?? '';
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || userCam.current) return;
    autoCamera(m, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camKey]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !props.recenter) return;
    userCam.current = false;
    latest.current.onUserCamera?.(false);
    autoCamera(m, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recenter]);

  // Green chart shown: zoom onto the green (keeping the playing direction); hidden again: back to the hole.
  const chartKey = props.greenChart ? `${props.greenChart.url}${props.greenChart.roomy ? '|roomy' : ''}` : ''; // closer zoom once at the green
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    if (userCam.current) return;
    autoCamera(m, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartKey]);

  // Imagery switched by the player.
  useEffect(() => {
    const m = map.current;
    if (m && ready.current) setImagery(m, props.imagery);
  }, [props.imagery]);

  // Markers and labels follow every prop change.
  useEffect(() => {
    if (ready.current) render();
  });

  function render() {
    const m = map.current;
    if (!m) return;
    const p = latest.current;
    (m.getSource('plan') as maplibregl.GeoJSONSource | undefined)?.setData(planLine(p));
    (m.getSource('putt') as maplibregl.GeoJSONSource | undefined)?.setData(puttLine(p));
    // putt: white ball and a small ring where to aim
    const pm = markers.current;
    if (p.putt) {
      if (!pm.puttBall) pm.puttBall = new maplibregl.Marker({ element: el('map-putt-ball') }).setLngLat(p.putt.ball).addTo(m);
      else pm.puttBall.setLngLat(p.putt.ball);
      if (p.putt.aim) {
        if (!pm.puttAim) pm.puttAim = new maplibregl.Marker({ element: el('map-putt-aim') }).setLngLat(p.putt.aim).addTo(m);
        else pm.puttAim.setLngLat(p.putt.aim);
      } else {
        pm.puttAim?.remove();
        pm.puttAim = undefined;
      }
    } else {
      pm.puttBall?.remove();
      pm.puttAim?.remove();
      pm.puttBall = undefined;
      pm.puttAim = undefined;
    }
    (m.getSource('track') as maplibregl.GeoJSONSource | undefined)?.setData(trackLine(p));
    (m.getSource('walked') as maplibregl.GeoJSONSource | undefined)?.setData(walkedData(p));
    (m.getSource('miss') as maplibregl.GeoJSONSource | undefined)?.setData(missData(p));
    syncGreenChart(m, p.greenChart ?? null);
    const mk = markers.current;
    if (p.aimPoint) {
      if (!mk.aim) {
        const d = el('map-aim');
        d.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="#0E1418" stroke-width="5"/><circle cx="15" cy="15" r="11" fill="none" stroke="#FFD54A" stroke-width="2.5"/><circle cx="15" cy="15" r="3" fill="#FFD54A" stroke="#0E1418" stroke-width="1"/></svg><span>' + tr('Aim', 'Ziel') + '</span>';
        mk.aim = new maplibregl.Marker({ element: d }).setLngLat(p.aimPoint).addTo(m);
      } else mk.aim.setLngLat(p.aimPoint);
    } else if (mk.aim) {
      mk.aim.remove();
      mk.aim = undefined;
    }
    mk.slope?.remove();
    mk.slope = undefined;
    if (p.greenSlope) {
      const d = el('map-slope');
      // The map is turned (tee at the bottom): the arrow is drawn relative to the map bearing.
      d.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" style="transform:rotate(${p.greenSlope.downDeg - m.getBearing()}deg)" aria-hidden="true"><path d="M12 3v16M12 21l-6-6M12 21l6-6" stroke="#0E1418" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M12 3v16M12 21l-6-6M12 21l6-6" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg><span>${p.greenSlope.label}</span>`;
      mk.slope = new maplibregl.Marker({ element: d }).setLngLat(p.greenSlope.pos).addTo(m);
    }
    mk.track.forEach((t) => t.remove());
    mk.track = (p.track ?? []).map((t) => {
      const d = labelEl(t.label, `map-shot-dot${t.green ? ' green' : ''}${t.tone ? ' ' + t.tone : ''}`);
      const movable = p.onTrackMove != null && t.id != null;
      const marker = new maplibregl.Marker({ element: d, draggable: movable }).setLngLat(t.pos).addTo(m);
      if (movable) {
        marker.on('drag', () => {
          const ll = marker.getLngLat();
          const text = latest.current.onTrackDrag?.(t.id!, [ll.lng, ll.lat]);
          if (text != null) d.textContent = text;
          // the line between the shots follows the finger
          const pts = (latest.current.track ?? []).map((x) => (x.id === t.id ? ([ll.lng, ll.lat] as LngLat) : x.pos));
          (m.getSource('track') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: pts.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] });
        });
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          latest.current.onTrackMove?.(t.id!, [ll.lng, ll.lat]);
        });
      }
      return marker;
    });

    // Player
    if (p.player) {
      if (!mk.player) mk.player = new maplibregl.Marker({ element: el('map-player') }).setLngLat(p.player).addTo(m);
      else mk.player.setLngLat(p.player);
    } else if (mk.player) {
      mk.player.remove();
      mk.player = undefined;
    }

    // Pin (draggable flag)
    if (!mk.pin) {
      mk.pin = new maplibregl.Marker({ element: flagEl(), draggable: true, anchor: 'bottom-left', offset: [-2, 0] }).setLngLat(p.pin).addTo(m);
      mk.pin.on('drag', () => {
        const ll = mk.pin!.getLngLat();
        latest.current.onPinChange([ll.lng, ll.lat]);
      });
    } else if (!isDragging(mk.pin)) mk.pin.setLngLat(p.pin);

    // Targets (draggable crosshairs)
    while (mk.targets.length > p.targets.length) mk.targets.pop()!.remove();
    p.targets.forEach((t, i) => {
      let marker = mk.targets[i];
      if (!marker) {
        marker = new maplibregl.Marker({ element: crosshairEl(i + 1), draggable: true }).setLngLat(t).addTo(m);
        marker.on('drag', () => {
          const ll = marker.getLngLat();
          const next = latest.current.targets.slice();
          next[i] = [ll.lng, ll.lat];
          latest.current.onTargetsChange(next);
        });
        mk.targets[i] = marker;
      } else if (!isDragging(marker)) marker.setLngLat(t);
    });

    // Distance labels. Without targets: player → pin on the line. With targets: a sign next to each
    // crosshair with the carry to it (from the player or the previous target) and the rest to the pin.
    mk.labels.forEach((l) => l.remove());
    mk.labels = [];
    if (p.plain) return;
    if (p.putt) {
      // putt read on screen: no player → pin label over the putt line
    } else if (p.targets.length === 0) {
      const mid: LngLat = [(p.from[0] + p.pin[0]) / 2, (p.from[1] + p.pin[1]) / 2];
      mk.labels.push(new maplibregl.Marker({ element: labelEl(formatDistance(distanceM(p.from, p.pin), p.unit), 'map-label') }).setLngLat(mid).addTo(m));
    }
    p.targets.forEach((t, i) => {
      const prev = i === 0 ? p.from : p.targets[i - 1];
      const sign = targetSignEl(i + 1, formatDistance(distanceM(prev, t), p.unit), formatDistance(distanceM(t, p.pin), p.unit), p.unit, () =>
        latest.current.onTargetRemove(i),
      );
      let marker = new maplibregl.Marker({ element: sign, anchor: 'left', offset: [26, 0] }).setLngLat(t).addTo(m);
      // When on the right the sign would run under the distance box or off the screen (small phones: iPhone SE),
      // it goes left of the crosshair – or, without room there either, below it.
      const r = sign.getBoundingClientRect();
      const box = document.querySelector('.map-green')?.getBoundingClientRect();
      const covered = (box && r.right > box.left - 4 && r.bottom > box.top && r.top < box.bottom) || r.right > window.innerWidth - 4;
      if (covered) {
        marker.remove();
        const left = r.left - r.width - 52 >= 4;
        marker = new maplibregl.Marker({ element: sign, anchor: left ? 'right' : 'top', offset: left ? [-26, 0] : [0, 24] }).setLngLat(t).addTo(m);
      }
      mk.labels.push(marker);
    });
    const hazards: { ring: Ring; kind: 'bunker' | 'water' }[] = [
      ...p.data.bunkers.map((ring) => ({ ring, kind: 'bunker' as const })),
      ...p.data.water.map((ring) => ({ ring, kind: 'water' as const })),
    ];
    // Nearest hazards first; a label that would cover another one on screen is left out.
    const placed = [p.pin, ...p.targets].map((x) => m.project(x));
    const candidates = hazards
      .map((h) => ({ ...h, c: centroid(h.ring), ...hazardToCarry(p.from, h.ring) }))
      .filter((h) => isAhead(p.from, p.pin, h.c) && h.to >= 5 && h.to <= 330)
      .sort((a, b) => a.to - b.to);
    for (const h of candidates) {
      const at = m.project(h.c);
      if (placed.some((q) => Math.abs(q.x - at.x) < 70 && Math.abs(q.y - at.y) < 26)) continue;
      placed.push(at);
      // Water along the hole (carry far beyond the near edge): only the distance to it.
      const text = h.carry - h.to > 120 ? `${formatDistance(h.to, p.unit)} ›` : `${formatDistance(h.to, p.unit)} / ${formatDistance(h.carry, p.unit)}`;
      mk.labels.push(new maplibregl.Marker({ element: labelEl(text, `map-label hazard ${h.kind}`) }).setLngLat(h.c).addTo(m));
    }
  }

  return <div ref={container} className="hole-map" />;
}

const FULL_SCREEN_PADDING = { top: 120, bottom: 170, left: 40, right: 110 };

/** Zoom onto the green chart (keeping the playing direction). */
function chartCamera(m: maplibregl.Map, c: NonNullable<HoleMapProps['greenChart']>) {
  const b = c.corners.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(c.corners[0], c.corners[0]));
  // Room for the boxes above and the buttons below – scaled down on small screens, or MapLibre refuses to zoom.
  const h = m.getContainer().clientHeight;
  let top = 150;
  let bottom = c.roomy ? 300 : 260;
  // the real height of the buttons, caddie card and hints below (small phones: they cover more of the map)
  const cont = m.getContainer().getBoundingClientRect();
  const below = document.querySelector('.map-bottom')?.getBoundingClientRect();
  if (below && below.height > 0) bottom = Math.max(120, cont.bottom - below.top + 8);
  const k = Math.min(1, (h - 160) / (top + bottom));
  top *= k;
  bottom *= k;
  m.fitBounds(b, { bearing: m.getBearing(), padding: { top, bottom, left: 20, right: 20 }, maxZoom: 21, duration: 600 });
}

/** From the player to the green: both on screen, the green at the top, the player at the bottom. */
function follow(m: maplibregl.Map, from: LngLat, d: HoleMapData, padding = FULL_SCREEN_PADDING, duration = 0) {
  const pts = [from, ...(d.green ?? [d.greenCenter])];
  const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  const h = m.getContainer().clientHeight;
  const k = Math.min(1, (h - 120) / (padding.top + padding.bottom));
  m.fitBounds(bounds, {
    bearing: bearingDeg(from, d.greenCenter),
    padding: { ...padding, top: padding.top * k, bottom: padding.bottom * k },
    maxZoom: 19,
    duration,
  });
}

function fit(m: maplibregl.Map, d: HoleMapData, padding = FULL_SCREEN_PADDING) {
  const pts = [...d.line, ...(d.green ?? [])];
  const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  m.fitBounds(bounds, {
    bearing: bearingDeg(d.tee, d.greenCenter),
    padding,
    maxZoom: 18.5,
    duration: 0,
  });
}

function shapes(d: HoleMapData): GeoJSON.FeatureCollection {
  const poly = (ring: Ring, kind: string): GeoJSON.Feature => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [ring] } });
  return {
    type: 'FeatureCollection',
    features: [
      ...d.fairways.map((r) => poly(r, 'fairway')),
      ...d.tees.map((r) => poly(r, 'tee')),
      ...d.water.map((r) => poly(r, 'water')),
      ...d.bunkers.map((r) => poly(r, 'bunker')),
      ...(d.green ? [poly(d.green, 'green')] : []),
      { type: 'Feature', properties: { kind: 'hole' }, geometry: { type: 'LineString', coordinates: d.line } },
    ],
  };
}

/** Shows, moves or hides the green chart (an image source below the markers). */
function syncGreenChart(m: maplibregl.Map, chart: HoleMapProps['greenChart']): void {
  const src = m.getSource('green-chart') as maplibregl.ImageSource | undefined;
  if (!chart) {
    if (src) {
      m.removeLayer('green-chart');
      m.removeSource('green-chart');
    }
    return;
  }
  const url = new URL(chart.url, document.baseURI).href;
  if (src) {
    if ((src as unknown as { url: string }).url !== url) src.updateImage({ url, coordinates: chart.corners });
    return;
  }
  m.addSource('green-chart', { type: 'image', url, coordinates: chart.corners });
  m.addLayer({ id: 'green-chart', type: 'raster', source: 'green-chart', paint: { 'raster-opacity': 0.95, 'raster-fade-duration': 0 } }, m.getLayer('hole') ? 'hole' : undefined);
}

function missData(p: HoleMapProps): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (p.missMap ?? []).map((x) => ({ type: 'Feature', properties: { cost: x.cost }, geometry: { type: 'Point', coordinates: x.pos } })),
  };
}

function walkedData(p: HoleMapProps): GeoJSON.FeatureCollection {
  const w = p.walked;
  if (!w) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      ...(w.line.length >= 2 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: w.line } }] : []),
      ...w.stops.map((s) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: s } })),
    ],
  };
}

function trackLine(p: HoleMapProps): GeoJSON.FeatureCollection {
  const pts = (p.track ?? []).map((t) => t.pos);
  return { type: 'FeatureCollection', features: pts.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] };
}

function puttLine(p: HoleMapProps): GeoJSON.FeatureCollection {
  const pts = p.putt?.line ?? [];
  return { type: 'FeatureCollection', features: pts.length < 2 ? [] : [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] };
}

function planLine(p: HoleMapProps): GeoJSON.FeatureCollection {
  // On the green with a putt read the putt line replaces the plan line.
  if (p.putt || p.plain) return { type: 'FeatureCollection', features: [] };
  // With a caddie aim point (and no own target before it) the line runs player → aim point → pin.
  const pts = p.aimPoint && p.targets.length === 0 ? [p.from, p.aimPoint, p.pin] : [p.from, ...p.targets, p.pin];
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }],
  };
}

function isDragging(marker: maplibregl.Marker): boolean {
  return marker.getElement().classList.contains('maplibregl-marker-dragging') || (marker as unknown as { _isDragging?: boolean })._isDragging === true;
}

function el(className: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function labelEl(text: string, className: string): HTMLDivElement {
  const d = el(className);
  d.textContent = text;
  return d;
}

function targetSignEl(n: number, carry: string, rest: string, unit: Unit, onRemove: () => void): HTMLDivElement {
  const d = el('map-target-sign with-remove');
  const text = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'carry';
  head.textContent = `${n} · ${carry} ${unit}`;
  const tail = document.createElement('div');
  tail.className = 'rest';
  tail.textContent = `${tr('Pin', 'Fahne')} ${rest} ${unit}`;
  text.append(head, tail);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.setAttribute('aria-label', tr(`Remove target ${n}`, `Ziel ${n} entfernen`));
  // Keep the tap from reaching the map (which would place a new target).
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'click'] as const) remove.addEventListener(ev, (e) => e.stopPropagation());
  remove.addEventListener('click', onRemove);
  d.append(text, remove);
  return d;
}

function crosshairEl(n: number): HTMLDivElement {
  const d = el('map-crosshair');
  d.setAttribute('aria-label', tr(`Target ${n}, drag to move`, `Ziel ${n}, zum Verschieben ziehen`));
  d.innerHTML =
    '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="13" fill="none" stroke="#0E1418" stroke-width="5"/><circle cx="22" cy="22" r="13" fill="none" stroke="#FFFFFF" stroke-width="2.5"/><path d="M22 2v12M22 30v12M2 22h12M30 22h12" stroke="#0E1418" stroke-width="5"/><path d="M22 2v12M22 30v12M2 22h12M30 22h12" stroke="#FFFFFF" stroke-width="2.5"/></svg>';
  return d;
}

function flagEl(): HTMLDivElement {
  const d = el('map-flag');
  d.setAttribute('aria-label', tr('Pin, drag to today’s position', 'Fahne, auf die heutige Position ziehen'));
  d.innerHTML = '<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M3 2v34" stroke="#FFFFFF" stroke-width="3"/><path d="M4 3h20l-5 6 5 6H4z" fill="#FF6B5E" stroke="#0E1418" stroke-width="1"/></svg>';
  return d;
}
