// GolfOS push notifications (final list, Sascha 23.10.2026: "push in the web prototype"). One Supabase Edge Function,
// one file – pasted once in the dashboard (Edge Functions → Deploy a new function → Via editor, name "golfos-push",
// then "Verify JWT" off: the function checks the player's sign-in itself).
//
// What it sends:
// - a round not yet checked and signed: once per round, 2 hours after it ended, between 9 and 20 o'clock of the phone
// - games on several phones: a fellow player joined your game; a game ended
// - bets in Games: a player of the pool made a bet – to everyone in the pool (Sascha 01.11.2026)
// - a thunderstorm while a round is played: the forecast for the course, checked every 15 minutes
// - a tournament planned in Games: the tee time of your flight, about 45 minutes before (Sascha 01.11.2026)
// - the iOS app's phones get the same as Apple's notifications (APNs, see "Apple's notifications" below – 01.11.2026)
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

/** Someone asks to join the host's round (Sascha 30.10.2026: "ideally a push that someone wants to join"). */
export const askedNote = (who: string, course: string, lang?: string | null): Note => ({
  title: T(lang, 'Wants to join', 'Beitrittsanfrage'),
  body: T(lang, `${who || 'A player'} wants to join your round at ${course} – tap to let in.`, `${who || 'Ein Spieler'} möchte deiner Runde in ${course} beitreten – tippen zum Bestätigen.`),
  tag: 'golfos-join',
  url: './#rounds',
});

/** Paid or received in the balance (Sascha 03.11.2026: "he gets told that I booked the payment out – and confirms"). */
export const paidNote = (who: string, to: string, amount: string, as: 'paid' | 'received', code: string, lang?: string | null): Note => ({
  title: as === 'paid' ? T(lang, `${who || 'A player'} paid`, `${who || 'Ein Spieler'} hat bezahlt`) : T(lang, `${who || 'A player'} got it`, `${who || 'Ein Spieler'} hat es erhalten`),
  body:
    as === 'paid'
      ? T(lang, `${amount} to ${to || 'you'} – confirm it under Games › Balance.`, `${amount} an ${to || 'dich'} – bitte unter Games › Bilanz bestätigen.`)
      : T(lang, `${amount} from ${to || 'you'} – marked received.`, `${amount} von ${to || 'dir'} – als erhalten markiert.`),
  tag: `golfos-paid-${code}`,
  url: './#games',
});

/** The host invites a player by his GolfOS user name (Sascha 30.10.2026): a tap and he is in. */
/** A friend request accepted (Sascha 03.11.2026: "as on Instagram – a push that we are GolfOS friends now"). */
export const friendNote = (who: string, lang?: string | null): Note => ({
  title: T(lang, 'New GolfOS friend', 'Neuer GolfOS-Freund'),
  body: T(lang, `${who || 'A player'} accepted your friend request – you are GolfOS friends now.`, `${who || 'Ein Spieler'} hat deine Freundschaftsanfrage angenommen – ihr seid jetzt GolfOS-Freunde.`),
  tag: 'golfos-friend',
  url: './',
});

export const inviteNote = (who: string, course: string, code: string, lang?: string | null, what: 'round' | 'game' | 'pool' = 'round'): Note => ({
  title: what === 'pool' ? T(lang, 'Invitation to bets', 'Einladung zu Wetten') : what === 'game' ? T(lang, 'Invitation to a game', 'Einladung zum Spiel') : T(lang, 'Invitation to a round', 'Einladung zur Runde'),
  body:
    what === 'pool'
      ? T(lang, `${who || 'A player'} invites you to his bets "${course}" – tap to join.`, `${who || 'Ein Spieler'} lädt dich zu seinen Wetten „${course}“ ein – tippen zum Beitreten.`)
      : what === 'game'
        ? T(lang, `${who || 'A player'} invites you to his game at ${course} – tap to join.`, `${who || 'Ein Spieler'} lädt dich zu seinem Spiel in ${course} ein – tippen zum Beitreten.`)
        : T(lang, `${who || 'A player'} invites you to his round at ${course} – tap to join.`, `${who || 'Ein Spieler'} lädt dich zu seiner Runde in ${course} ein – tippen zum Beitreten.`),
  tag: `golfos-invite-${code}`,
  url: what === 'round' ? `./#round=${code}` : `./#join=${code}`,
});

