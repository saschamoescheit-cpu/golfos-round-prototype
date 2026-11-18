// QA (Sascha 18.11.2026: "Wenn alle Beträge eines Wettpools erhalten sind, dann kann gegen deine Mitspieler und offene
// Beträge hier verschwinden. Die Informationen gegen deine Mitspieler sollte … im Wettpool auch über Abrechnung stehen"):
// two confirmed games – Cedric's (Sascha −5 €) open, Erik's (+2 €) received in full and confirmed. Bilanz: "Gegen deine
// Mitspieler" lists Cedric only, "Offene Beträge" too; the tiles still count both. Then "Erhalten"/"Bezahlt" … the pool's
// own block: a pool with a decided bet – under "Abrechnung" the block "Gegen deine Mitspieler" with each player.
// Usage: node qa/settledgone.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const txt = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');

const holes = Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), par: 4, si: i + 1 }));
const game = (id, day, other, mine, his, stake, payments) => ({
  id,
  createdAt: `${day}T10:00:00Z`,
  finishedAt: `${day}T14:00:00Z`,
  signedAt: `${day}T14:05:00Z`,
  courseName: 'Hetzenhof',
  holes,
  players: [
    { id: 'p0', name: 'Sascha', hcp: 0 },
    { id: 'p1', name: other, hcp: 0 },
  ],
  form: 'skins',
  settings: { allowance: '100', carry: false, stake, entry: 'strokes' },
  scores: { p0: mine, p1: his },
  extra: holes.map(() => ({})),
  current: 8,
  ...(payments ? { payments } : {}),
});
const games = [
  game('g1', '2026-11-01', 'Cedric', [5, 5, 5, 5, 5, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], 1), // Cedric 5 skins: −5 €, open
  game('g3', '2026-11-03', 'Erik', [3, 3, 4, 4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], 1, [
    { id: 'pay1', from: 'p1', to: 'p0', amount: 2, paidAt: '2026-11-03T15:00:00Z', receivedAt: '2026-11-03T15:05:00Z' },
  ]), // Sascha 2 skins: +2 €, received
];

await p.goto(url);
await p.waitForTimeout(1200);
await p.evaluate((gs) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.games.v1', JSON.stringify(gs));
  sessionStorage.setItem('golfos.module', 'games');
}, games);
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(1000);

const against = p.locator('section.card').filter({ has: p.locator('.eyebrow', { hasText: /^Gegen deine Mitspieler$/i }) });
const rows = (await against.locator('.balance-people li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(rows.length === 1 && /^Cedric/.test(rows[0]), `"Gegen deine Mitspieler": Cedric only – Erik's game is paid and confirmed (${rows.join(' | ')})`);
const open = await txt(p.locator('.balance-open'));
ok(/Cedric/.test(open) && !/Erik/.test(open), `"Offene Beträge": Cedric, not Erik (${open})`);

// Cedric paid and confirmed too: the block is gone
await p.evaluate(() => {
  const gs = JSON.parse(localStorage.getItem('golfos.games.v1'));
  gs[0].payments = [{ id: 'pay2', from: 'p0', to: 'p1', amount: 5, paidAt: '2026-11-04T10:00:00Z', receivedAt: '2026-11-04T10:05:00Z' }];
  localStorage.setItem('golfos.games.v1', JSON.stringify(gs));
});
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(1000);
ok((await against.count()) === 0, 'everything paid and confirmed: no "Gegen deine Mitspieler"');
ok((await p.locator('.balance-open').count()) === 0, 'and no "Offene Beträge"');
ok(/Gewinn/.test(await txt(p.locator('main'))), 'the tiles still there');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
