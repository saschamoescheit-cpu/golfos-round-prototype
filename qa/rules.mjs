// QA (Sascha 18.10.2026): the Rules of Golf in the caddie, as in the R&A app – all 25 rules in their groups with the
// number and the › at the right, every rule with its sections, a search over everything, the official text linked.
// Usage: node qa/rules.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const S = process.env.SHOTS;
await p.goto(url);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('golfos.intro.v1', '1'); localStorage.setItem('golfos.tip.shots.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds'); });
await p.reload();
await p.waitForTimeout(800);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(5000);
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(600);
// the caddie's facts (Sascha 18.10.2026: "out of bounds, the coming hazards, temperature and wind"): what changes the
// length with its metres, the boundary near the target, the hazards ahead to reach / to carry
{
  const facts = (await p.locator('.caddie-facts').innerText().catch(() => '')).replace(/\s+/g, ' ');
  // the weather comes from the internet (Open-Meteo): without it there is no wind row – then the card must not pretend one
  const weather = (await p.locator('.map-weather').count()) > 0;
  ok(weather ? /°C [+−±]\d+ m/.test(facts) && /(Gegenwind|Rückenwind|windstill)/.test(facts) : !/°C/.test(facts), `caddie: wind and temperature with their metres when the weather is there (${weather ? 'weather' : 'no weather'}: ${facts.slice(0, 60)})`);
  ok(/Bunker (links|rechts|mittig): \d+ m bis · \d+ m drüber/.test(facts), 'caddie: the hazards ahead – to reach and to carry');
  ok(/Aus am Ziel: (links|rechts) \d+ m/.test(facts), 'caddie: out of bounds near the target (1A: left)');
}
await p.getByRole('button', { name: 'Regeln', exact: true }).click();
await p.waitForTimeout(500);
const book = p.locator('.rules-book');
ok(await book.isVisible(), 'the caddie\'s "Regeln" open the Rules of Golf');
const groups = await book.locator('.rules-group .eyebrow').allInnerTexts();
const rows = await book.locator('.rules-group .list-item').count();
ok(rows === 27 && groups.length === 12, `25 rules in 10 groups, the local rules and the definitions (${rows} · ${groups.length})`);
const first = (await book.locator('.rules-group .list-item').first().innerText()).replace(/\s+/g, ' ');
ok(/^1 Das Spiel, Verhalten der Spieler und die Regeln ›/.test(first), `rows as in the R&A app: number, title, › (${first})`);
if (S) await p.screenshot({ path: S + '/rules-list.png' });
// the search
await book.getByRole('searchbox', { name: 'Regeln durchsuchen' }).fill('unspielbar bunker');
await p.waitForTimeout(300);
const hits = await book.locator('.rules-hits .list-item').allInnerTexts();
ok(hits.length > 0 && /^19\.3/.test(hits[0].trim()), `search "unspielbar bunker": first hit 19.3 (${hits.slice(0, 3).map((h) => h.split('\n')[0]).join(' | ')})`);
for (const [q, id] of [['Cartweg', '16.1'], ['zweiter Ball', '18.3'], ['gelbe Pfähle', '17.1'], ['Schläger kaputt', '4.1']]) {
  await book.getByRole('searchbox', { name: 'Regeln durchsuchen' }).fill(q);
  await p.waitForTimeout(250);
  const first = (await book.locator('.rules-hits .list-item').first().innerText()).trim();
  ok(first.startsWith(id), `search in players' words: "${q}" → ${id} (${first.split('\n')[0]})`);
}
await book.getByRole('searchbox', { name: 'Regeln durchsuchen' }).fill('unspielbar bunker');
await p.waitForTimeout(300);
await book.locator('.rules-hits .list-item').first().click();
await p.waitForTimeout(500);
ok((await p.locator('.rule-section.hit').count()) === 1 && /19\.3/.test(await p.locator('.rule-section.hit').innerText()), 'the hit opens the rule at its section, marked');
if (S) await p.screenshot({ path: S + '/rules-19.png' });
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.waitForTimeout(300);
await book.getByRole('searchbox', { name: 'Regeln durchsuchen' }).fill('');
await book.getByRole('button', { name: 'Droppen', exact: true }).click();
await p.waitForTimeout(300);
ok(/14\.3/.test(await book.locator('.rules-hits').innerText()), 'quick topic "Droppen" finds 14.3');
await book.getByRole('searchbox', { name: 'Regeln durchsuchen' }).fill('');
await p.waitForTimeout(200);
await book.locator('.rules-group .list-item').filter({ hasText: 'Verfahren für den Ball' }).click();
await p.waitForTimeout(400);
ok((await p.locator('.rule-section').count()) === 7, 'Rule 14 with its seven sections');
ok((await p.locator('.rule-penalty').count()) >= 1, 'penalties named');
ok(/aus Kniehöhe/.test(await p.locator('.rules-book').innerText()) && /längsten Schläger/.test(await p.locator('.rules-book').innerText()), 'the details behind the points: 14.3 dropping in full');
ok((await p.locator('.rules-book a[href^="http"]').count()) === 0, 'no link to another website – everything in the app');
// every rule with its own sketch (Sascha 18.10.2026: "the pictures too – rebuilt")
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.waitForTimeout(300);
let withSketch = 0;
for (let k = 0; k < 26; k++) {
  await book.locator('.rules-group .list-item').nth(k).click();
  await p.waitForTimeout(150);
  if ((await p.locator('.rules-book svg.rule-sketch').count()) >= 1) withSketch++;
  await p.getByRole('button', { name: 'Zurück' }).first().click();
  await p.waitForTimeout(100);
}
ok(withSketch === 26, `every rule has its sketch (${withSketch}/26)`);
await book.locator('.rules-group .list-item').filter({ hasText: 'Penalty Areas' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.rules-book svg.rule-sketch').count()) >= 2, 'Rule 17: red and yellow penalty area drawn');
if (S) await p.screenshot({ path: S + '/rules-17.png', fullPage: true });
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.waitForTimeout(200);
await book.locator('.rules-group .list-item').filter({ hasText: 'Platzregeln' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.rules-book svg.rule-sketch').count()) >= 4, `local rules: E-5, preferred lies and the dropping zone drawn (${await p.locator('.rules-book svg.rule-sketch').count()})`);
if (S) await p.screenshot({ path: S + '/rules-local.png', fullPage: true });
await p.getByRole('button', { name: 'Zurück' }).first().click();
await p.waitForTimeout(200);
await book.locator('.rules-group .list-item').filter({ hasText: 'Begriffe' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.rule-section').count()) >= 70, `the definitions A–Z (${await p.locator('.rule-section').count()})`);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
