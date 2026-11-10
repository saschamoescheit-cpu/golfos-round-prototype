// QA (Sascha 10.11.2026, USA: "one keeps the score of all – then three signatures at the end, not ideal"; "with one
// scorer the marker hint is not needed"): a tournament on the Hetzenhof short course, Sascha keeps the score of Sascha
// and Cedric. The flight shows no "Zähler" per player; at the end Sascha signs once – "Alle unterschreiben" – and both
// cards are handed in; Cedric's phone says "Sascha unterschreibt für alle" without a button of its own.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/scorersign.mjs [url]
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
const host = await sim.phone('Sascha');
const H = host.p;
// Sascha ("p1") the flight's scorer – and a marker twice in the plan, as on 10.11. (no sense: paired anew)
const code = await sim.plan(H, { name: 'Kurzplatz-Cup', option: 'Kurzplatz', format: { mode: 'single', scoring: 'net', allowance: 100 }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: 10 }], scorer: 'p1', markers: { p1: 'p2', p2: 'p2' } }] });
await sim.joinPlanned(H, code);
const guest = await sim.phone('Cedric');
const G = guest.p;
await sim.joinPlanned(G, code);
await H.waitForTimeout(6000);

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const holes = (await sim.round(H)).holes.length;
for (let i = 0; i < holes; i++) {
  await H.locator('.map-score').click();
  await block(H, 'Sascha').getByRole('button', { name: /Schläge plus eins/ }).click();
  await block(H, 'Cedric').getByRole('button', { name: /Schläge plus eins/ }).click();
  if (i < holes - 1) await H.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  else await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await H.waitForTimeout(300);
}
await H.waitForTimeout(8000);
const openCard = async (p) => {
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
  await p.locator('.sign-card').waitFor({ timeout: 10000 });
  return p.locator('.sign-card');
};
const hs = await openCard(H);
const htext = (await hs.innerText()).replace(/\s+/g, ' ');
ok(/Alle 2 Karten – als Schreiber/.test(htext) && (await hs.getByRole('button', { name: 'Alle unterschreiben' }).count()) === 1 && (await hs.getByRole('button', { name: 'Unterschreiben', exact: true }).count()) === 0, `Sascha: one row, one button "Alle unterschreiben" (${htext.slice(0, 140)})`);
const gs = await openCard(G);
const gtext = (await gs.innerText()).replace(/\s+/g, ' ');
ok(/Sascha unterschreibt für alle/.test(gtext) && (await gs.getByRole('button').filter({ hasText: /nterschreiben/ }).count()) === 0, `Cedric: "Sascha unterschreibt für alle", no button (${gtext.slice(0, 120)})`);
await hs.getByRole('button', { name: 'Alle unterschreiben' }).click();
await H.waitForTimeout(4000);
const f = Object.values(sim.event().flights)[0];
ok(f.players.every((p) => f.signed?.[p.id]?.marker), `server: both cards signed by the scorer (${JSON.stringify(f.signed ?? {}).slice(0, 120)})`);
ok(/abgegeben, gesperrt/.test(await hs.innerText()), 'Sascha: "Unterschrieben – abgegeben, gesperrt"');
await G.waitForTimeout(12000);
ok(/abgegeben, gesperrt/.test(await G.locator('.sign-card').innerText().catch(() => '')), 'Cedric: handed in too');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
