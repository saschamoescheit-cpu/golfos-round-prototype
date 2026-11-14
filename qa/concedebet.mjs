// QA (Sascha 14.11.2026: Cedric gave up "Ergebnis brutto in 6 Runden" after 4 of 6 and paid Chris early – "Wie lösen wir
// sowas in der App?", Variante A): on his own phone, not the host, Cedric taps his open bet – "Aufgeben" in its action bar,
// "Wette aufgeben?" with "Du zahlst Chris 20 $" and "Schon bezahlt" on. The pool keeps it given up (missed, his own
// report – no decision by hand, which is the host's), the payment marked paid by him; the standing shows the flag
// "aufgegeben", the host's settlement the payment with "aufgegeben"; Chris's inbox "Cedric hat dir 20 $ bezahlt".
// Supabase is simulated (qa/sharesim.mjs), the app is real; the server's pool rules are checked here on what was written.
// Usage: node qa/concedebet.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
import { onOff, flip } from './onoff.mjs';

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
  async ({ from, to, days }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const four = { best: 90, done: false, rounds: 4, at, perRound: days.map((d, k) => ({ day: d, course: 'Platz ' + k, value: 22 + (k % 2), counted: true })) };
    return (
      await ws.createPool(
        {
          kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
          players: [
            { id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } },
            { id: 'pc', name: 'Cedric', invited: { uid: 'Cedric', name: 'Cedric', at } },
            { id: 'ph', name: 'Chris', invited: { uid: 'Chris', name: 'Chris', at } },
          ],
          wagers: [
            { id: 'w-sum', player: 'pc', kind: 'scoreSum', target: 108, rounds: 6, stake: 20, payout: 'opponent', opponent: 'ph', attempts: 'any', counted: true },
            { id: 'w-par', player: 'ph', kind: 'parRun', target: 5, stake: 20, payout: 'success', attempts: 'any', counted: true },
          ],
          progress: { 'w-sum': four },
        },
        'ps',
      )
    )?.code ?? null;
  },
  { from: day(-6), to: day(6), days: [day(-4), day(-3), day(-2), day(-1)] },
);
ok(/^[A-Z0-9]{6}$/.test(code ?? ''), `the pool: Cedric's "brutto in 6 Runden" against Chris, +90 after 4 of 6 (${code})`);

const openPool = async (P) => {
  await P.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
  await P.goto('about:blank');
  await P.goto(url);
  await P.waitForTimeout(1500);
  await P.evaluate((c) => {
    sessionStorage.setItem('golfos.openPool', c);
    window.dispatchEvent(new Event('golfos:open-pool'));
  }, code);
  await P.locator('section.pool-player').first().waitFor({ timeout: 20000 }).catch(() => {});
  await P.waitForTimeout(1500);
};
const cedric = await sim.phone('Cedric');
const C = cedric.p;
const chris = await sim.phone('Chris');
await openPool(chris.p);
await openPool(C);
const before = JSON.parse(JSON.stringify(shared.get(code).game));

// Cedric, not the host: his open bet tapped – "Aufgeben" in its action bar
const row = C.locator('.pool-wager').filter({ hasText: /in 6 Runden/ }).first();
ok((await row.evaluate((e) => e.tagName)) === 'BUTTON', 'Cedric (not the host): his own open bet can be tapped');
await row.click();
const own = C.getByRole('dialog', { name: /in 6 Runden/ });
await own.waitFor({ timeout: 5000 });
ok((await own.getByRole('button', { name: 'Wette aufgeben' }).count()) === 1 && (await own.getByRole('button', { name: /löschen/ }).count()) === 0, 'his bet: "Aufgeben" in the action bar – no deleting (that is the host\'s)');
await own.getByRole('button', { name: 'Wette aufgeben' }).click();
const ask = C.getByRole('dialog', { name: 'Wette aufgeben?' });
await ask.waitFor({ timeout: 5000 });
const askText = (await ask.innerText()).replace(/\s+/g, ' ');
ok(/zählt ab jetzt als verloren/.test(askText) && /Du zahlst Chris 20 \$/.test(askText), `"Wette aufgeben?": what it means and costs (${askText.slice(0, 140)})`);
const paidRow = onOff(ask, 'Schon bezahlt');
ok((await paidRow.getAttribute('data-on')) === 'false', '"Schon bezahlt": a row, off at first');
await flip(paidRow);
ok((await onOff(ask, 'Schon bezahlt').getAttribute('data-on')) === 'true', '"Schon bezahlt" on (Cedric paid in cash)');
await ask.getByRole('button', { name: 'Aufgeben', exact: true }).click();
await C.waitForTimeout(2500);

