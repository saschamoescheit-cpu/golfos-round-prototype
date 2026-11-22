// The standard chip as photos (Sascha 21.11.2026, mockup B): the Motion tab shows C1–C4 from behind, from the front
// or both, a slider, "Schlag abspielen" and the four positions; a position flips only within the chip; mirrored for a
// left-hander; iPhone SE fits. Usage: node qa/chipfotos.mjs [url] [out dir for screenshots]
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
  await p.locator('.tr-cat').filter({ hasText: 'Chippen' }).first().click();
  await p.waitForTimeout(600);
  await p.locator('.tr-shots .list-item').filter({ hasText: 'Der Standard-Chip' }).first().click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Nächste' }).first().click();
  await p.waitForTimeout(500);
  ok((await p.locator('.tr-seq').count()) === 1, `${dev}: Motion shows the chip as photos`);
  // under the tab's name only "2 von 4" – with its text the line was cut on the iPhone SE (Sascha 22.11.2026)
  {
    const sub = await p.locator('.step-pick-now .muted').first().evaluate((s) => ({ t: s.textContent.trim(), fits: s.scrollWidth <= s.clientWidth + 1 }));
    ok(sub.t === '2 von 4' && sub.fits, `${dev}: the tab says only "2 von 4" and fits (${sub.t})`);
  }
  ok((await p.locator('.tr-shots .list-item').count()) === 4, `${dev}: four positions C1–C4 listed`);
  ok((await p.locator('.sketch, .tr-sketch').count()) === 0, `${dev}: the photos instead of the sketch`);
  const seg = p.getByRole('group', { name: 'Perspektive', exact: true });
  { const v = (await seg.getByRole('button').allTextContents()).join('|'); ok(v === 'Von vorn|Von hinten|Beide', `${dev}: views from the front, from behind, both (${v})`); }
  ok((await seg.getByRole('button', { name: 'Von hinten' }).getAttribute('aria-pressed')) === 'true', `${dev}: from behind first`);
  await p.waitForFunction(() => [...document.querySelectorAll('.tr-seq img')].every((i) => i.complete && i.naturalWidth > 0));
  const src = () => p.locator('.tr-seq img').first().getAttribute('src');
  ok(/chip\/c1\.jpg$/.test((await src()) ?? ''), `${dev}: C1 from behind`);
  await seg.getByRole('button', { name: 'Von vorn' }).click();
  await p.waitForTimeout(200);
  ok(/chip\/fo-c1\.jpg$/.test((await src()) ?? '') && (await p.locator('.tr-seq img').count()) === 1, `${dev}: from the front`);
  await seg.getByRole('button', { name: 'Beide' }).click();
  await p.waitForTimeout(200);
  ok((await p.locator('.tr-seq img').count()) === 2, `${dev}: both side by side`);
  const box = await p.locator('.tr-seq').boundingBox();
  ok(box && box.x >= 0 && box.x + box.width <= (dev === 'iPhone SE' ? 320 : 390) + 1, `${dev}: fits the screen (${box && Math.round(box.width)} px)`);
  await p.locator('.tr-seq input[type=range]').fill('2');
  await p.waitForTimeout(200);
  ok((await p.locator('.tr-seq-ctl strong').innerText()) === 'C3 · Treffmoment' && /c3\.jpg$/.test((await src()) ?? ''), `${dev}: the slider flips to C3`);
  ok((await p.locator('.tr-seq-ctl .chip').innerText()) === 'Schlag abspielen', `${dev}: "Schlag abspielen"`);
  ok((await p.locator('.tr-seq img.mirror').count() > 0) === left, `${dev}: mirrored only for a left-hander (left=${left})`);
  if (out) await p.screenshot({ path: `${out}/${dev.replace(' ', '')}-chip.png`, fullPage: true });
  await p.locator('.tr-shots .list-item').nth(3).click();
  await p.waitForTimeout(500);
  const text = (await p.locator('main').textContent()) ?? '';
  ok(/C4 · Finish/.test(text) && /Der Standard-Chip/.test(text) && /Prüfpunkte/.test(text) && /Typische Fehler/.test(text), `${dev}: C4 with the chip above, check points and faults`);
  ok((await p.locator('.tr-pos-pair img').count()) === 2, `${dev}: C4 from behind and from the front`);
  ok((await p.locator('.tr-pos-nav .chip').allInnerTexts()).join('|') === '‹ C3', `${dev}: C4 flips back to C3 only – not on to the basic swing`);
  if (out) await p.screenshot({ path: `${out}/${dev.replace(' ', '')}-c4.png`, fullPage: true });
  ok(errs.length === 0, `${dev}: no page errors ${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
