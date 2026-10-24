// QA (Sascha 23.10.2026): the spread – in the stats a cone over all clubs and per club the shots around the target
// line with the 80 % ellipse; on the round the caddie's club as an ellipse around his landing spot with the cone from
// the ball, and a line "Streuung" in the caddie card. Data: the tutorial's example player (five signed rounds).
// Usage: node qa/spread.mjs [url]   (SHOTS=<dir> keeps screenshots)
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const demo = JSON.parse(readFileSync(new URL('../../tutorial/demo-state.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const shot = async (name) => process.env.SHOTS && p.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate((demo) => {
  localStorage.clear();
  sessionStorage.clear();
  for (const [k, v] of Object.entries(demo)) localStorage.setItem(k, v);
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
}, demo);
await p.reload();
await p.waitForTimeout(1500);

// 1 · the stats
await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
await p.waitForTimeout(600);
await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: 'Schläger' }).click();
await p.waitForTimeout(600);
ok((await p.getByRole('heading', { name: 'Deine Streuung' }).count()) === 1, 'stats: "Deine Streuung" with the cone');
const cone = p.getByRole('img', { name: 'Deine Streuung je Schläger' });
ok((await cone.locator('ellipse').count()) >= 3, `the cone: an ellipse per club (${await cone.locator('ellipse').count()})`);
await cone.scrollIntoViewIfNeeded();
await shot('spread-cone');
ok((await p.getByRole('heading', { name: 'Treffer und Streuung je Schläger' }).count()) === 1, 'per club: "Treffer und Streuung je Schläger"');
const dots = p.locator('.spread-chart.dots');
ok((await dots.count()) >= 1 && (await dots.first().locator('circle').count()) >= 1, `per club: the shots as dots (${await dots.count()} clubs)`);
await dots.first().scrollIntoViewIfNeeded();
await shot('spread-dots');
// the tiles of a club never overlap: each row's tiles side by side in its width
const rowOk = await p.evaluate(() =>
  [...document.querySelectorAll('.tee-club-row .insight-row')].every((row) => {
    const r = row.getBoundingClientRect();
    const kids = [...row.children].map((c) => c.getBoundingClientRect());
    return kids.every((k) => k.width >= Math.min(80, r.width / kids.length - 12) && k.right <= r.right + 1);
  }),
);
ok(rowOk, 'per club: the tiles side by side, none squeezed');

// 2 · on the round: the caddie's club and its spread on the map
await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.locator('button.list-item').first().waitFor({ timeout: 30000 });
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
await p.waitForTimeout(3000);
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(1500);
const line = p.locator('.caddie-card .cf').filter({ hasText: 'Streuung' });
ok((await line.count()) === 1, `caddie card: "${(await line.innerText().catch(() => '')).replace(/\s+/g, ' ')}"`);
const feats = await p.evaluate(() => {
  const m = window.__golfosMap;
  const src = m?.getSource('spread');
  return src ? (src._data?.features?.length ?? src.serialize?.().data?.features?.length ?? -1) : -2;
});
ok(feats === 3 || feats === -2, `map: ellipse and the two cone lines (${feats === -2 ? 'map not exposed – picture only' : feats})`);
await shot('spread-card');
// the caddie card closed: the spread stays on the map (its own map tool, on at first)
await p.locator('.caddie-card').getByRole('button', { name: /Schließen|Caddie ausblenden/ }).last().click().catch(() => {});
await p.waitForTimeout(1200);
const tool = p.getByRole('button', { name: 'Streuung ausblenden' });
ok((await tool.count()) === 1 && (await tool.getAttribute('aria-pressed')) === 'true', 'map tool "Streuung" on');
await shot('spread-map');
// any club of the bag, not only the caddie's (Sascha 23.10.2026: "depending on a club or the caddie's advice")
const chip = p.locator('.map-spread-chip');
const before = (await chip.innerText()).replace(/\s+/g, ' ');
ok(/Caddie/.test(before), `the chip names the caddie's club (${before})`);
await chip.click();
await p.waitForTimeout(400);
const sheet = p.getByRole('dialog', { name: 'Streuung welches Schlägers?' });
ok((await sheet.locator('.pick-option').count()) >= 8, `the bag to choose from (${await sheet.locator('.pick-option').count()} rows)`);
await sheet.locator('.pick-option').filter({ hasText: 'Eisen 7' }).click();
await p.waitForTimeout(500);
const after = (await chip.innerText()).replace(/\s+/g, ' ');
ok(/7i/.test(after) && /gewählt/.test(after), `iron 7 chosen: ${after}`);
await shot('spread-7i');
await chip.click();
await p.getByRole('dialog', { name: 'Streuung welches Schlägers?' }).locator('.pick-option').first().click();
await p.waitForTimeout(300);
ok(/Caddie/.test(await chip.innerText()), "back to the caddie's club");
await tool.click();
await p.waitForTimeout(300);
ok((await p.getByRole('button', { name: 'Streuung des Schlägers zeigen' }).count()) === 1, 'the tool switches the spread off');
await p.reload();
await p.waitForTimeout(2500);
ok((await p.evaluate(() => localStorage.getItem('golfos.spread.v1'))) === '0', 'the choice is remembered');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
