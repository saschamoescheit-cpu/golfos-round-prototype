import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { b64u, fromB64u } from '../../supabase/functions/golfos-push/index';

// The push function as a whole (final list, Sascha 23.10.2026), as Supabase runs it: its requests answered by a small
// copy of the database (the few query forms it uses), the push services by a recorder. Every notification sent is
// decrypted with the phone's own key and read – what the player would see.

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
const KEYS: Record<string, string[]> = { golfos_push: ['endpoint'], golfos_push_sent: ['user_id', 'key'], golfos_push_keys: ['id'] };
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
        else if (!old) rows.push({ ...x });
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

// Sascha's iPhone: one key pair for all the steps below
let saschaPhone: Awaited<ReturnType<typeof phone>> | null = null;
const sascha = async () => (saschaPhone ??= await phone('https://web.push.apple.com/sascha-iphone'));

describe('the push function, end to end against a copy of the database', () => {
  it('hands out its key – made once, the same every time', async () => {
    const a = await (await handle(new Request('https://db.test/functions/v1/golfos-push'))).json();
    const b = await (await post({ action: 'key' })).json();
    expect(fromB64u(a.publicKey).length).toBe(65);
    expect(b.publicKey).toBe(a.publicKey);
    expect(tables.golfos_push_keys.length).toBe(1);
  });

  it('only a signed-in player subscribes; the phone gets a hello it can read, signed for its push service', async () => {
    const iphone = await sascha();
    expect((await post({ action: 'subscribe', subscription: iphone.subscription })).status).toBe(401);
    expect((await post({ action: 'subscribe', subscription: iphone.subscription }, 'forged')).status).toBe(401);
    const r = await post({ action: 'subscribe', subscription: iphone.subscription, kinds: { rounds: true, games: true, weather: true }, tz: 'Europe/Berlin', lang: 'de' }, 'token-sascha');
    expect(await r.json()).toEqual({ ok: true, sent: true });
    expect(tables.golfos_push).toMatchObject([{ endpoint: 'https://web.push.apple.com/sascha-iphone', user_id: 'u-sascha', tz: 'Europe/Berlin', lang: 'de' }]);
    const [hello] = await iphone.inbox();
    expect(hello).toMatchObject({ title: 'GolfOS', body: 'Mitteilungen sind an ✓' });
    const sent = pushes[pushes.length - 1];
    expect(sent.headers['content-encoding']).toBe('aes128gcm');
    expect(sent.headers.authorization).toMatch(/^vapid t=.+, k=/);
    const claims = JSON.parse(new TextDecoder().decode(fromB64u(sent.headers.authorization.split(' t=')[1].split('.')[1])));
    expect(claims.aud).toBe('https://web.push.apple.com');
  });

  it('a round not signed: reminded once, in the day hours of the phone, straight to its check', async () => {
    tables.golfos_items = [
      { user_id: 'u-sascha', kind: 'round', id: 'r-old', deleted: false, data: { courseName: 'Golfclub Hetzenhof', finishedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), signedAt: null, entries: { me: [{ strokes: 4 }] } } },
      { user_id: 'u-sascha', kind: 'round', id: 'r-new', deleted: false, data: { courseName: 'Golfclub Hetzenhof', finishedAt: new Date(Date.now() - 1 * 3600e3).toISOString(), signedAt: null, entries: { me: [{ strokes: 4 }] } } },
      { user_id: 'u-max', kind: 'round', id: 'r-max', deleted: false, data: { courseName: 'Elsewhere', finishedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), signedAt: null, entries: { me: [{ strokes: 4 }] } } },
    ];
    const iphone = await sascha();
    const before = (await iphone.inbox()).length;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(new Date()));
    const day = hour >= 9 && hour <= 20;
    const t1 = await (await post({ action: 'tick' })).json();
    expect(t1.rounds).toBe(day ? 1 : 0);
    if (day) {
      const notes = (await iphone.inbox()).slice(before);
      expect(notes).toEqual([expect.objectContaining({ title: 'Runde noch nicht geprüft', url: './#review=r-old' })]);
      expect(notes[0].body).toContain('Golfclub Hetzenhof');
    }
    const t2 = await (await post({ action: 'tick' })).json();
    expect(t2.rounds).toBe(0); // once per round
  });

  it('a thunderstorm while a round is played: warned once, urgent; not after the round', async () => {
    const iphone = await sascha();
    await post({ action: 'round', endpoint: iphone.subscription.endpoint, round: { lat: 48.78123, lng: 9.67345, course: 'Golfclub Hetzenhof' } }, 'token-sascha');
    expect(tables.golfos_push[0].round_at).toMatchObject({ lat: 48.781, lng: 9.673, course: 'Golfclub Hetzenhof' });
    // another player cannot move this phone's round
    await post({ action: 'round', endpoint: iphone.subscription.endpoint, round: null }, 'token-max');
    expect(tables.golfos_push[0].round_at).not.toBeNull();
    const n0 = pushes.length;
    storm = false;
    expect((await (await post({ action: 'tick' })).json()).storms).toBe(0);
    storm = true;
    expect((await (await post({ action: 'tick' })).json()).storms).toBe(1);
    expect((await (await post({ action: 'tick' })).json()).storms).toBe(0); // once per round
    const warn = pushes.slice(n0).find((p) => p.endpoint === iphone.subscription.endpoint)!;
    expect(warn.headers.urgency).toBe('high');
    const notes = await iphone.inbox();
    expect(notes[notes.length - 1]).toMatchObject({ title: 'Gewitterwarnung', tag: 'golfos-weather' });
    expect(notes[notes.length - 1].body).toContain('Regel 5.7');
    // the round ends: the place is forgotten
    await post({ action: 'round', endpoint: iphone.subscription.endpoint, round: null }, 'token-sascha');
    expect(tables.golfos_push[0].round_at).toBeNull();
  });

  it('games on several phones: the host hears who joined, the others that the game ended – not the one who did it', async () => {
    const max = await phone('https://fcm.googleapis.com/fcm/send/max-android');
    const tim = await phone('https://fcm.googleapis.com/fcm/send/tim-android');
    await post({ action: 'subscribe', subscription: max.subscription, lang: 'de' }, 'token-max');
    await post({ action: 'subscribe', subscription: tim.subscription, lang: 'en', kinds: { rounds: true, games: false, weather: true } }, 'token-tim');
    tables.golfos_shared_games = [{ code: 'ABC234', owner: 'u-sascha', members: ['u-max', 'u-tim'], game: { courseName: 'Golfclub Hetzenhof' } }];
    const iphone = await sascha();
    const n = (await iphone.inbox()).length;
    expect((await post({ action: 'joined', code: 'ABC234' }, 'token-max')).status).toBe(200);
    await post({ action: 'joined', code: 'abc234' }, 'token-max'); // twice: said once
    const heard = (await iphone.inbox()).slice(n);
    expect(heard).toEqual([expect.objectContaining({ title: 'Mitspieler dabei', url: './#games' })]);
    // a stranger is not in the game
    expect((await post({ action: 'finished', code: 'ABC234' }, 'token-unknown')).status).toBe(401);
    tables.golfos_shared_games[0].members = ['u-max'];
    expect((await post({ action: 'finished', code: 'ABC234' }, 'token-tim')).status).toBe(403);
    tables.golfos_shared_games[0].members = ['u-max', 'u-tim'];
    // Sascha ends it: Max hears of it; Tim turned games off; Sascha himself not
    const before = (await iphone.inbox()).length;
    await post({ action: 'finished', code: 'ABC234' }, 'token-sascha');
    expect((await max.inbox()).map((x) => x.title)).toEqual(['GolfOS', 'Spiel beendet']);
    expect((await tim.inbox()).map((x) => x.title)).toEqual(['GolfOS']);
    expect((await iphone.inbox()).length).toBe(before);
  });

  it('a round: the host hears who asks to join – only from a phone that asked, once (Sascha 30.10.2026)', async () => {
    tables.golfos_shared_games = [
      { code: 'RND234', owner: 'u-sascha', members: [], near_ref: 'ref-abc', near_requests: { 'u-max': { name: 'Max', state: 'asked' }, 'u-tim': { name: 'Tim', state: 'ok' } }, game: { kind: 'round-event', course: { name: 'Golfclub Hetzenhof' } } },
    ];
    const iphone = await sascha();
    const n = (await iphone.inbox()).length;
    expect((await post({ action: 'asked', code: 'rnd234' }, 'token-max')).status).toBe(200);
    await post({ action: 'asked', ref: 'ref-abc' }, 'token-max'); // by the round nearby, again: said once
    const heard = (await iphone.inbox()).slice(n);
    expect(heard).toEqual([expect.objectContaining({ title: 'Beitrittsanfrage', tag: 'golfos-join' })]);
    expect(heard[0].body).toContain('Max möchte deiner Runde in Golfclub Hetzenhof beitreten');
    // let in already, or never asked: nothing
    expect((await post({ action: 'asked', code: 'RND234' }, 'token-tim')).status).toBe(403);
    expect((await post({ action: 'asked' }, 'token-tim')).status).toBe(400);
  });

  it('a phone the push service no longer knows is forgotten; turned off, it is gone', async () => {
    const old = await phone(GONE);
    await post({ action: 'subscribe', subscription: old.subscription }, 'token-max'); // the hello comes back 410
    expect(tables.golfos_push.some((r) => r.endpoint === GONE)).toBe(false);
    const max = 'https://fcm.googleapis.com/fcm/send/max-android';
    await post({ action: 'unsubscribe', endpoint: max }, 'token-sascha'); // not his phone: stays
    expect(tables.golfos_push.some((r) => r.endpoint === max)).toBe(true);
    await post({ action: 'unsubscribe', endpoint: max }, 'token-max');
    expect(tables.golfos_push.some((r) => r.endpoint === max)).toBe(false);
  });

  it('settings: a kind off reaches the server; unknown actions and bad subscriptions are refused', async () => {
    const ep = 'https://web.push.apple.com/sascha-iphone';
    await post({ action: 'settings', endpoint: ep, kinds: { rounds: false, games: true, weather: true } }, 'token-sascha');
    expect(tables.golfos_push.find((r) => r.endpoint === ep)!.kinds).toEqual({ rounds: false, games: true, weather: true });
    expect((await post({ action: 'subscribe', subscription: { endpoint: 'http://insecure.example/x', keys: { p256dh: 'a', auth: 'b' } } }, 'token-sascha')).status).toBe(400);
    expect((await post({ action: 'nonsense' }, 'token-sascha')).status).toBe(400);
  });
});
