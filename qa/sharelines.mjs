// QA (Sascha 12.11.2026, Cypress: "we had to set the tees and greens by hand" – every phone on its own): a hole set up on
// one phone of the flight reaches the others – they take it where they have none of their own, their own stay.
// Sascha and Chris play one round on two phones (Hetzenhof). Sascha's phone sets 3A by hand (another line than the
// map's), Chris's phone takes it; Chris's own 4A stays when Sascha's phone sends one for 4A too.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/sharelines.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const { phone, event } = sharedServer(b, url);
const flight = () => Object.values(event().flights)[0];

const host = await phone('Sascha');
const H = host.p;
await H.getByRole('button', { name: 'Neue Runde' }).click();
await H.waitForTimeout(1200);
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.getByText('Runde starten').waitFor({ timeout: 30000 });
await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
await H.locator('input[id^="name-"]').first().fill('Sascha');
await H.getByRole('button', { name: 'Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Chris');
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
await card.getByRole('button', { name: 'Code erzeugen' }).click({ timeout: 3000 }).catch(() => {});
await card.locator('.join-code').waitFor({ timeout: 8000 });
const code = (await card.locator('.join-code').innerText()).trim().replace(/-/g, '');
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 });

const guest = await phone('Chris');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
const ask = H.getByRole('alertdialog', { name: 'Chris möchte beitreten' });
await ask.waitFor({ timeout: 15000 });
await ask.getByRole('button', { name: 'Zulassen' }).click();
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
await G.waitForTimeout(3000);

const courseOf = (P) => P.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => !r.finishedAt).courseId);
const linesOf = (P, id) => P.evaluate((id) => JSON.parse(localStorage.getItem('golfos.holelines.v2.' + id) ?? '{}'), id);
const cid = await courseOf(H);
const L3 = [[8.9481, 48.9612], [8.9502, 48.9631]];
const L4H = [[8.9511, 48.9640], [8.9533, 48.9655]];
const L4C = [[8.9512, 48.9641], [8.9531, 48.9652]];
// Chris already has his own 4A
await G.evaluate(({ id, l }) => import('/src/lib/storage.ts').then((S) => S.saveHoleLine(id, 'A', 4, l)), { id: cid, l: L4C });
// Sascha's phone sets 3A and 4A by hand – told to the flight as the hole set-up's "Speichern" does
await H.evaluate(async ({ l3, l4 }) => {
  const S = await import('/src/lib/storage.ts');
  const R = await import('/src/lib/sharedround.ts');
  const r = JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((x) => !x.finishedAt);
  S.saveHoleLine(r.courseId, 'A', 3, l3);
  S.saveHoleLine(r.courseId, 'A', 4, l4);
  await R.shareLine(r, 'A', 3, l3);
  await R.shareLine(r, 'A', 4, l4);
}, { l3: L3, l4: L4H });
ok(JSON.stringify(flight().lines?.['A#3']) === JSON.stringify(L3) && !!flight().lines?.['A#4'], `server: the flight holds 3A and 4A (${Object.keys(flight().lines ?? {}).join(', ')})`);
// Chris's phone, in the round: takes 3A, keeps his own 4A
await G.waitForTimeout(15000);
const got = await linesOf(G, cid);
// kept apart from his own since 11.11.2026 (Moritz on Cypress: taken as his own they hid the course map for good)
const flightGot = await G.evaluate((id) => JSON.parse(localStorage.getItem('golfos.flightlines.v1.' + id) ?? '{}'), cid);
ok(!got['A#3'], 'not taken as his own');
ok(JSON.stringify(flightGot['A#3']) === JSON.stringify(L3), `Chris's phone took 3A from the flight (${JSON.stringify(flightGot['A#3'])})`);
ok(JSON.stringify(got['A#4']) === JSON.stringify(L4C), "Chris's own 4A stays");
// the map of 3A on Chris's phone draws Sascha's line: its tee where Sascha put it
const geo = await G.evaluate((id) => import('/src/lib/storage.ts').then((S) => S.loadGeometry(id).holes.find((h) => h.ref === '3' || h.ref === '3A')?.line?.[0] ?? null), cid);
ok(!!geo && Math.abs(geo[0] - L3[0][0]) < 1e-4, `Chris's map of 3A starts at Sascha's tee (${JSON.stringify(geo)})`);

ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
