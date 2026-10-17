// QA: the round summary's practice plan into Training – only when the player taps it (Sascha 16.10.2026: "Automatisch
// nicht, das soll der User selbst entscheiden"). A finished 9-hole round with three putts, its scorecard, the button.
// Usage: node qa/totraining.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/localhost:\d+\/[0-9a-f-]{36} due to access control/.test(e.message)) errs.push(e.message); }); // MapLibre's freed tile blobs (WebKit under test)
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const plans = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.training.plans.v1') ?? '[]'));

await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(3000);
// played: bogey golf with three putts everywhere – the plan says putting
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  const r = rs[0];
  const id = r.players.find((x) => x.isMe).id;
  r.entries[id] = r.entries[id].map((e, k) => ({ ...e, strokes: r.holes[k].par + 1, putts: 3, penalties: 0 }));
  r.finishedAt = new Date().toISOString();
  r.capture = 'full';
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
await p.waitForTimeout(400);
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1200);
const btn = p.getByRole('button', { name: 'Ins Training übernehmen' });
ok((await btn.count()) === 1, 'summary: "Ins Training übernehmen" under the practice plan');
ok((await plans()).length === 0, 'nothing in Training before the tap');
await btn.click();
await p.waitForTimeout(1200);
const after = await plans();
ok(after.length === 1 && /^Nach der Runde \d\d\.\d\d\. · .*Hetzenhof/.test(after[0].name) && after[0].items.length > 0, `Training: own plan "${after[0]?.name}" with ${after[0]?.items.length} drills`);
ok((await p.getByRole('button', { name: 'Im Training ✓' }).isDisabled()) && (await p.getByText(/Im Training gespeichert als/).count()) === 1, 'button: "Im Training ✓", note where to find it');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/totraining.png', fullPage: true });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
