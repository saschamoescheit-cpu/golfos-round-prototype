// Game forms in the picker (Sascha 23.10.2026): alphabetical, a star marks a favourite, favourites stand on top in their
// own group "Favoriten" – kept after a reload; picking a form still works from both groups.
// Usage: node gamefavs.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(800);
const open = async () => {
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.waitForTimeout(300);
  return p.getByRole('dialog', { name: 'Spielform wählen' });
};
const names = async (sheet, group) => (await sheet.locator(`.pick-group[data-group="${group}"] .pick-option strong`).allInnerTexts()).map((s) => s.trim());
const sorted = (xs) => [...xs].sort((a, c) => a.localeCompare(c, 'de'));

let sheet = await open();
let all = await names(sheet, 'all');
ok(all.length >= 10 && all.join('|') === sorted(all).join('|'), `alphabetical: ${all.join(', ')}`);
ok((await sheet.locator('.pick-group[data-group="fav"]').count()) === 0, 'no favourites group before a star is set');
ok((await sheet.locator('.pick-group .eyebrow').count()) === 0, 'without favourites no group titles');
ok((await sheet.locator('.fav-star').count()) === all.length, 'a star beside every form');
const star = (name) => sheet.locator('.pick-row').filter({ has: p.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).locator('.fav-star');
await star('Wolf').click();
await star('Skins').click();
await p.waitForTimeout(200);
const favs = await names(sheet, 'fav');
ok(favs.join('|') === 'Skins|Wolf', `favourites on top, alphabetical: ${favs.join(', ')}`);
ok((await sheet.locator('.pick-group').first().getAttribute('data-group')) === 'fav', 'the favourites group comes first');
ok((await sheet.locator('.pick-group[data-group="fav"] .eyebrow').textContent()).trim() === 'Favoriten', 'titled "Favoriten"');
ok((await sheet.locator('.pick-group[data-group="all"] .eyebrow').textContent()).trim() === 'Weitere Spielformen', 'the rest titled "Weitere Spielformen"');
all = await names(sheet, 'all');
ok(!all.includes('Wolf') && !all.includes('Skins') && all.join('|') === sorted(all).join('|'), 'the rest without the favourites, still alphabetical');
ok((await star('Wolf').getAttribute('aria-pressed')) === 'true', 'a favourite\'s star is pressed');
const color = await star('Wolf').evaluate((el) => getComputedStyle(el).color);
const brand = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--brand)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
ok(color === brand, `the marked star in the brand green (${color})`);
const bg = await star('Wolf').evaluate((el) => getComputedStyle(el).backgroundColor);
ok(bg !== brand, `… on a clear button, not swallowed by a green fill (${bg})`);
ok((await sheet.locator('.fav-star svg').count()) > 0 && !/[★☆]/.test(await sheet.innerText()), 'stars are SVG symbols, no emoji');
// pick from the favourites
await sheet.locator('.pick-group[data-group="fav"] .pick-option').filter({ hasText: 'Wolf' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.settings-row').filter({ hasText: 'Spielform' }).innerText()).includes('Wolf'), 'picking a favourite sets the form');

// kept after a reload; un-starring moves it back
await p.reload();
await p.waitForTimeout(800);
sheet = await open();
ok((await names(sheet, 'fav')).join('|') === 'Skins|Wolf', 'favourites kept after a reload');
await star('Skins').click();
await p.waitForTimeout(200);
ok((await names(sheet, 'fav')).join('|') === 'Wolf', 'un-starring removes it from the favourites');
ok((await names(sheet, 'all')).includes('Skins'), '… and puts it back among the rest');
// the sheet fits the small phone: no row wider than the screen
const wide = await sheet.evaluate((el) => [...el.querySelectorAll('.pick-row')].some((r) => r.getBoundingClientRect().right > window.innerWidth + 0.5));
ok(!wide, 'every row fits the 320-px screen');
await sheet.locator('.pick-group[data-group="all"] .pick-option').filter({ hasText: 'Skins' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.settings-row').filter({ hasText: 'Spielform' }).innerText()).includes('Skins'), 'picking from the rest sets the form');

ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
