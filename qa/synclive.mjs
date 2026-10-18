// QA (Sascha 17.10.2026: "every 20 seconds is not enough, it has to be live"): a change on the PC shows on the open
// iPhone within seconds, without reloading. Two devices, one simulated Supabase table (answered here); the nudge
// between them goes over the real Supabase Realtime (a broadcast on a test channel – no data in it).
// Usage: node qa/synclive.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const rows = new Map(); // kind|id → row
const sub = 'qa-' + Math.random().toString(36).slice(2);
const token = 'x.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.y';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
async function device(name, dev) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/golfos_items.*access control/.test(e.message)) errs.push(e.message); });
  await p.route(/supabase\.co\/rest\/v1\/golfos_items/, async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (r.method() === 'POST') {
      for (const x of JSON.parse(r.postData() ?? '[]')) rows.set(`${x.kind}|${x.id}`, x);
      return route.fulfill({ status: 201, headers: cors, body: '' });
    }
    const q = new URL(r.url()).searchParams;
    let out = [...rows.values()];
    if (q.get('select').includes('data')) {
      const kind = q.get('kind').slice(3);
      const ids = JSON.parse('[' + q.get('id').slice(4, -1) + ']');
      out = out.filter((x) => x.kind === kind && ids.includes(x.id));
    } else out = out.map(({ kind, id, updated_at, deleted }) => ({ kind, id, updated_at, deleted }));
    return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
  });
  await p.goto(url);
  await p.waitForTimeout(600);
  await p.evaluate(([key, token, first]) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    if (first) localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7,0', homeClub: '' }));
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 'test@example.com', name: 'Sascha' }));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, ['golfos.auth.v1', token, name === 'PC']);
  await p.reload();
  await p.waitForTimeout(3500);
  await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
  await p.waitForTimeout(500);
  return { p, errs };
}
const pc = await device('PC', 'Desktop Chrome');
const phone = await device('iPhone', 'iPhone 13');
await phone.p.waitForTimeout(1500);
const hcp = (d) => d.p.getByLabel('Handicap-Index').inputValue();
ok((await hcp(phone)) === '7,0', `the iPhone has the PC's profile (${await hcp(phone)})`);
const t0 = Date.now();
await pc.p.getByLabel('Handicap-Index').fill('6,4');
await pc.p.getByLabel('Handicap-Index').blur();
let seen = null;
for (let i = 0; i < 30 && seen == null; i++) {
  await phone.p.waitForTimeout(250);
  if ((await hcp(phone)) === '6,4') seen = Date.now() - t0;
}
ok(seen != null && seen < 6000, `the open iPhone shows the PC's change without reloading ${seen != null ? `after ${(seen / 1000).toFixed(1)} s` : '(not within 7.5 s)'}`);
// and back: the iPhone's change on the open PC
const t1 = Date.now();
await phone.p.getByLabel('Handicap-Index').fill('6,1');
await phone.p.getByLabel('Handicap-Index').blur();
let back = null;
for (let i = 0; i < 30 && back == null; i++) {
  await pc.p.waitForTimeout(250);
  if ((await hcp(pc)) === '6,1') back = Date.now() - t1;
}
ok(back != null && back < 6000, `and the other way round ${back != null ? `after ${(back / 1000).toFixed(1)} s` : '(not within 7.5 s)'}`);
ok(pc.errs.length + phone.errs.length === 0, `no page errors ${[...pc.errs, ...phone.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
