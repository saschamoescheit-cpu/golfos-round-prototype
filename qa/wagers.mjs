// QA (Sascha 01.11.2026: "in America we have bets running – Chris 3 birdies in a row, 12 pars in a row, 5 birdies on
// 18, 16 greens, −5 …; individual bets in Games, everything adjustable, invite people, and the flight counts each other
// as in a real tournament"): two phones. Sascha sets up a pool of bets with four players, adds Chris's five bets with
// five bets from his library (−5 for the score), a free bet for Erik and Chris's −5 for Cedric as a template, and invites. Chris joins with the link, picks
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
const pushes = []; // the calls to the push function: { phone, body }
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
    // every pool of the account (the row rule of the real table: host or member – here simply all pools)
    const kind = (u.searchParams.get('game->>kind') ?? '').replace(/^eq\./, '');
    if (req.method() === 'GET' && !code && kind) return json(200, [...shared.entries()].filter(([, v]) => v.game.kind === kind).map(([c, v]) => ({ code: c, game: v.game })));
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
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/functions\/v1\/golfos-push/, (route) => {
    pushes.push({ phone: name, body: JSON.parse(route.request().postData() ?? '{}') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":1}' });
  });
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
    // a token whose account (sub) the app reads to find its own player in a pool on a new phone
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: `h.${btoa(JSON.stringify({ sub: 'u-' + name }))}.s`, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
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
// Sascha 01.11.2026: the bets a menu of their own – on the start page "start a game" and "start a bet"
ok((await H.locator('.tabbar button').allInnerTexts()).join('|') === 'Spielen|Spiele|Wetten|Bilanz|Profil', 'the menu has "Wetten"');
ok((await H.getByText('Neues Spiel starten').isVisible()) && (await H.getByText('Neue Wette starten').isVisible()), 'start page: "Neues Spiel starten" and "Neue Wette starten"');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-start.png' });
// ---------- Sascha: a pool of bets, four players ----------
await H.getByRole('button', { name: 'Neuer Wett-Pool' }).click();
await H.fill('#pool-name', 'USA 2026');
await H.getByRole('textbox', { name: 'Spieler 2' }).fill('Chris');
// laid out as "Neues Spiel": a card per player, "+ Spieler hinzufügen"
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.getByRole('textbox', { name: 'Spieler 3' }).fill('Erik');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.getByRole('textbox', { name: 'Spieler 4' }).fill('Cedric');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-setup.png', fullPage: true });
await H.getByRole('button', { name: 'Pool anlegen' }).click();
await H.waitForTimeout(1200);
ok((await H.locator('.pool-player').count()) === 4 && (await H.locator('.topbar h1').innerText()).includes('USA 2026'), 'pool set up: USA 2026 with 4 players');
const code = [...shared.keys()][0];
ok(/^[A-Z0-9]{6}$/.test(code ?? '') && shared.get(code).game.kind === 'wager-pool', `the pool on the server, code ${code}`);

// Chris's bets from his library (Sascha 01.11.2026: "per person a library to pick single bets from"): five of them,
// the score −5
await H.getByRole('button', { name: 'Wetten für Chris hinzufügen' }).click();
const lib = H.getByRole('dialog', { name: 'Wetten-Bibliothek' });
ok((await lib.getByRole('group', { name: 'Auswählen aus' }).count()) === 0, 'library: no "set up before" while there are no bets yet');
ok((await lib.locator('.lib-row').count()) >= 20, `library: ${await lib.locator('.lib-row').count()} bets to pick from`);
for (const name of [/^Birdies in Folge/, /^Pars in Folge/, /^Birdies Birdie oder besser/, /^Grüns getroffen/, /^Brutto zu Par/]) await lib.getByRole('button', { name }).click();
const minus = lib.getByRole('group', { name: 'Brutto zu Par' }).getByRole('button', { name: /minus eins/ });
for (let k = 0; k < 15; k++) await minus.click(); // +10 → −5
if (process.env.SHOTS) await lib.screenshot({ path: process.env.SHOTS + '/wagers-library.png' });
await lib.getByRole('button', { name: '5 Wetten für Chris anlegen' }).click();
await H.waitForTimeout(1000);
const chrisCard = H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Chris$/ }) });
const rows = await chrisCard.locator('.pool-wager .title').allInnerTexts();
ok(rows.length === 5 && rows.includes('2 Birdies in Folge') && rows.includes('9 Grüns auf 18') && rows.includes('−5 brutto'), `Chris's five bets: ${rows.join(' · ')}`);
ok((await chrisCard.locator('.pool-wager').first().innerText()).includes('20 € · nur bei Erfolg · mit Zähler'), 'the rules in the row: 20 €, paid when made, with marker');

