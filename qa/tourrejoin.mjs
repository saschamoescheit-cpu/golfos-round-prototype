// QA (Sascha 07.11.2026, on the course in the USA: "we started the tournament, some ended the round and could not get
// back in – Cedric was only asked whether he is Sascha. Finished and taking part again must work"): a planned
// tournament, Cedric (the flight's scorer) joins, his round ends – Rounds offers "Wieder teilnehmen", he is in again
// as Cedric on his own player, the flight opened again; a new phone of his (the same account) too.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/tourrejoin.mjs [url]
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
  name: 'Orlando Tag 1',
  flights: [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Cedric', playingHandicap: 20 }, { name: 'Erik', playingHandicap: 4 }] }],
});
const ownRow = () => [...sim.shared.values()].find((r) => r.event_code === code);
// Cedric keeps the score of all (as on the course)
ownRow().game.flight.scorer = ownRow().game.flight.players.find((p) => p.name === 'Cedric').id;

const cedric = await sim.phone('Cedric');
const C = cedric.p;
await sim.joinPlanned(C, code);
const r1 = await sim.round(C);
const cid = ownRow().game.flight.players.find((p) => p.name === 'Cedric').id;
ok(r1?.players.find((p) => p.isMe)?.name === 'Cedric', 'Cedric joins: he is Cedric');
await C.waitForTimeout(4000);
ok(Object.values(ownRow().game.flight.phones ?? {}).some((x) => x.player === cid), "the flight: Cedric's phone holds Cedric");

// his round ends (the hole menu → "Runde beenden"), the flight finished
await C.locator('.hole-bar-handle').click();
await C.locator('.hole-drawer').getByRole('button', { name: /(Runde|Spiel) beenden/ }).click();
await C.getByRole('button', { name: /Speichern & beenden/ }).click();
await C.waitForTimeout(5000);
ok(!!ownRow().game.flight.finishedAt, 'his round ended: the flight finished on the server');

// back on Rounds' start page: the tournament still there – "Wieder teilnehmen"
await C.goto('about:blank');
await C.goto(url);
await C.waitForTimeout(800);
await C.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
await C.reload();
await C.waitForTimeout(1500);
await C.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Spielen' }).click().catch(() => {});
const card = C.locator('section.play-card').filter({ hasText: 'Orlando Tag 1' });
await card.waitFor({ timeout: 15000 }).catch(() => {});
ok((await card.count()) === 1 && /beendet/.test(await card.innerText()) && (await card.getByRole('button', { name: 'Wieder teilnehmen' }).count()) === 1 && (await card.getByRole('button', { name: 'Ergebnis ansehen' }).count()) === 1, `Rounds: "Orlando Tag 1 · beendet" – "Wieder teilnehmen" (${(await card.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
await card.getByRole('button', { name: 'Wieder teilnehmen' }).click();
await C.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
const r2 = await sim.round(C);
ok(r2?.players.find((p) => p.isMe)?.name === 'Cedric' && !r2.finishedAt, `in again as Cedric – no "who are you?" (${r2?.players.find((p) => p.isMe)?.name})`);
await C.waitForTimeout(4000);
ok(!ownRow().game.flight.finishedAt, 'the flight open again on the server');

// a new phone of his, the same account (the app deleted and set up again): his player is his – in at once
const cedric2 = await sim.phone('Cedric');
await cedric2.p.goto('about:blank');
await cedric2.p.goto(`${url}#round=${code}`);
await cedric2.p.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
const r3 = await sim.round(cedric2.p);
ok(r3?.players.find((p) => p.isMe)?.name === 'Cedric', `a new phone of Cedric's: in as Cedric at once (${r3?.players.find((p) => p.isMe)?.name ?? 'not in'})`);

// another player's phone does not take Cedric: Erik joins – himself, Cedric's chip shows whose phone it is on
const erik = await sim.phone('Erik');
await sim.joinPlanned(erik.p, code);
ok((await sim.round(erik.p))?.players.find((p) => p.isMe)?.name === 'Erik', 'Erik joins: he is Erik');

const errs = [...host.errs, ...cedric.errs, ...cedric2.errs, ...erik.errs];
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
