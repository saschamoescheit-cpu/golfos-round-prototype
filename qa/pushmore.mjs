// QA (Sascha 07.11.2026: "I find your recommendations for the notifications very good – please build 1–6"): the app
// tells the push function at the right moments, the function (supabase/functions/golfos-push, its own unit tests in
// src/lib/pushmore.test.ts) sends them. Here the real app against the simulated server (qa/sharesim.mjs):
// 1 the host changes the tournament – what changed for each player; 2 every flight in – the result, once, from the
// tournament's page (opened by a tapped push "#tour="); 6 a special prize entered; 5 a pool over – the settlement;
// the switch "Sonderpreise live" in the profile. (3 countersign: qa/sharesign.mjs, 4 a new bet: qa/wagers.mjs.)
// Usage: node qa/pushmore.mjs [url]
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
const { shared, pushes } = sim;
const host = await sim.phone('Sascha');
const H = host.p;

// ---------- 1 · the host changes the tournament ----------
const code = await H.evaluate(async () => {
  const sr = await import('/src/lib/sharedround.ts');
  const ts = await import('/src/lib/tourstore.ts');
  const { searchBundled, loadCourse } = await import('/src/lib/courses.ts');
  const { loopOptions, buildRoundHoles } = await import('/src/lib/loops.ts');
  const summary = searchBundled('Hetzenhof')[0];
  const course = await loadCourse(summary);
  const opt = loopOptions(course.holes).find((x) => /A · 9/.test(x.label)) ?? loopOptions(course.holes)[0];
  const holes = buildRoundHoles(course.holes, opt);
  const p3 = holes.findIndex((h) => h.par === 3);
  const ev = sr.plannedEvent({
    name: 'USA Tag 1',
    date: sr.localDay(),
    course: summary,
    holes,
    loopOrder: opt.loops,
    format: { mode: 'single', scoring: 'stroke', allowance: 100 },
    specials: [{ id: 'ntp', kind: 'nearestPin', hole: p3 }],
    flights: [
      { teeTime: '12:08', players: [{ name: 'Erik', playingHandicap: 4 }, { name: 'Cedric', playingHandicap: 12 }] },
      { teeTime: '12:16', players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Christopher', playingHandicap: 0 }] },
    ],
  });
  return ts.createTour({ ...ev, date: sr.localDay(), planned: true });
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the tournament planned: ${code}`);
await H.evaluate(async (code) => {
  const ts = await import('/src/lib/tourstore.ts');
  const e = ts.loadTours().find((x) => x.code === code).ev;
  const [f1, f2] = Object.values(e.flights);
  const cedric = f1.players.find((p) => p.name === 'Cedric');
  // Cedric to flight 2, flight 1 later
  const flights = {
    [f1.id]: { ...f1, teeTime: '12:30', players: f1.players.filter((p) => p !== cedric), markers: {} },
    [f2.id]: { ...f2, players: [...f2.players, cedric] },
  };
  await ts.changeTour(code, { ...e, flights });
}, code);
await H.waitForTimeout(800);
const chg = pushes.find((x) => x.action === 'tour-changed' && x.code === code);
ok(!!chg && chg.from === 'Sascha', 'the change told to the push function – by the host');
ok(/^dein Flight: Flight 2 · 12:16 · mit Christopher, Sascha( · dein Zähler: \S+)?$/.test(chg?.changes?.cedric ?? ''), `Cedric: "${chg?.changes?.cedric}"`);
ok(/^dein Flight: Flight 1 · 12:30$/.test(chg?.changes?.erik ?? ''), `Erik: "${chg?.changes?.erik}"`);
ok(chg?.general === '', 'the day and the course as they were: nothing for all');
// saved again unchanged: nothing told
const before = pushes.filter((x) => x.action === 'tour-changed').length;
await H.evaluate(async (code) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.changeTour(code, ts.loadTours().find((x) => x.code === code).ev);
}, code);
await H.waitForTimeout(600);
ok(pushes.filter((x) => x.action === 'tour-changed').length === before, 'saved again unchanged: nothing told');

// ---------- 6 · a special prize entered ----------
await H.evaluate(async (code) => {
  const sr = await import('/src/lib/sharedround.ts');
  const ev = await sr.refreshEvent(code);
  const f = Object.values(ev.flights).find((x) => x.players.some((p) => p.name === 'Christopher'));
  await sr.setSpecial(code, f.id, 'ntp', f.players.find((p) => p.name === 'Christopher').id, { m: 2.3, at: new Date().toISOString(), by: 'phone' });
}, code);
await H.waitForTimeout(600);
ok(pushes.some((x) => x.action === 'special' && x.code === code && x.special === 'ntp'), 'Nearest to the Pin entered: told – the server works out the new best');

// ---------- 2 · every flight in: the result, from the tournament's page opened by a tapped push ----------
const sc = (n) => Array.from({ length: n }, () => ({ s: 4 }));
let first = 3; // hole 1: Erik 3, Cedric 4, Sascha 5, Christopher 6 – the rest 4 each
for (const row of shared.values())
  if (row.event_code === code && row.game.flight.players.length) {
    const f = row.game.flight;
    const n = shared.get(code).game.holes.length;
    f.scores = Object.fromEntries(f.players.map((p) => [p.id, ((s) => sc(n).map((c, i) => (i === 0 ? { s } : c)))(first++)]));
    f.finishedAt = new Date().toISOString();
    row.updated_at = new Date().toISOString();
  }
await H.goto('about:blank');
await H.goto(`${url}#tour=${code}`);
await H.getByRole('region', { name: 'Live-Leaderboard' }).waitFor({ timeout: 20000 }).catch(() => {});
const tag = await H.evaluate(() => sessionStorage.getItem('golfos.module')); // the tournament's page has its back button, no module tag
const h1 = (await H.locator('h1').allInnerTexts().catch(() => [])).join('|');
ok(tag === 'tournaments' && /USA Tag 1/.test(h1), `a tapped push "#tour=": Tournaments opens that tournament (${tag}, ${h1})`);
await H.waitForTimeout(2500);
const res = pushes.filter((x) => x.action === 'tour-result' && x.code === code);
ok(res.length === 1, `every flight in: the result told once (${res.length})`);
const rows = res[0]?.rows ?? [];
ok(rows.length === 4 && rows[0].pos === '1' && rows[0].name === 'Erik' && rows.every((r) => typeof r.sort === 'number') && res[0]?.hb === false, `the standing as the page shows it: ${rows.map((r) => `${r.pos} ${r.name} ${r.sort}`).join(' · ')}`);
await H.reload();
await H.waitForTimeout(4000);
ok(pushes.filter((x) => x.action === 'tour-result' && x.code === code).length === 1, 'the page again: not told twice from this phone');

// ---------- 5 · a pool over: the settlement ----------
const pool = await H.evaluate(async () => {
  const ws = await import('/src/lib/wagerstore.ts');
  const { dayOf } = await import('/src/lib/wagers.ts');
  const y = dayOf(new Date(Date.now() - 2 * 864e5));
  const at = new Date().toISOString();
  const made = await ws.createPool(
    {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: y, to: y, createdAt: at, currency: 'USD',
      players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'pe', name: 'Erik' }],
      wagers: [{ id: 'w1', player: 'pe', kind: 'free', text: 'Ein Birdie', target: 1, stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' }],
      progress: { w1: { done: true, manual: { done: true, at, by: 'Sascha' } } },
    },
    'ps',
  );
  await ws.syncPools();
  return made?.code ?? null;
});
await H.waitForTimeout(800);
const st = pushes.filter((x) => x.action === 'settle' && x.code === pool);
ok(st.length === 1 && st[0].sym === '$', `the pool over: the settlement told (${st.length}, ${st[0]?.sym})`);
ok(st[0]?.transfers?.length === 1 && st[0].transfers[0].from === 'ps' && st[0].transfers[0].to === 'pe' && st[0].transfers[0].amount === 20, `what is still to give: ${JSON.stringify(st[0]?.transfers)}`);
await H.evaluate(async () => (await import('/src/lib/wagerstore.ts')).syncPools());
await H.waitForTimeout(500);
ok(pushes.filter((x) => x.action === 'settle' && x.code === pool).length === 1, 'the next sync at once: not again (at most every six hours)');

// ---------- the switch in the profile ----------
const kinds = await H.evaluate(async () => (await import('/src/lib/push.ts')).loadPush().kinds);
ok(kinds.specials === true, 'special prizes live: on to start with');

const errs = [...(host.errs ?? [])];
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
