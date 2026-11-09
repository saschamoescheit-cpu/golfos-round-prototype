import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { b64u } from '../../supabase/functions/golfos-push/index';

// The pushes of 07.11.2026 (Sascha: "please build 1–6") through the whole function, as pushfunction.test.ts does it:
// a small copy of the database, every notification decrypted with the phone's own key – what the player reads.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const pushes: { endpoint: string; headers: Record<string, string>; body: Uint8Array }[] = [];
const users: Record<string, string> = { 'token-sascha': 'u-sascha', 'token-max': 'u-max', 'token-tim': 'u-tim' };
let storm = false;
const GONE = 'https://updates.push.services.mozilla.com/wpush/v2/gone';

const field = (row: Row, key: string): unknown => (key.includes('->>') ? (row[key.split('->>')[0]] as Row | undefined)?.[key.split('->>')[1]] : row[key]);
function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, cond] of params) {
    if (key === 'select' || key === 'on_conflict') continue;
    const dot = cond.indexOf('.');
    const op = cond.slice(0, dot);
    const val = cond.slice(dot + 1);
    const v = field(row, key);
    if (op === 'eq' && String(v) !== val) return false;
    if (op === 'neq' && String(v) === val) return false;
    if (op === 'gte' && !(v != null && String(v) >= val)) return false;
    if (op === 'in' && !val.slice(1, -1).split(',').includes(String(v))) return false;
    if (op === 'like' && !new RegExp(`^${val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(String(v))) return false;
  }
  return true;
}
const KEYS: Record<string, string[]> = { golfos_push: ['endpoint'], golfos_push_sent: ['user_id', 'key'], golfos_push_keys: ['id'], golfos_shared_games: ['code'], golfos_friend_cards: ['user_id'] };
const same = (t: string, a: Row, b: Row) => KEYS[t].every((k) => a[k] === b[k]);

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(input));
  const method = init?.method ?? 'GET';
  const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.host === 'db.test' && u.pathname === '/auth/v1/user') {
    const id = users[(headers.authorization ?? '').replace('Bearer ', '')];
    return id ? Response.json({ id }) : new Response('no', { status: 401 });
  }
  if (u.host === 'db.test' && u.pathname.startsWith('/rest/v1/')) {
    expect(headers.authorization).toBe('Bearer service-key'); // the function reads and writes with the service key
    const t = u.pathname.slice(9);
    const rows = (tables[t] ??= []);
    if (method === 'GET') return Response.json(rows.filter((r) => matches(r, u.searchParams)));
    if (method === 'DELETE') {
      tables[t] = rows.filter((r) => !matches(r, u.searchParams));
      return new Response(null, { status: 204 });
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init!.body));
      for (const r of rows) if (matches(r, u.searchParams)) Object.assign(r, patch);
      return new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init!.body));
      for (const x of Array.isArray(body) ? body : [body]) {
        const old = rows.find((r) => same(t, r, x));
        if (old && /merge-duplicates/.test(headers.prefer ?? '')) Object.assign(old, x);
        else if (!old) rows.push({ ...(t === 'golfos_push_sent' ? { sent_at: new Date().toISOString() } : {}), ...x });
      }
      return new Response(null, { status: 201 });
    }
  }
  if (u.host === 'api.open-meteo.com') return Response.json({ hourly: { weather_code: storm ? [3, 95] : [3, 61] } });
  // a push service
  pushes.push({ endpoint: String(input), headers, body: new Uint8Array(init!.body as ArrayBuffer) });
  return new Response(null, { status: String(input) === GONE ? 410 : 201 });
}

let handle: (r: Request) => Promise<Response>;
beforeAll(async () => {
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (k: string) => ({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_ANON_KEY: 'anon-key' })[k] },
    serve: () => {},
  };
  vi.stubGlobal('fetch', fakeFetch);
  handle = (await import('../../supabase/functions/golfos-push/index')).handle;
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { Deno?: unknown }).Deno;
});

const post = (body: unknown, token?: string) =>
  handle(new Request('https://db.test/functions/v1/golfos-push', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

/** A phone: its own key pair and secret, as the browser makes them. */
async function phone(endpoint: string) {
  const k = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const read = async (body: Uint8Array) => {
    const hk = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
      new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
    const te = new TextEncoder();
    const as = body.slice(21, 21 + body[20]);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', as, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, k.privateKey, 256));
    const ikm = await hk(auth, ecdh, new Uint8Array([...te.encode('WebPush: info'), 0, ...pub, ...as]), 32);
    const salt = body.slice(0, 16);
    const cek = await hk(salt, ikm, new Uint8Array([...te.encode('Content-Encoding: aes128gcm'), 0]), 16);
    const nonce = await hk(salt, ikm, new Uint8Array([...te.encode('Content-Encoding: nonce'), 0]), 12);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), body.slice(21 + body[20])));
    return JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))));
  };
  const inbox = async () => Promise.all(pushes.filter((p) => p.endpoint === endpoint).map((p) => read(p.body)));
  return { subscription: { endpoint, keys: { p256dh: b64u(pub), auth: b64u(auth) } }, inbox };
}


const phones: Record<string, Awaited<ReturnType<typeof phone>>> = {};
const seen: Record<string, number> = {};
type Note = { title: string; body: string; tag: string; url: string };
/** What arrived on a phone since the last look (the hello of the subscription left out). */
const fresh = async (who: string): Promise<Note[]> => {
  const all = ((await phones[who].inbox()) as Note[]).filter((n) => n.tag !== 'golfos-hello');
  const out = all.slice(seen[who] ?? 0);
  seen[who] = all.length;
  return out;
};
const shared = () => (tables.golfos_shared_games ??= []);
const flightRow = (code: string, flight: Row) => ({ code: `${code}-${flight.id}`, event_code: code, owner: 'u-sascha', members: ['u-max', 'u-tim'], game: { kind: 'round-flight', flight } });

describe('the pushes of 07.11.2026: tournament changed, result, countersign, new bet, settlement, special prize', () => {
  beforeAll(async () => {
    for (const who of ['sascha', 'max', 'tim']) {
      phones[who] = await phone(`https://web.push.apple.com/${who}`);
      await post({ action: 'subscribe', subscription: phones[who].subscription, lang: 'de', kinds: { rounds: true, games: true, weather: true, agility: true, specials: who !== 'tim' } }, `token-${who}`);
    }
    // Max linked by his friend card (Max Muster), Tim by the name he gave joining
    (tables.golfos_friend_cards ??= []).push({ user_id: 'u-max', first_name: 'Max', last_name: 'Muster' });
    shared().push({
      code: 'TOUR01',
      owner: 'u-sascha',
      members: ['u-max', 'u-tim'],
      near_requests: { 'u-tim': { name: 'Tim', state: 'ok' } },
      game: { kind: 'round-event', planned: true, tournament: true, name: 'USA Tag 1', date: '2026-11-09', holes: [{ label: '1' }, { label: '2' }, { label: '3' }], specials: [{ id: 's1', kind: 'nearestPin', hole: 2 }], flights: {} },
    });
    shared().push(flightRow('TOUR01', { id: 'f1', name: 'Flight 1', players: [{ id: 'p1', name: 'Max' }, { id: 'p2', name: 'Tim' }], markers: { p1: 'p2', p2: 'p1' } }));
    shared().push(flightRow('TOUR01', { id: 'f2', name: 'Flight 2', players: [{ id: 'q1', name: 'Erik' }] }));
  });
  const flight = (id: string) => (shared().find((r) => r.code === `TOUR01-${id}`)!.game as { flight: Row }).flight;

  it('1 · the host changed the tournament: each player what changed for him – only the host tells', async () => {
    const r = await post({ action: 'tour-changed', code: 'TOUR01', changes: { max: 'dein Flight: Flight 2 · 12:16 · mit Erik', tim: 'dein Zähler: Erik' }, general: '' }, 'token-sascha');
    expect(r.status).toBe(200);
    const [m] = await fresh('max');
    expect(m.title).toBe('USA Tag 1 · geändert');
    expect(m.body).toBe('Dein Flight: Flight 2 · 12:16 · mit Erik');
    expect(m.url).toBe('./#tour=TOUR01');
    expect((await fresh('tim'))[0].body).toBe('Dein Zähler: Erik');
    expect(await fresh('sascha')).toHaveLength(0); // the host does not hear of his own change
    // the day changed: everyone hears it, his own change first
    await post({ action: 'tour-changed', code: 'TOUR01', changes: { max: 'dein Flight: Flight 1' }, general: 'neuer Tag: Di., 10.11.' }, 'token-sascha');
    expect((await fresh('max'))[0].body).toBe('Dein Flight: Flight 1 · neuer Tag: Di., 10.11.');
    expect((await fresh('tim'))[0].body).toBe('Neuer Tag: Di., 10.11.');
    // nobody but the host
    expect((await post({ action: 'tour-changed', code: 'TOUR01', changes: { tim: 'x' }, general: 'abgesagt' }, 'token-max')).status).toBe(403);
    expect(await fresh('tim')).toHaveLength(0);
  });

  it('3 · a card signed: the marker is asked to countersign, then the player hears it is in – as the flight row says', async () => {
    Object.assign(flight('f1'), { phones: { ph1: { player: 'p1', uid: 'u-max' }, ph2: { player: 'p2', uid: 'u-tim' } } });
    // not signed on the server: nothing
    expect((await post({ action: 'signed', code: 'TOUR01', flight: 'f1', player: 'p1', as: 'player' }, 'token-max')).status).toBe(409);
    Object.assign(flight('f1'), { signed: { p1: { player: '2026-11-09T15:00:00Z' } } });
    await post({ action: 'signed', code: 'TOUR01', flight: 'f1', player: 'p1', as: 'player' }, 'token-max');
    const [ask] = await fresh('tim');
    expect(ask.title).toBe('Bitte gegenzeichnen');
    expect(ask.body).toBe('Max hat seine Karte signiert – prüfe sie und zeichne als Zähler gegen.');
    expect(await fresh('max')).toHaveLength(0);
    // told once
    await post({ action: 'signed', code: 'TOUR01', flight: 'f1', player: 'p1', as: 'player' }, 'token-max');
    expect(await fresh('tim')).toHaveLength(0);
    Object.assign(flight('f1'), { signed: { p1: { player: '2026-11-09T15:00:00Z', marker: '2026-11-09T15:02:00Z' } } });
    await post({ action: 'signed', code: 'TOUR01', flight: 'f1', player: 'p1', as: 'marker' }, 'token-tim');
    const [done] = await fresh('max');
    expect(done.title).toBe('Karte gegengezeichnet ✓');
    expect(done.body).toBe('Tim hat deine Karte gegengezeichnet – sie ist eingereicht.');
  });

  it('6 · a special prize: a new best to everyone in the tournament with the switch on – once per best', async () => {
    Object.assign(flight('f1'), { specials: { s1: { p1: { m: 2.34, at: '2026-11-09T14:00:00Z' } } } });
    await post({ action: 'special', code: 'TOUR01', special: 's1' }, 'token-max');
    const [s] = await fresh('sascha');
    expect(s.title).toBe('Neuer Nearest to the Pin · Loch 3');
    expect(s.body).toBe('Max: 2,3 m · USA Tag 1');
    expect(await fresh('max')).toHaveLength(0); // who entered it sees it
    expect(await fresh('tim')).toHaveLength(0); // his switch off
    await post({ action: 'special', code: 'TOUR01', special: 's1' }, 'token-max');
    expect(await fresh('sascha')).toHaveLength(0); // the same best: not again
    // Erik closer: a new best
    Object.assign(flight('f2'), { specials: { s1: { q1: { m: 1.1, at: '2026-11-09T15:00:00Z' } } } });
    await post({ action: 'special', code: 'TOUR01', special: 's1' }, 'token-sascha');
    expect((await fresh('max'))[0].body).toBe('Erik: 1,1 m · USA Tag 1');
  });

  it("2 · every flight in: the result once – the winner and one's own place, the series' total", async () => {
    const rows = [
      { name: 'Tim', pos: '1', sort: -2 },
      { name: 'Max', pos: '2', sort: 3 },
      { name: 'Erik', pos: '3', sort: 7 },
    ];
    // a flight still out: nothing
    flight('f1').finishedAt = '2026-11-09T16:00:00Z';
    expect((await post({ action: 'tour-result', code: 'TOUR01', rows, hb: false }, 'token-max')).status).toBe(409);
    flight('f2').finishedAt = '2026-11-09T16:30:00Z';
    const series = { rows: [{ name: 'Max', pos: '1', sort: 1 }, { name: 'Tim', pos: '2', sort: 4 }], hb: false };
    await post({ action: 'tour-result', code: 'TOUR01', rows, hb: false, series }, 'token-max');
    const [t] = await fresh('tim');
    expect(t.title).toBe('USA Tag 1 · Endstand');
    expect(t.body).toBe('Sieger: Tim (−2) · du hast gewonnen ✓ · Gesamt: Max führt (+1), du Platz 2');
    expect((await fresh('max'))[0].body).toBe('Sieger: Tim (−2) · du: Platz 2 (+3) · Gesamt: Max führt (+1)');
    expect((await fresh('sascha'))[0].body).toBe('Sieger: Tim (−2) · Gesamt: Max führt (+1)'); // the host plays not
    await post({ action: 'tour-result', code: 'TOUR01', rows, hb: false }, 'token-tim');
    expect([...(await fresh('tim')), ...(await fresh('max'))]).toHaveLength(0); // once
    expect((await post({ action: 'tour-result', code: 'TOUR01', rows }, 'token-nobody')).status).toBe(401);
  });

  it('4 · new bets: the player hears his own, the one it is against hears who bets against him – once each', async () => {
    shared().push({
      code: 'POOL01',
      owner: 'u-sascha',
      members: ['u-max', 'u-tim'],
      game: {
        kind: 'wager-pool',
        name: 'USA-Wetten',
        to: '2026-11-01',
        players: [
          { id: 'a', name: 'Sascha', joined: { uid: 'u-sascha' } },
          { id: 'b', name: 'Max', joined: { uid: 'u-max' } },
          { id: 'c', name: 'Tim', joined: { uid: 'u-tim' } },
          { id: 'd', name: 'Chris' },
        ],
        wagers: [
          { id: 'w1', player: 'b', kind: 'birdies', target: 3, by: 'Sascha' },
          { id: 'w2', player: 'a', kind: 'score', target: 5, opponent: 'c' },
          { id: 'w3', player: 'd', kind: 'pars', target: 9 },
          // a 5+5+10 challenge from Max to Tim (Sascha 10.11.2026: "a push where I accept it")
          { id: 'd1', player: 'b', opponent: 'c', kind: 'nassau', target: 0, parts: { front: 5, back: 5, total: 10 }, net: true, allowance: 75, day: '2026-11-10', challenge: { state: 'open', at: 'x' }, by: 'Max' },
        ],
      },
    });
    await post({ action: 'wager-new', code: 'POOL01', wagers: ['w1', 'w2', 'w3'] }, 'token-sascha');
    const [m] = await fresh('max');
    expect(m.title).toBe('Neue Wette für dich');
    expect(m.body).toBe('3 Birdies auf 18 · von Sascha · USA-Wetten');
    expect(m.url).toBe('./#pool=POOL01');
    const [t] = await fresh('tim');
    expect(t.title).toBe('Sascha wettet gegen dich');
    expect(t.body).toBe('+5 brutto · USA-Wetten');
    expect(await fresh('sascha')).toHaveLength(0); // his own bet against Tim: he set it up
    await post({ action: 'wager-new', code: 'POOL01', wagers: ['w1', 'w2'] }, 'token-sascha');
    expect([...(await fresh('max')), ...(await fresh('tim'))]).toHaveLength(0);
    expect((await post({ action: 'wager-new', code: 'POOL01', wagers: ['w1'] }, 'token-nobody')).status).toBe(401);
    // the challenge: to Tim "Max fordert dich zu 5+5+10 heraus", a tap opens the pool – once; nothing to Max
    await post({ action: 'wager-new', code: 'POOL01', wagers: ['d1'] }, 'token-max');
    const [c] = await fresh('tim');
    expect(c.title).toBe('Max fordert dich zu 5+5+10 heraus');
    expect(c.body).toBe('5 / 5 / 10 · netto 75 % · 10.11. · USA-Wetten · antippen zum Annehmen');
    expect(c.url).toBe('./#pool=POOL01');
    expect(await fresh('max')).toHaveLength(0);
    await post({ action: 'wager-new', code: 'POOL01', wagers: ['d1'] }, 'token-max');
    expect(await fresh('tim')).toHaveLength(0);
  });

  it('5 · a pool over: the settlement once to each – a day later the reminder to who still has to pay', async () => {
    const transfers = [
      { from: 'b', to: 'a', amount: 20 },
      { from: 'c', to: 'a', amount: 12.5 },
      { from: 'x', to: 'a', amount: 5 }, // no such player: left out
    ];
    await post({ action: 'settle', code: 'POOL01', transfers, sym: '$' }, 'token-max');
    const [m] = await fresh('max');
    expect(m.title).toBe('Abrechnung · USA-Wetten');
    expect(m.body).toBe('Du zahlst 20 $ an Sascha');
    expect((await fresh('sascha'))[0].body).toBe('Du bekommst 20 $ von Max · du bekommst 12,50 $ von Tim');
    expect((await fresh('tim'))[0].body).toBe('Du zahlst 12,50 $ an Sascha');
    // at once again: nothing (the reminder only a day later)
    await post({ action: 'settle', code: 'POOL01', transfers, sym: '$' }, 'token-max');
    expect([...(await fresh('max')), ...(await fresh('tim')), ...(await fresh('sascha'))]).toHaveLength(0);
    // a day later: Max has paid, Tim not
    for (const r of tables.golfos_push_sent) if (String(r.key) === 'settle:POOL01') r.sent_at = new Date(Date.now() - 25 * 3600e3).toISOString();
    await post({ action: 'settle', code: 'POOL01', transfers: [{ from: 'c', to: 'a', amount: 12.5 }], sym: '$' }, 'token-sascha');
    const [r] = await fresh('tim');
    expect(r.title).toBe('Noch offen · USA-Wetten');
    expect(r.body).toBe('Du zahlst 12,50 $ an Sascha – als bezahlt markieren unter Games › Bilanz.');
    expect([...(await fresh('max')), ...(await fresh('sascha'))]).toHaveLength(0);
    await post({ action: 'settle', code: 'POOL01', transfers: [{ from: 'c', to: 'a', amount: 12.5 }], sym: '$' }, 'token-sascha');
    expect(await fresh('tim')).toHaveLength(0); // reminded once
    // a pool still running: no settlement
    (shared().find((x) => x.code === 'POOL01')!.game as Row).to = '2099-01-01';
    expect((await post({ action: 'settle', code: 'POOL01', transfers, sym: '$' }, 'token-max')).status).toBe(409);
  });
});
