// QA (Sascha 17.10.2026): "Runden signieren · 2" on the start page opens the rounds list with only those 2 rounds,
// "Schläge prüfen" only the rounds with shots to check; the menu's "Runden" shows all again.
// Usage: node qa/roundfilter.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
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
await tab('Runden');
await p.waitForTimeout(600);
ok((await listed()) === 5, `the menu's "Runden" shows all rounds (${await listed()})`);
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
ok(/2 Runden prüfen & signieren/.test(card) && !/pausiert|Schläge prüfen/.test(card), `home: the Rounds card names only the rounds to check & sign (${card})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
