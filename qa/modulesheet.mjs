// QA (Sascha 12.11.2026: "a burger menu or so, to switch between the modules faster" – mock-up A, the sheet from
// below): in a module the module button top left opens a sheet with the same cards as the start page (what is to do on
// each), the module one is in marked; a tap on another card goes there at once – no detour over the start page; the
// cross closes it and one stays where one was.
// Usage: node qa/modulesheet.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  sessionStorage.setItem('golfos.module', 'games');
}, null);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await p.waitForTimeout(400);

await p.locator('.module-switch').first().click();
const sheet = p.getByRole('dialog', { name: 'Modul wechseln' });
await sheet.waitFor({ timeout: 5000 }).catch(() => {});
ok(await sheet.isVisible(), 'the module button opens the sheet "Modul wechseln"');
const names = (await sheet.locator('.module-card:not(.module-home) strong').allInnerTexts()).map((t) => t.trim());
ok(names.join('|') === 'Rounds|Games & Bets|Tournaments|Training (Beta)|Agility (Beta)', `the same five cards as the start page (${names.join(' | ')})`);
const on = await sheet.locator('.module-card.on strong').allInnerTexts();
ok(on.length === 1 && on[0].trim() === 'Games & Bets', `the module one is in is marked (${on.join(', ')})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/modulesheet.png` });

// the cross: closed, still in Games on "Wetten"
await sheet.getByRole('button', { name: 'Schließen' }).click();
await p.waitForTimeout(300);
ok((await sheet.count()) === 0, 'the cross closes it');
ok((await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).count()) === 1, 'still in Games & Bets');

// a tap on "Rounds": there at once
await p.locator('.module-switch').first().click();
await sheet.waitFor();
await sheet.locator('.module-card').filter({ hasText: 'Rounds' }).click();
await p.waitForTimeout(800);
ok((await sheet.count()) === 0, 'the sheet closes on a pick');
ok((await p.locator('.tabbar button').filter({ hasText: 'Runden' }).count()) === 1 && (await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).count()) === 0, 'Rounds is open – no detour over the start page');
ok((await p.locator('.brand-claim').count()) === 0, 'not the start page');

// and back to Games & Bets: where it was (the tab "Wetten")
await p.locator('.module-switch').first().click();
await sheet.waitFor();
await sheet.locator('.module-card').filter({ hasText: 'Games & Bets' }).click();
await p.waitForTimeout(800);
ok((await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).count()) === 1, 'back in Games & Bets');
// "Startseite" (Sascha 13.11.2026: "one does not get back to the start page any more"): the sheet's first row
await p.locator('.module-switch').first().click();
await sheet.waitFor();
const first = (await sheet.locator('.module-card strong').first().innerText()).trim();
ok(first === 'Startseite', `the sheet's first row is "Startseite" (${first})`);
await sheet.locator('.module-home').click();
await p.waitForTimeout(800);
ok((await sheet.count()) === 0 && (await p.locator('.module-switch').count()) === 0, 'it goes to the start page (no module pill there)');
ok((await p.locator('.module-card').filter({ hasText: 'Rounds' }).count()) === 1, 'the start page with its module cards');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
