// QA (Sascha 02.11.2026: "it must also be possible that one person – e.g. Chris – enters the score for all players"):
// in the round setup "Score-Erfassung: Einer für alle · Schreiber Chris"; Chris joins on his phone and enters every card in
// full (putts too), Sascha's phone only shows them. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/scorer.mjs [url]
import { webkit } from 'playwright';
import { onOff, flip } from './onoff.mjs';
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
await H.getByRole('button', { name: 'Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Chris');
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
// "Score-Erfassung" – its own section, chosen like the format (Sascha 02.11.2026): the way, then the scorer
ok(/Jeder seinen eigenen/.test(await H.locator('.settings-row').filter({ hasText: 'Wer erfasst' }).innerText()), 'setup: "Jeder seinen eigenen" by default');
await H.locator('.settings-row').filter({ hasText: 'Wer erfasst' }).click();
await H.getByRole('dialog', { name: 'Wer erfasst die Scores' }).locator('.pick-option strong').getByText('Einer für alle', { exact: true }).click();
await H.getByRole('dialog', { name: 'Schreiber wählen' }).locator('.pick-option strong').getByText('Chris', { exact: true }).click();
ok(/Chris/.test(await H.locator('.settings-row').filter({ hasText: 'Schreiber' }).innerText()) && (await H.getByText('Ein Spieler trägt alle Scores ein').count()) === 0, 'setup: "Einer für alle" – Chris chosen, no hint under it (04.11.2026)');
// "Eigene Detailerfassung" (Sascha 07.11.2026: "Chris enters the score for all, Moritz and Sascha still their own"):
// per player, the scorer not offered
const ownRow = H.locator('.settings-row').filter({ hasText: 'Eigene Detailerfassung' });
ok(/Niemand/.test(await ownRow.innerText()), 'setup: "Eigene Detailerfassung · Niemand" to start with');
await ownRow.click();
const ownSheet = H.getByRole('dialog', { name: 'Eigene Detailerfassung' });
ok((await ownSheet.getByRole('checkbox').count()) === 1 && (await ownSheet.getByRole('checkbox', { name: /Chris/ }).count()) === 0, 'its sheet: a switch per player – not for the scorer Chris');
await ownSheet.getByRole('checkbox', { name: /Sascha/ }).click();
await ownSheet.getByRole('button', { name: 'Fertig' }).click();
ok(/Sascha/.test(await ownRow.innerText()), `setup: "Eigene Detailerfassung · Sascha" (${(await ownRow.innerText()).replace(/\s+/g, ' ')})`);
await card.getByRole('button', { name: 'Code erzeugen' }).click({ timeout: 3000 }).catch(() => {}); // made by itself once a partner is in the flight (03.11.2026)
await card.locator('.join-code').waitFor({ timeout: 8000 });
const code = (await card.locator('.join-code').innerText()).trim().replace(/-/g, '');
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
const chrisId = flight().players.find((p) => p.name === 'Chris')?.id;
ok(!!chrisId && flight().scorer === chrisId, `server: the flight's scorer is Chris (${flight().scorer})`);
ok(JSON.stringify(event().format?.ownDetails) === '["sascha"]', `server: Sascha enters his own details (${JSON.stringify(event().format?.ownDetails)})`);

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
// the strokes incl. penalty strokes only – nothing apart (Sascha 02.11.2026)
ok(!rows.some((r) => /^(Putts|Strafschläge)/.test(r)), `Chris enters Sascha's score – the strokes incl. penalty strokes only (${rows.map((r) => r.split('\n')[0]).join(', ')})`);
await block(G, 'Sascha').getByRole('button', { name: /Schläge plus eins/ }).click();
await block(G, 'Chris').getByRole('button', { name: /Schläge plus eins/ }).click();
await block(G, 'Chris').getByRole('button', { name: /Schläge plus eins/ }).click();
await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
await G.waitForTimeout(12000);
const f = flight();
ok(f.scores[chrisId]?.[0]?.s != null && f.scores[Object.keys(f.scores).find((k) => k !== chrisId)]?.[0]?.s != null, `server: both cards from Chris's phone (${JSON.stringify(f.scores).slice(0, 120)})`);

// Sascha: only sees them
await H.locator('.map-score').click();
await H.waitForTimeout(400);
const kept = await H.locator('.score-player.kept-elsewhere').count();
ok(kept === 2 && (await H.locator('.score-player').getByRole('button', { name: /Schläge plus eins/ }).count()) === 0, `Sascha: both cards shown, nothing to change (${kept} kept elsewhere)`);
ok(/Chris erfasst/.test(await H.locator('.score-panel').innerText()), 'Sascha: "Chris erfasst …" on the cards');
// his own analysis beside it (Sascha 02.11.2026): putts on his phone only – the scorer's count stays the score
const mine = H.getByRole('group', { name: 'Meine Analyse' });
ok(await mine.isVisible(), 'Sascha: "Meine Analyse" under his card');
ok((await mine.getByRole('group', { name: 'Strafschläge' }).count()) === 1 && (await mine.getByRole('group', { name: 'Sand Shots' }).count()) === 1, 'Meine Analyse: Putts, Sand and the penalty strokes too (Sascha 13.11.2026)');
await mine.getByRole('button', { name: /Putts plus eins/ }).click();
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(12000);
const sr = await (async () => H.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt)))();
ok(sr.entries.me[0].putts === 2 && sr.entries.me[0].strokes === f.scores.me[0].s, `Sascha's phone: his 2 putts kept, the score Chris's (${sr.entries.me[0].strokes})`);
ok(flight().scores.me[0]?.d?.pu == null, "the flight: nothing of Sascha's analysis");

// his own details on (set in the setup): "→" opens the score entry on the next hole for them – then he switches it
// off on his phone, and "→" goes on as for the others
await H.getByRole('button', { name: 'Nächstes Loch' }).click();
await H.waitForTimeout(800);
await H.getByRole('button', { name: 'Nächstes Loch' }).click().catch(() => {});
await H.waitForTimeout(800);
const openOn2 = await H.locator('.score-panel').count();
const hole2 = (await H.locator('.map-hole-no').innerText()).trim();
ok(openOn2 === 1 && (await H.getByRole('group', { name: 'Meine Analyse' }).count()) === 1, `own details on: on ${hole2} the score entry opens for them`);
const sw = onOff(H, /Eigene Detailerfassung/);
ok((await sw.getAttribute('data-on')) === 'true', 'the switch on his card: on (from the setup)');
await flip(sw);
await H.waitForTimeout(300);
ok((await H.getByRole('group', { name: 'Meine Analyse' }).count()) === 0, 'switched off on his phone: "Meine Analyse" gone');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(400);
await H.getByRole('button', { name: 'Nächstes Loch' }).click();
await H.waitForTimeout(900);
ok((await H.locator('.score-panel').count()) === 0 && (await H.locator('.map-hole-no').innerText()).trim() !== hole2, `off: "→" goes on at once (${(await H.locator('.map-hole-no').innerText()).trim()})`);
ok(await H.evaluate(() => Object.values(JSON.parse(localStorage.getItem('golfos.owndetails.v1') ?? '{}')).includes(false)), 'his choice kept on his phone, for this round');

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
