// QA (Sascha 14.11.2026, "Turnier-Preise": "setze es so um"): prizes of a tournament.
// 1. Neues Turnier: "Worum" after the score entry, before the settings – Geld (US-Dollar), entry fee 20 $, "Sieger brutto
//    50 $": the pot "Topf · 1 Spieler × 20 $" and "Preise zusammen 50 $", the warning that the prizes are more than the pot.
// 2. A tournament played yesterday, net with full handicap, 4 players, 20 $ each, Sascha collects, gross winner 50 $, net
//    winner 30 $: before the scores the prizes as a line; the host enters every score – the prizes board: Christopher
//    gross (50 $), the net winner someone else (the gross winner passed over), the chip beside the names; "Wer zahlt
//    wem" through Sascha – Christopher gets 30 $ (50 − 20), the rest pay 20 $ or get 10 $; "Bezahlt" kept on the server.
// 3. Sascha's inbox (his phone's round in the tournament): "30 $ an Christopher zahlen" – gone once marked paid.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/tourprizes.mjs [url]   (SHOTS=dir)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const txt = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

// ---------- 1. the setup ----------
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.reload();
await H.waitForTimeout(1500);
await H.getByRole('button', { name: 'Neues Turnier', exact: true }).click();
await H.waitForTimeout(500);
await H.fill('#tour-name', 'Preis-Cup');
const heads = (await H.locator('main.screen > .setup-part > .eyebrow').allInnerTexts()).map((x) => x.trim().toUpperCase());
const iw = heads.indexOf('WORUM');
ok(iw > heads.indexOf('SONDERWERTUNGEN (OPTIONAL)') && heads.indexOf('SONDERWERTUNGEN (OPTIONAL)') > heads.indexOf('SCORE-ERFASSUNG'), `"Worum" after the special prizes (Sascha 15.11.2026, Variante A) (${heads.join(' · ')})`);
const prizes = H.locator('.tour-prizes');
await prizes.locator('.settings-row').filter({ hasText: 'Worum wird gespielt' }).click();
await H.getByRole('dialog', { name: 'Worum wird gespielt' }).locator('.pick-option').filter({ hasText: /^Geld/ }).first().click();
await H.waitForTimeout(300);
await H.getByRole('dialog').locator('.pick-option').filter({ hasText: 'US-Dollar' }).first().click();
await H.waitForTimeout(300);
ok(/US-Dollar|\$/.test(await txt(prizes.locator('.settings-row').filter({ hasText: 'Worum wird gespielt' }))), `played for: money in dollars (${await txt(prizes.locator('.settings-row').first())})`);
await prizes.locator('.settings-row').filter({ hasText: 'Startgeld je Spieler' }).click();
await H.getByRole('dialog', { name: 'Startgeld je Spieler' }).locator('.pick-option').filter({ hasText: /^20 \$$/ }).first().click();
await H.waitForTimeout(300);
await prizes.locator('.settings-row').filter({ hasText: 'Sieger brutto' }).click();
await H.getByRole('dialog', { name: 'Sieger brutto' }).locator('.pick-option').filter({ hasText: /^50 \$$/ }).first().click();
await H.waitForTimeout(300);
const pots = await prizes.locator('.tour-pot').allInnerTexts();
ok(pots.some((x) => /Topf · 1 Spieler × 20 \$/.test(x.replace(/\s+/g, ' ')) && /20 \$/.test(x)) && pots.some((x) => /Preise zusammen/.test(x) && /50 \$/.test(x)), `the pot and the prizes added up (${pots.map((x) => x.replace(/\s+/g, ' ')).join(' | ')})`);
ok(/30 \$ mehr als im Topf/.test(await txt(prizes)), 'more prizes than in the pot: a warning');
ok((await prizes.locator('.settings-row').filter({ hasText: 'Sieger netto' }).count()) === 1, 'a net tournament: the net places too');
if (shots) await H.screenshot({ path: `${shots}/tourprizes-setup.png`, fullPage: true });

