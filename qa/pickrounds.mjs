// QA (Sascha 11.11.2026, USA): the rounds a bet counts –
//  · "the list cannot be scrolled – every round in one line": nine rounds of the trip, the sheet scrolls to the last,
//    each row one line ("Sa 07.11. · Celebration Golf Club");
//  · "6 rounds set, then 'Ausgewählte Runden' – a plausibility check, I cannot choose only 4": a score over 3 rounds –
//    "3 Runden auswählen – noch 3", after three the others cannot be switched on, the row "3 von 3 ausgewählt";
//  · "the rounds' details are not needed – 6 of 7 rounds": the bet's line "3 von 9 Runden";
//  · "Celebration is in the total though I left it out": a round reported before it was left out is not in the bet's
//    total.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/pickrounds.mjs [url]
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
const courses = ['Celebration Golf Club', 'Reunion Resort Golf Course', 'Kissimmee Bay Country Club', 'Stonegate Golf Club - Cypress Course', 'StoneGate Golf Club – Oaks', 'Orange Lake Resort – The Legends', 'Orange Lake Resort – The Legends', 'Orange Lake Resort – The Legends', 'Orange Lake Resort – The Legends'];
const code = await H.evaluate(
  async ({ from, to, days, courses }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const at = new Date().toISOString();
    const pool = {
      kind: 'wager-pool', id: 'usa', name: 'USA-Wetten', from, to, createdAt: at, currency: 'USD',
      players: [{ id: 's', name: 'Sascha', joined: { name: 'Sascha', at, uid: 'Sascha' } }, { id: 'c', name: 'Cedric' }],
      rounds: days.map((d, k) => ({ id: `r${k}`, day: d, course: courses[k] })),
      wagers: [
        { id: 'w4', player: 'c', kind: 'scoreSum', target: 30, rounds: 3, stake: 50, payout: 'opponent', opponent: 's', attempts: 'any' },
        // left out of Celebration (day 0) – its progress still has it, as reported before
        { id: 'w5', player: 'c', kind: 'birdies', target: 1, stake: 20, payout: 'success', attempts: 'any', picks: [{ day: days[2], course: courses[2] }, { day: days[3], course: courses[3] }] },
      ],
      progress: { w5: { best: 2, done: false, rounds: 2, at, perRound: [{ day: days[0], course: courses[0], value: 2 }, { day: days[2], course: courses[2], value: 0 }] } },
    };
    return (await ws.createPool(pool, 's'))?.code ?? null;
  },
  { from: day(-6), to: day(6), days: Array.from({ length: 9 }, (_, k) => day(-6 + k)), courses },
);

await H.evaluate(async () => {
  await (await import('/src/lib/wagerstore.ts')).syncPools();
  sessionStorage.setItem('golfos.module', 'games');
});
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.locator('.list-item').filter({ hasText: 'USA-Wetten' }).first().click({ timeout: 15000 });
await H.waitForTimeout(1500);

// (the total without the round left out: unit test wagers.test.ts "a round left out of a bet" – the host phone judges the bet anew here)
// the score over 3 rounds: rounds chosen
await H.locator('.pool-wager').filter({ hasText: 'in 3 Runden' }).first().click();
const sheet = H.locator('.wager-sheet');
await sheet.getByRole('button', { name: /Welche Runden/ }).click();
await H.locator('.pick-option').filter({ hasText: 'Ausgewählte Runden' }).click();
const row = sheet.getByRole('button', { name: /^Runden.*ausgewählt/ });
ok(/0 von 3 ausgewählt – noch 3/.test(await row.innerText()), `the row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);
await row.click();
const dlg = H.getByRole('dialog', { name: 'Runden' });
ok(/3 Runden auswählen – noch 3/.test(await dlg.innerText()), 'the sheet: "3 Runden auswählen – noch 3"');
const rows = dlg.locator('.pick-rounds .drawer-row');
ok((await rows.count()) === 9, `nine rounds to choose (${await rows.count()})`);
const heights = await rows.evaluateAll((es) => es.map((e) => e.querySelector('.switch-label > span').getBoundingClientRect().height));
ok(heights.every((h) => h < 26), `every round in one line (${heights.map((h) => Math.round(h)).join(',')} px)`);
ok(/^\S{2} \d\d\.\d\d\. · /.test(await rows.first().innerText()), `short: "${(await rows.first().innerText()).trim()}"`);
// the last one: scrolled to and tapped
await rows.last().scrollIntoViewIfNeeded();
const lb = await rows.last().boundingBox();
const vh = H.viewportSize().height;
ok(lb && lb.y + lb.height <= vh + 1 && lb.y >= 0, `the last round scrolled into view (${lb ? Math.round(lb.y) : '?'} of ${vh})`);
for (const k of [8, 3, 4]) await rows.nth(k).click();
ok(/Alle 3 Runden ausgewählt/.test(await dlg.innerText()), 'three chosen: "Alle 3 Runden ausgewählt"');
ok(await rows.nth(0).isDisabled(), 'a fourth cannot be switched on');
if (process.env.SHOTS) await dlg.screenshot({ path: `${process.env.SHOTS}/pickrounds.png` });
await dlg.getByRole('button', { name: 'Schließen' }).click();
ok(/3 von 3 ausgewählt/.test(await row.innerText()), `the row: "${(await row.innerText()).replace(/\s+/g, ' ')}"`);
await sheet.getByRole('button', { name: 'Speichern', exact: true }).click();
await H.waitForTimeout(1500);
const w4 = shared.get(code).game.wagers.find((w) => w.id === 'w4');
ok(w4?.picks?.length === 3 && w4.rounds === 3, `on the server: 3 rounds chosen, over 3 rounds (${w4?.picks?.length} · ${w4?.rounds})`);
const line = (await H.locator('.pool-wager').filter({ hasText: 'in 3 Runden' }).first().innerText()).replace(/\s+/g, ' ');
ok(/3 von 9 Runden/.test(line) && !/Orange Lake/.test(line), `its line: "3 von 9 Runden", no courses (${line.slice(0, 120)})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
