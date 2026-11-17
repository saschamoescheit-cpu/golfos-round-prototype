// QA (Sascha 16.11.2026, Legends: "In der Bilanz ist nicht richtig erkennbar, wofür Cedric mir die 40 $ schuldet … 20 $ für
// die gestrige Runde und 20 $ für die heutige" → Mockup B: "nach Runden, aber zusätzlich die Info, was bereits bezahlt ist
// und was nicht. Wenn jemand bezahlt klickt, muss der andere eine Inbox-Nachricht bekommen, um den Erhalt zu bestätigen.
// Erst dann darf in der Bilanz abgebucht werden"). Sascha's bet "2 Birdies" made yesterday and today, 20 $ from each;
// Erik's own made today. Cedric paid 20 $ and Sascha confirmed; Erik marked 20 $ paid, not confirmed yet.
// Bilanz → Cedric: "zahlt dir noch 20 $", yesterday's round paid, today's open; Erik: still 20 $ open – his payment waits
// for the confirmation, in the inbox too; confirmed there, it is off.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/balancewhy.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const sim = sharedServer(b, url);
const phone = await sim.phone('Sascha');
const p = phone.p;
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const day = (d) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const at = new Date().toISOString();
const bet = (id, player) => ({ id, player, kind: 'birdies', target: 2, stake: 20, payout: 'success', attempts: 'any' });
const round = (d, course, value) => ({ day: d, course, value, counted: true });
const prog = (perRound) => ({ best: 3, done: false, rounds: perRound.length, perRound, at });
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-3), to: day(3), createdAt: at, currency: 'USD',
  players: ['Sascha', 'Cedric', 'Erik'].map((n) => ({ id: n[0].toLowerCase(), name: n, joined: { name: n, at, uid: n } })),
  wagers: [bet('ws', 's'), bet('we', 'e')],
  progress: {
    ws: prog([round(day(-1), 'Hawks Landing', 3), round(day(0), 'Legends', 3)]),
    we: prog([round(day(-1), 'Hawks Landing', 0), round(day(0), 'Legends', 3)]),
  },
  payments: [
    { id: 'pc', from: 'c', to: 's', amount: 20, paidAt: at, receivedAt: at },
    { id: 'pe', from: 'e', to: 's', amount: 20, paidAt: at },
  ],
};
await p.evaluate(async (pl) => {
  const ws = await import('/src/lib/wagerstore.ts');
  await ws.createPool(pl, 's');
  sessionStorage.setItem('golfos.module', 'games');
}, pool);
const toBalance = async () => {
  await p.goto('about:blank');
  await p.goto(url);
  await p.waitForTimeout(1500);
  await p.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
  await p.waitForTimeout(800);
};
await toBalance();

const openPerson = async (name) => {
  await p.locator('.balance-person').filter({ hasText: name }).click();
  await p.waitForTimeout(400);
  return p.getByRole('dialog', { name });
};
const text = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
const roundsOf = (s) => s.locator('.balance-round').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

// Cedric: 40 $ – 20 for yesterday (paid), 20 for today (open)
let s = await openPerson('Cedric');
ok(/zahlt dir noch 20 \$/.test(await text(s.locator('.balance-verdict'))), `Cedric: "${await text(s.locator('.balance-verdict'))}"`);
const rounds = await roundsOf(s);
ok(rounds.length === 2, `two rounds (${rounds.join(' | ')})`);
ok(/Hawks Landing bezahlt \+20 \$ Deine Wette „.*“ geschafft \+20 \$/.test(rounds[0] ?? ''), `yesterday: Hawks Landing, paid (${rounds[0]})`);
ok(/Legends offen \+20 \$ Deine Wette „.*“ geschafft \+20 \$/.test(rounds[1] ?? ''), `today: Legends, open (${rounds[1]})`);
ok(/Zusammen \+40 \$/.test(await text(s.locator('.balance-sum'))), 'together +40 $');
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/balance-cedric.png` });
await s.getByRole('button', { name: 'Schließen' }).click();

// Erik: yesterday +20, today +20 −20 (his own bet) – his 20 $ waits for the confirmation
s = await openPerson('Erik');
const v = await text(s.locator('.balance-verdict'));
ok(/zahlt dir noch 20 \$/.test(v) && /Erik hat 20 \$ bezahlt – bitte bestätigen/.test(v), `Erik: not off before it is confirmed (${v})`);
const er = await roundsOf(s);
ok(er.length === 2 && /Hawks Landing offen \+20 \$/.test(er[0] ?? '') && /Wette von Erik „.*“ geschafft −20 \$/.test(er[1] ?? ''), `yesterday open, today Erik's bet set off (${er.join(' | ')})`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/balance-erik.png` });
await s.getByRole('button', { name: 'Schließen' }).click();

// the inbox: "Erik hat dir 20 $ bezahlt · Erhalt bestätigen"
await p.getByRole('button', { name: /^Inbox/ }).first().click();
await p.waitForTimeout(500);
const inbox = p.getByRole('dialog', { name: 'Inbox' });
const row = inbox.locator('.bell-row').filter({ hasText: 'Erik hat dir 20 $ bezahlt' });
ok((await row.count()) === 1, 'inbox: "Erik hat dir 20 $ bezahlt" to confirm');
await row.getByRole('button', { name: '20 $ von Erik erhalten' }).click();
await p.waitForTimeout(1200);
const stored = await p.evaluate(() => import('/src/lib/wagerstore.ts').then((ws) => ws.loadPools()[0].pool.payments.find((x) => x.id === 'pe')));
ok(!!stored?.receivedAt, 'confirmed in the inbox: the payment received');
await toBalance();
s = await openPerson('Erik');
const v2 = await text(s.locator('.balance-verdict'));
ok(/Alles bezahlt/.test(v2) && !/bestätigen/.test(v2), `then it is off: ${v2}`);
const er2 = await roundsOf(s);
ok(/Hawks Landing bezahlt/.test(er2[0] ?? ''), `yesterday's round paid now (${er2[0]})`);
ok(phone.errs.length === 0, `no page errors ${phone.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
