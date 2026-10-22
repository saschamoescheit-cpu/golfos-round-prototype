// QA (Sascha 22.10.2026): back to an earlier hole to correct its score, then forward again – the score sheet opens on
// the hole without a score as before, and going back wrote no par for the unplayed hole.
// Usage: node qa/holeback.mjs [url]
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
await p.waitForTimeout(3000);
const hole = async () => (await p.locator('.map-hole-no').innerText().catch(() => '?')).trim();
const strokes = (k) => p.evaluate((k) => Object.values(JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].entries)[0][k].strokes, k);
const next = () => p.getByRole('button', { name: 'Nächstes Loch' }).click();
const sheet = () => p.locator('.score-panel').count();

// 1A: the score, on to 2A
await next();
await p.waitForTimeout(500);
await p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
await next();
await p.waitForTimeout(800);
ok((await hole()) === '2A', `on 2A (${await hole()})`);
// back to 1A to correct its score
await p.getByRole('button', { name: 'Voriges Loch' }).click();
await p.waitForTimeout(800);
ok((await hole()) === '1A', 'back on 1A');
ok((await strokes(1)) == null, `going back wrote no par for 2A, not played yet (${await strokes(1)})`);
// forward again: 1A has its score – on to 2A; there "→" opens the score sheet again
await next();
await p.waitForTimeout(800);
ok((await hole()) === '2A' && (await sheet()) === 0, 'forward from 1A (score entered): on 2A');
await next();
await p.waitForTimeout(500);
ok((await sheet()) === 1 && (await hole()) === '2A', '"→" on 2A without a score opens the score sheet again');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
