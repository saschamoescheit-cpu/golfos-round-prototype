import type { LngLat } from '../types';

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
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(String(res.status));
    const c = (await res.json()).current;
    const data: Weather = { tempC: c.temperature_2m, windKmh: c.wind_speed_10m, gustKmh: c.wind_gusts_10m, windFromDeg: c.wind_direction_10m, code: c.weather_code, at: c.time };
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
  if (Math.round(w.windKmh) < 5) label = 'Calm';
  else if (Math.abs(head) >= Math.abs(cross)) label = head > 0 ? 'Into the wind' : 'Downwind';
  else label = cross > 0 ? 'Wind from the right' : 'Wind from the left';
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
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const h = (await res.json()).hourly;
    const data: Forecast = {
      hours: h.time.map((t: string, k: number) => ({ time: t, rainPct: h.precipitation_probability[k] ?? 0, gustKmh: h.wind_gusts_10m[k] ?? 0 })),
    };
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
  if (rain) parts.push(`rain likely from ${hh(rain.time)}`);
  if (wind) parts.push(`gusts up to ${Math.round(wind.gustKmh)} km/h around ${hh(wind.time)}`);
  return parts.length ? `Coming up: ${parts.join(', ')}` : null;
}