// a free bet for Erik – from his library
await H.getByRole('button', { name: 'Wetten für Erik hinzufügen' }).click();
const libE = H.getByRole('dialog', { name: 'Wetten-Bibliothek' });
await libE.getByRole('button', { name: /^Freie Wette/ }).click();
await libE.getByRole('textbox', { name: 'Die Wette in Worten' }).fill('Längster Drive an Loch 7');
await libE.getByRole('button', { name: '1 Wette für Erik anlegen' }).click();
await H.waitForTimeout(1000);
ok((await H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Erik$/ }) }).innerText()).includes('Längster Drive an Loch 7'), "Erik's free bet in the pool");

// bets set up before as templates ("once I have set up bets, pick from those"): Chris's −5 for Cedric
await H.getByRole('button', { name: 'Wetten für Cedric hinzufügen' }).click();
const libC = H.getByRole('dialog', { name: 'Wetten-Bibliothek' });
await libC.getByRole('group', { name: 'Auswählen aus' }).getByRole('button', { name: 'Schon angelegt' }).click();
const groups = await libC.locator('.lib-from').allInnerTexts();
ok(groups.includes('USA 2026 · Chris') && groups.includes('USA 2026 · Erik'), `"set up before": ${groups.join(' · ')}`);
if (process.env.SHOTS) await libC.screenshot({ path: process.env.SHOTS + '/wagers-earlier.png' });
await libC.locator('.lib-group').filter({ hasText: 'USA 2026 · Chris' }).getByRole('button', { name: /^−5 brutto/ }).click();
await libC.getByRole('button', { name: '1 Wette für Cedric anlegen' }).click();
await H.waitForTimeout(1000);
const cedric = await H.locator('.pool-player').filter({ has: H.locator('h2', { hasText: /^Cedric$/ }) }).locator('.pool-wager .title').allInnerTexts();
ok(cedric.length === 1 && cedric[0] === '−5 brutto', `Cedric took Chris's −5 as a template: ${cedric.join(' · ')}`);
ok(shared.get(code).game.wagers.length === 7, `the server has the 7 bets (${shared.get(code).game.wagers.length})`);

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
// a push to everyone in the pool for each bet made (Sascha 01.11.2026) – asked of the push function by Chris's phone
const chrisBets = pushes.filter((x) => x.phone === 'Chris' && x.body.action === 'bet' && x.body.code === code).map((x) => x.body.wager);
const madeIds = shared.get(code).game.wagers.filter((w) => shared.get(code).game.progress[w.id]?.done).map((w) => w.id);
ok(chrisBets.length === 4 && madeIds.length === 4 && madeIds.every((id) => chrisBets.includes(id)), `push: Chris's phone told of his 4 bets made (${chrisBets.length})`);

// ---------- Sascha: sees it, decides Erik's free bet, the settlement ----------
await H.reload();
await H.waitForTimeout(1500);
ok((await H.locator('.list-item').filter({ hasText: '1 Wett-Pool läuft' }).count()) === 1 && (await H.locator('.list-item').filter({ hasText: 'USA 2026' }).count()) === 0, 'start page: only "1 Wett-Pool läuft" – the pool itself in the menu "Wetten"');
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.waitForTimeout(500);
ok((await H.getByRole('heading', { name: 'Wetten' }).isVisible()) && (await H.getByRole('button', { name: 'Wett-Pool beitreten' }).isVisible()), 'menu "Wetten": new pool, join a pool, the pools');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-tab.png' });
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
ok(/5 von 7 Wetten entschieden/.test(settle), "5 of 7 bets decided (Chris's and Cedric's −5 still open)");

