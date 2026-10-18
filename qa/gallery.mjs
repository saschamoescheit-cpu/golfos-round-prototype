// 2D gallery (night run 15./16.10.2026): every hole of every bundled course in the 2D view, as small JPEGs for a page
// to look through. Usage: node gallery.mjs <app url> <out dir> ["Course name" or "Course name|loop option" …]
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const [url, out, ...only] = process.argv.slice(2);
const COURSES = only.length
  ? only
  : ['Hetzenhof', 'Son Quint', 'Son Vida', 'Son Muntaner', 'Son Gual', 'Alcanada', 'Canyamel', 'Son Térmens', 'Maioris', 'Pula', 'Puntiró', 'Son Antem West', 'Son Antem East'];
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const index = [];
for (const entry of COURSES) {
  const [course, option] = entry.split("|");
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, locale: 'de-DE', geolocation: { latitude: 0, longitude: 0, accuracy: 5 }, permissions: ['geolocation'] });
  await mockNet(ctx);
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.mapview.v1', '2d');
    sessionStorage.setItem('golfos.module', 'rounds');
  });
  await p.reload();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', course);
  await p.waitForTimeout(1500);
  await p.locator('button.list-item').filter({ hasText: course }).first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  if (option) await p.locator('button.choice-loop').filter({ hasText: option }).first().click();
  await p.getByRole('button', { name: 'Platzvorschau' }).click();
  await p.waitForTimeout(6000);
  const n = await p.evaluate(() => {
    const r = document.querySelector('.hole-bar')?.textContent ?? '';
    const m = r.match(/\/(\d+)/);
    return m ? Number(m[1]) : 18;
  });
  const holes = [];
  for (let k = 0; k < n; k++) {
    if (k > 0) {
      await p.locator('.hole-bar button').last().click();
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(3500);
    const label = (await p.locator('.map-hole-no').innerText().catch(() => String(k + 1))).trim();
    const par = (await p.locator('.hole-bar').innerText().catch(() => '')).match(/Par (\d)/)?.[1] ?? '';
    const file = `${course.replace(/\W+/g, '')}-${label.replace(/\W+/g, '')}.jpg`;
    await p.screenshot({ path: `${out}/${file}`, type: 'jpeg', quality: 55 });
    holes.push({ label, par, file });
  }
  index.push({ course, holes });
  console.log(course, holes.length);
  await ctx.close();
}
writeFileSync(`${out}/index.json`, JSON.stringify(index));
await b.close();
