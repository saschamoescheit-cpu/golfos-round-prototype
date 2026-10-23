// QA (final list, Sascha 23.10.2026: push notifications in the web prototype): in the built app with its service worker
// (Chromium – WebKit under Windows has no service worker). The profile turns notifications on for this phone and sends
// the subscription to the function golfos-push (answered here); each kind on or off; a round on the course tells the
// function where (thunderstorm warning); a push delivered to the service worker shows as a notification; a tap's places
// open the round to check, the rounds to sign and Games; turned off again. iPhone in Safari: the home-screen hint;
// not signed in: the sign-in hint.  Usage: node qa/pushnotify.mjs [url of the built app, default the preview :4173]
import { chromium, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const origin = new URL(url).origin;
const b = await chromium.launch({ channel: 'msedge' }); // Edge as in the offline tests (the bundled Chromium is not installed)
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};

// a real sender key, as the function hands it out
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');

const HOLES = [3, 4, 5, 4, 3, 4, 4, 5, 4].map((par, i) => ({ index: i, label: `${i + 1}C`, loop: 'C', number: i + 1, par, strokeIndex: i + 1 }));
const entry = (strokes) => ({ strokes, pickedUp: false, putts: strokes ? 2 : null, fairway: null, penalties: 0, greensideBunker: false, upAndDown: null });
const round = (id, finished) => ({
  id,
  // started an hour ago (a round in play resumes only within 8 hours of its start)
  createdAt: new Date(Date.now() - 3600e3).toISOString(),
  finishedAt: finished ? new Date(Date.now() - 600e3).toISOString() : null,
  courseId: 'osm:relation/1326323',
  courseName: 'Golfclub Hetzenhof',
  loopOrder: ['C'],
  holes: HOLES,
  mode: 'quick',
  capture: 'full',
  players: [{ id: 'me', name: 'Sascha', isMe: true, playingHandicap: 4 }],
  entries: { me: HOLES.map((h, i) => entry(finished || i < 2 ? h.par : null)) },
  currentHole: finished ? 8 : 2,
  signedAt: null,
});
const SESSION = { access_token: 'test-token', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3 * 3600, email: 'test@example.com', name: 'Sascha', username: 'sascha.m' };

async function context(device, { signedIn = true, fakePush = true } = {}) {
  const ctx = await b.newContext({ ...device, locale: 'de-DE', serviceWorkers: 'allow' });
  await ctx.grantPermissions(['notifications'], { origin });
  await mockNet(ctx);
  const calls = [];
  await ctx.route(/supabase\.co\/functions\/v1\/golfos-push/, async (r) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(r.request().postData() ?? '{}');
    calls.push({ ...body, auth: r.request().headers().authorization });
    return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body.action === 'key' ? { publicKey } : { ok: true }) });
  });
  // the server of the sync: empty
  await ctx.route(/supabase\.co\/rest\/v1\//, (r) =>
    r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' }, body: '[]' }),
  );
  // a push service is not reachable from the test browser: the subscription is made here, the rest is real
  if (fakePush)
    await ctx.addInitScript(() => {
      if (!('PushManager' in self)) return;
      // the subscription lives on over reloads, as a real one does
      const sub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/golfos-test',
        expirationTime: null,
        toJSON() {
          return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: 'BPd4ZwNQ1YJ0v7b0V3T2n8Q', auth: 'k3y5Auth' } };
        },
        async unsubscribe() {
          localStorage.setItem('qa.unsubscribed', String(Number(localStorage.getItem('qa.unsubscribed') ?? 0) + 1));
          localStorage.removeItem('qa.subscribed');
          return true;
        },
      };
      PushManager.prototype.subscribe = async function (o) {
        localStorage.setItem('qa.keylength', String(o.applicationServerKey.byteLength));
        localStorage.setItem('qa.subscribed', '1');
        return sub;
      };
      PushManager.prototype.getSubscription = async function () {
        return localStorage.getItem('qa.subscribed') ? sub : null;
      };
    });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.evaluate(
    ({ signedIn, SESSION }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1');
      localStorage.setItem('golfos.tip.shots.v1', '1');
      if (signedIn) localStorage.setItem('golfos.auth.v1', JSON.stringify(SESSION));
      sessionStorage.setItem('golfos.module', 'rounds');
    },
    { signedIn, SESSION },
  );
  return { ctx, p, calls, errs };
}

