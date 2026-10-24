// Many 3D videos in a row (WebKit, like an iPhone): every test page opened three times – 45 WebGL players one after
// the other. Before the fix the page crashed after a few dozen ("Target crashed"): closed players kept their WebGL
// context. Checks that each player draws and that the WebGL contexts are given back.
// With "real": the realistic golfer (golfos.real3d, 23.10.2026) – every player shows it.
// Usage: node mobility-3d-stress.mjs <app url> [rounds] [real]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const rounds = Number(process.argv[3] ?? 3);
const real = process.argv[4] === 'real';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx); // no weather calls from the tests (Open-Meteo quota of the home line)
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let crashed = false;
p.on('crash', () => (crashed = true));
await p.addInitScript(() => {
  // count WebGL contexts that are alive (created and not lost)
  const w = window;
  w.__gl = { made: 0, lost: 0 };
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = orig.call(this, type, ...rest);
    if (c && /webgl/.test(String(type)) && !this.__counted) {
      this.__counted = true;
      w.__gl.made++;
      this.addEventListener('webglcontextlost', () => w.__gl.lost++);
    }
    return c;
  };
});
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
});
if (real) await p.evaluate(() => localStorage.setItem('golfos.real3d', '1'));
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Agility' }).click();
await p.locator('.mob-test-row').first().waitFor({ timeout: 20000 });
let opened = 0;
let drawn = 0;
let realistic = 0;
outer: for (let r = 0; r < rounds; r++) {
  for (let i = 0; i < 15; i++) {
    if (crashed) break outer;
    await p.locator('.mob-test-row').nth(i).click();
    await p.locator('.mob-3d canvas').waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(400);
    opened++;
    if (await p.locator('.mob-3d canvas').isVisible().catch(() => false)) drawn++;
    // the realistic body loads once – the first player starts loading it (over 8 s in the test browser, and once it is
    // there the test browser draws it so slowly without a graphics card that waiting for it runs the rest out of time) –,
    // then every player starts with it
    if (real && opened > 1 && (await p.locator('.mob-3d canvas[data-body="realistic"]').waitFor({ timeout: 8000 }).then(() => true).catch(() => false))) realistic++;
    await p.locator('.topbar .icon-btn').first().click().catch(() => {});
    await p.locator('.mob-test-row').first().waitFor({ timeout: 10000 }).catch(() => {});
  }
}
const gl = crashed ? null : await p.evaluate(() => window.__gl);
const live = gl ? gl.made - gl.lost : -1;
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
ok(!crashed, `no crash after ${opened} 3D videos`);
ok(drawn === opened, `${drawn} of ${opened} players shown`);
if (real) ok(realistic === opened - 1, `${realistic} of ${opened - 1} players after the first show the realistic golfer`);
ok(live >= 0 && live <= 2, `WebGL contexts given back (${gl?.made} made, ${gl?.lost} lost, ${live} alive)`);
ok(errs.length === 0, `no page errors${errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all green');
process.exit(bad ? 1 : 0);
