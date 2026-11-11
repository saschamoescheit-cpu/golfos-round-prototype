// QA (Sascha 06.11.2026: "back goes to the very front instead of one level back – check it in the whole app"): a round
// opened from the statistics of its course, its shots checked ("Schläge prüfen" → "Fertig"): back on its scorecard, and
// "Zurück" there goes to the course's statistics again – not to the list of the rounds. Sascha's round of 16.10.2026 on
// Hetzenhof (local data, _data/). Usage: node qa/reviewback.mjs [url]
import { webkit, devices } from 'playwright';
import { pickTopic } from './topic.mjs';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
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
await p.waitForTimeout(800);
await p.evaluate((exp) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, capture: 'full', signedAt: exp.round.finishedAt }]));
}, exp);
await p.reload();
await p.waitForTimeout(1500);
const title = async () => (await p.locator('main h1, main h2').first().innerText().catch(() => '')).trim();
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(800);
await pickTopic(p, 'Plätze'); // the topics as the switch "‹ Abschlag ›" since the Facelift (11.11.2026)
await p.waitForTimeout(500);
await p.locator('button.list-item, button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
const course = await title();
ok(/Platz-Statistik/.test(course), `the course's statistics (${course})`);
await p.locator('main button.list-item').first().click();
await p.waitForTimeout(1500);
await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
await p.waitForTimeout(1500);
ok(/Schläge prüfen/.test(await p.locator('.topbar h1').innerText().catch(() => '')), 'the round opened from there: "Schläge prüfen"');
await p.locator('.topbar').getByRole('button', { name: 'Fertig' }).click();
await p.waitForTimeout(1500);
ok((await p.getByRole('button', { name: /Schläge prüfen/ }).count()) > 0, '"Fertig": back on its scorecard');
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(1500);
const back = await title();
ok(/Platz-Statistik/.test(back) && (await p.locator('.course-holes').count()) === 1, `"Zurück" on the scorecard: the course's statistics again, one level back (${back})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