export const finishedNote = (course: string, lang?: string | null): Note => ({
  title: T(lang, 'Game over', 'Spiel beendet'),
  body: T(lang, `The game at ${course} is over – the result is in Games.`, `Das Spiel in ${course} ist beendet – das Ergebnis steht in Games.`),
  tag: 'golfos-games',
  url: './#games',
});

/** A bet of a pool as the app shows it ("3 birdies in a row", "−5 gross") – the pool's JSON, read on the server. */
export interface BetWager {
  id: string;
  player: string;
  kind: string;
  target: number;
  holes?: number;
  net?: boolean;
  scope?: string;
  text?: string;
  parts?: { front: number; back: number; total: number };
  rounds?: number;
}
const COUNTS = ['birdies', 'pars', 'greens', 'fairways', 'oneputts', 'updowns', 'eagles', 'holeInOne'];
export function betLabel(w: BetWager, lang?: string | null): string {
  const n = w.target;
  const par = n === 0 ? T(lang, 'even', 'Par') : n > 0 ? `+${n}` : `−${-n}`;
  const on = w.scope === 'trip' && COUNTS.includes(w.kind) ? T(lang, 'on the trip', 'auf der Reise') : w.holes === 9 ? T(lang, 'on 9', 'auf 9') : T(lang, 'on 18', 'auf 18');
  switch (w.kind) {
    case 'birdieRun':
      return T(lang, `${n} birdies in a row`, `${n} Birdies in Folge`);
    case 'parRun':
      return T(lang, `${n} pars in a row`, `${n} Pars in Folge`);
    case 'birdies':
      return T(lang, `${n} birdies ${on}`, `${n} Birdies ${on}`);
    case 'pars':
      return T(lang, `${n} pars ${on}`, `${n} Pars ${on}`);
    case 'greens':
      return T(lang, `${n} greens ${on}`, `${n} Grüns ${on}`);
    case 'fairways':
      return T(lang, `${n} fairways ${on}`, `${n} Fairways ${on}`);
    case 'oneputts':
      return T(lang, `${n} one-putts ${on}`, `${n} Ein-Putts ${on}`);
    case 'updowns':
      return T(lang, `${n} up & downs ${on}`, `${n} Up & Downs ${on}`);
    case 'eagles':
      return n === 1 ? T(lang, `An eagle ${on}`, `Ein Eagle ${on}`) : T(lang, `${n} eagles ${on}`, `${n} Eagles ${on}`);
    case 'holeInOne':
      return n === 1 ? T(lang, `A hole-in-one ${on}`, `Ein Hole-in-One ${on}`) : T(lang, `${n} holes-in-one ${on}`, `${n} Hole-in-Ones ${on}`);
    case 'stableford':
      return T(lang, `${n} Stableford points ${on}`, `${n} Stableford-Punkte ${on}`);
    case 'putts':
      return T(lang, `At most ${n} putts ${on}`, `Höchstens ${n} Putts ${on}`);
    case 'threeputts':
      return n === 0 ? T(lang, `No three-putt ${on}`, `Kein Drei-Putt ${on}`) : T(lang, `At most ${n} three-putts ${on}`, `Höchstens ${n} Drei-Putts ${on}`);
    case 'doubles':
      return n === 0 ? T(lang, `No double bogey ${on}`, `Kein Double Bogey ${on}`) : T(lang, `At most ${n} double bogeys ${on}`, `Höchstens ${n} Double Bogeys ${on}`);
    case 'penalties':
      return n === 0 ? T(lang, `No penalty stroke ${on}`, `Kein Strafschlag ${on}`) : T(lang, `At most ${n} penalty strokes ${on}`, `Höchstens ${n} Strafschläge ${on}`);
    case 'score':
      return `${par} ${w.net ? T(lang, 'net', 'netto') : T(lang, 'gross', 'brutto')}${w.holes === 9 ? T(lang, ' on 9', ' auf 9') : ''}`;
    case 'scoreSum':
      return `${par} ${w.net ? T(lang, 'net', 'netto') : T(lang, 'gross', 'brutto')} ${T(lang, `in ${w.rounds ?? 6} rounds`, `in ${w.rounds ?? 6} Runden`)}`;
    case 'nassau': {
      const p = w.parts ?? { front: 0, back: 0, total: 0 };
      return `${p.front}+${p.back}+${p.total} ${w.net ? T(lang, 'net', 'netto') : T(lang, 'gross', 'brutto')}`;
    }
    default:
      return String(w.text ?? '').trim().slice(0, 80) || T(lang, 'Free bet', 'Freie Wette');
  }
}