// Sascha 01.11.2026: "the bets must never vanish" – the phone's list emptied (Safari clears a web app's storage after a
// week unused; a new phone has none): the menu "Wetten" fetches the pool from the server, Sascha is himself again
await H.evaluate(() => localStorage.removeItem('golfos.pools.v1'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.waitForTimeout(1500);
ok((await H.locator('.list-item').filter({ hasText: 'USA 2026' }).count()) === 1, 'storage emptied: the pool comes back from the server');
const back = await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.pools.v1') ?? '[]'));
ok(back.length === 1 && back[0].me === shared.get(code).game.players.find((p) => p.name === 'Sascha').id && back[0].pool.wagers.length === 7, 'storage emptied: Sascha found again by his account, all 7 bets there');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-tab-tiles.png' });
const erikFree = shared.get(code).game.wagers.find((w) => w.kind === 'free').id;
ok(pushes.some((x) => x.phone === 'Sascha' && x.body.action === 'bet' && x.body.wager === erikFree), "push: Erik's free bet decided as made – Sascha's phone told of it");

// the push tapped: the app opens the pool – on a phone without it too (another phone of the account): loaded, who are you
await H.goto('about:blank');
await H.goto(url + '#pool=' + code);
await H.waitForTimeout(2500);
ok((await H.locator('.topbar h1').innerText()).includes('USA 2026'), 'push tapped: the pool opens');
const other = await phone('Erik');
await other.p.goto('about:blank');
await other.p.goto(url + '#pool=' + code);
await other.p.waitForTimeout(3000);
ok((await other.p.locator('.topbar h1').innerText()).includes('USA 2026') && (await other.p.getByText('Wer bist du?').isVisible()), 'push tapped on a phone without the pool: loaded – "who are you?"');
await other.p.locator('.chip-set').getByRole('button', { name: 'Erik', exact: true }).click();
await other.p.waitForTimeout(1500);
ok(await other.p.evaluate(() => JSON.parse(localStorage.getItem('golfos.pools.v1'))[0].me !== ''), 'Erik picked himself: this phone reports his bets');
ok(other.errs.length === 0, `third phone: no page errors ${other.errs.slice(0, 2).join(' | ')}`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/wagers-pool.png', fullPage: true });

// deleting a bet asks first – "Behalten" keeps it
await H.goto('about:blank');
await H.goto(url + '#pool=' + code);
await H.waitForTimeout(2500);
await H.locator('.pool-wager').filter({ hasText: 'Längster Drive an Loch 7' }).click();
await H.getByRole('button', { name: 'Wette löschen' }).click();
ok(await H.getByText('„Längster Drive an Loch 7“ löschen – für alle im Pool?').isVisible(), 'delete a bet: asked first');
await H.getByRole('button', { name: 'Behalten' }).click();
await H.getByRole('dialog', { name: 'Wette' }).getByRole('button', { name: 'Schließen' }).click();
ok(shared.get(code).game.wagers.length === 7, '"Behalten": the bet is kept');

// change the pool: rename it, add a player; Chris (joined, bets) cannot be removed, Dave can
await H.goto('about:blank');
await H.goto(url + '#pool=' + code);
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const ed = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await ed.locator('#pool-edit-name').fill('USA 2026 Florida');
await ed.getByRole('button', { name: '+ Spieler' }).click();
await ed.getByRole('textbox', { name: 'Spieler 5' }).fill('Dave');
ok((await ed.getByRole('button', { name: 'Chris entfernen' }).count()) === 0, 'edit: Chris (joined, with bets) cannot be removed');
await ed.getByRole('button', { name: 'Speichern' }).click();
await H.waitForTimeout(1200);
const after = shared.get(code).game;
ok(after.name === 'USA 2026 Florida' && after.players.map((p) => p.name).join(',') === 'Sascha,Chris,Erik,Cedric,Dave' && after.wagers.length === 7, `edit: renamed, Dave added, the bets kept (${after.players.map((p) => p.name).join(', ')})`);
// delete the pool – for everyone: gone from the menu here, on Chris's phone it says so
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
await H.getByRole('dialog', { name: 'Pool bearbeiten' }).getByRole('button', { name: 'Pool löschen' }).click();
await H.getByRole('button', { name: 'Für alle löschen' }).click();
await H.waitForTimeout(1200);
ok(!!shared.get(code).game.deletedAt && (await H.getByRole('heading', { name: 'Wetten' }).isVisible()) && (await H.locator('.list-item').filter({ hasText: 'USA 2026' }).count()) === 0, 'delete: marked deleted for everyone, gone from the menu');
await G.goto('about:blank');
await G.goto(url + '#pool=' + code);
await G.waitForTimeout(3000);
ok(await G.getByText(/Dieser Wett-Pool wurde gelöscht/).isVisible(), "Chris's phone: the pool was deleted – its bets kept");
// restored from the bin of the menu "Wetten": back for everyone, with all bets
await H.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await H.getByRole('button', { name: 'Wiederherstellen' }).click();
await H.waitForTimeout(1500);
ok(!shared.get(code).game.deletedAt && shared.get(code).game.wagers.length === 7, 'restored from the bin: back for everyone, all 7 bets');
await H.locator('.tile').filter({ hasText: 'laufend' }).click();
ok((await H.locator('.list-item').filter({ hasText: 'USA 2026 Florida' }).count()) === 1, 'restored: in the list again');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
