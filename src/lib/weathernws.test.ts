import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadForecast, loadWeather } from './weather';

// The trip to Florida (Sascha 22.10.2026): when Open-Meteo does not answer, the National Weather Service does.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
function net(url: string) {
  if (url.includes('open-meteo')) return json({}, 429);
  if (url.includes('/points/')) return json({ properties: { forecastHourly: 'https://api.weather.gov/gridpoints/MLB/22,59/forecast/hourly' } });
  if (url.includes('/forecast/hourly'))
    return json({
      properties: {
        periods: [
          { startTime: '2026-11-06T10:00:00-05:00', temperature: 26, windSpeed: '15 km/h', windGust: '28 km/h', windDirection: 'SW', probabilityOfPrecipitation: { value: 20 }, shortForecast: 'Mostly Sunny' },
          { startTime: '2026-11-06T11:00:00-05:00', temperature: 27, windSpeed: '10 to 20 km/h', windDirection: 'W', probabilityOfPrecipitation: { value: 40 }, shortForecast: 'Chance Showers' },
        ],
      },
    });
  return json({}, 404);
}

describe('weather in the USA', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
  });
  it('Open-Meteo down: now from the NWS hourly forecast (°C, km/h, wind from SW)', async () => {
    vi.stubGlobal('fetch', vi.fn((u: string) => net(String(u))));
    const w = await loadWeather([-81.5043, 28.3437]);
    expect(w).toMatchObject({ tempC: 26, windKmh: 15, gustKmh: 28, windFromDeg: 225 });
  });
  it('the next hours: rain and gusts', async () => {
    vi.stubGlobal('fetch', vi.fn((u: string) => net(String(u))));
    const f = await loadForecast([-81.5043, 28.3437]);
    expect(f?.hours.map((h) => [h.rainPct, h.gustKmh])).toEqual([[20, 28], [40, 20]]);
  });
  it('outside the USA the NWS is not asked', async () => {
    const fetch = vi.fn((u: string) => net(String(u)));
    vi.stubGlobal('fetch', fetch);
    expect(await loadWeather([2.8, 39.5])).toBeNull();
    expect(fetch.mock.calls.some(([u]) => String(u).includes('weather.gov'))).toBe(false);
  });
});