/** A player of the pool made a bet (Sascha 01.11.2026: "the fellow players get a push when someone of the group won a
 *  bet"). A tap opens the pool. */
export const betNote = (player: string, w: BetWager, where: string | undefined, pool: string, code: string, lang?: string | null): Note => ({
  title: T(lang, `Bet made: ${player}`, `Wette geschafft: ${player}`),
  body: [betLabel(w, lang), where, pool].filter(Boolean).join(' · '),
  tag: `golfos-bet-${w.id}`,
  url: `./#pool=${code}`,
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

/** The physio's routine (Agility, Sascha 1.11.2026: "how often a week I set myself – a push can remind me"). */
export interface PhysioData {
  routine?: { name?: string; exercises?: { sets?: { reps: number; repSec: number; restSec: number }[]; perSide?: boolean }[] };
  schedule?: { perWeek?: number; days?: number[]; remind?: string | null };
  log?: { at: string }[];
}
/** The day on the phone's clock: its date, weekday (0 = Monday) and minute of the day. */
export function localDay(tz: string | null | undefined, at: Date): { date: string; weekday: number; minute: number } {
  const parts = (() => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    } catch {
      return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    }
  })();
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return { date: `${p('year')}-${p('month')}-${p('day')}`, weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p('weekday')), minute: Number(p('hour')) * 60 + Number(p('minute')) };
}
/** Remind now: a reminder time set and reached (until 22:00), today not trained yet, and a training day – one of the
 *  chosen days, or (no days chosen) fewer sessions this week than wanted. */
export function physioDue(d: PhysioData, tz: string | null | undefined, now: Date): boolean {
  const s = d.schedule;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s?.remind ?? '');
  if (!s || !m) return false;
  const today = localDay(tz, now);
  const at = Number(m[1]) * 60 + Number(m[2]);
  if (today.minute < at || today.minute >= 22 * 60) return false;
  const days = (d.log ?? []).map((e) => localDay(tz, new Date(e.at)));
  if (days.some((x) => x.date === today.date)) return false;
  if (s.days?.length) return s.days.includes(today.weekday);
  // this week (Monday on): days with a session
  const monday = new Date(now.getTime() - today.weekday * 864e5 - today.minute * 6e4);
  const from = localDay(tz, monday).date;
  const week = new Set(days.filter((x) => x.date >= from && x.date <= today.date).map((x) => x.date)).size;
  return week < (s.perWeek ?? 0);
}
export function physioNote(d: PhysioData, lang?: string | null): Note {
  const sec = (d.routine?.exercises ?? []).reduce((n, e) => n + (e.sets ?? []).reduce((k, s) => k + s.reps * s.repSec + s.restSec, 0) * (e.perSide ? 2 : 1), 0);
  const min = Math.round(sec / 60);
  const name = d.routine?.name ?? 'Routine';
  return {
    title: T(lang, 'Training day', 'Trainingstag'),
    body: T(lang, `Your physio routine "${name}" is due today${min ? ` – about ${min} min` : ''}.`, `Heute ist deine Physio-Routine „${name}“ dran${min ? ` – etwa ${min} Min.` : '.'}`),
    tag: 'golfos-agility',
    url: './#agility',
  };
}

