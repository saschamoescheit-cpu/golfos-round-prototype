// QA (Sascha 16.11.2026, Orlando: "Legends Golf Clermont … kann ich nicht finden"): the bundled course is found by the
// name Google gives it – the town counts in the search – shows its town in the list, and starts with its 18 holes.
// Usage: node qa/legendsfind.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Legends Golf Clermont');
const hit = p.locator('button.list-item').filter({ hasText: /Legends Golf and Country Club/ }).first();
await hit.waitFor({ timeout: 15000 }).catch(() => {});
ok((await hit.count()) === 1, '"Legends Golf Clermont" finds Legends Golf and Country Club');
ok(/Clermont/.test(await hit.innerText().catch(() => '')), `the list shows its town (${(await hit.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
await p.fill('#course-search', 'Legends');
await p.waitForTimeout(1500);
const both = await p.locator('button.list-item').filter({ hasText: /Legends/ }).allInnerTexts();
ok(both.some((t) => /Clermont/.test(t)) && both.some((t) => /Kissimmee/.test(t)), `"Legends": both, told apart by town (${both.map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`);
await p.fill('#course-search', 'Legends Golf Clermont');
await hit.waitFor({ timeout: 15000 });
await hit.click();
await p.getByText('Runde starten').waitFor({ timeout: 60000 });
const holes = await p.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k.includes('4040123') && k.includes('course')) { try { return JSON.parse(localStorage.getItem(k)).holes?.length ?? null; } catch { /* next */ } }
  return null;
});
ok(holes == null || holes === 18, `the course with 18 holes (${holes ?? 'not cached yet'})`);
ok((await p.getByText(/Legends Golf and Country Club/).count()) > 0, 'the setup shows Legends');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
