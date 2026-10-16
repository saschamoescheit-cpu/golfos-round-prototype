// Usability check (night 16./17.10.2026): every button and link on the main screens must be big enough for a thumb
// on the course – at least 40 × 40 px (Apple asks 44). Lists the ones that are too small, per screen.
// Usage: node qa/tapsize.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((exp) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7', homeClub: 'Golfclub Hetzenhof' }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ ...exp.round, signedAt: '2026-10-16T20:00:00Z' }]));
}, exp);
const small = async (where) => {
  const list = await p.evaluate(() =>
    [...document.querySelectorAll('button, a, [role="button"], select, input[type="checkbox"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !el.closest('.maplibregl-ctrl') && (r.height < 40 || r.width < 40);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.width)}×${Math.round(r.height)} ${(el.getAttribute('aria-label') || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 40)} [${String(el.className).split(' ')[0]}]`;
      }),
  );
  console.log(`\n${where}: ${list.length} too small`);
  for (const x of [...new Set(list)]) console.log('  ' + x);
};
const toModule = async (m) => {
  await p.evaluate((m) => sessionStorage.setItem('golfos.module', m), m);
  await p.reload();
  await p.waitForTimeout(1500);
};
await toModule('rounds');
for (let k = 0; k < 5; k++) {
  await p.locator('.tabbar button').nth(k).click();
  await p.waitForTimeout(800);
  await small(`rounds tab ${k + 1}`);
}
await p.locator('.tabbar button').nth(1).click();
await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
await p.waitForTimeout(1000);
await small('scorecard');
await p.getByRole('button', { name: /Schläge prüfen/ }).click();
await p.waitForTimeout(2500);
await small('round check');
await toModule('rounds');
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(1500);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await small('round setup');
await p.getByRole('button', { name: 'Platzvorschau' }).click();
await p.waitForTimeout(6000);
await small('hole screen');
await toModule('games');
await small('games start');
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.waitForTimeout(600);
await small('games setup');
await b.close();
