// QA (Sascha 17.11.2026, "Automatisch einladen" – Thomas and Daniel were put into the Legends rounds of the series and
// heard nothing; "Die Nachricht in die Inbox sollten Daniel und Thomas auf jeden Fall dann noch nachträglich erhalten"):
// 1 · plans saved before (no invitation went): the host opens the app – Thomas, a linked friend, gets the invitation to
//     today's round and to yesterday's (his card still to sign) – inbox + push; not to a round he is not in; Daniel, a
//     typed name, none – the host's tournament page says "Noch nicht eingeladen: Daniel" above the invitation
// 2 · opened again: nobody asked twice
// 3 · Thomas: the inbox "Sascha lädt dich zu einer Runde ein"; the start page "Turnier heute" – "Teilnehmen" puts him in
//     his flight
// 4 · a new plan with Thomas: invited at once; Thomas taken out before he answered: the invitation withdrawn
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/planinvite.mjs [url]
import { webkit } from 'playwright';
import { sharedServer, teeSoon } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const sim = sharedServer(b, url);
const card = (uid, first) => ({ user_id: uid, code: String(318400 + sim.cards.size), first_name: first, last_name: '', hcp_index: '17', home_club: '', photo: null });
sim.cards.set('Sascha', card('Sascha', 'Sascha'));
sim.cards.set('Thomas', card('Thomas', 'Thomas'));
sim.links.add('Sascha|Thomas').add('Thomas|Sascha');
const host = await sim.phone('Sascha');
const H = host.p;
// Sascha's friends: Thomas linked (his account), Daniel typed
const setFriends = (p) => p.evaluate(() => localStorage.setItem('golfos.friends.v1', JSON.stringify([{ id: 'f1', name: 'Thomas', hcp: '17', uid: 'Thomas' }, { id: 'f2', name: 'Daniel', hcp: '20' }])));
await setFriends(H);
const day = (d) => H.evaluate((d) => { const x = new Date(Date.now() + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }, d);
const T1 = teeSoon(30);
const legends = (name, date, withThomas = true) => ({ name, date, format: { mode: 'single', scoring: 'stroke', allowance: 0 }, flights: [{ teeTime: T1, players: [{ name: 'Sascha', playingHandicap: 7 }, ...(withThomas ? [{ name: 'Thomas', playingHandicap: 17 }] : [{ name: 'Erik', playingHandicap: 12 }])] }, { teeTime: T1, players: [{ name: 'Daniel', playingHandicap: 20 }, { name: 'Cedric', playingHandicap: 5 }] }] });
// the plans as they were saved before the change – straight onto the server, no invitation
const r7 = await sim.plan(H, legends('Legends R7', await day(-1)));
const r8 = await sim.plan(H, legends('Legends R8', await day(0)));
const other = await sim.plan(H, legends('Hawks R9', await day(0), false));
const invites = (code, uid = 'Thomas') => sim.pushes.filter((x) => x.action === 'invite' && x.friend === uid && x.code === code).length;
ok([r7, r8, other].every((c) => invites(c) === 0 && !sim.shared.get(c).members.includes('Thomas')), 'before: the old plans – nobody invited');
// on the host's phone as the app before kept them (its tournaments list) – nothing else done
await H.evaluate(async (codes) => {
  const sr = await import('/src/lib/sharedround.ts');
  const ts = await import('/src/lib/tourstore.ts');
  for (const c of codes) ts.keepTour(c, sr.cachedEvent(c), 'Sascha');
}, [r7, r8, other]);
await H.waitForTimeout(500);
ok([r7, r8, other].every((c) => invites(c) === 0), "kept on the host's phone: still nobody invited");

// 1 · the host opens the app
await H.reload();
await H.waitForTimeout(14000);
ok(invites(r8) === 1 && sim.shared.get(r8).members.includes('Thomas') && !!sim.shared.get(r8).requests.Thomas?.invited, `today's round: Thomas invited – a push, in the inbox (${invites(r8)})`);
ok(invites(r7) === 1, `yesterday's round, his card still to sign: invited too (${invites(r7)})`);
ok(invites(other) === 0 && !sim.shared.get(other).members.includes('Thomas'), 'a round he is not in: no invitation');
ok(!sim.pushes.some((x) => x.action === 'invite' && /daniel/i.test(String(x.friend ?? x.name ?? x.username ?? ''))), 'Daniel, a typed name: no invitation sent');

// 2 · opened again: nobody asked twice
await H.reload();
await H.waitForTimeout(12000);
ok(invites(r8) === 1 && invites(r7) === 1, `opened again: still one invitation each (${invites(r8)}, ${invites(r7)})`);

// the host's tournament page: who still needs the code
await H.evaluate((c) => import('/src/lib/nav.ts').then((m) => m.goTour(c)), r8);
const hint = H.locator('.tour-uninvited');
await hint.waitFor({ timeout: 15000 }).catch(() => {});
const ht = (await hint.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Noch nicht eingeladen/.test(ht) && /Daniel/.test(ht) && !/Thomas/.test(ht), `the host: "Noch nicht eingeladen: …" without Thomas, with Daniel (${ht})`);
ok((await H.locator('.tour-invite .join-code').count()) === 1, 'the invitation block (QR · code · link · friends) under it');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/planinvite-host.png' });

// 3 · Thomas: the inbox, then "Turnier heute"
const guest = await sim.phone('Thomas');
const G = guest.p;
await G.evaluate(() => sessionStorage.removeItem('golfos.module'));
await G.reload();
await G.waitForTimeout(5000);
const count = (await G.locator('.bell-count').first().innerText().catch(() => '')).trim();
ok(Number(count) >= 1, `Thomas: the bell shows the invitation (${count})`);
await G.locator('.bell-btn').first().click();
await G.waitForTimeout(800);
const inbox = (await G.locator('.sheet').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Sascha lädt dich zu einer Runde ein/.test(inbox), `his inbox: "Sascha lädt dich zu einer Runde ein" (${inbox.slice(0, 140)})`);
await G.keyboard.press('Escape').catch(() => {});
await G.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
await G.reload();
const tcard = G.getByRole('region', { name: 'Turnier Legends R8' });
await tcard.waitFor({ timeout: 15000 }).catch(() => {});
ok(new RegExp(`Dein Flight · ${T1}`).test((await tcard.innerText().catch(() => '')).replace(/\s+/g, ' ')), `his start page: "Turnier heute" – Legends R8, his flight ${T1}`);
await tcard.getByRole('button', { name: 'Teilnehmen' }).click().catch(() => {});
await G.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
const gr = await sim.round(G).catch(() => null);
ok(gr?.shared?.code === r8 && gr.players.find((p) => p.isMe)?.name === 'Thomas', `"Teilnehmen": Thomas in his flight of Legends R8 (${gr?.shared?.code})`);

// 4 · a new plan with Thomas: invited at once – and taken out before he answered: withdrawn
const H2 = (await sim.phone('Sascha')).p;
await setFriends(H2);
const code = await H2.evaluate(async ({ date, T1 }) => {
  const sr = await import('/src/lib/sharedround.ts');
  const ts = await import('/src/lib/tourstore.ts');
  const { searchBundled, loadCourse } = await import('/src/lib/courses.ts');
  const { loopOptions, buildRoundHoles } = await import('/src/lib/loops.ts');
  const summary = searchBundled('Hetzenhof')[0];
  const course = await loadCourse(summary);
  const opt = loopOptions(course.holes)[0];
  const ev = sr.plannedEvent({ name: 'Legends R10', date, course: summary, holes: buildRoundHoles(course.holes, opt), loopOrder: opt.loops, format: { mode: 'single', scoring: 'stroke', allowance: 0 }, flights: [{ teeTime: T1, players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Thomas', playingHandicap: 17 }] }] });
  return ts.createTour(ev);
}, { date: await day(2), T1 });
await H2.waitForTimeout(4000);
ok(!!code && invites(code) === 1 && sim.shared.get(code).members.includes('Thomas'), `a new plan with Thomas: invited at once (${invites(code)})`);
await H2.evaluate(async (code) => {
  const ts = await import('/src/lib/tourstore.ts');
  const ev = structuredClone(await (await import('/src/lib/sharedround.ts')).refreshEvent(code));
  for (const f of Object.values(ev.flights)) f.players = f.players.filter((p) => p.name !== 'Thomas');
  await ts.changeTour(code, ev, { quiet: true });
}, code);
await H2.waitForTimeout(4000);
ok(!sim.shared.get(code).members.includes('Thomas') && !sim.shared.get(code).requests.Thomas, 'Thomas taken out before he answered: the invitation withdrawn');
await H2.evaluate(async (code) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.changeTour(code, await (await import('/src/lib/sharedround.ts')).refreshEvent(code), { quiet: true });
}, code);
await H2.waitForTimeout(2500);
ok(invites(code) === 1, 'saved again without him: no new invitation');
// joined already: taken out of the plan, he stays in (nothing of his taken away) – his phone put away first
const gErrs = [...guest.errs];
await G.close();
await H.evaluate(async (code) => {
  const ts = await import('/src/lib/tourstore.ts');
  await ts.syncTours();
  const ev = structuredClone(await (await import('/src/lib/sharedround.ts')).refreshEvent(code));
  for (const f of Object.values(ev.flights)) f.players = f.players.filter((p) => p.name !== 'Thomas');
  await ts.changeTour(code, ev, { quiet: true });
}, r8).catch(() => {});
await H.waitForTimeout(4000);
ok(sim.shared.get(r8).members.includes('Thomas'), 'joined already and then taken out: he stays in – nothing of his taken away');

ok(host.errs.length === 0 && gErrs.length === 0, `no page errors ${[...host.errs, ...gErrs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