const openProfile = async (p) => {
  await p.reload();
  await p.waitForTimeout(1200);
  await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
  await p.waitForTimeout(500);
  return p.locator('.push-card');
};

// ---------- Android phone, signed in: on, kinds, round, a push, the places, off ----------
{
  const { ctx, p, calls, errs } = await context(devices['Pixel 7']);
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 15000 }).catch(() => {});
  const card = await openProfile(p);
  ok(await card.getByRole('heading', { name: 'Mitteilungen' }).isVisible(), 'profile: a section "Mitteilungen"');
  // a slider right of the heading (Sascha 23.10.2026), as the caddie's switches
  const on = card.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' });
  ok(await on.isVisible() && (await on.getAttribute('aria-checked')) === 'false', 'a slider beside the heading, off');
  const head = await card.locator('h2').boundingBox();
  const sw = await on.boundingBox();
  ok(!!head && !!sw && Math.abs(head.y + head.height / 2 - (sw.y + sw.height / 2)) < 12 && sw.x > head.x + head.width, 'right of "Mitteilungen", on the same line');
  ok((await on.locator('.drawer-switch').count()) === 1, 'in the design of the app: the switch of the caddie settings');
  await on.click();
  await p.waitForTimeout(1500);
  const sub = calls.find((c) => c.action === 'subscribe');
  ok(calls.some((c) => c.action === 'key'), 'the key fetched from the function');
  ok(Number(await p.evaluate(() => localStorage.getItem('qa.keylength'))) === 65, 'subscribed with the function\'s key (65 bytes)');
  ok(sub?.subscription?.endpoint === 'https://fcm.googleapis.com/fcm/send/golfos-test' && !!sub?.subscription?.keys?.p256dh, 'the subscription sent to the function');
  ok(sub?.auth === 'Bearer test-token', 'with the player\'s sign-in');
  ok(sub?.lang === 'de' && typeof sub?.tz === 'string' && sub.tz.length > 2, `language and time zone of the phone (${sub?.lang}, ${sub?.tz})`);
  ok(sub?.kinds?.rounds && sub?.kinds?.games && sub?.kinds?.weather, 'all three kinds on at first');
  ok(await card.getByRole('status').filter({ hasText: 'Mitteilungen sind an' }).isVisible(), 'said: on – a first one on its way');
  ok((await on.getAttribute('aria-checked')) === 'true', 'the slider on');
  if (process.env.SHOTS) await card.screenshot({ path: `${process.env.SHOTS}/push-card.png` });
  ok((await card.locator('.drawer-row[role="switch"]').count()) === 3 && (await card.getByRole('group').count()) === 0, 'one slider per kind: rounds, games, thunderstorm (no An/Aus buttons)');
  const storm = card.getByRole('switch', { name: /Gewitter auf dem Platz/ });
  await storm.click();
  await p.waitForTimeout(600);
  const set1 = calls.filter((c) => c.action === 'settings').pop();
  ok(set1?.kinds?.weather === false && set1?.kinds?.rounds === true && set1?.endpoint === sub?.subscription?.endpoint, 'thunderstorm off: told to the function');
  ok((await storm.getAttribute('aria-checked')) === 'false', 'its slider off');
  await storm.click();
  await p.waitForTimeout(600);
  ok(calls.filter((c) => c.action === 'settings').pop()?.kinds?.weather === true, 'and on again');
  // after a reload still on
  await openProfile(p);
  ok((await card.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' }).getAttribute('aria-checked')) === 'true', 'after a reload: still on');

  // a round on the course: the function learns where (for the thunderstorm warning)
  await p.evaluate((r) => localStorage.setItem('golfos.rounds.v1', JSON.stringify([r])), round('qa-live', false));
  await p.reload();
  await p.waitForTimeout(4000);
  const where = calls.find((c) => c.action === 'round');
  ok(!!where && Math.abs(where.round?.lat - 48.78) < 0.05 && Math.abs(where.round?.lng - 9.68) < 0.05 && where.round?.course === 'Golfclub Hetzenhof', `round on the course: Hetzenhof sent (${where?.round?.lat?.toFixed?.(3)}, ${where?.round?.lng?.toFixed?.(3)})`);

  // a push delivered to the service worker: shown as a notification
  const cdp = await ctx.newCDPSession(p);
  const regs = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await p.waitForTimeout(800);
  const reg = regs.find((r) => !r.isDeleted && r.scopeURL.startsWith(origin));
  ok(!!reg, 'the app\'s service worker registered');
  if (reg) {
    const note = { title: 'Runde noch nicht geprüft', body: 'Deine Runde in Golfclub Hetzenhof wartet aufs Prüfen und Signieren.', tag: 'golfos-rounds', url: './#review=qa-done' };
    await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: reg.registrationId, data: JSON.stringify(note) });
    await p.waitForTimeout(1500);
    const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })));
    ok(shown.length === 1 && shown[0].title === note.title && shown[0].body === note.body && shown[0].url === note.url, `the push shown: „${shown[0]?.title}“ – ${shown[0]?.body}`);
  }

  // the places a tap opens
  await p.evaluate((rs) => localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs)), [round('qa-done', true)]);
  await p.reload();
  await p.waitForTimeout(1500);
  // the app is open: the tap changes the place in its address
  await p.goto(`${url}#review=qa-done`);
  await p.waitForTimeout(3000);
  ok(await p.getByText('Schläge prüfen').first().isVisible(), '#review=…: the round\'s check opens');
  ok((await p.evaluate(() => location.hash)) === '', 'the place read once (address clean again)');
  await p.goto(`${url}#sign`);
  await p.waitForTimeout(2000);
  ok((await p.locator('.tile[aria-pressed="true"]').count()) === 1 && (await p.getByRole('button', { name: /Hetzenhof/ }).count()) >= 1, '#sign: the rounds to sign');
  await p.goto(`${url}#games`);
  await p.waitForTimeout(2000);
  ok(await p.getByRole('heading', { name: /Spiel starten|Spiele/ }).first().isVisible(), '#games: Games opens');
  await p.goto(`${url}#review=not-on-this-phone`);
  await p.waitForTimeout(2000);
  ok((await p.locator('.tile[aria-pressed="true"]').count()) === 1, 'a round not on this phone yet: the rounds to sign');
  // the round ended: no thunderstorm warnings for it any more – told once the round is finished
  // (the finish itself is covered by the round tests; here: off)
  const card2 = await openProfile(p);
  await card2.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' }).click();
  await p.waitForTimeout(800);
  ok(calls.some((c) => c.action === 'unsubscribe' && c.endpoint === sub?.subscription?.endpoint), 'turned off: the function forgets this phone');
  ok(Number(await p.evaluate(() => localStorage.getItem('qa.unsubscribed'))) >= 1, 'and the phone unsubscribes');
  ok((await card2.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' }).getAttribute('aria-checked')) === 'false' && (await card2.locator('.drawer-row').count()) === 0, 'the slider off, the kinds hidden');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ---------- the function not deployed yet: said so ----------
{
  const { ctx, p } = await context(devices['Pixel 7']);
  await ctx.unroute(/supabase\.co\/functions\/v1\/golfos-push/);
  await ctx.route(/supabase\.co\/functions\/v1\/golfos-push/, (r) => r.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: '' }));
  const card = await openProfile(p);
  await card.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' }).click();
  await p.waitForTimeout(1200);
  ok(await card.getByRole('status').filter({ hasText: 'noch nicht eingerichtet' }).isVisible(), 'function not there yet: "Auf dem Server noch nicht eingerichtet."');
  ok((await card.getByRole('switch', { name: 'Mitteilungen auf diesem Handy' }).getAttribute('aria-checked')) === 'false', 'and stays off');
  await ctx.close();
}

// ---------- iPhone in Safari (not on the home screen), and not signed in ----------
{
  const { ctx, p } = await context(devices['iPhone 13']);
  const card = await openProfile(p);
  ok(await card.getByText('Zum Home-Bildschirm').isVisible(), 'iPhone in the browser: how to add GolfOS to the home screen');
  ok((await card.getByRole('switch').count()) === 0, 'no slider that cannot work');
  await ctx.close();
}
{
  const { ctx, p } = await context(devices['Pixel 7'], { signedIn: false });
  const card = await openProfile(p);
  ok(await card.getByText('oben anmelden').isVisible(), 'not signed in: sign in first');
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
