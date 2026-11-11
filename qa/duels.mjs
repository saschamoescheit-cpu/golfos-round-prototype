// QA (Sascha 09.11.2026, USA): "5+5+10 is always against the flight now, but it is played against one person only –
// Chris against Erik is a bet of its own, so is Chris against Moritz; and across flights: Chris against Sascha in
// another flight. The scores from the own round; the opponent accepts; into the pool's settlement."
// Sascha's pool (Sascha, Chris, Erik, each on his phone). Chris: Games → Neues Spiel → 5+5+10 → against Sascha and Erik
// – two duels, each waiting with a clock; Erik and Sascha hear of it (push). Sascha accepts from Games' start page,
// Erik declines in the pool. Chris and Sascha play their own rounds (no flight together): each phone puts its card in
// the pool – Erik's phone, not in it, shows the duel and the settlement: Chris +10 $ (front +5, back −5, 18 +10).
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/duels.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const sim = sharedServer(b, url);
const { shared, pushes } = sim;
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const host = await sim.phone('Sascha');
const H = host.p;
const code = await H.evaluate(
  async ({ from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      players: ['Sascha', 'Chris', 'Erik'].map((n) => ({ id: n[0].toLowerCase(), name: n, joined: { name: n, at, uid: n } })),
      wagers: [{ id: 'w-s', player: 's', kind: 'birdies', target: 3, stake: 20, payout: 'success', attempts: 'any' }],
      progress: {},
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-2), to: day(5) },
);
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `Sascha's pool: ${code}`);
shared.get(code).members.push('Chris', 'Erik');

const chris = await sim.phone('Chris');
const erik = await sim.phone('Erik');
const C = chris.p;
const E = erik.p;
const toGames = async (P) => {
  await P.evaluate(async () => {
    await (await import('/src/lib/wagerstore.ts')).syncPools();
    sessionStorage.setItem('golfos.module', 'games');
  });
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(1500);
};
const openPool = async (P) => {
  await toGames(P);
  await P.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
  await P.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
  await P.waitForTimeout(1500);
};

