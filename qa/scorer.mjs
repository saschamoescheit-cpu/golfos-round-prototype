// QA (Sascha 02.11.2026: "it must also be possible that one person – e.g. Chris – enters the score for all players"):
// in the round setup "Wer erfasst die Scores: Einer für alle · Chris"; Chris joins on his phone and enters every card in
// full (putts too), Sascha's phone only shows them. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/scorer.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const { phone, event } = sharedServer(b, url);
const flight = () => Object.values(event().flights)[0];

const host = await phone('Sascha');
const H = host.p;
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Chris');
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
await card.getByRole('button', { name: 'Einer für alle' }).click();
await card.getByRole('group', { name: 'Schreiber' }).getByRole('button', { name: 'Chris' }).click();
ok(/Ein Spieler trägt alle Scores ein/.test(await card.innerText()), 'setup: "Einer für alle" – Chris chosen');
await card.getByRole('button', { name: 'Code erzeugen' }).click();
await card.locator('.join-code').waitFor({ timeout: 8000 });
const code = (await card.locator('.join-code').innerText()).trim();
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
const chrisId = flight().players.find((p) => p.name === 'Chris')?.id;
ok(!!chrisId && flight().scorer === chrisId, `server: the flight's scorer is Chris (${flight().scorer})`);

// Chris by the link, let in by Sascha
const guest = await phone('Chris');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
const ask = H.getByRole('alertdialog', { name: 'Chris möchte beitreten' });
await ask.waitFor({ timeout: 15000 });
await ask.getByRole('button', { name: 'Zulassen' }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
await G.waitForTimeout(6000);

const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
// Chris: steppers for both – no bet counts the round: Sascha's with score and penalty strokes (02.11.2026)
await G.locator('.map-score').click();
await G.waitForTimeout(300);
ok((await G.locator('.score-player.kept-elsewhere').count()) === 0, "Chris: steppers for Sascha's and his own card");
const rows = (await block(G, 'Sascha').locator('.stepper-label').allInnerTexts()).map((x) => x.trim());
ok(!rows.some((r) => r.startsWith('Putts')) && rows.some((r) => r.startsWith('Strafschläge')), `Chris enters Sascha's score with penalty strokes (${rows.map((r) => r.split('\n')[0]).join(', ')})`);
await block(G, 'Sascha').getByRole('button', { name: /Schläge plus eins/ }).click();
await block(G, 'Sascha').getByRole('button', { name: /Strafschläge plus eins/ }).click();
await block(G, 'Chris').getByRole('button', { name: /Schläge plus eins/ }).click();
await block(G, 'Chris').getByRole('button', { name: /Schläge plus eins/ }).click();
await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
await G.waitForTimeout(12000);
const f = flight();
ok(f.scores[chrisId]?.[0]?.s != null && f.scores[Object.keys(f.scores).find((k) => k !== chrisId)]?.[0]?.d?.pe === 1, `server: both cards from Chris's phone, Sascha's with a penalty stroke (${JSON.stringify(f.scores).slice(0, 120)})`);

// Sascha: only sees them
await H.locator('.map-score').click();
await H.waitForTimeout(400);
const kept = await H.locator('.score-player.kept-elsewhere').count();
ok(kept === 2 && (await H.locator('.score-player').getByRole('button', { name: /Schläge plus eins/ }).count()) === 0, `Sascha: both cards shown, nothing to change (${kept} kept elsewhere)`);
ok(/Chris erfasst/.test(await H.locator('.score-panel').innerText()), 'Sascha: "Chris erfasst …" on the cards');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
