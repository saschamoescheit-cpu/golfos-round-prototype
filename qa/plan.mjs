// QA: plan the round (Sascha 16.10.2026) – targets and clubs per hole in "Runde planen", then the live round has
// the targets on the map and the caddie says the plan.  Usage: node qa/plan.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
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
  // wait for the hit itself, not a fixed time – under load (three tests at once) the search took longer (night 23./24.10.)
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().waitFor({ timeout: 30000 });
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.getByRole('button', { name: /^Runde planen/ }).waitFor({ timeout: 30000 });
  await p.waitForTimeout(600);
};
await pick();
await p.getByRole('button', { name: 'Runde planen' }).click();
const panel = p.locator('.plan-panel');
await panel.waitFor({ timeout: 30000 }).catch(() => {});
await panel.locator('.plan-shot').nth(1).waitFor({ timeout: 15000 }).catch(() => {});
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
  // a par 3 has its target too – to aim beside the flag or lay up (Sascha 24.10.2026): one to move, "+ Ziel" for a second
  if (k === 0) ok((await p.locator('.map-target, .map-crosshair').count()) >= 1 && (await p.locator('.plan-panel .plan-shot').count()) === 2 && (await p.locator('.plan-panel').getByRole('button', { name: '+ Ziel' }).count()) === 1, `par 3 (${(await p.locator('.map-hole-no').innerText()).trim()}): a target to move (${await p.locator('.plan-panel .plan-shot').count()} shots), "+ Ziel" for a layup`);
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
// the hole note while planning (Sascha 21.10.2026)
await p.locator('.plan-panel').getByRole('button', { name: /^Lochnotiz/ }).click();
await p.waitForTimeout(300);
await p.fill('#hole-note', 'Blind – auf den linken Baum');
await p.getByRole('button', { name: 'Für diesen Platz speichern' }).click();
await p.waitForTimeout(300);
const notes4 = await p.evaluate(() => Object.entries(localStorage).filter(([k]) => /note/i.test(k)).map(([, v]) => v).join(' '));
ok((await p.locator('.plan-panel').getByRole('button', { name: /^Lochnotiz – eine ist gespeichert/ }).locator('.note-dot').count()) === 1 && /linken Baum/.test(notes4), 'planning: "Lochnotiz" opens the hole note, saved for the course – a green dot on the button (Sascha 23.10.2026)');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/plan-4A.png' });
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
await p.locator('.hole-drawer').getByRole('button', { name: 'Vorschau beenden' }).click();
await p.waitForTimeout(800);
// ending the preview leads back to the round setup it was started from, its loops still chosen (Sascha 21.10.2026)
ok((await p.getByRole('button', { name: 'Runde starten' }).isVisible()) && (await p.locator('button.choice-loop[aria-pressed="true"]').first().innerText()).includes('A'), `preview ended: back in the round setup, A+B still chosen (${(await p.locator('button.choice-loop[aria-pressed="true"]').first().innerText().catch(() => '?')).replace(/\s+/g, ' ')})`);
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
// every hole looked at counts, short par 4s without a target too (Sascha 21.10.2026: "16 of 18 holes planned, but I
// planned every hole")
await p.getByRole('button', { name: /Runde planen/ }).click();
await p.waitForTimeout(3500);
for (let k = 0; k < 17; k++) {
  await p.getByRole('button', { name: 'Nächstes Loch' }).last().click();
  await p.waitForTimeout(900);
}
await p.waitForTimeout(600);
await p.locator('.hole-bar-handle').click();
await p.waitForTimeout(400);
await p.locator('.hole-drawer').getByRole('button', { name: 'Vorschau beenden' }).click();
await p.waitForTimeout(800);
await p.locator('button.choice-loop').filter({ hasText: /B.*C/ }).first().click();
await p.waitForTimeout(300);
ok((await planLabel()).includes('alle 18 Löcher geplant'), `setup B+C: every hole looked at is planned (${await planLabel()})`);
await p.locator('button.choice-loop').first().click();
await p.waitForTimeout(300);
// the birdie book shows the plan
await p.getByRole('button', { name: 'Birdiebook', exact: true }).click();
await p.waitForTimeout(4000);
const book1 = await p.locator('.book-hole').first().innerText();
ok(/5i vom Abschlag · dein Plan/.test(book1.replace(/\s+/g, ' ')) && /Dein Plan: 5i auf Ziel 1 – danach 9i ins Grün/.test(book1), 'birdie book 1A: the plan');
// out of bounds in the sketch: white, and on 1A too, where the boundary passes with its corners far away (Sascha 21.10.2026)
const ob1 = await p.locator('.book-hole').first().locator('.sk-ob').evaluateAll((es) => es.map((e) => getComputedStyle(e).stroke));
const obAll = await p.locator('.sk-ob').evaluateAll((es) => [...new Set(es.map((e) => getComputedStyle(e).stroke))]);
ok(ob1.length > 0 && obAll.join() === 'rgb(255, 255, 255)', `birdie book: out of bounds drawn white, 1A too (${ob1.length} on 1A · ${obAll.join(' ')})`);
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
