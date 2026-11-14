// QA (Sascha 10.11.2026, USA: "one keeps the score of all – then three signatures at the end, not ideal"; "with one
// scorer the marker hint is not needed"; 11.11.2026: "Erik must not sign for all three – Cedric and Stefan get a push,
// see their card and sign on their own device; the round is over when every card is signed"): a tournament on the
// Hetzenhof short course, Sascha keeps the score of Sascha and Cedric. The flight shows no "Zähler" per player; at the end
// Sascha signs once – his card and Cedric's count – and has no button to sign for Cedric; Cedric gets a push, his phone
// says "Dein Schreiber hat unterschrieben – jetzt du" and he signs his own: then both cards are in.
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
ok(/Als Schreiber unterschreiben/.test(htext) && /Deine Karte und die Zählung von Cedric/.test(htext) && (await hs.getByRole('button', { name: 'Unterschreiben', exact: true }).count()) === 1, `Sascha: one row "Als Schreiber unterschreiben", one button (${htext.slice(0, 160)})`);
const gs = await openCard(G);
const gtext = (await gs.innerText()).replace(/\s+/g, ' ');
ok(/Deine Karte/.test(gtext) && !/für alle/.test(gtext), `Cedric: his own card to sign (${gtext.slice(0, 120)})`);
const pushes0 = sim.pushes.length;
await hs.getByRole('button', { name: 'Unterschreiben', exact: true }).click();
await H.waitForTimeout(4000);
let f = Object.values(sim.event().flights)[0];
const [sa, ce] = f.players;
ok(!!f.signed?.[sa.id]?.player && !!f.signed?.[ce.id]?.marker && !f.signed?.[ce.id]?.player, `server: Sascha's own card signed, Cedric's confirmed by the scorer – not signed for him (${JSON.stringify(f.signed ?? {}).slice(0, 140)})`);
ok(sim.pushes.slice(pushes0).some((x) => x.action === 'signed' && x.player === ce.id && x.as === 'marker'), 'Cedric gets a push to sign his card');
const h2 = (await hs.innerText()).replace(/\s+/g, ' ');
// the overview as status per player (Sascha 14.11.2026, Entwurf A): "1 von 2 unterschrieben", a row for Cedric
ok(/1 von 2 unterschrieben/.test(h2) && /Cedric unterschreibt auf seinem Handy/.test(h2) && (await hs.getByRole('button').filter({ hasText: /nterschreiben/ }).count()) === 0 && !/abgegeben, gesperrt/.test(h2), `Sascha: "1 von 2 unterschrieben", Cedric "unterschreibt auf seinem Handy", no button for him, not handed in yet (${h2.slice(0, 140)})`);
await G.waitForTimeout(12000);
const g2 = (await gs.innerText()).replace(/\s+/g, ' ');
ok(/Dein Schreiber hat unterschrieben – jetzt du/.test(g2), `Cedric: "Dein Schreiber hat unterschrieben – jetzt du" (${g2.slice(0, 120)})`);
await gs.getByRole('button', { name: 'Unterschreiben', exact: true }).click();
await G.waitForTimeout(4000);
f = Object.values(sim.event().flights)[0];
ok(!!f.signed?.[ce.id]?.player && !!f.signed?.[ce.id]?.marker, 'server: Cedric signed his own card on his phone');
ok(/abgegeben, gesperrt/.test(await gs.innerText()), 'Cedric: handed in, locked');
await H.waitForTimeout(12000);
ok(/Alle unterschrieben – abgegeben, gesperrt/.test(await H.locator('.sign-card').innerText().catch(() => '')), 'Sascha: "Alle unterschrieben – abgegeben, gesperrt"');
// the scorecard's tabs (Sascha 14.11.2026, Entwurf E): "Übersicht" and one per player – Cedric's tab: his figures, his
// card only, his handing-in; no own cards of Sascha's there
{
  const tabs = await H.getByRole('tablist', { name: 'Scorekarte von' }).getByRole('tab').allInnerTexts();
  ok(tabs.join('|') === 'Übersicht|Sascha|Cedric', `the tabs: ${tabs.join(' | ')}`);
  if (process.env.SHOTS) await H.locator('.sign-card').screenshot({ path: process.env.SHOTS + '/sign-overview.png' });
  await H.getByRole('tab', { name: 'Cedric' }).click();
  await H.waitForTimeout(800);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/sign-tab.png', fullPage: true });
  const hero = (await H.locator('.sc-hero-player').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const rows = await H.locator('.score-table tbody tr, table tbody tr').allInnerTexts();
  const sign = (await H.locator('.sign-card').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(/^Cedric/.test(hero) && /Schläge/.test(hero), `Cedric's tab: his figures (${hero.slice(0, 60)})`);
  ok(!rows.some((r) => /Sascha/.test(r)), "Cedric's tab: his card only – no row of Sascha");
  ok(/Cedric: unterschrieben – abgegeben, gesperrt/.test(sign) && (await H.locator('.sign-progress').count()) === 0, `Cedric's tab: his handing-in only (${sign.slice(0, 80)})`);
  await H.getByRole('tab', { name: 'Übersicht' }).click();
  await H.waitForTimeout(400);
  ok((await H.locator('.sign-progress').count()) === 1, 'back on the overview: the status of every player');
}

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
