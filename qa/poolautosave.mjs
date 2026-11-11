// QA (Sascha 12.11.2026: "changes saved automatically instead of having to press Speichern"): the pool's pencil has no
// "Speichern" – a change is on the server a moment later with the sheet still open; an invalid field is not saved
// (the line says why); the cross saves at once. Supabase simulated (qa/sharesim.mjs). Usage: node qa/poolautosave.mjs [url]
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

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.getByText('USA-Wetten').first().click();
await H.locator('.pool-standings').waitFor({ timeout: 15000 });
await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
await edit.waitFor();
ok((await edit.getByRole('button', { name: 'Speichern', exact: true }).count()) === 0, 'no "Speichern" any more');
ok(/von selbst gespeichert/.test(await edit.locator('.autosave-note').innerText()), 'a quiet line: changes are saved by themselves');
await edit.locator('#pool-edit-name').fill('USA-Wetten Florida');
await H.waitForTimeout(2500);
const row = sim.shared.get(code);
ok(row?.game?.name === 'USA-Wetten Florida', `saved by itself, the sheet still open (${row?.game?.name})`);
ok(await edit.isVisible() && /Gespeichert/.test(await edit.locator('.autosave-note').innerText()), 'the sheet stays open: "Gespeichert – für alle im Pool"');
// a name emptied: nothing saved, the line says why
await edit.locator('#pool-edit-name').fill('');
await H.waitForTimeout(2000);
ok(sim.shared.get(code)?.game?.name === 'USA-Wetten Florida' && /brauchen einen Namen/.test(await edit.locator('.autosave-note').innerText()), 'an empty name: not saved, the line says why');
// the cross saves at once
await edit.locator('#pool-edit-name').fill('USA 2026');
await edit.getByRole('button', { name: 'Schließen' }).click();
await H.waitForTimeout(1500);
ok(sim.shared.get(code)?.game?.name === 'USA 2026' && (await edit.count()) === 0, 'the cross: saved at once and closed');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
