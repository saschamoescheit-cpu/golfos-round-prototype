// The record in the Birdiebook (Sascha 25.10.2026): a small green tile under the hole's picture, three lines –
// "Deine Bilanz", "Ø 4,4 (+0,4)", "aus 5 Runden" – without the best score; the average on one line, also on the iPhone SE.
// Data: the tutorial's example player. Usage: node qa/bookrecord.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const demo = JSON.parse(readFileSync(new URL('../../tutorial/demo-state.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
for (const dev of ['iPhone 13', 'iPhone SE']) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate((demo) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(demo)) localStorage.setItem(k, v);
    localStorage.setItem('golfos.intro.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  }, demo);
  await p.reload();
  await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.getByRole('button', { name: 'Birdiebook', exact: true }).click();
  const rec = p.locator('.book-record').first();
  await rec.waitFor({ timeout: 30000 }).catch(() => {});
  const lines = (await rec.locator('.lbl, li').allTextContents()).map((s) => s.trim());
  ok(lines[0] === 'Deine Bilanz' && /^Ø \d+,\d \([+−-]?\d+,\d\)$/.test(lines[1] ?? '') && /^aus \d+ Runden?$/.test(lines[2] ?? ''), `${dev}: three lines – ${lines.slice(0, 3).join(' / ')}`);
  ok(!/beste/i.test(await rec.innerText()), `${dev}: no best score`);
  const bg = await rec.evaluate((el) => getComputedStyle(el).backgroundColor);
  ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(bg), `${dev}: a green tile (${bg})`);
  const oneLine = await rec.locator('.book-avg').evaluate((el) => el.getBoundingClientRect().height < parseFloat(getComputedStyle(el).fontSize) * 1.9);
  ok(oneLine, `${dev}: the average on one line`);
  const fits = await rec.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth + 0.5 && [...el.querySelectorAll('li')].every((li) => li.getBoundingClientRect().right <= el.getBoundingClientRect().right + 0.5));
  ok(fits, `${dev}: nothing runs out of the tile`);
  ok(errs.length === 0, `${dev}: no page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
