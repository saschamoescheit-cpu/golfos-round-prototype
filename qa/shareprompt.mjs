// QA (Sascha 29.10.2026, testing with Cedric beside him: "on to the next hole the score entry does not open by itself
// – fix it"): a social round on two phones. Sascha sets it up with Cedric and makes a code, Cedric joins with the link
// as himself; on both phones "→" on a hole without a score opens the score entry first – as in a round on one phone.
// Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/shareprompt.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const { phone, round } = sharedServer(b, url);

// ---------- Sascha: a social round with Cedric, the code in the setup ----------
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
await H.locator('input[id^="hcp-"]').first().fill('10');
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Cedric');
await H.locator('input[id^="hcp-"]').last().fill('18');
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
await card.getByRole('button', { name: 'Code erzeugen' }).click();
await card.locator('.join-code').waitFor({ timeout: 8000 });
const code = (await card.locator('.join-code').innerText()).trim();

// started before Cedric joins (LATE=1) – or after
const late = !!process.env.LATE;
if (late) {
  await H.getByRole('button', { name: 'Runde starten' }).click();
  await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
  await H.waitForTimeout(6000);
}
// ---------- Cedric joins with the link, as himself ----------
const guest = await phone('Cedric');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
const join = G.getByRole('dialog', { name: 'Runde beitreten' });
await join.getByText('Wer bist du?').waitFor({ timeout: 10000 });
await join.getByRole('button', { name: /^Cedric/ }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
if (!late) {
  await H.getByRole('button', { name: 'Runde starten' }).click();
  await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
}
await H.waitForTimeout(7000); // a few exchanges: both phones in the flight

// ---------- on to hole 2: the score entry opens first, on both phones – his own score and his partner's ----------
// (Sascha, the same evening: "Sascha keeps his own score and, as marker, Cedric's; Cedric his own and Sascha's")
const plusOf = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp('^' + name + '$') }) }).getByRole('button', { name: /Schläge plus eins/ });
for (const [who, other, p, mine, his] of [['Sascha', 'Cedric', H, 1, 2], ['Cedric', 'Sascha', G, 2, 1]]) {
  const r = await round(p);
  const me = r.players.find((x) => x.isMe);
  const partner = r.players.find((x) => !x.isMe);
  ok(me?.name === who && r.shared?.roles?.[me.id] === 'own' && r.shared?.roles?.[partner.id] === 'mark', `${who}: keeps his own score, marks ${other} (roles ${JSON.stringify(r.shared?.roles)})`);
  await p.locator('.hole-bar-arrow[aria-label="Nächstes Loch"]').click();
  await p.waitForTimeout(800);
  ok((await p.locator('.score-panel').count()) === 1 && (await p.locator('.map-hole-no').innerText()).includes('1'), `${who}: "→" on hole 1 without a score – the score entry opens first`);
  ok((await plusOf(p, who).count()) === 1 && (await plusOf(p, other).count()) === 1 && (await p.locator('.kept-elsewhere').count()) === 0, `${who}: steppers for himself and for ${other}`);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/prompt-${who}.png` });
  for (let k = 0; k < mine; k++) await plusOf(p, who).click();
  for (let k = 0; k < his; k++) await plusOf(p, other).click();
  await p.getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(800);
  ok((await p.locator('.map-hole-no').innerText()).includes('2'), `${who}: entered – on hole 2`);
}
// hole 2: Sascha enters only his own – "→" still asks, Cedric's count is missing
await plusOf(H, 'Sascha').waitFor({ timeout: 100 }).catch(() => {});
await H.locator('.hole-bar-arrow[aria-label="Nächstes Loch"]').click();
await H.waitForTimeout(600);
await plusOf(H, 'Sascha').click();
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(400);
await H.locator('.hole-bar-arrow[aria-label="Nächstes Loch"]').click();
await H.waitForTimeout(600);
ok((await H.locator('.score-panel').count()) === 1, 'Sascha: his own score on hole 2, Cedric\'s count missing – "→" asks again');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
// both counts agree on hole 1 (Sascha 4+1 / Cedric 4+2 both ways): the board, no difference
await H.waitForTimeout(12000);
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: /^Leaderboard/ }).click();
await H.waitForTimeout(400);
const board = H.locator('.event-board');
const rows = (await board.locator('.lb-rows li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(rows.length === 2 && /Sascha/.test(rows[0]) && /Cedric/.test(rows[1]) && !/weicht ab/.test(rows.join()), `the live board on Sascha's phone: ${rows.join(' | ')}`);
ok(/Live · alle Handys des Flights/.test(await board.innerText()), 'the board: "Live · alle Handys des Flights"');
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
