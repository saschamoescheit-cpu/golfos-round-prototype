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
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /Kurzplatz/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.locator('input[id^="hcp-"]').first().fill('10');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Cedric');
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
await card.getByRole('switch', { name: /Turnier über mehrere Flights/ }).click();
await card.getByRole('button', { name: 'Code erzeugen' }).click();
await card.locator('.join-code').waitFor({ timeout: 8000 });
const code = (await card.locator('.join-code').innerText()).trim();
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
const guest = await sim.phone('Cedric');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
const ask = H.getByRole('alertdialog', { name: 'Cedric möchte beitreten' });
await ask.waitFor({ timeout: 15000 });
await ask.getByRole('button', { name: 'Zulassen' }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
await H.waitForTimeout(6000);

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const holes = (await sim.round(H)).holes.length;
ok(holes === 6, `the short course: ${holes} holes`);
for (let i = 0; i < holes; i++) {
  for (const [p, me, other] of [[H, 'Sascha', 'Cedric'], [G, 'Cedric', 'Sascha']]) {
    await p.locator('.map-score').click();
    await block(p, me).getByRole('button', { name: /Schläge plus eins/ }).click();
    await block(p, other).getByRole('button', { name: /Schläge plus eins/ }).click();
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
ok(/Deine Karte.*bereit zum Unterschreiben/s.test(await hs.innerText()) && /Als Zähler von Cedric/.test(await hs.innerText()), `Sascha: "${(await hs.innerText()).replace(/\s+/g, ' ')}"`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/sign-card.png' });
for (const btn of await hs.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
const gs = await openCard(G);
for (const btn of await gs.getByRole('button', { name: 'Unterschreiben' }).all()) await btn.click();
await H.waitForTimeout(12000);
const f = Object.values(sim.event().flights)[0];
const ids = f.players.map((p) => p.id);
ok(ids.every((id) => f.signed?.[id]?.player && f.signed?.[id]?.marker), `server: both cards signed by player and marker (${JSON.stringify(f.signed ?? {}).slice(0, 120)})`);
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
