// The basic swing (P system, Sascha 18.11.2026): the topic opens on its positions, the series flips through, a
// position shows photo, what you see, check points, faults and drills; mirrored for a left-hander; iPhone SE fits.
// Usage: node qa/psystem.mjs [url] [out dir for screenshots]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3];
let fails = 0;
const ok = (c, m) => (console.log(`${c ? '✓' : '✗'} ${m}`), c || fails++);
const b = await webkit.launch();
for (const [dev, left] of [['iPhone 13', false], ['iPhone SE', true]]) {
  const ctx = await b.newContext({ ...devices[dev], locale: 'de-DE' });
  await mockNet(ctx);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message) && errs.push(e.message));
  await p.goto(url);
  await p.waitForTimeout(1000);
  await p.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.lang.v1', 'de');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Test', hcpIndex: '12,4', homeClub: '', hand: l ? 'left' : 'right' }));
  }, left);
  await p.reload();
  await p.waitForTimeout(800);
  await p.locator('.module-card').filter({ hasText: 'Training' }).click();
  await p.waitForTimeout(800);
  await p.locator('.tr-cat').filter({ hasText: 'Grundschwung' }).first().click();
  await p.waitForTimeout(600);
  ok((await p.locator('.tr-seq').count()) === 1, `${dev}: the topic opens on the positions with the series`);
  ok((await p.locator('.tr-shots .list-item').count()) === 10, `${dev}: ten positions listed`);
  const img = p.locator('.tr-seq img');
  await p.waitForFunction(() => [...document.querySelectorAll('.tr-seq img')].every((i) => i.complete && i.naturalWidth > 0));
  const first = await img.getAttribute('src');
  await p.locator('.tr-seq input[type=range]').fill('3');
  await p.waitForTimeout(200);
  ok((await img.getAttribute('src')) !== first && /p4\.jpg$/.test((await img.getAttribute('src')) ?? ''), `${dev}: the slider flips to P4`);
  ok((await p.locator('.tr-pos-photo.mirror').count() > 0) === left, `${dev}: mirrored only for a left-hander (left=${left})`);
  if (out) await p.screenshot({ path: `${out}/${dev.replace(' ', '')}-topic.png`, fullPage: true });
  await p.locator('.tr-shots .list-item').nth(2).click();
  await p.waitForTimeout(500);
  const text = await p.locator('main').innerText();
  ok(/P3 · Linker Arm waagerecht/.test(text) && /Was du siehst/i.test(text) && /Prüfpunkte/i.test(text) && /Typische Fehler/i.test(text) && /So übst du es/i.test(text), `${dev}: P3 shows photo text, check points, faults and drills`);
  await p.getByRole('button', { name: /P4 ›/ }).click();
  await p.waitForTimeout(300);
  ok(/P4 · Top/.test(await p.locator('main').innerText()), `${dev}: "P4 ›" goes to the next position`);
  if (out) await p.screenshot({ path: `${out}/${dev.replace(' ', '')}-p4.png`, fullPage: true });
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!wide, `${dev}: no sideways scroll`);
  ok(errs.length === 0, `${dev}: no page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
