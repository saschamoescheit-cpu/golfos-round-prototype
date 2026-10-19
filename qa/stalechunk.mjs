// A new version went live while the app was open (Sascha 19.10.2026: "error loading dynamically imported module …
// Swing3D-….js", often lately): a part of the app that cannot be loaded makes the app reload once onto the new
// version – no error screen. If it fails again right after, the error screen shows (no reload loop).
// Usage: node qa/stalechunk.mjs [url]   (the dev server: the module of Training stands in for a stale part)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
for (const [label, failures] of [['once', 1], ['always', 99]]) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', serviceWorkers: 'block' }); // the request must reach the test, not the offline cache
  await mockNet(ctx);
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.clear(); });
  await p.reload();
  await p.waitForTimeout(1000);
  let loads = 0;
  // the Training module as a part of the old version that is gone – after the reload the new version asks for other
  // file names (here: the same one, now there), or it is gone again ('always')
  await ctx.route(/\/src\/screens\/Training\.tsx|\/assets\/Training-[\w-]+\.js/, (r) => (failures > 1 || loads === 0 ? r.abort('failed') : r.continue({ url: r.request().url() + (r.request().url().includes('?') ? '&' : '?') + 'v=new' })));
  p.on('load', () => loads++);
  await p.locator('.module-card').filter({ hasText: 'Training' }).first().click();
  await p.waitForTimeout(6000);
  const errorScreen = (await p.getByText('Da ist etwas schiefgelaufen').count()) > 0;
  if (label === 'once') {
    ok(!errorScreen && loads === 1, `fails once: the app reloads by itself onto the new version, no error screen (${loads} reload)`);
    ok((await p.locator('.tabbar').count()) > 0, 'fails once: Training opens after the reload');
  } else {
    ok(errorScreen && loads <= 1, `fails again: the error screen, no reload loop (${loads} reload)`);
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
