// QA (Sascha 17./18.11.2026: "Nach heute ist die offizielle Turnierserie beendet. Es gab aber keine Meldung in der Inbox.
// Das Turnier sollte auch als abgeschlossen dargestellt werden"): three rounds, every flight in – Thomas's card in round 2
// empty (as Moritz's on the Oaks 12.11.): the series is over all the same ("zählt nicht für ihn"). The list says
// "beendet", the board "Endstand", the inbox "USA-Serie ist beendet · Endstand: Platz 1 von 4"; the final standing
// "Alle Runden zuerst": Thomas (+0, the best) on 2 rounds after the three on 3.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/seriesend.mjs [url]   (SHOTS=dir)
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.env.SHOTS;
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const txt = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');
const sim = sharedServer(b, url);
const { shared } = sim;
const host = await sim.phone('Sascha');
const H = host.p;
const days = await H.evaluate(() => {
  const d = (n) => {
    const x = new Date(Date.now() + n * 864e5);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { r1: d(-3), r2: d(-2), r3: d(-1) };
});
const three = [{ name: 'Sascha', playingHandicap: 5 }, { name: 'Chris', playingHandicap: 0 }, { name: 'Cedric', playingHandicap: 10 }];
const gross = { mode: 'single', scoring: 'stroke', allowance: 0 };
const t1 = await sim.plan(H, { name: 'Celebration', date: days.r1, flights: [{ teeTime: '10:00', players: [...three, { name: 'Thomas', playingHandicap: 8 }] }], format: gross });
const t2 = await sim.plan(H, { name: 'Hawks Landing', date: days.r2, flights: [{ teeTime: '10:00', players: [...three, { name: 'Thomas', playingHandicap: 8 }] }], format: gross });
const t3 = await sim.plan(H, { name: 'Legends', date: days.r3, flights: [{ teeTime: '10:00', players: [...three, { name: 'Thomas', playingHandicap: 8 }] }], format: gross });
const series = sim.series('Sascha', 'USA-Serie', [t1, t2, t3]);
for (const t of [t1, t2, t3]) shared.get(t).game.series = { code: series, name: 'USA-Serie' };
shared.get(series).game.prizes = { prize: { kind: 'money', currency: 'USD' }, fee: 50, amounts: { gross1: 100 } };
const put = (code, over) => {
  const ev = shared.get(code).game;
  for (const [, row] of [...shared.entries()].filter(([, r]) => r.event_code === code)) {
    const f = row.game.flight;
    const scores = Object.fromEntries(f.players.map((p) => [p.id, over[p.name] === null ? ev.holes.map(() => null) : ev.holes.map((h, i) => ({ s: h.par + (i < (over[p.name] ?? 0) ? 1 : 0) }))]));
    row.game = { kind: 'round-flight', flight: { ...f, scores, finishedAt: new Date().toISOString() } };
    row.updated_at = new Date().toISOString();
  }
};
put(t1, { Sascha: 0, Chris: 2, Cedric: 4, Thomas: 0 });
put(t2, { Sascha: 1, Chris: 2, Cedric: 3, Thomas: null });
put(t3, { Thomas: 0, Sascha: 1, Chris: 3, Cedric: 5 });
await H.evaluate((codes) => {
  const at = new Date().toISOString();
  const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
  for (const code of codes) rs.push({ id: 'r-' + code, courseName: 'Hetzenhof', createdAt: at, finishedAt: at, holes: [], players: [{ id: 'me', name: 'Sascha', isMe: true }], entries: { me: [] }, capture: 'full', loopOrder: ['A'], courseId: 'x', kind: 'tournament', shared: { code, flight: 'f1', phone: 'ph', base: {} } });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
}, [t1, t2, t3]);

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'tournaments'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2500);
await H.getByRole('button', { name: 'Turniere' }).first().click().catch(() => {});
await H.waitForTimeout(1200);

// 1. the list: the seal "beendet" between date and name, as on the rounds (Sascha 18.11.2026: "überall einheitlich")
const item = H.locator('.list-item').filter({ hasText: 'USA-Serie' }).first();
await item.waitFor();
ok((await item.locator('.list-mark [role="img"][aria-label="beendet"]').count()) === 1 && !/beendet/.test(await txt(item)), `the list: the mark "beendet", no word (${await txt(item)})`);
if (shots) await H.screenshot({ path: `${shots}/seriesend-list.png` });
await item.click();
await H.waitForTimeout(2500);

