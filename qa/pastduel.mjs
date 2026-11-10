// QA (Sascha 11.11.2026, USA): "Chris played 5+5+10 against Moritz, Erik, Cedric and Stefan – but did not set it up
// on the phone. If he wants to add it afterwards for his statistics – is there a way?" – Way 1: in the pool, for the
// day played. Sascha's pool (Sascha, Chris, Erik), its first day two days ago. Yesterday Chris and Erik each played
// their own round (on their phones). Chris: Games → Neues Spiel → 5+5+10 → "Runde am" yesterday (not only from today
// on) – the hint "Schon gespielt"; against Erik. Erik accepts – the result from both cards of yesterday: Chris +10 $,
// in the settlement. A day before the pool stays out of reach.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/pastduel.mjs [url]
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
const { shared } = sim;
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
      wagers: [],
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

// yesterday: each his own round – Chris −1 (−2 front, +1 back), Erik even
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const yesterday = new Date(Date.now() - 86400000);
yesterday.setHours(10, 0, 0, 0);
const played = (P, name, scores) =>
  P.evaluate(
    async ({ name, scores, PARS, at }) => {
      const S = await import('/src/lib/storage.ts');
      const { emptyEntry } = await import('/src/lib/scoring.ts');
      S.saveRound({
        id: `r-${name}`, createdAt: at, finishedAt: at, courseId: 'kb', courseName: 'Kissimmee Bay', loopOrder: ['A'], mode: 'simple', currentHole: 17,
        holes: PARS.map((par, i) => ({ index: i, label: String(i + 1), loop: 'A', number: i + 1, par, strokeIndex: i + 1 })),
        players: [{ id: 'me', name, isMe: true, playingHandicap: 10 }],
        entries: { me: scores.map((s) => ({ ...emptyEntry(), strokes: s })) },
      });
    },
    { name, scores, PARS, at: yesterday.toISOString() },
  );
await played(C, 'Chris', PARS.map((p, i) => (i < 2 ? p - 1 : i === 12 ? p + 1 : p)));
await played(E, 'Erik', PARS);

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

// Chris: Neues Spiel → 5+5+10 → "Runde am" yesterday
await toGames(C);
await C.getByRole('button', { name: 'Neues Spiel', exact: true }).click();
await C.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
await C.locator('.sheet .pick-option').filter({ has: C.locator('strong', { hasText: /^5\+5\+10$/ }) }).first().click();
await C.waitForTimeout(400);
const label = (d) => C.evaluate(async (d) => (await import('/src/components/Settings.tsx')).dayText(d), d);
await C.locator('.settings-row').filter({ hasText: 'Runde am' }).click();
const cal = C.getByRole('dialog', { name: 'Runde am' });
if (day(-1).slice(0, 7) !== day(0).slice(0, 7)) await cal.getByRole('button', { name: 'Monat davor' }).click();
const yBtn = cal.locator('.date-day').and(C.locator(`[aria-label="${await label(day(-1))}"]`));
ok((await yBtn.count()) === 1 && !(await yBtn.isDisabled()), 'the calendar: yesterday can be chosen (not only from today on)');
if (day(-3).slice(0, 7) === day(-1).slice(0, 7)) {
  const before = cal.locator('.date-day').and(C.locator(`[aria-label="${await label(day(-3))}"]`));
  ok(await before.isDisabled(), 'a day before the pool: not to be chosen');
}
await yBtn.click();
await C.waitForTimeout(300);
ok(/Schon gespielt/.test(await C.locator('main').innerText()), 'the hint: "Schon gespielt – sobald angenommen, kommt das Ergebnis aus euren Scorekarten des Tages"');
ok(/Pool USA-Wetten/.test((await C.locator('.settings-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join('|')), 'the pool of that day: USA-Wetten');
await C.locator('.settings-row').filter({ hasText: 'Gegner' }).click();
const sheet = C.getByRole('dialog', { name: 'Gegner' });
await sheet.getByRole('switch', { name: /Erik/ }).click();
await sheet.getByRole('button', { name: 'Fertig' }).click();
await C.getByRole('button', { name: /herausfordern/i }).click();
await C.locator('.duel-challenges').waitFor({ timeout: 15000 });
{
  const w = shared.get(code).game.wagers.find((x) => x.kind === 'nassau');
  ok(!!w && w.player === 'c' && w.opponent === 'e' && w.day === day(-1) && w.challenge?.state === 'open', `the duel for yesterday, waiting for Erik (${w?.day})`);
}

// Erik accepts in the pool
await openPool(E);
await E.locator('.duel-challenge').filter({ hasText: 'Chris fordert dich heraus' }).getByRole('button', { name: 'Annehmen' }).click();
await E.waitForTimeout(1500);
ok(shared.get(code).game.wagers.find((w) => w.kind === 'nassau')?.challenge?.state === 'accepted', 'Erik accepted');

// each phone puts its card of yesterday in the pool
for (const P of [C, E]) await P.evaluate(async () => { await (await import('/src/lib/wagerstore.ts')).reportWagers(); });
{
  const cards = shared.get(code).game.cards ?? {};
  ok(cards.c?.[0]?.day === day(-1) && cards.e?.[0]?.day === day(-1), `the cards of yesterday in the pool: ${Object.keys(cards).join(', ')}`);
}
// Sascha's phone, in neither: the standing and the settlement
await openPool(H);
const row = H.locator('section.pool-player').filter({ has: H.locator('h2', { hasText: /^Chris$/ }) }).locator('.pool-wager').filter({ hasText: /gegen Erik/ });
const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/\+10 \$/.test(rowText), `Sascha's phone: Chris against Erik +10 $ (${rowText.slice(0, 120)})`);
const bal = await H.evaluate(async (c) => {
  const w = await import('/src/lib/wagers.ts');
  const e = JSON.parse(localStorage.getItem('golfos.pools.v1')).find((x) => x.code === c);
  return w.balances(w.withDuels(e.pool), undefined, true);
}, code);
ok(bal.c === 10 && bal.e === -10, `the settlement: Chris +10, Erik −10 (${JSON.stringify(bal)})`);
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/pastduel.png`, fullPage: true });

ok([host, chris, erik].every((x) => x.errs.length === 0), `no page errors ${[host, chris, erik].flatMap((x) => x.errs).slice(0, 2).join(" | ")}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
