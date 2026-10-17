// All pictures of the mobility screen on contact sheets (tests, self-check options, swing patterns, drills) – each next
// to the text it has to show. Usage: node mobility-sketches.mjs <app url> <out dir>
import { webkit, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
await p.goto(url);
await p.waitForTimeout(1000);
// a screening where every test failed: every pattern and every drill shows up
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  const ids = ['pelvic-rotation', 'lower-quarter', 'single-leg', 'neck', 'seated-rotation', 'deep-squat', 'toe-touch', 'shoulder-9090', 'lat', 'bridge', 'pelvic-tilt', 'reach-roll-lift', 'forearm', 'wrist-hinge', 'wrist-flex'];
  const m = { value: null, grade: 'fail', source: 'self', at: new Date().toISOString() };
  const results = Object.fromEntries(ids.map((id) => [id, { both: m }]));
  localStorage.setItem('golfos.mobility.v1', JSON.stringify([{ id: 'qa', kind: 'full', tests: ids, createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(), current: 0, hand: 'right', results }]));
});
await p.reload();
await p.waitForTimeout(600);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-test-row').first().waitFor({ timeout: 30000 });
const pics = [];
const grab = async (where, text) => {
  for (const s of await p.locator('main .tr-sketch, main > svg[role="img"], main .mob-option').all()) pics.push({ where, text, html: await s.evaluate((e) => e.outerHTML) });
};
const back = () => p.locator('.topbar .icon-btn').first().click();
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();

const tests = await p.locator('.mob-test-row').count();
for (let i = 0; i < tests; i++) {
  await p.locator('.mob-test-row').nth(i).click();
  await p.waitForTimeout(150);
  const title = await p.locator('.topbar h1').innerText();
  const text = await p.locator('.tr-steps').innerText();
  await grab(`Test › ${title}`, text);
  await back();
  await p.waitForTimeout(100);
}
await tab('Ergebnis');
await p.waitForTimeout(200);
const pats = await p.locator('.mob-pattern').count();
for (let i = 0; i < pats; i++) {
  await p.locator('.mob-pattern').nth(i).click();
  await p.waitForTimeout(150);
  const title = await p.locator('.topbar h1').innerText();
  const text = await p.locator('.tr-section p').first().innerText();
  for (const s of await p.locator('main .tr-sketch').first().all()) pics.push({ where: `Muster › ${title}`, text, html: await s.evaluate((e) => e.outerHTML) });
  await back();
  await p.waitForTimeout(100);
}
await tab('Übungen');
await p.waitForTimeout(200);
const seenDrill = new Set();
const rows = await p.locator('.mob-test-row').count();
for (let i = 0; i < rows; i++) {
  const name = await p.locator('.mob-test-row .title').nth(i).innerText();
  if (seenDrill.has(name)) continue;
  seenDrill.add(name);
  await p.locator('.mob-test-row').nth(i).click();
  await p.waitForTimeout(150);
  const text = await p.locator('.tr-steps').innerText();
  for (const s of await p.locator('main .tr-sketch').all()) pics.push({ where: `Übung › ${name}`, text, html: await s.evaluate((e) => e.outerHTML) });
  await back();
  await p.waitForTimeout(100);
}
console.log(`${pics.length} pictures`);
const css = await p.evaluate(() => [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n'));
const per = 8;
for (let k = 0; k * per < pics.length; k++) {
  const html = `<!doctype html><meta charset="utf-8"><style>${css} body{background:#0e1418;color:#eef2ec;padding:12px;width:1500px} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px} .cell{background:#18222a;border-radius:12px;padding:8px} h3{font-size:13px;margin:0 0 4px} pre{white-space:pre-wrap;font:11px sans-serif;color:#c9d3cc;margin:6px 0 0}</style><div class="grid">${pics
    .slice(k * per, k * per + per)
    .map((x) => `<div class="cell"><h3>${x.where}</h3>${x.html}<pre>${x.text.replace(/</g, '&lt;')}</pre></div>`)
    .join('')}</div>`;
  const f = resolve(out, `mob-sheet-${k + 1}.html`);
  writeFileSync(f, html);
  await p.goto(pathToFileURL(f).href);
  await p.setViewportSize({ width: 1524, height: 900 });
  await p.screenshot({ path: resolve(out, `mob-sheet-${k + 1}.png`), fullPage: true });
}
await b.close();
