// QA (Sascha 08.11.2026, USA: "the live leaderboard also for people outside the tournament – the same for games and
// bets"). Supabase simulated (qa/sharesim.mjs: golfos_live, golfos_live_set, golfos_live_state as supabase/golfos-live.sql),
// the app real.
// 1 · the host of a tournament: "Zuschauer" – off at first; switched on: the QR card with Teilen / Link kopieren / Neuer
//     Link (icons, no code under the QR code)
// 2 · a spectator – another browser, no account, nothing stored – opens the link: the leaderboard, the players and their
//     scores, nothing of the app around it, no join
// 3 · a pool: the bets' standing – without the money ("Beträge zeigen" off); with it: the "5+5+10" in dollars
// 4 · a game: its standing, no money
// 5 · a series: the total over its rounds
// 6 · switched off: the link says "Nicht live"
// Usage: node qa/livewatch.mjs [url]
import { webkit, devices } from 'playwright';
import { onOff, flip } from './onoff.mjs';
import { sharedServer } from './sharesim.mjs';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const today = await H.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const flights = [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Erik', playingHandicap: 8 }] }];
const fmt = { mode: 'single', scoring: 'stroke', allowance: 0 };
const tour = await sim.plan(H, { name: 'Celebration', date: today, flights, format: fmt });
// played to hole 3: Erik level, Sascha one over
const fill = (code, over) => {
  const row = sim.shared.get(code);
  const own = [...sim.shared.values()].filter((r) => r.event_code === code);
  for (const f of [...Object.values(row.game.flights), ...own.map((r) => r.game.flight)]) {
    const n = row.game.holes.length;
    f.scores = Object.fromEntries(f.players.map((p) => [p.id, Array.from({ length: n }, (_, i) => (i < 3 ? { s: row.game.holes[i].par + (over[p.name] ?? 0) * (i === 0 ? 1 : 0) } : { s: null }))]));
    f.phones = { phone1: { player: 'p1', name: 'Sascha', at: 'x', uid: 'Sascha' } };
  }
  for (const r of [row, ...own]) r.updated_at = new Date().toISOString();
};
fill(tour, { Sascha: 1 });

// 1 · the host: Turniere → the tournament → "Zuschauer"
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.reload();
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(1500);
await H.locator('.list-item').filter({ hasText: 'Celebration' }).first().click();
await H.waitForTimeout(2000);
const block = H.getByRole('region', { name: 'Zuschauer' });
const sw = onOff(block, 'Live-Leaderboard für Zuschauer');
await sw.waitFor({ timeout: 15000 }).catch(() => {});
ok((await sw.getAttribute('data-on')) === 'false', '"Zuschauer": off at first, the switch right of its heading');
await flip(sw);
await H.waitForTimeout(1500);
const code = sim.shared.get(tour).live;
ok(typeof code === 'string' && code.length === 24 && (await sw.getAttribute('data-on')) === 'true', `switched on: a watch code on the server (${code})`);
ok((await block.locator('.qr-box').count()) === 1 && (await block.locator('.invite-qr-code').count()) === 0, 'the QR code – no code under it (not for joining)');
const actions = await block.locator('.qr-action').allInnerTexts();
ok(actions.map((t) => t.trim()).join('|') === 'Teilen|Link kopieren|Neuer Link' && (await block.locator('.qr-action svg').count()) === 3, `round icons: ${actions.map((t) => t.trim()).join(' · ')}`);
if (process.env.SHOTS) await block.screenshot({ path: process.env.SHOTS + '/live-share.png' });

// 2 · the spectator: no account, nothing stored
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, sim.serve);
const V = await ctx.newPage();
const verrs = [];
V.on('pageerror', (e) => verrs.push(e.message));
const watch = async (c) => {
  await V.goto('about:blank');
  await V.goto(`${url}#live=${c}`);
  await V.locator('main.live-screen').waitFor({ timeout: 20000 });
  await V.waitForTimeout(1500);
  return (await V.locator('main.live-screen').innerText()).replace(/\s+/g, ' ');
};
let t = await watch(code);
ok(/Celebration/.test(t) && /Erik/.test(t) && /Sascha/.test(t), `the leaderboard: the tournament and its players (${t.slice(0, 140)})`);
const rows = (await V.locator('.lb-rows li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(rows.length === 2 && /Erik/.test(rows[0]) && /nach 3/.test(rows[0]) && /Sascha/.test(rows[1]), `Erik ahead, both thru 3 (${rows.join(' | ')})`);
ok((await V.locator('.bottom-nav, nav, .topbar').count()) === 0 && (await V.getByRole('button', { name: /beitreten|Neue Runde/ }).count()) === 0, 'nothing of the app around it – no menu, no joining');
ok((await V.getByRole('button', { name: /CSV/ }).count()) === 0, 'no download of the list');
// a player tapped: his scorecard below him (Sascha 08.11.2026: "the scorecards when tapping a player")
await V.locator('.lb-rows li').filter({ hasText: 'Erik' }).first().click();
await V.waitForTimeout(500);
ok((await V.locator('.lb-card').count()) === 1 && /Erik|Loch|Par/.test(await V.locator('.lb-card').innerText()), 'Erik tapped: his scorecard opens');
// its marks inside their hole's column, the double bogey's outer square too (Sascha 08.11.2026: "the scorecards are
// not clean yet" – in the narrow card the circles and squares ran into each other)
const fit = await V.locator('.lb-card').evaluate((card) => {
  const out = [];
  for (const kind of ['birdie', 'bogey', 'double']) {
    for (const m of card.querySelectorAll('td .mark')) {
      const was = m.className;
      m.className = `mark ${kind}`;
      const r = m.getBoundingClientRect();
      const td = m.closest('td').getBoundingClientRect();
      const ring = kind === 'double' ? 3 : 0;
      if (r.left - ring < td.left - 0.5 || r.right + ring > td.right + 0.5) out.push(`${kind} ${Math.round(r.width + 2 * ring)} in ${Math.round(td.width)}`);
      m.className = was;
    }
  }
  return { bad: out, col: Math.round(card.querySelector('tr.score td:nth-child(2)')?.getBoundingClientRect().width ?? 0) };
});
ok(fit.bad.length === 0, `the card's marks inside their columns (${fit.col} px a hole${fit.bad.length ? ': ' + fit.bad.slice(0, 3).join(', ') : ''})`);
// no tabs any more (Facelift-Abnahme T9): the leaderboard, below it the course as a row "Platz · … ›" – tapped, its holes
// on the aerial image, the scores on each
ok((await V.getByRole('tab').count()) === 0 && (await V.locator('.segmented').count()) === 0, 'no tabs on the page');
const courseRow = V.locator('.live-course-row .settings-row');
ok((await courseRow.count()) === 1 && /^Platz/.test((await courseRow.innerText()).trim()) && (await courseRow.getAttribute('aria-expanded')) === 'false' && (await V.locator('.live-course').count()) === 0, `the course a row under the leaderboard, closed (${(await courseRow.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
if (process.env.SHOTS) await V.screenshot({ path: process.env.SHOTS + '/live-event-board.png', fullPage: true });
await courseRow.click();
await V.locator('.live-course').waitFor({ timeout: 20000 }).catch(() => {});
await V.waitForTimeout(2500);
const holeHead = async () => (await V.locator('.live-hole-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Loch 1/.test(await holeHead()) && /Par \d/.test(await holeHead()), `the course: hole 1 with its par (${await holeHead()})`);
ok((await V.locator('.live-course canvas, .live-course .maplibregl-map').count()) > 0, 'the hole on the map');
ok((await V.locator('.live-hole-scores li').count()) === 2 && /Erik/.test(await V.locator('.live-hole-scores').innerText()), 'the scores of the players on the hole');
const chips = await V.locator('.live-hole-chips .chip').count();
await V.getByRole('button', { name: 'Nächstes Loch' }).click();
await V.waitForTimeout(800);
ok(chips >= 9 && /Loch 2/.test(await holeHead()), `every hole: ${chips} chips, "Nächstes Loch" goes to hole 2`);
if (process.env.SHOTS) await V.screenshot({ path: process.env.SHOTS + '/live-course.png', fullPage: true });
ok(await V.evaluate(() => !localStorage.getItem('golfos.auth.v1')), 'no account made');
if (process.env.SHOTS) await V.screenshot({ path: process.env.SHOTS + '/live-event.png', fullPage: true });

// 3 · a pool: without money, then with
const pool = 'POOL' + Math.random().toString(36).slice(2, 5).toUpperCase();
sim.shared.set(pool, {
  owner: 'Sascha', members: [], requests: {}, updated_at: new Date().toISOString(), live: 'a'.repeat(4) + '0123456789abcdef0123', liveMoney: false,
  game: { kind: 'wager-pool', id: 'pl', name: 'Zocker-Pool', from: today, to: today, createdAt: today, currency: 'USD', players: [{ id: 'a', name: 'Sascha', joined: { name: 'S', at: 'x', uid: 'Sascha' } }, { id: 'b', name: 'Erik' }],
    wagers: [{ id: 'w1', player: 'a', kind: 'nassau', target: 0, stake: 10, payout: 'opponent', opponent: 'b', attempts: 'any', parts: { front: 5, back: 5, total: 10 } }, { id: 'w2', player: 'b', kind: 'birdies', target: 3, stake: 20, payout: 'success', attempts: 'any' }],
    progress: { w1: { best: null, done: false, rounds: 1, amount: -15, at: 'x' }, w2: { best: 1, done: false, rounds: 1, at: 'x' } }, payments: [] },
});
t = await watch('aaaa0123456789abcdef0123');
ok(/Zocker-Pool/.test(t) && /Birdies auf 18 3 1/.test(t) && /Sascha/.test(t) && /Erik/.test(t), `the pool: its bets and where they stand (${t.slice(0, 160)})`);
ok(!/\$|15|€/.test(await V.locator('.pool-standings').innerText()) && /hinten/.test(await V.locator('.pool-standings').innerText()), 'without the money: no amounts – the "5+5+10" only "hinten"');
sim.shared.get(pool).liveMoney = true;
t = await watch('aaaa0123456789abcdef0123');
ok(/\$15|15 \$|−\$15/.test(await V.locator('.pool-standings').innerText()), `with "Beträge zeigen": the amount (${(await V.locator('.pool-standings').innerText()).replace(/\s+/g, ' ').slice(0, 120)})`);

// 4 · a game
const game = 'GAME' + Math.random().toString(36).slice(2, 5).toUpperCase();
sim.shared.set(game, {
  owner: 'Sascha', members: [], requests: {}, updated_at: new Date().toISOString(), live: 'b'.repeat(4) + '0123456789abcdef0123', liveMoney: false,
  game: { id: 'gm', createdAt: today, finishedAt: null, courseName: 'Hawk\'s Landing', form: 'skins', current: 2, extra: [{}, {}, {}],
    holes: [{ label: '1', par: 4, si: 1 }, { label: '2', par: 3, si: 2 }, { label: '3', par: 5, si: 3 }],
    players: [{ id: 'a', name: 'Sascha', hcp: 4 }, { id: 'b', name: 'Erik', hcp: 8 }], scores: { a: [4, 2, null], b: [5, 3, null] }, settings: { stake: 5, currency: 'USD' }, claims: { x: 'a' }, shared: { code: game } },
});
t = await watch('bbbb0123456789abcdef0123');
ok(/Hawk's Landing/.test(t) && /Zwischenstand/i.test(t) && /Sascha/.test(t), `the game: its standing (${t.slice(0, 140)})`);
ok(!/Einsatz/.test(t) && (await V.locator('.game-money').count()) === 0, 'no stake, no money');

// 5 · a series with the tournament as its round
const series = sim.series('Sascha', 'The Orlando Invitational', [tour]);
sim.shared.get(series).live = 'c'.repeat(4) + '0123456789abcdef0123';
t = await watch('cccc0123456789abcdef0123');
ok(/The Orlando Invitational/.test(t) && (await V.locator('[aria-label="Gesamtwertung"] .lb-rows li').count()) === 2, `the series: the total (${t.slice(0, 140)})`);
await V.locator('[aria-label="Gesamtwertung"] .series-lb-row').first().click();
await V.waitForTimeout(500);
ok((await V.locator('.series-player-sheet table.sc').count()) === 1, 'a player tapped: his sheet with the scorecard of the round');
await V.locator('.series-player-sheet').getByRole('button', { name: 'Schließen' }).click();
// the total and each round as one switch "‹ Gesamt ›" (Facelift-Abnahme T9) – the next one: round 1
const views = V.getByRole('group', { name: 'Ansicht' });
ok((await V.getByRole('tab').count()) === 0 && /Gesamt/.test(await views.locator('.step-pick-now').innerText()) && (await V.locator('.live-course-row').count()) === 1, 'the series: "‹ Gesamt ›" as the switch, no tabs, the course a row below');
if (process.env.SHOTS) await V.screenshot({ path: process.env.SHOTS + '/live-series.png', fullPage: true });
await views.getByRole('button', { name: 'Nächste' }).click();
await V.waitForTimeout(500);
ok(/Runde 1/.test(await views.locator('.step-pick-now').innerText()) && /Celebration/.test(await V.locator('main').innerText()) && (await V.locator('.lb-rows li').count()) === 2, '"›": round 1 – the leaderboard of the round');

// 6 · switched off by the host
await flip(sw);
await H.waitForTimeout(1500);
ok(!sim.shared.get(tour).live && (await sw.getAttribute('data-on')) === 'false', 'switched off: no watch code on the server');
t = await watch(code);
ok(/Nicht live/.test(t), 'the old link: "Nicht live"');
ok(verrs.length === 0 && host.errs.length === 0, `no page errors ${[...verrs, ...host.errs].slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
