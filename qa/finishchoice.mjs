// QA (Sascha 22.10.2026: "at the end of the round 'check & sign later' was missing – I had to change the state by
// hand"): right after finishing the choice opens by itself – now, later, saved only – "later" chosen until the player
// picks another. Both ways to finish: the hole menu, and past the last hole on the scorecard.
// Usage: node qa/finishchoice.mjs [url]
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
const start = async () => {
  await p.goto(url);
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
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
  await p.waitForTimeout(2500);
};
const sheet = () => p.getByRole('dialog', { name: 'Status der Runde' });
const capture = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].capture ?? null);

// 1 · finished from the hole menu
await start();
await p.locator('.hole-bar-handle').click();
await p.locator('.hole-drawer').getByRole('button', { name: 'Runde beenden' }).click();
await p.getByRole('button', { name: 'Speichern & beenden' }).click();
await p.waitForTimeout(1000);
const text = await sheet().innerText().catch(() => '');
ok((await sheet().count()) === 1 && /wie geht es weiter/.test(text), 'finished from the hole menu: the choice opens by itself');
ok(/Jetzt prüfen & signieren/.test(text) && /Später prüfen & signieren/.test(text) && /Nur speichern/.test(text), 'now · later · saved only');
ok((await capture()) === 'full' && (await sheet().getByRole('button', { name: /^Später prüfen/ }).getAttribute('aria-pressed')) === 'true', 'without a choice: "check & sign later"');
await sheet().getByRole('button', { name: /^Nur speichern/ }).click();
await p.waitForTimeout(400);
ok((await capture()) === 'score' && (await sheet().count()) === 0, '"Nur speichern" chosen: saved only, the choice closes');

// 2 · finished past the last hole on the scorecard
await start();
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  for (const list of Object.values(rs[0].entries)) list.forEach((e) => (e.strokes = 4));
  rs[0].currentHole = rs[0].holes.length - 1;
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(2000);
await p.getByRole('button', { name: 'Runde beenden' }).last().click();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Speichern & beenden' }).click();
await p.waitForTimeout(1000);
ok((await sheet().count()) === 1 && /wie geht es weiter/.test(await sheet().innerText().catch(() => '')), 'finished past the last hole: the choice opens too');
await sheet().getByRole('button', { name: /^Später prüfen/ }).click();
await p.waitForTimeout(400);
ok((await capture()) === 'full' && /Prüfen & signieren/.test(await p.locator('.sc-status').innerText()), '"Später prüfen & signieren": waits under "prüfen & signieren"');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
