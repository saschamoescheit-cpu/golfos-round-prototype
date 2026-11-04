// QA (04.11.2026, the USA trip): notifications turned on at home, the phone then in New York – the server told the new
// time zone once (its tee time reminder 45 minutes ahead in the time there), not again on every start; at home nothing.
// Usage: node qa/pushzone.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const calls = [];
async function phone(timezoneId, state) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', timezoneId });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/functions\/v1\/golfos-push/, (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    calls.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  // a subscription of this browser (WebKit here has no push service)
  await ctx.addInitScript(() => {
    const sub = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } }) };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }), register: async () => ({}), addEventListener() {}, getRegistrations: async () => [] } });
  });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.evaluate((state) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: `h.${btoa(JSON.stringify({ sub: 'u-Sascha' }))}.s`, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'sascha@test', name: 'Sascha' }));
    localStorage.setItem('golfos.push.v1', JSON.stringify(state));
  }, state);
  await p.reload();
  await p.waitForTimeout(5500);
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.push.v1')).tz);
  await ctx.close();
  return kept;
}
const kinds = { rounds: true, games: true, weather: true, agility: true };
// at home, told in Berlin: nothing to tell
let kept = await phone('Europe/Berlin', { on: true, endpoint: 'https://push.example/abc', kinds, tz: 'Europe/Berlin' });
ok(calls.filter((c) => c.action === 'subscribe').length === 0 && kept === 'Europe/Berlin', 'at home: the server not told again');
// in New York: told once, with the zone there
kept = await phone('America/New_York', { on: true, endpoint: 'https://push.example/abc', kinds, tz: 'Europe/Berlin' });
const sub = calls.filter((c) => c.action === 'subscribe');
ok(sub.length === 1 && sub[0].tz === 'America/New_York' && sub[0].subscription?.endpoint === 'https://push.example/abc' && kept === 'America/New_York', `in New York: the server told the new zone once (${JSON.stringify(sub.map((c) => c.tz))})`);
// started again there: not again
calls.length = 0;
await phone('America/New_York', { on: true, endpoint: 'https://push.example/abc', kinds, tz: 'America/New_York' });
ok(calls.filter((c) => c.action === 'subscribe').length === 0, 'started again in New York: not again');
// a phone from before (no zone kept): taken as it is, nothing sent
calls.length = 0;
kept = await phone('America/New_York', { on: true, endpoint: 'https://push.example/abc', kinds });
ok(calls.filter((c) => c.action === 'subscribe').length === 0 && kept === 'America/New_York', 'a phone from before: its zone kept, no hello');
await b.close();
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
