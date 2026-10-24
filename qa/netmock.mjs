// The weather and height services in the browser tests (night 18./19.10.2026): answered here instead of on the net.
// Hundreds of test runs a night had used up Open-Meteo's free quota for the whole home connection – Sascha's iPhone on
// the same Wi-Fi got no weather in Frielinghausen any more. Fixed values, so a test also no longer depends on the day's
// weather (wind row, "plays like").
// Usage: import { mockNet } from './netmock.mjs'; await mockNet(ctx);   (WEATHER=live keeps the real services, aerials too)

export const WEATHER = { tempC: 14, windKmh: 12, gustKmh: 22, windFromDeg: 250, code: 2 };

export async function mockNet(ctx) {
  // the push function (supabase/functions/golfos-push): "not deployed" unless a test answers it itself (pushnotify)
  await ctx.route(/supabase\.co\/functions\/v1\/golfos-push/, (r) =>
    r.fulfill({ status: r.request().method() === 'OPTIONS' ? 204 : 404, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: '' }),
  );
  if (process.env.WEATHER === 'live') return;
  const now = new Date().toISOString().slice(0, 16);
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('current'))
      return r.fulfill({ json: { current: { time: now, temperature_2m: WEATHER.tempC, wind_speed_10m: WEATHER.windKmh, wind_gusts_10m: WEATHER.gustKmh, wind_direction_10m: WEATHER.windFromDeg, weather_code: WEATHER.code } } });
    const time = Array.from({ length: 5 }, (_, k) => new Date(Date.now() + k * 3600000).toISOString().slice(0, 13) + ':00');
    return r.fulfill({ json: { hourly: { time, precipitation_probability: time.map(() => 10), wind_gusts_10m: time.map(() => WEATHER.gustKmh) } } });
  });
  // heights: the app's own height grids (Hetzenhof, Florida …) come with the app; elsewhere a gentle slope
  await ctx.route(/api\.open-meteo\.com\/v1\/elevation/, (r) => {
    const u = new URL(r.request().url());
    const lat = (u.searchParams.get('latitude') ?? '').split(',').map(Number);
    return r.fulfill({ json: { elevation: lat.map((y) => Math.round((300 + (y % 0.01) * 2000) * 10) / 10) } });
  });
  // the course search (Photon) – answered here (night 23./24.10.2026): five test runs a night had Photon answer the home
  // connection with empty pages; the app finds the courses in its own lists (built-in and every German course), as when
  // Photon is down. A test that needs Photon's answers routes it itself.
  await ctx.route(/photon\.komoot\.io\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }));
  // DWD (Bright Sky) "down" – with the CORS header, else WebKit reports the refused answer as a page error (night run 23./24.10.2026)
  await ctx.route(/api\.brightsky\.dev\//, (r) => r.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' }));
  // the aerial images of Baden-Württemberg (LGL): a plain grass tile – the tests do not depend on the state's service
  // (21.10.2026 afternoon it hung without an answer, and every test on Hetzenhof reported the cut-off tiles)
  // – the aerial images only: the heights (WCS) stay real, a grass picture is no terrain model (greensmade, 22.10.2026)
  // with the CORS header: since 23.10.2026 the app checks each regional tile with fetch() (empty tiles) – without it
  // WebKit reports the answer as a page error ("due to access control checks")
  await ctx.route(/owsproxy\.lgl-bw\.de\/(?!owsproxy\/wcs)/, (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: Buffer.from(GRASS_PNG, 'base64') }));
}

const GRASS_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPwyjPBihiGlgQAE6E7AUXeDRsAAAAASUVORK5CYII=';
