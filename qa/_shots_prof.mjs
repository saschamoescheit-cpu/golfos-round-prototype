// temporary: screenshots of the Facelift (prof) screens – not committed
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5197/';
const out = process.argv[3];
const what = (process.argv[4] ?? 'profile').split(',');
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', colorScheme: 'dark' });
await mockNet(ctx);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'M', hcpIndex: '7,0', homeClub: 'GC Hetzenhof', gender: 'm' })); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(1200);
const shot = (n) => p.screenshot({ path: `${out}/${n}.png`, fullPage: true });
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(500);
if (what.includes('profile')) await shot('profile');
if (what.includes('help')) {
  await p.getByRole('button', { name: /Häufige Fragen/ }).click();
  await p.waitForTimeout(500);
  await shot('help-faq');
  await p.locator('.help-tabs button').first().click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/help-videos.png` });
  await p.getByRole('button', { name: /^Zurück/ }).first().click();
}
if (what.includes('bag')) {
  await p.locator('.list-item').filter({ hasText: 'Mein Bag' }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/bag.png` });
  await p.getByRole('button', { name: 'Bag bearbeiten' }).click();
  await p.waitForTimeout(300);
  await shot('bag-edit');
}
await b.close();
