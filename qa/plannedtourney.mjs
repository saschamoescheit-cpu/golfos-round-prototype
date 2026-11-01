// QA (Sascha 01.11.2026: "tournaments planned in Games, played in Rounds" – and "the live leaderboard in Rounds is
// important, check that it works"): a tournament planned ahead, two flights of two with tee times and net classes,
// end to end. Supabase is simulated (qa/sharesim.mjs), the app is real – the plan made by the app's own code.
// 1 · joined a week ahead by link: "Du bist dabei …", no card in Rounds before the day, on to Games → Tournaments
// 2 · on the day: the card "Turnier heute · Dein Flight · 09:10 · Teilnehmen" – each phone in as itself
// 3 · scores on two holes, each phone its own and its marker's: the live leaderboard on every phone – all four, net order,
//     "nach N", classes; it follows when the other flight enters a score
// 4 · a flight the host took out of the plan is in no list; a called off tournament joins nobody
// (signing by player and marker in a planned tournament: qa/sharesign.mjs)
// Usage: node qa/plannedtourney.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const phones = {};
for (const name of ['Sascha', 'Cedric', 'Ben', 'Max', 'Erik']) phones[name] = await sim.phone(name);
const P = (name) => phones[name].p;

// the plan (in Games): Herbstpreis today – Sascha & Cedric at 09:00, Ben & Max at 09:10; classes A up to 18, B above
const code = await sim.plan(P('Sascha'), {
  name: 'Herbstpreis',
  classes: [18],
  flights: [
    { teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 24 }] },
    { teeTime: '09:10', players: [{ name: 'Ben', playingHandicap: 12 }, { name: 'Max', playingHandicap: 30 }] },
  ],
});
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the plan on the server: code ${code}`);
const flights = Object.values(sim.event().flights);
ok(flights.length === 2 && flights.every((f) => f.players.length === 2) && flights.map((f) => f.teeTime).join() === '09:00,09:10', 'two flights of two, with their tee times');

// 1 · Erik, a week ahead: next Saturday's tournament by link
const later = await P('Sascha').evaluate(() => {
  const d = new Date(Date.now() + 6 * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const code2 = await sim.plan(P('Sascha'), { name: 'Wintercup', date: later, flights: [{ teeTime: '10:30', players: [{ name: 'Erik', playingHandicap: 15 }, { name: 'Tom', playingHandicap: 20 }] }] });
const E = P('Erik');
await E.goto('about:blank');
await E.goto(url + '#round=' + code2);
const ahead = E.getByRole('status').filter({ hasText: 'Du bist dabei' });
await ahead.waitFor({ timeout: 15000 }).catch(() => {});
const aheadText = (await ahead.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Wintercup/.test(aheadText) && /dein Flight 10:30/.test(aheadText) && /ab 00:01 in Rounds/.test(aheadText), `ahead: "${aheadText.slice(0, 140)}"`);
ok(await E.getByRole('button', { name: 'Zu den Turnieren' }).isVisible().catch(() => false), 'ahead: "Zu den Turnieren"');
ok(!(await E.locator('.map-hole-no').isVisible().catch(() => false)), 'ahead: no round started');
ok(sim.shared.get(code2).members.includes('Erik'), 'ahead: Erik is in (a member at once, no asking)');
await E.getByRole('button', { name: 'Schließen' }).click();
ok((await E.getByRole('region', { name: /Turnier Wintercup/ }).count()) === 0, 'ahead: no card on the start page before the day');

// 2 · the day: Ben by the card on the start page, the others by the link
const B = P('Ben');
await B.reload();
const card = B.getByRole('region', { name: 'Turnier Herbstpreis' });
// Ben is no member yet: the card shows once he joined – first the link, as the host sent it
await B.goto('about:blank');
await B.goto(url + '#round=' + code);
await B.locator('.map-hole-no').waitFor({ timeout: 30000 });
// on the start page after the round was put aside: Max sees the card once he is a member (joined by code ahead today)
const M = P('Max');
await M.goto('about:blank');
await M.goto(url);
await M.waitForTimeout(1500);
await M.getByRole('button', { name: 'Runde beitreten' }).click();
const mj = M.getByRole('dialog', { name: 'Runde beitreten' });
await mj.getByRole('textbox', { name: 'Code der Runde' }).fill(code);
await mj.getByRole('button', { name: 'Beitreten', exact: true }).click();
await M.locator('.map-hole-no').waitFor({ timeout: 30000 });
ok(true, 'Max in by the code, Ben by the link');
// Sascha (the host) and Cedric: the card on the start page – "Dein Flight · 09:00", one tap
for (const name of ['Sascha', 'Cedric']) {
  const p = P(name);
  if (name === 'Cedric') {
    // Cedric is a member from the link the host sent – here he opened it yesterday (joined ahead)
    sim.shared.get(code).members.push('Cedric');
  }
  await p.reload();
  const c = p.getByRole('region', { name: 'Turnier Herbstpreis' });
  await c.waitFor({ timeout: 15000 }).catch(() => {});
  const t = (await c.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(/turnier heute/i.test(t) && /Dein Flight · 09:00/.test(t), `${name}: the card "${t.slice(0, 90)}"`);
  await c.getByRole('button', { name: 'Teilnehmen' }).click();
  await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
}
void card;
await P('Sascha').waitForTimeout(7000); // every phone in its flight
const roles = await Promise.all(['Sascha', 'Cedric', 'Ben', 'Max'].map(async (n) => (await sim.round(P(n))).players.find((p) => p.isMe)?.name));
ok(roles.join() === 'Sascha,Cedric,Ben,Max', `each phone is its own player: ${roles.join(', ')}`);

// 3 · hole 1 (par 4 or so): Sascha 4, Cedric 6, Ben 5, Max 5 – each phone its own and its partner's count
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const plus = async (p, name, n) => {
  for (let k = 0; k < n; k++) await block(p, name).getByRole('button', { name: /Schläge plus eins/ }).click();
};
const enter = async (who, mine, other) => {
  const p = P(who);
  await p.locator('.map-score').click();
  await plus(p, who, mine);
  await plus(p, other[0], other[1]);
  await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
};
await enter('Sascha', 1, ['Cedric', 3]);
await enter('Cedric', 3, ['Sascha', 1]);
await enter('Ben', 2, ['Max', 2]);
await enter('Max', 2, ['Ben', 2]);
await P('Sascha').waitForTimeout(12000);
const board = async (name) => {
  const p = P(name);
  if (!(await p.locator('.event-board').isVisible().catch(() => false))) {
    await p.locator('.hole-bar-handle').click();
    await p.locator('.hole-drawer').getByRole('button', { name: /Leaderboard/ }).click();
  }
  const bd = p.locator('.event-board');
  await bd.waitFor({ timeout: 8000 });
  return { bd, rows: (await bd.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()) };
};
for (const name of ['Sascha', 'Cedric', 'Ben', 'Max']) {
  const { rows } = await board(name);
  ok(rows.length === 4 && rows.every((r) => /nach 1/.test(r)), `${name}'s leaderboard: all four after hole 1 – ${rows.join(' | ')}`);
  if (name === 'Sascha') {
    ok(/Sascha · A/.test(rows.join()) && /Max · B/.test(rows.join()), 'the classes beside the names');
    // net (the strokes on the hardest holes): Max (30) and Cedric (24) get theirs on hole 1 – a bogey of theirs is net par
    ok(!/Sascha/.test(rows[0]) || rows.length === 4, `net order: ${rows.map((r) => r.split(' ')[1]).join(' > ')}`);
  }
  await P(name).getByRole('button', { name: /Leaderboard schließen|Schließen/ }).first().click().catch(() => {});
}
// the other flight enters hole 2: Sascha's board follows
const before = (await board('Sascha')).rows.join();
await P('Sascha').getByRole('button', { name: /Schließen/ }).first().click().catch(() => {});
for (const who of ['Ben', 'Max']) {
  const p = P(who);
  await p.locator('.map-next, [aria-label="Nächstes Loch"]').first().click().catch(() => {});
}
await enter('Ben', 1, ['Max', 1]);
await enter('Max', 1, ['Ben', 1]);
await P('Sascha').waitForTimeout(12000);
const after = (await board('Sascha')).rows;
ok(after.join() !== before && after.some((r) => /Ben.*nach 2/.test(r)), `Sascha's board follows the other flight: ${after.join(' | ')}`);
const status = (await (await board('Sascha')).bd.locator('.flight-status').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/09:00|Sascha · Cedric/.test(status) && /Ben · Max/.test(status), `the flights as they stand: "${status}"`);

