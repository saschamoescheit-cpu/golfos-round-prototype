// QA (Sascha 08.11.2026, on the course in the USA: a tournament with "Jeder seinen eigenen" – "on mine it fits, on Erik's
// phone it looks different. It must look like mine for everyone"): three phones join a planned tournament where everyone
// keeps only his own score. On each phone the hole's score sheet: his own player to enter, the two others shown with
// "… erfasst diesen Score auf seinem Handy" – no steppers for them.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/ownonly.mjs [url]
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
const code = await sim.plan(host.p, {
  name: 'Turnier Test',
  format: { mode: 'single', scoring: 'stroke', allowance: 95, marker: false },
  flights: [{ teeTime: '11:00', markers: {}, players: [{ name: 'Sascha', playingHandicap: 10 }, { name: 'Moritz', playingHandicap: 20 }, { name: 'Erik', playingHandicap: 4 }] }],
});
const phones = { Sascha: host, Moritz: await sim.phone('Moritz'), Erik: await sim.phone('Erik') };
// one after the other – the host first, or (ORDER=late) the host last
const order = process.env.ORDER === 'late' ? ['Erik', 'Moritz', 'Sascha'] : ['Sascha', 'Moritz', 'Erik'];
for (const name of order) {
  await sim.joinPlanned(phones[name].p, code);
  await phones[name].p.waitForTimeout(2500);
}
// every phone exchanges a few times – each knows the others' phones
await host.p.waitForTimeout(12000);

for (const name of ['Sascha', 'Moritz', 'Erik']) {
  const p = phones[name].p;
  // the score sheet of hole 1
  await p.bringToFront();
  await p.waitForTimeout(6000); // this phone exchanges once more in front
  await p.locator('.map-score').click();
  await p.locator('.score-player').first().waitFor({ timeout: 10000 }).catch(() => {});
  const others = ['Sascha', 'Moritz', 'Erik'].filter((x) => x !== name);
  const kept = [];
  for (const o of others) {
    const block = p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${o}$`) }) });
    kept.push(`${o}: ${(await block.count()) ? ((await block.first().getAttribute('class'))?.includes('kept-elsewhere') ? 'erfasst auf seinem Handy' : 'zum Eingeben') : 'fehlt'}`);
  }
  const own = p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
  const ownEditable = (await own.count()) > 0 && !(await own.first().getAttribute('class'))?.includes('kept-elsewhere');
  ok(ownEditable && kept.every((k) => k.endsWith('erfasst auf seinem Handy')), `${name}'s phone: his own to enter, ${kept.join(', ')}`);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ownonly-${name}.png` });
}

// the same hole opened from the scorecard (Erik's photo: steppers for Sascha and Moritz, no putt pencil – the scorecard's
// panel knew nothing of who keeps which score)
{
  const p = phones.Erik.p;
  await p.bringToFront();
  await p.getByRole('button', { name: /Zurück|Schließen|Close/ }).first().click().catch(() => {});
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Scorekarte' }).click();
  await p.getByRole('button', { name: /^Loch \S+ bearbeiten$/ }).first().click();
  await p.locator('.score-panel-screen .score-player').first().waitFor({ timeout: 10000 }).catch(() => {});
  const kinds = await p.locator('.score-panel-screen .score-player').evaluateAll((els) => els.map((e) => `${e.querySelector('.score-player-head strong')?.textContent}: ${e.classList.contains('kept-elsewhere') ? 'erfasst auf seinem Handy' : 'zum Eingeben'}`));
  ok(kinds.length === 3 && kinds.filter((k) => k.endsWith('erfasst auf seinem Handy')).length === 2 && kinds.some((k) => k.startsWith('Erik: zum Eingeben')), `Erik's scorecard, a hole opened: as on the course (${kinds.join(', ')})`);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ownonly-Erik-card.png` });
}

const errs = Object.values(phones).flatMap((x) => x.errs);
ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