// 2. the board: "Endstand", no LIVE; the three on 3 rounds before Thomas on 2
const total = H.getByRole('region', { name: 'Gesamtwertung' });
const head = await txt(total.locator('.tour-live-head'));
ok(/Endstand · alle Runden/i.test(head) && !/\bLIVE\b/.test(head.replace(/endstand · alle runden/i, '')), `"Endstand · alle Runden", no LIVE (${head})`);
const lines = (await total.locator('.series-lb li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(lines.length === 4 && /^1 Sascha/.test(lines[0]) && /^4 Thomas auf 2 Runden/.test(lines[3]), `all rounds first: Thomas 4th on 2 rounds (${lines.join(' | ')})`);
ok(!/Live ab/.test(await txt(total)), 'no "Live ab …"');
if (shots) await total.screenshot({ path: `${shots}/seriesend-board.png` });

// 3. the inbox (the bell of the module's tabs): "USA-Serie ist beendet" with the final standing
await H.goto(url);
await H.waitForTimeout(2500);
await H.getByRole('button', { name: /^Inbox/ }).first().click();
await H.waitForTimeout(800);
const inbox = await txt(H.getByRole('dialog').first());
ok(/USA-Serie ist beendet/.test(inbox) && /Endstand: Platz 1 von 4 · \+2/.test(inbox), `the inbox: "USA-Serie ist beendet · Endstand: Platz 1 von 4 · +2" (${inbox.slice(0, 300)})`);
if (shots) await H.screenshot({ path: `${shots}/seriesend-inbox.png` });
await H.getByRole('dialog').first().getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});

// 4. Bilanz (Sascha 18.11.2026, Bilanz-Mockup): the series as its own card, its amounts with each player ("· Serie")
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2000);
await H.locator('.tabbar button').filter({ hasText: 'Bilanz' }).click();
await H.waitForTimeout(1200);
const sc = H.locator('.balance-series').first();
const sct = await txt(sc);
ok(/Turnierserie/i.test(sct) && /USA-Serie/.test(sct) && /beendet/.test(sct) && /Platz 1 von 4/.test(sct), `Bilanz: the series' card (${sct})`);
const people = (await H.locator('.balance-people li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
ok(people.some((x) => /^Chris .*Serie/.test(x)), `Bilanz: Chris "· Serie" (${people.join(' | ')})`);
if (shots) await H.screenshot({ path: `${shots}/seriesend-bilanz.png`, fullPage: true });

// 5. Chris pays in Bilanz on his phone (simulated): Sascha confirms it in the inbox – counted once confirmed
shared.get(series).game.payments = [{ id: 'pay-c', from: 'Chris', to: 'Sascha', amount: 50, paidAt: new Date().toISOString() }];
shared.get(series).updated_at = new Date().toISOString();
await H.evaluate(async () => (await import('/src/lib/tourstore.ts')).syncTours());
await H.waitForTimeout(1200);
await H.getByRole('button', { name: /^Inbox/ }).first().click();
await H.waitForTimeout(800);
const box = H.getByRole('dialog').first();
ok(/Chris hat 50 \$ als bezahlt markiert/.test(await txt(box)), `the inbox: "Chris hat 50 $ als bezahlt markiert · USA-Serie · Erhalt bestätigen" (${(await txt(box)).slice(0, 300)})`);
await box.getByRole('button', { name: /50 \$ von Chris erhalten/ }).click().catch(() => {});
await H.waitForTimeout(1500);
ok(!!shared.get(series).game.payments?.find((x) => x.id === 'pay-c')?.receivedAt, 'confirmed: "Erhalten" on the server');
await box.getByRole('button', { name: 'Schließen' }).first().click().catch(() => {});

// 6. Mein Golf (Mockup B): wins, tournaments, the average round – and the series with its place
await H.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
await H.goto('about:blank');
await H.goto(url);
await H.waitForTimeout(2000);
await H.locator('.tabbar button').filter({ hasText: 'Mein Golf' }).click();
await H.waitForTimeout(1200);
const my = H.locator('.my-tours');
const myt = await txt(my);
ok(/1 Sieg/.test(myt) && /1 Turnier/.test(myt) && /Ø Turnierrunde/.test(myt), `Mein Golf: "1 Sieg · 1 Turnier · Ø Turnierrunde" (${myt.slice(0, 160)})`);
ok(/USA-Serie Serie · 3 Runden · \+2 1\. von 4/.test(myt), `Mein Golf: "USA-Serie · Serie · 3 Runden · +2 · 1. von 4" (${myt.slice(0, 220)})`);
if (shots) await my.screenshot({ path: `${shots}/seriesend-meingolf.png` });
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 3).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
