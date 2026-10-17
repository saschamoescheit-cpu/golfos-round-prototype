// QA: signing the round (Sascha 16.10.2026) – only signed rounds count in the statistics, a seal in the list.
// nicht, das soll der User selbst entscheiden"). A finished 9-hole round with three putts, its scorecard, the button.
// Usage: node qa/totraining.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/localhost:\d+\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const plans = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.training.plans.v1') ?? '[]'));

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
// played: bogey golf with three putts everywhere – the plan says putting
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const r = rs[0];
  const id = r.players.find((x) => x.isMe).id;
  r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: r.holes[k].par + 1, putts: 3, penalties: 0 }));
  r.finishedAt = new Date().toISOString();
  r.capture = 'full'; // chosen to check and sign (a round kept as a round is never open – Sascha 17.10.2026)
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(1500);
// sign the round like a scorecard (Sascha 16.10.2026): only signed rounds count in the statistics
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
await tab('Spielen');
await p.waitForTimeout(400);
ok((await p.getByRole('button', { name: /Runden signieren.*1 Runde noch nicht signiert/ }).count()) === 1, 'start page: "Runden signieren" leads to the open round');
await tab('Statistik');
await p.waitForTimeout(600);
ok((await p.getByText(/1 beendete Runde ist noch nicht signiert/).count()) === 1, 'stats: the unsigned round is named, it does not count yet');
await tab('Runden');
await p.waitForTimeout(400);
ok((await p.locator('ul.list .signed-mark[aria-label="signiert"]').count()) === 0 && (await p.locator('ul.list .signed-mark[aria-label="zu signieren"], ul.list .signed-mark[aria-label="Schläge prüfen"]').count()) === 1, 'rounds list: no seal yet, the mark of an open round');
ok((await p.locator('.tile .tile-mark svg').count()) === 3, 'the tiles carry the marks (to check, to sign, signed) – the legend');
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1200);
const card = p.locator('.sign-card');
ok((await card.innerText()).includes('Runde signieren'), 'scorecard: "Runde signieren"');
ok(await p.evaluate(() => document.querySelector('.sign-card').getBoundingClientRect().top > document.querySelector('.sc-wrap').getBoundingClientRect().top), 'not signed yet: "Signieren" follows the scorecard');
await card.getByRole('button', { name: 'Signieren' }).click();
await p.waitForTimeout(400);
ok((await card.innerText()).includes('Signiert') && (await p.evaluate(() => !!JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].signedAt)), 'signed: the card says so, the round keeps the time');
const above = await p.evaluate(() => document.querySelector('.sign-card').getBoundingClientRect().top < document.querySelector('.sc-hero').getBoundingClientRect().top);
ok(above, 'signed: the seal stands on top, above the result and the scorecard (Sascha 17.10.2026)');
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(600);
ok((await p.locator('ul.list .signed-mark[aria-label="signiert"]').count()) === 1, 'rounds list: the seal on the signed round');
await tab('Statistik');
await p.waitForTimeout(600);
ok((await p.getByText(/noch nicht signiert/).count()) === 0, 'stats: no unsigned round left');
await tab('Spielen');
await p.waitForTimeout(400);
ok((await p.getByText('Runden signieren').count()) === 0, 'start page: nothing left to sign');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/sign.png', fullPage: true });
// a paused round stands in the list with a pause mark (Sascha 17.10.2026); a tap carries on with it
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...rs[0], id: rs[0].id + '-p', finishedAt: null, signedAt: null, currentHole: 4, createdAt: new Date().toISOString() }, ...rs]));
  sessionStorage.setItem('golfos.paused', rs[0].id + '-p'); // left on purpose: a reload stays on the start page
});
await p.reload();
await p.waitForTimeout(1000);
await tab('Runden');
await p.waitForTimeout(400);
const pausedRow = p.locator('.list-item').filter({ has: p.locator('.paused-mark') });
ok((await pausedRow.count()) === 1 && /Pausiert · Loch 5 von 9/.test(await pausedRow.innerText()), 'rounds list: the paused round with its pause mark and hole');
const mark = await pausedRow.locator('.paused-mark').evaluate((e) => ({ circle: !!e.querySelector('circle'), colour: getComputedStyle(e).color, seal: getComputedStyle(document.documentElement).getPropertyValue('--brand-text') }));
ok(mark.circle && mark.colour !== 'rgb(255, 255, 255)' && /^rgb\(1[0-9]{2}, 1[5-9][0-9]|^rgb\(([5-9][0-9]|1[0-9]{2}), 1[0-9]{2}, /.test(mark.colour), `the pause mark: a small circle, in green (${mark.colour})`);
const pTile = p.locator('button.tile').filter({ hasText: 'pausiert' });
ok((await pTile.count()) === 1 && (await pTile.locator('.tile-mark svg circle').count()) === 1, 'a "pausiert" tile with the pause mark');
await pTile.click();
await p.waitForTimeout(300);
ok((await p.locator('ul.list button.list-item').count()) === 1 && (await p.locator('ul.list .paused-mark').count()) === 1, 'the tile shows only the paused round');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/rounds-paused-filter.png' });
await pTile.click();
await p.waitForTimeout(300);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/rounds-paused.png' });
await pausedRow.click();
await p.waitForTimeout(2500);
ok(await p.locator('.map-hole-no').isVisible(), 'a tap on the paused round carries on with it');
// "Check & sign": the check's last step signs the round (Sascha 17.10.2026)
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1')).filter((r) => r.finishedAt);
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...rs[0], id: rs[0].id + '-c', signedAt: null, capture: 'full', createdAt: new Date().toISOString() }]));
  sessionStorage.removeItem('golfos.paused');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await tab('Runden');
await p.waitForTimeout(400);
await p.locator('ul.list .list-item').first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /Schläge prüfen|Prüfen & signieren/ }).first().click();
await p.waitForTimeout(2000);
let lastLabel = '';
for (let k = 0; k < 14 && (await p.locator('.sc-wrap').count()) === 0; k++) {
  const btn = p.locator('.sticky-cta .btn-primary');
  lastLabel = (await btn.innerText().catch(() => '')).trim();
  await btn.click().catch(() => {});
  await p.waitForTimeout(700);
}
ok(/signieren/.test(lastLabel), `the last step says it signs ("${lastLabel}")`);
ok((await p.locator('.sign-card.signed').count()) === 1 && (await p.evaluate(() => !!JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].signedAt)), 'after the check the round is signed, the seal on the scorecard');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
