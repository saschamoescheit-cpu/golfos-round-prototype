// The simulated Supabase of the shared rounds, as supabase/golfos-shared-games.sql: the table with its write rule "only
// if nobody wrote in between", a round only for its host and the ones let in (asking by code or nearby, the host's
// answer), rounds nearby, the push function (its requests counted), and accounts without Google (anonymous sign-up) –
// with the phones signed in to it, for the QA scripts of the rounds on several phones. The app is real.
// `old: true`: the server before the SQL of 30.10.2026 – a code lets everyone in, no asking.
import { devices } from 'playwright';
import { mockNet } from './netmock.mjs';

// an account's token as Supabase hands it out: a JWT whose "sub" is the account (here its name) – myAccount() and the
// phone's account in a flight read it
export const tokenOf = (name) => `h.${Buffer.from(JSON.stringify({ sub: name })).toString('base64url')}.s`;
const accountOf = (t) => {
  try {
    return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub ?? '';
  } catch {
    return '';
  }
};

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
    const uid = accountOf((req.headers()['authorization'] ?? '').replace(/^Bearer /, '')); // each phone its account
    const body = () => JSON.parse(req.postData() ?? '{}');
    if (u.pathname.endsWith('/golfos_items')) return json(200, []);
    // an account without Google: its token is its name
    if (u.pathname.endsWith('/auth/v1/signup')) {
      if (o.noAnonymous) return json(422, { error_code: 'anonymous_provider_disabled' });
      const name = (body().data?.name ?? `guest${++anon}`).replace(/\s+/g, '');
      return json(200, { access_token: tokenOf(name), refresh_token: 'y', expires_in: 3600, user: { id: name, is_anonymous: true } });
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
      if (row.event_code) return json(200, null); // a flight's row: only through its event
      // a series of tournaments (01.11.2026, Games' SQL): in the series and in every round of it – unless called off
      if (row.game.kind === 'tour-series') {
        if (row.game.deletedAt) return json(200, row.game);
        for (const c of [join_code, ...row.game.rounds.map((x) => x.code)]) {
          const rr = shared.get(c);
          if (rr && rr.owner !== uid && !rr.members.includes(uid)) rr.members.push(uid);
        }
        return json(200, row.game);
      }
      // a tournament planned in Games (01.11.2026): the code is the host's invitation – in at once, unless called off
      if (row.game.planned && row.game.deletedAt) return json(200, row.game);
      if (!o.old && row.game.kind === 'round-event' && !row.game.planned && row.owner !== uid && !row.members.includes(uid)) return json(200, { kind: 'ask-host' });
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
      // the rows of a kind this account may read (the pools of bets: lib/wagerstore syncPools) – with their host
      if (req.method() === 'GET' && u.searchParams.has('game->>kind')) {
        const kind = (u.searchParams.get('game->>kind') ?? '').replace(/^eq\./, '');
        return json(200, [...shared.entries()].filter(([, r]) => !r.event_code && r.game.kind === kind && (r.owner === uid || r.members.includes(uid))).map(([c, r]) => ({ code: c, game: r.game, owner: r.owner, updated_at: r.updated_at })));
      }
      // the planned tournaments of a day this account may read (Rounds' start page)
      if (req.method() === 'GET' && u.searchParams.has('game->>planned')) {
        const day = (u.searchParams.get('game->>date') ?? '').replace(/^eq\./, '');
        const rows = [...shared.entries()].filter(([, r]) => !r.event_code && r.game.planned && (!day || r.game.date === day) && (r.owner === uid || r.members.includes(uid)));
        return json(200, rows.map(([c, r]) => ({ code: c, game: r.game })));
      }
      if (req.method() === 'GET' && u.searchParams.has('event_code')) {
        if (o.noSplit) return json(400, { code: '42703', message: 'column golfos_shared_games.event_code does not exist' });
        flightReads++;
        return json(200, inEvent(evCode) ? [...shared.values()].filter((r) => r.event_code === evCode).map((r) => ({ game: r.game, updated_at: r.updated_at })) : []);
      }
      if (req.method() === 'GET' && /near_requests/.test(u.searchParams.get('select') ?? '')) return json(200, mine ? [{ near_requests: row.requests }] : []);
      if (req.method() === 'GET') return json(200, mine ? [{ game: row.game, updated_at: row.updated_at, owner: row.owner }] : []);
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
    await p.evaluate(({ name, guest, token }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1');
      localStorage.setItem('golfos.tip.shots.v1', '1');
      if (!guest) {
        localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
        // signed in (the token is only checked by the simulated server)
        localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: token, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
      }
      sessionStorage.setItem('golfos.module', 'rounds');
    }, { name, guest: !!opt.guest, token: tokenOf(name) });
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
  /**
   * A tournament planned ahead as Games does it (Sascha 01.11.2026: "planned in Games, played in Rounds") – through the
   * app's own code on the host's page: plannedEvent + publishPlannedEvent. `option` picks the holes by the loop option's
   * label (/A · 9/, /Kurzplatz/); `date` defaults to today on the phone. The code.
   */
  async function plan(p, o) {
    return p.evaluate(async (o) => {
      const sr = await import('/src/lib/sharedround.ts');
      const { searchBundled, loadCourse } = await import('/src/lib/courses.ts');
      const { loopOptions, buildRoundHoles } = await import('/src/lib/loops.ts');
      const sp = await import('/src/lib/specials.ts');
      const summary = searchBundled(o.course ?? 'Hetzenhof')[0];
      const course = await loadCourse(summary);
      const opt = loopOptions(course.holes).find((x) => new RegExp(o.option ?? 'A · 9').test(x.label)) ?? loopOptions(course.holes)[0];
      const holes = buildRoundHoles(course.holes, opt);
      const ev = sr.plannedEvent({
        name: o.name,
        date: o.date ?? sr.localDay(),
        course: summary,
        holes,
        loopOrder: opt.loops,
        format: o.format ?? { mode: 'single', scoring: 'net', allowance: 100 },
        ...(o.classes ? { classes: o.classes } : {}),
        // the special prizes: on the hole given, else the first that fits (Nearest to the Pin a par 3, Long Drive a par 4 or 5)
        ...(o.specials ? { specials: o.specials.map((s, k) => ({ id: s.id ?? `s${k + 1}`, kind: s.kind, hole: s.hole ?? sp.holesFor(s.kind, holes)[0] })) } : {}),
        flights: o.flights,
      });
      return sr.publishPlannedEvent(ev);
    }, o);
  }
  /** A phone joins a planned tournament by its link on the day: its own name in the plan – in at once, the hole map. */
  async function joinPlanned(p, code) {
    await p.goto('about:blank');
    await p.goto(url + '#round=' + code);
    await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
  }
  /** A series of planned tournaments (as Games makes it): its own code, its rounds copied from their events. */
  function series(owner, name, codes, o2 = {}) {
    const code = 'S' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const rounds = codes.map((c) => ({ code: c, date: shared.get(c).game.date, name: shared.get(c).game.name, course: { id: shared.get(c).game.course.id, name: shared.get(c).game.course.name } })).sort((a, b) => a.date.localeCompare(b.date));
    shared.set(code, { game: { kind: 'tour-series', id: code.toLowerCase(), name, createdAt: new Date().toISOString(), rounds, ...(o2.deletedAt ? { deletedAt: o2.deletedAt } : {}) }, updated_at: new Date().toISOString(), owner, members: [], requests: {} });
    return code;
  }
  return { shared, pushes, phone, round, event, plan, joinPlanned, series, refused: () => refused, flightReads: () => flightReads };
}
