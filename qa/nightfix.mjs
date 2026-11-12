// QA (Sascha 12.11.2026, night run): the floating buttons in the screen's corner on an iPad, not at the centred column
// ("Der Button schwebt nicht unten rechts"); "Schläge prüfen" floating on the scorecard ("ein Schwebebalken für Schläge
// prüfen"); the sun mode stays as switched (it is the device's own now – a pull from the server switched it back).
// Usage: node qa/nightfix.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const r18 = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-18-golfclub-hetzenhof.json', import.meta.url), 'utf-8')).round;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const seed = async (p) => {
  await p.goto(url);
  await p.evaluate((r18) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...r18, signedAt: '2026-10-18T20:00:00Z' }]));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, r18);
  await p.reload();
  await p.waitForTimeout(1200);
};

// an iPad: the "+" of the rounds list in the screen's corner
{
  const ctx = await b.newContext({ ...devices['iPad (gen 7) landscape'], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  await seed(p);
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await p.waitForTimeout(600);
  const box = await p.locator('.fab-stack').first().boundingBox();
  const vw = p.viewportSize().width;
  ok(!!box && box.x + box.width >= vw - 40, `iPad: the floating button in the screen's right corner (${box ? Math.round(box.x + box.width) : '–'} of ${vw})`);
  // the scorecard: "Schläge prüfen" floating, not in the row
  await p.locator('ul.list button.list-item').first().click();
  await p.waitForTimeout(900);
  ok((await p.locator('.fab-stack').getByRole('button', { name: 'Schläge prüfen' }).count()) === 1 && (await p.locator('.sc-actions').getByRole('button', { name: /Schläge prüfen/ }).count()) === 0, 'scorecard: "Schläge prüfen" floating bottom right, not in the row');
  const sb = await p.locator('.fab-stack').first().boundingBox();
  ok(!!sb && sb.x + sb.width >= vw - 40, 'scorecard: its floating button in the screen\'s corner too');
  await ctx.close();
}

// the sun mode: switched on, it stays – also after the app hears of a sync ("golfos:pulled") with an older value
{
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  await seed(p);
  await p.getByRole('button', { name: /Sonnenmodus an/ }).first().click();
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'sun', 'sun mode switched on');
  await p.evaluate(() => window.dispatchEvent(new Event('golfos:pulled')));
  await p.waitForTimeout(1500);
  ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'sun' && (await p.evaluate(() => localStorage.getItem('golfos.sun.v1'))) === '1', 'sun mode: still on after a sync');
  const synced = await p.evaluate(async () => (await import('/src/lib/sync.ts')).syncedKeys?.() ?? null).catch(() => null);
  if (Array.isArray(synced)) ok(!synced.includes('golfos.sun.v1'), 'sun mode: not among the synced settings');
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
