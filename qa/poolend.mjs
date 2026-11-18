// QA (Sascha 18.11.2026: "Damit einhergehend sind auch die Wetten aus dem Wettpool USA beendet. Demzufolge sollte auch
// dieser Wettpool geschlossen werden und die finale Abrechnung erfolgen. Auch hierzu sollte es eine Meldung in der Inbox
// geben." – "Erst alle Karten signiert"): a pool over yesterday and today, today's tournament its only one, played
// out – its last day the tournament's ("Sollte unser Pool bspw bis 01.12. laufen und die aktuelle Serie heute enden, dann
// bleibt der Pool offen": a second pool, two weeks on, stays open throughout). 1. Cards not signed: the pool "wartet auf Unterschriften", its card lists them, the inbox "USA-Wetten wartet auf
// Unterschriften · 2 Karten offen · 1 davon deine"; no settlement. 2. Both cards in (entered by the host): the host's
// phone closes the pool by itself – "beendet", the inbox "USA-Wetten ist abgerechnet · Endabrechnung: …".
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/poolend.mjs [url]   (SHOTS=dir)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const txt = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const days = await H.evaluate(() => {
  const d = (n) => {
    const x = new Date(Date.now() + n * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { yesterday: d(-1), today: d(0), later: d(14) };
});
// the pool: yesterday and today, Cedric's Pars (each pays) – today's round counts for it
const code = await H.evaluate(async (days) => {
  const ws = await import('/src/lib/wagerstore.ts');
  const pool = {
    kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: days.yesterday, to: days.today, createdAt: new Date().toISOString(), currency: 'USD',
    players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at: new Date().toISOString(), uid: 'Sascha' } }, { id: 'pc', name: 'Cedric' }],
    wagers: [{ id: 'w-p', player: 'pc', kind: 'pars', target: 3, stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' }],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
}, days);
ok(!!code, `the pool: ${code}`);
sim.shared.get(code).game.progress = { 'w-p': { perRound: [{ day: days.today, course: 'Hetzenhof', value: 18, counted: true }], at: new Date().toISOString(), best: 18, done: true, rounds: 1 } };

// a second pool, on for two weeks – the same round counts for it: it stays open
const code2 = await H.evaluate(async (days) => {
  const ws = await import('/src/lib/wagerstore.ts');
  const pool = {
    kind: 'wager-pool', id: 'season', name: 'Saison-Wetten', from: days.yesterday, to: days.later, createdAt: new Date().toISOString(), currency: 'USD',
    players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at: new Date().toISOString(), uid: 'Sascha' } }, { id: 'pc', name: 'Cedric' }],
    wagers: [{ id: 'w-q', player: 'pc', kind: 'pars', target: 3, stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' }],
    progress: {},
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
}, days);
sim.shared.get(code2).game.progress = { 'w-q': { perRound: [{ day: days.today, course: 'Hetzenhof', value: 18, counted: true }], at: new Date().toISOString(), best: 18, done: true, rounds: 1 } };

// today's tournament: played out, every flight in – the cards not signed
const t1 = await sim.plan(H, { name: 'Legends', date: days.today, flights: [{ teeTime: '10:00', players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 10 }] }] });
const flightRows = () => [...sim.shared.entries()].filter(([, r]) => r.event_code === t1);
const ev = sim.shared.get(t1).game;
for (const [, row] of flightRows()) {
  const f = row.game.flight;
  row.game = { kind: 'round-flight', flight: { ...f, scores: Object.fromEntries(f.players.map((p) => [p.id, ev.holes.map((h) => ({ s: h.par }))])), finishedAt: new Date().toISOString() } };
  row.updated_at = new Date().toISOString();
}
const fresh = async () => {
  await H.evaluate(async ({ t1 }) => {
    const sr = await import('/src/lib/sharedround.ts');
    await sr.refreshEvent(t1);
    const ts = await import('/src/lib/tourstore.ts');
    await ts.syncTours();
    const ws = await import('/src/lib/wagerstore.ts');
    await ws.syncPools();
  }, { t1 });
  await H.waitForTimeout(1500);
};
await fresh();
const openPool = async () => {
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(2000);
  await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await H.locator('.list-item:not(.side-bet-row)').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await H.waitForTimeout(1500);
};
const inbox = async () => {
  await H.getByRole('button', { name: /^Inbox/ }).first().click();
  await H.waitForTimeout(800);
  const t = await txt(H.getByRole('dialog').first());
  await H.getByRole('dialog').first().getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});
  await H.waitForTimeout(300);
  return t;
};

// 1. cards to sign
await openPool();
const head = await txt(H.locator('main').first());
ok(/wartet auf Unterschriften/.test(head), 'the pool: "… · wartet auf Unterschriften"');
const card = await txt(H.getByRole('region', { name: 'Karten offen' }));
ok(/Alle Runden sind gespielt/.test(card) && /Sascha \(du\)/.test(card) && /Cedric/.test(card), `its card: whose cards are open (${card.slice(0, 200)})`);
ok(!sim.shared.get(code).game.finishedAt, 'not closed while cards are open');
if (shots) await H.screenshot({ path: `${shots}/poolend-cards.png` });
await H.goto(url);
await H.waitForTimeout(2000);
const in1 = await inbox();
ok(/USA-Wetten wartet auf Unterschriften/.test(in1) && /2 Karten offen · 1 davon deine/.test(in1), `the inbox: "USA-Wetten wartet auf Unterschriften · 2 Karten offen · 1 davon deine" (${in1.slice(0, 260)})`);
ok(!/ist abgerechnet/.test(in1), 'no settlement yet');

// 2. both cards in – entered by the host: the host's phone closes the pool, the final settlement
for (const [, row] of flightRows()) {
  const f = row.game.flight;
  row.game = { kind: 'round-flight', flight: { ...f, entered: Object.fromEntries(f.players.map((p) => [p.id, new Date().toISOString()])) } };
  row.updated_at = new Date().toISOString();
}
await fresh();
ok(!!sim.shared.get(code).game.finishedAt, 'every card in: the pool closed by the host\'s phone (finishedAt on the server)');
await fresh();
await openPool();
const head2 = await txt(H.locator('main').first());
ok(/beendet/.test(head2) && !/wartet auf Unterschriften/.test(head2), 'the pool: "… · beendet"');
await H.goto(url);
await H.waitForTimeout(2000);
const in2 = await inbox();
// Cedric made his Pars – each pays: Sascha 20 $ to him
ok(/USA-Wetten ist abgerechnet/.test(in2) && /Endabrechnung: −20 \$ · du zahlst noch 20 \$/.test(in2), `the inbox: "USA-Wetten ist abgerechnet · Endabrechnung: −20 $ · du zahlst noch 20 $" (${in2.slice(0, 260)})`);
ok(!/wartet auf Unterschriften/.test(in2), '"wartet auf Unterschriften" gone');
ok(!/Saison-Wetten/.test(in1 + in2), 'the pool running on: no message at all');
ok(!sim.shared.get(code2).game.finishedAt, 'the pool running on (two weeks): stays open – only the tournament is over');
if (shots) await H.screenshot({ path: `${shots}/poolend-settled.png` });
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
