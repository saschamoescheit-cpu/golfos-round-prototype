import { describe, expect, it } from 'vitest';
import {
  b64u,
  encrypt,
  finishedNote,
  fromB64u,
  hourIn,
  joinedNote,
  newVapidKeys,
  roundNote,
  roundsToRemind,
  stormAhead,
  vapidHeader,
} from '../../supabase/functions/golfos-push/index';

// The push function (final list, Sascha 23.10.2026): the encryption checked against the example of the standard
// (RFC 8291, appendix A) and by decrypting it the way a phone does; the sender's signature (VAPID) checked with its key.

const jwkOf = (d: string, pub: Uint8Array): JsonWebKey => ({ kty: 'EC', crv: 'P-256', d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33)), ext: true });

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, n * 8));
}

/** The phone's side, written from the standard: read the header, agree on the key, open the record. */
async function decrypt(body: Uint8Array, uaPrivate: JsonWebKey, uaPublic: Uint8Array, auth: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const sealed = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  const priv = await crypto.subtle.importKey('jwk', uaPrivate, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
  const te = new TextEncoder();
  const info = new Uint8Array([...te.encode('WebPush: info'), 0, ...uaPublic, ...asPublic]);
  const ikm = await hkdf(auth, ecdh, info, 32);
  const cek = await hkdf(salt, ikm, new Uint8Array([...te.encode('Content-Encoding: aes128gcm'), 0]), 16);
  const nonce = await hkdf(salt, ikm, new Uint8Array([...te.encode('Content-Encoding: nonce'), 0]), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--; // padding
  expect(plain[end]).toBe(2); // the last record
  return new TextDecoder().decode(plain.slice(0, end));
}

describe('push: the message encrypted for the phone (RFC 8291)', () => {
  it('gives exactly the example of the standard', async () => {
    const uaPublic = fromB64u('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');
    const asPublic = fromB64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const body = await encrypt(new TextEncoder().encode('When I grow up, I want to be a watermelon'), uaPublic, fromB64u('BTBZMqHH6r4Tts7J_aSIgg'), {
      asPrivate: jwkOf('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', asPublic),
      asPublic,
      salt: fromB64u('DGv6ra1nlYgDCS1FRnbzlw'),
    });
    expect(b64u(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
    // and the phone of the example reads it
    const uaPrivate = jwkOf('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94', uaPublic);
    expect(await decrypt(body, uaPrivate, uaPublic, fromB64u('BTBZMqHH6r4Tts7J_aSIgg'))).toBe('When I grow up, I want to be a watermelon');
  });

  it('a new phone key every time: the phone reads the notification, a stranger cannot', async () => {
    const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const uaPrivate = await crypto.subtle.exportKey('jwk', ua.privateKey);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const note = JSON.stringify(roundNote([{ id: 'r1', courseName: 'Golfclub Hetzenhof' }]));
    const a = await encrypt(new TextEncoder().encode(note), uaPublic, auth);
    const b = await encrypt(new TextEncoder().encode(note), uaPublic, auth);
    expect(b64u(a)).not.toBe(b64u(b)); // salt and sender key fresh each time
    expect(await decrypt(a, uaPrivate, uaPublic, auth)).toBe(note);
    await expect(decrypt(a, uaPrivate, uaPublic, crypto.getRandomValues(new Uint8Array(16)))).rejects.toThrow();
    expect(a.length).toBeLessThan(4096 - 100); // one record, well inside what the push services take
  });
});

describe('push: the sender signs (VAPID, RFC 8292)', () => {
  it('a token for the push service, signed with the key the app subscribed with', async () => {
    const keys = await newVapidKeys();
    expect(fromB64u(keys.publicKey).length).toBe(65);
    const now = Date.parse('2026-10-23T10:00:00Z');
    const h = await vapidHeader('https://web.push.apple.com/QGuQyavXutnMH_abc', keys, 'https://saschamoescheit-cpu.github.io/golfos-round-prototype/', now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m).toBeTruthy();
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64u(m[2])));
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.exp).toBe(now / 1000 + 12 * 3600);
    expect(claims.sub).toMatch(/^https:\/\//);
    const pub = await crypto.subtle.importKey('raw', fromB64u(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});

describe('push: when and what', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  const round = (id: string, finishedAt: string | null, more: Record<string, unknown> = {}) => ({
    id,
    data: { courseName: `Course ${id}`, finishedAt, signedAt: null, entries: { me: [{ strokes: 4 }, { strokes: null }] }, ...more },
  });
  it('rounds to remind: ended 2 h to 7 days ago, not signed, with a score, not reminded before', () => {
    const rows = [
      round('a', '2026-10-23T09:00:00Z'), // 3 h ago
      round('b', '2026-10-23T11:00:00Z'), // 1 h ago: too soon
      round('c', '2026-10-15T11:00:00Z'), // 8 days: too old
      round('d', '2026-10-22T09:00:00Z', { signedAt: '2026-10-22T10:00:00Z' }),
      round('e', '2026-10-22T09:00:00Z', { capture: 'score' }), // only a scorecard: nothing to check
      round('f', '2026-10-22T09:00:00Z', { entries: { me: [{ strokes: null }] } }), // no score
      round('g', '2026-10-22T09:00:00Z', { preview: true }),
      round('h', null),
      round('i', '2026-10-21T09:00:00Z'),
      round('j', '2026-10-21T08:00:00Z'), // reminded already
    ];
    const due = roundsToRemind(rows, new Set(['round:j']), now);
    expect(due.map((r) => r.id)).toEqual(['a', 'i']);
  });
  it('one round: straight to its check; several: the list of rounds to sign', () => {
    expect(roundNote([{ id: 'r 1', courseName: 'Hetzenhof' }]).url).toBe('./#review=r%201');
    expect(roundNote([{ id: 'r 1', courseName: 'Hetzenhof' }]).body).toContain('Hetzenhof');
    expect(roundNote([{ id: 'a', courseName: 'x' }, { id: 'b', courseName: 'y' }]).url).toBe('./#sign');
    expect(joinedNote('Hetzenhof').url).toBe('./#games');
    expect(finishedNote('Hetzenhof', 'en').body).toMatch(/^The game at Hetzenhof/);
  });
  it('the hour on the phone, by its time zone', () => {
    expect(hourIn('Europe/Berlin', now)).toBe(14);
    expect(hourIn('America/New_York', now)).toBe(8);
    expect(hourIn('No/Such_Zone', now)).toBe(13);
  });
  it('a thunderstorm in the next hour: WMO codes 95 to 99', () => {
    expect(stormAhead([3, 61])).toBe(false);
    expect(stormAhead([3, 95])).toBe(true);
    expect(stormAhead([99])).toBe(true);
    expect(stormAhead([3, 61, 95])).toBe(false); // in 2 hours: not yet
    expect(stormAhead([])).toBe(false);
  });
});
