// QA: plan the round (Sascha 16.10.2026) – targets and clubs per hole in "Runde planen", then the live round has
// the targets on the map and the caddie says the plan.  Usage: node qa/plan.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1500);
const pick = async () => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(1200);
};
await pick();
await p.getByRole('button', { name: 'Runde planen' }).click();
await p.waitForTimeout(3500);
const panel = p.locator('.plan-panel');
ok(await panel.isVisible(), 'planning: the plan of 1A over the hole bar');
const shots = await panel.locator('.plan-shot').count();
ok(shots === 2, `1A: ${shots} shots (tee → target 1 → green)`);
await panel.locator('select').first().selectOption('5i');
await panel.locator('select').nth(1).selectOption('9i');
await p.waitForTimeout(300);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.strategy.v1.osm:relation/1326323') ?? '{}'));
ok(saved['1A']?.clubs?.join(',') === '5i,9i' && saved['1A']?.targets?.length === 1, `plan saved: ${JSON.stringify(saved['1A']?.clubs)}`);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/plan-1A.png' });
// a par 5 (4A): three shots – two targets from the start; "+ Ziel" / "− Ziel" (Sascha 16.10.2026)
for (let k = 0; k < 3; k++) {
  await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  await p.waitForTimeout(1200);
}
const label4 = (await p.locator('.map-hole-no').innerText()).trim();
const shots4 = await p.locator('.plan-panel .plan-shot').count();
ok(label4 === '4A' && shots4 === 3, `par 5 ${label4}: ${shots4} shots (tee → target 1 → target 2 → green)`);
await p.locator('.plan-panel').getByRole('button', { name: '− Ziel 2' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.plan-panel .plan-shot').count()) === 2, '"− Ziel 2" removes the second target');
await p.locator('.plan-panel').getByRole('button', { name: '+ Ziel' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.plan-panel .plan-shot').count()) === 3, '"+ Ziel" adds it back');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/plan-4A.png' });
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
await p.locator('.hole-drawer').getByRole('button', { name: 'Vorschau beenden' }).click();
await p.waitForTimeout(800);
await pick();
// every hole looked at counts – also the two only seen (Sascha 16.10.2026: "nur 13 Löcher geplant, obwohl ich alle
// 18 geplant habe"); a loop planned once counts in every combination
const planLabel = async () => (await p.getByRole('button', { name: /Runde planen/ }).innerText()).replace(/\s+/g, ' ');
const savedNow = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('golfos.strategy.v1.osm:relation/1326323') ?? '{}')).sort().join(','));
ok(savedNow === '1A,2A,3A,4A', `planned: ${savedNow} (2A and 3A only looked at)`);
ok((await planLabel()).includes('4 von 18 Löchern geplant'), `setup A+B: ${await planLabel()}`);
await p.locator('button.choice-loop').filter({ hasText: /C.*A/ }).first().click();
await p.waitForTimeout(300);
ok((await planLabel()).includes('4 von 18 Löchern geplant'), `setup C+A: the A holes count too (${await planLabel()})`);
await p.locator('button.choice-loop').filter({ hasText: /B.*C/ }).first().click();
await p.waitForTimeout(300);
ok(!(await planLabel()).includes('geplant'), `setup B+C: nothing planned yet (${await planLabel()})`);
await p.locator('button.choice-loop').first().click();
await p.waitForTimeout(300);
// the birdie book shows the plan
await p.getByRole('button', { name: 'Birdiebook', exact: true }).click();
await p.waitForTimeout(4000);
const book1 = await p.locator('.book-hole').first().innerText();
ok(/5i vom Abschlag · dein Plan/.test(book1.replace(/\s+/g, ' ')) && /Dein Plan: 5i auf Ziel 1 – danach 9i ins Grün/.test(book1), 'birdie book 1A: the plan');
await p.locator('.topbar').getByRole('button').first().click();
await p.waitForTimeout(800);
// the live round: the planned target is there, the caddie says the plan
await p.getByText('Runde starten').click();
await p.waitForTimeout(6000);
await p.getByRole('button', { name: /Caddie zeigen/ }).click().catch(() => {});
await p.waitForTimeout(800);
const card = await p.locator('.caddie-card').innerText().catch(() => '');
ok(/Dein Plan: 5i auf Ziel 1 – danach 9i ins Grün/.test(card), `caddie: ${card.split('\n').find((l) => l.includes('Plan')) ?? '–'}`);
ok((await p.locator('.plan-panel').count()) === 0, 'live round: no plan panel');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/plan-live.png' });
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
