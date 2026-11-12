// QA (Sascha 07.11.2026: "in tournaments the whole block Format is missing – Rundenart with Turnier, and every other
// setting too"; every mode): a "Vierer" planned in Tournaments – the teams formed in the flight (players 1 & 2, 3 & 4)
// with the team handicap, read back one by one when changed, the page "Vierer · Zählspiel netto"; on the day a phone
// joins by its name and plays its team. A Better Ball's leaderboard: each pair one row, the better ball per hole.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/tourteams.mjs [url]
import { webkit } from 'playwright';
import { onOff, flip } from './onoff.mjs';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;

// ---------- planned in Tournaments: the Format block, mode "Vierer" ----------
await H.evaluate(() => sessionStorage.removeItem('golfos.module'));
await H.reload();
await H.waitForTimeout(1200);
await H.locator('.module-card').filter({ hasText: 'Tournaments' }).click();
await H.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await H.waitForTimeout(500);
await H.fill('#tour-name', 'Vierer-Cup');
await H.getByRole('button', { name: /Platz wählen/ }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.locator('#tour-name').waitFor({ timeout: 30000 });
const row = (label) => H.locator('.settings-row').filter({ hasText: new RegExp(`^${label}`) }).first();
await row('Modus').click();
await H.locator('.sheet .pick-option').filter({ hasText: /^Vierer/ }).first().click();
await H.waitForTimeout(200);
ok(/Vierer/.test(await row('Modus').innerText()) && /100 %/.test(await row('HCP-Vorgabe').innerText()), `Vierer: the team handicap carries the share – 100 % (${(await row('HCP-Vorgabe').innerText()).replace(/\s+/g, ' ')})`);
ok((await H.getByText(/Spieler 1 & 2 und 3 & 4 als Team mit einem Ball/).count()) === 1, 'how the teams come about, under the format');
// an internal tournament (Sascha 07.11.2026): every function – the switch under the format, off to start with
const aids = onOff(H, /Alle Funktionen/);
ok((await aids.count()) === 1 && (await aids.getAttribute('data-on')) === 'false', '"Alle Funktionen" in the format, off (Rule 4.3)');
// a row of the format list (Sascha 08.11.2026)
ok((await H.locator('.settings-list').filter({ hasText: 'HCP-Vorgabe' }).locator('.onoff-row').filter({ hasText: 'Alle Funktionen' }).count()) === 1, '"Alle Funktionen" is a row of the settings list (Facelift 11.11.2026, t5: under "Einstellungen")');
await flip(aids);
await H.locator('input[id^="hcp-"]').first().fill('10');
for (const [n, h] of [['Erik', '4'], ['Cedric', '20'], ['Christopher', '0']]) {
  await H.getByRole('button', { name: 'Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill(n);
  await H.locator('input[id^="hcp-"]').last().fill(h);
}
await H.waitForTimeout(400);
await H.getByRole('button', { name: 'Turnier anlegen' }).click();
await H.waitForTimeout(2500);
const code = [...sim.shared.entries()].find(([, r]) => !r.event_code && r.game?.name === 'Vierer-Cup')?.[0];
const ev = code ? sim.event() : null;
ok(ev?.format?.mode === 'foursome' && ev.format.allowance === 100 && ev.format.aids === true && ev.roundKind === 'tournament', `on the server: Vierer, 100 %, a tournament (${JSON.stringify(ev?.format)} ${ev?.roundKind})`);
const fl = ev ? Object.values(ev.flights).filter((f) => f.players.length) : [];
const teams = fl.flatMap((f) => f.players);
ok(fl.length === 1 && teams.length === 2 && teams.every((t) => / & /.test(t.name) && t.members?.length === 2), `one flight, two teams of two: ${teams.map((t) => `${t.name} (${t.playingHandicap})`).join(' · ')}`);
ok(teams.every((t) => t.playingHandicap != null && t.playingHandicap === Math.round(t.members.reduce((s, m) => s + (m.playingHandicap ?? 0), 0) / 2)), 'each team with the foursomes handicap: half the two playing handicaps');
ok(Object.keys(fl[0]?.markers ?? {}).length === 2 && fl[0].markers.p1 === 'p2' && fl[0].markers.p2 === 'p1', `the two teams mark each other (${JSON.stringify(fl[0]?.markers)})`);
// the page: the format in one line
await H.waitForTimeout(800);
ok(/Vierer · Zählspiel netto/.test(await H.locator('main').innerText()), 'the tournament\'s page: "Vierer · Zählspiel netto"');
// changed again: the players one by one, as planned
await H.getByRole('button', { name: 'Turnier bearbeiten' }).click();
await H.waitForTimeout(800);
const names = await H.locator('input[id^="name-"]').evaluateAll((xs) => xs.map((x) => x.value));
ok(names.length === 4 && ['Sascha', 'Erik', 'Cedric', 'Christopher'].every((n) => names.includes(n)) && /Vierer/.test(await row('Modus').innerText()) && (await aids.getAttribute('data-on')) === 'true', `changed: the four players one by one, the mode kept (${names.join(', ')})`);

// ---------- on the day: a phone joins by its name – its team ----------
const erik = await sim.phone('Erik');
await sim.joinPlanned(erik.p, code);
const r = await sim.round(erik.p);
const mine = r?.players.find((p) => p.isMe);
ok(r?.format?.mode === 'foursome' && r.format.aids === true && r.kind === 'tournament' && r.players.length === 2 && / & /.test(mine?.name ?? '') && /Erik/.test(mine?.name ?? ''), `Erik on the day: Rounds plays his team (${r?.players.map((p) => `${p.name}${p.isMe ? ' – me' : ''}`).join(' · ')})`);

// ---------- a Better Ball: each pair one row on the leaderboard ----------
const bb = await sim.plan(H, {
  name: 'Better-Ball-Cup',
  format: { mode: 'fourball', scoring: 'stroke', allowance: 0 },
  flights: [{ players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Erik', playingHandicap: 4 }, { name: 'Cedric', playingHandicap: 20 }, { name: 'Christopher', playingHandicap: 0 }] }],
});
const own = [...sim.shared.values()].find((x) => x.event_code === bb);
const n = sim.shared.get(bb).game.holes.length;
const s = (first) => Array.from({ length: n }, (_, i) => ({ s: i === 0 ? first : 4 }));
own.game.flight.scores = { p1: s(5), p2: s(3), p3: s(6), p4: s(4) }; // Sascha & Erik: 3 on hole 1 · Cedric & Christopher: 4
own.updated_at = new Date().toISOString();
await H.goto('about:blank');
await H.goto(`${url}#tour=${bb}`);
const board = H.getByRole('region', { name: 'Live-Leaderboard' });
await board.waitFor({ timeout: 20000 }).catch(() => {});
await H.waitForTimeout(1500);
const lb = (await board.locator('.lb-rows li').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').trim());
ok(lb.length === 2 && /Sascha & Erik/.test(lb[0]) && /Cedric & Christopher/.test(lb[1]), `Better Ball: each pair one row, the better ball counting (${lb.join(' | ')})`);
ok(/Better Ball · Zählspiel brutto/.test(await H.locator('main').innerText()), 'its page: "Better Ball · Zählspiel brutto"');

ok([...host.errs, ...erik.errs].length === 0, `no page errors ${[...host.errs, ...erik.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
