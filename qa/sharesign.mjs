// QA (Sascha's concept 30.10.2026, the night run – "player and marker confirm the card, then it is locked"): a
// tournament on the Hetzenhof short course (6 holes), Sascha and Cedric mark each other. Every hole entered on both
// phones; on the scorecard each signs his own card and, as marker, the partner's. Signed by both, it is handed in: the
// score panel locks it, the leaderboard says "unterschrieben". Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/sharesign.mjs [url]
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
// (tournaments are planned in Games since 01.11.2026 – the plan made by the app's own code, then both join by link)
const code = await sim.plan(H, { name: 'Kurzplatz-Cup', option: 'Kurzplatz', format: { mode: 'single', scoring: 'net', allowance: 100 }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Cedric', playingHandicap: null }] }] });
await sim.joinPlanned(H, code);
const guest = await sim.phone('Cedric');
const G = guest.p;
await sim.joinPlanned(G, code);
await H.waitForTimeout(6000);

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const holes = (await sim.round(H)).holes.length;
ok(holes === 6, `the short course: ${holes} holes`);
for (let i = 0; i < holes; i++) {
  for (const [p, me, other] of [[H, 'Sascha', 'Cedric'], [G, 'Cedric', 'Sascha']]) {
    await p.locator('.map-score').click();
    await block(p, me).getByRole('button', { name: /Schläge plus eins/ }).click();
    await block(p, other).getByRole('button', { name: /Schläge plus eins/ }).click();
    // hole 2: Sascha counts Cedric one stroke more than Cedric himself – corrected on the scorecard below
    if (i === 1 && me === 'Sascha') await block(p, other).getByRole('button', { name: /Schläge plus eins/ }).click();
    if (i < holes - 1) await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
    else await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
    await p.waitForTimeout(300);
  }
}
await H.waitForTimeout(12000);
const openCard = async (p) => {
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
  await p.locator('.sign-card').waitFor({ timeout: 10000 });
  return p.locator('.sign-card');
};
const hs = await openCard(H);
// a count that differs (Sascha 03.11.2026): the holes red on the card, a chip per hole that opens it; corrected on the
// scorecard, it reaches Cedric's phone from there – then both can sign ("all scores the same and still not signable")
await H.waitForTimeout(1500);
ok(/weicht ab/.test(await hs.innerText()) && (await hs.getByRole('button', { name: /^Loch 2\b.* weicht ab – öffnen$/ }).count()) === 1, `Sascha: the marker card – "weicht ab", a chip "Loch 2" (${(await hs.innerText()).replace(/\s+/g, ' ').slice(0, 160)})`);
ok((await H.locator('.sc th.diff').count()) === 1 && (await H.locator('.sc td.diff').count()) >= 1, `the scorecard: hole 2 red (${await H.locator('.sc th.diff').count()} hole, ${await H.locator('.sc td.diff').count()} cells)`);
const sb = await hs.boundingBox();
const signBtn = await hs.getByRole('button', { name: 'Unterschreiben' }).first().boundingBox();
ok(!!sb && !!signBtn && signBtn.width > sb.width * 0.7, `the sign button across the card, the words above it (${Math.round(signBtn?.width ?? 0)} of ${Math.round(sb?.width ?? 0)} px)`);
await hs.getByRole('button', { name: /^Loch 2\b.* weicht ab – öffnen$/ }).click();
await H.locator('.score-panel-screen').waitFor({ timeout: 5000 }).catch(() => {});
ok((await H.locator('.score-panel-screen').count()) === 1, 'the chip opens hole 2 on the scorecard');
await block(H, 'Cedric').getByRole('button', { name: /Schläge minus eins/ }).click();
await H.getByRole('button', { name: 'Zurück zur Scorekarte' }).click();
await H.waitForTimeout(8000);
ok(/Deine Karte.*bereit zum Unterschreiben/s.test(await hs.innerText()) && !/weicht ab/.test(await hs.innerText()) && (await H.locator('.sc td.diff').count()) === 0, `corrected on the scorecard: everything agrees (${(await hs.innerText()).replace(/\s+/g, ' ').slice(0, 160)})`);
ok(/Deine Karte.*bereit zum Unterschreiben/s.test(await hs.innerText()) && /Als Zähler von Cedric/.test(await hs.innerText()), `Sascha: "${(await hs.innerText()).replace(/\s+/g, ' ')}"`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/sign-card.png' });
for (const btn of await hs.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
const gs = await openCard(G);
for (const btn of await gs.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
await H.waitForTimeout(12000);
const f = Object.values(sim.event().flights)[0];
const ids = f.players.map((p) => p.id);
ok(ids.every((id) => f.signed?.[id]?.player && f.signed?.[id]?.marker), `server: both cards signed by player and marker (${JSON.stringify(f.signed ?? {}).slice(0, 120)})`);
// the pushes of a signed card (Sascha 07.11.2026): as the player – his marker is asked to countersign; as the marker –
// the player hears it is in. Each phone tells the function which card, the server reads the rest from the flight row.
const signedCalls = sim.pushes.filter((x) => x.action === 'signed' && x.code === code && x.flight === f.id);
ok(ids.every((id) => signedCalls.some((x) => x.player === id && x.as === 'player') && signedCalls.some((x) => x.player === id && x.as === 'marker')), `push: each card told signed as player and as marker (${signedCalls.map((x) => `${x.from}:${x.as}`).join(', ')})`);
ok(/abgegeben, gesperrt/.test(await hs.innerText()), `Sascha: "${(await hs.innerText()).replace(/\s+/g, ' ')}"`);
ok(/✓ unterschrieben/.test(await H.locator('.event-board').innerText()), 'the leaderboard: "✓ unterschrieben"');
// locked: the score panel shows it, no steppers
await H.getByRole('button', { name: 'Zurück zum Loch' }).click();
await H.locator('.map-score').click();
const mine = block(H, 'Sascha');
ok(/unterschrieben – gesperrt/.test(await mine.innerText()) && (await mine.getByRole('button', { name: /Schläge plus eins/ }).count()) === 0, 'Sascha: his score locked – no steppers');
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
