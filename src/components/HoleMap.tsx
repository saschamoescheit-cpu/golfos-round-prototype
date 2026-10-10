import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LngLat, Ring } from '../types';
import { bearingDeg, centroid, distanceM, formatDistance, hazardToCarry, isAhead, type HoleMapData, type Unit } from '../lib/geo';
import { courseLayers, imageryStyle, OSM_ATTRIBUTION, setImagery } from './mapStyle';
import type { ImagerySource } from '../lib/imagery';

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
  onTargetsChange: (t: LngLat[]) => void;
  onTargetRemove: (index: number) => void;
  onPinChange: (p: LngLat) => void;
  onMapTap: (p: LngLat) => void;
}

export function HoleMap(props: HoleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const markers = useRef<{ player?: maplibregl.Marker; pin?: maplibregl.Marker; targets: maplibregl.Marker[]; labels: maplibregl.Marker[] }>({ targets: [], labels: [] });
  const latest = useRef(props);
  latest.current = props;

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
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.on('load', () => {
      m.addSource('shapes', { type: 'geojson', data: shapes(latest.current.data), attribution: OSM_ATTRIBUTION });
      m.addSource('plan', { type: 'geojson', data: planLine(latest.current) });
      courseLayers('shapes').forEach((l) => m.addLayer(l));
      m.addLayer({ id: 'hole', type: 'line', source: 'shapes', filter: ['==', 'kind', 'hole'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.5, 'line-opacity': 0.5, 'line-dasharray': [3, 3] } });
      m.addLayer({ id: 'plan-casing', type: 'line', source: 'plan', paint: { 'line-color': '#0E1418', 'line-width': 5, 'line-opacity': 0.6 } });
      m.addLayer({ id: 'plan', type: 'line', source: 'plan', paint: { 'line-color': '#FFFFFF', 'line-width': 2.5 } });
      ready.current = true;
      fit(m, latest.current.data);
      render();
    });
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
    fit(m, props.data);
  }, [props.holeKey, props.data]);

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
    const mk = markers.current;

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
    if (p.targets.length === 0) {
      const mid: LngLat = [(p.from[0] + p.pin[0]) / 2, (p.from[1] + p.pin[1]) / 2];
      mk.labels.push(new maplibregl.Marker({ element: labelEl(formatDistance(distanceM(p.from, p.pin), p.unit), 'map-label') }).setLngLat(mid).addTo(m));
    }
    p.targets.forEach((t, i) => {
      const prev = i === 0 ? p.from : p.targets[i - 1];
      const sign = targetSignEl(i + 1, formatDistance(distanceM(prev, t), p.unit), formatDistance(distanceM(t, p.pin), p.unit), p.unit, () =>
        latest.current.onTargetRemove(i),
      );
      mk.labels.push(new maplibregl.Marker({ element: sign, anchor: 'left', offset: [26, 0] }).setLngLat(t).addTo(m));
    });
    const hazards: { ring: Ring; kind: 'bunker' | 'water' }[] = [
      ...p.data.bunkers.map((ring) => ({ ring, kind: 'bunker' as const })),
      ...p.data.water.map((ring) => ({ ring, kind: 'water' as const })),
    ];
    for (const h of hazards) {
      const c = centroid(h.ring);
      if (!isAhead(p.from, p.pin, c)) continue;
      const { to, carry } = hazardToCarry(p.from, h.ring);
      if (to < 5 || to > 330) continue;
      const text = `${formatDistance(to, p.unit)} / ${formatDistance(carry, p.unit)}`;
      mk.labels.push(new maplibregl.Marker({ element: labelEl(text, `map-label hazard ${h.kind}`) }).setLngLat(c).addTo(m));
    }
  }

  return <div ref={container} className="hole-map" />;
}

function fit(m: maplibregl.Map, d: HoleMapData) {
  const pts = [...d.line, ...(d.green ?? [])];
  const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  m.fitBounds(bounds, {
    bearing: bearingDeg(d.tee, d.greenCenter),
    padding: { top: 120, bottom: 170, left: 40, right: 110 },
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

function planLine(p: HoleMapProps): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [p.from, ...p.targets, p.pin] } }],
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
  tail.textContent = `Pin ${rest} ${unit}`;
  text.append(head, tail);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove';
  remove.textContent = '✕';
  remove.setAttribute('aria-label', `Remove target ${n}`);
  // Keep the tap from reaching the map (which would place a new target).
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'click'] as const) remove.addEventListener(ev, (e) => e.stopPropagation());
  remove.addEventListener('click', onRemove);
  d.append(text, remove);
  return d;
}

function crosshairEl(n: number): HTMLDivElement {
  const d = el('map-crosshair');
  d.setAttribute('aria-label', `Target ${n}, drag to move`);
  d.innerHTML =
    '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="13" fill="none" stroke="#0E1418" stroke-width="5"/><circle cx="22" cy="22" r="13" fill="none" stroke="#FFFFFF" stroke-width="2.5"/><path d="M22 2v12M22 30v12M2 22h12M30 22h12" stroke="#0E1418" stroke-width="5"/><path d="M22 2v12M22 30v12M2 22h12M30 22h12" stroke="#FFFFFF" stroke-width="2.5"/></svg>';
  return d;
}

function flagEl(): HTMLDivElement {
  const d = el('map-flag');
  d.setAttribute('aria-label', 'Pin, drag to today’s position');
  d.innerHTML = '<svg width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M3 2v34" stroke="#FFFFFF" stroke-width="3"/><path d="M4 3h20l-5 6 5 6H4z" fill="#FF6B5E" stroke="#0E1418" stroke-width="1"/></svg>';
  return d;
}
