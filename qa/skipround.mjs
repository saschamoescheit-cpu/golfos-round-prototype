// QA (Sascha 12.11.2026: "remove these two rounds at last" – Celebration and Reunion on the 08.11. in the pool's
// standing; 11.11.2026: "eine andere Lösung"): the host picks a round in the standing, "Runde werten · Aus" – the round
// stays in the switch, "nicht gewertet", on the server in pool.skip, no bet counts it (inPool); "An" brings it back. A
// player who is not the host has no such row.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/skipround.mjs [url]
import { webkit } from 'playwright';
import { onOff, isOn, flip } from './onoff.mjs';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const d2 = day(-2);
const d1 = day(-1);
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;

// a pool whose standing has three rounds: two on one day (Celebration, Reunion) and the Cypress a day later – Chris's bet
// (judged on his phone: this one keeps what it got)
const code = await H.evaluate(
  async ({ from, to, d2, d1 }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const now = new Date().toISOString();
    const r = (day, course, value) => ({ day, course, value, counted: true });
    const per = [r(d2, 'Celebration Golf Club', 2), r(d2, 'Reunion Resort Golf Course', 1), r(d1, 'StoneGate Cypress', 3)];
    const made = {
      kind: 'wager-pool', id: 'pool-skip', name: 'USA-Wetten', from, to, createdAt: now, currency: 'USD', counted: true,
      players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }],
      wagers: [{ id: 'w1', player: 'c', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
      progress: { w1: { best: 3, done: true, rounds: 3, at: now, perRound: per } },
    };
    const e = await ws.createPool(made, 's');
    return e?.code ?? null;
  },
  { from: day(-5), to: day(5), d2, d1 },
);
ok(!!code, `the pool set up (${code})`);

// the inPool rule itself: a skipped round counts for no bet
const rule = await H.evaluate(async ({ d2 }) => {
  const W = await import('/src/lib/wagers.ts');
  const pool = { from: '2000-01-01', to: '2999-01-01', skip: [{ day: d2, course: 'Reunion Resort Golf Course' }] };
  return [W.inPool({ day: d2, course: 'reunion resort golf course ' }, pool), W.inPool({ day: d2, course: 'Celebration Golf Club' }, pool)];
}, { d2 });
ok(rule[0] === false && rule[1] === true, `inPool: the skipped round out, the other of the day in (${rule})`);

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.getByText('USA-Wetten').first().click();
const stand = H.locator('.pool-standings');
await stand.waitFor({ timeout: 15000 });
const sw = stand.getByRole('group', { name: 'Runden' });
const listRounds = async () => {
  await sw.locator('.step-pick-now').click();
  const dlg = H.getByRole('dialog', { name: 'Runden' });
  const names = await dlg.locator('.pick-option strong').allInnerTexts();
  return { dlg, names };
};
// since 11.11.2026 (Sascha: "eine andere Lösung") a row "Runde werten · An/Aus" under the round shown – rounds taken out
// stay in the switch, "nicht gewertet"; no list in the pencil any more
let { dlg, names } = await listRounds();
ok(names.length === 4, `the switch lists Gesamt + 3 rounds (${names.join(' | ')})`);
const countRow = () => onOff(stand, 'Runde werten');
ok((await countRow().count()) === 0, 'on "Gesamt": no "Runde werten"');
await dlg.locator('.pick-option').filter({ hasText: 'Reunion' }).click();
await H.waitForTimeout(300);
ok((await countRow().count()) === 1 && (await isOn(countRow())), 'a round: the row "Runde werten · An"');
await flip(countRow());
await H.waitForTimeout(800);
const server = sim.shared.get(code)?.game ?? sim.shared.get(code);
const skip = (server?.skip ?? server?.pool?.skip ?? []).map((x) => `${x.day}|${x.course}`);
ok(skip.length === 1 && skip[0] === `${d2}|Reunion Resort Golf Course`, `on the server: pool.skip = ${JSON.stringify(skip)}`);
ok(!(await isOn(countRow())) && /zählt für keine Wette/.test(await stand.innerText()), 'Reunion "Runde werten · Aus" – it counts for no bet, said so');
({ dlg, names } = await listRounds());
const texts = (await dlg.locator('.pick-option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
ok(names.length === 4 && texts.some((t) => /Reunion.*nicht gewertet/.test(t)) && texts.some((t) => /Celebration/.test(t) && !/nicht gewertet/.test(t)), `Reunion stays in the switch, "nicht gewertet"; Celebration of the same day counts (${texts.join(' | ')})`);
await dlg.locator('.pick-option').filter({ hasText: 'Celebration' }).click();
await H.waitForTimeout(300);
await flip(countRow());
await H.waitForTimeout(800);
const skip2 = ((sim.shared.get(code)?.game ?? sim.shared.get(code))?.skip ?? []).length;
ok(skip2 === 2, `both rounds of the day out (${skip2})`);
// counted again with the same row
await flip(countRow());
await H.waitForTimeout(800);
const skip3 = ((sim.shared.get(code)?.game ?? sim.shared.get(code))?.skip ?? []).map((x) => x.course);
ok(skip3.length === 1 && skip3[0].includes('Reunion') && (await isOn(countRow())), `Celebration counted again, Reunion still out (${skip3.join(', ')})`);
// the pencil: no list of rounds not counted any more
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await edit.waitFor();
ok((await edit.locator('.skip-list').count()) === 0, 'the pencil: no list "Nicht gewertete Runden"');
await edit.getByRole('button', { name: 'Schließen' }).click();
await H.waitForTimeout(500);

// a phone that is not the host's (the pool set up by another account) has no such button
{
  const row = sim.shared.get(code);
  if (row) row.owner = 'someone-else';
}
await H.evaluate(() => {
  const k = 'golfos.pools.v1';
  const list = JSON.parse(localStorage.getItem(k) || '[]').map((e) => ({ ...e, owner: 'someone-else' }));
  localStorage.setItem(k, JSON.stringify(list));
});
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.getByText('USA-Wetten').first().click();
await stand.waitFor({ timeout: 15000 });
await sw.getByRole('button', { name: 'Nächste' }).click();
await H.waitForTimeout(300);
ok((await onOff(stand, 'Runde werten').count()) === 0, 'not the host: no "Runde werten"');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
