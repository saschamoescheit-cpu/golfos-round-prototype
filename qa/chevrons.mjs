// QA (Sascha 17.10.2026): the small "›" of a button stands at its right end everywhere, as on the start page.
// Visits the main screens of Rounds and Games and checks every visible "›" in a button or row.
// Usage: node qa/chevrons.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/localhost:\d+\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const check = async (where) => {
  await p.waitForTimeout(600);
  const bad = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('span, i')) {
      if (el.children.length || el.textContent.trim() !== '›') continue;
      const host = el.closest('button, a, .list-item, .settings-row');
      if (!host) continue;
      const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(); // the glyph, not its box
      const h = host.getBoundingClientRect();
      if (!r.width || !h.width) continue;
      if (h.right - r.right > 28) out.push(`${(host.textContent || '').trim().slice(0, 30)} (${Math.round(h.right - r.right)} px from the right)`);
    }
    return out;
  });
  ok(bad.length === 0, `${where}: every › at the right end${bad.length ? ' – ' + bad.join(' | ') : ''}`);
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7,0', homeClub: 'Golfclub Hetzenhof' }));
});
await p.reload();
await check('start page');
await p.locator('.module-card, button').filter({ hasText: 'Rounds' }).first().click();
await check('Rounds: play');
for (const t of ['Runden', 'Mein Golf', 'Statistik', 'Profil']) {
  await p.locator('.tabbar button').filter({ hasText: t }).click();
  await check(`Rounds: ${t}`);
}
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.reload();
await check('Games: play');
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await check('Games: setup');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
