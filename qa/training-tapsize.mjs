// Usability check like qa/tapsize.mjs (Rounds), for Training: every button and link must be big enough for a thumb –
// at least 44 × 44 px (Rounds 17.10.2026). Lists the ones that are too small, per screen. Usage: node qa/training-tapsize.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7', homeClub: 'Golfclub Hetzenhof' }));
});
await p.reload();
await p.waitForTimeout(800);
let total = 0;
const small = async (where) => {
  const list = await p.evaluate(() =>
    [...document.querySelectorAll('button, a, [role="button"], select, input[type="checkbox"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && (r.height < 44 || r.width < 44);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.width)}×${Math.round(r.height)} ${(el.getAttribute('aria-label') || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 40)} [${String(el.className).split(' ')[0]}]`;
      }),
  );
  const uniq = [...new Set(list)];
  total += uniq.length;
  console.log(`\n${where}: ${uniq.length} too small`);
  for (const x of uniq) console.log('  ' + x);
};
const menu = async (label) => {
  await p.locator('.tabbar button').filter({ hasText: label }).first().click();
  await p.waitForTimeout(600);
};
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.locator('.tr-cat').first().waitFor({ timeout: 30000 });
await small('Wissen');
for (const tab of ['Üben', 'Verlauf', 'Shop', 'Profil']) {
  await menu(tab);
  await small(tab);
}
await menu('Wissen');
await p.locator('.tr-cat').first().click();
await p.waitForTimeout(400);
await small('Thema (Putten)');
await p.locator('.tr-drill-row .list-item').first().click();
await p.waitForTimeout(400);
await small('Übung');
await p.locator('.tr-actions .btn-secondary').first().click();
await p.waitForTimeout(600);
await small('Eigene Einheit');
await p.getByRole('button', { name: /Speichern & starten/ }).click();
await p.waitForTimeout(1500);
await small('Einheit läuft');
console.log(`\ntotal: ${total}`);
await b.close();
