// QA (Sascha 14.11.2026: "Ich kann hier nicht auf Weiß klicken, um den Abschlag zu verändern" – the Reserve was a
// tournament; "Auch im Turnier (Host)" – "wir brauchen beides"): a tournament on the Hetzenhof, Sascha its host, Cedric
// with him. After the round Sascha's scorecard has the tee to tap – red picked, his round and the tournament's player
// red (the leaderboard follows); Cedric, not the host, has no tee to tap in the tournament.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/tourtee.mjs [url]
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
const H = host.p;
const code = await sim.plan(H, { name: 'Kurzplatz-Cup', option: 'Kurzplatz', format: { mode: 'single', scoring: 'stroke' }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5, tee: 'Yellow' }, { name: 'Cedric', playingHandicap: 10, hcpIndex: 12, tee: 'Yellow' }], scorer: 'p1' }] });
await sim.joinPlanned(H, code);
const guest = await sim.phone('Cedric');
const G = guest.p;
await sim.joinPlanned(G, code);
await H.waitForTimeout(5000);
// every hole entered by Sascha, the flight's scorer
{
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
  await H.waitForTimeout(6000);
}

// the round over on both phones – finished there, then the scorecard from the list of rounds
const finishAndOpen = async (P) => {
  await P.evaluate(() => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
    for (const r of rs) if (r.shared) r.finishedAt = new Date().toISOString();
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(2000);
  await P.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await P.waitForTimeout(600);
  await P.locator('button').filter({ hasText: /Hetzenhof|Kurzplatz-Cup/ }).first().click();
  await P.waitForTimeout(2500);
};
await finishAndOpen(H);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourtee.png' });
const tee = H.getByRole('button', { name: /^Abschlag .* – ändern$/ });
ok((await tee.count()) === 1, `Sascha (the host): the tee of his tournament round to tap (${await tee.innerText().catch(() => '–')})`);
await tee.click();
const sheet = H.getByRole('dialog', { name: 'Tee' });
await sheet.waitFor({ timeout: 5000 }).catch(() => {});
await sheet.locator('.pick-option').filter({ hasText: 'Rot' }).first().click();
await H.waitForTimeout(2500);
{
  const f = Object.values(sim.event().flights)[0];
  const sa = f.players.find((p) => p.name === 'Sascha');
  const r = await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => x.shared));
  ok(sa?.tee === 'Red', `the tournament: Sascha's tee red (${sa?.tee}, playing handicap ${sa?.playingHandicap})`);
  ok(r?.tee === 'Red' && r.players.find((p) => p.isMe)?.tee === 'Red', `his round: red (${r?.tee})`);
  ok(/Rot/.test(await H.getByRole('button', { name: /^Abschlag .* – ändern$/ }).innerText()), 'the scorecard says red');
}
// another player of his flight on another tee (Sascha 16.11.2026: "theoretisch können Spieler eines Flights von
// unterschiedlichen Tees spielen"): on Cedric's tab the host sets Cedric's tee – round and tournament, Cedric's playing
// handicap from his index; Sascha's own stays red
{
  await H.getByRole('tab', { name: 'Cedric' }).click();
  await H.waitForTimeout(500);
  const t2 = H.getByRole('button', { name: /^Abschlag .* – ändern$/ });
  ok((await t2.count()) === 1 && /Gelb/.test(await t2.innerText()), `Cedric's tab: his tee to tap (${await t2.innerText().catch(() => '–')})`);
  await t2.click();
  await H.getByRole('dialog', { name: 'Tee' }).locator('.pick-option').filter({ hasText: 'Rot' }).first().click();
  await H.waitForTimeout(2500);
  const f = Object.values(sim.event().flights)[0];
  const ce = f.players.find((p) => p.name === 'Cedric');
  const sa = f.players.find((p) => p.name === 'Sascha');
  const r = await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => x.shared));
  ok(ce?.tee === 'Red' && ce?.playingHandicap != null && ce.playingHandicap !== 10, `the tournament: Cedric red, his playing handicap from index 12 (${ce?.tee}, ${ce?.playingHandicap})`);
  ok(r.players.find((p) => p.name === 'Cedric')?.tee === 'Red' && sa?.tee === 'Red' && r.tee === 'Red', 'the round: Cedric red, Sascha still red');
}
// Cedric, not the host: no tee to tap in the tournament
await finishAndOpen(G);
ok((await G.getByRole('button', { name: /^Abschlag .* – ändern$/ }).count()) === 0, 'Cedric (not the host): no tee to tap in the tournament');
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
