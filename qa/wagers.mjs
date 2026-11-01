// QA (Sascha 01.11.2026: "in America we have bets running – Chris 3 birdies in a row, 12 pars in a row, 5 birdies on
// 18, 16 greens, −5 …; individual bets in Games, everything adjustable, invite people, and the flight counts each other
// as in a real tournament"): two phones. Sascha sets up a pool of bets with four players, adds Chris's five bets with
// the "Zocker-Pool" template (−5 for the score) and a free bet for Erik, and invites. Chris joins with the link, picks
// himself; a round of his – played with a marker, the card signed by both – is on his phone: his phone judges his bets
// and reports them. Sascha sees what Chris made, decides Erik's free bet by hand, and the settlement says who pays whom.
// Supabase is simulated in this script (the table golfos_shared_games with its write rule), the app is real.
// Usage: node qa/wagers.mjs [url]
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
      if (!row || !at || at !== row.updated_at) return json(200, []);
      const body = JSON.parse(req.postData());
      row.game = body.game;
      row.updated_at = body.updated_at;
      return json(200, [{ code }]);
    }
  }
  return json(404, { message: 'not simulated' });
}
async function phone(name, seed) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/golfos_items.*access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate(({ name, seed }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    for (const [k, v] of Object.entries(seed ?? {})) localStorage.setItem(k, JSON.stringify(v));
    sessionStorage.setItem('golfos.module', 'games');
  }, { name, seed });
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}

// Chris's round today: par everywhere, birdies on 4–6, a bogey on 13 – putts 2 (1 on the birdies): 3 birdies in a row,
// 12 pars or better in a row, 3 birdies, 17 greens, −2. Played with a marker, the card signed by Chris and his marker.
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const strokes = PARS.map((p, i) => (i >= 3 && i <= 5 ? p - 1 : i === 12 ? p + 1 : p));
const putts = PARS.map((_, i) => (i >= 3 && i <= 5 ? 1 : 2));
const now = new Date().toISOString();
const entry = (i) => ({ strokes: strokes[i], pickedUp: false, putts: putts[i], fairway: null, penalties: 0, greensideBunker: false, upAndDown: null });
const chrisRound = {
  id: 'r-chris', createdAt: now, finishedAt: now, courseId: 'osm:test', courseName: 'Bethpage Black', loopOrder: ['A'],
  holes: PARS.map((par, i) => ({ id: `h${i}`, label: String(i + 1), par, si: i + 1 })), mode: 'quick',
  players: [{ id: 'me', name: 'Chris', playingHandicap: 2, isMe: true }, { id: 'p2', name: 'Erik', playingHandicap: 9, isMe: false }],
  entries: { me: PARS.map((_, i) => entry(i)), p2: PARS.map((p) => ({ ...entry(0), strokes: p })) },
  currentHole: 17, shared: { code: 'EVT234', flight: 'f1', base: {} },
};
const event = {
  kind: 'round-event', id: 'ev', name: 'Bethpage', tournament: false, course: { id: 'osm:test', source: 'osm', name: 'Bethpage Black', lat: 40.74, lon: -73.45 },
  loopOrder: ['A'], holes: chrisRound.holes, createdAt: now,
  flights: { f1: { id: 'f1', name: 'Chris · Erik', players: [{ id: 'me', name: 'Chris', playingHandicap: 2 }, { id: 'p2', name: 'Erik', playingHandicap: 9 }], scores: {}, markers: { me: 'p2', p2: 'me' }, signed: { me: { player: now, marker: now } } } },
};

const host = await phone('Sascha');
const H = host.p;
// ---------- Sascha: a pool of bets, four players ----------
await H.getByRole('button', { name: 'Neuer Wett-Pool' }).click();
await H.fill('#pool-name', 'USA 2026');
await H.getByRole('textbox', { name: 'Spieler 2' }).fill('Chris');
await H.getByRole('textbox', { name: 'Spieler 3' }).fill('Erik');
await H.getByRole('button', { name: '+ Spieler' }).click();
await H.getByRole('textbox', { name: 'Spieler 4' }).fill('Cedric');
await H.getByRole('button', { name: 'Pool anlegen' }).click();
await H.waitForTimeout(1200);
ok((await H.locator('.pool-player').count()) === 4 && (await H.locator('.topbar h1').innerText()).includes('USA 2026'), 'pool set up: USA 2026 with 4 players');
const code = [...shared.keys()][0];
ok(/^[A-Z0-9]{6}$/.test(code ?? '') && shared.get(code).game.kind === 'wager-pool', `the pool on the server, code ${code}`);

