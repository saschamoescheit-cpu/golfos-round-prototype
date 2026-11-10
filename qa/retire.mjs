// QA (Sascha 12.11.2026, on the course: "a player had to stop after 8 holes – we need a way in the score entry"): the
// player's name tapped in the score entry opens his sheet – "Aufgeben"; from there on his block has no score, the
// flight knows it (leaderboard "Aufg. nach 1", his card signable up to there), "Spielt weiter" takes it back.
// Sascha keeps the score of both ("Einer für alle · Schreiber Sascha"), Chris has no phone. Supabase is simulated
// (qa/sharesim.mjs), the app is real. Usage: node qa/retire.mjs [url]
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
await H.locator('.settings-row').filter({ hasText: 'Wer erfasst' }).click();
await H.getByRole('dialog', { name: 'Wer erfasst die Scores' }).locator('.pick-option strong').getByText('Einer für alle', { exact: true }).click();
await H.getByRole('dialog', { name: 'Schreiber wählen' }).locator('.pick-option strong').getByText('Sascha', { exact: true }).click();
await card.getByRole('button', { name: 'Code erzeugen' }).click({ timeout: 3000 }).catch(() => {});
await card.locator('.join-code').waitFor({ timeout: 8000 });
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
await H.waitForTimeout(3000);
const chrisId = flight().players.find((p) => p.name === 'Chris')?.id;
ok(!!chrisId, `server: the flight with Chris (${chrisId})`);

const block = (name) => H.locator('.score-player').filter({ has: H.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
// hole 1: both scored
await H.locator('.map-score').click();
await H.waitForTimeout(300);
await block('Sascha').getByRole('button', { name: /Schläge plus eins/ }).click();
await block('Chris').getByRole('button', { name: /Schläge plus eins/ }).click();
// Chris's name: his sheet – "Gibt nach diesem Loch auf" (hole 1 has his score)
await H.getByRole('button', { name: 'Chris – aufgeben' }).click();
const sheet = H.getByRole('dialog', { name: 'Chris' });
ok(/nach diesem Loch auf/.test(await sheet.innerText()) && /Stableford zählt/.test(await sheet.innerText()), 'Chris tapped: his sheet – gives up after this hole, what follows');
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/retire-sheet.png` });
await sheet.getByRole('button', { name: 'Chris gibt auf' }).click();
ok((await H.getByRole('dialog', { name: 'Chris' }).count()) === 0, 'the sheet closes');
ok((await block('Chris').getByRole('button', { name: /Schläge plus eins/ }).count()) === 1, 'on hole 1 his score stays to enter');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(8000);
ok(flight().retired?.[chrisId] === 1, `server: Chris gave up from hole 2 on (${JSON.stringify(flight().retired)})`);
ok(H.evaluate !== undefined && (await H.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt)?.retired)) != null, 'the round on the phone keeps it');

// hole 2: Chris without a score – "aufgegeben nach 1 Loch", "Spielt weiter"
await H.getByRole('button', { name: 'Nächstes Loch' }).click();
await H.waitForTimeout(800);
if (!(await H.locator('.score-panel').count())) await H.locator('.map-score').click();
await H.waitForTimeout(400);
const gone = H.locator('.score-player.retired');
ok((await gone.count()) === 1 && /Chris/.test(await gone.innerText()) && /aufgegeben nach 1 Loch/.test(await gone.innerText()) && (await gone.getByRole('button', { name: /Schläge plus eins/ }).count()) === 0, `hole 2: Chris "aufgegeben nach 1 Loch", no score to enter (${(await gone.innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/retire-hole2.png` });
// the round's leaderboard: "Aufg. nach 1"
const lb = await H.evaluate(async () => {
  const s = await import('/src/lib/sharedround.ts');
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => !x.finishedAt);
  const ev = s.cachedEvent(r.shared.code);
  return ev ? s.eventStandings(ev).rows.map((x) => ({ name: x.name, retired: !!x.retired, thru: x.thru, finished: x.finished })) : null;
});
ok(!!lb && lb.some((x) => x.name === 'Chris' && x.retired && x.thru === 1 && x.finished), `the standings: Chris gave up after 1, done (${JSON.stringify(lb)})`);
// he plays on after all
await gone.getByRole('button', { name: 'Spielt weiter' }).click();
await H.waitForTimeout(400);
ok((await H.locator('.score-player.retired').count()) === 0 && (await block('Chris').getByRole('button', { name: /Schläge plus eins/ }).count()) === 1, '"Spielt weiter": his score to enter again');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(8000);
ok(flight().retired?.[chrisId] == null, `server: taken back (${JSON.stringify(flight().retired)})`);

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