// the server: given up by Cedric's own report, his payment marked paid – and nothing a member may not write
{
  const g = shared.get(code).game;
  const p = g.progress['w-sum'];
  ok(!!p?.conceded && p.conceded.by === 'Cedric' && !p.manual, `the pool: given up by Cedric – no decision by hand (${JSON.stringify(p?.conceded)})`);
  const pay = (g.payments ?? []).find((x) => x.from === 'pc' && x.to === 'ph');
  ok(!!pay && pay.amount === 20 && !!pay.paidAt, `his payment to Chris marked paid: ${JSON.stringify(pay)}`);
  const strip = (x) => { const { progress, players, payments, ...rest } = x; return JSON.stringify(rest); };
  const changedBets = Object.keys({ ...g.progress, ...before.progress }).filter((k) => JSON.stringify(g.progress[k]) !== JSON.stringify(before.progress[k]));
  ok(strip(g) === strip(before) && changedBets.every((k) => g.wagers.find((w) => w.id === k)?.player === 'pc') && (g.payments ?? []).every((x) => x.from === 'pc' || x.to === 'pc'), `the server's rules: only his own bet's report and his own payment changed (${changedBets.join(', ')})`);
}

// the standing: the flag, "aufgegeben" – neither green nor red
await openPool(C);
const stand = C.locator('.pool-standings');
const given = stand.locator('.bet-cell.given');
ok((await given.count()) === 1 && /aufgegeben/.test(await given.innerText()) && (await given.locator('svg').count()) === 1, `the standing: "${(await given.innerText().catch(() => '')).replace(/\s+/g, ' ')}" with the flag`);
ok(/aufgegeben von Cedric/.test(await C.locator('.pool-wager').filter({ hasText: /in 6 Runden/ }).first().innerText()), 'his bet in the list: "aufgegeben von Cedric"');
if (process.env.SHOTS) await stand.screenshot({ path: `${process.env.SHOTS}/concede-standing.png` });

// the host's settlement: the payment with "aufgegeben", paid
await openPool(H);
const settle = (await H.locator('.pool-settle').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/aufgegeben/.test(settle) && /Cedric/.test(settle), `the host's settlement: the payment says "aufgegeben" (${settle.slice(0, 160)})`);

// the host: Cedric's bet says who gave it up; "App wertet aus" takes it back – judged from the rounds again
{
  await H.locator('.pool-wager').filter({ hasText: /in 6 Runden/ }).first().click();
  const sheet = H.getByRole('dialog', { name: 'Wette', exact: true });
  await sheet.waitFor({ timeout: 5000 });
  ok(/aufgegeben von Cedric am/.test(await sheet.innerText()) && (await sheet.getByRole('button', { name: 'Wette aufgeben' }).count()) === 0, "the host’s sheet: aufgegeben von Cedric am …, no second Aufgeben");
  await sheet.locator('.settings-row').filter({ hasText: 'Von Hand entscheiden' }).click();
  await H.getByRole('dialog', { name: 'Von Hand entscheiden' }).locator('.pick-option').filter({ hasText: 'App wertet aus' }).click();
  await H.waitForTimeout(2000);
  const p = shared.get(code).game.progress['w-sum'];
  ok(!p?.conceded && !p?.manual, `taken back by the host: judged from the rounds again (${JSON.stringify(p ?? {}).slice(0, 80)})`);
}

// Chris: in his inbox "Cedric hat dir 20 $ bezahlt"
await openPool(chris.p); // the pool read on his phone
await chris.p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await chris.p.goto('about:blank');
await chris.p.goto(url);
await chris.p.waitForTimeout(2500);
await chris.p.locator('.bell-btn').first().click();
const inbox = chris.p.getByRole('dialog', { name: 'Inbox' });
await inbox.waitFor({ timeout: 5000 }).catch(() => {});
ok(/Cedric hat dir 20 \$ bezahlt/.test(await inbox.innerText().catch(() => '')), 'Chris\'s inbox: "Cedric hat dir 20 $ bezahlt" – to confirm');

ok(host.errs.length === 0 && cedric.errs.length === 0 && chris.errs.length === 0, `no page errors ${[...host.errs, ...cedric.errs, ...chris.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
