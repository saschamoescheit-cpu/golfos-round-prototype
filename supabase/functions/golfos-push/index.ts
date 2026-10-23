// GolfOS push notifications (final list, Sascha 23.10.2026: "push in the web prototype"). One Supabase Edge Function,
// one file – pasted once in the dashboard (Edge Functions → Deploy a new function → Via editor, name "golfos-push",
// then "Verify JWT" off: the function checks the player's sign-in itself).
//
// What it sends:
// - a round not yet checked and signed: once per round, 2 hours after it ended, between 9 and 20 o'clock of the phone
// - games on several phones: a fellow player joined your game; a game ended
// - a thunderstorm while a round is played: the forecast for the course, checked every 15 minutes
//
// Web Push as the standards say – the message encrypted for the phone (RFC 8291, aes128gcm), the sender signed
// (VAPID, RFC 8292) – with the Web Crypto of the platform, no library. The key pair of the sender is made by the function
// itself the first time and kept in the table golfos_push_keys: no secret to copy by hand, the private key never leaves
// the server. Tables and the 15-minute timer: supabase/golfos-push.sql.

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void } | undefined;

// ---------- bytes ----------

export const b64u = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64u = (s: string): Uint8Array => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// ---------- the sender's key (VAPID) ----------

export interface VapidKeys {
  publicKey: string; // the uncompressed point, base64url – what the app subscribes with
  privateJwk: JsonWebKey;
}

export async function newVapidKeys(): Promise<VapidKeys> {
  const k = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  return { publicKey: b64u(raw), privateJwk: await crypto.subtle.exportKey('jwk', k.privateKey) };
}

/** The "Authorization" header of one push: a token for the push service's origin, valid 12 hours. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const header = b64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', { ...keys.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

// ---------- the message, encrypted for the phone (RFC 8291) ----------

/** The body of one push. `ephemeral` and `salt` only for the test with the example of the RFC. */
export async function encrypt(
  plain: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
  fixed?: { asPrivate: JsonWebKey; asPublic: Uint8Array; salt: Uint8Array },
): Promise<Uint8Array> {
  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (fixed) {
    asPrivate = await crypto.subtle.importKey('jwk', fixed.asPrivate, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    asPublic = fixed.asPublic;
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));
  const ikm = await hkdf(authSecret, ecdh, cat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(plain, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// ---------- what the notifications say ----------

export interface Note {
  title: string;
  body: string;
  tag: string; // a later one with the same tag replaces it on the phone
  url: string; // opened by a tap – relative to the app
}

const T = (lang: string | null | undefined, en: string, de: string) => (lang === 'en' ? en : de);

export function roundNote(rounds: { id: string; courseName: string }[], lang?: string | null): Note {
  if (rounds.length === 1)
    return {
      title: T(lang, 'Round not checked yet', 'Runde noch nicht geprüft'),
      body: T(lang, `Your round at ${rounds[0].courseName} waits to be checked and signed.`, `Deine Runde in ${rounds[0].courseName} wartet aufs Prüfen und Signieren.`),
      tag: 'golfos-rounds',
      url: `./#review=${encodeURIComponent(rounds[0].id)}`,
    };
  return {
    title: T(lang, 'Rounds not checked yet', 'Runden noch nicht geprüft'),
    body: T(lang, `${rounds.length} rounds wait to be checked and signed.`, `${rounds.length} Runden warten aufs Prüfen und Signieren.`),
    tag: 'golfos-rounds',
    url: './#sign',
  };
}

export const joinedNote = (course: string, lang?: string | null): Note => ({
  title: T(lang, 'A player joined', 'Mitspieler dabei'),
  body: T(lang, `A fellow player joined your game at ${course}.`, `Ein Mitspieler ist deinem Spiel in ${course} beigetreten.`),
  tag: 'golfos-games',
  url: './#games',
});

export const finishedNote = (course: string, lang?: string | null): Note => ({
  title: T(lang, 'Game over', 'Spiel beendet'),
  body: T(lang, `The game at ${course} is over – the result is in Games.`, `Das Spiel in ${course} ist beendet – das Ergebnis steht in Games.`),
  tag: 'golfos-games',
  url: './#games',
});

export const stormNote = (course: string, lang?: string | null): Note => ({
  title: T(lang, 'Thunderstorm warning', 'Gewitterwarnung'),
  body: T(
    lang,
    `A thunderstorm is forecast at ${course} within the hour. With lightning leave the course at once – the rules let you stop (Rule 5.7).`,
    `Für ${course} ist in der nächsten Stunde Gewitter angesagt. Bei Blitz sofort den Platz verlassen – die Regeln erlauben das Unterbrechen (Regel 5.7).`,
  ),
  tag: 'golfos-weather',
  url: './',
});

export const helloNote = (lang?: string | null): Note => ({
  title: 'GolfOS',
  body: T(lang, 'Notifications are on ✓', 'Mitteilungen sind an ✓'),
  tag: 'golfos-hello',
  url: './',
});

// ---------- when to send ----------

/** The hour on the phone's clock (its time zone), 0–23. */
export function hourIn(tz: string | null | undefined, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz || 'Europe/Berlin' }).format(now));
  } catch {
    return now.getUTCHours() + 1;
  }
}

