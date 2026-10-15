// The Training module (15.10.2026): module choice, library, category, drill with a result, favourite, plan →
// session with timer (next, pause, continue, finish), progress, search, own plan, shop → cart → checkout (simulated),
// delete a session with undo, English. Usage: node training.mjs <app url> [shots dir]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const shot = async (n) => shots && p.screenshot({ path: `${shots}/flow-${n}.png`, fullPage: true });
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).click();
const back = () => p.locator('.topbar .icon-btn').first().click();

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: '' }));
});
await p.reload();
await p.waitForTimeout(800);
ok((await p.locator('.module-card').count()) === 3, 'three modules on the start page');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.waitForTimeout(800);
ok(await p.getByRole('heading', { name: 'Wissen' }).isVisible(), 'Training opens on the library');
const tabs = await p.locator('.tabbar button').allInnerTexts();
ok(tabs.join('|') === 'Wissen|Üben|Verlauf|Shop|Profil', `menu: ${tabs.join(' · ')}`);
const cats = await p.locator('.tr-cat').count();
ok(cats >= 17, `${cats} topics`);
await p.reload();
await p.waitForTimeout(800);
ok(await p.getByRole('heading', { name: 'Wissen' }).isVisible(), 'a reload stays in Training');

// category and drill
await p.locator('.tr-cat').filter({ hasText: 'Chippen' }).first().click();
await p.waitForTimeout(300);
ok((await p.locator('.topbar h1').innerText()) === 'Chippen', 'category page');
ok((await p.locator('.tr-drill-row').count()) >= 10, 'chipping has its drills');
await p.locator('button.chip').filter({ hasText: 'Könner' }).click();
const adv = await p.locator('.tr-drill-row').count();
await p.locator('button.chip').filter({ hasText: /^alle$/ }).first().click();
ok(adv > 0 && adv < (await p.locator('.tr-drill-row').count()), 'level filter works');
await p.locator('.tr-drill-row .list-item').filter({ hasText: 'Landering' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.tr-sketch svg').first().isVisible(), 'drill shows its sketch');
ok((await p.locator('.tr-targets .mine').innerText()).includes('Hcp 11–20'), 'target of the player’s band is highlighted (hcp 12.4)');
await p.locator('.tr-fav').click();
for (let i = 0; i < 11; i++) await p.locator('.tr-result button').nth(1).click();
await p.getByRole('button', { name: 'Ergebnis speichern' }).click();
ok(await p.getByRole('button', { name: 'Gespeichert ✓' }).isVisible(), 'result saved');
ok((await p.locator('.tr-entries li').count()) === 1, 'result in the list');
await shot('drill');
// video loads only on tap
ok((await p.locator('iframe').count()) === 0, 'no video before tapping');
await p.locator('.tr-video-cover').first().click();
ok((await p.locator('iframe[src*="youtube-nocookie.com"]').count()) === 1, 'video loads from youtube-nocookie on tap');
// gear from the drill
await p.locator('.tr-needs .chip').filter({ hasText: 'EyeLine' }).first().click();
await p.waitForTimeout(300);
await p.getByRole('button', { name: 'In den Warenkorb' }).click();
ok(await p.getByText('Im Warenkorb').isVisible(), 'gear into the cart from the drill');
await back();
await back();
await back();
await p.waitForTimeout(300);
ok(await p.getByRole('heading', { name: 'Deine Favoriten' }).isVisible(), 'favourite on the library page');

// search
await p.locator('.tr-search input').fill('Tiger');
await p.locator('.tr-search input').press('Enter');
await p.waitForTimeout(300);
ok((await p.locator('.tr-drill-row').filter({ hasText: 'Tiger' }).count()) >= 1, 'search finds the Tiger drill');
await back();

// plan → session
await tab('Üben');
await p.waitForTimeout(300);
ok((await p.locator('.tr-block .list-item').count()) >= 10, 'ready-made plans listed');
await p.locator('.list-item').filter({ hasText: 'Putten 30 Min: Startlinie' }).click();
await p.getByRole('button', { name: 'Einheit starten' }).click();
await p.waitForTimeout(2300);
ok(await p.locator('.tr-now').isVisible(), 'session runs');
ok(/0:0[1-3]/.test(await p.locator('.tr-timer-time').innerText()), 'timer counts');
await shot('session');
for (let i = 0; i < 14; i++) await p.locator('.tr-result button').nth(1).click();
await p.getByRole('button', { name: 'Fertig – nächste Übung' }).click();
ok((await p.locator('.tr-now-name').innerText()).includes('Tiger'), 'next drill after done');
// pause through the overview
await p.locator('.hole-bar .map-score').click();
ok((await p.locator('.drawer-row').count()) === 4, 'overview lists the 4 drills');
await p.locator('.drawer-action').filter({ hasText: 'Pausieren' }).click();
await p.waitForTimeout(300);
ok(await p.locator('.list-item.live').isVisible(), 'paused session is offered to continue');
// leave to the start page: the module card says a session is paused
await p.locator('.module-switch').click();
ok(await p.getByText('Eine Einheit ist pausiert').isVisible(), 'start page shows the paused session');
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.waitForTimeout(400);
ok(await p.locator('.tr-now').isVisible(), 'opening Training again continues the session');
await back();
await p.getByRole('button', { name: 'Einheit beenden' }).click();
await p.getByRole('button', { name: 'Beenden & Ergebnis ansehen' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.tr-stats strong').first().innerText()).startsWith('1/4'), 'result page: 1 of 4 drills done');
await shot('result');
await back();
await p.waitForTimeout(200);
ok(await p.getByRole('heading', { name: 'Bestwerte' }).isVisible(), 'progress shows the best results');
const sessionsBlock = () => p.locator('.tr-block').filter({ has: p.getByRole('heading', { name: 'Einheiten', exact: true }) });
ok((await sessionsBlock().locator('.list-item').count()) === 1, 'finished session in the list');
// delete with undo
await sessionsBlock().locator('.list-item').first().click();
await p.getByRole('button', { name: 'Einheit löschen' }).click();
await p.waitForTimeout(200);
ok(await p.getByText('Einheit gelöscht').isVisible(), 'undo toast after deleting');
await p.getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(300);
await tab('Üben');
await tab('Verlauf');
ok((await sessionsBlock().locator('.list-item').count()) === 1, 'session restored by undo');

// own plan
await tab('Üben');
await p.getByRole('button', { name: '+ Eigene Einheit zusammenstellen' }).click();
await p.locator('.tr-add').nth(0).click();
await p.locator('.tr-add').nth(3).click();
await p.getByRole('button', { name: 'Plan speichern' }).click();
await p.waitForTimeout(200);
ok((await p.locator('.tr-block').filter({ hasText: 'Meine Pläne' }).locator('.list-item').count()) === 1, 'own plan saved');

// shop
await tab('Shop');
await p.waitForTimeout(800);
const products = await p.locator('.tr-product').count();
ok(products >= 40, `${products} products`);
await p.locator('.tr-product').nth(0).locator('.chip').click();
await shot('shop');
await p.locator('.tr-cart-btn').click();
ok((await p.locator('.tr-cart-line').count()) === 2, 'two products in the cart');
await p.getByRole('button', { name: 'Zur Kasse' }).click();
ok((await p.locator('#co-name').inputValue()) === 'Sascha Möscheit', 'checkout takes the name from the profile');
await p.getByRole('button', { name: 'Jetzt bestellen (simuliert)' }).click();
await p.waitForTimeout(300);
ok(await p.getByText('Bestellung aufgenommen – nur im Prototyp').isVisible(), 'order is only simulated');
await p.getByRole('button', { name: 'Zurück zum Shop' }).click();
ok((await p.locator('.tabbar button').filter({ hasText: 'Shop' }).innerText()) === 'Shop', 'cart is empty after the order');
await p.waitForTimeout(1500);
const imgs = await p.locator('img.tr-gear-img').count();
ok(imgs >= 30, `${imgs} manufacturer pictures loaded`);

// English
await p.evaluate(() => localStorage.setItem('golfos.lang.v1', 'en'));
await p.reload();
await p.waitForTimeout(800);
await tab('Library');
ok(await p.getByRole('heading', { name: 'Library' }).isVisible(), 'English library');
await p.locator('.tr-cat').filter({ hasText: 'Uneven lies' }).click();
ok((await p.locator('.topbar h1').innerText()) === 'Uneven lies', 'English category');

console.log(errs.length ? `✗ page errors:\n${errs.join('\n')}` : '✓ no page errors');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
