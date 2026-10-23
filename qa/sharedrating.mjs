// QA (night run 22./23.10.2026, final list): course rating and slope shared between players – a course without values
// in the app (Frielinghausen) gets the ones another player entered, read from the server when the course is opened;
// what the player saves himself goes to the others (signed in only, here: not signed in – nothing is sent).
// Usage: node qa/sharedrating.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
let posted = 0;
await ctx.route(/supabase\.co\/rest\/v1\/golfos_ratings/, (r) => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  if (r.request().method() === 'POST') {
    posted++;
    return r.fulfill({ status: 201, headers: cors, body: '' });
  }
  return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify([
    { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.6, slope: 131, updated_at: '2026-10-20T10:00:00Z' },
    { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.6, slope: 131, updated_at: '2026-10-21T10:00:00Z' },
    { tee: 'Yellow', loops: 'Main', lady: false, cr: 70.2, slope: 128, updated_at: '2026-10-22T10:00:00Z' },
  ]) });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '7', tee: 'Yellow' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Frielinghausen');
await p.waitForTimeout(2500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
await p.waitForTimeout(2000);
const text = await p.locator('main').innerText();
const loops = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('golfos.sharedratings.v1.')));
ok(loops.length === 1, `the shared values of the course kept on the phone (${loops.join(', ')})`);
ok(/Course Rating 70,6 · Slope 131|Course Rating\s*70,6\s*·\s*Slope\s*131/.test(text.replace(/\n/g, ' ')), 'Frielinghausen yellow: 70,6 / 131 – the value most players agree on');
ok(!/Course Rating und Slope eintragen/.test(text), 'nothing to type in');
ok(posted === 0, 'not signed in: nothing sent');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
