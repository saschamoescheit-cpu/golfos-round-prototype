// QA (Sascha 18.10.2026): a tournament round – no wind, no caddie advice, no green slopes (Rule 4.3); the caddie keeps
// only the own notes and the distances to the hazards.
// Usage: node qa/tournament.mjs [url]
import { webkit, devices } from 'playwright';
import { onOff, flip } from './onoff.mjs';
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
// the same round as a tournament: the kind is kept with the round – reopen it
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  rs[0].kind = 'tournament';
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(6000);
ok(await p.locator('.map-hole-no').isVisible(), 'the tournament round is open on its hole');
ok((await p.locator('.map-weather').count()) === 0, 'no wind and weather on the map');
ok((await p.getByRole('button', { name: /Grün-Neigung/ }).count()) === 0, 'no green slope tool');
await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(600);
const card = p.locator('.caddie-card');
const text = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok((await p.locator('.caddie-card.tournament').count()) === 1, `the caddie in tournament mode (${text.slice(0, 80)})`);
ok(!/spielt wie|Gegenwind|Rückenwind|Seitenwind|°C|Fairwayseite|Aus am Ziel/.test(text) && (await card.locator('.cf-row').count()) === 0, 'no advice: no club, no plays like, no wind or temperature');
ok(/Ball ins Spiel bringen/.test(text) && /Aus links und rechts/.test(text), 'the own notes of the hole (1A)');
ok(/Bunker (links|rechts|mittig): \d+ m bis · \d+ m drüber/.test(text), 'the plain distances to the hazards ahead');
ok((await card.getByRole('button', { name: 'Regeln', exact: true }).count()) === 1 && (await card.getByRole('button', { name: 'Lochnotizen' }).count()) === 1, 'rules and hole notes stay');
ok(await card.locator('.caddie-actions button').evaluateAll((bs) => bs.every((b) => b.scrollWidth <= b.clientWidth + 1)), 'the buttons read in full');
if (S) await card.screenshot({ path: S + '/tournament-caddie.png' });

// an internal tournament with "Alle Funktionen" (Sascha 07.11.2026: "we play internal tournaments and want to use
// everything"): the same round – wind, the caddie's advice and the green slopes are back
await p.evaluate(() => {
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1'));
  rs[0].format = { ...(rs[0].format ?? { mode: 'single', scoring: 'net', allowance: 100 }), aids: true };
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
});
await p.reload();
await p.waitForTimeout(6000);
ok((await p.locator('.map-weather').count()) === 1, 'all functions: wind and weather on the map');
ok((await p.getByRole('button', { name: /Grün-Neigung/ }).count()) === 1, 'all functions: the green slope tool');
if (!(await p.locator('.caddie-card').count())) await p.getByRole('button', { name: /Caddie zeigen/ }).click();
await p.waitForTimeout(600);
ok((await p.locator('.caddie-card.tournament').count()) === 0 && (await p.locator('.caddie-card').count()) === 1, 'all functions: the full caddie, not the tournament one');

// the switch in the setup of Rounds: only with "Turnier", off to start with, into the round's format
await p.evaluate(() => {
  localStorage.removeItem('golfos.rounds.v1');
  sessionStorage.setItem('golfos.module', 'rounds');
});
await p.reload();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1500);
await p.fill('#course-search', 'Hetzenhof');
await p.waitForTimeout(2000);
await p.locator('button.list-item').first().click();
await p.getByText('Runde starten').waitFor({ timeout: 30000 });
const aids = onOff(p, /Alle Funktionen/);
ok((await aids.count()) === 0, 'a round with friends: no switch');
await p.locator('.settings-row').filter({ hasText: 'Rundenart' }).click();
await p.locator('.sheet .pick-option').filter({ hasText: /^Turnier/ }).click();
ok((await aids.count()) === 1 && (await aids.getAttribute('data-on')) === 'false', 'Rundenart Turnier: "Alle Funktionen", off (Rule 4.3)');
// a row of the format list (Sascha 08.11.2026: "Alle Funktionen vllt auch in Format integrieren?")
ok((await p.locator('.settings-list').filter({ hasText: 'HCP-Vorgabe' }).locator('.onoff-row').filter({ hasText: 'Alle Funktionen' }).count()) === 1, '"Alle Funktionen" is a row of the settings list (Facelift 11.11.2026, t5: under "Einstellungen")');
await flip(aids);
await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
await p.getByText('Runde starten').click();
await p.waitForTimeout(4000);
const started = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
ok(started.kind === 'tournament' && started.format?.aids === true, `the round started: a tournament with every function (${started.kind}, ${JSON.stringify(started.format)})`);
ok((await p.locator('.map-weather').count()) === 1, 'and on its hole the wind');
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
