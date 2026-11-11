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
// a linked friend – invited from the tournament's page with a tap (Sascha 03.11.2026)
await H.evaluate(() => localStorage.setItem('golfos.friends.v1', JSON.stringify([{ id: 'f-ben', name: 'Ben', hcp: '', uid: 'u-Ben' }])));
// Tournaments a module of their own, below Games & Bets (Sascha 03.11.2026)
ok((await H.locator('.tabbar button').allInnerTexts()).join('|') === 'Planen|Turniere|Profil' && (await H.locator('.module-tag').textContent()) === 'Tournaments', `the module Tournaments: ${(await H.locator('.tabbar button').allInnerTexts()).join(' · ')}`);
ok(await H.getByText('Neues Turnier planen').isVisible() && (await H.getByRole('button', { name: 'Neue Wette' }).count()) === 0, 'its start page: "Neues Turnier planen", no bets');
await H.locator('.module-switch').click();
const cards = (await H.locator('.module-card:not(.module-home) strong').allInnerTexts()).join('|'); // the sheet's first row "Startseite" aside
ok(cards === 'Rounds|Games & Bets|Tournaments|Training (Beta)|Agility (Beta)', `the start page: ${cards}`);
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
// net classes (Sascha 03./04.11.2026): the last class up to 54; "Eigene" a row per class, no hints, a field under the
// last class adds one
// the block Format as in Rounds (Sascha 07.11.2026): Rundenart (Turnier), Modus, Scoring, HCP-Vorgabe – a tournament's
// WHS allowance to start with, 95 %
{
  const rows = (await H.locator('.setup-part').filter({ has: H.locator('.eyebrow', { hasText: /^Format$/ }) }).locator('.settings-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim());
  ok(rows.slice(0, 4).join(' | ') === 'Rundenart Turnier | Modus Einfaches Spiel | Scoring Zählspiel | HCP-Vorgabe 95 %', `Format: ${rows.join(' | ')}`);
  await H.locator('.settings-row').filter({ hasText: /^Modus/ }).click();
  const modes = (await H.locator('.sheet .pick-option strong').allInnerTexts()).join(', ');
  ok(/Einfaches Spiel/.test(modes) && /Better Ball/.test(modes) && /Scramble/.test(modes) && /Vierer/.test(modes) && !/Lochspiel/.test(modes), `the modes – no match play in a field: ${modes}`);
  await H.locator('.sheet .pick-option').filter({ hasText: 'Better Ball' }).first().click();
  ok(/HCP-Vorgabe 85 %/.test((await H.locator('.settings-row').filter({ hasText: /^HCP-Vorgabe/ }).innerText()).replace(/\s+/g, ' ')) && (await H.getByText(/Spieler 1 & 2 und 3 & 4 ein Team/).count()) === 1, 'Better Ball: 85 % (WHS), how the teams come about');
  await H.locator('.settings-row').filter({ hasText: /^Modus/ }).click();
  await H.locator('.sheet .pick-option').filter({ hasText: 'Einfaches Spiel' }).first().click();
}
{
  await H.locator('.settings-row').filter({ hasText: /^HCP-Vorgabe/ }).click();
  await H.locator('.sheet .pick-option').filter({ hasText: /^100 %/ }).first().click();
  const row = H.locator('.settings-row').filter({ hasText: 'Netto-Klassen' });
  const cs = H.getByRole('dialog', { name: 'Netto-Klassen' });
  await row.click();
  ok((await cs.getByText('2 Klassen · A bis 18 · B bis 54').count()) === 1, 'classes: 2 – "B bis 54"');
  await cs.getByRole('button', { name: /^3 Klassen/ }).click();
  ok(/3 Klassen/.test(await row.innerText()) && (await H.getByText('A bis 12 · B bis 24 · C bis 54', { exact: true }).count()) === 1, `classes: 3 – "A bis 12 · B bis 24 · C bis 54" (${(await row.innerText()).replace(/\s+/g, ' ')})`);
  await row.click();
  await cs.getByRole('button', { name: /^Eigene/ }).click();
  const ownRows = cs.getByRole('group', { name: 'Die Klassen' }).locator('button.settings-row');
  const field = cs.getByRole('textbox', { name: 'Grenze einer weiteren Klasse' });
  const texts = async () => (await ownRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim());
  ok(JSON.stringify(await texts()) === '["Klasse A bis 9","Klasse B bis 18","Klasse C bis 26","Klasse D bis 54"]' && (await field.count()) === 1, `classes: own – a row per class, a field below (${(await texts()).join(' | ')})`);
  ok((await cs.getByText(/Nach Spielvorgabe|nimmt alle bis 54/).count()) === 0 && (await cs.getByRole('button', { name: '+ Klasse' }).count()) === 0, 'classes: no hints, no "+ Klasse"');
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-classes.png' });
  await ownRows.nth(1).click();
  const lim = H.getByRole('dialog', { name: 'Klasse B bis' });
  ok((await lim.locator('.pick-option').first().innerText()).trim() === 'bis 10' && (await lim.locator('.pick-option').last().innerText()).trim() === 'bis 25', 'classes: B between A and C – 10 to 25');
  await lim.getByRole('button', { name: 'Klasse B entfernen' }).click();
  ok((await ownRows.count()) === 3, 'classes: B removed – three classes');
  // typed into the field: 18 joins in its order
  await field.fill('18');
  await field.press('Enter');
  ok(JSON.stringify(await texts()) === '["Klasse A bis 9","Klasse B bis 18","Klasse C bis 26","Klasse D bis 54"]', `classes: 18 typed – B again, in its order (${(await texts()).join(' | ')})`);
  await cs.getByRole('button', { name: '4 Klassen übernehmen' }).click();
  ok(/4 Klassen/.test(await row.innerText()) && (await H.getByText('A bis 9 · B bis 18 · C bis 26 · D bis 54', { exact: true }).count()) === 1, `classes: own taken – ${await row.innerText()}`);
  // up to ten (A to J): the field gone at ten
  await row.click();
  for (const v of [30, 34, 38, 42, 46, 50]) {
    await field.fill(String(v));
    await field.press('Enter');
  }
  const ten = await texts();
  ok(ten.length === 10 && ten[9] === 'Klasse J bis 54' && (await field.count()) === 0 && (await cs.getByRole('button', { name: '10 Klassen übernehmen' }).count()) === 1, `classes: up to ten – ${ten.join(' | ')}`);
  await cs.getByRole('button', { name: 'Schließen' }).click();
  // back to brutto for the rest of the test
  await H.locator('.settings-row').filter({ hasText: /^HCP-Vorgabe/ }).click();
  await H.locator('.sheet .pick-option').filter({ hasText: /^0 %/ }).first().click();
}
// the order of the setup (Sascha 04.11.2026): Score-Erfassung between the day and the players, the special prizes as
// rows under them, the flights last
{
  const heads = (await H.locator('main.screen > .setup-part > .eyebrow').allInnerTexts()).map((t) => t.trim().toUpperCase());
  ok(heads.join('|') === 'TURNIER|FORMAT|PLATZ|DATUM|SCORE-ERFASSUNG|SPIELER|SONDERWERTUNGEN (OPTIONAL)|FLIGHTS UND STARTZEITEN', `the order: ${heads.join(' · ')}`);
}
for (const n of ['Chris', 'Erik', 'Cedric', 'Dave']) {
  await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill(n);
  await H.locator('input[id^="hcp-"]').last().fill(n === 'Dave' ? '' : n === 'Cedric' ? '20' : n === 'Erik' ? '4' : '12,4');
}
await H.locator('input[id^="hcp-"]').first().fill('7');
await H.waitForTimeout(300);
// the column "Vorgabe" follows the HCP-Vorgabe (Sascha 09.11.2026: 75 % chosen, the players' values stayed): gross 0,
// 100 % the full playing handicap, 75 % three quarters of it – back to gross for the rest
{
  const vals = async () => H.locator('.game-player-row .playing-hcp').allInnerTexts();
  const pick = async (v) => {
    await H.locator('.settings-row').filter({ hasText: /^HCP-Vorgabe/ }).click();
    await H.locator('.sheet .pick-option').filter({ hasText: new RegExp(`^${v} %`) }).first().click();
    await H.waitForTimeout(200);
  };
  const gross = await vals();
  await pick(100);
  const full = await vals();
  await pick(75);
  const three = await vals();
  ok(gross.join() === '0,0,0,0,–' && full.every((x, i) => (i === 4 ? x === '–' : Number(x) > 0)) && three.join() === full.map((x) => (x === '–' ? x : String(Math.round((Number(x) * 75) / 100)))).join(), `players' Vorgabe follows the allowance: 0 % ${gross.join(' ')} · 100 % ${full.join(' ')} · 75 % ${three.join(' ')}`);
  await pick(0);
}
const fl =(k) => H.locator('.tour-flight:not(.tour-unplaced)').nth(k);
const names = async (k) => (await fl(k).locator('.tour-flight-player strong').allInnerTexts()).join(',');
const sorted = async (k) => (await fl(k).locator('.tour-flight-player strong').allInnerTexts()).sort().join(',');
const setting = (label) => H.locator('.settings-row').filter({ hasText: new RegExp(`^${label}`) });
const choose = async (label, option) => {
  await setting(label).first().click();
  await H.locator('.sheet .pick-option').filter({ hasText: option }).first().click();
  await H.waitForTimeout(200);
};
// the draw (Sascha 04.11.2026: "random, by handicap up or down; by result at the final day"): by handicap down at first –
// Dave without one counts as the highest, the best go out last; 5 players to fours: 3 and 2
ok(/Nach HCP absteigend/.test(await setting('Einteilung').innerText()) && /4 Spieler/.test(await setting('Spieler je Flight').innerText()) && /09:00/.test(await setting('Erste Startzeit').innerText()) && /8 Min\./.test(await setting('Abstand').innerText()) && /Tee 1/.test(await setting('Start').innerText()), 'flights: by handicap down, fours, 09:00, 8 minutes, tee 1 – each a row');
ok((await sorted(0)) === 'Cedric,Chris,Dave' && (await sorted(1)) === 'Erik,Sascha' && (await fl(1).locator('.tour-tee').innerText()) === '09:08', `by handicap down: Dave (none), Cedric 20, Chris 12,4 – then Sascha 7, Erik 4 at 09:08 (${await names(0)} | ${await names(1)})`);
await choose('Einteilung', 'Nach HCP aufsteigend');
ok((await sorted(0)) === 'Chris,Erik,Sascha' && (await sorted(1)) === 'Cedric,Dave', `by handicap up: the lowest first (${await names(0)} | ${await names(1)})`);
{
  const opts = (await (async () => { await setting('Einteilung').click(); const o = await H.locator('.sheet .pick-option strong').allInnerTexts(); await H.getByRole('button', { name: 'Schließen' }).last().click(); return o; })()).join('|');
  ok(opts === 'Manuell|Zufällig|Nach HCP aufsteigend|Nach HCP absteigend', `the draws of a first round – no "by result" (${opts})`);
}
await choose('Einteilung', 'Zufällig');
ok((await H.locator('.tour-flight-player').count()) === 5 && (await H.getByRole('button', { name: 'Neu auslosen' }).count()) === 1, 'random: everyone in a flight, "Neu auslosen"');
await choose('Spieler je Flight', '2 Spieler');
ok((await H.locator('.tour-flight:not(.tour-unplaced)').count()) === 2, 'twos with five players: 3 and 2 – nobody alone');
// tees 1 and 10: two flights on each time
await choose('Start', 'Tee 1 und Tee 10');
ok((await fl(1).locator('.tour-tee').innerText()) === '09:00' && /Tee 10/.test(await fl(1).locator('h2').innerText()), 'tees 1 and 10: flight 2 at 09:00 from tee 10');
await choose('Start', 'Tee 1');
// Dave taken out, by handicap up in twos: Sascha 7, Erik 4 | Chris 12,4, Cedric 20; the first tee time 12:08, 8 minutes on
await H.getByRole('button', { name: 'Dave entfernen' }).click();
await choose('Einteilung', 'Nach HCP aufsteigend');
await setting('Erste Startzeit').click();
{
  const t = H.getByRole('dialog', { name: 'Erste Startzeit' });
  await t.getByRole('group', { name: 'Stunde' }).getByRole('button', { name: '12', exact: true }).click();
  await t.getByRole('group', { name: 'Minute' }).getByRole('button', { name: '08', exact: true }).click();
  await t.getByRole('button', { name: 'Speichern', exact: true }).click();
}
ok((await sorted(0)) === 'Erik,Sascha' && (await sorted(1)) === 'Cedric,Chris' && (await H.locator('.tour-tee').allInnerTexts()).join(',') === '12:08,12:16', `twos by handicap up from 12:08: 12:08 and 12:16 (${await names(0)} | ${await names(1)})`);
const f1 = (await fl(0).innerText()).replace(/\s+/g, ' ');
ok(/Sascha · Zähler: Erik/.test(f1) && /Erik · Zähler: Sascha/.test(f1), `who marks whom shown – set by the app (${f1})`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-setup-flights.png', fullPage: true });
// by hand (Sascha 02.11.2026: drag and drop): Chris by his grip onto flight 1 – the draw "Manuell" from then on
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
await dragTo('Chris', fl(0));
ok((await sorted(0)) === 'Chris,Erik,Sascha' && (await names(1)) === 'Cedric' && /Manuell/.test(await setting('Einteilung').innerText()), `Chris dragged by his grip onto flight 1 – "Manuell" now (${await names(0)} | ${await names(1)})`);
await dragTo('Chris', fl(1));
ok((await sorted(0)) === 'Erik,Sascha' && (await sorted(1)) === 'Cedric,Chris', 'and dragged back onto flight 2');
// the finger (Sascha 04.11.2026: "nothing lifts" on the iPhone): real touch events as Safari sends them – the grip at
// once, the row after a hold, a move first only scrolls; the board a real box (not display: contents)
ok((await H.locator('.tour-board').evaluate((e) => getComputedStyle(e).display)) === 'flex', 'the board a real box – the iPhone gives it cancelable touches');
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
  const lifted = await row.evaluate((e) => e.classList.contains('lifted'));
  const b = await target.boundingBox();
  const x1 = b.x + 60;
  const y1 = b.y + 30;
  for (let i = 1; i <= 12; i++) {
    await touch('touchmove', x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
    await H.waitForTimeout(16);
  }
  const moved = await row.evaluate((e) => e.style.transform);
  await touch('touchend', x1, y1);
  await H.waitForTimeout(300);
  return { lifted, moved };
};
{
  const t = await touchTo('Chris', fl(0), { grip: true });
  ok(t.lifted && /translate/.test(t.moved) && (await sorted(0)) === 'Chris,Erik,Sascha' && (await names(1)) === 'Cedric', `finger: Chris by his grip – lifted at once, the row following the finger, onto flight 1 (${t.moved})`);
}
await touchTo('Chris', fl(1), { wait: 450 });
ok((await sorted(0)) === 'Erik,Sascha' && (await sorted(1)) === 'Cedric,Chris', `finger: Chris's row held, back onto flight 2 (${await names(0)} | ${await names(1)})`);
await touchTo('Erik', fl(1));
ok((await sorted(0)) === 'Erik,Sascha' && (await sorted(1)) === 'Cedric,Chris', 'finger: the row moved at once – a scroll, nobody moved');
// a tap: where to – the sure way beside dragging (Sascha 03.11.2026)
await fl(0).locator('.tour-flight-player strong', { hasText: /^Erik$/ }).click();
const mv = H.getByRole('dialog', { name: 'Erik verschieben' });
ok((await mv.locator('.pick-option').count()) === 3 && /Flight 2 · 12:16/.test(await mv.innerText()), 'tap: the flights and "Noch ohne Flight" offered');
await mv.getByRole('button', { name: /^Flight 2/ }).click();
ok((await names(0)) === 'Sascha' && (await sorted(1)) === 'Cedric,Chris,Erik', `tap: Erik into flight 2 (${await names(0)} | ${await names(1)})`);
await fl(1).locator('.tour-flight-player strong', { hasText: /^Erik$/ }).click();
await H.getByRole('dialog', { name: 'Erik verschieben' }).getByRole('button', { name: /^Flight 1/ }).click();
ok((await sorted(0)) === 'Erik,Sascha' && (await sorted(1)) === 'Cedric,Chris', 'tap: and back into flight 1');
// a flight's own time and tee: "Ändern"
const sheet = H.getByRole('dialog', { name: /^Flight \d$/ });
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
ok(/12:16/.test(await sheet.locator('.settings-row').filter({ hasText: 'Startzeit' }).innerText()) && /Tee 1/.test(await sheet.locator('.settings-row').filter({ hasText: 'Start' }).last().innerText()), 'flight 2 opened: its tee time and its tee');
await sheet.getByRole('button', { name: 'Schließen' }).click();
// Score-Erfassung (Sascha 03./04.11.2026): "Mit Zähler" the default; "Einer für alle" – who keeps the score chosen there,
// not in the flights
const who = H.locator('.settings-row').filter({ hasText: 'Wer erfasst' });
ok(/Mit Zähler/.test(await who.innerText()), `Score-Erfassung: "Mit Zähler" by default (${(await who.innerText()).replace(/\s+/g, ' ')})`);
await who.click();
{
  const opts = (await H.getByRole('dialog', { name: 'Wer erfasst' }).locator('.pick-option strong').allInnerTexts()).join('|');
  ok(opts === 'Jeder seinen eigenen|Mit Zähler|Einer für alle', `Score-Erfassung: the choices of Rounds – ${opts}`);
}
await H.getByRole('dialog', { name: 'Wer erfasst' }).getByRole('button', { name: /^Jeder seinen eigenen/ }).click();
ok(!/Zähler: /.test((await fl(0).innerText()) + (await fl(1).innerText())) && (await H.getByText('Jeder unterschreibt seine Karte selbst.').count()) === 0, 'everyone his own: no markers in the flights, no hint under the score entry (04.11.2026)');
await who.click();
await H.getByRole('dialog', { name: 'Wer erfasst' }).getByRole('button', { name: /^Einer für alle/ }).click();
// the scorer chosen in the flight (Sascha 04.11.2026: "the scorer belongs to the flights"), its first at first
const scorerOf = (k) => fl(k).locator('.settings-row').filter({ hasText: 'Schreiber' });
ok((await H.locator('.setup-part').filter({ hasText: 'Score-Erfassung' }).locator('.settings-row').filter({ hasText: 'Schreiber' }).count()) === 0 && /Schreiber\s*Chris/.test(await scorerOf(1).innerText()) && !/Wer es ist/.test(await H.locator('.setup-part').filter({ hasText: 'Score-Erfassung' }).innerText()), `one for all: a row "Schreiber" in each flight, its first – none under "Wer erfasst" (${(await scorerOf(1).innerText()).replace(/\s+/g, ' ')})`);
await scorerOf(1).click();
await H.getByRole('dialog', { name: 'Schreiber in Flight 2' }).getByRole('button', { name: /^Cedric/ }).click();
ok(/Schreiber\s*Cedric/.test(await scorerOf(1).innerText()) && /Schreiber\s*(Sascha|Erik)/.test(await scorerOf(0).innerText()), `Cedric keeps flight 2's score, flight 1 its first (${(await fl(1).innerText()).replace(/\s+/g, ' ')})`);
// "Eigene Detailerfassung" under "Einer für alle" (Sascha 07.11.2026: "for Games and tournaments too"): a switch per player
{
  const row = H.locator('.settings-row').filter({ hasText: 'Eigene Detailerfassung' });
  ok((await row.count()) === 1 && /Niemand/.test(await row.innerText()), 'Einer für alle: "Eigene Detailerfassung · Niemand"');
  await row.click();
  const s = H.getByRole('dialog', { name: 'Eigene Detailerfassung' });
  await s.getByRole('switch', { name: /^Erik/ }).click();
  await s.getByRole('button', { name: 'Fertig' }).click();
  ok(/Erik/.test(await row.innerText()), `Erik enters his own details too (${(await row.innerText()).replace(/\s+/g, ' ')})`);
}
// the special prizes as rows (Sascha 04.11.2026), the holes ticked in a sheet – Long Drive par 4s and 5s, Nearest to the Pin par 3s
await H.locator('.settings-row').filter({ hasText: 'Long Drive' }).click();
{
  const s = H.getByRole('dialog', { name: 'Long Drive' });
  const pars = (await s.locator('.pick-option .muted').allInnerTexts()).map((t) => t.trim());
  ok(pars.length > 0 && pars.every((t) => /^Par [45]$/.test(t)), `Long Drive: par 4s and 5s (${pars.length} holes)`);
  await s.locator('.pick-option').first().click();
  await s.getByRole('button', { name: 'Fertig' }).click();
}
await H.locator('.settings-row').filter({ hasText: 'Nearest to the Pin' }).click();
{
  const s = H.getByRole('dialog', { name: 'Nearest to the Pin' });
  const pars = (await s.locator('.pick-option .muted').allInnerTexts()).map((t) => t.trim());
  ok(pars.length > 0 && pars.every((t) => t === 'Par 3'), `Nearest to the Pin: only par 3s (${pars.length} holes)`);
  await s.locator('.pick-option').first().click();
  await s.getByRole('button', { name: 'Fertig' }).click();
}
ok(/Loch \d+/.test(await H.locator('.settings-row').filter({ hasText: 'Long Drive' }).innerText()) && /Loch \d+/.test(await H.locator('.settings-row').filter({ hasText: 'Nearest to the Pin' }).innerText()), 'the special prizes: their holes in the rows');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-setup.png', fullPage: true });
await H.getByRole('button', { name: 'Turnier anlegen' }).click();
await H.waitForTimeout(2500);
const code = [...shared.entries()].find(([, r]) => !r.event_code && r.game.kind === 'round-event')?.[0];
const ev = code && shared.get(code).game;
ok(!!ev && ev.planned === true && ev.tournament === true && ev.name === 'USA Tag 1' && ev.date === new Date().toLocaleDateString('sv-SE') && ev.course?.name && ev.draw?.mode === 'manual', `server: the planned tournament (${code}, ${ev?.date}, ${ev?.course?.name}, draw ${ev?.draw?.mode}, ${ev?.format?.scoring})`);
const fs1 = code ? flightsOf(code) : [];
const byTime = [...fs1].sort((x, y) => x.teeTime.localeCompare(y.teeTime));
ok(byTime[1]?.scorer === byTime[1]?.players.find((p) => p.name === 'Cedric')?.id && byTime[0]?.scorer === byTime[0]?.players[0]?.id, `server: one per flight – Cedric in flight 2, flight 1 its first (${byTime.map((f) => f.scorer ?? '–').join(', ')})`);
ok(fs1.length === 2 && byTime[0].teeTime === '12:08' && byTime[1].teeTime === '12:16', `server: a row per flight with its tee time (${fs1.map((f) => f.teeTime).join(', ')})`);
const specials = ev?.specials ?? [];
const ld = specials.find((s) => s.kind === 'longDrive');
const ntp = specials.find((s) => s.kind === 'nearestPin');
ok(specials.length === 2 && ev.holes[ntp.hole].par === 3 && ev.holes[ld.hole].par >= 4, `server: the two special prizes on their holes (LD ${ld && ev.holes[ld.hole].label}, NTP ${ntp && ev.holes[ntp.hole].label})`);
ok(byTime[0].players.map((p) => p.name).join(',') === 'Sascha,Erik' && byTime[0].markers.p1 === 'p2' && byTime[0].markers.p2 === 'p1' && byTime[0].players[0].hcpIndex === 7, 'server: flight 1 Sascha and Erik, marking each other, the HCP kept');
ok((await H.locator('.topbar h1').innerText()).includes('USA Tag 1') && (await H.locator('.tour-tee').allInnerTexts()).join(',') === '12:08,12:16', 'the tournament page: the flights with their tee times');
// "Einer für alle": each flight has its scorer – no marker per player then, the scorer's line says it (Sascha 10.11.2026)
ok((await H.getByText(/^Zähler: /).count()) === 0 && (await H.locator('.tour-scorer').count()) === 2, 'the tournament page: each flight its scorer, no "Zähler" per player');
ok((await H.getByText('Cedric erfasst die Scores für alle').count()) === 1 && (await H.getByText('Zähler: Cedric').count()) === 0, 'the tournament page: Cedric keeps the score of flight 2 – no "Zähler" beside the players');
// the QR code at once, the one look of every invitation (Sascha 03.11.2026: "identical everywhere, as under Friends")
const tinv = H.getByRole('region', { name: 'Mitspieler einladen' });
ok((await tinv.getByRole('button', { name: 'Ben einladen' }).count()) === 1, 'invite: the linked friend Ben with "Einladen" below the QR code');
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
put(byTime[0], { p1: [4, 4, 4], p2: [3, 4, 4] }); // Sascha 12, Erik 11
put(byTime[1], { p1: [5, 5, 5], p2: [4, 5, 4] }); // Chris 15, Cedric 13
// the special prizes as the players enter them at the hole (each flight's row): Chris's long drive in the rough
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
// the live leaderboard (Sascha 03.11.2026): its name, "LIVE" while played, each player "nach 3"
const board = H.getByRole('region', { name: 'Live-Leaderboard' });
const rows = (await board.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(/^Live-Leaderboard/i.test(await board.locator('.eyebrow').innerText()) && (await board.locator('.tour-live-badge').isVisible()) && !/Aktualisiert|30 Sekunden/.test(await board.innerText()), 'the leaderboard: "Live-Leaderboard", LIVE, the time of the last update');
if (process.env.SHOTS) await board.screenshot({ path: process.env.SHOTS + '/tours-live.png' });
// "Am Turniertag" one of the most important hints (Sascha 07.11.2026): green as "Tipp für die nächste Runde" – the
// green card, the heading as a heading, the text bold
const dayHint = H.locator('section.key-hint').filter({ hasText: 'Am Turniertag' });
const dayLook = await dayHint.evaluate((el) => {
  const probe = document.createElement('span');
  probe.style.background = 'var(--brand-soft)';
  document.body.appendChild(probe);
  const green = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, green, border: s.borderTopWidth, h2: el.querySelector('h2')?.textContent ?? '', weight: getComputedStyle(el.querySelector('p') ?? el).fontWeight };
}).catch(() => null);
ok(!!dayLook && dayLook.bg === dayLook.green && dayLook.border === '1px' && dayLook.h2 === 'Am Turniertag' && Number(dayLook.weight) >= 600, `"Am Turniertag" as "Tipp für die nächste Runde": green card, heading, bold text (${JSON.stringify(dayLook)})`);
ok(rows.length === 4 && /Erik/.test(rows[0]) && /Chris/.test(rows[3]) && rows.every((r) => /nach 3/.test(r)), `the leaderboard on its day: Erik first, Chris last, all "nach 3" (${rows.join(' | ')})`);
// a player tapped: his scorecard opens below (Sascha 04.11.2026)
await board.locator('.lb-rows li').first().click();
ok((await board.locator('.lb-card table.sc').count()) >= 1 && /Erik/.test(await board.locator('.lb-rows li').first().innerText()), 'the leaderboard: Erik tapped – his scorecard below');
await board.locator('.lb-rows li .lb-name').first().click();
ok((await board.locator('.lb-card').count()) === 0, 'tapped again: closed');
const ldRows = (await H.getByRole('region', { name: 'Long Drive' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
const ntpRows = (await H.getByRole('region', { name: 'Nearest to the Pin' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(ldRows.length === 2 && /Sascha.*251 m/.test(ldRows[0]) && /Erik.*238 m/.test(ldRows[1]), `Long Drive: longest in the fairway first, Chris's 275 m in the rough not ranked (${ldRows.join(' | ')})`);
ok(ntpRows.length === 2 && /Cedric.*1,8 m/.test(ntpRows[0]) && /Erik.*3,4 m/.test(ntpRows[1]), `Nearest to the Pin: nearest first (${ntpRows.join(' | ')})`);
// the host corrects an entry (Sascha 01.11.2026): Chris's long drive measured again – 280 m, in the fairway
await H.getByRole('region', { name: 'Long Drive' }).getByRole('button', { name: 'Eintrag korrigieren' }).click();
const fixer = H.getByRole('dialog', { name: 'Eintrag korrigieren' });
await fixer.getByRole('combobox', { name: 'Spieler' }).selectOption({ label: 'Chris' });
await fixer.locator('#special-m').fill('280');
await fixer.getByRole('button', { name: 'Speichern' }).click();
await H.waitForTimeout(1500);
const ld2 = (await H.getByRole('region', { name: 'Long Drive' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(/Chris.*280 m/.test(ld2[0] ?? '') && shared.get(byTime[1].code).game.flight.specials[ld.id].p1.by === 'host', `the host's correction: Chris 280 m in the fairway leads (${ld2.join(' | ')})`);
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
// "Ändern" at a flight (Sascha 04.11.2026: "the flights, the scorer, the tee time not to change from here"): the change
// opened at its flights
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
await H.waitForTimeout(900);
{
  const at = await H.locator('#tour-flights').evaluate((e) => Math.round(e.getBoundingClientRect().top));
  ok((await H.locator('.topbar h1').innerText()).includes('Turnier bearbeiten') && at >= -5 && at < 300, `flight "Ändern": the change opened at its flights (top ${at})`);
}
await H.getByRole('button', { name: 'Zurück' }).first().click();
await H.waitForTimeout(800);
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
  const make = H.locator('.tour-cat[aria-label="Einzelne Turniere"] .btn-secondary.tour-make-series');
  ok(heads.join('|') === 'EINZELNE TURNIERE' && (await H.locator('.tour-cat-head svg').count()) === 1 && (await make.count()) === 1 && /Turnierserie erstellen/.test(await make.innerText()), `the list: categories ${heads.join(' · ')}, "Zusammenfassen" a row of the series`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-list.png', fullPage: true });
}
await H.getByRole('button', { name: 'Turnierserie erstellen' }).click();
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
// live: round 1 running (3 holes) – each player what it added, "nach 3", the LIVE mark
// one line a player as the tour's leaderboard (Sascha 12.11.2026): place, name, total, the hole (3), R1
const thrus = await H.locator('[aria-label="Gesamtwertung"] .series-lb-thru').allInnerTexts();
ok(total.length === 4 && /Erik/.test(total[0]) && thrus.length === 4 && thrus.every((t) => t.trim() === '3') && /R1/.test(await H.locator('[aria-label="Gesamtwertung"] .series-lb-head').innerText()) && (await H.locator('[aria-label="Gesamtwertung"] .tour-live-badge').count()) === 1, `the total live: round 1 running added up, each "Loch 3" (${total.join(' | ')})`);
if (process.env.SHOTS) await H.locator('[aria-label="Gesamtwertung"]').screenshot({ path: process.env.SHOTS + '/tours-series-live.png' });
// a player tapped: his sheet – place, total, the round now, the rounds as one switch, the scorecard (Sascha 12.11.2026)
{
  const tb = H.locator('[aria-label="Gesamtwertung"]');
  await tb.locator('.series-lb-row').first().click();
  const sh = H.locator('.series-player-sheet');
  const st = (await sh.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok((await sh.locator('table.sc').count()) >= 1 && /Erik/.test(st) && /Platz/.test(st) && /Gesamt/.test(st) && /Runde 1/.test(await sh.locator('.series-round-tabs .chip.on').innerText()) && /nach 3/.test(st), `the first tapped: Erik's sheet with his card of round 1 (${st.slice(0, 120)})`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-series-player.png' });
  await sh.getByRole('button', { name: 'Schließen' }).click();
  ok((await H.locator('.series-player-sheet').count()) === 0, 'closed');
}
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
// no list of the courses under it (Sascha 12.11.2026): "Serie · 10.11.–11.11."
{
  const sub = (await H.locator('.tour-series-row .muted.small.one-line').first().innerText()).trim();
  ok(/^Serie · \d\d\.\d\d\.–\d\d\.\d\d\.$/.test(sub), `the series' line: kind and days only (${sub})`);
}
// a tile lists its rounds one by one – the series' too (Sascha 12.11.2026: "geplant should list the rounds left, it shows only the series")
await H.locator('.tile').filter({ hasText: 'geplant' }).click();
await H.waitForTimeout(300);
{
  const rows = (await H.locator('.tour-cat .list-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tours-tile-planned.png' });
  ok((await H.locator('.tour-series-row').count()) === 0 && rows.length >= 2 && rows.some((t) => /USA Tag 2/.test(t)), `tile "geplant": its rounds one by one, no series row (${rows.join(' | ').slice(0, 160)})`);
}
await H.locator('.tile').filter({ hasText: 'geplant' }).click();
await H.waitForTimeout(300);
ok((await H.locator('.tour-series-row').count()) === 1, 'tile "geplant" again: the whole overview');
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

// ---------- deleted for good from the bin: stays gone (Sascha 06.11.2026: "they come back – despite deleting for good") ----------
shared.set('TOUR33', { game: { ...JSON.parse(JSON.stringify(shared.get('TOUR22').game)), id: 'ev-3', name: 'USA Tag 3', series: undefined, deletedAt: new Date().toISOString() }, updated_at: new Date().toISOString(), owner: 'u-Sascha', members: [] });
const toursTab = async () => {
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(1500);
  await H.locator('.tabbar button').filter({ hasText: 'Turniere' }).click();
  await H.waitForTimeout(2000);
};
await toursTab();
await H.locator('.tile').filter({ hasText: 'gelöscht' }).click();
await H.waitForTimeout(400);
ok((await H.locator('.bin-item').filter({ hasText: 'USA Tag 3' }).count()) === 1, 'a deleted tournament from the server: in the bin');
await H.locator('.bin-item').filter({ hasText: 'USA Tag 3' }).click();
await H.getByRole('button', { name: 'Endgültig löschen' }).last().click();
await H.waitForTimeout(9000); // the toast's "Undo" passed
ok((await H.locator('.bin-item').filter({ hasText: 'USA Tag 3' }).count()) === 0, 'deleted for good: gone from the bin');
await toursTab(); // the app opened again: the tournaments fetched from the server
const binTile = H.locator('.tile').filter({ hasText: 'gelöscht' });
if (!(await binTile.isDisabled())) await binTile.click();
await H.waitForTimeout(400);
ok((await H.locator('.bin-item').filter({ hasText: 'USA Tag 3' }).count()) === 0 && (await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.tours.hidden.v1') ?? '[]'))).includes('TOUR33'), 'the app opened again: it stays gone, remembered for the account');
ok(!!shared.get('TOUR33'), 'on the server it stays (marked deleted for the others) – nothing deleted there');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
