// QA (Sascha 15.11.2026, morning of Hawks Landing: "Hawks Landing hat keine Angabe von Par usw"): the tournament of the
// day was planned while the course had no card – its holes went to the server with par 0, no stroke index, and the
// playing handicaps came out as 76, 82, 73. The host opens "Turnier bearbeiten" and changes the name (saved by itself): the
// holes with par and Hcp from the card, the playing handicaps from the course rating again.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/hawksheal.mjs [url]   (MODE=rename: only
// the name changed, the course not picked again; CACHE=bad: the phone's copy of the course without par)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const mode = process.env.MODE ?? 'rename';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
const code = await sim.plan(H, {
  name: 'Hawks Landing',
  course: 'Hawks Landing',
  option: '.',
  date: tomorrow,
  format: { mode: 'single', scoring: 'net', allowance: 75 },
  flights: [{ players: [{ name: 'Sascha', playingHandicap: 76, hcpIndex: 7, tee: 'Green' }, { name: 'Cedric', playingHandicap: 82, hcpIndex: 12.6, tee: 'Green' }, { name: 'Erik', playingHandicap: 73, hcpIndex: 4.6, tee: 'Green' }] }],
});
// as on the server: par 0, no stroke index
const ev = () => sim.shared.get(code).game;
ev().holes = ev().holes.map((h) => ({ ...h, par: 0, strokeIndex: 0 }));
ok(ev().holes.length === 18 && ev().holes.every((h) => h.par === 0), `planned as on the server: 18 holes, par 0 (${ev().course.name})`);
if (process.env.CACHE === 'bad')
  await H.evaluate((id) => {
    const k = 'golfos.course.v1.' + id;
    const c = JSON.parse(localStorage.getItem(k) ?? 'null');
    if (c) localStorage.setItem(k, JSON.stringify({ ...c, holes: c.holes.map((h) => ({ ...h, par: null, strokeIndex: [] })) }));
  }, ev().course.id);
// Cedric opened the round already before it was mended (JOINED=0: not)
const guest = process.env.JOINED !== '0' ? await sim.phone('Cedric') : null;
if (guest) {
  sim.shared.get(code).game.date = new Date().toLocaleDateString('sv-SE');
  await sim.joinPlanned(guest.p, code);
  await guest.p.waitForTimeout(2000);
}
await H.goto('about:blank');
await H.goto(`${url}#tour=${code}`);
await H.waitForTimeout(3000);
await H.getByRole('button', { name: 'Turnier bearbeiten' }).click();
await H.waitForTimeout(1000);
if (mode === 'repick') {
  await H.locator('.settings-row').filter({ hasText: 'Hawks Landing' }).filter({ hasText: 'Platz' }).first().click();
  await H.fill('#course-search', 'Hawks Landing');
  await H.waitForTimeout(1500);
  await H.locator('button.list-item').filter({ hasText: 'Hawks' }).first().click();
} else {
  await H.fill('#tour-name', 'Hawks Landing · Tag 6');
}
await H.waitForTimeout(5000);
const e = ev();
const pars = e.holes.map((h) => h.par).join('');
const si = e.holes.map((h) => h.strokeIndex);
// the flights as the phones read them (their own rows; the event's copy is the plan)
const flights = [...sim.shared.values()].filter((r) => r.event_code === code).map((r) => r.game.flight);
const players = flights.flatMap((f) => f.players);
if (process.env.DUMP) console.log(JSON.stringify({ flights: e.flights, rows: flights }).slice(0, 2500));
ok(pars === '434545344544343443',`the holes with the card's par (${pars})`);
ok(new Set(si).size === 18 && !si.includes(0), `each hole its stroke index (${si.join(',')})`);
ok(players.length === 3 && players.every((p) => p.playingHandicap != null && p.playingHandicap < 20), `the playing handicaps from the rating again (${players.map((p) => `${p.name} ${p.playingHandicap} ${p.tee}`).join(', ')})`);
if (guest) {
  const G = guest.p;
  await G.goto('about:blank');
  await G.goto(url);
  await G.waitForTimeout(4000);
  const r = await G.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]').find((x) => x.shared));
  const gp = (r?.holes ?? []).map((h) => h.par).join('');
  ok(gp === '434545344544343443', `Cedric, in the round before: his round has the par now (${gp})`);
  ok((r?.players ?? []).every((p) => p.playingHandicap == null || p.playingHandicap < 20), `Cedric's round: the playing handicaps (${(r?.players ?? []).map((p) => `${p.name} ${p.playingHandicap}`).join(', ')})`);
}
ok(host.errs.length === 0,`no page errors ${host.errs.slice(0, 2).join(' | ')}`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/hawksheal.png', fullPage: true });
await b.close();
process.exit(fails ? 1 : 0);
