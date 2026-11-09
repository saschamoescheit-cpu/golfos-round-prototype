// QA (Sascha 09.11.2026, USA: "a round of the series opened and back – the live leaderboard takes a moment. The load time
// should be zero while the tournament has not begun; live only 30 min before the tee time, until then what is loaded,
// shown at once"). The series' board shows the kept rounds at once – the server slow (4 s) does not hold it up – and
// is not read every 30 s before a round is live; the line under it says when it goes live.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesboard.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const host = await sim.phone('Sascha');
const H = host.p;
const flights = [
  { teeTime: '12:00', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Erik', playingHandicap: 5 }, { name: 'Moritz', playingHandicap: 0 }] },
  { teeTime: '12:08', players: [{ name: 'Christopher', playingHandicap: 0 }, { name: 'Cedric', playingHandicap: 13 }, { name: 'Stefan', playingHandicap: 13 }] },
];
const r1 = await sim.plan(H, { name: 'Stonegate Oaks', date: day(2), flights });
const r2 = await sim.plan(H, { name: 'Southern Dunes', date: day(3), flights });
const series = sim.series('Sascha', 'The Orlando Invitational', [r1, r2]);

await H.evaluate(async ({ code }) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
  sessionStorage.setItem('golfos.module', 'tournaments');
  sessionStorage.setItem('golfos.openTour', code);
}, { code: series });
await H.goto('about:blank');
await H.goto(url);
await H.locator('.tour-screen .tour-live').waitFor({ timeout: 15000 });
await H.waitForTimeout(1500);
const names = async () => (await H.locator('.tour-live .lb-rows li').allInnerTexts()).join(' ');
ok(/Stefan/.test(await names()) && /Christopher/.test(await names()), 'the series: its board with the players');
const note = (await H.locator('.tour-live').innerText()).replace(/\s+/g, ' ');
ok(/Live ab .*11:30 – 30 Min\. vor der ersten Startzeit/.test(note), `the line under it: live 30 minutes before the first tee time (${note.slice(-90)})`);

// the server slow from now on: back from a round the board is there at once all the same
let reads = 0;
await H.route(/supabase\.co\/rest\/v1\/golfos_shared_games/, async (route) => {
  // the rounds' own reads (code=eq.<round> / event_code=eq.<round>) – not the app's sync of the shared rows
  const u = route.request().url();
  if ([r1, r2].some((c) => u.includes(`code=eq.${c}&`))) reads++;
  if (process.env.DBG) console.log(Date.now() % 100000, route.request().method(), route.request().url().slice(-110));
  await new Promise((r) => setTimeout(r, 4000));
  await route.fallback();
});
await H.locator('li .list-item').filter({ hasText: 'Stonegate Oaks' }).first().click();
await H.locator('.topbar h1').filter({ hasText: 'Stonegate Oaks' }).waitFor({ timeout: 8000 });
await H.locator('.topbar').getByRole('button').first().click();
const t0 = Date.now();
await H.locator('.tour-live .lb-rows li').filter({ hasText: 'Stefan' }).first().waitFor({ timeout: 8000 });
const took = Date.now() - t0;
ok(took < 1500, `back in the series: the board at once (${took} ms, the server takes 4 s)`);

// before a round is live the board is not read again every 30 s
await H.waitForTimeout(6000); // the reads of opening done
const before = reads;
await H.waitForTimeout(32000);
ok(reads === before, `no reading every 30 s before the first round is live (${reads - before} reads)`);
// a round live (today, 30 minutes before its tee time gone): read every 30 s
const r0 = await sim.plan(H, { name: 'Kissimmee Bay', date: day(0), flights: flights.map((f) => ({ ...f, teeTime: '00:05' })) });
const live = sim.series('Sascha', 'Live Series', [r0]);
await H.unroute(/supabase\.co\/rest\/v1\/golfos_shared_games/);
let liveReads = 0;
await H.route(/supabase\.co\/rest\/v1\/golfos_shared_games/, async (route) => {
  if (route.request().url().includes(`code=eq.${r0}&`)) liveReads++;
  await route.fallback();
});
await H.evaluate(async ({ code }) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
  sessionStorage.setItem('golfos.module', 'tournaments');
  sessionStorage.setItem('golfos.openTour', code);
}, { code: live });
await H.goto('about:blank');
await H.goto(url);
await H.locator('.tour-screen .tour-live').waitFor({ timeout: 15000 });
await H.waitForTimeout(3000);
const opened = liveReads;
await H.waitForTimeout(32000);
ok(liveReads > opened, `a round live: read again every 30 s (${liveReads - opened} reads)`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
