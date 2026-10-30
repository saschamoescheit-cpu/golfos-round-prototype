// The simulated Supabase of the shared rounds, as supabase/golfos-shared-games.sql: the table with its write rule "only
// if nobody wrote in between", a round only for its host and the ones let in (asking by code or nearby, the host's
// answer), rounds nearby, the push function (its requests counted), and accounts without Google (anonymous sign-up) –
// with the phones signed in to it, for the QA scripts of the rounds on several phones. The app is real.
// `old: true`: the server before the SQL of 30.10.2026 – a code lets everyone in, no asking.
import { devices } from 'playwright';
import { mockNet } from './netmock.mjs';

export function sharedServer(b, url, o = {}) {
  const shared = new Map(); // code → { game, updated_at, owner, members, requests, near }
  const pushes = []; // { action, code, ref, from }
  let refused = 0; // writes refused because another phone wrote in between
  let anon = 0;
  let flightReads = 0;
  const askRow = (code, row, uid, who, hcp) => {
    if (row.owner === uid || row.members.includes(uid)) return { state: 'ok', code };
    if (row.requests[uid]) return { state: row.requests[uid].state };
    row.requests[uid] = { name: who, hcp: hcp ?? '', at: new Date().toISOString(), state: 'asked' };
    return { state: 'asked' };
  };
  async function serve(route) {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
    const uid = (req.headers()['authorization'] ?? '').replace(/^Bearer tok-/, ''); // each phone its account
    const body = () => JSON.parse(req.postData() ?? '{}');
    if (u.pathname.endsWith('/golfos_items')) return json(200, []);
    // an account without Google: its token is its name
    if (u.pathname.endsWith('/auth/v1/signup')) {
      if (o.noAnonymous) return json(422, { error_code: 'anonymous_provider_disabled' });
      const name = (body().data?.name ?? `guest${++anon}`).replace(/\s+/g, '');
      return json(200, { access_token: `tok-${name}`, refresh_token: 'y', expires_in: 3600, user: { id: name, is_anonymous: true } });
    }
    if (u.pathname.endsWith('/functions/v1/golfos-push')) {
      const b = body();
      pushes.push({ ...b, from: uid });
      // invited by user name (o.users: user name → account): let in at once
      if (b.action === 'invite') {
        const to = o.users?.[String(b.username).toLowerCase()];
        const row = shared.get(b.code);
        if (!to) return json(200, { ok: false, found: false });
        if (row && !row.members.includes(to)) row.members.push(to);
        if (row) row.requests[to] = { name: b.username, state: 'ok' };
        return json(200, { ok: true, found: true, sent: 1 });
      }
      return json(200, { ok: true, sent: 1 });
    }
    if (u.pathname.endsWith('/rpc/golfos_join_game')) {
      const { join_code } = body();
      const row = shared.get(join_code);
      if (!row) return json(200, null);
      if (!o.old && row.game.kind === 'round-event' && row.owner !== uid && !row.members.includes(uid)) return json(200, { kind: 'ask-host' });
      if (row.owner !== uid && !row.members.includes(uid)) row.members.push(uid);
      return json(200, row.game);
    }
    if (u.pathname.endsWith('/rpc/golfos_ask_join')) {
      if (o.old) return json(404, { code: 'PGRST202' });
      const { join_code, who, hcp } = body();
      const row = shared.get(join_code);
      return json(200, row && row.game.kind === 'round-event' ? askRow(join_code, row, uid, who, hcp) : { state: 'none' });
    }
    // asking to join a round nearby
    if (u.pathname.endsWith('/rpc/golfos_request_join')) {
      const { join_ref, who, hcp } = body();
      const [code, row] = [...shared.entries()].find(([, r]) => r.near?.near_ref === join_ref && new Date(r.near.near_until) > new Date()) ?? [];
      return json(200, row ? askRow(code, row, uid, who, hcp) : { state: 'gone' });
    }
    if (u.pathname.endsWith('/rpc/golfos_answer_join')) {
      const { join_code, player, yes } = body();
      const row = shared.get(join_code);
      if (!row || (row.owner !== uid && !row.members.includes(uid)) || !row.requests[player]) return json(200, false);
      row.requests[player].state = yes ? 'ok' : 'no';
      if (yes && !row.members.includes(player)) row.members.push(player);
      return json(200, true);
    }
    // rounds nearby: those shown within their circle, nearest first (the equirectangular distance, as the SQL)
    if (u.pathname.endsWith('/rpc/golfos_nearby_rounds')) {
      const { at_lat, at_lon } = body();
      const rad = (d) => (d * Math.PI) / 180;
      const out = [...shared.values()]
        .filter((r) => r.near && new Date(r.near.near_until) > new Date())
        .map((r) => ({ r, d: 6371000 * Math.hypot(rad(r.near.near_lat - at_lat), Math.cos(rad(at_lat)) * rad(r.near.near_lon - at_lon)) }))
        .filter((x) => x.d <= x.r.near.near_radius)
        .map(({ r, d }) => ({ ref: r.near.near_ref, name: r.game.name, course: r.game.course.name, host: r.near.near_host, tournament: !!r.game.tournament, mode: r.game.format?.mode, dist: Math.round(d) }));
      return json(200, out);
    }
    if (u.pathname.endsWith('/golfos_shared_games')) {
      const code = (u.searchParams.get('code') ?? '').replace(/^eq\./, '');
      const row = shared.get(code);
      // the row rules: host and members – a flight's row (a tournament): whoever is in its event
      const inEvent = (ev) => !!shared.get(ev) && (shared.get(ev).owner === uid || shared.get(ev).members.includes(uid));
      const mine = row && (row.event_code ? inEvent(row.event_code) : row.owner === uid || row.members.includes(uid));
      const evCode = (u.searchParams.get('event_code') ?? '').replace(/^eq\./, '');
      if (req.method() === 'GET' && u.searchParams.has('event_code')) {
        if (o.noSplit) return json(400, { code: '42703', message: 'column golfos_shared_games.event_code does not exist' });
        flightReads++;
        return json(200, inEvent(evCode) ? [...shared.values()].filter((r) => r.event_code === evCode).map((r) => ({ game: r.game, updated_at: r.updated_at })) : []);
      }
      if (req.method() === 'GET' && /near_requests/.test(u.searchParams.get('select') ?? '')) return json(200, mine ? [{ near_requests: row.requests }] : []);
      if (req.method() === 'GET') return json(200, mine ? [{ game: row.game, updated_at: row.updated_at }] : []);
      if (req.method() === 'POST') {
        const r = body();
        if (shared.has(r.code)) return json(409, { code: '23505' });
        if (r.event_code && (o.noSplit || !inEvent(r.event_code))) return json(o.noSplit ? 400 : 403, { message: 'not in the event' });
        shared.set(r.code, { game: r.game, updated_at: new Date().toISOString(), owner: uid, members: [], requests: {}, ...(r.event_code ? { event_code: r.event_code } : {}) });
        if (r.event_code) return json(201, [{ code: r.code }]);
        return json(201, null);
      }
      if (req.method() === 'PATCH') {
        const at = (u.searchParams.get('updated_at') ?? '').replace(/^eq\./, '');
        if (!mine || (at && at !== row.updated_at)) {
          refused++;
          return json(200, []);
        }
        const b = body();
        if (b.near_lat != null) {
          row.near = b; // shown nearby – the event itself unchanged
          return json(204, null);
        }
        row.game = b.game;
        row.updated_at = b.updated_at;
        return json(200, [{ code }]);
      }
    }
    return json(404, { message: 'not simulated' });
  }
  /** A phone: signed in as `name` – or `{ guest: true }`: never signed in, the profile empty. */
  async function phone(name, opt = {}) {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 5 }, permissions: ['geolocation'] });
    await mockNet(ctx);
    await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, serve);
    const p = await ctx.newPage();
    const errs = [];
    // the simulated server: WebKit does not route the CORS preflight of the sync – not the app
    p.on('pageerror', (e) => { if (!/golfos_items.*access control|(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
    await p.goto(url);
    await p.waitForTimeout(1200);
    await p.evaluate(({ name, guest }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1');
      localStorage.setItem('golfos.tip.shots.v1', '1');
      if (!guest) {
        localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
        // signed in (the token is only checked by the simulated server)
        localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: `tok-${name}`, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
      }
      sessionStorage.setItem('golfos.module', 'rounds');
    }, { name, guest: !!opt.guest });
    await p.reload();
    await p.waitForTimeout(1500);
    return { p, errs };
  }
  const round = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt));
  // the (first) event, with its flights' own rows over the ones in its row
  const event = () => {
    const [code, row] = [...shared.entries()].find(([, r]) => !r.event_code) ?? [];
    if (!row) return undefined;
    const own = [...shared.values()].filter((r) => r.event_code === code).map((r) => r.game.flight);
    return { ...row.game, flights: { ...row.game.flights, ...Object.fromEntries(own.map((f) => [f.id, f])) } };
  };
  return { shared, pushes, phone, round, event, refused: () => refused, flightReads: () => flightReads };
}
