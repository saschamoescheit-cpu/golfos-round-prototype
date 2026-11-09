// QA (Sascha 09.11.2026, Kissimmee Bay): "I set the tournament from 3 net classes to none and saved – it is not saved,
// it shows 3 classes again". A tournament changed: what the setup takes away – the net classes, the special prizes –
// is gone from the event on the server too; what it changes stays changed. Supabase is simulated (qa/sharesim.mjs), the
// app's own code saves. Usage: node qa/tourclasses.mjs [url]
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
const code = await sim.plan(H, {
  name: 'Kissimmee Bay',
  classes: [12, 24],
  specials: [{ id: 'ntp', kind: 'nearestPin' }],
  flights: [{ teeTime: '12:00', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Erik', playingHandicap: 5 }] }],
});
const ev0 = sim.shared.get(code).game;
ok(JSON.stringify(ev0.classes) === '[12,24]' && ev0.specials?.length === 1, `planned with 3 net classes and a special prize (${JSON.stringify(ev0.classes)})`);

// changed as the setup does it: no classes, no special prize, 75 % – saved
const saved = await H.evaluate(
  async ({ code, row }) => {
    const ts = await import('/src/lib/tourstore.ts');
    ts.keepTour(code, row.game, row.owner);
    const { classes: _c, specials: _s, ...rest } = row.game;
    return ts.changeTour(code, { ...rest, format: { ...rest.format, allowance: 75 } });
  },
  { code, row: sim.shared.get(code) },
);
const ev1 = sim.shared.get(code).game;
ok(saved && ev1.classes == null && ev1.specials == null && ev1.format.allowance === 75, `saved: no net classes, no special prize, 75 % (${JSON.stringify({ classes: ev1.classes ?? null, specials: ev1.specials?.length ?? 0, allowance: ev1.format.allowance })})`);
const kept = await H.evaluate((c) => import('/src/lib/tourstore.ts').then((ts) => ts.loadTours().find((e) => e.code === c)?.ev ?? null), code);
ok(kept && kept.classes == null && kept.specials == null, 'this phone keeps it so – opened again, "Keine"');
// and back to two classes: saved again
await H.evaluate(async (c) => {
  const ts = await import('/src/lib/tourstore.ts');
  const ev = ts.loadTours().find((e) => e.code === c).ev;
  return ts.changeTour(c, { ...ev, classes: [18] });
}, code);
ok(JSON.stringify(sim.shared.get(code).game.classes) === '[18]', 'two classes again: saved');
// gross with old net classes still stored (Sascha 09.11.2026: "switched Kissimmee to gross – the net classes still show
// in front"): the page shows none – no "3 Klassen", no "Klasse A" in the leaderboard, "Keine" when editing
const gross = await sim.plan(H, {
  name: 'Kissimmee Brutto',
  classes: [12, 24],
  format: { mode: 'single', scoring: 'stroke', allowance: 0 },
  flights: [{ teeTime: '12:00', players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Cedric', playingHandicap: 13 }] }],
});
await H.evaluate(async ({ c, row }) => (await import('/src/lib/tourstore.ts')).keepTour(c, row.game, row.owner), { c: gross, row: sim.shared.get(gross) });
await H.evaluate((c) => {
  sessionStorage.setItem('golfos.module', 'tournaments');
  sessionStorage.setItem('golfos.openTour', c);
}, gross);
await H.goto('about:blank');
await H.goto(url);
await H.locator('.tour-screen').waitFor({ timeout: 15000 });
await H.waitForTimeout(1000);
const page = (await H.locator('.tour-screen').innerText()).replace(/\s+/g, ' ');
ok(!/Klassen/.test(page) && !/Klasse [A-C]/.test(page), `gross with old classes stored: no net classes on the page (${page.slice(0, 120)})`);
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
