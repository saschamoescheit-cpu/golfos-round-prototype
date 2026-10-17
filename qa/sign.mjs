// QA: signing the round (Sascha 16.10.2026) – only signed rounds count in the statistics, a seal in the list.
// nicht, das soll der User selbst entscheiden"). A finished 9-hole round with three putts, its scorecard, the button.
// Usage: node qa/totraining.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
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
  r.capture = 'score';
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
ok((await p.locator('.signed-mark').count()) === 0, 'rounds list: no seal yet');
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
ok((await p.locator('.signed-mark').count()) === 1, 'rounds list: the seal on the signed round');
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
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/rounds-paused.png' });
await pausedRow.click();
await p.waitForTimeout(2500);
ok(await p.locator('.map-hole-no').isVisible(), 'a tap on the paused round carries on with it');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
