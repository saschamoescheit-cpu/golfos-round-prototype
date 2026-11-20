// QA (Sascha 16.11.2026, Legends: "Diese Sidebet sollte auch unter Games sein, finde sie aber nicht" → "Alle in ‚Wetten'";
// "Bei den Sidebets brauchen wir im Nachgang auch die Details je Bet, wer Front, wer Back und wer total gemacht hat. Auch mit
// Verrechnung"): under "Wetten" a block "Side-Bets" – Sascha's 5+5+10 against Daniel (the day's own settlement) and against
// Erik (USA-Wetten), and a Skins of his round; a tap: front, back, 18 with both scores, who won,
// what it is worth, who pays whom, the pool's settlement a tap away; the side game with its standing and payments.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/sidebetlist.mjs [url]
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
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = day(0);
const host = await sim.phone('Sascha');
const S = host.p;
await S.evaluate(
  async ({ today, from, to }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const G = await import('/src/lib/gameforms.ts');
    const at = new Date().toISOString();
    const card = (front, back) => ({ day: today, course: 'Legends', strokes: [...Array(9).fill(front), ...Array(9).fill(back)], received: Array(18).fill(0) });
    const duel = (id, opp) => ({ id, player: 's', opponent: opp, kind: 'nassau', target: 0, stake: 0, payout: 'opponent', attempts: 'day', day: today, parts: { front: 5, back: 5, total: 10 }, scorer: 'by', by: 'Sascha', challenge: { state: 'accepted', at } });
    // Daniel: Sascha 36/36 against 38/35 (as 9 × 4 and 9 × 4 – Daniel 2 more on the front, 1 less on the back)
    const dan = card(4, 4);
    dan.strokes[0] = 5; dan.strokes[1] = 5; dan.strokes[9] = 3;
    await ws.createPool({
      kind: 'wager-pool', id: 'own', name: `5+5+10 · ${today.slice(8, 10)}.${today.slice(5, 7)}.`, from: today, to: today, createdAt: at, currency: 'USD',
      players: [{ id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'd', name: 'Daniel' }],
      wagers: [duel('wd', 'd')], progress: {}, cards: { s: [card(4, 4)], d: [dan] },
    }, 's');
    // Erik: one better on each nine – Sascha loses all three
    await ws.createPool({
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      players: ['Sascha', 'Chris', 'Erik'].map((n) => ({ id: n[0].toLowerCase(), name: n, joined: { name: n, at, uid: n } })),
      wagers: [duel('we', 'e')], progress: {}, cards: { s: [card(4, 4)], e: [{ ...card(4, 4), strokes: [3, ...Array(8).fill(4), 3, ...Array(8).fill(4)] }] },
    }, 's');
    // a Skins of the round (Sascha and Daniel), Sascha one hole better
    const holes = Array.from({ length: 18 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
    const entry = (s) => ({ strokes: s, putts: 2, pickedUp: false, fairway: null, penalties: 0 });
    const round = { id: 'r1', createdAt: `${today}T14:00:00Z`, finishedAt: `${today}T19:00:00Z`, courseId: 'qa', courseName: 'Legends', loopOrder: ['Main'], holes, mode: 'simple', players: [{ id: 'me', name: 'Sascha', playingHandicap: 0, isMe: true }, { id: 'p2', name: 'Daniel', playingHandicap: 0, isMe: false }], entries: { me: holes.map((_, i) => entry(i === 4 ? 3 : 4)), p2: holes.map(() => entry(4)) }, currentHole: 17 };
    localStorage.setItem('golfos.rounds.v1', JSON.stringify([round]));
    const f = G.formDef('skins');
    localStorage.setItem('golfos.sidegames.v1', JSON.stringify([{ id: 'sg1', round: 'r1', form: 'skins', players: [{ id: 'p1', name: 'Sascha', hcp: 0 }, { id: 'p2', name: 'Daniel', hcp: 0 }], settings: { ...Object.fromEntries(f.settings.map((s) => [s.key, s.default])), currency: 'USD' }, createdAt: `${today}T13:00:00Z` }]));
    sessionStorage.setItem('golfos.module', 'games');
  },
  { today, from: day(-2), to: day(5) },
);
await S.goto('about:blank');
await S.goto(url);
await S.waitForTimeout(1500);
await S.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await S.waitForTimeout(800);
const block = S.getByRole('region', { name: 'Side-Bets' });
ok((await block.count()) === 1, 'under "Wetten": the block "Side-Bets"');
const rows = (await block.locator('.side-bet-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(rows.length === 3, `three side bets (${rows.join(' | ')})`);
ok(rows.some((r) => /5\+5\+10 gegen Daniel .*\+10 \$/.test(r)), '5+5+10 against Daniel: +10 $');
ok(rows.some((r) => /5\+5\+10 gegen Erik .*USA-Wetten.*−20 \$/.test(r)), '5+5+10 against Erik in USA-Wetten: −20 $');
ok(rows.some((r) => /Skins · Sascha, Daniel/.test(r)), 'the Skins of the round');
// no "Unterm Strich" over them (Sascha 18.11.2026: "Side-Bet unterm Strich kann raus")
ok(!/Unterm Strich/.test(await block.innerText()), 'no "Unterm Strich" above the side bets');
ok((await S.locator('main .eyebrow').filter({ hasText: /^Pools$/ }).count()) === 1, 'the pools below under "Pools"');
if (process.env.SHOTS) await S.screenshot({ path: `${process.env.SHOTS}/sidebets.png`, fullPage: true });

// the details of the duel against Daniel
await block.locator('.side-bet-row').filter({ hasText: 'gegen Daniel' }).click();
const sheet = S.getByRole('dialog', { name: '5+5+10 gegen Daniel' });
const table = (await sheet.locator('.side-bet-table tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(table[0] === 'Vorne (9) 36 38 Du +5 $', `front: ${table[0]}`);
ok(table[1] === 'Hinten (9) 36 35 Daniel −5 $', `back: ${table[1]}`);
ok(table[2] === 'Gesamt (18) 72 73 Du +10 $', `18: ${table[2]}`);
const settle = (await sheet.locator('.side-bet-settle').innerText()).replace(/\s+/g, ' ');
ok(/Daniel zahlt dir 10 \$/.test(settle) && /Abgerechnet in „5\+5\+10 · /.test(settle), `settlement: ${settle}`);
ok((await sheet.locator('.sheet-head .icon-btn').count()) === 1 && (await sheet.getByRole('button', { name: 'Abrechnung öffnen' }).count()) === 1, 'the pool\'s settlement a tap away');
if (process.env.SHOTS) await S.screenshot({ path: `${process.env.SHOTS}/sidebet-duel.png` });
await sheet.getByRole('button', { name: 'Abrechnung öffnen' }).click();
await S.waitForTimeout(1200);
ok((await S.getByText(/5\+5\+10 · \d\d\.\d\d\./).count()) > 0, 'the own settlement opens');

// the Skins
await S.goto(url);
await S.waitForTimeout(1500);
await S.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await S.waitForTimeout(800);
await S.getByRole('region', { name: 'Side-Bets' }).locator('.side-bet-row').filter({ hasText: 'Skins' }).click();
const sk = S.getByRole('dialog', { name: /^Skins/ });
ok((await sk.locator('.game-standing').count()) === 1, 'the Skins: its standing as in Games');
const pay = (await sk.locator('.side-bet-settle').innerText()).replace(/\s+/g, ' ');
ok(/Verrechnung/i.test(pay) && /(Daniel zahlt Sascha|Keiner zahlt)/.test(pay), `who pays whom: ${pay}`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
