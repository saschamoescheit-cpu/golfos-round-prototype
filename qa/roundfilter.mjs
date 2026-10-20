// QA (Sascha 17.10.2026): "Runden signieren · 2" on the start page opens the rounds list with only those 2 rounds,
// "Schläge prüfen" only the rounds with shots to check; the menu's "Runden" shows all again.
// Usage: node qa/roundfilter.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
// five finished rounds: two kept as rounds (not open – Sascha 17.10.2026), one signed, two chosen to check and sign
await p.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
  const id = r.players.find((x) => x.isMe).id;
  r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: r.holes[k].par + 1, putts: 2, penalties: 0 }));
  r.finishedAt = new Date().toISOString();
  const mk = (n, patch) => ({ ...JSON.parse(JSON.stringify(r)), id: `${r.id}-${n}`, createdAt: new Date(Date.now() - n * 3600e3).toISOString(), ...patch });
  // and one finished round without any score – listed nowhere (Sascha 18.10.2026), the counts below stay the same
  const empty = mk(6, {});
  empty.entries[id] = empty.entries[id].map((e) => ({ ...e, strokes: null, putts: null }));
  const rs = [mk(1, { capture: 'score' }), mk(2, { capture: 'score' }), mk(3, { capture: 'score', signedAt: new Date().toISOString() }), mk(4, {}), mk(5, {}), empty];
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(1500);
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
const listed = () => p.locator('ul.list button.list-item').count();
await tab('Spielen');
await p.waitForTimeout(400);
// check & sign are one way (Sascha 18.10.2026): one card on the start page, one tile – no separate "to check"
const sign = p.getByRole('button', { name: /Runden prüfen & signieren/ });
const signN = Number((await sign.locator('.count-badge').innerText()).trim());
ok((await p.getByRole('button', { name: /Schläge prüfen/ }).count()) === 0, 'start page: no separate "Schläge prüfen" any more');
await sign.click();
await p.waitForTimeout(600);
ok((await listed()) === signN && signN === 2, `"Runden prüfen & signieren" shows only the ${signN} open rounds – the kept ones are not open (${await listed()})`);
ok((await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).getAttribute('aria-pressed')) === 'true', 'the "prüfen & signieren" tile is on');
const tiles = (await p.locator('.tile-row .tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(!tiles.some((t) => /zu prüfen/.test(t)) && tiles.some((t) => /^2 prüfen & signieren$/.test(t)), `tiles: one "prüfen & signieren", no "zu prüfen" (${tiles.join(' | ')})`);
const pausedTile = p.locator('button.tile').filter({ hasText: 'pausiert' });
ok((await pausedTile.count()) === 1 && /^0/.test((await pausedTile.innerText()).trim()) && (await pausedTile.isDisabled()), 'the "pausiert" tile is there with 0 when nothing is paused');
{
  // with 0 it looks like the other tiles – not paler (Sascha 18.10.2026)
  const look = (t) => t.evaluate((e) => [getComputedStyle(e).opacity, getComputedStyle(e).backgroundColor, getComputedStyle(e.querySelector('.tile-mark') ?? e).opacity].join('|'));
  const zero = await look(pausedTile);
  const played = await look(p.locator('.tile').filter({ hasText: 'gespielt' }).first());
  ok(zero.split('|')[0] === '1' && zero.split('|')[2] === '1' && zero.split('|')[1] === played.split('|')[1], `the 0 tile as solid as the others (${zero} | ${played})`);
}
ok(/^5\b/.test(tiles.find((t) => /gespielt/.test(t)) ?? ''), 'gespielt: every finished round, kept and signed (5)');
ok((await p.locator('.tile-row .tile').count()) === (await p.locator('.tile-row .tile .tile-mark svg').count()), 'every tile with its symbol – gespielt (ball on tee), Löcher (flag), gelöscht (bin) too');
await tab('Runden');
await p.waitForTimeout(600);
ok((await listed()) === 5, `the menu's "Runden" shows all rounds (${await listed()})`);
ok((await p.locator('ul.list .signed-mark[aria-label="gespielt"]').count()) === 2, 'the two kept rounds show the ball on the tee in the list');
await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).click();
await p.waitForTimeout(300);
ok((await listed()) === 2, 'the tile filters too');
await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).click();
await p.waitForTimeout(300);
ok((await listed()) === 5, 'tapped again: all rounds');
// the stats' notice "… not signed yet" leads there too
await tab('Statistik');
await p.waitForTimeout(500);
await p.locator('.notice-link').click();
await p.waitForTimeout(600);
ok((await listed()) === 2 && (await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).getAttribute('aria-pressed')) === 'true', 'the stats notice opens the rounds to check & sign');
await tab('Runden');
await p.waitForTimeout(400);
if (process.env.SHOTS) {
  await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).click();
  await p.screenshot({ path: `${process.env.SHOTS}/roundfilter.png` });
}
// a missing score: the empty hole has a pencil, a tap enters it – no check, no signing needed (Sascha 18.10.2026)
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const id = rs[0].players.find((x) => x.isMe).id;
  rs[0].entries[id][rs[0].holes.length - 1].strokes = null;
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(1000);
await tab('Runden');
await p.waitForTimeout(400);
await p.locator('ul.list button.list-item').first().click();
await p.waitForTimeout(800);
const pen = p.getByRole('img', { name: /Score für Loch .* eintragen/ });
ok((await pen.count()) === 1, 'scorecard: the empty hole shows a pencil');
await pen.click();
await p.waitForTimeout(400);
// the same score panel as on the course: strokes, putts, sand shots, penalties (Sascha 20.10.2026)
ok((await p.locator('.score-panel').getByRole('button', { name: /Strafschläge plus eins/ }).count()) >= 1 && (await p.locator('.score-panel').getByText('Sand Shots').count()) >= 1, 'the empty hole opens the score panel of the course (penalties, sand shots)');
await p.locator('.score-panel').getByRole('button', { name: /^Schläge plus eins/ }).first().click();
await p.waitForTimeout(300);
await p.locator('.score-panel').getByRole('button', { name: 'Zurück zur Scorekarte' }).click();
await p.waitForTimeout(300);
const filled = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]; const id = r.players.find((x) => x.isMe).id; return r.entries[id][r.holes.length - 1].strokes; });
ok(filled != null && (await pen.count()) === 0, `a tap enters the score and it is saved (${filled})`);
// the round's actions in one row (Sascha 18.10.2026), in this order (20.10.2026): check the shots, share, export, delete
{
  const acts = await p.locator('.sc-actions .sc-action').allInnerTexts();
  const tops = await p.locator('.sc-actions .sc-action').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  // the card above offers "Prüfen & signieren" for this saved-only round – then the row has no second "check shots"
  const offers = (await p.locator('.sign-card').getByRole('button', { name: 'Prüfen & signieren', exact: true }).count()) === 1;
  ok(acts.map((t) => t.trim()).join('|') === (offers ? 'Teilen|Export|Löschen' : 'Schläge prüfen|Teilen|Export|Löschen') && new Set(tops).size === 1, `scorecard: ${offers ? 'Teilen · Export · Löschen (the card above has Prüfen & signieren)' : 'Schläge prüfen · Teilen · Export · Löschen'} in one row (${acts.map((t) => t.trim()).join(' · ')})`);
}
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(500);
// a round kept as a round can still go to "check & sign later" from the list (Sascha 18.10.2026)
await tab('Runden');
await p.waitForTimeout(400);
const tileN = async () => Number((await p.locator('button.tile').filter({ hasText: 'prüfen & signieren' }).innerText()).trim().split(/\s/)[0]);
const before = await tileN();
await p.locator('ul.list button.list-item').first().click();
await p.waitForTimeout(800);
await p.locator('.sign-card').getByRole('button', { name: 'Später prüfen & signieren' }).click();
await p.waitForTimeout(600); // a tap decides and closes the scorecard (Sascha 20.10.2026)
ok((await tileN()) === before + 1, `a kept round set to "Später prüfen & signieren" from the list counts under the tile (${before} → ${await tileN()})`);
// the module start page: only the rounds to check & sign – a paused round is no task there (Sascha 18.10.2026)
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...rs[0], id: rs[0].id + '-p', finishedAt: null, capture: undefined, createdAt: new Date().toISOString() }, ...rs]));
  sessionStorage.setItem('golfos.paused', rs[0].id + '-p'); // paused: a reload stays on the start page
});
await p.reload();
await p.waitForTimeout(1200);
await tab('Spielen');
await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Modul wechseln' }).first().click();
await p.waitForTimeout(600);
const card = (await p.locator('.module-card').filter({ hasText: 'Rounds' }).innerText()).replace(/\s+/g, ' ');
ok(/3 Runden prüfen & signieren/.test(card) && !/pausiert|Schläge prüfen/.test(card), `home: the Rounds card names only the rounds to check & sign (${card})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
