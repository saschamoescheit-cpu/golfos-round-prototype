// QA (Sascha 04.11.2026): a tournament over three rounds – the club championship. "Days one and two by handicap down,
// the final day by result: the worst first, the best in the final flight"; a cut after round 2. Planned in one setup, a
// round each its own event, held together as a series marked multi; the host deals the final once round 2 is played.
// Supabase is simulated, the app is real. Usage: node qa/tourrounds.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};

// ---------- the simulated server: the table of the shared games as supabase/golfos-shared-games.sql ----------
const shared = new Map(); // code → { game, updated_at, owner, members, event_code? }
async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
  // the account asking: the token's sub, as auth.uid()
  const uid = (() => {
    try {
      return JSON.parse(atob((req.headers()['authorization'] ?? '').split(' ')[1].split('.')[1])).sub;
    } catch {
      return null;
    }
  })();
  const body = () => JSON.parse(req.postData() ?? '{}');
  if (u.pathname.endsWith('/golfos_items')) return json(200, []);
  if (u.pathname.endsWith('/functions/v1/golfos-push')) return json(200, { ok: true, sent: 0 });
  if (u.pathname.endsWith('/rpc/golfos_join_game')) {
    const row = shared.get(String(body().join_code ?? '').toUpperCase());
    if (!row || row.event_code) return json(200, null);
    if (row.game.kind === 'tour-series') {
      if (row.game.deletedAt) return json(200, null);
      for (const r of [row, ...row.game.rounds.map((x) => shared.get(x.code)).filter(Boolean)]) if (r.owner !== uid && !r.members.includes(uid)) r.members.push(uid);
      return json(200, row.game);
    }
    if (row.game.kind === 'round-event' && row.owner !== uid && !row.members.includes(uid)) {
      if (row.game.planned !== true) return json(200, { kind: 'ask-host' });
      if (row.game.deletedAt) return json(200, null);
    }
    if (row.owner !== uid && !row.members.includes(uid)) row.members.push(uid);
    return json(200, row.game);
  }
  if (!u.pathname.endsWith('/golfos_shared_games')) return json(404, { message: 'not simulated' });
  const p = (k) => (u.searchParams.get(k) ?? '').replace(/^(eq|is)\./, '');
  const inRow = (r) => !!r && (r.owner === uid || r.members.includes(uid));
  const inEvent = (code) => inRow(shared.get(code));
  const mine = (code) => {
    const r = shared.get(code);
    return !!r && (r.event_code ? inEvent(r.event_code) : inRow(r));
  };
  if (req.method() === 'GET') {
    if (u.searchParams.has('event_code') && p('event_code') !== 'null')
      return json(200, inEvent(p('event_code')) ? [...shared.values()].filter((r) => r.event_code === p('event_code')).map((r) => ({ game: r.game, updated_at: r.updated_at })) : []);
    if (u.searchParams.has('code')) {
      const r = shared.get(p('code'));
      return json(200, mine(p('code')) ? [{ game: r.game, updated_at: r.updated_at, owner: r.owner }] : []);
    }
    // the account's rows of a kind (the pools, the planned tournaments): host or member, not a flight's row
    const kind = p('game->>kind');
    const planned = u.searchParams.has('game->>planned');
    return json(
      200,
      [...shared.entries()]
        .filter(([, r]) => !r.event_code && inRow(r) && r.game.kind === kind && (!planned || r.game.planned === true))
        .map(([code, r]) => ({ code, game: r.game, owner: r.owner })),
    );
  }
  if (req.method() === 'POST') {
    const r = body();
    if (shared.has(r.code)) return json(409, { code: '23505' });
    if (r.event_code && !inEvent(r.event_code)) return json(403, { message: 'not in the event' });
    shared.set(r.code, { game: r.game, updated_at: new Date().toISOString(), owner: uid, members: [], ...(r.event_code ? { event_code: r.event_code } : {}) });
    return json(201, (req.headers()['prefer'] ?? '').includes('representation') ? [{ code: r.code }] : null);
  }
  if (req.method() === 'PATCH') {
    const code = p('code');
    const r = shared.get(code);
    const at = p('updated_at');
    if (!mine(code) || (at && at !== r.updated_at)) return json(200, []);
    const nb = body();
    r.game = nb.game;
    r.updated_at = nb.updated_at;
    return json(200, [{ code }]);
  }
  return json(404, { message: 'not simulated' });
}
async function phone(name) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/golfos_(?:items|friend_\w+).*access control|(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate((name) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '0', homeClub: '' }));
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: `h.${btoa(JSON.stringify({ sub: 'u-' + name }))}.s`, refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    sessionStorage.setItem('golfos.module', 'tournaments'); // a module of its own since 03.11.2026
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const flightsOf = (code) => [...shared.entries()].filter(([, r]) => r.event_code === code).map(([c, r]) => ({ code: c, ...r.game.flight }));

