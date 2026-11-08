// QA (Sascha 08.11.2026, on the course in the USA: Cedric's place showed "auf dem Handy von Sascha" and the app asked
// whether he is Sascha – "such questions must not come, every app user has his own profile"): a planned tournament,
// Sascha joins, the host's plan changes so its places move (Cedric where Sascha was) – Cedric joins straight onto his
// own place, no "who are you?"; Sascha's phone goes back to Sascha by itself.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/ownplace.mjs [url]
import { webkit } from 'playwright';
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
const code = await sim.plan(host.p, {
  name: 'Orlando Tag 2',
  flights: [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Cedric', playingHandicap: 20 }, { name: 'Erik', playingHandicap: 4 }] }],
});
const ownRow = () => [...sim.shared.values()].find((r) => r.event_code === code);

// Sascha joins on his own phone
await sim.joinPlanned(host.p, code);
ok((await sim.round(host.p))?.players.find((p) => p.isMe)?.name === 'Sascha', 'Sascha joins: he is Sascha');
await host.p.waitForTimeout(4000);
const sid = ownRow().game.flight.players.find((p) => p.name === 'Sascha').id;
ok(Object.values(ownRow().game.flight.phones ?? {}).some((x) => x.player === sid && x.name === 'Sascha'), "the flight: Sascha's phone holds Sascha");

// the plan changes (Cedric the scorer, now first): the places move – Sascha's phone points at Cedric's place now
const fl = ownRow().game.flight;
const [ps, pc, pe] = fl.players;
fl.players = [{ ...pc, id: ps.id }, { ...ps, id: pc.id }, pe];
fl.scorer = ps.id; // Cedric's place
ok(fl.players.find((p) => p.id === sid).name === 'Cedric', `the plan moved: Sascha's old place is Cedric's now`);

// Cedric joins: on his own place at once – no "who are you?", no "on Sascha's phone"
const cedric = await sim.phone('Cedric');
const C = cedric.p;
await C.goto('about:blank');
await C.goto(`${url}#round=${code}`);
const asked = C.getByText(/wer bist du\?/i);
const inRound = C.locator('.map-hole-no');
await Promise.race([inRound.waitFor({ timeout: 30000 }), asked.waitFor({ timeout: 30000 })]).catch(() => {});
ok((await asked.count()) === 0, `Cedric is not asked who he is${(await asked.count()) ? ` (${(await C.locator('.chip-set').first().innerText().catch(() => '')).replace(/\s+/g, ' ')})` : ''}`);
const rc = await sim.round(C);
ok(rc?.players.find((p) => p.isMe)?.name === 'Cedric', `Cedric is in as Cedric (${rc?.players.find((p) => p.isMe)?.name ?? 'not in'})`);

// both phones exchange: Cedric keeps his place, Sascha's phone is Sascha again
await C.waitForTimeout(9000);
await host.p.waitForTimeout(2000);
const f2 = ownRow().game.flight;
const cid = f2.players.find((p) => p.name === 'Cedric').id;
const sid2 = f2.players.find((p) => p.name === 'Sascha').id;
const newest = (pid) => Object.values(f2.phones ?? {}).filter((x) => x.player === pid).sort((a, b) => b.at.localeCompare(a.at))[0];
ok(newest(cid)?.name === 'Cedric', `the flight: Cedric's place on Cedric's phone (${newest(cid)?.name})`);
ok(newest(sid2)?.name === 'Sascha', `the flight: Sascha's place on Sascha's phone again (${newest(sid2)?.name})`);
ok((await sim.round(host.p))?.players.find((p) => p.isMe)?.name === 'Sascha', `Sascha's phone: Sascha again (${(await sim.round(host.p))?.players.find((p) => p.isMe)?.name})`);

const errs = [...host.errs, ...cedric.errs];
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
