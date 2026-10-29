// The simulated Supabase of the shared rounds (as supabase/golfos-shared-games.sql: the table with its write rule
// "only if nobody wrote in between", joining, rounds nearby, asking and letting in) and the phones signed in to it –
// for the QA scripts of the rounds on several phones. The app is real.
import { devices } from 'playwright';
import { mockNet } from './netmock.mjs';

export function sharedServer(b, url) {
// ---------- the simulated server ----------
const shared = new Map(); // code → { game, updated_at }
let refused = 0; // writes refused because another phone wrote in between
async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
  const uid = (req.headers()['authorization'] ?? '').replace(/^Bearer tok-/, ''); // each phone its account
  if (u.pathname.endsWith('/golfos_items')) return json(200, []);
  if (u.pathname.endsWith('/rpc/golfos_join_game')) {
    const { join_code } = JSON.parse(req.postData() ?? '{}');
    const row = shared.get(join_code);
    if (row && row.owner !== uid && !row.members.includes(uid)) row.members.push(uid);
    return json(200, row ? row.game : null);
  }
  // asking to join a round nearby, and the host's answer (as the SQL)
  if (u.pathname.endsWith('/rpc/golfos_request_join')) {
    const { join_ref, who } = JSON.parse(req.postData() ?? '{}');
    const [code, row] = [...shared.entries()].find(([, r]) => r.near?.near_ref === join_ref && new Date(r.near.near_until) > new Date()) ?? [];
    if (!row) return json(200, { state: 'gone' });
    if (row.owner === uid || row.members.includes(uid)) return json(200, { state: 'ok', code });
    if (row.requests[uid]) return json(200, { state: row.requests[uid].state });
    row.requests[uid] = { name: who, at: new Date().toISOString(), state: 'asked' };
    return json(200, { state: 'asked' });
  }
  if (u.pathname.endsWith('/rpc/golfos_answer_join')) {
    const { join_code, player, yes } = JSON.parse(req.postData() ?? '{}');
    const row = shared.get(join_code);
    if (!row || (row.owner !== uid && !row.members.includes(uid)) || !row.requests[player]) return json(200, false);
    row.requests[player].state = yes ? 'ok' : 'no';
    if (yes && !row.members.includes(player)) row.members.push(player);
    return json(200, true);
  }
  // rounds nearby: those shown within their circle, nearest first (the equirectangular distance, as the SQL)
  if (u.pathname.endsWith('/rpc/golfos_nearby_rounds')) {
    const { at_lat, at_lon } = JSON.parse(req.postData() ?? '{}');
    const rad = (d) => (d * Math.PI) / 180;
    const out = [...shared.entries()]
      .filter(([, r]) => r.near && new Date(r.near.near_until) > new Date())
      .map(([code, r]) => ({ code, r, d: 6371000 * Math.hypot(rad(r.near.near_lat - at_lat), Math.cos(rad(at_lat)) * rad(r.near.near_lon - at_lon)) }))
      .filter((x) => x.d <= x.r.near.near_radius)
      .map(({ r, d }) => ({ ref: r.near.near_ref, name: r.game.name, course: r.game.course.name, host: r.near.near_host, tournament: !!r.game.tournament, mode: r.game.format?.mode, dist: Math.round(d) }));
    return json(200, out);
  }
  if (u.pathname.endsWith('/golfos_shared_games')) {
    const code = (u.searchParams.get('code') ?? '').replace(/^eq\./, '');
    if (req.method() === 'GET' && /near_requests/.test(u.searchParams.get('select') ?? '')) return json(200, shared.has(code) ? [{ near_requests: shared.get(code).requests }] : []);
    if (req.method() === 'GET') return json(200, code ? (shared.has(code) ? [{ game: shared.get(code).game, updated_at: shared.get(code).updated_at }] : []) : []);
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData());
      if (shared.has(row.code)) return json(409, { code: '23505' });
      shared.set(row.code, { game: row.game, updated_at: new Date().toISOString(), owner: uid, members: [], requests: {} });
      return json(201, null);
    }
    if (req.method() === 'PATCH') {
      const row = shared.get(code);
      const at = (u.searchParams.get('updated_at') ?? '').replace(/^eq\./, '');
      if (!row || (at && at !== row.updated_at)) {
        refused++;
        return json(200, []);
      }
      const body = JSON.parse(req.postData());
      if (body.near_lat != null) {
        row.near = body; // shown nearby – the event itself unchanged
        row.requests = {};
        return json(204, null);
      }
      row.game = body.game;
      row.updated_at = body.updated_at;
      return json(200, [{ code }]);
    }
  }
  return json(404, { message: 'not simulated' });
}
async function phone(name) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  // the simulated server: WebKit does not route the CORS preflight of the sync – not the app
  p.on('pageerror', (e) => { if (!/golfos_items.*access control|(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate((name) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
    // signed in (the token is only checked by the simulated server)
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: `tok-${name}`, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const round = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt));
const event = () => [...shared.values()][0]?.game;
  return { shared, phone, round, event, refused: () => refused };
}