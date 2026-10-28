// QA (Sascha 28.10.2026: "the score entry does not always open when I change the hole"): on to the next hole from the
// hole overview asks for the score of a hole without one, as "→" does – then on to the hole picked; and two holes back
// and forward again opens the score sheet on each of them once.
// Usage: node qa/holejump.mjs [url]
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
const prev = () => p.getByRole('button', { name: 'Voriges Loch' }).click();
const sheet = () => p.locator('.score-panel').count();
const plus = () => p.locator('.score-panel').getByRole('button', { name: 'Schläge plus eins', exact: true }).first().click();
const closeSheet = () => p.locator('.score-panel').getByRole('button', { name: 'Zurück zur Karte' }).click();
const overview = async (label) => {
  await p.getByRole('button', { name: 'Lochübersicht öffnen' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: new RegExp(`^Loch ${label}\\b`) }).click();
  await p.waitForTimeout(700);
};

// 1A: score, on to 2A
await next();
await p.waitForTimeout(500);
await plus();
await next();
await p.waitForTimeout(700);
ok((await hole()) === '2A', `on 2A (${await hole()})`);

// from the overview on to 3A while 2A has no score: 2A's score sheet first
await overview('3A');
ok((await hole()) === '2A' && (await sheet()) === 1, `overview → 3A without a score on 2A: 2A's score sheet opens (${await hole()}, sheet ${await sheet()})`);
await plus();
await p.waitForTimeout(200);
await closeSheet();
await p.waitForTimeout(800);
ok((await hole()) === '3A' && (await strokes(1)) != null, `score entered and closed: on to 3A, 2A keeps its score (${await hole()}, 2A ${await strokes(1)})`);

// a jump further ahead does not ask (starting on another hole, skipping holes)
await overview('6A');
ok((await hole()) === '6A' && (await sheet()) === 0 && (await strokes(2)) == null, `overview → 6A from 3A: a jump ahead asks nothing and writes no par (${await hole()}, 3A ${await strokes(2)})`);
await overview('3A');

// two holes back (both with a score), then forward: each one's score sheet opens once
await prev();
await p.waitForTimeout(500);
await prev();
await p.waitForTimeout(500);
ok((await hole()) === '1A', `two holes back: on 1A (${await hole()})`);
await next();
await p.waitForTimeout(500);
ok((await hole()) === '1A' && (await sheet()) === 1, '→ on 1A: its score sheet opens again');
await next();
await p.waitForTimeout(700);
ok((await hole()) === '2A' && (await sheet()) === 0, 'the next →: on 2A');
await next();
await p.waitForTimeout(500);
ok((await hole()) === '2A' && (await sheet()) === 1, `→ on 2A (score ${await strokes(1)}): its score sheet opens again too`);
await next();
await p.waitForTimeout(700);
ok((await hole()) === '3A', `the next →: on 3A (${await hole()})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
