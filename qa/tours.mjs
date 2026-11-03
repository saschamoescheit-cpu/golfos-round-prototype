// QA (Sascha 01.11.2026): tournaments planned in Games, played in Rounds. "I could set up the tournaments for the USA
// now, put the flights together and choose the markers, and send the invitations – in the USA everyone has it ready";
// "for the flights the tee times, with the usual choice of times"; only the host changes it; the live leaderboard.
// Sascha plans "USA Tag 1" on a course: four players, two flights created with their tee times to the minute (12:08, 12:16), the players assigned, markers in
// pairs; the server gets the event and a row per flight. Chris (in by the code) sees it, cannot change it. The flights'
// scores come in (as Rounds writes them) – the leaderboard on the tournament's page. Changed by the host: the flights
// keep their ids. Deleted – only marked – and restored. Supabase is simulated, the app is real.
// Usage: node qa/tours.mjs [url]
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

// ---------- Sascha plans the tournament ----------
const host = await phone('Sascha');
const H = host.p;
// Tournaments a module of their own, below Games & Bets (Sascha 03.11.2026)
ok((await H.locator('.tabbar button').allInnerTexts()).join('|') === 'Planen|Turniere|Profil' && (await H.locator('.module-tag').textContent()) === 'Tournaments', `the module Tournaments: ${(await H.locator('.tabbar button').allInnerTexts()).join(' · ')}`);
ok(await H.getByText('Neues Turnier planen').isVisible() && (await H.getByRole('button', { name: 'Neue Wette' }).count()) === 0, 'its start page: "Neues Turnier planen", no bets');
await H.locator('.module-switch').click();
const cards = (await H.locator('.module-card strong').allInnerTexts()).join('|');
ok(cards === 'Rounds|Games & Bets|Tournaments|Training|Agility', `the start page: ${cards}`);
await H.locator('.module-card').filter({ hasText: 'Games & Bets' }).click();
ok((await H.locator('.tabbar button').allInnerTexts()).join('|') === 'Spielen|Spiele|Wetten|Bilanz|Profil' && (await H.getByText('Neues Turnier planen').count()) === 0, 'Games & Bets: no tournaments any more');
await H.locator('.module-switch').click();
await H.locator('.module-card').filter({ hasText: 'Tournaments' }).click();
await H.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await H.waitForTimeout(500);
// a required field not filled yet in green, as "Platz wählen" (Sascha 03.11.2026): the name, the course, a player's name
{
  const green = await H.evaluate(() => { const s = document.createElement('span'); s.className = 'good-text'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
  // WebKit gives no computed style of a placeholder: the field required, and the sheet's rule for it green
  const ph = await H.locator('#tour-name').evaluate((e) => [e.required, [...document.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r.selectorText === '.input:required::placeholder')?.style.color]);
  ph[1] = await H.evaluate((c) => { const s = document.createElement('span'); s.style.color = c; document.body.append(s); const v = getComputedStyle(s).color; s.remove(); return v; }, ph[1] ?? 'x');
  const course = await H.locator('.settings-row').filter({ hasText: 'Platz wählen' }).locator('.settings-value').evaluate((e) => getComputedStyle(e).color);
  const names = await H.locator('.player-row input[required]').count();
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-new.png', fullPage: true });
  ok(ph[0] && ph[1] === green && course === green && names >= 1, `required in green: the name (${ph[1]}), the course (${course}), ${names} player names – ${green}`);
}
await H.fill('#tour-name', 'USA Tag 1');
await H.getByRole('button', { name: /Platz wählen/ }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('#tour-name').waitFor({ timeout: 30000 });
ok((await H.locator('#tour-name').inputValue()) === 'USA Tag 1', 'back from the course: the name kept');
// net classes (Sascha 03.11.2026): the last class up to 54, and "Eigene" – two to four classes with their limits
{
  await H.locator('.settings-row').filter({ hasText: 'Wertung' }).first().click();
  await H.getByRole('dialog', { name: 'Wertung wählen' }).getByRole('button', { name: /^Netto/ }).click();
  const row = H.locator('.settings-row').filter({ hasText: 'Netto-Klassen' });
  const cs = H.getByRole('dialog', { name: 'Netto-Klassen' });
  await row.click();
  ok((await cs.getByText('2 Klassen · A bis 18 · B bis 54').count()) === 1, 'classes: 2 – "B bis 54"');
  await cs.getByRole('button', { name: /^3 Klassen/ }).click();
  ok(/3 Klassen/.test(await row.innerText()) && (await H.getByText('A bis 12 · B bis 24 · C bis 54', { exact: true }).count()) === 1, `classes: 3 – "A bis 12 · B bis 24 · C bis 54" (${(await row.innerText()).replace(/\s+/g, ' ')})`);
  await row.click();
  // "Eigene" as rows (Sascha 03.11.2026): a row per class, its limit from a list, "+ Klasse", the last up to 54
  await cs.getByRole('button', { name: /^Eigene/ }).click();
  const ownRows = H.getByRole('dialog', { name: 'Netto-Klassen' }).getByRole('group', { name: 'Die Klassen' }).locator('.settings-row');
  ok(JSON.stringify((await ownRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim())) === '["Klasse A bis 9","Klasse B bis 18","Klasse C bis 26","Klasse D bis 54"]', `classes: own – a row per class (${(await ownRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-classes.png' });
  await ownRows.nth(1).click();
  const lim = H.getByRole('dialog', { name: 'Klasse B bis' });
  ok((await lim.locator('.pick-option').first().innerText()).trim() === 'bis 10' && (await lim.locator('.pick-option').last().innerText()).trim() === 'bis 25', 'classes: B between A and C – 10 to 25');
  await lim.getByRole('button', { name: 'Klasse B entfernen' }).click();
  ok((await ownRows.count()) === 3 && (await cs.getByRole('button', { name: '+ Klasse' }).count()) === 1, 'classes: B removed – three classes, "+ Klasse" again');
  await cs.getByRole('button', { name: '+ Klasse' }).click();
  await ownRows.nth(1).click();
  await H.getByRole('dialog', { name: 'Klasse B bis' }).getByRole('button', { name: 'bis 18', exact: true }).click();
  await ownRows.nth(2).click();
  await H.getByRole('dialog', { name: 'Klasse C bis' }).getByRole('button', { name: 'bis 26', exact: true }).click();
  await cs.getByRole('button', { name: '4 Klassen übernehmen' }).click();
  ok(/4 Klassen/.test(await row.innerText()) && (await H.getByText('A bis 9 · B bis 18 · C bis 26 · D bis 54', { exact: true }).count()) === 1, `classes: own taken – ${await row.innerText()}`);
  // more than four (Sascha 03.11.2026: "freely configurable"): "+ Klasse" up to ten, A to J – not taken
  await row.click();
  // each new class a step on, its limit then chosen: D 30, E 34 … I 50, J up to 54
  for (let i = 3; i < 9; i++) {
    await cs.getByRole('button', { name: '+ Klasse' }).click();
    await ownRows.nth(i).click();
    await H.getByRole('dialog', { name: `Klasse ${'ABCDEFGHIJ'[i]} bis` }).getByRole('button', { name: `bis ${26 + 4 * (i - 2)}`, exact: true }).click();
  }
  const ten = (await ownRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim());
  ok(ten.length === 10 && ten[9] === 'Klasse J bis 54' && (await cs.getByRole('button', { name: '+ Klasse' }).count()) === 0 && (await cs.getByRole('button', { name: '10 Klassen übernehmen' }).count()) === 1, `classes: up to ten – ${ten.join(' | ')}`);
  await cs.getByRole('button', { name: 'Schließen' }).click();
  // back to brutto for the rest of the test
  await H.locator('.settings-row').filter({ hasText: 'Wertung' }).first().click();
  await H.getByRole('dialog', { name: 'Wertung wählen' }).getByRole('button', { name: /^Brutto/ }).click();
}
for (const n of ['Chris', 'Erik', 'Cedric']) {
  await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill(n);
  await H.locator('input[id^="hcp-"]').last().fill('0');
}
await H.locator('input[id^="hcp-"]').first().fill('0');
if (process.env.SHOTS) { await H.locator('.tour-unplaced').scrollIntoViewIfNeeded(); await H.screenshot({ path: process.env.SHOTS + '/tours-unplaced.png' }); }
const fl = (k) => H.locator('.tour-flight:not(.tour-unplaced)').nth(k);
const names = async (k) => (await fl(k).locator('.tour-flight-player strong').allInnerTexts()).join(',');
const sheet = H.getByRole('dialog', { name: /^Flight \d$/ });
// the tee time: a row, its sheet in the look of GolfOS – hours and minutes to tap (Sascha 03.11.2026)
const teeShown = () => sheet.locator('.settings-row').filter({ hasText: 'Startzeit' }).locator('.settings-value').innerText();
const setTee = async (hhmm) => {
  const [hh, mm] = hhmm.split(':');
  await sheet.locator('.settings-row').filter({ hasText: 'Startzeit' }).click();
  const t = H.getByRole('dialog', { name: 'Startzeit' });
  await t.getByRole('group', { name: 'Stunde' }).getByRole('button', { name: hh, exact: true }).click();
  await t.getByRole('group', { name: 'Minute' }).getByRole('button', { name: mm, exact: true }).click();
  await t.getByRole('button', { name: 'Fertig' }).click();
};
const offered = async () => (await sheet.getByRole('group', { name: 'Spieler des Flights' }).getByRole('button').allInnerTexts()).join(',');
const pressed = async () => (await sheet.getByRole('group', { name: 'Spieler des Flights' }).locator('[aria-pressed="true"]').allInnerTexts()).join(',');
// a fifth player
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Dave');
// Sascha 02.11.2026: "create a flight with its tee time, then assign people to it; flight 2 or 3 only offers those not
// in a flight yet; easy to change afterwards; show who marks whom – as on the tournament's page"
ok((await H.locator('.tour-flight:not(.tour-unplaced)').count()) === 0 && (await H.locator('.tour-unplaced .tour-chip').allInnerTexts()).join(',') === 'Sascha,Chris,Erik,Cedric,Dave', 'no flight yet: all five "Noch ohne Flight"');
await H.getByRole('button', { name: '+ Flight' }).click();
ok((await teeShown()) === '09:00' && (await sheet.getByRole('button', { name: 'Flight anlegen' }).isDisabled()), 'flight 1: its tee time (09:00), then its players – none chosen yet');
await setTee('12:08');
for (const n of ['Sascha', 'Chris', 'Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
ok((await sheet.getByRole('button', { name: 'Dave', exact: true }).isDisabled()) && (await sheet.getByText('Voll – vier Spieler.').isVisible()), 'four chosen: Dave cannot be added – a flight has at most four');
for (const n of ['Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
await sheet.getByRole('button', { name: 'Flight anlegen' }).click();
const f1 = (await fl(0).innerText()).replace(/\s+/g, ' ');
ok((await names(0)) === 'Sascha,Chris' && (await fl(0).locator('.tour-tee').innerText()) === '12:08', `flight 1: Sascha and Chris at 12:08 (${f1})`);
ok(/Sascha · Zähler: Chris/.test(f1) && /Chris · Zähler: Sascha/.test(f1), 'who marks whom shown – set by the app, as on the tournament page');
await H.getByRole('button', { name: '+ Flight' }).click();
ok((await offered()) === 'Erik,Cedric,Dave' && (await teeShown()) === '12:18', `flight 2: only those not in a flight yet (${await offered()}); its time 10 minutes on, to the minute`);
await setTee('12:16');
for (const n of ['Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
await sheet.getByRole('button', { name: 'Flight anlegen' }).click();
ok((await names(1)) === 'Erik,Cedric' && (await fl(1).locator('.tour-tee').innerText()) === '12:16' && (await H.locator('.tour-unplaced').innerText()).includes('Dave'), 'flight 2: Erik and Cedric at 12:16 – Dave still without a flight');
ok(await H.getByText('Noch ohne Flight').first().isVisible(), 'Dave: "Noch ohne Flight"');
await H.getByRole('button', { name: 'Dave entfernen' }).click();
ok((await H.locator('.tour-unplaced').count()) === 0 && (await H.getByRole('button', { name: '+ Flight' }).isDisabled()), 'Dave taken out: everyone in a flight – "+ Flight" has nobody left to offer');
// changed afterwards: Cedric out of flight 2, into flight 1 – and back
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
ok((await pressed()) === 'Erik,Cedric' && (await teeShown()) === '12:16', 'flight 2 opened again: its players and its time');
await sheet.getByRole('button', { name: 'Cedric', exact: true }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
ok((await names(1)) === 'Erik' && (await H.getByText('Jeder Flight braucht mindestens zwei Spieler').isVisible()) && (await H.locator('.tour-unplaced').innerText()).includes('Cedric'), 'Cedric out of flight 2: Erik alone – told, no tournament like this');
await H.getByRole('button', { name: 'Flight 1 ändern' }).click();
ok((await offered()) === 'Sascha,Chris,Cedric', `flight 1 opened: its players and Cedric, who is in none (${await offered()})`);
await sheet.getByRole('button', { name: 'Cedric', exact: true }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
const f1b = (await fl(0).innerText()).replace(/\s+/g, ' ');
ok((await names(0)) === 'Sascha,Chris,Cedric' && (f1b.match(/Zähler: /g) ?? []).length === 3, `three in flight 1: each has a marker, in a ring (${f1b})`);
await H.getByRole('button', { name: 'Flight 1 ändern' }).click();
await sheet.getByRole('button', { name: 'Cedric', exact: true }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
await sheet.getByRole('button', { name: 'Cedric', exact: true }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'Cedric back in flight 2');
// one for all (Sascha 02.11.2026: "a person enters the score for all"): Cedric keeps flight 2's score – set in the
// tournament's "Score-Erfassung", as a round's, not under a flight's "Ändern" (Sascha 03.11.2026)
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
ok((await sheet.getByText('Wer erfasst die Scores?').count()) === 0, 'the flight sheet: no scorer any more');
await sheet.getByRole('button', { name: 'Schließen' }).click();
const who = H.locator('.settings-row').filter({ hasText: 'Wer erfasst' });
// the three choices of a round (Sascha 03.11.2026: "with a marker missing – as in Rounds"), "Mit Zähler" the default
ok(/Mit Zähler/.test(await who.innerText()) && /Zähler: /.test(await fl(1).innerText()), `Score-Erfassung: "Mit Zähler" by default, the markers shown (${(await who.innerText()).replace(/\s+/g, ' ')})`);
await who.click();
{
  const opts = (await H.getByRole('dialog', { name: 'Wer erfasst' }).locator('.pick-option strong').allInnerTexts()).join('|');
  ok(opts === 'Jeder seinen eigenen|Mit Zähler|Einer für alle', `Score-Erfassung: the choices of Rounds – ${opts}`);
}
await H.getByRole('dialog', { name: 'Wer erfasst' }).getByRole('button', { name: /^Jeder seinen eigenen/ }).click();
ok(!/Zähler: /.test(await fl(0).innerText() + (await fl(1).innerText())) && (await H.getByText('Jeder unterschreibt seine Karte selbst.').count()) === 1, 'everyone his own: no markers in the flights');
await who.click();
await H.getByRole('dialog', { name: 'Wer erfasst' }).getByRole('button', { name: /^Einer für alle/ }).click();
ok(/Erik/.test(await fl(1).locator('.settings-row').filter({ hasText: 'Schreiber' }).innerText()), 'one per flight: the flight\'s first is its scorer, a row "Schreiber"');
await fl(1).locator('.settings-row').filter({ hasText: 'Schreiber' }).click();
await H.getByRole('dialog', { name: 'Schreiber in Flight 2' }).getByRole('button', { name: /^Cedric/ }).click();
const f2 = (await fl(1).innerText()).replace(/\s+/g, ' ');
ok(/Schreiber Cedric/.test(f2) && /Erik · Zähler: Cedric/.test(f2) && /Cedric · Zähler: Erik/.test(f2), `flight 2: Cedric for all – Erik's marker, his own card Erik's (${f2})`);
ok((await H.locator('#tour-first, #tour-gap').count()) === 0 && (await H.getByText('Abstand', { exact: true }).count()) === 0, 'no first tee time, no interval – each flight its own time to the minute');
// drag and drop (Sascha 02.11.2026: "move the players between the flights by drag and drop"): Chris by his grip onto
// flight 2 – Cedric was its scorer, Chris joins; then back, and a full flight takes nobody
const dragTo = async (who, target) => {
  const grip = H.locator('.tour-flight-player').filter({ has: H.locator('strong', { hasText: new RegExp(`^${who}$`) }) }).locator('.tour-grip');
  await grip.scrollIntoViewIfNeeded();
  const a = await grip.boundingBox();
  const b = await target.boundingBox();
  await H.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await H.mouse.down();
  for (let i = 1; i <= 10; i++) await H.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2 - a.x - a.width / 2) * i) / 10, a.y + a.height / 2 + ((b.y + 30 - a.y - a.height / 2) * i) / 10);
  await H.mouse.up();
  await H.waitForTimeout(300);
};
await dragTo('Chris', fl(1));
ok((await names(0)) === 'Sascha' && (await names(1)) === 'Chris,Erik,Cedric', `Chris dragged by his grip onto flight 2 (${await names(0)} | ${await names(1)})`);
await dragTo('Chris', fl(0));
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'and dragged back onto flight 1');
// on the iPhone (Sascha 02.11.2026: "does not work yet"): the whole row held a moment lifts the player; moved at once it
// only scrolls
const holdTo = async (who, target, wait) => {
  const row = H.locator('.tour-flight-player').filter({ has: H.locator('strong', { hasText: new RegExp(`^${who}$`) }) }).locator('strong');
  // the row low on the screen, the flight above in view – away from the edges that scroll the page along
  await row.evaluate((e) => window.scrollBy(0, e.getBoundingClientRect().top - window.innerHeight * 0.68));
  await H.waitForTimeout(200);
  const a = await row.boundingBox();
  const x0 = a.x + 10;
  const y0 = a.y + a.height / 2;
  await H.mouse.move(x0, y0);
  await H.mouse.down();
  await H.waitForTimeout(wait);
  // the target read again once lifted (the drop zone "Noch ohne Flight" may have appeared)
  const b = await target.boundingBox();
  const x1 = b.x + 60;
  const y1 = b.y + 30;
  for (let i = 1; i <= 12; i++) await H.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
  await H.mouse.up();
  await H.waitForTimeout(300);
};
await holdTo('Erik', fl(0), 0);
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'the row moved at once: nothing lifted – a scroll');
await holdTo('Erik', fl(0), 500);
ok((await names(0)) === 'Sascha,Chris,Erik' && (await names(1)) === 'Cedric', `the row held a moment: Erik lifted and dropped on flight 1 (${await names(0)} | ${await names(1)})`);
await holdTo('Erik', fl(1), 500);
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'and held back onto flight 2');
// the finger (Sascha 03.11.2026: "still does not work on the iPhone – in the round's review it does"): real touch
// events, as the iPhone sends them (this WebKit has no touch input to drive – dispatched on the element under the
// finger, as Safari does) – the grip at once, the row after a hold, a move first only scrolls
const touch = (type, x, y) =>
  H.evaluate(
    ([type, x, y]) => {
      const el = document.elementFromPoint(x, y) ?? document.body;
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ identifier: 1, clientX: x, clientY: y, target: el }] });
      // Safari sends a touch's moves and its end to the element it began on
      (type === 'touchstart' ? el : (window.__touchEl ?? el)).dispatchEvent(ev);
      if (type === 'touchstart') window.__touchEl = el;
    },
    [type, x, y],
  );
const touchTo = async (who, target, { grip = false, wait = 0 } = {}) => {
  const row = H.locator('.tour-flight-player').filter({ has: H.locator('strong', { hasText: new RegExp(`^${who}$`) }) });
  const el = grip ? row.locator('.tour-grip') : row.locator('strong');
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await H.waitForTimeout(200);
  const a = await el.boundingBox();
  const x0 = a.x + (grip ? a.width / 2 : 10);
  const y0 = a.y + a.height / 2;
  await touch('touchstart', x0, y0);
  await H.waitForTimeout(wait);
  const b = await target.boundingBox();
  const x1 = b.x + 60;
  const y1 = b.y + 30;
  for (let i = 1; i <= 12; i++) {
    await touch('touchmove', x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
    await H.waitForTimeout(16);
  }
  await touch('touchend', x1, y1);
  await H.waitForTimeout(300);
};
await touchTo('Chris', fl(1), { grip: true });
ok((await names(0)) === 'Sascha' && (await names(1)) === 'Chris,Erik,Cedric', `finger: Chris by his grip onto flight 2 (${await names(0)} | ${await names(1)})`);
await touchTo('Chris', fl(0), { wait: 600 });
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', `finger: Chris's row held, back onto flight 1 (${await names(0)} | ${await names(1)})`);
await touchTo('Erik', fl(0));
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'finger: the row moved at once – a scroll, nobody moved');
// a tap: where to – the sure way beside dragging (Sascha 03.11.2026)
await fl(1).locator('.tour-flight-player strong', { hasText: /^Erik$/ }).click();
const mv = H.getByRole('dialog', { name: 'Erik verschieben' });
ok((await mv.locator('.pick-option').count()) === 3 && /Flight 1 · 12:08/.test(await mv.innerText()), 'tap: the flights and "Noch ohne Flight" offered');
await mv.getByRole('button', { name: /^Flight 1/ }).click();
ok((await names(0)) === 'Sascha,Chris,Erik' && (await names(1)) === 'Cedric', `tap: Erik into flight 1 (${await names(0)} | ${await names(1)})`);
await fl(0).locator('.tour-flight-player strong', { hasText: /^Erik$/ }).click();
await H.getByRole('dialog', { name: 'Erik verschieben' }).getByRole('button', { name: /^Flight 2/ }).click();
ok((await names(0)) === 'Sascha,Chris' && (await names(1)) === 'Erik,Cedric', 'tap: and back into flight 2');
// special prizes (Sascha 01.11.2026: "Long Drive or Nearest to the Pin, optional"): Nearest to the Pin on a par 3
await H.getByRole('button', { name: '+ Long Drive' }).click();
await H.getByRole('button', { name: '+ Nearest to the Pin' }).click();
const ntpHole = await H.getByRole('combobox', { name: 'Loch für Nearest to the Pin' }).locator('option:checked').innerText();
const ntpPars = await H.getByRole('combobox', { name: 'Loch für Nearest to the Pin' }).locator('option').allInnerTexts();
ok(/Par 3$/.test(ntpHole) && ntpPars.every((t) => /Par 3$/.test(t)), `Nearest to the Pin: only par 3s offered (${ntpHole}, ${ntpPars.length} holes)`);
const ldPars = await H.getByRole('combobox', { name: 'Loch für Long Drive' }).locator('option').allInnerTexts();
ok(ldPars.length > 0 && ldPars.every((t) => /Par [45]$/.test(t)), `Long Drive: par 4s and 5s (${ldPars.length} holes)`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-setup.png', fullPage: true });
await H.getByRole('button', { name: 'Turnier anlegen' }).click();
await H.waitForTimeout(2500);
const code = [...shared.entries()].find(([, r]) => !r.event_code && r.game.kind === 'round-event')?.[0];
const ev = code && shared.get(code).game;
ok(!!ev && ev.planned === true && ev.tournament === true && ev.name === 'USA Tag 1' && ev.date === new Date().toLocaleDateString('sv-SE') && ev.course?.name, `server: the planned tournament (${code}, ${ev?.date}, ${ev?.course?.name})`);
const fs1 = code ? flightsOf(code) : [];
const byTime = [...fs1].sort((x, y) => x.teeTime.localeCompare(y.teeTime));
ok(byTime[1]?.scorer === byTime[1]?.players.find((p) => p.name === 'Cedric')?.id && byTime[0]?.scorer === byTime[0]?.players[0]?.id, `server: one per flight – Cedric in flight 2, flight 1 its first (${byTime.map((f) => f.scorer ?? '–').join(', ')})`);
ok(fs1.length === 2 && byTime[0].teeTime === '12:08' && byTime[1].teeTime === '12:16', `server: a row per flight with its tee time (${fs1.map((f) => f.teeTime).join(', ')})`);
const specials = ev?.specials ?? [];
const ld = specials.find((s) => s.kind === 'longDrive');
const ntp = specials.find((s) => s.kind === 'nearestPin');
ok(specials.length === 2 && ev.holes[ntp.hole].par === 3 && ev.holes[ld.hole].par >= 4, `server: the two special prizes on their holes (LD ${ld && ev.holes[ld.hole].label}, NTP ${ntp && ev.holes[ntp.hole].label})`);
ok(byTime[0].players.map((p) => p.name).join(',') === 'Sascha,Chris' && byTime[0].markers.p1 === 'p2' && byTime[0].markers.p2 === 'p1' && byTime[0].players.every((p) => p.hcpIndex === 0), 'server: flight 1 Sascha and Chris, marking each other, the HCP kept');
ok((await H.locator('.topbar h1').innerText()).includes('USA Tag 1') && (await H.locator('.tour-tee').allInnerTexts()).join(',') === '12:08,12:16', 'the tournament page: the flights with their tee times');
ok((await H.getByText('Zähler: Chris').count()) === 1 && (await H.getByText('Zähler: Sascha').count()) === 1, 'the tournament page: who marks whom');
ok((await H.getByText('Cedric erfasst die Scores für alle').count()) === 1 && (await H.getByText('Zähler: Cedric').count()) === 1, 'the tournament page: Cedric keeps the score of flight 2');
// the QR code at once, the one look of every invitation (Sascha 03.11.2026: "identical everywhere, as under Friends")
const tinv = H.getByRole('region', { name: 'Mitspieler einladen' });
ok((await tinv.locator('.qr-box svg').count()) === 1 && (await tinv.locator('.join-code').innerText()).trim().replace(/-/g, '') === code && (await tinv.locator('.qr-action').count()) === 2, 'invite: its own section – QR code and code at once, "Einladen" and "Link kopieren"');
// Sascha 02.11.2026: "sending the invitation by WhatsApp does not work for tournaments" – the text and the link apart,
// no title, as the invitations of a round and of a pool (the iPhone's share sheet hands WhatsApp the link)
await H.evaluate(() => {
  window.__shared = null;
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => void (window.__shared = d) });
});
await tinv.getByRole('button', { name: 'Einladung senden' }).click();
const sent = await H.evaluate(() => window.__shared);
ok(!!sent && !('title' in sent) && new RegExp(`#round=${code}$`).test(sent.url ?? '') && /^Turnier „USA Tag 1“ am .+ mit Code \w{6} beitreten$/.test(sent.text ?? ''), `invite: text and link apart, no title (${JSON.stringify(sent)})`);

// ---------- the scores come in (as Rounds writes them on the day): the leaderboard ----------
const put = (f, scores) => {
  const row = shared.get(f.code);
  row.game = { kind: 'round-flight', flight: { ...row.game.flight, scores: Object.fromEntries(Object.entries(scores).map(([pid, ss]) => [pid, row.game.flight.scores[pid].map((_, i) => (ss[i] == null ? null : { s: ss[i] }))])) } };
  row.updated_at = new Date().toISOString();
};
put(byTime[0], { p1: [4, 4, 4], p2: [3, 4, 4] }); // Sascha 12, Chris 11
put(byTime[1], { p1: [5, 5, 5], p2: [4, 5, 4] }); // Erik 15, Cedric 13
// the special prizes as the players enter them at the hole (each flight's row): Erik's long drive in the rough
const at = new Date().toISOString();
shared.get(byTime[0].code).game.flight.specials = { [ld.id]: { p1: { m: 251, fairway: true, at }, p2: { m: 238, fairway: true, at } }, [ntp.id]: { p2: { m: 3.4, at } } };
shared.get(byTime[1].code).game.flight.specials = { [ld.id]: { p1: { m: 275, fairway: false, at } }, [ntp.id]: { p2: { m: 1.8, at } } };
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Turniere' }).click();
await H.waitForTimeout(800);
ok((await H.locator('.tab-title + .tile-row').count()) === 1 && (await H.locator('.list-item').filter({ hasText: 'USA Tag 1' }).count()) === 1, 'menu "Turniere": the tiles at the top, the tournament in the list');
await H.locator('.list-item').filter({ hasText: 'USA Tag 1' }).click();
await H.waitForTimeout(2500);
const board = H.locator('.card').filter({ has: H.locator('.game-pays') }).first();
const rows = (await board.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(/^Live-Rangliste/i.test(await board.locator('.eyebrow').innerText()), 'the leaderboard is named "Live-Rangliste" while it is played');
ok(rows.length === 4 && /Chris/.test(rows[0]) && /Erik/.test(rows[3]) && rows.every((r) => /nach 3/.test(r)), `the leaderboard on its day: Chris first, Erik last, all "nach 3" (${rows.join(' | ')})`);
const ldRows = (await H.getByRole('region', { name: 'Long Drive' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
const ntpRows = (await H.getByRole('region', { name: 'Nearest to the Pin' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(ldRows.length === 2 && /Sascha.*251 m/.test(ldRows[0]) && /Chris.*238 m/.test(ldRows[1]), `Long Drive: longest in the fairway first, Erik's 275 m in the rough not ranked (${ldRows.join(' | ')})`);
ok(ntpRows.length === 2 && /Cedric.*1,8 m/.test(ntpRows[0]) && /Chris.*3,4 m/.test(ntpRows[1]), `Nearest to the Pin: nearest first (${ntpRows.join(' | ')})`);
// the host corrects an entry (Sascha 01.11.2026): Erik's long drive measured again – 280 m, in the fairway
await H.getByRole('region', { name: 'Long Drive' }).getByRole('button', { name: 'Eintrag korrigieren' }).click();
const fixer = H.getByRole('dialog', { name: 'Eintrag korrigieren' });
await fixer.getByRole('combobox', { name: 'Spieler' }).selectOption({ label: 'Erik' });
await fixer.locator('#special-m').fill('280');
await fixer.getByRole('button', { name: 'Speichern' }).click();
await H.waitForTimeout(1500);
const ld2 = (await H.getByRole('region', { name: 'Long Drive' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(/Erik.*280 m/.test(ld2[0] ?? '') && shared.get(byTime[1].code).game.flight.specials[ld.id].p1.by === 'host', `the host's correction: Erik 280 m in the fairway leads (${ld2.join(' | ')})`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-page.png', fullPage: true });
// a flight ended by mistake (Sascha 03.11.2026: "Cedric ended the round by accident – then he did not get in any more"):
// the host opens it again, its scores kept
shared.get(byTime[1].code).game.flight.finishedAt = new Date().toISOString();
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(600);
await H.locator('.list-item').filter({ hasText: 'USA Tag 1' }).click();
await H.waitForTimeout(2500);
{
  const f2 = H.locator('section.tour-flight[aria-label="Flight 2"]');
  ok((await f2.getByText('Beendet', { exact: true }).count()) === 1 && (await H.locator('section.tour-flight[aria-label="Flight 1"]').getByText('Beendet', { exact: true }).count()) === 0, 'a flight ended: "Beendet" at it, the host may open it again');
  await f2.getByRole('button', { name: 'Flight wieder öffnen' }).click();
  await H.waitForTimeout(1500);
  const fl2 = shared.get(byTime[1].code).game.flight;
  ok(fl2.finishedAt == null && fl2.scores.p1.filter(Boolean).length === 3 && (await f2.getByText('Beendet', { exact: true }).count()) === 0, `flight 2 open again, its scores kept (${fl2.finishedAt})`);
}

// ---------- Chris: in by the code – sees it, cannot change it ----------
shared.get(code).members.push('u-Chris'); // joined with the link in Rounds (golfos_join_game: a planned one at once)
const guest = await phone('Chris');
const G = guest.p;
await G.locator('.tabbar button').filter({ hasText: 'Turniere' }).click();
await G.waitForTimeout(1500);
ok((await G.locator('.list-item').filter({ hasText: 'USA Tag 1' }).count()) === 1, 'Chris: the tournament in his list (from the server, by his account)');
await G.locator('.list-item').filter({ hasText: 'USA Tag 1' }).click();
await G.waitForTimeout(2000);
ok(
  (await G.getByRole('button', { name: 'Turnier bearbeiten' }).count()) === 0 &&
    (await G.getByRole('button', { name: /Mitspieler einladen/ }).count()) === 0 &&
    (await G.getByRole('button', { name: 'Turnier löschen' }).count()) === 0 &&
    (await G.getByText('Nur wer das Turnier angelegt hat, ändert es.').isVisible()),
  'Chris: sees the tournament, cannot change, invite or delete – only the host',
);
ok((await G.locator('.tour-tee').allInnerTexts()).join(',') === '12:08,12:16', 'Chris: the flights with their tee times');

// ---------- the host changes it: the flights keep their ids ----------
const ids = fs1.map((f) => f.id).sort().join();
await H.getByRole('button', { name: 'Turnier bearbeiten' }).click();
await H.waitForTimeout(800);
await H.fill('#tour-name', 'USA Tag 1 · Bethpage');
await H.getByRole('button', { name: 'Speichern' }).click();
await H.waitForTimeout(2500);
const after = flightsOf(code);
ok(shared.get(code).game.name === 'USA Tag 1 · Bethpage' && after.filter((f) => f.players.length).map((f) => f.id).sort().join() === ids, 'changed: renamed, the flights the same (their ids kept)');
ok(after.find((f) => f.id === byTime[1].id)?.teeTime === '12:16' && after.find((f) => f.id === byTime[0].id)?.scores.p2?.[0]?.s === 3, 'changed: the tee times and the scores kept');

// ---------- deleted – only marked – and restored ----------
await H.getByRole('button', { name: 'Turnier löschen' }).click();
await H.getByRole('button', { name: 'Für alle löschen' }).click();
await H.waitForTimeout(1500);
ok(!!shared.get(code).game.deletedAt && (await H.locator('.list-item').filter({ hasText: 'USA Tag 1' }).count()) === 0, 'deleted: marked for everyone, gone from the list');
await H.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await H.locator('.bin-item').first().click();
await H.getByRole('button', { name: 'Wiederherstellen' }).click();
await H.waitForTimeout(1500);
ok(!shared.get(code).game.deletedAt, 'restored from the bin');

// ---------- a tournament series (Sascha 01.11.2026: "six single tournaments copied into a tournament series") ----------
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
shared.set('TOUR22', { game: { ...JSON.parse(JSON.stringify(shared.get(code).game)), id: 'ev-2', name: 'USA Tag 2', date: tomorrow, flights: {}, specials: [] }, updated_at: new Date().toISOString(), owner: 'u-Sascha', members: [] });
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Turniere' }).click();
await H.waitForTimeout(1200);
// series and single tournaments each a category with its icon; making a series a row of its list (Sascha 03.11.2026)
{
  const heads = (await H.locator('.tour-cat-head').allInnerTexts()).map((t) => t.trim().toUpperCase());
  const make = H.locator('.tour-cat[aria-label="Turnierserien"] .tour-make-series');
  ok(heads.join('|') === 'TURNIERSERIEN|EINZELNE TURNIERE' && (await H.locator('.tour-cat-head svg').count()) === 2 && (await make.count()) === 1 && (await H.locator('.btn-secondary', { hasText: 'Turnierserie' }).count()) === 0, `the list: categories ${heads.join(' · ')}, "Zusammenfassen" a row of the series`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-list.png', fullPage: true });
}
await H.getByRole('button', { name: /Zu einer Turnierserie zusammenfassen/ }).click();
const ss = H.getByRole('dialog', { name: 'Turnierserie zusammenstellen' });
await ss.locator('#series-name').fill('USA 2026');
await ss.locator('label', { hasText: 'USA Tag 2' }).click();
await ss.locator('label', { hasText: 'USA Tag 1 · Bethpage' }).click();
await ss.getByRole('button', { name: 'Serie aus 2 Runden anlegen' }).click();
await H.waitForTimeout(2500);
const scode = [...shared.entries()].find(([, r]) => r.game.kind === 'tour-series')?.[0];
const srow = scode && shared.get(scode).game;
ok(!!srow && srow.name === 'USA 2026' && srow.rounds.map((r) => r.code).join() === `${code},TOUR22` && shared.get(code).game.series?.code === scode && shared.get('TOUR22').game.series?.code === scode, `server: the series ${scode} with its two rounds, each pointing to it`);
ok((await H.locator('.topbar h1').innerText()).includes('USA 2026') && (await H.locator('.list-item').filter({ hasText: 'Runde 2' }).count()) === 1, 'the series page: its rounds in order');
const total = (await H.locator('[aria-label="Gesamtwertung"] li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(total.length === 4 && /Chris/.test(total[0]) && total.every((t) => /1 Runde/.test(t)), `the total standing: the round played added up (${total.join(' | ')})`);
// the pencil green as every pencil (Sascha 03.11.2026); the total's head a line of its own
{
  const pen = await H.getByRole('button', { name: 'Serie umbenennen' }).evaluate((e) => getComputedStyle(e).backgroundColor);
  const brand = await H.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--brand)'; document.body.append(s); const c = getComputedStyle(s).color; s.remove(); return c; });
  const head = await H.locator('[aria-label="Gesamtwertung"] .eyebrow').boundingBox();
  const next = await H.locator('[aria-label="Gesamtwertung"] > :nth-child(2)').boundingBox();
  ok(pen === brand && next.y >= head.y + head.height - 1, `the series: its pencil green (${pen} vs ${brand}), the total below its head`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-series.png' });
}
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(800);
ok((await H.locator('.tour-series-row').count()) === 1 && (await H.locator('.list-item').filter({ hasText: 'USA Tag 2' }).count()) === 0, 'the list: the series once, its rounds inside');
// Chris: in with the series' code – a member of every round
await G.evaluate(async (c) => {
  const a = JSON.parse(localStorage.getItem('golfos.auth.v1'));
  await fetch('https://rgisfnilwehnqpmbrxmp.supabase.co/rest/v1/rpc/golfos_join_game', { method: 'POST', headers: { apikey: 'x', Authorization: `Bearer ${a.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ join_code: c }) });
}, scode);
ok(shared.get('TOUR22').members.includes('u-Chris') && shared.get(scode).members.includes('u-Chris'), 'one code for the whole series: Chris in every round');
await G.goto('about:blank');
await G.goto(url);
await G.waitForTimeout(1500);
await G.locator('.tabbar button').filter({ hasText: 'Turniere' }).click();
await G.waitForTimeout(1500);
await G.locator('.tour-series-row').click();
await G.waitForTimeout(1500);
ok((await G.getByRole('button', { name: 'Serie umbenennen' }).count()) === 0 && (await G.getByRole('button', { name: /Mitspieler einladen/ }).count()) === 0 && (await G.getByText('Nur wer die Serie angelegt hat, ändert sie.').isVisible()), 'Chris: sees the series, cannot change it');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
