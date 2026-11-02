// QA (Sascha 01.11.2026: "several tournaments as a series – one code for all"): the Rounds side of a series planned
// in Games. Supabase is simulated (qa/sharesim.mjs), the app is real – the rounds planned by the app's own code.
// 1 · Erik opens the series' link before it starts: "Du bist dabei: USA-Serie · 2 Runden" with its days and courses,
//     his flight in round 1 with its tee time – and he is in every round (no asking)
// 2 · the day of round 1: the card "Turnier heute" on the start page; "Heute teilnehmen" from the series' link too
// 3 · a series called off: said so, nobody joins
// Usage: node qa/tourseries.mjs [url]
import { webkit } from 'playwright';
import { sharedServer, teeSoon } from './sharesim.mjs';
const [T1, T2] = [teeSoon(30), teeSoon(40)]; // later today, whatever the hour
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const day = (n) =>
  H.evaluate((n) => {
    const d = new Date(Date.now() + n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, n);
const flights = [
  { teeTime: T1, players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Erik', playingHandicap: 8 }] },
  { teeTime: T2, players: [{ name: 'Chris', playingHandicap: 6 }, { name: 'Cedric', playingHandicap: 5 }] },
];
const r1 = await sim.plan(H, { name: 'USA Tag 1', date: await day(0), flights });
const r2 = await sim.plan(H, { name: 'USA Tag 2', date: await day(2), flights });
const code = sim.series('Sascha', 'USA-Serie', [r2, r1]);

// 1 · Erik by the series' link
const erik = await sim.phone('Erik');
const E = erik.p;
await E.goto('about:blank');
await E.goto(url + '#round=' + code);
const box = E.getByRole('status', { name: 'Serie' });
await box.waitFor({ timeout: 15000 }).catch(() => {});
await E.waitForTimeout(1500); // the flight of round 1 read
const t = (await box.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Du bist dabei: USA-Serie/.test(t) && /2 Runden/.test(t), `the series: "${t.slice(0, 160)}"`);
ok(t.includes(`dein Flight in Runde 1 ${T1}`), 'his flight in round 1 with its tee time');
ok((t.match(/Golfclub Hetzenhof/g) ?? []).length === 2, 'both rounds with their day and course');
ok([code, r1, r2].every((c) => sim.shared.get(c).members.includes('Erik')), 'Erik is in the series and in both rounds – no asking');
ok(await box.getByRole('button', { name: 'Heute teilnehmen' }).isVisible(), 'a round today: "Heute teilnehmen"');
ok(await E.getByRole('button', { name: 'Zu den Turnieren' }).isVisible(), '"Zu den Turnieren"');
await box.getByRole('button', { name: 'Heute teilnehmen' }).click();
await E.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
const er = await sim.round(E);
ok(er?.shared?.code === r1 && er.players.find((p) => p.isMe)?.name === 'Erik', `Erik plays round 1 as himself (${er?.shared?.code})`);

// 2 · Chris, member by the series: the card on the start page on the day
const chris = await sim.phone('Chris');
const C = chris.p;
await C.goto('about:blank');
await C.goto(url + '#round=' + code);
await C.getByRole('status', { name: 'Serie' }).waitFor({ timeout: 15000 }).catch(() => {});
await C.getByRole('button', { name: 'Schließen' }).click();
await C.reload();
const card = C.getByRole('region', { name: 'Turnier USA Tag 1' });
await card.waitFor({ timeout: 15000 }).catch(() => {});
ok(new RegExp(`Dein Flight · ${T2}`).test((await card.innerText().catch(() => '')).replace(/\s+/g, ' ')), 'Chris: the card of round 1 on the start page – "Dein Flight · 09:30"');
ok((await C.getByRole('region', { name: 'Turnier USA Tag 2' }).count()) === 0, 'round 2 not before its day');

// 3 · called off
const off = sim.series('Sascha', 'Abgesagt-Serie', [r2], { deletedAt: new Date().toISOString() });
const tom = await sim.phone('Tom');
await tom.p.goto('about:blank');
await tom.p.goto(url + '#round=' + off);
ok(await tom.p.getByRole('alert').filter({ hasText: 'diese Serie abgesagt' }).waitFor({ timeout: 15000 }).then(() => true, () => false), 'called off: "Der Gastgeber hat diese Serie abgesagt."');
ok(!sim.shared.get(r2).members.includes('Tom'), 'Tom not in its rounds');

const errs = [host, erik, chris, tom].flatMap((x) => x.errs);
ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
