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
    sessionStorage.setItem('golfos.module', 'games');
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const flightsOf = (code) => [...shared.entries()].filter(([, r]) => r.event_code === code).map(([c, r]) => ({ code: c, ...r.game.flight }));

// ---------- Sascha plans the tournament ----------
const host = await phone('Sascha');
const H = host.p;
ok((await H.locator('.tabbar button').allInnerTexts()).join('|') === 'Spielen|Spiele|Wetten|Turniere|Profil', `Games menu with "Turniere": ${(await H.locator('.tabbar button').allInnerTexts()).join(' · ')}`);
ok(await H.getByText('Neues Turnier planen').isVisible(), 'start page: "Neues Turnier planen" beside a new game and a new bet');
await H.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await H.waitForTimeout(500);
await H.fill('#tour-name', 'USA Tag 1');
await H.getByRole('button', { name: /Platz wählen/ }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('#tour-name').waitFor({ timeout: 30000 });
ok((await H.locator('#tour-name').inputValue()) === 'USA Tag 1', 'back from the course: the name kept');
for (const n of ['Chris', 'Erik', 'Cedric']) {
  await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill(n);
  await H.locator('input[id^="hcp-"]').last().fill('0');
}
await H.locator('input[id^="hcp-"]').first().fill('0');
const fl = (k) => H.locator('.tour-flight:not(.tour-unplaced)').nth(k);
const names = async (k) => (await fl(k).locator('.tour-flight-player strong').allInnerTexts()).join(',');
const sheet = H.getByRole('dialog', { name: /^Flight \d$/ });
const offered = async () => (await sheet.getByRole('group', { name: 'Spieler des Flights' }).getByRole('button').allInnerTexts()).join(',');
const pressed = async () => (await sheet.getByRole('group', { name: 'Spieler des Flights' }).locator('[aria-pressed="true"]').allInnerTexts()).join(',');
// a fifth player
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Dave');
// Sascha 02.11.2026: "create a flight with its tee time, then assign people to it; flight 2 or 3 only offers those not
// in a flight yet; easy to change afterwards; show who marks whom – as on the tournament's page"
ok((await H.locator('.tour-flight:not(.tour-unplaced)').count()) === 0 && (await H.locator('.tour-unplaced .tour-chip').allInnerTexts()).join(',') === 'Sascha,Chris,Erik,Cedric,Dave', 'no flight yet: all five "Noch ohne Flight"');
await H.getByRole('button', { name: '+ Flight' }).click();
ok((await sheet.getByLabel('Startzeit').inputValue()) === '09:00' && (await sheet.getByRole('button', { name: 'Flight anlegen' }).isDisabled()), 'flight 1: its tee time (09:00), then its players – none chosen yet');
await sheet.getByLabel('Startzeit').fill('12:08');
for (const n of ['Sascha', 'Chris', 'Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
ok((await sheet.getByRole('button', { name: 'Dave', exact: true }).isDisabled()) && (await sheet.getByText('Voll – vier Spieler.').isVisible()), 'four chosen: Dave cannot be added – a flight has at most four');
for (const n of ['Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
await sheet.getByRole('button', { name: 'Flight anlegen' }).click();
const f1 = (await fl(0).innerText()).replace(/\s+/g, ' ');
ok((await names(0)) === 'Sascha,Chris' && (await fl(0).locator('.tour-tee').innerText()) === '12:08', `flight 1: Sascha and Chris at 12:08 (${f1})`);
ok(/Sascha · Zähler: Chris/.test(f1) && /Chris · Zähler: Sascha/.test(f1), 'who marks whom shown – set by the app, as on the tournament page');
await H.getByRole('button', { name: '+ Flight' }).click();
ok((await offered()) === 'Erik,Cedric,Dave' && (await sheet.getByLabel('Startzeit').inputValue()) === '12:18', `flight 2: only those not in a flight yet (${await offered()}); its time 10 minutes on, to the minute`);
await sheet.getByLabel('Startzeit').fill('12:16');
for (const n of ['Erik', 'Cedric']) await sheet.getByRole('button', { name: n, exact: true }).click();
await sheet.getByRole('button', { name: 'Flight anlegen' }).click();
ok((await names(1)) === 'Erik,Cedric' && (await fl(1).locator('.tour-tee').innerText()) === '12:16' && (await H.locator('.tour-unplaced').innerText()).includes('Dave'), 'flight 2: Erik and Cedric at 12:16 – Dave still without a flight');
ok(await H.getByText('Noch ohne Flight').first().isVisible(), 'Dave: "Noch ohne Flight"');
await H.getByRole('button', { name: 'Dave entfernen' }).click();
ok((await H.locator('.tour-unplaced').count()) === 0 && (await H.getByRole('button', { name: '+ Flight' }).isDisabled()), 'Dave taken out: everyone in a flight – "+ Flight" has nobody left to offer');
// changed afterwards: Cedric out of flight 2, into flight 1 – and back
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
ok((await pressed()) === 'Erik,Cedric' && (await sheet.getByLabel('Startzeit').inputValue()) === '12:16', 'flight 2 opened again: its players and its time');
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
// one for all (Sascha 02.11.2026: "a person enters the score for all"): Cedric keeps flight 2's score
await H.getByRole('button', { name: 'Flight 2 ändern' }).click();
ok((await sheet.getByRole('group', { name: 'Wer erfasst die Scores' }).locator('[aria-pressed="true"]').innerText()) === 'Jeder mit Zähler', 'who enters the scores: everyone with a marker, as before');
await sheet.getByRole('button', { name: 'Cedric für alle' }).click();
await sheet.getByRole('button', { name: 'Speichern' }).click();
const f2 = (await fl(1).innerText()).replace(/\s+/g, ' ');
ok(/Cedric erfasst die Scores für alle/.test(f2) && /Erik · Zähler: Cedric/.test(f2) && /Cedric · Zähler: Erik/.test(f2), `flight 2: Cedric for all – Erik's marker, his own card Erik's (${f2})`);
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
  await row.evaluate((e) => e.scrollIntoView({ block: 'center' }));
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
ok(byTime[1]?.scorer === byTime[1]?.players.find((p) => p.name === 'Cedric')?.id && !byTime[0]?.scorer, `server: flight 2 with Cedric as scorer, flight 1 without (${byTime.map((f) => f.scorer ?? '–').join(', ')})`);
ok(fs1.length === 2 && byTime[0].teeTime === '12:08' && byTime[1].teeTime === '12:16', `server: a row per flight with its tee time (${fs1.map((f) => f.teeTime).join(', ')})`);
const specials = ev?.specials ?? [];
const ld = specials.find((s) => s.kind === 'longDrive');
const ntp = specials.find((s) => s.kind === 'nearestPin');
ok(specials.length === 2 && ev.holes[ntp.hole].par === 3 && ev.holes[ld.hole].par >= 4, `server: the two special prizes on their holes (LD ${ld && ev.holes[ld.hole].label}, NTP ${ntp && ev.holes[ntp.hole].label})`);
ok(byTime[0].players.map((p) => p.name).join(',') === 'Sascha,Chris' && byTime[0].markers.p1 === 'p2' && byTime[0].markers.p2 === 'p1' && byTime[0].players.every((p) => p.hcpIndex === 0), 'server: flight 1 Sascha and Chris, marking each other, the HCP kept');
ok((await H.locator('.topbar h1').innerText()).includes('USA Tag 1') && (await H.locator('.tour-tee').allInnerTexts()).join(',') === '12:08,12:16', 'the tournament page: the flights with their tee times');
ok((await H.getByText('Zähler: Chris').count()) === 1 && (await H.getByText('Zähler: Sascha').count()) === 1, 'the tournament page: who marks whom');
ok((await H.getByText('Cedric erfasst die Scores für alle').count()) === 1 && (await H.getByText('Zähler: Cedric').count()) === 1, 'the tournament page: Cedric keeps the score of flight 2');
await H.getByRole('button', { name: new RegExp(`Mitspieler einladen · Code ${code}`) }).click();
ok((await H.locator('.qr-box svg').count()) === 1 && (await H.locator('.join-code').innerText()).trim() === code, 'invite: code and QR code');
// Sascha 02.11.2026: "sending the invitation by WhatsApp does not work for tournaments" – the text and the link apart,
// no title, as the invitations of a round and of a pool (the iPhone's share sheet hands WhatsApp the link)
await H.evaluate(() => {
  window.__shared = null;
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => void (window.__shared = d) });
});
await H.getByRole('dialog', { name: 'Mitspieler einladen' }).getByRole('button', { name: 'Einladung senden' }).click();
const sent = await H.evaluate(() => window.__shared);
ok(!!sent && !('title' in sent) && new RegExp(`#round=${code}$`).test(sent.url ?? '') && /^Turnier „USA Tag 1“ am .+ mit Code \w{6} beitreten$/.test(sent.text ?? ''), `invite: text and link apart, no title (${JSON.stringify(sent)})`);
await H.getByRole('dialog', { name: 'Mitspieler einladen' }).getByRole('button', { name: 'Schließen' }).click();

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
await H.getByRole('button', { name: 'Zu einer Turnierserie zusammenfassen' }).click();
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
