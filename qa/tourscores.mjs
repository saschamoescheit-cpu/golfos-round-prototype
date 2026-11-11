// QA (Sascha 08.11.2026, USA – yesterday's Celebration: "Flight 1 at 11:48 and Flight 2 at 11:40 make no sense"; "we
// also need to enter yesterday's scores afterwards"). Supabase simulated (qa/sharesim.mjs), the app real.
// 1 · the flights numbered by their tee time: the 11:40 flight is flight 1, whatever order it was set up in
// 2 · yesterday's tournament: "Scores eintragen" on a flight – a box per hole, each player – saved: on the server (its
//     own score and the marker's count), in the leaderboard
// Usage: node qa/tourscores.mjs [url]
import { webkit } from 'playwright';
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
const yesterday = await H.evaluate(() => {
  const d = new Date(Date.now() - 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});
// set up the later flight first – as Celebration was
const flights = [
  { teeTime: '11:48', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Cedric', playingHandicap: 13 }] },
  { teeTime: '11:40', players: [{ name: 'Christopher', playingHandicap: 0 }, { name: 'Erik', playingHandicap: 5 }] },
];
const code = await sim.plan(H, { name: 'Celebration', date: yesterday, flights, format: { mode: 'single', scoring: 'stroke', allowance: 0 } });

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.reload();
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click();
await H.waitForTimeout(1500);
await H.locator('.list-item').filter({ hasText: 'Celebration' }).first().click();
await H.waitForTimeout(2500);

// 1 · by tee time
const f1 = H.getByRole('region', { name: 'Flight 1', exact: true });
const f2 = H.getByRole('region', { name: 'Flight 2', exact: true });
const t1 = (await f1.innerText()).replace(/\s+/g, ' ');
const t2 = (await f2.innerText()).replace(/\s+/g, ' ');
ok(/11:40/.test(t1) && /Christopher/.test(t1) && /11:48/.test(t2) && /Sascha/.test(t2), `Flight 1 is the 11:40 one, flight 2 the 11:48 one (${t1.slice(0, 50)} | ${t2.slice(0, 50)})`);

// 2 · the scores of yesterday entered on flight 2 (Sascha, Cedric)
await f2.getByRole('button', { name: 'Scores eintragen' }).click();
const sheet = H.getByRole('dialog', { name: 'Scores von Flight 2' });
await sheet.waitFor({ timeout: 5000 });
const holes = await sheet.locator('.tour-score-box input').count();
ok(holes === 9, `a box for every hole (${holes})`);
const pars = (await sheet.locator('.tour-score-box .muted').allInnerTexts()).map((x) => Number(x.replace(/\D/g, '')));
const fill = async (over) => {
  for (let i = 0; i < holes; i++) await sheet.locator('.tour-score-box input').nth(i).fill(String(pars[i] + (i < over ? 1 : 0)));
};
await fill(2); // Sascha +2
ok(/9 von 9 Löchern/.test(await sheet.innerText()) && /\+2/.test(await sheet.innerText()), 'the total below: 9 of 9 holes, +2');
await sheet.getByRole('button', { name: /^Cedric/ }).click();
await fill(5); // Cedric +5
ok(/Sascha · 9\/9/.test(await sheet.innerText()) && /Cedric · 9\/9/.test(await sheet.innerText()), 'each player\'s holes counted on his chip');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/tourscores-sheet.png' });
// saved by themselves (Sascha 11.11.2026): no "Scores speichern" – on the server a moment later with the sheet open
ok((await sheet.getByRole('button', { name: 'Scores speichern' }).count()) === 0 && /von selbst gespeichert|Gespeichert|Speichert/.test(await sheet.locator('.autosave-note').innerText()), 'no "Scores speichern" – a quiet line instead');
await H.waitForTimeout(2500);
{
  const r0 = [...sim.shared.values()].find((r) => r.event_code === code && r.game.flight.players.some((p) => p.name === 'Cedric'));
  const cid = r0?.game.flight.players.find((p) => p.name === 'Cedric')?.id;
  ok(!!cid && (r0.game.flight.scores[cid] ?? []).filter((c) => c?.s != null).length === 9 && (await sheet.count()) === 1, 'saved by themselves: Cedric\'s nine holes on the server, the sheet still open');
}
await sheet.getByRole('button', { name: 'Schließen' }).click();
await H.waitForTimeout(1500);
ok((await sheet.count()) === 0, 'closed with ✕');
const row = [...sim.shared.values()].find((r) => r.event_code === code && r.game.flight.players.some((p) => p.name === 'Sascha'));
const fl = row?.game.flight;
const sid = fl?.players.find((p) => p.name === 'Sascha')?.id;
const sum = (cells) => (cells ?? []).reduce((s, c) => s + (c?.s ?? 0), 0);
const parSum = pars.reduce((a, x) => a + x, 0);
ok(!!fl && sum(fl.scores[sid]) === parSum + 2, `on the server: Sascha ${sum(fl?.scores[sid])} strokes (par ${parSum})`);
ok(!fl?.marks?.[sid] || sum(fl.marks[sid]) === parSum + 2, 'the marker\'s count the same – no "Zähler weicht ab"');
const board = (await H.locator('.tour-live .lb-rows li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
ok(board.some((x) => /Sascha/.test(x) && /\+2/.test(x)) && board.some((x) => /Cedric/.test(x) && /\+5/.test(x)), `the leaderboard: Sascha +2, Cedric +5 (${board.join(' | ')})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
