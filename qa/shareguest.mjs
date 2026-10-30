// QA (Sascha 30.10.2026, the night run: "inviting must be very simple – not many taps and sign-ins"; "players join by
// QR or code, the host confirms; several at once: an overview, one by one or all at once; ideally a push"): Sascha sets
// up a social round alone and makes the code. Tom and Lisa have no account: they open the link, type their names,
// tap "Beitreten" – an account in the background – and wait. Sascha gets one overview, lets both in at once; their
// names go into his flight, and once he starts, both phones are in the round as themselves – no "who are you?". A
// third, Jan, is declined. Then the server before the SQL of 30.10.2026 (a code lets everyone in) and a server
// without anonymous accounts (Google is offered, the code kept for the way back). Supabase is simulated
// (qa/sharesim.mjs), the app is real.
// Usage: node qa/shareguest.mjs [url]
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

async function setup(phone, others = []) {
  const host = await phone('Sascha');
  const H = host.p;
  errs.push(host.errs);
  await H.getByRole('button', { name: 'Neue Runde' }).click();
  await H.waitForTimeout(1200);
  await H.fill('#course-search', 'Hetzenhof');
  await H.waitForTimeout(2000);
  await H.locator('button.list-item').first().click();
  await H.getByText('Runde starten').waitFor({ timeout: 30000 });
  await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
  await H.locator('input[id^="name-"]').first().fill('Sascha');
  await H.locator('input[id^="hcp-"]').first().fill('10');
  for (const o of others) {
    await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    await H.locator('input[id^="name-"]').last().fill(o);
  }
  const card = H.locator('.invite-card');
  await card.waitFor({ timeout: 10000 });
  ok((await card.getByRole('switch', { name: /Mit Zähler spielen/ }).getAttribute('aria-checked')) === 'false', 'setup: "Mit Zähler spielen" off by default – everyone keeps only his own');
  await card.getByRole('button', { name: 'Code erzeugen' }).click();
  await card.locator('.join-code').waitFor({ timeout: 8000 });
  return { H, code: (await card.locator('.join-code').innerText()).trim() };
}
async function guestAsks(phone, name, code) {
  const g = await phone(name, { guest: true });
  errs.push(g.errs);
  const G = g.p;
  await G.goto('about:blank');
  await G.goto(url + '#round=' + code);
  const sheet = G.getByRole('dialog', { name: 'Runde beitreten' });
  await sheet.waitFor({ timeout: 10000 });
  await sheet.getByLabel('Dein Name').fill(name);
  await sheet.getByRole('button', { name: 'Beitreten', exact: true }).click();
  return { G, sheet };
}