/** A tournament planned in Games and its flights' rows, as the table has them. */
export interface TeeFlight {
  id: string;
  name?: string;
  teeTime?: string;
  players?: { id: string; name: string }[];
  /** the phones playing in the flight – with the account that took it (Rounds, "which player am I") */
  phones?: Record<string, { player: string; uid?: string }>;
}
/** The tee time for an account: its own flight's (a phone of it took a place there), else the first of the day. */
export function teeTimeFor(user: string, flights: TeeFlight[]): { time: string; own: boolean; flight?: TeeFlight } | null {
  const timed = flights.filter((f) => f.players?.length && /^\d{1,2}:\d{2}$/.test(f.teeTime ?? '')).sort((a, b) => a.teeTime!.padStart(5, '0').localeCompare(b.teeTime!.padStart(5, '0')));
  if (!timed.length) return null;
  const own = timed.find((f) => Object.values(f.phones ?? {}).some((p) => p.uid === user));
  return own ? { time: own.teeTime!, own: true, flight: own } : { time: timed[0].teeTime!, own: false };
}
/** Remind now: the tournament's day on the phone's clock, more than 30 and at most 60 minutes before the tee time –
 *  the timer runs every 15 minutes, so it comes about 45 minutes ahead. The minutes left, or null. */
export function teeDue(date: string, time: string, tz: string | null | undefined, now: Date): number | null {
  const d = localDay(tz, now);
  if (d.date !== date) return null;
  const [h, m] = time.split(':').map(Number);
  const left = h * 60 + m - d.minute;
  return left > 30 && left <= 60 ? left : null;
}
export function teeNote(o: { name: string; course?: string; time: string; left: number; own: boolean; flight?: string }, lang?: string | null): Note {
  const min = Math.max(5, Math.round(o.left / 5) * 5);
  return {
    title: T(lang, `${o.name} · tee time ${o.time}`, `${o.name} · Startzeit ${o.time}`),
    body: o.own
      ? T(lang, `Your flight${o.flight ? ` (${o.flight})` : ''} tees off in about ${min} min${o.course ? ` · ${o.course}` : ''}.`, `Dein Flight${o.flight ? ` (${o.flight})` : ''} startet in etwa ${min} Min.${o.course ? ` · ${o.course}` : ''}`)
      : T(lang, `The first flight tees off in about ${min} min${o.course ? ` · ${o.course}` : ''} – take part in Rounds.`, `Der erste Flight startet in etwa ${min} Min.${o.course ? ` · ${o.course}` : ''} – in Rounds teilnehmen.`),
    tag: `golfos-tee-${o.name}`.slice(0, 64),
    url: './#rounds',
  };
}

/** Thunderstorm in the next hour: weather codes 95, 96, 99 (WMO) in the hourly forecast. */
export const stormAhead = (codes: (number | null)[]): boolean => codes.slice(0, 2).some((c) => c != null && c >= 95);

// ---------- the server ----------

interface Sub {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  kinds: { rounds?: boolean; games?: boolean; weather?: boolean; agility?: boolean } | null;
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

// ---------- Apple's notifications for the iOS app (Sascha 01.11.2026) ----------
// The app has no web push: its phones are kept in golfos_push as "apns:<device token>" (p256dh and auth "apns") and
// get Apple's notifications, sent with Apple's key for them (developer.apple.com → Certificates, IDs & Profiles → Keys,
// "Apple Push Notifications service (APNs)"), set as the function's secrets: APNS_KEY_P8 (the whole .p8 file),
// APNS_KEY_ID, APNS_TEAM_ID. Without them the app's phones get nothing – the website's go on as before.

const BUNDLE_ID = 'de.moescheit.golfos';
export const isApnsEndpoint = (e: string): boolean => /^apns:[0-9a-f]{64,200}$/i.test(e);

/** What Apple shows: title, text, one sound; a tap opens the app at the note's place (its url). */
export function apnsPayload(note: Note): string {
  return JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: 'default', 'thread-id': note.tag }, url: note.url });
}

