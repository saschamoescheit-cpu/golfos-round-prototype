// QA (Sascha 12.11.2026: "remove these two rounds at last" – Celebration and Reunion on the 08.11. in the pool's
// standing): the host picks a round in the standing, "Runde nicht werten", confirms – the round is gone from the switch
// on his phone and on the server (pool.skip), no bet counts it (inPool); the pool's pencil lists it under "Nicht
// gewertete Runden", "Wieder werten" brings it back. A player who is not the host has no such button.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/skipround.mjs [url]
import { webkit } from 'playwright';
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
let { dlg, names } = await listRounds();
ok(names.length === 4, `the switch lists Gesamt + 3 rounds (${names.join(' | ')})`);
ok((await stand.getByRole('button', { name: 'Runde nicht werten' }).count()) === 0, 'on "Gesamt": no "Runde nicht werten"');
await dlg.locator('.pick-option').filter({ hasText: 'Reunion' }).click();
await H.waitForTimeout(300);
await stand.getByRole('button', { name: 'Runde nicht werten' }).click();
const ask = stand.getByRole('group', { name: 'Runde nicht werten' });
ok(/Reunion Resort Golf Course am .* zählt dann für keine Wette mehr/.test(await ask.innerText()), 'asked first: "… zählt dann für keine Wette mehr – für alle im Pool. Die Scores bleiben."');
await ask.getByRole('button', { name: 'Nicht werten' }).click();
await H.waitForTimeout(800);
const server = sim.shared.get(code)?.game ?? sim.shared.get(code);
const skip = (server?.skip ?? server?.pool?.skip ?? []).map((x) => `${x.day}|${x.course}`);
ok(skip.length === 1 && skip[0] === `${d2}|Reunion Resort Golf Course`, `on the server: pool.skip = ${JSON.stringify(skip)}`);
({ dlg, names } = await listRounds());
ok(names.length === 3 && !names.some((n) => n.includes('Reunion')) && names.some((n) => n.includes('Celebration')), `Reunion gone from the switch, Celebration of the same day stays (${names.join(' | ')})`);
await dlg.locator('.pick-option').filter({ hasText: 'Celebration' }).click();
await stand.getByRole('button', { name: 'Runde nicht werten' }).click();
await stand.getByRole('group', { name: 'Runde nicht werten' }).getByRole('button', { name: 'Nicht werten' }).click();
await H.waitForTimeout(800);
({ dlg, names } = await listRounds());
ok(names.length === 2 && names[1].includes('Cypress'), `both rounds of the day out – the Cypress left (${names.join(' | ')})`);
await H.keyboard.press('Escape');
await H.locator('.sheet-backdrop').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
await H.waitForTimeout(300);

// the pencil: "Nicht gewertete Runden" – "Wieder werten" (saved by itself) brings Celebration back
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await edit.waitFor();
const skippedRows = edit.locator('.skip-list .list-item');
ok((await skippedRows.count()) === 2, `the pencil lists ${await skippedRows.count()} rounds not counted`);
await skippedRows.filter({ hasText: 'Celebration' }).getByRole('button', { name: 'Wieder werten' }).click();
await edit.getByRole('button', { name: 'Schließen' }).click();
await H.waitForTimeout(800);
({ dlg, names } = await listRounds());
ok(names.length === 3 && names.some((n) => n.includes('Celebration')) && !names.some((n) => n.includes('Reunion')), `Celebration counted again, Reunion still out (${names.join(' | ')})`);
await H.keyboard.press('Escape');

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
ok((await stand.getByRole('button', { name: 'Runde nicht werten' }).count()) === 0, 'not the host: no "Runde nicht werten"');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
