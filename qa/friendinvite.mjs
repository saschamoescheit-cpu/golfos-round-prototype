// QA (Sascha 03.11.2026: "a linked friend invited to a round with one click – a push, or better a request right in the
// app when it is open, so he joins straight away"; "everyone has his own score on top when entering"): Sascha and Cedric
// are friends by their accounts. Sascha sets up a round with Cedric, "Cedric einladen" in the invitation – the server
// lets him in and pushes; Cedric's open app asks "Sascha lädt dich zu seiner Runde ein", "Beitreten" – in the round at
// once, no asking the host; his score panel shows his own score on top. Then the function from before (no friends):
// the host's phone lets the friend in itself. Supabase is simulated (qa/sharesim.mjs), the app is real.
// Usage: node qa/friendinvite.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};

async function run(o) {
  const sim = sharedServer(b, url, o);
  const { cards, links, shared, pushes, phone, round } = sim;
  // friends by their accounts (as after an accepted invitation)
  const card = (uid, first, hcp) => ({ user_id: uid, code: String(318400 + cards.size), first_name: first, last_name: '', hcp_index: hcp, home_club: '', photo: null });
  cards.set('Sascha', card('Sascha', 'Sascha', '10'));
  cards.set('Cedric', card('Cedric', 'Cedric', '13'));
  cards.set('Chris', card('Chris', 'Chris', '20'));
  links.add('Sascha|Cedric').add('Cedric|Sascha').add('Sascha|Chris').add('Chris|Sascha');

  const host = await phone('Sascha');
  const H = host.p;
  const guest = await phone('Cedric');
  const C = guest.p;
  // Sascha's friends list read from the server (as the app does after a sync)
  await H.evaluate(() => sessionStorage.removeItem('golfos.module'));
  await H.reload();
  await H.waitForTimeout(1200);
  await H.getByRole('navigation', { name: 'Menü' }).getByRole('button', { name: 'Freunde' }).click();
  await H.waitForTimeout(1500);
  await H.locator('.friend-linked').filter({ hasText: 'Cedric' }).waitFor({ timeout: 10000 }).catch(() => {});
  ok((await H.locator('.friend-linked').filter({ hasText: 'Cedric' }).count()) === 1, `${o.oldPush ? '[old function] ' : ''}Sascha: Cedric linked in his friends`);

  // a round with Cedric
  await H.evaluate(() => sessionStorage.setItem('golfos.module', 'rounds'));
  await H.reload();
  await H.waitForTimeout(1500);
  await H.getByRole('button', { name: 'Neue Runde' }).click();
  await H.waitForTimeout(1200);
  await H.fill('#course-search', 'Hetzenhof');
  await H.waitForTimeout(2000);
  await H.locator('button.list-item').first().click();
  await H.getByText('Runde starten').waitFor({ timeout: 30000 });
  await H.getByRole('button', { name: /A · 9 Löcher/ }).click();
  await H.locator('input[id^="name-"]').first().fill('Sascha');
  await H.locator('input[id^="hcp-"]').first().fill('10');
  await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
  await H.locator('input[id^="name-"]').last().fill('Cedric');
  await H.locator('input[id^="hcp-"]').last().fill('13');
  const inviteCard = H.locator('.invite-card');
  await inviteCard.locator('.join-code').waitFor({ timeout: 10000 });
  const code = (await inviteCard.locator('.join-code').innerText()).trim().replace(/-/g, '');
  const friends = H.locator('.invite-friends');
  ok((await friends.count()) === 1 && (await friends.getByRole('button', { name: 'Cedric einladen' }).count()) === 1, 'the invitation: "Verknüpfte Freunde einladen" – Cedric with "Einladen"');
  // only the friends in the flight (Sascha 03.11.2026): Chris is linked, but not one of the players
  ok((await friends.getByRole('button', { name: 'Chris einladen' }).count()) === 0, 'Chris, linked but not in the flight: not offered');
  await friends.getByRole('button', { name: 'Cedric einladen' }).click();
  await friends.locator('button', { hasText: 'Eingeladen ✓' }).waitFor({ timeout: 10000 }).catch(() => {});
  ok((await friends.locator('button', { hasText: 'Eingeladen ✓' }).count()) === 1, `one tap: "Eingeladen ✓" (${(await friends.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-90)})`);
  await H.waitForTimeout(800);
  ok(shared.get(code)?.members.includes('Cedric') && !!shared.get(code)?.requests.Cedric?.invited, 'server: Cedric let in, marked invited');
  if (!o.oldPush) ok(pushes.some((x) => x.action === 'invite' && x.friend === 'Cedric' && x.code === code), 'push: the invitation to Cedric (by his account)');
  else ok(/öffnet er GolfOS/.test(await friends.innerText()), 'the function from before: let in by the host\'s phone – "öffnet er GolfOS, ist die Anfrage da"');

  // Cedric's app, open: asked straight away
  await C.reload();
  const ask = C.getByRole('dialog', { name: 'Einladung zur Runde' });
  await ask.waitFor({ timeout: 15000 }).catch(() => {});
  ok(/Sascha lädt dich zu seiner Runde in .*Hetzenhof.* ein/.test(await ask.innerText().catch(() => '')), `Cedric: "Sascha lädt dich zu seiner Runde … ein" (${(await ask.innerText().catch(() => '–')).replace(/\s+/g, ' ').slice(0, 90)})`);
  await ask.getByRole('button', { name: 'Beitreten' }).click();
  // let in already: straight into the round, no "Anfrage an den Gastgeber"
  await C.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(() => {});
  const cr = await round(C).catch(() => null);
  ok(cr?.shared?.code === code && cr.players.find((p) => p.isMe)?.name === 'Cedric', `Cedric: in the round at once, as himself (${cr?.players.map((p) => `${p.name}${p.isMe ? '*' : ''}`).join(', ') ?? 'no round'})`);
  ok(!pushes.some((x) => x.action === 'asked' && x.from === 'Cedric'), 'no asking the host – invited is let in');
  // his own score on top
  await C.locator('.map-score').click().catch(() => {});
  await C.locator('.score-player').first().waitFor({ timeout: 8000 }).catch(() => {});
  ok(/Cedric/.test(await C.locator('.score-player').first().innerText().catch(() => '')), `Cedric's score panel: his own score on top (${(await C.locator('.score-player').first().innerText().catch(() => '–')).split('\n')[0]})`);
  // asked once only
  await C.reload();
  await C.waitForTimeout(3000);
  ok((await C.getByRole('dialog', { name: 'Einladung zur Runde' }).count()) === 0, 'joined: not asked again');
  ok([host, guest].every((x) => x.errs.length === 0), `no page errors ${[host, guest].flatMap((x) => x.errs).slice(0, 2).join(' | ')}`);
}

await run({});
await run({ oldPush: true });
await b.close();
process.exit(fails ? 1 : 0);