/** The sender's token for Apple (ES256, the .p8 key) – Apple wants a new one at most every 20 minutes, at least every hour. */
export async function apnsJwt(p8: string, keyId: string, teamId: string, now = Date.now()): Promise<string> {
  const der = Uint8Array.from(atob(p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64u(utf8(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = b64u(utf8(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)));
  return `${header}.${claims}.${b64u(sig)}`;
}

let apnsToken: { jwt: string; at: number } | null = null;
async function sendApns(sub: Sub, note: Note, ttl: number, urgency: 'normal' | 'high'): Promise<boolean> {
  const p8 = env('APNS_KEY_P8');
  const keyId = env('APNS_KEY_ID');
  const team = env('APNS_TEAM_ID');
  if (!p8 || !keyId || !team) return false;
  if (!apnsToken || Date.now() - apnsToken.at > 40 * 60 * 1000) apnsToken = { jwt: await apnsJwt(p8, keyId, team), at: Date.now() };
  // TestFlight and the App Store: Apple's production service (a build from Xcode on a Mac would need the sandbox)
  const host = env('APNS_HOST') || 'api.push.apple.com';
  const r = await fetch(`https://${host}/3/device/${sub.endpoint.slice(5)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${apnsToken.jwt}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': urgency === 'high' ? '10' : '5',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
      'apns-collapse-id': note.tag.slice(0, 64),
    },
    body: apnsPayload(note),
  });
  // the app deleted, or a token of another app: the phone is gone
  if (r.status === 410 || (r.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(await r.text()))) await db().del(`golfos_push?endpoint=eq.${encodeURIComponent(sub.endpoint)}`);
  return r.ok;
}

/** Sends one notification to one phone; a subscription the push service no longer knows is removed. */
async function send(sub: Sub, note: Note, ttl = 24 * 3600, urgency: 'normal' | 'high' = 'normal'): Promise<boolean> {
  if (isApnsEndpoint(sub.endpoint)) return sendApns(sub, note, ttl, urgency);
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

async function tick(now = new Date()): Promise<{ rounds: number; storms: number; physio: number; tees: number }> {
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
  // the physio's routine on a training day (Agility): once a day at the time the player chose
  let physio = 0;
  const trainers = new Map<string, Sub[]>();
  for (const s of subs) if (s.kinds?.agility !== false) trainers.set(s.user_id, [...(trainers.get(s.user_id) ?? []), s]);
  for (const [user, mine] of trainers) {
    const plans = await d.get<{ id: string; data: PhysioData }[]>(`golfos_items?select=id,data&user_id=eq.${user}&kind=eq.mobility-physio&deleted=eq.false`);
    for (const plan of plans) {
      if (!physioDue(plan.data, mine[0].tz, now)) continue;
      const key = `physio:${plan.id}:${localDay(mine[0].tz, now).date}`;
      const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${user}&key=eq.${encodeURIComponent(key)}`);
      if (done.length) continue;
      for (const s of mine) await send(s, physioNote(plan.data, s.lang), 6 * 3600);
      await d.insertIgnore('golfos_push_sent', [{ user_id: user, key }]);
      physio++;
    }
  }
  // the tee time of a tournament planned in Games: about 45 minutes before, once per account and tournament
  let tees = 0;
  const days = [-1, 0, 1].map((k) => new Date(now.getTime() + k * 864e5).toISOString().slice(0, 10));
  const planned = await d.get<{ code: string; owner: string; members: string[]; game: { name?: string; date?: string; deletedAt?: string | null; course?: { name?: string } } }[]>(
    `golfos_shared_games?select=code,owner,members,game&event_code=is.null&game->>planned=eq.true&game->>date=in.(${days.join(',')})`,
  );
  for (const ev of planned) {
    if (ev.game.deletedAt || !ev.game.date) continue;
    const rows = await d.get<{ game: { flight?: TeeFlight } }[]>(`golfos_shared_games?select=game&event_code=eq.${encodeURIComponent(ev.code)}`);
    const flights = rows.map((r) => r.game?.flight).filter((x): x is TeeFlight => !!x);
    const byUser = new Map<string, Sub[]>();
    for (const s of await subsOf([...new Set([ev.owner, ...(ev.members ?? [])])])) if (s.kinds?.games !== false) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    for (const [user, mine] of byUser) {
      const tee = teeTimeFor(user, flights);
      const left = tee && teeDue(ev.game.date, tee.time, mine[0].tz, now);
      if (!tee || left == null) continue;
      const key = `tee:${ev.code}`;
      const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${user}&key=eq.${encodeURIComponent(key)}`);
      if (done.length) continue;
      const flight = tee.flight?.players?.map((p) => p.name).join(' · ');
      for (const s of mine) await send(s, teeNote({ name: String(ev.game.name ?? 'GolfOS').slice(0, 60), course: ev.game.course?.name, time: tee.time, left, own: tee.own, flight }, s.lang), 3600, 'high');
      await d.insertIgnore('golfos_push_sent', [{ user_id: user, key }]);
      tees++;
    }
  }
  return { rounds, storms, physio, tees };
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
      // a browser's subscription, or the iOS app's phone (apns:<device token>)
      if (!s?.endpoint || !(/^https:\/\//.test(s.endpoint) || isApnsEndpoint(s.endpoint)) || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'no subscription' }, 400);
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
    // a bet made in a pool of bets: everyone in the pool hears of it once – only when the pool says it is made (by the
    // app's judgement or by hand)
    if (action === 'bet') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const id = String(body.wager ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
      type Pool = { kind?: string; name?: string; players?: { id: string; name: string }[]; wagers?: BetWager[]; progress?: Record<string, { done?: boolean; where?: string; manual?: { done: boolean } }> };
      const [g] = await d.get<{ owner: string; members: string[]; game: Pool }[]>(`golfos_shared_games?select=owner,members,game&code=eq.${code}`);
      if (!g || g.game?.kind !== 'wager-pool' || (g.owner !== user && !g.members.includes(user))) return json({ error: 'not in this pool' }, 403);
      const w = g.game.wagers?.find((x) => x.id === id);
      const p = g.game.progress?.[id];
      const made = !!w && (p?.manual ? p.manual.done : w.kind !== 'free' && !!p?.done);
      if (!w || !made) return json({ error: 'not made' }, 409);
      const player = g.game.players?.find((x) => x.id === w.player)?.name ?? '?';
      const key = `bet:${code}:${id}`;
      const to = [...new Set([g.owner, ...g.members])].filter((u) => u !== user); // the phone that told sees it already
      let n = 0;
      if (to.length) for (const s of await subsOf(to)) {
        if (s.kinds?.games === false) continue;
        const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${s.user_id}&key=eq.${encodeURIComponent(key)}`);
        if (done.length) continue;
        if (await send(s, betNote(player, w, p?.where, String(g.game.name ?? 'GolfOS').slice(0, 60), code, s.lang), 24 * 3600, 'high')) n++;
      }
      if (to.length) await d.insertIgnore('golfos_push_sent', to.map((u) => ({ user_id: u, key })));
      return json({ ok: true, sent: n });
    }
    // a round's join request (by its code, or by the reference of a round shown nearby): the host hears of it – only
    // from a phone that really asked, once per phone
    if (action === 'asked') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const ref = String(body.ref ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
      if (!code && !ref) return json({ error: 'no round' }, 400);
      const [g] = await d.get<{ code: string; owner: string; near_requests: Record<string, { name?: string; state?: string }> | null; game: { course?: { name?: string } } }[]>(
        `golfos_shared_games?select=code,owner,near_requests,game&${code ? `code=eq.${code}` : `near_ref=eq.${ref}`}`,
      );
      const asked = g?.near_requests?.[user];
      if (!g || asked?.state !== 'asked') return json({ error: 'no request' }, 403);
      const key = `asked:${g.code}:${user}`;
      let n = 0;
      for (const s of await subsOf([g.owner])) {
        if (s.kinds?.games === false) continue;
        const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${s.user_id}&key=eq.${encodeURIComponent(key)}`);
        if (done.length) continue;
        if (await send(s, askedNote(String(asked.name ?? '').slice(0, 60), g.game?.course?.name ?? 'GolfOS', s.lang), 3600, 'high')) n++;
      }
      await d.insertIgnore('golfos_push_sent', [{ user_id: g.owner, key }]);
      return json({ ok: true, sent: n });
    }
    // paid or received in the balance: the others of the game or the pool hear of it – only a member tells
    if (action === 'paid') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const as = body.as === 'received' ? 'received' : 'paid';
      const who = String(body.who ?? '').slice(0, 60);
      const to = String(body.to ?? '').slice(0, 60);
      const amount = String(body.amount ?? '').slice(0, 40);
      const [g] = await d.get<{ owner: string; members: string[] }[]>(`golfos_shared_games?select=owner,members&code=eq.${code}`);
      if (!g || (g.owner !== user && !g.members.includes(user))) return json({ error: 'not in this game' }, 403);
      let n = 0;
      for (const s of await subsOf([...new Set([g.owner, ...g.members])].filter((u) => u !== user))) if (s.kinds?.games !== false && (await send(s, paidNote(who, to, amount, as, code, s.lang), 24 * 3600, 'high'))) n++;
      return json({ ok: true, sent: n });
    }
    // the host (or a member) invites a player by his user name: let in at once (he becomes a member), told by push
    if (action === 'invite') {
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const name = String(body.username ?? '').trim().toLowerCase().slice(0, 20);
      const who = String(body.who ?? '').slice(0, 60);
      const [g] = await d.get<{ owner: string; members: string[]; near_requests: Record<string, unknown> | null; game: { kind?: string; name?: string; courseName?: string; course?: { name?: string } } }[]>(`golfos_shared_games?select=owner,members,near_requests,game&code=eq.${code}`);
      // or a linked friend by his account, with a tap (Sascha 03.11.2026) – only one who is the inviter's friend; to a
      // round, a tournament or its series, a pool of bets or a game
      const friend = /^[0-9a-f-]{36}$/i.test(String(body.friend ?? '')) ? String(body.friend).toLowerCase() : '';
      const kind = g?.game?.kind;
      const what: 'round' | 'game' | 'pool' = kind === 'wager-pool' ? 'pool' : kind === 'round-event' || kind === 'tour-series' ? 'round' : 'game';
      const allowed = friend ? kind !== 'round-flight' : kind === 'round-event';
      if (!g || !allowed || (g.owner !== user && !g.members.includes(user))) return json({ error: 'not in this round' }, 403);
      const place = (what === 'pool' ? g.game?.name : what === 'game' ? g.game?.courseName : g.game?.course?.name ?? g.game?.name) ?? 'GolfOS';
      const [n] = friend
        ? (await d.get<{ friend_id: string }[]>(`golfos_friend_links?select=friend_id&user_id=eq.${user}&friend_id=eq.${friend}`)).map((l) => ({ user_id: l.friend_id }))
        : name
          ? await d.get<{ user_id: string }[]>(`golfos_names?select=user_id&username=eq.${encodeURIComponent(name)}`)
          : [];
      if (!n) return json({ ok: false, found: false });
      // let in at once; "invited" – his app, open, asks him straight away ("Sascha invites you – join")
      if (n.user_id !== g.owner && !g.members.includes(n.user_id))
        await d.patch(`golfos_shared_games?code=eq.${code}`, {
          members: [...g.members, n.user_id],
          near_requests: { ...(g.near_requests ?? {}), [n.user_id]: { name: String(body.name ?? name).slice(0, 60), at: new Date().toISOString(), state: 'ok', invited: who || 'GolfOS' } },
        });
      let sent = 0;
      for (const s of await subsOf([n.user_id])) if (s.kinds?.games !== false && (await send(s, inviteNote(who, place, code, s.lang, what), 6 * 3600, 'high'))) sent++;
      return json({ ok: true, found: true, sent });
    }
    // a friend request accepted: the one who sent it hears of it, once – only when the two are friends
    if (action === 'friend-accepted') {
      const friend = /^[0-9a-f-]{36}$/i.test(String(body.friend ?? '')) ? String(body.friend).toLowerCase() : '';
      if (!friend) return json({ error: 'no friend' }, 400);
      const linked = await d.get<unknown[]>(`golfos_friend_links?select=friend_id&user_id=eq.${user}&friend_id=eq.${friend}`);
      if (!linked.length) return json({ error: 'not friends' }, 403);
      const key = `friend:${user}`;
      const done = await d.get<unknown[]>(`golfos_push_sent?select=key&user_id=eq.${friend}&key=eq.${encodeURIComponent(key)}`);
      let sent = 0;
      if (!done.length) {
        for (const s of await subsOf([friend])) if (await send(s, friendNote(String(body.who ?? '').slice(0, 60), s.lang))) sent++;
        await d.insertIgnore('golfos_push_sent', [{ user_id: friend, key }]);
      }
      return json({ ok: true, sent });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

if (typeof Deno !== 'undefined') Deno.serve(handle);
