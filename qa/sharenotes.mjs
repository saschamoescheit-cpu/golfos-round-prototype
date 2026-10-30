// QA (Sascha 30.10.2026, the night run – "make social rounds sturdy"): on the hole map, a marker's count that differs
// is said at once (not only at the end); a team's keeper whose phone went quiet for ten minutes (battery) – the card
// is offered to the team's other phone, one tap takes it over; a player invited by his GolfOS user name is in with the
// link without asking. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/sharenotes.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const errs = [];
const sim = sharedServer(b, url, { users: { 'cedric.m': 'Cedric', 'ben.k': 'Ben' } });

async function setup(players, o = {}) {
  const host = await sim.phone('Sascha');
  errs.push(host.errs);
  const H = host.p;
  await H.getByRole('button', { name: 'Neue Runde' }).click();
  await H.waitForTimeout(1200);
  await H.fill('#course-search', 'Hetzenhof');
  await H.waitForTimeout(2000);
  await H.locator('button.list-item').first().click();
  await H.getByText('Runde starten').waitFor({ timeout: 30000 });
  await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
  await H.locator('input[id^="name-"]').first().fill('Sascha');
  await H.locator('input[id^="hcp-"]').first().fill('10');
  for (const n of players) {
    await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    await H.locator('input[id^="name-"]').last().fill(n);
  }
  if (o.mode) {
    await H.locator('.settings-row').filter({ hasText: 'Modus' }).click();
    await H.locator('.pick-option strong').getByText(o.mode, { exact: true }).click();
  }
  const card = H.locator('.invite-card');
  await card.waitFor({ timeout: 10000 });
  if (o.marker) await card.getByRole('switch', { name: /Mit Zähler spielen/ }).click();
  await card.getByRole('button', { name: 'Code erzeugen' }).click();
  await card.locator('.join-code').waitFor({ timeout: 8000 });
  return { host, H, card, code: (await card.locator('.join-code').innerText()).trim() };
}
async function join(name, code, H) {
  const g = await sim.phone(name);
  errs.push(g.errs);
  await g.p.goto('about:blank');
  await g.p.goto(url + '#round=' + code);
  if (H) {
    const ask = H.getByRole('alertdialog', { name: `${name} möchte beitreten` });
    await ask.waitFor({ timeout: 15000 });
    await ask.getByRole('button', { name: 'Zulassen' }).click();
  }
  await g.p.locator('.map-hole-no').waitFor({ timeout: 30000 });
  return g;
}
const block = (p, name) => p.locator('.score-player').filter({ has: p.locator('.score-player-head strong', { hasText: new RegExp(`^${name}$`) }) });
const plus = async (p, name, n) => {
  for (let k = 0; k < n; k++) await block(p, name).getByRole('button', { name: /Schläge plus eins/ }).click();
};

// ---------- with a marker: a count that differs is said on the map at once ----------
{
  const { H, code } = await setup(['Cedric'], { marker: true });
  const G = (await join('Cedric', code, H)).p;
  await H.getByRole('button', { name: 'Runde starten' }).click();
  await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
  await H.waitForTimeout(6000);
  // Sascha: himself 4, Cedric 5 – Cedric: himself 6, Sascha 4
  await H.locator('.map-score').click();
  await plus(H, 'Sascha', 1);
  await plus(H, 'Cedric', 2);
  await H.getByRole('button', { name: 'Zurück zur Karte' }).click();
  await G.locator('.map-score').click();
  await plus(G, 'Cedric', 3);
  await plus(G, 'Sascha', 1);
  await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
  const note = H.locator('.share-note');
  await note.waitFor({ timeout: 20000 }).catch(() => {});
  const text = (await note.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(/Loch 1A: Die Zählung bei Cedric weicht ab \(6 \/ 5\)/.test(text), `Sascha's map: "${text}"`);
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/note-differs.png' });
}

// ---------- scramble: the keeper's phone quiet for ten minutes – the other phone takes the card ----------
{
  const { host, H, code } = await setup(['Cedric'], { mode: 'Scramble' });
  const G = (await join('Cedric', code, H)).p;
  await H.getByRole('button', { name: 'Runde starten' }).click();
  await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
  await H.waitForTimeout(6000);
  // Sascha's battery is empty: his phone gone, last heard of 12 minutes ago
  await host.p.context().close();
  const f = Object.values(sim.shared.get(code).game.flights)[0];
  const keeper = Object.entries(f.phones).find(([, v]) => v.name === 'Sascha')[0];
  f.phones[keeper] = { ...f.phones[keeper], at: new Date(Date.now() - 12 * 60000).toISOString(), seen: new Date(Date.now() - 12 * 60000).toISOString() };
  sim.shared.get(code).updated_at = new Date().toISOString();
  const note = G.locator('.share-note');
  await note.waitFor({ timeout: 20000 }).catch(() => {});
  const text = (await note.innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok(/Das Handy von Sascha meldet sich seit 12 Min\. nicht – Scorecard übernehmen\?/.test(text), `Cedric's map: "${text}"`);
  if (process.env.SHOTS) await G.screenshot({ path: process.env.SHOTS + '/note-quiet.png' });
  await note.getByRole('button', { name: 'Übernehmen' }).click();
  await G.waitForTimeout(2500);
  await G.locator('.map-score').click();
  await G.waitForTimeout(300);
  ok((await G.locator('.score-player.kept-elsewhere').count()) === 0 && (await G.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ }).count()) === 1, 'Cedric: one tap – he keeps the card now');
}

// ---------- invited by user name: in with the link, no asking ----------
{
  const { H, card, code } = await setup(['Ben']);
  await card.getByLabel('Oder per GolfOS-Benutzername einladen').fill('ben.k');
  await card.getByRole('button', { name: 'Einladen', exact: true }).click();
  await card.getByText('Eingeladen – ben.k bekommt eine Mitteilung').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await card.getByText('Eingeladen – ben.k bekommt eine Mitteilung').isVisible(), 'Sascha: "Eingeladen – ben.k bekommt eine Mitteilung …"');
  ok(sim.shared.get(code).members.includes('Ben'), 'server: Ben let in by the invitation');
  await card.getByLabel('Oder per GolfOS-Benutzername einladen').fill('nobody');
  await card.getByRole('button', { name: 'Einladen', exact: true }).click();
  await card.getByText('Kein GolfOS-Konto').waitFor({ timeout: 8000 }).catch(() => {});
  ok(await card.getByText('Kein GolfOS-Konto mit dem Benutzernamen „nobody“').isVisible(), 'Sascha: an unknown user name is said');
  const g = await join('Ben', code); // no host prompt
  ok((await sim.round(g.p))?.players.find((p) => p.isMe)?.name === 'Ben' && (await H.getByRole('alertdialog').count()) === 0, 'Ben: the link – in the round at once, Sascha not asked');
}

ok(errs.flat().length === 0, `no page errors ${errs.flat().slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
