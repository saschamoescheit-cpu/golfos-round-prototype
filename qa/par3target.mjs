// QA (Sascha 24.10.2026): a par 3 has a target to move like every other hole – to aim beside the flag or to lay up.
// It starts in the middle of the green and leaves the caddie as he was; moved short, the caddie plays to it.
// Usage: node qa/par3target.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
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
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
await p.waitForTimeout(2000);
// to 2A, a par 3: the round goes on there (as after a hole played); the player stays at 1A's tee, the map measures from 2A's
await p.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1')); rs[0].currentHole = 1; localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs)); });
await p.reload();
await p.waitForTimeout(1500);
if (!(await p.locator('.map-hole-no').count())) await p.getByRole('button', { name: /Runde fortsetzen|Fortsetzen/ }).first().click().catch(() => {});
await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
await p.waitForTimeout(2500);
ok((await p.locator('.map-hole-no').innerText()).trim() === '2A', 'on 2A (par 3)');
const target = p.locator('.map-crosshair');
ok((await target.count()) === 1, 'a target to move on the par 3');
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(1500);
const head = async () => (await p.locator('.caddie-card .head').innerText()).replace(/\s+/g, ' ');
const before = await head();
ok(!/Ziel 1/.test(before), `untouched, the caddie plays to the green as before: "${before}"`);
// drag the target 60 px towards the tee: a layup
const box = await target.boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down();
for (let k = 1; k <= 12; k++) {
  await p.mouse.move(box.x + box.width / 2 - k * 2, box.y + box.height / 2 + k * 9);
  await p.waitForTimeout(30);
}
await p.mouse.up();
await p.waitForTimeout(1500);
const after = await head();
ok(/Ziel 1/.test(after) && after !== before, `moved short, the caddie plays to it: "${after}"`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
