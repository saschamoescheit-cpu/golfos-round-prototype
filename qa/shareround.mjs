// QA (Sascha 29.10.2026: "build the invitation for rounds – on Saturday we play in the same scramble team, but it must
// also be possible to set up a kind of tournament over several flights, with a live leaderboard"): three phones. Sascha
// starts a scramble round (Sascha & Ben) and makes it a tournament with a code; Ben joins the same team with the link;
// Max starts a flight of his own (Max & Simon). Scores entered on one phone show on the other of the team, the
// leaderboard ranks both teams. Supabase is simulated in this script (the table golfos_shared_games, with its write
// rule "only if nobody wrote in between"), the app is real.
// Usage: node qa/shareround.mjs [url]
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
      const at = (u.searchParams.get('updated_at') ?? '').replace(/^eq\./, '');
      if (!row || (at && at !== row.updated_at)) {
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
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  // the simulated server: WebKit does not route the CORS preflight of the sync – not the app
  p.on('pageerror', (e) => { if (!/golfos_items.*access control|(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate((name) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
    // signed in (the token is only checked by the simulated server)
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const round = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt));
const event = () => [...shared.values()][0]?.game;

// ---------- Sascha: a scramble round with Ben, made a tournament ----------
const host = await phone('Sascha');
const H = host.p;
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.locator('input[id^="hcp-"]').first().fill('10'); // as in the profile – no "update the HCP?"
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Ben');
await H.locator('input[id^="hcp-"]').last().fill('16');
await H.locator('.settings-row').filter({ hasText: 'Modus' }).click();
await H.locator('.pick-option strong').getByText('Scramble', { exact: true }).click();
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(async () => {
  await H.screenshot({ path: 'qa/shareround-fail.png' });
  throw new Error('no hole map after "Runde starten" – qa/shareround-fail.png');
});
await H.waitForTimeout(2000);
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Mitspieler einladen · Turnier' }).click();
const invite = H.getByRole('dialog', { name: 'Mitspieler einladen' });
await invite.getByRole('switch', { name: /Turnier über mehrere Flights/ }).click();
await invite.locator('#event-name').fill('Scramble Samstag');
await invite.getByRole('button', { name: 'Code erzeugen' }).click();
await H.waitForTimeout(800);
const code = (await H.locator('.join-code').innerText()).trim();
ok(/^[A-Z0-9]{6}$/.test(code) && (await H.locator('.qr-box svg').count()) === 1, `Sascha: code ${code} with a QR code`);
ok(event()?.kind === 'round-event' && event().tournament && event().name === 'Scramble Samstag', 'server: the event, a tournament with its name');
const f1 = Object.values(event().flights)[0];
ok(f1.players.length === 1 && f1.players[0].name === 'Sascha & Ben', `server: flight 1 – the team "${f1.players.map((p) => p.name).join()}"`);
ok(!JSON.stringify(event()).includes('"detail"') && !JSON.stringify(event()).includes('"track"'), 'server: only the frame and the scores – no shots, no GPS');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/round-invite.png' });
await H.getByRole('button', { name: 'Schließen' }).click();

// ---------- Ben: the same team, with the link ----------
const guest = await phone('Ben');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
await G.waitForTimeout(2500);
const join = G.getByRole('dialog', { name: 'Runde beitreten' });
ok(await join.isVisible(), 'Ben: the link opens "Runde beitreten" in Rounds');
ok(await join.getByText('wer bist du?').isVisible(), 'Ben: the code looked up at once – "who are you?"');
await join.getByRole('button', { name: 'Sascha & Ben', exact: true }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
const gr = await round(G);
ok(gr.shared?.code === code && gr.players.length === 1 && gr.players[0].isMe && gr.format?.mode === 'scramble', 'Ben: his own round of the event – the team is "me", scramble');

// ---------- Max: a flight of his own ----------
const third = await phone('Max');
const M = third.p;
await M.getByRole('button', { name: 'Runde beitreten' }).click();
const mj = M.getByRole('dialog', { name: 'Runde beitreten' });
await mj.getByRole('textbox', { name: 'Code der Runde' }).fill(code);
await mj.getByRole('button', { name: 'Beitreten', exact: true }).click();
await M.waitForTimeout(1500);
await mj.getByRole('button', { name: 'Eigenen Flight anlegen' }).click();
ok((await mj.getByRole('textbox', { name: 'Spieler 1', exact: true }).inputValue()) === 'Max', 'Max: his own flight – his name first, from the profile');
await mj.getByRole('textbox', { name: 'Spieler 2', exact: true }).fill('Simon');
await mj.getByRole('button', { name: 'Flight starten' }).click();
await M.locator('.map-hole-no').waitFor({ timeout: 30000 });
ok(Object.keys(event().flights).length === 2 && Object.values(event().flights).some((f) => f.players[0]?.name === 'Max & Simon'), 'server: the second flight – the team "Max & Simon"');

// ---------- scores ----------
const enter = async (p, clicks) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(300);
  const plus = p.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ });
  for (let k = 0; k < clicks; k++) await plus.click();
  await p.getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(500);
};
await enter(H, 1); // Sascha's phone: par on hole 1
await enter(M, 2); // Max: bogey
await H.waitForTimeout(12000);
const g1 = await round(G);
ok(g1.entries[g1.players[0].id][0].strokes === (await round(H)).entries.me[0].strokes, `Ben's phone: the team's score from Sascha's phone (${g1.entries[g1.players[0].id][0].strokes})`);
// Ben enters hole 2 – it reaches Sascha's phone
// (hole 1 has its score from Sascha's phone: "→" goes on without asking)
await G.locator('.hole-bar-arrow[aria-label="Nächstes Loch"]').click();
await G.waitForTimeout(800);
ok((await G.locator('.map-hole-no').innerText()).includes('2'), `Ben: on hole 2 (${(await G.locator('.map-hole-no').innerText()).trim()})`);
await enter(G, 1);
await G.waitForTimeout(12000);
const h2 = await round(H);
ok(h2.entries.me[1].strokes != null && h2.entries.me[1].strokes === (await round(G)).entries.me[1].strokes, `Sascha's phone: hole 2 from Ben's phone (${h2.entries.me[1].strokes})`);
ok(h2.entries.me[0].strokes != null, 'Sascha: his own hole 1 still there');

// ---------- the live leaderboard ----------
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Leaderboard · Turnier' }).click();
await H.waitForTimeout(400);
const board = H.locator('.event-board');
const rows = (await board.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(rows.length === 2 && /Sascha & Ben/.test(rows[0]) && /Max & Simon/.test(rows[1]), `leaderboard of the tournament: ${rows.join(' | ')}`);
ok(/Turnier · 2 Flights/.test(await board.innerText()), 'leaderboard: "Turnier · 2 Flights"');
ok((await board.locator('li.lb-mine').count()) === 1 && /Sascha & Ben/.test(await board.locator('li.lb-mine').innerText()), 'leaderboard: the own team marked');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/round-leaderboard.png' });
console.log(`(writes refused because another phone wrote in between: ${refused})`);
ok(host.errs.length === 0 && guest.errs.length === 0 && third.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs, ...third.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