// ---------- Sascha plans the club championship: three rounds, a cut after two, the final by result ----------
const host = await phone('Sascha');
const H = host.p;
await H.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await H.waitForTimeout(500);
await H.fill('#tour-name', 'Clubmeisterschaft');
await H.getByRole('button', { name: /Platz wählen/ }).first().click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('#tour-name').waitFor({ timeout: 30000 });
const setting = (label) => H.locator('.settings-row').filter({ hasText: new RegExp(`^${label}`) });
const choose = async (label, option) => {
  await setting(label).first().click();
  await H.locator('.sheet .pick-option').filter({ hasText: option }).first().click();
  await H.waitForTimeout(200);
};
await choose('Wertung', /^Brutto/);
for (const [n, h] of [['Chris', '12,4'], ['Erik', '4'], ['Cedric', '20'], ['Dave', '8']]) {
  await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill(n);
  await H.locator('input[id^="hcp-"]').last().fill(h);
}
await H.locator('input[id^="hcp-"]').first().fill('7');
// a number of one's own (Sascha 04.11.2026): "Andere Anzahl …" typed – 8 rounds; then 3
await choose('Runden', /^Andere Anzahl/);
await H.getByRole('textbox', { name: 'Die Anzahl der Runden' }).fill('8');
await H.getByRole('button', { name: 'Übernehmen' }).click();
ok(/8 Runden/.test(await setting('Runden').innerText()) && (await H.getByRole('group', { name: 'Die Runden' }).locator('.settings-row').count()) === 8, 'rounds: "Andere Anzahl" – 8 rounds typed, a row each');
await choose('Runden', /^3 Runden/);
const roundRows = H.getByRole('group', { name: 'Die Runden' }).locator('.settings-row');
ok((await roundRows.count()) === 3 && /Golfclub Hetzenhof/.test(await roundRows.nth(2).innerText()), `3 rounds: a row each with its day and course (${(await roundRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`);
// the last round by result, the others as the first
const flightRows = H.getByRole('group', { name: 'Flights der Runden' }).locator('.settings-row');
ok(/Nach HCP absteigend/.test(await flightRows.nth(1).innerText()) && /Nach Ergebnis/.test(await flightRows.nth(2).innerText()), `the flights of the rounds: round 3 by result (${(await flightRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`);
// the cut after round 2: the best 4 play on
await choose('Cut', 'Nach Runde 2');
await choose('Es spielen weiter', 'Die besten 4');
ok(/Nach Runde 2/.test(await setting('Cut').innerText()) && /Die besten 4/.test(await setting('Es spielen weiter').innerText()), 'the cut: after round 2, the best 4');
// round 3's page: its course, day and flights – by result in twos
await flightRows.nth(2).click();
await H.waitForTimeout(300);
ok((await H.locator('.topbar h1').innerText()).includes('Runde 3') && (await H.getByText(/Vorläufig nach HCP/).count()) === 1, 'round 3: its own page – flights provisional by handicap until the rounds before are played');
await setting('Einteilung').click();
ok((await H.locator('.sheet .pick-option strong').allInnerTexts()).includes('Nach Ergebnis'), 'round 3 offers "Nach Ergebnis"');
await H.getByRole('button', { name: 'Schließen' }).last().click();
await choose('Spieler je Flight', '2 Spieler');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/rounds-r3.png', fullPage: true });
await H.getByRole('button', { name: 'Fertig' }).click();
await H.waitForTimeout(300);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/rounds-setup.png', fullPage: true });
await H.getByRole('button', { name: 'Turnier anlegen' }).click();
await H.waitForTimeout(4000);
const scode = [...shared.entries()].find(([, r]) => r.game.kind === 'tour-series')?.[0];
const srow = scode && shared.get(scode).game;
const rcodes = srow?.rounds.map((r) => r.code) ?? [];
const evOf = (c) => shared.get(c)?.game;
ok(!!srow && srow.name === 'Clubmeisterschaft' && srow.multi?.cut?.after === 2 && srow.multi.cut.top === 4 && rcodes.length === 3, `server: one tournament over 3 rounds, the cut after 2 (${scode}, ${JSON.stringify(srow?.multi)})`);
ok(rcodes.every((c, k) => evOf(c).name === `Clubmeisterschaft · Runde ${k + 1}` && evOf(c).series?.code === scode && evOf(c).format.allowance === 0) && evOf(rcodes[2]).draw?.mode === 'result', 'server: each round its event, named and linked, gross without handicap, round 3 by result');
ok((await H.locator('.topbar h1').innerText()).includes('Clubmeisterschaft') && /Turnier · 3 Runden · Cut nach Runde 2: die besten 4/.test(await H.locator('main .muted.small').first().innerText()), 'the page: the tournament with its rounds and the cut');
const deal = H.getByRole('region', { name: 'Flights der Runde 3' });
ok((await deal.getByRole('button', { name: 'Flights nach Ergebnis einteilen' }).isDisabled()) && /sobald Runde 2 gespielt ist/.test(await deal.innerText()), 'round 3: "Flights nach Ergebnis einteilen" – once round 2 is played');
// in the list with the tournaments, "3 Runden"
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(800);
ok((await H.locator('.tour-cat[aria-label="Einzelne Turniere"] .tour-series-row').filter({ hasText: '3 Runden' }).count()) === 1 && (await H.locator('.tour-cat[aria-label="Turnierserien"]').count()) === 0, 'the list: with the tournaments – "3 Runden", no series');