interface RoundData {
  courseName?: string;
  finishedAt?: string | null;
  signedAt?: string | null;
  preview?: boolean;
  capture?: string;
  entries?: Record<string, { strokes?: number | null; pickedUp?: boolean }[]>;
}

/** The rounds to remind of: ended (2 hours to 7 days ago), not signed, a real round with a score – as in the app. */
export function roundsToRemind(rows: { id: string; data: RoundData }[], sent: Set<string>, now: Date): { id: string; courseName: string; finishedAt: string }[] {
  const t = now.getTime();
  return rows
    .filter(({ id, data: r }) => {
      if (!r.finishedAt || r.signedAt || r.preview || r.capture === 'score' || sent.has(`round:${id}`)) return false;
      const age = t - Date.parse(r.finishedAt);
      if (!(age >= 2 * 3600e3 && age <= 7 * 24 * 3600e3)) return false;
      return Object.values(r.entries ?? {}).some((list) => list.some((e) => e && (e.strokes != null || e.pickedUp)));
    })
    .map(({ id, data }) => ({ id, courseName: data.courseName ?? 'GolfOS', finishedAt: data.finishedAt! }))
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
}

/** Thunderstorm in the next hour: weather codes 95, 96, 99 (WMO) in the hourly forecast. */
export const stormAhead = (codes: (number | null)[]): boolean => codes.slice(0, 2).some((c) => c != null && c >= 95);

// ---------- the server ----------

interface Sub {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  kinds: { rounds?: boolean; games?: boolean; weather?: boolean } | null;
  tz: string | null;
  lang: string | null;
  round_at: { lat: number; lng: number; course: string; until: string; since: string } | null;
}

const SUBJECT = 'https://saschamoescheit-cpu.github.io/golfos-round-prototype/';

