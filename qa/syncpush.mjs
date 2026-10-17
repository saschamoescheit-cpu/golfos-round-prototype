// QA (Sascha 17.10.2026: "changed the handicap on the PC – the iPhone does not show it, not even after reloading"):
// a change to synced data goes to the server within seconds – the profile too, not only rounds. The server is
// simulated: the page's requests to Supabase are answered here and recorded.
// Usage: node qa/syncpush.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
// the simulated server: WebKit does not route the CORS preflight, so a GET may report access control – not the app
p.on('pageerror', (e) => { if (!/golfos_items.*access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const sent = [];
await p.route(/supabase\.co\/rest\/v1\/golfos_items/, async (route) => {
  const r = route.request();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (r.method() === 'POST') {
    sent.push({ t: Date.now(), rows: JSON.parse(r.postData() ?? '[]') });
    return route.fulfill({ status: 201, headers: cors, body: '' });
  }
  return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: '[]' });
});
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((key) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7,0', homeClub: '' }));
  // signed in (a token that lives for an hour – no refresh needed)
  localStorage.setItem(key, JSON.stringify({ access_token: 'test', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'test@example.com', name: 'Sascha' }));
  sessionStorage.setItem('golfos.module', 'rounds');
}, 'golfos.auth.v1');
await p.reload();
await p.waitForTimeout(3000); // the first sync on start
const before = sent.length;
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(400);
// signed in: no "On all your devices" card, who is signed in stands by the photo with "Sign out" (Sascha 17.10.2026)
const prof = await p.locator('main').innerText();
ok(!/Auf allen Geräten/.test(prof) && /Mit Google angemeldet/.test(prof) && /test@example\.com/.test(prof), 'signed in: the account by the photo, no sync card');
ok(await p.getByRole('button', { name: 'Abmelden' }).isVisible(), '"Abmelden" by the photo');
const t0 = Date.now();
const field = p.getByLabel('Handicap-Index');
await field.fill('6,8');
await field.blur();
let got = null;
for (let i = 0; i < 20 && !got; i++) {
  await p.waitForTimeout(500);
  got = sent.slice(before).find((x) => x.rows.some((r) => r.id === 'golfos.profile.v1' && JSON.stringify(r.data).includes('6,8')));
}
ok(got != null, `the changed handicap went to the server ${got ? `after ${((got.t - t0) / 1000).toFixed(1)} s` : 'within 10 s'}`);
ok(got == null || got.t - t0 < 8000, 'within a few seconds, not after the 3-minute round');
// leaving the app (another tab, the phone locked) sends at once
const n = sent.length;
await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.profile.v1'));
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ ...r, homeClub: 'Golfclub Hetzenhof' }));
});
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await p.waitForTimeout(1500);
ok(sent.slice(n).some((x) => x.rows.some((r) => r.id === 'golfos.profile.v1' && JSON.stringify(r.data).includes('Hetzenhof'))), 'leaving the app sends right away');
await p.waitForTimeout(4000); // the syncs started above have finished
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
