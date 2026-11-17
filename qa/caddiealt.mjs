// QA (Sascha 16.11.2026: "Hat die Höhe des Standorts des Golfplatzes Einfluss auf die Länge des Ballflugs? … je 300
// Höhenmeter 2 % länger?" → "Ja, einbauen"): Profil → Caddie: "Höhe deiner Weiten" – Automatisch (the home course from
// the profile) or a height; on Hetzenhof (about 400 m) with distances from sea level the caddie's facts say the height
// and that it plays shorter; with Hetzenhof as home course ("Automatisch") nothing.
// Usage: node qa/caddiealt.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
// the heights service: Hetzenhof's own height (about 445 m, as its terrain model) – the mock's gentle slope is 300 m
await ctx.route(/api\.open-meteo\.com\/v1\/elevation/, (r) => {
  const u = new URL(r.request().url());
  const n = (u.searchParams.get('latitude') ?? '').split(',').length;
  return r.fulfill({ json: { elevation: Array(n).fill(445) } });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const fresh = async (homeClub) => {
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate((club) => {
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '7', homeClub: club }));
    sessionStorage.setItem('golfos.module', 'rounds');
  }, homeClub);
  await p.reload();
  await p.waitForTimeout(1200);
};

// the setting in the profile: "Höhe deiner Weiten", Automatisch with the home course – then 0 m
await fresh('Hetzenhof');
await p.locator('.tabbar button').filter({ hasText: 'Profil' }).click();
await p.waitForTimeout(600);
const row = p.locator('.settings-row').filter({ hasText: 'Höhe deiner Weiten' });
await row.scrollIntoViewIfNeeded();
ok((await row.count()) === 1 && /Automatisch/.test(await row.innerText()), `Profil → Caddie: "Höhe deiner Weiten · Automatisch" (${(await row.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
await row.click();
const sheet = p.getByRole('dialog', { name: /Wo deine Weiten entstanden sind|Höhe deiner Weiten/ });
const opts = (await sheet.locator('.pick-option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(/Automatisch Dein Heimatplatz .*Hetzenhof/.test(opts[0] ?? '') && opts.some((t) => /^0 m – Meereshöhe/.test(t)) && opts.some((t) => /^1500 m/.test(t)), `the choices: Automatisch (Hetzenhof), 0 m … 2000 m (${opts.slice(0, 3).join(' | ')} …)`);
await sheet.locator('.pick-option').filter({ hasText: /^0 m – Meereshöhe/ }).click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.caddie.v1') ?? '{}').homeAlt)) === 0, 'kept: 0 m');

// a round on Hetzenhof: plays shorter than at sea level
const caddieFacts = async () => {
  await p.locator('.tabbar button').filter({ hasText: /Spielen|Runde/ }).first().click().catch(() => {});
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.getByText('Runde starten').waitFor({ timeout: 30000 });
  await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
  await p.getByText('Runde starten').click();
  await p.locator('.map-hole-no').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(4000);
  await p.getByRole('button', { name: /Caddie zeigen/ }).click();
  await p.waitForTimeout(1500);
  const more = p.locator('.caddie-card').getByRole('button', { name: /Mehr|Details|Warum/ });
  if (await more.count()) await more.first().click().catch(() => {});
  await p.waitForTimeout(500);
  return (await p.locator('.caddie-card').innerText().catch(() => '')).replace(/\s+/g, ' ');
};
let card = await caddieFacts();
const m = /Höhe (\d+) m · deine 0 m −(\d+) m/.exec(card);
ok(!!m && Number(m[1]) > 250 && Number(m[2]) >= 1, `distances from sea level: on Hetzenhof the caddie says the height, plays shorter (${m ? m[0] : card.slice(0, 160)})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/caddie-alt.png` });

// "Automatisch" with Hetzenhof as home: the same height – nothing
await fresh('Hetzenhof');
card = await caddieFacts();
ok(!/Höhe \d+ m · deine/.test(card), 'home course Hetzenhof, "Automatisch": no height line on Hetzenhof');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
