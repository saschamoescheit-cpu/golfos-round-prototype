// QA (Sascha 15.11.2026, USA): "Celebration war die erste Runde die wir gespielt haben und worauf Wetten liegen" – the
// round deleted from the pool once (Runde werten · Aus → Aus dem Pool löschen), no way back after the undo. Now: the
// host's total shows "Gelöschte Runden", tapping one brings it back – on the server it counts again, the others' stay.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/poolrestore.mjs [url]   (SHOTS=dir)
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
const host = await sim.phone('Sascha');
const H = host.p;
const days = await H.evaluate(() => {
  const d = (n) => {
    const x = new Date(Date.now() + n * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { first: d(-3), second: d(-2), today: d(0), tomorrow: d(1) };
});
const code = await H.evaluate(async (days) => {
  const ws = await import('/src/lib/wagerstore.ts');
  const pool = {
    kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from: days.first, to: days.tomorrow, createdAt: new Date().toISOString(), currency: 'USD',
    players: [{ id: 'ps', name: 'Sascha', joined: { name: 'Sascha', at: new Date().toISOString(), uid: 'Sascha' } }, { id: 'pc', name: 'Cedric' }],
    wagers: [{ id: 'w-p', player: 'pc', kind: 'pars', target: 10, stake: 20, payout: 'success', attempts: 'any', by: 'Sascha' }],
    progress: {},
    skip: [
      { day: days.first, course: 'Celebration Golf Club', hidden: true },
      { day: days.second, course: 'Reunion Resort Golf Course', hidden: true },
    ],
  };
  return (await ws.createPool(pool, 'ps'))?.code ?? null;
}, days);
ok(!!code, `the pool: ${code}`);
sim.shared.get(code).game.progress = { 'w-p': { perRound: [{ day: days.today, course: 'Hetzenhof', value: 6, counted: true }], at: new Date().toISOString(), best: 6, done: false, rounds: 1 } };

// tomorrow's tournament on the server, not on this phone (Sascha 15.11.2026 on the iPad: "Die morgige Runde Hawks Landing
// ist hier nicht zu sehen" – set up on the iPhone): the pool fetches it
await sim.plan(H, { name: 'Hawks Landing', date: days.tomorrow, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5 }] }] });
await H.evaluate(() => localStorage.removeItem('golfos.tours.v1'));
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2000);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
await H.waitForTimeout(2000);
{
  await H.locator('.pool-standings .step-pick-value, .pool-standings [aria-label="Runden"]').first().click().catch(() => {});
  await H.waitForTimeout(500);
  const opts = (await H.locator('.sheet .pick-option').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  ok(opts.some((x) => /geplant – noch keine Scores/.test(x)), `tomorrow's tournament, set up elsewhere: in the rounds, planned (${opts.join(' | ')})`);
  await H.locator('.sheet').getByRole('button', { name: 'Schließen' }).first().click({ timeout: 2000 }).catch(() => {});
  await H.waitForTimeout(300);
}
// since 15.11.2026 (mock-up A): the deleted rounds in the rounds' sheet, under "Gelöscht", each with the round green button
const openSheet = async () => {
  await H.locator('.pool-standings .step-pick-now').first().click();
  const d = H.getByRole('dialog', { name: 'Runden' });
  await d.waitFor({ timeout: 5000 });
  return d;
};
let sheet = await openSheet();
const gone = async () => (await sheet.locator('.gone-row').allInnerTexts()).map((x) => x.replace(/s+/g, ' '));
ok((await gone()).length === 2 && (await gone()).some((x) => /Celebration Golf Club/.test(x)) && (await gone()).some((x) => /Reunion/.test(x)), `the sheet: both deleted rounds under "Gelöscht" (${(await gone()).join(' | ')})`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/poolrestore-sheet.png' });
await sheet.locator('.gone-row').filter({ hasText: 'Celebration' }).getByRole('button', { name: /zurückholen/ }).click();
await H.waitForTimeout(2500);
{
  const skip = sim.shared.get(code).game.skip ?? [];
  ok(!skip.some((s) => s.day === days.first), `on the server: Celebration counts again (skip: ${skip.map((s) => s.day + ' ' + s.course).join(', ')})`);
  ok(skip.some((s) => s.day === days.second && s.hidden), 'Reunion stays deleted');
}
sheet = await openSheet();
ok((await gone()).length === 1, 'one deleted round left');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