function env(k: string): string {
  return (typeof Deno !== 'undefined' && Deno.env.get(k)) || '';
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function db() {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('GOLFOS_SERVICE_KEY');
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    get: async <X>(path: string): Promise<X> => {
      const r = await fetch(`${url}/rest/v1/${path}`, { headers: h });
      if (!r.ok) throw new Error(`${path.split('?')[0]} ${r.status} ${await r.text()}`);
      return r.json();
    },
    upsert: async (table: string, row: unknown, onConflict: string) => {
      const r = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, { method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(`${table} ${r.status} ${await r.text()}`);
    },
    insertIgnore: async (table: string, rows: unknown[]) => {
      if (!rows.length) return;
      await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: { ...h, Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
    },
    patch: async (path: string, body: unknown) => {
      await fetch(`${url}/rest/v1/${path}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    },
    del: async (path: string) => {
      await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers: h });
    },
  };
}

let keysCache: VapidKeys | null = null;
async function senderKeys(): Promise<VapidKeys> {
  if (keysCache) return keysCache;
  const d = db();
  const rows = await d.get<{ public_key: string; private_jwk: JsonWebKey }[]>('golfos_push_keys?id=eq.1&select=public_key,private_jwk');
  if (rows.length) return (keysCache = { publicKey: rows[0].public_key, privateJwk: rows[0].private_jwk });
  const k = await newVapidKeys();
  await d.insertIgnore('golfos_push_keys', [{ id: 1, public_key: k.publicKey, private_jwk: k.privateJwk }]);
  return senderKeys(); // the one that was stored first wins
}

/** Sends one notification to one phone; a subscription the push service no longer knows is removed. */
async function send(sub: Sub, note: Note, ttl = 24 * 3600, urgency: 'normal' | 'high' = 'normal'): Promise<boolean> {
  const keys = await senderKeys();
  const body = await encrypt(utf8(JSON.stringify(note)), fromB64u(sub.p256dh), fromB64u(sub.auth));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, keys, SUBJECT), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgency },
    body,
  });
  if (r.status === 404 || r.status === 410) await db().del(`golfos_push?endpoint=eq.${encodeURIComponent(sub.endpoint)}`);
  return r.ok;
}

/** Who calls: the player's sign-in checked with Supabase Auth. */
async function caller(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, { headers: { apikey: req.headers.get('apikey') || env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return ((await r.json()) as { id?: string }).id ?? null;
}

const SUB_FIELDS = 'endpoint,user_id,p256dh,auth,kinds,tz,lang,round_at';
const subsOf = (users: string[]) => db().get<Sub[]>(`golfos_push?select=${SUB_FIELDS}&user_id=in.(${users.join(',')})`);

async function tick(now = new Date()): Promise<{ rounds: number; storms: number }> {
  const d = db();
  const subs = await d.get<Sub[]>(`golfos_push?select=${SUB_FIELDS}`);
  let rounds = 0;
  let storms = 0;
  // rounds to check: per player once per round, in the day hours of the phone
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) if (s.kinds?.rounds !== false) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  for (const [user, mine] of byUser) {
    const h = hourIn(mine[0].tz, now);
    if (h < 9 || h > 20) continue;
    const since = new Date(now.getTime() - 7 * 24 * 3600e3).toISOString();
    const rows = await d.get<{ id: string; data: RoundData }[]>(
      `golfos_items?select=id,data&user_id=eq.${user}&kind=eq.round&deleted=eq.false&data->>finishedAt=gte.${since}`,
    );
    const sentRows = await d.get<{ key: string }[]>(`golfos_push_sent?select=key&user_id=eq.${user}&key=like.round:*`);
    const due = roundsToRemind(rows, new Set(sentRows.map((x) => x.key)), now);
    if (!due.length) continue;
    for (const s of mine) await send(s, roundNote(due, s.lang));
    await d.insertIgnore('golfos_push_sent', due.map((r) => ({ user_id: user, key: `round:${r.id}` })));
    rounds += due.length;
  }
  // thunderstorms on the course: phones on a round right now
  for (const s of subs) {
    const at = s.round_at;
    if (!at || s.kinds?.weather === false) continue;
    if (Date.parse(at.until) < now.getTime()) {
      await d.patch(`golfos_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { round_at: null });
      continue;
    }
    const key = `storm:${at.since}:${s.endpoint.slice(-24)}`;
    const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${s.user_id}&key=eq.${encodeURIComponent(key)}`);
    if (done.length) continue;
    try {
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${at.lat}&longitude=${at.lng}&hourly=weather_code&forecast_hours=2&timezone=auto`)).json();
      if (!stormAhead(w?.hourly?.weather_code ?? [])) continue;
    } catch {
      continue;
    }
    await send(s, stormNote(at.course, s.lang), 1800, 'high');
    await d.insertIgnore('golfos_push_sent', [{ user_id: s.user_id, key }]);
    storms++;
  }
  return { rounds, storms };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (req.method === 'GET') return json({ publicKey: (await senderKeys()).publicKey });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? '');
    if (action === 'key') return json({ publicKey: (await senderKeys()).publicKey });
    if (action === 'tick') return json(await tick());
    const user = await caller(req);
    if (!user) return json({ error: 'not signed in' }, 401);
    const d = db();
    if (action === 'subscribe') {
      const s = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      if (!s?.endpoint || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'no subscription' }, 400);
      const row = { endpoint: s.endpoint, user_id: user, p256dh: s.keys.p256dh, auth: s.keys.auth, kinds: body.kinds ?? null, tz: String(body.tz ?? '').slice(0, 60) || null, lang: body.lang === 'en' ? 'en' : 'de', updated_at: new Date().toISOString() };
      await d.del(`golfos_push?endpoint=eq.${encodeURIComponent(s.endpoint)}&user_id=neq.${user}`); // the phone of another account before
      await d.upsert('golfos_push', row, 'endpoint');
      const [mine] = await d.get<Sub[]>(`golfos_push?select=${SUB_FIELDS}&endpoint=eq.${encodeURIComponent(s.endpoint)}`);
      const ok = mine ? await send(mine, helloNote(row.lang)) : false;
      return json({ ok, sent: ok });
    }
    const endpoint = String(body.endpoint ?? '');
    const mineOnly = `endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user}`;
    if (action === 'unsubscribe') {
      await d.del(`golfos_push?${mineOnly}`);
      return json({ ok: true });
    }
    if (action === 'settings') {
      await d.patch(`golfos_push?${mineOnly}`, { kinds: body.kinds ?? null, updated_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (action === 'round') {
      const r = body.round as { lat?: number; lng?: number; course?: string } | null;
      const now = new Date();
      const at = r && Number.isFinite(r.lat) && Number.isFinite(r.lng)
        ? { lat: Math.round(r.lat! * 1000) / 1000, lng: Math.round(r.lng! * 1000) / 1000, course: String(r.course ?? '').slice(0, 80), since: now.toISOString(), until: new Date(now.getTime() + 6 * 3600e3).toISOString() }
        : null;
      await d.patch(`golfos_push?${mineOnly}`, { round_at: at });
      return json({ ok: true });
    }
    if (action === 'joined' || action === 'finished') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const [g] = await d.get<{ owner: string; members: string[]; game: { courseName?: string } }[]>(`golfos_shared_games?select=owner,members,game&code=eq.${code}`);
      if (!g || (g.owner !== user && !g.members.includes(user))) return json({ error: 'not in this game' }, 403);
      const to = action === 'joined' ? [g.owner].filter((u) => u !== user) : [g.owner, ...g.members].filter((u) => u !== user);
      const key = `${action}:${code}:${action === 'joined' ? user : ''}`;
      let n = 0;
      if (to.length)
        for (const s of await subsOf(to)) {
          if (s.kinds?.games === false) continue;
          const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${s.user_id}&key=eq.${encodeURIComponent(key)}`);
          if (done.length) continue;
          if (await send(s, (action === 'joined' ? joinedNote : finishedNote)(g.game?.courseName ?? 'GolfOS', s.lang))) n++;
        }
      await d.insertIgnore('golfos_push_sent', to.map((u) => ({ user_id: u, key })));
      return json({ ok: true, sent: n });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
