// QA, by hand (final list, Sascha 23.10.2026): one push through a real push service. Edge subscribes in the built app
// (preview :4173) with a sender key, the sending code of the function (supabase/functions/golfos-push) encrypts and signs
// a message and posts it to the endpoint Edge got (Microsoft's push service), and the app's service worker shows it.
// Proves encryption, signature and the service worker together. Needs the internet; not in the gate.
// Usage: node qa/pushreal.mjs [url of the built app]
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:4173/';
// Node 24 reads the function's TypeScript as it is (types stripped)
const fn = await import(new URL('../supabase/functions/golfos-push/index.ts', import.meta.url).href);

let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const keys = await fn.newVapidKeys();
const dir = mkdtempSync(join(tmpdir(), 'golfos-push-'));
const ctx = await chromium.launchPersistentContext(dir, { channel: 'msedge', headless: true });
await ctx.grantPermissions(['notifications'], { origin: new URL(url).origin });
const p = await ctx.newPage();
await p.goto(url);
await p.evaluate(() => navigator.serviceWorker.ready);
const sub = await p.evaluate(async (k) => {
  const key = Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)), (c) => c.charCodeAt(0));
  try {
    const s = await (await navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return s.toJSON();
  } catch (e) {
    return { error: String(e) };
  }
}, keys.publicKey);
ok(!!sub.endpoint, `Edge subscribed at a real push service: ${sub.endpoint ? new URL(sub.endpoint).host : sub.error}`);
if (sub.endpoint) {
  const note = fn.roundNote([{ id: 'real-1', courseName: 'Golfclub Hetzenhof' }], 'de');
  const body = await fn.encrypt(new TextEncoder().encode(JSON.stringify(note)), fn.fromB64u(sub.keys.p256dh), fn.fromB64u(sub.keys.auth));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await fn.vapidHeader(sub.endpoint, keys, 'https://saschamoescheit-cpu.github.io/golfos-round-prototype/'), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '600' },
    body,
  });
  ok(r.status === 201 || r.status === 200, `the push service took the message (${r.status} ${r.status >= 300 ? await r.text() : ''})`);
  let shown = [];
  for (let i = 0; i < 30 && !shown.length; i++) {
    await p.waitForTimeout(1000);
    shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, url: n.data?.url })));
  }
  ok(shown.length === 1 && shown[0].title === note.title && shown[0].url === note.url, `arrived and shown: „${shown[0]?.title}“ – ${shown[0]?.body ?? 'nothing within 30 s'}`);
}
await ctx.close();
rmSync(dir, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