// the "Zocker-Pool" template for Chris: five bets, the score −5
await H.getByRole('button', { name: 'Vorlage Zocker-Pool' }).click();
const tpl = H.getByRole('dialog', { name: 'Vorlage Zocker-Pool' });
await tpl.getByRole('group', { name: 'Wessen Wetten' }).getByRole('button', { name: 'Chris', exact: true }).click();
const minus = tpl.getByRole('group', { name: 'Ergebnis zu Par' }).getByRole('button', { name: /minus eins/ });
for (let k = 0; k < 5; k++) await minus.click();
if (process.env.SHOTS) await tpl.screenshot({ path: process.env.SHOTS + '/wagers-template.png' });
await tpl.getByRole('button', { name: /5 Wetten für Chris anlegen/ }).click();
await H.waitForTimeout(1000);
const chrisCard = H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Chris$/ }) });
const rows = await chrisCard.locator('.pool-wager .title').allInnerTexts();
ok(rows.length === 5 && rows.includes('2 Birdies in Folge') && rows.includes('−5 brutto'), `Chris's five bets: ${rows.join(' · ')}`);
ok((await chrisCard.locator('.pool-wager').first().innerText()).includes('20 € · nur bei Erfolg · mit Zähler'), 'the rules in the row: 20 €, paid when made, with marker');

// a free bet for Erik
await H.getByRole('button', { name: '+ Wette' }).click();
const ws = H.getByRole('dialog', { name: 'Neue Wette' });
await ws.getByRole('group', { name: 'Wessen Wette' }).getByRole('button', { name: 'Erik', exact: true }).click();
await ws.getByRole('group', { name: 'Was' }).getByRole('button', { name: 'Freie Wette' }).click();
await ws.getByRole('textbox', { name: 'Die Wette in Worten' }).fill('Längster Drive an Loch 7');
if (process.env.SHOTS) await ws.screenshot({ path: process.env.SHOTS + '/wagers-bet.png' });
await ws.getByRole('button', { name: 'Wette anlegen' }).click();
await H.waitForTimeout(1000);
ok((await H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Erik$/ }) }).innerText()).includes('Längster Drive an Loch 7'), "Erik's free bet in the pool");
ok(shared.get(code).game.wagers.length === 6, `the server has the 6 bets (${shared.get(code).game.wagers.length})`);

// invite: the code with a QR code
await H.getByRole('button', { name: new RegExp(`Mitspieler einladen · Code ${code}`) }).click();
ok((await H.locator('.qr-box svg').count()) === 1 && (await H.locator('.join-code').innerText()).trim() === code, 'invite: code and QR code');
await H.getByRole('dialog', { name: 'Mitspieler einladen' }).getByRole('button', { name: 'Schließen' }).click();

// ---------- Chris: joins with the link, picks himself – his phone judges his bets from his signed round ----------
const guest = await phone('Chris', { 'golfos.rounds.v1': [chrisRound], 'golfos.event.v1.EVT234': event });
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#join=' + code);
await G.waitForTimeout(2000);
ok(await G.getByText('Wetten „USA 2026“ – wer bist du?').isVisible(), 'Chris: the link finds the pool – "who are you?"');
await G.getByRole('dialog', { name: 'Spiel beitreten' }).getByRole('button', { name: 'Chris', exact: true }).click();
await G.waitForTimeout(3000);
ok((await G.locator('.topbar h1').innerText()).includes('USA 2026'), 'Chris: in the pool');
const made = await G.locator('.pool-made').innerText().catch(() => '');
ok(/Chris: 2 Birdies in Folge/.test(made) && /Bethpage Black/.test(made), `Chris: "made it" shown – ${made.replace(/\s+/g, ' ').slice(0, 120)}`);
const gChris = G.locator('.pool-player').filter({ has: G.locator('h2', { hasText: /^Chris$/ }) });
const badges = await gChris.locator('.badge').allInnerTexts();
ok(badges.filter((x) => x === 'Geschafft').length === 4 && badges.filter((x) => x === 'Offen').length === 1, `Chris: 4 made, the −5 open (${badges.join(', ')})`);
ok((await gChris.innerText()).includes('beste Runde −2 (Ziel −5)'), 'Chris: the score bet shows his best round −2 against −5');
ok(shared.get(code).game.players.find((p) => p.name === 'Chris')?.joined, 'the server knows Chris joined');

// ---------- Sascha: sees it, decides Erik's free bet, the settlement ----------
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.list-item').filter({ hasText: 'USA 2026' }).click();
await H.waitForTimeout(2000);
const hChris = H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Chris$/ }) });
ok((await hChris.locator('.badge').allInnerTexts()).filter((x) => x === 'Geschafft').length === 4, "Sascha sees Chris's 4 bets made");
await H.locator('.pool-wager').filter({ hasText: 'Längster Drive an Loch 7' }).click();
await H.getByRole('group', { name: 'Entschieden' }).getByRole('button', { name: 'Geschafft' }).click();
await H.waitForTimeout(1200);
const settle = (await H.locator('.card').filter({ hasText: 'Abrechnung' }).innerText()).replace(/\s+/g, ' ');
// Chris 4 × 20 € from each of three = +240; Erik's free bet +60; Sascha and Cedric −100, Erik −20, Chris +220
ok(/Sascha → Chris 100 €/.test(settle) && /Cedric → Chris 100 €/.test(settle) && /Erik → Chris 20 €/.test(settle), `settlement: ${settle.slice(0, 140)}`);
ok(/5 von 6 Wetten entschieden/.test(settle), '5 of 6 bets decided (the −5 still open)');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-pool.png', fullPage: true });

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
