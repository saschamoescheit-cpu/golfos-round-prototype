// QA (Sascha 28.10.2026: "the score entry does not always open when I change hole"): a score that did not come from this
// phone's score entry – from another phone of the game, or entered on someone else's sheet – no longer counts as done:
// "→" opens the score entry of the hole first. A score entered here goes on at once, as before.
// Usage: node qa/scoreopen.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
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
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
await p.waitForTimeout(2000);
const hole = async () => (await p.locator('.map-hole-no').innerText().catch(() => '?')).trim();
const next = () => p.getByRole('button', { name: 'Nächstes Loch' }).click();
const sheet = () => p.locator('.score-panel').count();

// 1A: the score arrives from elsewhere (another phone of the game) – the round on the phone has it, the score entry
// was never open here
await p.evaluate(() => {
  const all = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const id = Object.keys(all[0].entries)[0];
  all[0].entries[id][0] = { ...all[0].entries[id][0], strokes: 5, putts: 2 };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(all));
});
await p.reload();
await p.waitForTimeout(1500);
if (!(await p.locator('.map-hole-no').count())) {
  const resume = p.getByRole('button', { name: /fortsetzen|Weiterspielen/i }).first();
  if (await resume.count()) await resume.click();
  await p.locator('.map-hole-no').waitFor({ timeout: 30000 });
}
await p.waitForTimeout(1500);
ok((await hole()) === '1A', `back in the round on 1A (${await hole()})`);
ok((await p.locator('.hole-bar-score').innerText()).includes('5'), 'the score from elsewhere shows in the hole bar (5)');
await next();
await p.waitForTimeout(600);
ok((await sheet()) === 1 && (await hole()) === '1A', '"→": the score entry of 1A opens first, though it has a score');
await next();
await p.waitForTimeout(800);
ok((await hole()) === '2A' && (await sheet()) === 0, 'the next "→": on 2A');

// 2A: the score entered here (the score in the hole bar) – "→" goes on at once, as before
await p.locator('.map-score').click();
await p.waitForTimeout(500);
await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
await p.waitForTimeout(300);
await p.locator('.score-panel').getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});
await p.waitForTimeout(500);
await next();
await p.waitForTimeout(800);
ok((await hole()) === '3A' && (await sheet()) === 0, 'a score entered on this phone: "→" goes on to 3A at once');
// 3A without a score: the score entry opens, as before
await next();
await p.waitForTimeout(500);
ok((await sheet()) === 1 && (await hole()) === '3A', '"→" on 3A without a score opens the score entry');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
