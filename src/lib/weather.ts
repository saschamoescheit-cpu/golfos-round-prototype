import type { HoleEntry, LngLat } from '../types';
import { tr } from './i18n';

// Weather on the course (GOL-26): temperature and wind from Open-Meteo (free for non-commercial use,
// no key; a product needs their commercial plan or another provider). Cached for 10 minutes, the last
// value is kept for poor reception on the course.

export interface Weather {
  tempC: number;
  windKmh: number;
  gustKmh: number;
  windFromDeg: number; // meteorological: direction the wind comes FROM, 0 = north
  code: number; // WMO weather code
  at: string; // ISO time of the measurement
}

const KEY = 'golfos.weather.v1';
const MAX_AGE_MS = 10 * 60 * 1000;

export async function loadWeather(p: LngLat): Promise<Weather | null> {
  const cached = readCache(p);
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached.data;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}` +
      '&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&wind_speed_unit=kmh&timezone=auto';
    let data: Weather | null = null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(String(res.status));
      const c = (await res.json()).current;
      data = { tempC: c.temperature_2m, windKmh: c.wind_speed_10m, gustKmh: c.wind_gusts_10m, windFromDeg: c.wind_direction_10m, code: c.weather_code, at: c.time };
    } catch {
      data = await dwdCurrent(p); // Open-Meteo busy (429) or down: in Germany the German weather service
    }
    if (!data) throw new Error('no weather');
    try {
      localStorage.setItem(KEY, JSON.stringify({ p, fetchedAt: Date.now(), data }));
    } catch {
      // storage full – fine, it is only a cache
    }
    return data;
  } catch {
    return cached?.data ?? null; // offline: last known weather
  }
}

/** In Germany (bounding box with a little margin). */
export const inGermany = (p: LngLat) => p[0] > 5.8 && p[0] < 15.1 && p[1] > 47.2 && p[1] < 55.1;

/** WMO weather code from the DWD's condition and cloud cover (Bright Sky). */
function dwdCode(condition: string | null, cloud: number | null): number {
  switch (condition) {
    case 'thunderstorm':
      return 95;
    case 'hail':
      return 96;
    case 'snow':
      return 71;
    case 'sleet':
      return 66;
    case 'rain':
      return 61;
    case 'fog':
      return 45;
  }
  return cloud == null ? 2 : cloud < 20 ? 0 : cloud < 70 ? 2 : 3;
}

/** The German weather service's latest measurement at the nearest station (Bright Sky, DWD open data, no key) –
 *  when Open-Meteo does not answer (18.10.2026: its free quota used up, no weather in Frielinghausen). */
async function dwdCurrent(p: LngLat): Promise<Weather | null> {
  if (!inGermany(p)) return null;
  try {
    const res = await fetch(`https://api.brightsky.dev/current_weather?lat=${p[1].toFixed(4)}&lon=${p[0].toFixed(4)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const w = (await res.json()).weather;
    if (w?.temperature == null || w.wind_speed_10 == null) return null;
    return { tempC: w.temperature, windKmh: w.wind_speed_10, gustKmh: w.wind_gust_speed_10 ?? w.wind_speed_10, windFromDeg: w.wind_direction_10 ?? 0, code: dwdCode(w.condition, w.cloud_cover), at: String(w.timestamp).slice(0, 16) };
  } catch {
    return null;
  }
}

/** The next hours from the DWD forecast (MOSMIX via Bright Sky) – as dwdCurrent, when Open-Meteo does not answer. */
async function dwdForecast(p: LngLat): Promise<Forecast | null> {
  if (!inGermany(p)) return null;
  try {
    const from = new Date();
    const to = new Date(from.getTime() + 5 * 3600000);
    const res = await fetch(`https://api.brightsky.dev/weather?lat=${p[1].toFixed(4)}&lon=${p[0].toFixed(4)}&date=${from.toISOString()}&last_date=${to.toISOString()}&tz=Europe/Berlin`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ws: { timestamp: string; precipitation_probability: number | null; wind_gust_speed: number | null }[] = (await res.json()).weather ?? [];
    if (!ws.length) return null;
    return { hours: ws.slice(0, 5).map((w) => ({ time: w.timestamp.slice(0, 16), rainPct: w.precipitation_probability ?? 0, gustKmh: w.wind_gust_speed ?? 0 })) };
  } catch {
    return null;
  }
}

function readCache(p: LngLat): { fetchedAt: number; data: Weather } | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    // Same course: within ~3 km.
    return c && Math.abs(c.p[0] - p[0]) < 0.04 && Math.abs(c.p[1] - p[1]) < 0.03 ? c : null;
  } catch {
    return null;
  }
}

