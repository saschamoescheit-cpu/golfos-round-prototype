// QA: one game on two phones (Sascha 15.10.2026) – the host invites (code + QR), the guest joins with the code, both
// enter scores, both see both. Supabase is simulated in this script (the table golfos_shared_games), the app is real.
// Since 29.10.2026 as in Rounds (Sascha: "in Games we need the invitation of the flight's players as in Rounds"): the
// server takes a write only if nobody wrote since it was read (as the real table with updated_at), the link looks the
// game up at once, finishing reaches the other phone, a round's code under "Spiel beitreten" goes on to Rounds.
// Usage: node qa/sharegame.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
// ---------- the simulated server ----------
const shared = new Map(); // code → { game, updated_at }
let refused = 0; // writes refused because another phone wrote in between
async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
  if (u.pathname.endsWith('/golfos_items')) return json(200, []);
  if (u.pathname.endsWith('/rpc/golfos_join_game')) {
    const { join_code } = JSON.parse(req.postData() ?? '{}');
    const row = shared.get(join_code);
    return json(200, row ? row.game : null);
  }
  if (u.pathname.endsWith('/golfos_shared_games')) {
    const code = (u.searchParams.get('code') ?? '').replace(/^eq\./, '');
    if (req.method() === 'GET') return json(200, code ? (shared.has(code) ? [{ game: shared.get(code).game, updated_at: shared.get(code).updated_at }] : []) : []);
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData());
      if (shared.has(row.code)) return json(409, { code: '23505' });
      shared.set(row.code, { game: row.game, updated_at: new Date().toISOString() });
      return json(201, null);
    }
    if (req.method() === 'PATCH') {
      const row = shared.get(code);
      const at = (u.searchParams.get('updated_at') ?? '').replace(/^eq./, '');
      if (!row || !at || at !== row.updated_at) {
        refused++;
        return json(200, []);
      }
      const body = JSON.parse(req.postData());
      row.game = body.game;
      row.updated_at = body.updated_at;
      return json(200, [{ code }]);
    }
  }
  return json(404, { message: 'not simulated' });
}
async function phone(name) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  // the simulated server: WebKit does not route the CORS preflight of the sync – not the app
  p.on('pageerror', (e) => { if (!/golfos_items.*access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate((name) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
    // signed in (the token is only checked by the simulated server)
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    sessionStorage.setItem('golfos.module', 'games');
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const host = await phone('Sascha');
const guest = await phone('Ben');

// host: a new game on Hetzenhof with Ben, invite
const H = host.p;
await H.getByRole('button', { name: 'Neues Spiel' }).click();
await H.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.waitForTimeout(800);
await H.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
await H.getByRole('button', { name: 'Spiel starten' }).click();
await H.waitForTimeout(4500);
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Mitspieler einladen' }).click();
await H.getByRole('button', { name: 'Code erzeugen' }).click();
await H.waitForTimeout(800);
const code = (await H.locator('.join-code').innerText()).trim();
ok(/^[A-Z0-9]{6}$/.test(code) && (await H.locator('.qr-box svg').count()) === 1, `host: code ${code} with a QR code`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/share-invite.png' });
await H.getByRole('button', { name: 'Schließen' }).click();

// guest: join with the code (as from the QR link)
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#join=' + code);
await G.waitForTimeout(2000);
ok(await G.getByRole('dialog', { name: 'Spiel beitreten' }).isVisible(), 'guest: the QR link opens "Spiel beitreten" with the code');
ok(await G.getByText('wer bist du?').isVisible(), 'guest: the link looks the game up at once – "who are you?" (as in Rounds)');
await G.getByRole('dialog', { name: 'Spiel beitreten' }).getByRole('button', { name: 'Ben', exact: true }).click();
await G.waitForTimeout(4500);
// games are on the GPS map (Sascha 16.10.2026): the guest plays on the map too, with his own round
ok((await G.locator('.maplibregl-canvas').count()) === 1 && (await G.locator('.game-bar').count()) === 1, 'guest: on the map with the game bar');
const guestRound = await G.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1'))[0]);
ok(guestRound.round && guestRound.round.players.find((p) => p.isMe)?.id === guestRound.shared.me, 'guest: in his round Ben is "me"');
ok(!JSON.stringify([...shared.values()].map((v) => v.game.round?.entries ?? {})).includes('"shots"'), 'server: no shots or GPS of the round, only its frame');
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const enter = async (p, name, times) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(250);
  for (let k = 0; k < times; k++) await block(p, name).getByRole('button', { name: /Schläge plus eins/ }).click();
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
};

// both enter: the host his own score, the guest his – after a few seconds both phones show both
await enter(H, 'Sascha', 1); // Sascha par 4
await enter(G, 'Ben', 2); // Ben 5
await H.waitForTimeout(12000);
const vals = async (p) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(300);
  const v = [];
  for (const n of ['Sascha', 'Ben']) v.push((await block(p, n).locator('.stepper-value').first().innerText()).trim().split(/\s+/)[0]);
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
  return v.join(',');
};
const hv = await vals(H);
const gv = await vals(G);
ok(hv === '4,5', `host sees both scores: ${hv}`);
ok(gv === '4,5', `guest sees both scores: ${gv}`);
ok((await G.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1'))[0].shared.me)) !== 'me', 'guest: Ben is his own player (not player 1)');

// both enter on the same hole at the same moment: nothing is lost (the server refuses the second write, it reads again)
await H.locator('.map-score').click();
await G.locator('.map-score').click();
await H.waitForTimeout(250);
await Promise.all([block(H, 'Sascha').getByRole('button', { name: /Schläge plus eins/ }).click(), block(G, 'Ben').getByRole('button', { name: /Schläge plus eins/ }).click()]);
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(12000);
const hv2 = await vals(H);
const gv2 = await vals(G);
ok(hv2 === '5,6' && gv2 === '5,6', `both enter at once: host ${hv2}, guest ${gv2} (refused writes read again: ${refused})`);

// the host finishes: the guest's phone hears of it (as a round in Rounds), the last scores with it
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
await H.getByRole('button', { name: /Speichern & beenden/ }).click();
await H.waitForTimeout(1500);
ok([...shared.values()].some((v) => v.game.finishedAt), 'host finished: "finished" is on the server');
await G.waitForTimeout(7000);
ok(await G.evaluate(() => !!JSON.parse(localStorage.getItem('golfos.games.v1'))[0].finishedAt), 'guest: the game is finished on his phone too');

// one code for both modules: a round's code typed under "Spiel beitreten" goes on to Rounds' "Runde beitreten"
shared.set('RND234', {
  updated_at: new Date().toISOString(),
  game: {
    kind: 'round-event', id: 'ev1', name: 'Hetzenhof · 29.10.', tournament: false,
    course: { id: 'osm:test', source: 'osm', name: 'Hetzenhof', lat: 48.78, lon: 9.69 },
    loopOrder: ['A'], holes: [{ id: 'h1', label: '1A', par: 4, si: 1 }], createdAt: new Date().toISOString(),
    flights: { f1: { id: 'f1', name: 'Max · Tom', players: [{ id: 'me', name: 'Max', playingHandicap: null }, { id: 'p2', name: 'Tom', playingHandicap: null }], scores: { me: [null], p2: [null] }, finishedAt: null } },
  },
});
const third = await phone('Tom');
const T = third.p;
await T.getByRole('button', { name: 'Spiel beitreten' }).click();
await T.getByRole('textbox', { name: 'Code des Spiels' }).fill('RND234');
await T.getByRole('dialog', { name: 'Spiel beitreten' }).getByRole('button', { name: 'Beitreten', exact: true }).click();
await T.waitForTimeout(2500);
// Tom's name is in the flight: in the round at once, no "who are you?" (Sascha 30.10.2026: "not many taps")
await T.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
const tr = await T.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').find((r) => r.shared?.code === 'RND234') ?? null).catch(() => null);
ok(tr?.players?.find((p) => p.isMe)?.name === 'Tom', "a round's code in Games: on to Runde beitreten in Rounds – Tom in the round as himself");
ok(third.errs.length === 0, `third phone: no page errors ${third.errs.slice(0, 2).join(' | ')}`);
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
