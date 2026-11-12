// QA (Sascha 12.11.2026, on the course: "Hier könnte man auch den Knopf Live einbauen wie unter dem Leaderboard bei
// Tournaments – eig. bei allen Leaderboards in der App, solange irgendwo eine Runde läuft"): while the tournament is
// played, "Live" in the action bar under its leaderboard – its sheet the block "Zuschauer" with the switch, "Fertig"
// closes it; once every flight is finished, no "Live" any more. Supabase simulated (qa/sharesim.mjs), the app real.
// Usage: node qa/liveaction.mjs [url]
import { webkit } from 'playwright';
import { onOff } from './onoff.mjs';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const today = await H.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
const flights = [{ teeTime: '09:00', players: [{ name: 'Sascha', playingHandicap: 4 }, { name: 'Erik', playingHandicap: 8 }] }];
const tour = await sim.plan(H, { name: 'Celebration', date: today, flights, format: { mode: 'single', scoring: 'stroke', allowance: 0 } });
// played to hole 3 – or every hole and the flight finished
const fill = (code, holes, finished) => {
  const row = sim.shared.get(code);
  const own = [...sim.shared.values()].filter((r) => r.event_code === code);
  for (const f of [...Object.values(row.game.flights), ...own.map((r) => r.game.flight)]) {
    const n = row.game.holes.length;
    f.scores = Object.fromEntries(f.players.map((p) => [p.id, Array.from({ length: n }, (_, i) => (i < holes ? { s: row.game.holes[i].par } : { s: null }))]));
    f.phones = { phone1: { player: 'p1', name: 'Sascha', at: 'x', uid: 'Sascha' } };
    if (finished) f.finishedAt = new Date().toISOString();
  }
  for (const r of [row, ...own]) r.updated_at = new Date().toISOString();
};
fill(tour, 3, false);

const open = async () => {
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
  await H.reload();
  await H.waitForTimeout(2500);
  await H.getByRole('button', { name: 'Turniere' }).first().click();
  await H.waitForTimeout(1500);
  await H.locator('.list-item').filter({ hasText: 'Celebration' }).first().click();
  await H.waitForTimeout(2500);
};
await open();
const bar = H.getByRole('group', { name: 'Dieses Turnier' });
const words = (await bar.locator('.sc-action span').allInnerTexts()).map((t) => t.trim());
ok(words[0] === 'Live' && (await bar.getByRole('button', { name: 'Live-Leaderboard für Zuschauer' }).locator('svg').count()) === 1, `played: "Live" in the bar under the leaderboard, with its icon (${words.join(' · ')})`);
await bar.getByRole('button', { name: 'Live-Leaderboard für Zuschauer' }).click();
const sheet = H.getByRole('dialog', { name: 'Live' });
await sheet.waitFor({ timeout: 5000 });
const sw = onOff(sheet, 'Live-Leaderboard für Zuschauer');
await sw.waitFor({ timeout: 10000 }).catch(() => {});
ok((await sw.count()) === 1, 'its sheet: "Live-Leaderboard zum Zuschauen" with An/Aus');
await H.getByRole('button', { name: 'Fertig', exact: true }).click();
await H.waitForTimeout(300);
ok((await sheet.count()) === 0, '"Fertig" closes it');
if (process.env.SHOTS) await bar.screenshot({ path: process.env.SHOTS + '/liveaction.png' });

// every hole played, the flight finished: no "Live" any more
fill(tour, 18, true);
await open();
const after = (await H.getByRole('group', { name: 'Dieses Turnier' }).locator('.sc-action span').allInnerTexts()).map((t) => t.trim());
ok(!after.includes('Live') && after.includes('CSV'), `finished: no "Live" (${after.join(' · ')})`);

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