// Chris: Games → Neues Spiel → 5+5+10 – the duel's setup, not a game in the flight
await toGames(C);
await C.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
await C.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await C.locator('.sheet .pick-option').filter({ has: C.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
await C.waitForTimeout(400);
const eyebrows = (await C.locator('main .eyebrow').allInnerTexts()).map((t) => t.trim().toUpperCase());
ok(eyebrows.join('|') === 'SPIELFORM|WETTEN|TAG|GEGEN WEN|EINSÄTZE' && (await C.getByRole('button', { name: 'Spiel starten' }).count()) === 0, `5+5+10 with a pool: the duel – ${eyebrows.join(' · ')}, no "Spiel starten"`);
const stakes = (await C.locator('.settings-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').replace(' ›', '').trim());
ok(stakes.includes('Vorne (9) 5 $') && stakes.includes('Hinten (9) 5 $') && stakes.includes('Gesamt (18) 10 $') && stakes.includes('Wertung Brutto') && stakes.includes('Wer erfasst Ich für beide') && stakes.includes('Pool USA-Wetten'), `the stakes 5/5/10 $, gross, the challenger keeps the score, the pool: ${stakes.join(' | ')}`);
// net: with how much of the handicap (Sascha 10.11.2026)
await C.locator('.settings-row').filter({ hasText: /^Wertung/ }).click();
await C.getByRole('dialog', { name: 'Wertung' }).locator('.pick-option').filter({ hasText: /^Netto/ }).first().click();
ok(/Vorgabe 100 %/.test((await C.locator('.settings-row').filter({ hasText: /^Vorgabe/ }).innerText()).replace(/\s+/g, ' ')), 'net: the share of the handicap, 100 % to start');
await C.locator('.settings-row').filter({ hasText: /^Wertung/ }).click();
await C.getByRole('dialog', { name: 'Wertung' }).locator('.pick-option').filter({ hasText: /^Brutto/ }).first().click();
ok((await C.getByRole('button', { name: 'Herausfordern' }).isDisabled()) && /Gegner wählen/.test(await C.locator('.settings-row').filter({ hasText: 'Gegner' }).innerText()), 'no opponent yet: "Gegner wählen" in green, "Herausfordern" not yet');
await C.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
const sheet = C.getByRole('dialog', { name: 'Gegner' });
const offered = (await sheet.locator('.switch-label').allInnerTexts()).map((t) => t.trim().split('\n')[0]);
ok(offered.join(',') === 'Sascha,Erik', `against whom: every other player of the pool – also from other flights (${offered.join(', ')})`);
await sheet.getByRole('switch', { name: /Sascha/ }).click();
await sheet.getByRole('switch', { name: /Erik/ }).click();
await sheet.getByRole('button', { name: 'Fertig' }).click();
if (process.env.SHOTS) await C.screenshot({ path: `${process.env.SHOTS}/duel-setup.png`, fullPage: true });
await C.getByRole('button', { name: '2 herausfordern' }).click();
await C.locator('.duel-challenges').waitFor({ timeout: 15000 });
{
  const ws = shared.get(code).game.wagers.filter((w) => w.kind === 'nassau');
  ok(ws.length === 2 && ws.every((w) => w.player === 'c' && w.challenge?.state === 'open' && w.day === day(0) && w.parts.front === 5 && w.parts.total === 10) && ws.map((w) => w.opponent).sort().join() === 'e,s', `two duels, each on its own, open: Chris against ${ws.map((w) => w.opponent).join(' and ')}`);
  ok(pushes.some((x) => x.action === 'wager-new' && x.code === code && x.wagers?.length === 2), 'the two challenged hear of it (push)');
}
ok((await C.locator('.duel-challenge').filter({ hasText: 'Du forderst Sascha heraus' }).locator('.invite-mark.muted').count()) === 1 && /Wartet auf Sascha/.test(await C.locator('.duel-challenge').filter({ hasText: 'Du forderst Sascha heraus' }).innerText()), "Chris's pool: \"Du forderst Sascha heraus · Wartet auf Sascha\" with a clock");

// Sascha: on Games' start page, "Chris fordert dich zu 5+5+10 heraus" – into the pool, "Annehmen"
await toGames(H);
const invite = H.locator('.duel-invite').filter({ hasText: 'Chris fordert dich zu 5+5+10 heraus' });
ok((await invite.count()) === 1, 'Sascha, Games: "Chris fordert dich zu 5+5+10 heraus"');
await invite.click();
await H.locator('.duel-challenges').waitFor({ timeout: 15000 });
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/duel-answer.png`, fullPage: true });
await H.locator('.duel-challenge').filter({ hasText: 'Chris fordert dich heraus' }).getByRole('button', { name: 'Annehmen' }).click();
await H.waitForTimeout(1500);
ok(shared.get(code).game.wagers.find((w) => w.opponent === 's')?.challenge?.state === 'accepted', 'Sascha accepted');
// Erik declines
await openPool(E);
await E.locator('.duel-challenge').filter({ hasText: 'Chris fordert dich heraus' }).getByRole('button', { name: 'Ablehnen' }).click();
await E.waitForTimeout(1500);
ok(shared.get(code).game.wagers.find((w) => w.opponent === 'e')?.challenge?.state === 'declined', 'Erik declined');

// they play – each his own round, not in one flight: Chris −1 (−2 front, +1 back), Sascha even
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const play = (P, name, scores) =>
  P.evaluate(
    async ({ name, scores, PARS }) => {
      const S = await import('/src/lib/storage.ts');
      const { emptyEntry } = await import('/src/lib/scoring.ts');
      const at = new Date().toISOString();
      S.saveRound({
        id: `r-${name}`, createdAt: at, finishedAt: at, courseId: 'kb', courseName: 'Kissimmee Bay', loopOrder: ['A'], mode: 'simple', currentHole: 17,
        holes: PARS.map((par, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par, strokeIndex: i + 1 })),
        players: [{ id: 'me', name, isMe: true, playingHandicap: 10 }],
        entries: { me: scores.map((s) => ({ ...emptyEntry(), strokes: s })) },
      });
      await (await import('/src/lib/wagerstore.ts')).reportWagers();
    },
    { name, scores, PARS },
  );
await play(C, 'Chris', PARS.map((p, i) => (i < 2 ? p - 1 : i === 12 ? p + 1 : p)));
await play(H, 'Sascha', PARS);
{
  const cards = shared.get(code).game.cards ?? {};
  ok(cards.c?.length === 1 && cards.s?.length === 1 && !cards.e && cards.c[0].strokes.reduce((a, x) => a + x, 0) === 71, `the cards in the pool: Chris 71, Sascha 72 – Erik (declined) none (${Object.keys(cards).join(', ')})`);
}

// Erik's phone, in neither flight nor duel: the standing and the settlement
await openPool(E);
const chrisCard = E.locator('section.pool-player').filter({ has: E.locator('h2', { hasText: /^Chris$/ }) });
const duelRow = chrisCard.locator('.pool-wager').filter({ hasText: /gegen Sascha/ });
const rowText = (await duelRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/\+10 \$/.test(rowText) && /vorne ✓ hinten ✗ gesamt ✓/.test(rowText), `Erik's phone: Chris against Sascha +10 $ – front won, back lost, 18 won (${rowText.slice(0, 140)})`);
ok((await chrisCard.locator('.pool-wager').filter({ hasText: /gegen Erik/ }).count()) === 0, 'the declined duel is not among the bets');
const bal = await E.evaluate(async (c) => {
  const w = await import('/src/lib/wagers.ts');
  const e = JSON.parse(localStorage.getItem('golfos.pools.v1')).find((x) => x.code === c);
  return w.balances(w.withDuels(e.pool), undefined, true);
}, code);
ok(bal.c === 10 && bal.s === -10 && bal.e === 0, `the settlement: Chris +10, Sascha −10, Erik 0 (${JSON.stringify(bal)})`);
const settle = (await E.locator('.pool-settle, section').filter({ hasText: 'Abrechnung' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Sascha zahlt an Chris 10 \$/.test(settle) || /Sascha.{0,20}Chris.{0,10}10 \$/.test(settle), `"Wer zahlt wem": Sascha pays Chris 10 $ (${settle.slice(0, 160)})`);
if (process.env.SHOTS) await E.screenshot({ path: `${process.env.SHOTS}/duel-erik.png`, fullPage: true });

// Chris: the declined one said so, "Entfernen" takes it out
await openPool(C);
const declined = C.locator('.duel-challenge').filter({ hasText: 'Erik hat abgelehnt' });
ok(/abgelehnt/.test(await declined.innerText().catch(() => '')) && (await declined.locator('.invite-mark.bad-text').count()) === 1, 'Chris: "Erik hat abgelehnt" with a red cross');
await declined.getByRole('button', { name: 'Entfernen' }).click();
await C.waitForTimeout(1500);
ok(!shared.get(code).game.wagers.some((w) => w.opponent === 'e' && w.kind === 'nassau'), 'removed from the pool');

// without a pool (Sascha 10.11.2026: "linked friends or players made as in a round"): the duel all the same – a new pool
// of the day; a player made here without a phone (accepted at once, the challenger keeps his score), a linked friend
// invited (open, told)
{
  // Stefan a linked friend of Moritz (his card on the server)
  sim.cards.set('Stefan', { user_id: 'Stefan', code: '318499', first_name: 'Stefan', last_name: '', hcp_index: '12,6', home_club: '', photo: null });
  sim.cards.set('Moritz', { user_id: 'Moritz', code: '318498', first_name: 'Moritz', last_name: '', hcp_index: '0', home_club: '', photo: null });
  sim.links.add('Moritz|Stefan').add('Stefan|Moritz');
  const solo = await sim.phone('Moritz');
  await solo.p.evaluate(() => localStorage.setItem('golfos.friends.v1', JSON.stringify([{ id: 'f1', name: 'Stefan', hcp: '12,6', uid: 'Stefan' }])));
  await toGames(solo.p);
  const M = solo.p;
  await M.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
  await M.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await M.locator('.sheet .pick-option').filter({ has: M.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
  await M.waitForTimeout(400);
  const poolRow = (await M.locator('.settings-row').filter({ hasText: /^Pool/ }).innerText()).replace(/\s+/g, ' ');
  ok((await M.getByRole('button', { name: 'Spiel starten' }).count()) === 0 && /Ohne Wett-Pool/.test(poolRow), `no pool: the duel all the same – "${poolRow}"`);
  await M.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
  const sheet = M.getByRole('dialog', { name: 'Gegner' });
  ok((await sheet.getByRole('switch', { name: /^Stefan/ }).count()) === 1, 'the opponents: the linked friend Stefan offered');
  await sheet.getByRole('switch', { name: /^Stefan/ }).click();
  await sheet.getByRole('textbox', { name: 'Name des Spielers' }).fill('Ben');
  await sheet.getByRole('button', { name: 'Hinzufügen' }).click();
  ok((await sheet.getByRole('switch', { name: /^Ben/ }).getAttribute('aria-checked')) === 'true', 'a player made here: Ben, chosen');
  await sheet.getByRole('button', { name: 'Fertig' }).click();
  ok(/Stefan, Ben|Ben, Stefan/.test(await M.locator('.settings-row').filter({ hasText: 'Gegner' }).innerText()), 'the opponents: Stefan, Ben');
  await M.getByRole('button', { name: '2 herausfordern' }).click();
  await M.waitForTimeout(2500);
  const row = [...shared.values()].find((r) => r.game.kind === 'wager-pool' && r.owner === 'Moritz');
  const g = row?.game;
  const ben = g?.players.find((p) => p.name === 'Ben');
  const stefan = g?.players.find((p) => p.name === 'Stefan');
  const wb = g?.wagers.find((w) => w.opponent === ben?.id);
  const wsf = g?.wagers.find((w) => w.opponent === stefan?.id);
  ok(!!g && /^5\+5\+10 · /.test(g.name) && g.players.length === 3, `a pool of its own for the duels: ${g?.name} · ${g?.players.map((p) => p.name).join(', ')}`);
  ok(wb?.challenge?.state === 'accepted' && wb.scorer === 'by' && !ben?.joined && !ben?.invited, 'Ben without a phone: the duel counts at once, Moritz keeps his score');
  ok(wsf?.challenge?.state === 'open' && stefan?.invited?.uid === 'Stefan', `Stefan invited by his account: the duel open (${JSON.stringify(stefan)} ${wsf?.challenge?.state})`);
  ok(solo.errs.length === 0, `no page errors (Moritz) ${solo.errs.slice(0, 2).join(' | ')}`);
}

// with a pool of bets running – "Ohne Wett-Pool" all the same (Sascha 10.11.2026: "I must be able to play it without a
// pool of bets"): a pool of its own, the trip's pool untouched
{
  const before = shared.get(code).game.wagers.length;
  await toGames(E);
  await E.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
  await E.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await E.locator('.sheet .pick-option').filter({ has: E.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
  await E.waitForTimeout(400);
  await E.locator('.settings-row').filter({ hasText: /^Pool/ }).click();
  const pick = E.getByRole('dialog', { name: 'Welche Wetten' });
  ok((await pick.locator('.pick-option').filter({ hasText: 'USA-Wetten' }).count()) === 1 && (await pick.locator('.pick-option').filter({ hasText: 'Ohne Wett-Pool' }).count()) === 1, 'the pool: "USA-Wetten" or "Ohne Wett-Pool"');
  await pick.locator('.pick-option').filter({ hasText: 'Ohne Wett-Pool' }).click();
  await E.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
  const who = E.getByRole('dialog', { name: 'Gegner' });
  await who.getByRole('textbox', { name: 'Name des Spielers' }).fill('Tom');
  await who.getByRole('button', { name: 'Hinzufügen' }).click();
  await who.getByRole('button', { name: 'Fertig' }).click();
  await E.getByRole('button', { name: 'Herausfordern' }).click();
  await E.waitForTimeout(2500);
  const mine = [...shared.values()].find((r) => r.game.kind === 'wager-pool' && r.owner === 'Erik')?.game;
  ok(!!mine && /^5\+5\+10 · /.test(mine.name) && mine.wagers.length === 1 && mine.players.some((p) => p.name === 'Tom'), `Erik: a pool of its own "${mine?.name}" with Tom`);
  ok(shared.get(code).game.wagers.length === before && !shared.get(code).game.players.some((p) => p.name === 'Tom'), 'USA-Wetten untouched');
}

ok([host, chris, erik].every((x) => x.errs.length === 0), `no page errors ${[host, chris, erik].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
