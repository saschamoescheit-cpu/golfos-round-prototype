// QA (Sascha 09.11.2026, USA: "I invited everyone to the series – at Stonegate Cypress and Oaks it still offers to invite
// Stefan; live on in the series, the switch off in its rounds – one link for all?"). Stefan is in the series (invited by
// a tap), not yet in its rounds: his phone joins every round of it when it syncs – the round shows on his phone. A round
// of the series shows the series' invitation (its code) and the series' live switch.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesinvite.mjs [url]
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
const flights = [{ teeTime: '12:00', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Stefan', playingHandicap: 13 }] }];
const r1 = await sim.plan(H, { name: 'Stonegate Cypress', date: day(1), flights });
const r2 = await sim.plan(H, { name: 'Stonegate Oaks', date: day(2), flights });
const series = sim.series('Sascha', 'The Orlando Invitational', [r1, r2]);
for (const c of [r1, r2]) shared.get(c).game = { ...shared.get(c).game, series: { code: series, name: 'The Orlando Invitational' } };
// invited to the series by a tap: in the series' row only
shared.get(series).members.push('Stefan');
ok(![r1, r2].some((c) => shared.get(c).members.includes('Stefan')), 'Stefan in the series, not yet in its rounds');

const stefan = await sim.phone('Stefan');
const synced = await stefan.p.evaluate(async () => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
  return ts.loadTours().map((e) => e.ev.name).sort();
});
ok([r1, r2].every((c) => shared.get(c).members.includes('Stefan')), "Stefan's phone synced: in every round of the series");
ok(synced.join() === 'Stonegate Cypress,Stonegate Oaks', `the rounds on his phone: ${synced.join(', ')}`);

// the host: a round of the series shows the series' invitation and live switch
await H.evaluate(async ({ codes }) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
  sessionStorage.setItem('golfos.module', 'tournaments');
  sessionStorage.setItem('golfos.openTour', codes[0]);
}, { codes: [r1] });
await H.goto('about:blank');
await H.goto(url);
await H.locator('.tour-screen').waitFor({ timeout: 15000 });
await H.waitForTimeout(1200);
const inv = (await H.locator('.tour-invite').innerText().catch(() => '')).replace(/\s+/g, ' ');
const shown = series.slice(0, 3) + '-' + series.slice(3);
ok(inv.includes(series) || inv.includes(shown), `a round of the series: the series' code in its invitation (${inv.slice(0, 80)})`);
ok(!inv.includes(r1) && !inv.includes(r1.slice(0, 3) + '-' + r1.slice(3)), "not the round's own code");
ok([host, stefan].every((x) => x.errs.length === 0), `no page errors ${[host, stefan].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