// ---------- 2. a tournament played ----------
const yesterday = await H.evaluate(() => {
  const d = new Date(Date.now() - 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const flights = [
  { teeTime: '11:40', players: [{ name: 'Christopher', playingHandicap: 0 }, { name: 'Erik', playingHandicap: 5 }] },
  { teeTime: '11:48', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Cedric', playingHandicap: 13 }] },
];
const code = await sim.plan(H, { name: 'Orlando Invitational', date: yesterday, flights, format: { mode: 'single', scoring: 'net', allowance: 100 } });
sim.shared.get(code).game.prizes = { prize: { kind: 'money', currency: 'USD' }, fee: 20, collector: 'Sascha', amounts: { gross1: 50, net1: 30 } };
// Sascha's phone has his own round of it (as when he played it) – the inbox knows who he is
await H.evaluate((code) => {
  const at = new Date().toISOString();
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  rs.push({ id: 'r-oi', courseName: 'Hetzenhof', createdAt: at, finishedAt: at, holes: [], players: [{ id: 'me', name: 'Sascha', isMe: true }], entries: { me: [] }, capture: 'full', loopOrder: ['A'], courseId: 'x', kind: 'tournament', shared: { code, flight: 'f2', phone: 'ph', base: {} } });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
}, code);
const openTour = async () => {
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(2500);
  await H.getByRole('button', { name: 'Turniere' }).first().click().catch(() => {});
  await H.waitForTimeout(1200);
  await H.locator('.list-item').filter({ hasText: 'Orlando Invitational' }).first().click();
  await H.waitForTimeout(2500);
};
await openTour();
const board = H.getByRole('region', { name: 'Preise' });
ok(/Preise 80 \$/.test(await txt(board)) && /Startgeld 20 \$ je Spieler, sammelt Sascha/.test(await txt(board)), `before the scores: "${await txt(board)}"`);

// every score by the host: Christopher +1, Erik +4, Sascha +2, Cedric +5
const enter = async (flight, who) => {
  await H.getByRole('region', { name: flight, exact: true }).getByRole('button', { name: 'Scores eintragen' }).click();
  const sheet = H.getByRole('dialog', { name: `Scores von ${flight}` });
  await sheet.waitFor({ timeout: 5000 });
  const holes = await sheet.locator('.tour-score-box input').count();
  const pars = (await sheet.locator('.tour-score-box .muted').allInnerTexts()).map((x) => Number(x.replace(/\D/g, '')));
  for (const [k, [name, over]] of who.entries()) {
    if (k > 0) await sheet.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    for (let i = 0; i < holes; i++) await sheet.locator('.tour-score-box input').nth(i).fill(String(pars[i] + (i < over ? 1 : 0)));
  }
  await H.waitForTimeout(2500);
  await H.getByRole('button', { name: 'Fertig', exact: true }).click();
  await H.waitForTimeout(1500);
};
await enter('Flight 1', [['Christopher', 1], ['Erik', 4]]);
await enter('Flight 2', [['Sascha', 2], ['Cedric', 5]]);
await openTour();
const list = (await board.locator('.tour-prize-list li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(list.some((x) => /Sieger brutto/.test(x) && /Christopher/.test(x) && /50 \$/.test(x)), `gross: Christopher 50 $ (${list.join(' | ')})`);
const netRow = list.find((x) => /Sieger netto/.test(x)) ?? '';
const netWinner = (netRow.match(/· (\w+)/) ?? [])[1];
ok(!!netWinner && netWinner !== 'Christopher' && /30 \$/.test(netRow), `net: ${netWinner} 30 $ – the gross winner passed over`);
const chips = (await H.locator('.tour-live .lb-rows li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(chips.some((x) => /Christopher/.test(x) && /50 \$/.test(x)), `the leaderboard: "50 $" beside Christopher (${chips.join(' | ')})`);
ok(await H.locator('.tour-live .lb-prize').first().evaluate((el) => getComputedStyle(el).color === 'rgb(255, 255, 255)').catch(() => false), 'the chip: white on green');
const pays = (await board.locator('.tour-prize-pays li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(pays.some((x) => /Sascha → Christopher/.test(x) && /30 \$/.test(x) && /Startgeld 20 \$/.test(x)), `Sascha → Christopher 30 $ (50 − 20) (${pays.join(' | ')})`);
ok(pays.some((x) => new RegExp(`Sascha → ${netWinner}`).test(x) && /10 \$/.test(x)), `Sascha → ${netWinner} 10 $ (30 − 20)`);
ok(pays.filter((x) => /→ Sascha/.test(x) && /20 \$/.test(x)).length === 1, 'the one without a prize pays Sascha his 20 $');
if (shots) await H.screenshot({ path: `${shots}/tourprizes-board.png`, fullPage: true });

// 3. the inbox before and after "Bezahlt"
const inboxHas = async (re) => {
  // the start page (the tournament's page has its back arrow, no inbox)
  await H.evaluate(() => sessionStorage.removeItem('golfos.module'));
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(2000);
  await H.locator('.bell-btn').first().click();
  await H.waitForTimeout(600);
  const rows = (await H.getByRole('dialog', { name: 'Inbox' }).locator('.bell-row').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  await H.getByRole('dialog', { name: 'Inbox' }).getByRole('button', { name: 'Schließen' }).click();
  await H.waitForTimeout(300);
  return rows.some((x) => re.test(x));
};
ok(await inboxHas(/30 \$ an Christopher zahlen/), 'Sascha\'s inbox: "30 $ an Christopher zahlen"');
await openTour();
await board.locator('.tour-prize-pays li').filter({ hasText: 'Sascha → Christopher' }).getByRole('button', { name: /als bezahlt markieren/ }).click();
await H.waitForTimeout(2000);
ok(!!sim.shared.get(code).game.prizes?.paid?.['sascha>christopher'], 'marked paid: kept on the server');
ok(/Bezahlt ✓/.test(await txt(board.locator('.tour-prize-pays li').filter({ hasText: 'Sascha → Christopher' }))), 'the row: "Bezahlt ✓"');
ok(!(await inboxHas(/an Christopher zahlen/)), 'paid: gone from the inbox');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