// ---------- two guests without an account, let in at once ----------
{
  const sim = sharedServer(b, url);
  const { H, code } = await setup(sim.phone);
  const tom = await guestAsks(sim.phone, 'Tom', code);
  await tom.sheet.getByText('Anfrage an den Gastgeber gesendet').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await tom.sheet.getByText('Anfrage an den Gastgeber gesendet').isVisible(), 'Tom, no account: name typed, "Beitreten" – asked the host (3 taps from the link)');
  const lisa = await guestAsks(sim.phone, 'Lisa', code);
  await lisa.sheet.getByText('Anfrage an den Gastgeber gesendet').waitFor({ timeout: 10000 }).catch(() => {});
  ok(sim.pushes.filter((x) => x.action === 'asked' && x.code === code).map((x) => x.from).sort().join() === 'Lisa,Tom', `push: the host hears of both (${sim.pushes.map((x) => x.from).join()})`);
  // Sascha: one notice for both – the overview
  const both = H.getByRole('alertdialog', { name: '2 möchten beitreten' });
  await both.waitFor({ timeout: 12000 }).catch(() => {});
  ok(await both.isVisible() && /Tom/.test(await both.innerText()) && /Lisa/.test(await both.innerText()), `Sascha: "${(await both.innerText().catch(() => '')).replace(/\s+/g, ' ')}"`);
  await both.getByRole('button', { name: 'Ansehen' }).click();
  const list = H.getByRole('dialog', { name: 'Beitrittsanfragen' });
  ok((await list.locator('.join-list-rows li').count()) === 2 && (await list.getByRole('button', { name: 'Tom zulassen' }).count()) === 1, 'Sascha: the overview – each one to let in or decline, or all');
  if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/join-overview.png' });
  await list.getByRole('button', { name: 'Alle zulassen' }).click();
  await H.waitForTimeout(800);
  ok((await H.getByRole('dialog', { name: 'Beitrittsanfragen' }).count()) === 0, 'Sascha: "Alle zulassen" – the overview closes');
  const names = await H.locator('input[id^="name-"]').evaluateAll((xs) => xs.map((x) => x.value));
  ok(names.join() === 'Sascha,Tom,Lisa', `Sascha's setup: both in his flight without typing (${names.join()})`);
  await tom.sheet.getByText('Du bist zugelassen').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await tom.sheet.getByText('Du bist zugelassen').isVisible().catch(() => false), 'Tom: "Du bist zugelassen – der Gastgeber trägt dich gleich ein"');
  if (process.env.SHOTS) await tom.G.screenshot({ path: process.env.SHOTS + '/join-guest-wait.png' });
  await H.getByRole('button', { name: 'Runde starten' }).click();
  await H.locator('.map-hole-no').waitFor({ timeout: 30000 });
  for (const [n, g] of [['Tom', tom], ['Lisa', lisa]]) {
    await g.G.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
    const r = await sim.round(g.G);
    ok(r?.players.find((p) => p.isMe)?.name === n && r.shared?.code === code, `${n}: in the round as himself – no "who are you?"`);
  }
  const acc = await tom.G.evaluate(() => JSON.parse(localStorage.getItem('golfos.auth.v1') ?? 'null'));
  ok(acc?.anonymous === true, 'Tom: an account without Google in the background');
  // Jan asks too – Sascha declines
  const jan = await guestAsks(sim.phone, 'Jan', code);
  const askJan = H.getByRole('alertdialog', { name: 'Jan möchte beitreten' });
  await askJan.waitFor({ timeout: 12000 }).catch(() => {});
  await askJan.getByRole('button', { name: 'Ablehnen' }).click();
  await jan.sheet.getByText('Der Gastgeber hat den Beitritt abgelehnt').waitFor({ timeout: 10000 }).catch(() => {});
  ok(await jan.sheet.getByText('Der Gastgeber hat den Beitritt abgelehnt').isVisible(), 'Jan: declined');
  ok(!sim.shared.get(code).members.includes('Jan'), 'server: Jan not in');
}

// ---------- the server before the SQL of 30.10.2026: the code lets in as before ----------
{
  const sim = sharedServer(b, url, { old: true });
  const { code } = await setup(sim.phone, ['Cedric']);
  const g = await sim.phone('Cedric');
  errs.push(g.errs);
  await g.p.goto('about:blank');
  await g.p.goto(url + '#round=' + code);
  await g.p.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
  ok((await sim.round(g.p))?.shared?.code === code, 'old server: Cedric in with the code at once – his name found, no asking');
}

// ---------- a server without accounts for guests: Google is offered, the code kept ----------
{
  const sim = sharedServer(b, url, { noAnonymous: true });
  const { code } = await setup(sim.phone);
  const g = await guestAsks(sim.phone, 'Tom', code);
  await g.sheet.getByRole('button', { name: 'Mit Google anmelden' }).waitFor({ timeout: 8000 }).catch(() => {});
  ok(await g.sheet.getByRole('button', { name: 'Mit Google anmelden' }).isVisible() && /Ohne Konto geht es gerade nicht/.test(await g.sheet.innerText()), 'no guest accounts: "Mit Google anmelden" – said why');
}

ok(errs.flat().length === 0, `no page errors ${errs.flat().slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
