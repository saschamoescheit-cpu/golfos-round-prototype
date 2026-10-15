// All Training sketches on contact sheets for a visual check. Usage: node training-sketches.mjs <app url> <out dir>
import { webkit, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const only = process.argv[4] ? new RegExp(process.argv[4]) : null; // only drills whose title matches
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
});
await p.reload();
await p.waitForTimeout(600);
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.locator('.tr-cat').first().waitFor({ timeout: 30000 });
const cats = await p.locator('.tr-cat').count();
const svgs = [];
for (let c = 0; c < cats; c++) {
  await p.locator('.tr-cat').nth(c).click();
  await p.waitForTimeout(250);
  const title = await p.locator('.topbar h1').innerText();
  // open all sections
  const heads = p.locator('.tr-coll-head[aria-expanded="false"]');
  for (let k = (await heads.count()) - 1; k >= 0; k--) await heads.nth(k).click();
  for (const s of await p.locator('.tr-sketch').all()) svgs.push({ where: title, html: await s.evaluate((e) => e.outerHTML) });
  const drills = await p.locator('.tr-drill-row .list-item').count();
  for (let d = 0; d < drills; d++) {
    await p.locator('.tr-drill-row .list-item').nth(d).click();
    await p.waitForTimeout(120);
    const dt = await p.locator('.topbar h1').innerText();
    for (const s of await p.locator('.tr-sketch').all()) svgs.push({ where: `${title} › ${dt}`, html: await s.evaluate((e) => e.outerHTML) });
    await p.locator('.topbar .icon-btn').first().click();
    await p.waitForTimeout(120);
  }
  await p.locator('.topbar .icon-btn').first().click();
  await p.waitForTimeout(200);
}
const seen = new Set();
if (only) svgs.splice(0, svgs.length, ...svgs.filter((x) => only.test(x.where)));
const uniq = svgs.filter((s) => (seen.has(s.html) ? false : (seen.add(s.html), true)));
console.log(`${uniq.length} sketches`);
const per = 12;
for (let i = 0; i < uniq.length; i += per) {
  const html = `<html><head><meta charset="utf-8"></head><body style="margin:0;background:#18222a;font:12px sans-serif;color:#eee;display:grid;grid-template-columns:repeat(4,340px);gap:10px;padding:10px">${uniq
    .slice(i, i + per)
    .map((s) => `<div><div style="height:30px">${s.where}</div>${s.html}</div>`)
    .join('')}</body></html>`;
  writeFileSync(`${out}/sheet-${i / per}.html`, html);
  const q = await ctx.newPage();
  await q.setViewportSize({ width: 1420, height: 900 });
  await q.goto(pathToFileURL(resolve(out, `sheet-${i / per}.html`)).href);
  await q.screenshot({ path: `${out}/sheet-${i / per}.png`, fullPage: true });
  await q.close();
}
await b.close();
