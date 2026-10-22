// QA: a tee for every player on every course (Sascha 22.10.2026: "at Frielinghausen I cannot choose a tee at all";
// green tees for children, black tees, tees by number in Spain). Frielinghausen: the tees its map knows (yellow, red);
// Hubbelrath (no tees mapped): the usual colours with black and green; any tee typed in ("58").
// Usage: node qa/teepick.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', hcpIndex: '7' }));
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1000);
const open = async (name) => {
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', name);
  await p.waitForTimeout(2500);
  await p.locator('button.list-item').first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 60000 });
};
const sheet = () => p.getByRole('dialog', { name: 'Tee' });

// Frielinghausen: yellow and red from its map, yellow to start with
await open('Frielinghausen');
const row = p.locator('.player-row').first();
ok((await row.locator('.field-label').first().innerText()) === 'Tee', 'the column is called "Tee"');
ok((await row.getByRole('button', { name: /Tee von Sascha: Gelb/ }).count()) === 1, 'Frielinghausen: yellow to start with');
await row.locator('.tee-pick').click();
const fr = (await sheet().locator('.pick-option strong').allInnerTexts()).join(', ');
ok(fr === 'Gelb, Rot', `Frielinghausen: the tees its map knows (${fr})`);
await sheet().locator('.pick-option').filter({ hasText: 'Rot' }).click();
ok((await row.getByRole('button', { name: /Tee von Sascha: Rot/ }).count()) === 1, 'red chosen');
// a tee by number, typed in
await row.locator('.tee-pick').click();
await sheet().getByLabel('Anderer Tee (Farbe oder Zahl)').fill('58');
await sheet().getByRole('button', { name: 'Übernehmen' }).click();
ok((await row.getByRole('button', { name: /Tee von Sascha: Tee 58/ }).count()) === 1, 'a tee by number typed in: "Tee 58"');
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.getByRole('button', { name: 'Zurück' }).first().click().catch(() => {});
await p.waitForTimeout(800);

// Hubbelrath: no tees in its map – the usual colours, black and green among them
await p.goto(url);
await p.waitForTimeout(1000);
await open('Hubbelrath');
const row2 = p.locator('.player-row').first();
await row2.locator('.tee-pick').click();
const hb = (await sheet().locator('.pick-option strong').allInnerTexts()).join(', ');
ok(/Schwarz/.test(hb) && /Grün/.test(hb) && /Gelb/.test(hb), `a course without known tees: the usual colours (${hb})`);
await sheet().locator('.pick-option').filter({ hasText: 'Grün' }).click();
ok((await row2.getByRole('button', { name: /Tee von Sascha: Grün/ }).count()) === 1, 'green chosen (children)');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
