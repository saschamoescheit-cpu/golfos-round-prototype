import { describe, expect, it } from 'vitest';
import { apnsJwt, apnsPayload, b64u, fromB64u, isApnsEndpoint } from '../../supabase/functions/golfos-push/index';

// Apple's notifications for the iOS app (01.11.2026): the server's part, without Apple.
describe('notifications to the iOS app', () => {
  it("knows the app's phones by their address", () => {
    expect(isApnsEndpoint(`apns:${'ab12'.repeat(16)}`)).toBe(true);
    expect(isApnsEndpoint('https://web.push.apple.com/abc')).toBe(false);
    expect(isApnsEndpoint('apns:not-a-token')).toBe(false);
  });

  it('says what the website says, and where a tap leads', () => {
    const p = JSON.parse(apnsPayload({ title: 'Trainingstag', body: 'Heute ist deine Physio-Routine dran.', tag: 'golfos-agility', url: './#agility' }));
    expect(p).toEqual({ aps: { alert: { title: 'Trainingstag', body: 'Heute ist deine Physio-Routine dran.' }, sound: 'default', 'thread-id': 'golfos-agility' }, url: './#agility' });
  });

  it('signs its token with the .p8 key as Apple checks it (ES256, key id, team)', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
    const jwt = await apnsJwt(pem, 'ABC123DEFG', 'TEAM123456', Date.UTC(2026, 10, 1, 12));
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64u(h)))).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(JSON.parse(new TextDecoder().decode(fromB64u(c)))).toEqual({ iss: 'TEAM123456', iat: Date.UTC(2026, 10, 1, 12) / 1000 });
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromB64u(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
    expect(b64u(fromB64u(s))).toBe(s);
  });
});