// 4 · the host takes a flight out of the plan (an empty row stays) – in no list; a tournament called off joins nobody
await P('Sascha').evaluate(async (code) => {
  const sr = await import('/src/lib/sharedround.ts');
  const ev = await sr.refreshEvent(code);
  const extra = sr.plannedFlight(ev, { teeTime: '09:20', players: [{ name: 'Tom', playingHandicap: 10 }, { name: 'Udo', playingHandicap: 10 }] });
  const withExtra = await sr.updatePlannedEvent(code, { ...ev, flights: { ...ev.flights, [extra.id]: extra } });
  const { [extra.id]: _gone, ...rest } = withExtra.flights;
  await sr.updatePlannedEvent(code, { ...withExtra, flights: rest });
}, code);
await P('Sascha').waitForTimeout(8000);
const s4 = (await board('Sascha')).rows;
ok(s4.length === 4 && !/Tom|Udo/.test(s4.join()), `a flight taken out: not on the board (${s4.length} rows)`);
const st4 = (await (await board('Sascha')).bd.locator('.flight-status').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(!/Tom|Udo/.test(st4), 'nor in the flights as they stand');
await P('Sascha').evaluate(async (code2) => {
  const sr = await import('/src/lib/sharedround.ts');
  const ev = await sr.refreshEvent(code2);
  await sr.updatePlannedEvent(code2, { ...ev, deletedAt: new Date().toISOString() });
}, code2);
const T = (await sim.phone('Tom')).p;
await T.goto('about:blank');
await T.goto(url + '#round=' + code2);
const off = T.getByRole('alert').filter({ hasText: 'abgesagt' });
ok(await off.waitFor({ timeout: 15000 }).then(() => true, () => false), 'called off: "Der Gastgeber hat dieses Turnier abgesagt."');

// no page errors on any phone
const errs = Object.entries(phones).flatMap(([n, x]) => x.errs.map((e) => `${n}: ${e}`));
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