/** Wind relative to the playing direction (bearing tee → green). Head > 0 = into the wind; cross > 0 = from the right. */
export function windOnHole(w: Weather, holeBearingDeg: number): { headKmh: number; crossKmh: number; label: string } {
  const a = ((w.windFromDeg - holeBearingDeg) * Math.PI) / 180;
  const head = w.windKmh * Math.cos(a);
  const cross = w.windKmh * Math.sin(a);
  let label: string;
  if (Math.round(w.windKmh) < 5) label = tr('Calm', 'Windstill');
  else if (Math.abs(head) >= Math.abs(cross)) label = head > 0 ? tr('Into the wind', 'Gegenwind') : tr('Downwind', 'Rückenwind');
  else label = cross > 0 ? tr('Wind from the right', 'Wind von rechts') : tr('Wind from the left', 'Wind von links');
  return { headKmh: Math.round(head), crossKmh: Math.round(cross), label };
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 95) return '⛈️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 51) return '🌧️';
  return '🌤️';
}

/** Next hours on the course (feature 019): when rain or stronger wind is coming. */
export interface Forecast {
  hours: { time: string; rainPct: number; gustKmh: number }[];
}
const FKEY = 'golfos.forecast.v1';
export async function loadForecast(p: LngLat): Promise<Forecast | null> {
  try {
    const c = JSON.parse(localStorage.getItem(FKEY) ?? 'null');
    if (c && Date.now() - c.fetchedAt < 30 * 60 * 1000 && Math.abs(c.p[0] - p[0]) < 0.04 && Math.abs(c.p[1] - p[1]) < 0.03) return c.data;
  } catch {
    // storage blocked
  }
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p[1].toFixed(4)}&longitude=${p[0].toFixed(4)}` +
      '&hourly=precipitation_probability,wind_gusts_10m&forecast_hours=5&wind_speed_unit=kmh&timezone=auto';
    let data: Forecast | null = null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(String(res.status));
      const h = (await res.json()).hourly;
      data = { hours: h.time.map((t: string, k: number) => ({ time: t, rainPct: h.precipitation_probability[k] ?? 0, gustKmh: h.wind_gusts_10m[k] ?? 0 })) };
    } catch {
      data = await dwdForecast(p);
    }
    if (!data) return null;
    try {
      localStorage.setItem(FKEY, JSON.stringify({ p, fetchedAt: Date.now(), data }));
    } catch {
      // storage full
    }
    return data;
  } catch {
    return null;
  }
}

/** One sentence about what is coming (rain ≥ 60 %, gusts 15 km/h stronger than now), or null. */
export function forecastNote(f: Forecast | null, nowGustKmh: number): string | null {
  if (!f) return null;
  const hh = (t: string) => t.slice(11, 16);
  const rain = f.hours.find((h) => h.rainPct >= 60);
  const wind = f.hours.find((h) => h.gustKmh >= nowGustKmh + 15 && h.gustKmh >= 30);
  const parts: string[] = [];
  if (rain) parts.push(tr(`rain likely from ${hh(rain.time)}`, `Regen wahrscheinlich ab ${hh(rain.time)}`));
  if (wind) parts.push(tr(`gusts up to ${Math.round(wind.gustKmh)} km/h around ${hh(wind.time)}`, `Böen bis ${Math.round(wind.gustKmh)} km/h gegen ${hh(wind.time)}`));
  return parts.length ? `${tr('Coming up', 'Demnächst')}: ${parts.join(', ')}` : null;
}

/** The weather of a round from what was saved on its holes (GOL-26): average temperature and wind, the strongest wind.
 *  Null when no hole has weather (played offline, entered later). */
export function roundWeather(entries: HoleEntry[]): { tempC: number; windKmh: number; maxWindKmh: number; holes: number } | null {
  const w = entries.map((e) => e.weather).filter((x): x is NonNullable<HoleEntry['weather']> => !!x);
  if (!w.length) return null;
  const avg = (f: (x: (typeof w)[number]) => number) => w.reduce((a, x) => a + f(x), 0) / w.length;
  return { tempC: Math.round(avg((x) => x.tempC)), windKmh: Math.round(avg((x) => x.windKmh)), maxWindKmh: Math.round(Math.max(...w.map((x) => x.windKmh))), holes: w.length };
}

/** "17 °C · wind 14 km/h" for the round's scorecard; the strongest wind when it was clearly stronger. */
export function roundWeatherText(entries: HoleEntry[]): string | null {
  const r = roundWeather(entries);
  if (!r) return null;
  const gusty = r.maxWindKmh >= r.windKmh + 8;
  return tr(
    `${r.tempC} °C · wind ${r.windKmh} km/h${gusty ? ` (up to ${r.maxWindKmh})` : ''}`,
    `${r.tempC} °C · Wind ${r.windKmh} km/h${gusty ? ` (bis ${r.maxWindKmh})` : ''}`,
  );
}
