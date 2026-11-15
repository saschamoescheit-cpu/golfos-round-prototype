// QA (night 14./15.11.2026, Sascha: "Die ganzen USA Plätze haben richtig schlechte 2D Ansichten … das maximal mögliche
// an Details"): the drawn hole (2D) on the Florida courses of the trip – a fairway, tree crowns, a green and its tee on
// every hole looked at (aerial fairways, crowns and greens since tonight, tee boxes where OSM had none). Counted in the
// screenshot's colours as qa/plan2d.mjs.  Usage: node qa/us2d.mjs [url]   (SHOTS=dir for the screenshots)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const COURSES = process.env.ONLY ? JSON.parse(process.env.ONLY) : [
  ['Hawks Landing', [1, 4, 12]],
  ['Celebration Golf', [1, 7]],
  ['The Reserve', [2, 5]],
  ['StoneGate Golf Club – Cypress', [1]],
  ['Orange Lake Resort – The Legends', [3]],
];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const shares = async (colours) => {
  const png = (await p.screenshot({ clip: { x: 0, y: 160, width: 390, height: 420 } })).toString('base64');
  return p.evaluate(
    async ([b64, cols]) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const want = Object.fromEntries(Object.entries(cols).map(([k, h]) => [k, hex(h)]));
      const n = Object.fromEntries(Object.keys(cols).map((k) => [k, 0]));
      for (let i = 0; i < d.length; i += 4)
        for (const [k, c] of Object.entries(want)) if (Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < 30) n[k]++;
      const all = d.length / 4;
      return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round((v / all) * 1000) / 10]));
    },
    [png, colours],
  );
};
const COLOURS = { ground: '#e3eed6', rough: '#23803d', fairway: '#3fb54d', crownDark: '#1d5a24' };
await p.goto(url);
await p.waitForTimeout(1200);
for (const [name, holes] of COURSES) {
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
  await p.fill('#course-search', name);
  await p.waitForTimeout(1500);
  const hit = p.locator('button.list-item').filter({ hasText: name.split(' – ')[0].split(' ')[0] }).first();
  if (!(await hit.count())) {
    ok(false, `${name}: found in the search`);
    continue;
  }
  await hit.click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: 'Platzvorschau' }).click();
  await p.waitForTimeout(7000);
  let at = 1;
  for (const h of holes) {
    while (at < h) {
      await p.locator('.hole-bar button').last().click();
      await p.waitForTimeout(600);
      at++;
    }
    await p.waitForTimeout(Number(process.env.WAIT ?? 9000));
    const s = await shares(COLOURS);
    ok(s.fairway > 3 && s.rough > 2, `${name} ${h}: fairway ${s.fairway} %, rough ${s.rough} %, crowns ${s.crownDark} %`);
    if (shots) await p.screenshot({ path: `${shots}/us2d-${name.replace(/\W+/g, '')}-${h}.png` });
  }
  await p.goto(url);
  await p.waitForTimeout(800);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
