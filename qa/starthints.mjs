// QA (Sascha 07.11.2026: "why is the hint at Tournaments grey and not green?"): every hint on the start page's module
// cards is green as the others ("Wetten laufen: …", "Heute: …") – "6 Turniere geplant" too, in the dark look and in the sun mode.
// Usage: node qa/starthints.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  const ev = (name, date) => ({ kind: 'round-event', planned: true, name, date, flights: [] });
  // two tournaments planned after today, none today
  localStorage.setItem('golfos.tours.v1', JSON.stringify([
    { code: 'TOURA1', ev: ev('Orlando Tag 1', '2099-03-01') },
    { code: 'TOURA2', ev: ev('Orlando Tag 2', '2099-03-02') },
  ]));
});
await p.reload();
await p.waitForTimeout(1200);
for (const theme of ['dark', 'sun']) {
  await p.evaluate((t) => (t === 'sun' ? (document.documentElement.dataset.theme = 'sun') : delete document.documentElement.dataset.theme), theme);
  await p.waitForTimeout(200);
  const card = p.locator('.module-card').filter({ hasText: 'Tournaments' });
  const hint = card.locator('.small');
  const text = (await hint.innerText().catch(() => '')).trim();
  const look = await hint.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--brand-text)';
    document.body.appendChild(probe);
    const green = getComputedStyle(probe).color;
    probe.remove();
    return { color: getComputedStyle(el).color, green, weight: getComputedStyle(el).fontWeight };
  });
  ok(text === '2 Turniere geplant', `${theme}: the hint "${text}"`);
  ok(look.color === look.green && Number(look.weight) >= 600, `${theme}: green and bold as the other hints (${look.color} vs ${look.green}, ${look.weight})`);
}
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
