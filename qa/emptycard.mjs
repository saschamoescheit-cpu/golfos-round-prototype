// QA (Sascha 16.11.2026: Moritz played the Oaks on 12.11. – "Ja, Scores fehlen": his card on the server empty, the bets
// count him, nobody noticed): a finished flight with a player without one score – the host's inbox says "Karte von Cedric
// ist leer · … Scores nachtragen"; once his scores are in, gone. Not for a player with scores, not on a guest's phone.
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/emptycard.mjs [url]
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
const code = await sim.plan(H, { name: 'Oaks-Cup', option: 'Kurzplatz', format: { mode: 'single', scoring: 'stroke' }, flights: [{ players: [{ name: 'Sascha', playingHandicap: 5, tee: 'Yellow' }, { name: 'Cedric', playingHandicap: 10, tee: 'Yellow' }] }] });
await sim.joinPlanned(H, code);
await H.waitForTimeout(3000);
// in his tournaments (as one set up in Tournaments), his account the owner
{
  const row = sim.shared.get(code);
  const r = await H.evaluate(async ({ code, ev, owner }) => {
    const ts = await import('/src/lib/tourstore.ts');
    ts.keepTour(code, { ...ev, planned: true }, owner);
    return ts.loadTours().map((t) => [t.code, ts.isTourHost(t)]);
  }, { code, ev: row.game, owner: row.owner });
  ok(r.some(([c, h]) => c === code && h), `the tournament his – he is its host (${JSON.stringify(r)})`);
}
// played: Sascha's card full, Cedric's empty, the flight finished
// a tournament's flight is a row of its own on the server (event_code) – its scores there
const fill = (who, v) => {
  const ev = sim.shared.get(code).game;
  const rows = [...sim.shared.values()].filter((r) => r.event_code === code && r.game.flight);
  for (const f of [...rows.map((r) => r.game.flight), ...Object.values(ev.flights)]) {
    const pid = f.players.find((p) => p.name === who)?.id;
    if (!pid) continue;
    f.scores = { ...(f.scores ?? {}), [pid]: ev.holes.map(() => (v == null ? null : { s: v })) };
    f.finishedAt = new Date().toISOString();
  }
  const at = new Date().toISOString();
  for (const r of [sim.shared.get(code), ...rows]) r.updated_at = at;
};
fill('Sascha', 3);
fill('Cedric', null);
const inboxRows = async () => {
  await H.goto('about:blank');
  await H.goto(url);
  await H.waitForTimeout(1500);
  // his round over (as after the round), Tournaments read fresh (the server's flights), then the start page with the inbox
  await H.evaluate(() => {
    const rs = JSON.parse(localStorage.getItem('golfos.rounds.v1') ?? '[]');
    for (const r of rs) if (r.shared) r.finishedAt = r.finishedAt ?? new Date().toISOString();
    localStorage.setItem('golfos.rounds.v1', JSON.stringify(rs));
  });
  await H.goto('about:blank');
  await H.goto(`${url}#tour=${code}`);
  await H.waitForTimeout(3500);
  await H.evaluate(() => sessionStorage.removeItem('golfos.module'));
  await H.reload();
  await H.waitForTimeout(2000);
  if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/emptycard-home.png` });
  await H.locator('.bell-btn').first().click({ timeout: 8000 });
  const inbox = H.getByRole('dialog', { name: 'Inbox' });
  await inbox.waitFor({ timeout: 5000 }).catch(() => {});
  await H.waitForTimeout(800);
  const t = (await inbox.innerText().catch(() => '')).replace(/\s+/g, ' ');
  await H.keyboard.press('Escape').catch(() => {});
  return t;
};
const t1 = await inboxRows();
ok(/Karte von Cedric ist leer/.test(t1) && /Oaks-Cup · Scores nachtragen/.test(t1), `the host's inbox: "Karte von Cedric ist leer · Oaks-Cup · Scores nachtragen" (${t1.slice(0, 160)})`);
ok(!/Karte von Sascha ist leer/.test(t1), 'not for Sascha, whose card is full');
if (process.env.SHOTS) await H.screenshot({ path: `${process.env.SHOTS}/emptycard.png` });
fill('Cedric', 4);
const t2 = await inboxRows();
ok(!/Karte von Cedric ist leer/.test(t2), `his scores in: gone (${t2.slice(0, 120)})`);
// Cedric's phone (not the host): never
const guest = await sim.phone('Cedric');
await sim.joinPlanned(guest.p, code).catch(() => {});
fill('Cedric', null);
await guest.p.goto('about:blank');
await guest.p.goto(url);
await guest.p.waitForTimeout(2500);
await guest.p.locator('.bell-btn').first().click().catch(() => {});
await guest.p.waitForTimeout(1000);
ok(!/ist leer/.test(await guest.p.getByRole('dialog', { name: 'Inbox' }).innerText().catch(() => '')), 'not on a guest\'s phone');
ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
