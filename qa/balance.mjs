// QA (Sascha 03.11.2026): the balance with its details and the payments – "at two games I want to see which games and how
// the −35 € add up; mark that I paid Cedric (he gets told and confirms); an overview of what I am still owed, and
// booking it out when someone gave me the money". Three confirmed games with Cedric on this phone: two lost (−5 €,
// −30 €), one won (+2 €). The Bilanz: "Offene Beträge" – Sascha owes Cedric; Cedric tapped: the games, "Zusammen";
// "Bezahlt" – nothing open, "Cedric bestätigt noch"; ↺ – open again. Erik owes Sascha: "Erhalten" books it out.
// Usage: node qa/balance.mjs [url]
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

const holes = Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), par: 4, si: i + 1 }));
const game = (id, day, other, mine, his, stake) => ({
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
});
const games = [
  game('g1', '2026-11-01', 'Cedric', [5, 5, 5, 5, 5, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], 1), // Cedric 5 skins: −5 €
  game('g2', '2026-11-02', 'Cedric', [5, 5, 5, 5, 5, 5, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], 5), // Cedric 6 skins × 5: −30 €
  game('g3', '2026-11-03', 'Erik', [3, 3, 4, 4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4, 4, 4, 4], 1), // Sascha 2 skins: +2 €
  { ...game('g4', '2026-11-03', 'Erik', [4, 4, 4, 4, 4, 4, 4, 4, 4], [5, 4, 4, 4, 4, 4, 4, 4, 4], 1), signedAt: null }, // finished, not confirmed
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
await p.waitForTimeout(1200);
await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await p.waitForTimeout(800);
const open = p.getByRole('region', { name: 'Offene Beträge' });
const oweRows = open.getByRole('list', { name: 'Du schuldest' }).locator('li');
const owedRows = open.getByRole('list', { name: 'Dir geschuldet' }).locator('li');
const txt = async (l) => (await l.innerText()).replace(/\s+/g, ' ').trim();
ok((await oweRows.count()) === 1 && /Cedric 35 € Bezahlt/.test(await txt(oweRows.first())), `open: Sascha owes Cedric 35 € (${await txt(open)})`);
ok((await owedRows.count()) === 1 && /Erik 2 € Erhalten/.test(await txt(owedRows.first())), 'open: Erik owes Sascha 2 €');
ok(/Cedric · 2 Spiele/.test(await txt(p.locator('.balance-people'))), 'against the friends: Cedric, 2 games');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/balance.png', fullPage: true });

// Cedric tapped: how the −35 € add up
await p.getByRole('button', { name: 'Cedric – die Details' }).click();
const sheet = p.getByRole('dialog', { name: 'Cedric' });
const items = (await sheet.getByRole('list', { name: 'Spiele und Wetten' }).locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(items.length === 2 && items.some((t) => /01\.11\. · Skins · Hetzenhof.*−5 €/.test(t)) && items.some((t) => /02\.11\. · Skins · Hetzenhof.*−30 €/.test(t)), `Cedric: the two games with their amounts (${items.join(' | ')})`);
ok(/Zusammen −35 €/.test(await txt(sheet.locator('.balance-sum'))), 'Cedric: together −35 €');
if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + '/balance-person.png' });
await sheet.getByRole('button', { name: /^Bezahlt – 35 €/ }).click();
await p.waitForTimeout(500);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1')).map((g) => ({ id: g.id, payments: g.payments ?? [] })));
const paidSum = stored.filter((g) => g.id !== 'g3').flatMap((g) => g.payments).reduce((s, x) => s + (x.from === 'p0' && x.paidAt && !x.receivedAt ? x.amount : 0), 0);
ok(paidSum === 35, `paid: payments from Sascha to Cedric in both games, 35 € (${JSON.stringify(stored)})`);
ok((await sheet.getByText('Cedric bestätigt noch').count()) === 2 && (await sheet.getByRole('button', { name: /^Bezahlt – / }).count()) === 0, 'paid: Cedric still confirms, nothing left to pay');
ok((await oweRows.count()) === 0, 'paid: "Du schuldest" empty');
// taken back: open again
await sheet.getByRole('button', { name: 'Zurücknehmen' }).first().click();
await p.waitForTimeout(400);
ok((await sheet.getByRole('button', { name: /^Bezahlt – 5 €|^Bezahlt – 30 €/ }).count()) === 1, 'one payment taken back: its amount open again');
await sheet.getByRole('button', { name: 'Schließen' }).click();

// Erik gave me the money: booked out
await owedRows.first().getByRole('button', { name: 'Von Erik erhalten' }).click();
await p.waitForTimeout(500);
const g3 = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1')).find((g) => g.id === 'g3'));
ok(g3.payments?.length === 1 && g3.payments[0].from === 'p1' && g3.payments[0].amount === 2 && !!g3.payments[0].receivedAt, 'received: Erik\'s 2 € booked out');
ok((await owedRows.count()) === 0, 'received: "Dir geschuldet" empty');
// the notice of a game not confirmed tapped (Sascha 03.11.2026: "nothing happens"): that game opens to confirm
await p.locator('.balance-notice').click();
await p.waitForTimeout(600);
ok((await p.getByText('Ergebnis bestätigen').count()) >= 1, 'the notice tapped: the game to confirm opens');
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} FAILED` : 'all passed');
process.exit(bad ? 1 : 0);