// ---------- rounds 1 and 2 played: Erik best, then Sascha, Chris, Dave – Cedric misses the cut ----------
const over = { Erik: 0, Sascha: 1, Chris: 2, Dave: 3, Cedric: 6 }; // strokes over Erik's in each round
const fill = (code) => {
  for (const [c, r] of shared.entries()) {
    if (r.event_code !== code) continue;
    const f = r.game.flight;
    const n = evOf(code).holes.length;
    f.scores = Object.fromEntries(f.players.map((p) => [p.id, Array.from({ length: n }, (_, i) => ({ s: 4 + (i < over[p.name] ? 1 : 0) }))]));
    r.updated_at = new Date().toISOString();
    void c;
  }
};
fill(rcodes[0]);
fill(rcodes[1]);
await H.locator('.tour-series-row').filter({ hasText: '3 Runden' }).click();
await H.waitForTimeout(3000);
{
  const rows = (await H.locator('[aria-label="Gesamtwertung"] .lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  ok(/Erik/.test(rows[0]) && /CUT/.test(rows[4]) && /Cedric/.test(rows[4]) && (await H.locator('[aria-label="Gesamtwertung"] li.lb-cut').count()) === 1 && /Cut nach Runde 2 verpasst/.test(await H.locator('[aria-label="Gesamtwertung"]').innerText()), `the total: Erik first, Cedric below the cut line (${rows.join(' | ')})`);
}
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/rounds-page.png', fullPage: true });
await deal.getByRole('button', { name: 'Flights nach Ergebnis einteilen' }).click();
await H.waitForTimeout(3000);
{
  const fs3 = flightsOf(rcodes[2]).filter((f) => f.players.length).sort((a, b) => a.teeTime.localeCompare(b.teeTime));
  const who = fs3.map((f) => f.players.map((p) => p.name).sort().join(','));
  ok(who.join(' | ') === 'Chris,Dave | Erik,Sascha' && !who.join().includes('Cedric'), `round 3 dealt by result: the worst first, the best in the last flight, Cedric out (${who.join(' | ')})`);
  ok(!!evOf(rcodes[2]).draw?.dealtAt && /nach Ergebnis eingeteilt/.test(await deal.innerText()), 'round 3: dealt – said so');
}
// the whole tournament changed: the pencil opens all three rounds, round 3 as dealt
await H.getByRole('button', { name: 'Turnier bearbeiten' }).click();
await H.waitForTimeout(800);
ok((await H.getByRole('group', { name: 'Die Runden' }).locator('.settings-row').count()) === 3 && /Nach Runde 2/.test(await setting('Cut').innerText()), 'changed: the three rounds and the cut');
await H.getByRole('group', { name: 'Flights der Runden' }).locator('.settings-row').nth(2).click();
await H.waitForTimeout(300);
ok((await H.locator('.tour-unplaced').count()) === 0 && (await H.locator('.tour-flight-player').count()) === 4, 'round 3 in the change: its four players, Cedric not missing a flight');
await H.getByRole('button', { name: 'Fertig' }).click();
await H.getByRole('button', { name: 'Speichern' }).click();
await H.waitForTimeout(4000);
ok(shared.get(scode).game.rounds.map((r) => r.code).join() === rcodes.join() && flightsOf(rcodes[2]).filter((f) => f.players.length).length === 2, 'saved: the same three rounds, round 3 still dealt');

// one level back (Sascha 06.11.2026: "a round of the series opened and back – it jumps right to the front instead of
// one level back"): the series → its round 2 → "Zurück" → the series again, then the list
{
  const title = async () => (await H.locator('.topbar h1').innerText()).replace(/\s+/g, ' ');
  await H.locator('li .list-item').filter({ hasText: 'Runde 2' }).first().click();
  await H.waitForTimeout(1500);
  const onRound = await title();
  const back = H.locator('.topbar').getByRole('button').first();
  const label = (await back.getAttribute('aria-label')) ?? (await back.innerText());
  await back.click();
  await H.waitForTimeout(1500);
  const again = await title();
  ok(/Runde 2/.test(onRound) && /Serie/.test(label) && again.includes('Clubmeisterschaft') && !/Runde 2/.test(again) && (await H.locator('li .list-item').filter({ hasText: 'Runde 2' }).count()) === 1, `round 2 opened from the series, "Zurück" (${label}): the series again (${onRound} → ${again})`);
  await H.locator('.topbar').getByRole('button').first().click();
  await H.waitForTimeout(1200);
  ok((await H.locator('.tour-series-row').filter({ hasText: '3 Runden' }).count()) === 1, 'and once more "Zurück": the list of the tournaments');
}

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
