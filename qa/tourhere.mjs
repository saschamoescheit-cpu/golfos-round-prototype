// QA (Sascha 17.11.2026, Legends: Thomas and Daniel only in the series' rounds of 16. and 17.11. – Thomas's phone played a
// round of its own, "Legends … · 16.11.", Live · the phones of the flight, par on 1–7; the scores Sascha entered never
// reached it. "ja, die App sollte in diesem Fall warnen"):
// 1 · a series guest, the app new on his phone (no account, nothing on it): the series' link, his name – "Heute
//     teilnehmen" – he plays today's round in Sascha's flight and sees what Sascha entered for him
// 2 · Thomas, in today's tournament: "Neue Runde" on its course warns before the start – "Turnier beitreten" takes him
//     into his flight (no round of his own); in Games a pool's "Runde starten" warns the same
// 3 · Daniel, in no tournament: no warning
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/tourhere.mjs [url]
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
const host = await sim.phone('Sascha');
const H = host.p;
const T1 = teeSoon(20);
// today's round of the series: Sascha keeps the cards of his flight (Thomas a guest of this round only), tomorrow's without him
const r1 = await sim.plan(H, { name: 'Legends R7', format: { mode: 'single', scoring: 'stroke', allowance: 0 }, flights: [{ teeTime: T1, players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Thomas', playingHandicap: 17 }], scorer: 'p1' }, { teeTime: T1, players: [{ name: 'Erik', playingHandicap: 12 }, { name: 'Cedric', playingHandicap: 5 }] }] });
const tomorrow = await H.evaluate(() => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const r2 = await sim.plan(H, { name: 'Legends R8', date: tomorrow, flights: [{ players: [{ name: 'Sascha', playingHandicap: 7 }, { name: 'Erik', playingHandicap: 12 }] }] });
const series = sim.series('Sascha', 'Orlando', [r1, r2]);
await sim.joinPlanned(H, r1);
await H.waitForTimeout(2500);
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
await H.locator('.map-score').click();
await H.waitForTimeout(700);
for (const [name, n] of [['Sascha', 2], ['Thomas', 3]]) for (let k = 0; k < n; k++) {
  await block(H, name).getByRole('button', { name: /Schläge plus eins/ }).click();
  await H.waitForTimeout(150);
}
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
await H.waitForTimeout(7000);
const par1 = (await sim.round(H)).holes[0].par;
const f1 = () => Object.values(sim.event().flights).find((f) => f.players.some((p) => p.name === 'Thomas'));
ok(f1().scores.p2[0]?.s === par1 + 2, `server: Sascha entered hole 1 for Thomas (${f1().scores.p2[0]?.s})`);

// 1 · the guest, new: the series' link, his name, "Heute teilnehmen"
const guest = await sim.phone('Thomas', { guest: true });
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + series);
const sheet = G.getByRole('dialog', { name: 'Runde beitreten' });
await sheet.waitFor({ timeout: 10000 });
await sheet.getByLabel('Dein Name').fill('Thomas');
await sheet.getByRole('button', { name: 'Beitreten', exact: true }).click();
const box = G.getByRole('status', { name: 'Serie' });
await box.waitFor({ timeout: 15000 }).catch(() => {});
ok(await box.getByRole('button', { name: 'Heute teilnehmen' }).isVisible().catch(() => false), 'the guest: the series, "Heute teilnehmen" for today\'s round');
await box.getByRole('button', { name: 'Heute teilnehmen' }).click().catch(() => {});
await G.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
await G.waitForTimeout(6000);
const gr = await sim.round(G);
ok(gr?.shared?.code === r1 && gr.shared.tournament === true, `the guest plays today's round of the series, a tournament (${gr?.shared?.code} / ${r1})`);
ok(gr?.players.map((p) => p.name).join() === 'Sascha,Thomas' && gr.players.find((p) => p.isMe)?.name === 'Thomas', `in Sascha's flight as Thomas (${gr?.players.map((p) => p.name)})`);
ok(gr?.entries.p2?.[0]?.strokes === par1 + 2 && gr?.entries.p1?.[0]?.strokes === par1 + 1, `hole 1 as Sascha entered it (${gr?.entries.p1?.[0]?.strokes} / ${gr?.entries.p2?.[0]?.strokes})`);
ok(sim.shared.get(r1).members.length > 0 && [...sim.shared.values()].filter((r) => !r.event_code && r.game.kind === 'round-event').length === 2, 'no round-event of his own on the server – only the series\' two rounds');

// 2 · Thomas on a second phone of his (signed in, nothing on it), in the tournament: "Neue Runde" on its course
const tom = await sim.phone('Thomas');
const T = tom.p;
sim.shared.get(r1).members.push('Thomas');
await T.reload();
await T.waitForTimeout(1500);
await T.getByRole('button', { name: 'Neue Runde' }).click();
await T.waitForTimeout(1200);
await T.fill('#course-search', 'Hetzenhof');
await T.waitForTimeout(2000);
await T.locator('button.list-item').first().click();
await T.getByText('Runde starten').first().waitFor({ timeout: 30000 });
const warn = T.getByRole('status', { name: 'Turnier heute auf diesem Platz' });
await warn.waitFor({ timeout: 15000 }).catch(() => {});
const wt = (await warn.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Legends R7/.test(wt) && wt.includes(`dein Flight ${T1}`) && /eigene Runde/.test(wt), `setup: the warning – the tournament, his flight, "eine eigene Runde" (${wt.slice(0, 160)})`);
const join = warn.getByRole('button', { name: 'Turnier beitreten' });
ok((await join.getAttribute('class'))?.includes('btn-primary') && (await join.locator('svg').count()) === 1, 'its button: the app\'s primary button with an icon');
const bg = await warn.evaluate((el) => getComputedStyle(el).backgroundColor);
ok(!/rgb\(2[0-9]{2}, 2[0-9]{2}, [0-9]{1,2}\)/.test(bg), `the notice green, not yellow (${bg})`);
if (process.env.SHOTS) await T.screenshot({ path: process.env.SHOTS + '/tourhere-setup.png' });
await join.click();
await T.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
await T.waitForTimeout(5000);
const tr = await sim.round(T);
ok(tr?.shared?.code === r1 && tr.players.find((p) => p.isMe)?.id === 'p2', `"Turnier beitreten": in his flight of the tournament, not a round of his own (${tr?.shared?.code})`);
ok(tr?.entries.p1?.[0]?.strokes === par1 + 1, "Sascha's hole 1 on it");

// 3 · Daniel, in no tournament: no warning
const dan = await sim.phone('Daniel');
const D = dan.p;
await D.getByRole('button', { name: 'Neue Runde' }).click();
await D.waitForTimeout(1200);
await D.fill('#course-search', 'Hetzenhof');
await D.waitForTimeout(2000);
await D.locator('button.list-item').first().click();
await D.getByText('Runde starten').first().waitFor({ timeout: 30000 });
await D.waitForTimeout(3000);
ok((await D.locator('.tour-here').count()) === 0, 'Daniel, in no tournament today: no warning');

ok(host.errs.length === 0 && guest.errs.length === 0 && tom.errs.length === 0 && dan.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs, ...tom.errs, ...dan.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
