// Every 3D video of Training (17.10.2026): each drill, basics section and fault picture with a 3D video opens it, the
// canvas draws, the step is named, no page error; then back to the still picture. Usage: node training-3d.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// WebKit reports an aborted cross-origin load (the weather of the home screen, open-meteo) as a page error on
// navigation – the app catches it; not an error of the page
p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message) && errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && /3D|WebGL|three/i.test(m.text()) && errs.push(m.text()));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.getByRole('heading', { name: 'Wissen' }).waitFor({ timeout: 20000 });

/** plays the 3D video of a picture and goes back to it */
const T0 = Date.now();
const play = async (fig, what) => {
  const t1 = Date.now();
  const btn = fig.locator('.tr-motion-btn');
  await btn.click();
  await fig.locator('.tr-3d canvas').waitFor({ timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(700);
  const drawn = await fig.locator('.tr-3d canvas').evaluate((c) => c.width > 0 && c.height > 0).catch(() => false);
  const step = (await fig.locator('.tr-3d-step').innerText().catch(() => '')).trim();
  ok(drawn && step.length > 2 && !errs.length, `[${((t1 - T0) / 1000).toFixed(0)}s +${((Date.now() - t1) / 1000).toFixed(1)}s] ${what}: 3D video plays (“${step.replace(/\s+/g, ' ').slice(0, 40)}”)${errs.length ? ' – ' + errs.join(' | ') : ''}`);
  errs.length = 0;
  await btn.click();
};

// every topic: drills, basics, faults with a 3D video
const topics = await p.locator('.tr-cat').allInnerTexts();
for (let ti = 0; ti < topics.length; ti++) {
  const cat = p.locator('.tr-cat').nth(ti);
  const name = (await cat.locator('strong, h3, .title').first().innerText().catch(() => topics[ti])).split('\n')[0];
  await cat.click();
  await p.waitForTimeout(300);
  // drills: the play mark on the thumbnail shows which ones move; open those and look for the 3D button
  const rows = p.locator('.tr-drill-row .list-item');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    if (!(await row.locator('.tr-thumb-play').count())) continue;
    const title = (await row.locator('.title').first().innerText().catch(() => '')).trim();
    await row.click();
    await p.waitForTimeout(250);
    const fig = p.locator('figure.tr-sketch').first();
    if (((await fig.locator('.tr-motion-btn').getAttribute('aria-label').catch(() => '')) ?? '').includes('3D')) await play(fig, `${name} › ${title}`);
    await p.locator('.topbar .icon-btn').first().click();
    await p.waitForTimeout(200);
  }
  // basics: open every section, play the 3D ones
  await p.getByRole('tab', { name: 'Grundlagen' }).click();
  await p.waitForTimeout(200);
  const colls = p.locator('.tr-coll');
  const m = await colls.count();
  for (let i = 0; i < m; i++) {
    const c = colls.nth(i);
    if (!(await c.locator('.tr-coll-body').count())) await c.locator('.tr-coll-head').click();
    const fig = c.locator('figure.tr-sketch').first();
    if (((await fig.locator('.tr-motion-btn').getAttribute('aria-label').catch(() => '')) ?? '').includes('3D')) await play(fig, `${name} › Grundlagen ${i + 1}`);
  }
  // faults
  if (await p.getByRole('tab', { name: 'Fehler' }).count()) {
    await p.getByRole('tab', { name: 'Fehler' }).click();
    await p.waitForTimeout(200);
    const faults = p.locator('.list .list-item');
    const k = await faults.count();
    for (let i = 0; i < k; i++) {
      await faults.nth(i).click();
      await p.waitForTimeout(250);
      const fig = p.locator('figure.tr-sketch').first();
      if (((await fig.locator('.tr-motion-btn').getAttribute('aria-label').catch(() => '')) ?? '').includes('3D')) await play(fig, `${name} › Fehler ${i + 1}`);
      await p.locator('.topbar .icon-btn').first().click();
      await p.waitForTimeout(200);
    }
  }
  await p.locator('.topbar .icon-btn').first().click();
  await p.waitForTimeout(250);
}
console.log(bad ? `${bad} failed` : 'all 3D videos play');
await b.close();
process.exit(bad ? 1 : 0);
