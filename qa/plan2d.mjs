// QA: the 2D view at BeBrassie quality (Sascha 16.10.2026) – Hetzenhof 1A drawn: a light ground, the hole's dark rough
// as one shape, a bright fairway, drawn tree crowns; back on the aerial image nothing of it is left. Counted in the
// screenshot's colours (the map canvas itself cannot be read).  Usage: node qa/plan2d.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
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
await p.waitForTimeout(1200);
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
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(9000);

/** Share of the map area (between the top boxes and the hole bar) near each colour. */
const shares = async (colours) => {
  const png = (await p.screenshot({ clip: { x: 0, y: 160, width: 300, height: 380 } })).toString('base64');
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
const s2d = await shares(COLOURS);
ok(s2d.ground > 20, `2D: light ground around the hole (${s2d.ground} %)`);
ok(s2d.rough > 5, `2D: the hole's dark rough as one shape (${s2d.rough} %)`);
ok(s2d.fairway > 5, `2D: a bright fairway (${s2d.fairway} %)`);
ok(s2d.crownDark > 0.2, `2D: drawn tree crowns (${s2d.crownDark} %)`);
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/plan2d-1A.png' });
// next hole: still drawn
await p.locator('.hole-bar button').last().click();
await p.waitForTimeout(4000);
const s2 = await shares(COLOURS);
ok(s2.ground > 20 && s2.rough > 3, `2D on 2A too (ground ${s2.ground} %, rough ${s2.rough} %)`);
// back to the aerial image: nothing of the drawing is left
await p.getByRole('button', { name: 'Luftbild zeigen' }).click();
await p.waitForTimeout(5000);
const sAir = await shares(COLOURS);
ok(sAir.ground < 1 && sAir.rough < 2, `aerial image: no drawn ground or rough left (ground ${sAir.ground} %, rough ${sAir.rough} %)`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
