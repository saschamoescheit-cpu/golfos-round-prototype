// QA (Sascha 29.10.2026: "build the invitation for rounds – on Saturday we play in the same scramble team, but it must
// also be possible to set up a kind of tournament over several flights, with a live leaderboard"; then: "invite where
// the round is set up, with the flight partners", "in a team event one keeps the team's score, the others cannot
// overwrite it – if Sascha's battery is empty Cedric goes on"): three phones. Sascha sets up a scramble round (Sascha &
// Ben), makes it a tournament and gets the code in the setup; Ben joins the same team with the link before the start;
// Max is let in (no flight of his own – tournaments are planned in Games). Sascha keeps the team's card, Ben's phone shows it without steppers and
// takes it over; then Ben's scores reach Sascha's phone. The leaderboard ranks both teams. Supabase is simulated in
// this script (the table golfos_shared_games, with its write rule "only if nobody wrote in between"), the app is real.
// Usage: node qa/shareround.mjs [url]
import { webkit } from 'playwright';
import { onOff, flip } from './onoff.mjs';
import { sharedServer } from './sharesim.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
const { shared, pushes, phone, round, event, refused, flightReads } = sharedServer(b, url);

// ---------- Sascha: a scramble round with Ben, made a tournament ----------
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
await H.locator('input[id^="hcp-"]').first().fill('10'); // as in the profile – no "update the HCP?"
await H.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
await H.locator('input[id^="name-"]').last().fill('Ben');
await H.locator('input[id^="hcp-"]').last().fill('16');
// a plain social round invites as well (Sascha 29.10.2026: "not only scramble or a tournament")
await H.locator('.invite-card').waitFor({ timeout: 10000 }).catch(() => {});
ok((await H.locator('.invite-card').count()) === 1 && /Social/.test(await H.locator('.settings-row').filter({ hasText: 'Rundenart' }).innerText().catch(() => '')), `setup: the invitation in a social round too (${(await H.locator('.settings-row').filter({ hasText: 'Rundenart' }).innerText().catch(() => '?')).replace(/\s+/g, ' ')})`);
await H.locator('.settings-row').filter({ hasText: 'Modus' }).click();
await H.locator('.pick-option strong').getByText('Scramble', { exact: true }).click();
// the invitation in the setup, with the flight partners – before the round begins (Sascha 29.10.2026)
const card = H.locator('.invite-card');
await card.waitFor({ timeout: 10000 });
ok(await card.isVisible() && (await H.locator('.eyebrow').getByText('Mitspieler einladen', { exact: true }).isVisible()), 'setup: "Mitspieler einladen" – its own section, before the start');
await card.getByRole('button', { name: 'Code erzeugen' }).click({ timeout: 3000 }).catch(() => {}); // made by itself once a partner is in the flight (03.11.2026)
await H.waitForTimeout(800);
const code = (await card.locator('.join-code').innerText()).trim().replace(/-/g, '');
// 6 digits, shown 123-456 (Sascha 03.11.2026)
ok(/^\d{6}$/.test(code) && /^\d{3}-\d{3}$/.test((await card.locator('.join-code').innerText()).trim()) && (await card.locator('.qr-box svg').count()) === 1, `setup: code ${code} (6 digits, 123-456) with a QR code`);
// made by itself (03.11.2026): shown nearby only when asked – the switch above the QR code (04.11.2026); the setup goes to the server a moment after each change
await flip(onOff(card, /In der Nähe anzeigen/));
await H.waitForTimeout(2500);
// (no tournament made here any more – they are planned in Games since 01.11.2026: qa/plannedtourney.mjs)

const f1 = Object.values(event().flights)[0];
ok(f1.players.length === 1 && f1.players[0].name === 'Sascha & Ben', `server: flight 1 – the team "${f1.players.map((p) => p.name).join()}"`);
ok(Object.values(f1.phones ?? {}).map((p) => p.name).join() === 'Sascha', 'server: Sascha\'s phone in the flight – it keeps the card');
// shown nearby (Sascha 29.10.2026: "only players signed in and nearby – by GPS"): where Sascha's phone is, for two hours
await H.waitForTimeout(1200);
const near = [...shared.values()][0]?.near;
ok(near && Math.abs(near.near_lat - 48.7808) < 1e-4 && near.near_radius === 300 && near.near_host === 'Sascha' && near.near_ref?.length >= 20 && new Date(near.near_until) - Date.now() > 1.9 * 3600e3, `server: the round shown nearby – Sascha's position, 300 m, two hours (${JSON.stringify(near ?? null).slice(0, 90)})`);
ok((await onOff(card, /In der Nähe anzeigen/).getAttribute('data-on')) === 'true' && !/Angemeldete Spieler im Umkreis/.test(await card.innerText()), 'setup: "In der Nähe anzeigen" switched on above the QR code – no explanation (04.11.2026)');
// off and on again (Sascha 04.11.2026: "I could switch it on, but not off again"); no box of its own, space to the QR code
const nearSw = onOff(card, /In der Nähe anzeigen/);
await flip(nearSw);
await H.waitForTimeout(1200);
ok((await nearSw.getAttribute('data-on')) === 'false' && ![...shared.values()][0]?.near, 'setup: "In der Nähe anzeigen" off again – the round no longer shown nearby');
await flip(nearSw);
await H.waitForTimeout(1500);
const gapQr = await H.evaluate(() => {
  const s = document.querySelector('.near-switch');
  const q = document.querySelector('.invite-card .qr-box');
  return s && q ? { gap: q.getBoundingClientRect().top - s.getBoundingClientRect().bottom, bg: getComputedStyle(s).backgroundColor, boxed: !!s.closest('.drawer-list') } : null;
});
ok((await nearSw.getAttribute('data-on')) === 'true' && !![...shared.values()][0]?.near && gapQr && gapQr.gap >= 20 && !gapQr.boxed && /rgba\(0, 0, 0, 0\)|transparent/.test(gapQr.bg), `setup: on again; the switch a line of the invite, no grey box, ${Math.round(gapQr?.gap ?? 0)} px to the QR code`);
if (process.env.SHOTS) await card.screenshot({ path: process.env.SHOTS + '/round-invite.png' });

// ---------- Ben: the same team, with the link – before Sascha starts ----------
const guest = await phone('Ben');
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#round=' + code);
await G.waitForTimeout(2500);
const join = G.getByRole('dialog', { name: 'Runde beitreten' });
ok(await join.isVisible(), 'Ben: the link opens "Runde beitreten" in Rounds');
// the host lets every phone in, by the link too (Sascha 30.10.2026) – Sascha, still in the setup, is asked
ok(await join.getByText('Anfrage an den Gastgeber gesendet').isVisible(), 'Ben: asked at once – "Anfrage an den Gastgeber gesendet"');
ok(pushes.some((x) => x.action === 'asked' && x.code === code && x.from === 'Ben'), 'push: the host hears that Ben asks');
const askBen = H.getByRole('alertdialog', { name: 'Ben möchte beitreten' });
await askBen.waitFor({ timeout: 12000 }).catch(() => {});
ok(await askBen.isVisible(), 'Sascha, in the setup: "Ben möchte deiner Runde beitreten"');
await askBen.getByRole('button', { name: 'Zulassen' }).click();
// let in: his name is in the team "Sascha & Ben" – in at once, no "who are you?"
await G.locator('.map-hole-no').waitFor({ timeout: 30000 });
ok(shared.get(code).members.includes('Ben'), 'server: Ben let in – a member now');
const gr = await round(G);
ok(gr.shared?.code === code && gr.players.length === 1 && gr.players[0].isMe && gr.format?.mode === 'scramble', 'Ben: his own round of the event – the team is "me", scramble');

// ---------- Sascha starts ----------
await H.getByRole('button', { name: 'Runde starten' }).click();
await H.locator('.map-hole-no').waitFor({ timeout: 30000 }).catch(async () => {
  await H.screenshot({ path: 'qa/shareround-fail.png' });
  throw new Error('no hole map after "Runde starten" – qa/shareround-fail.png');
});
ok((await round(H)).shared?.code === code, 'Sascha: the round starts with the code from the setup');
await H.waitForTimeout(2000);

// ---------- Max: nearby, a flight of his own ----------
const third = await phone('Max');
const M = third.p;
const mj = M.getByRole('dialog', { name: 'Runde beitreten' });
// a kilometre away: nothing shown
await M.context().setGeolocation({ latitude: 48.7898, longitude: 9.689, accuracy: 5 });
await M.getByRole('button', { name: 'Runde beitreten' }).click();
await mj.getByText('Keine Runde in der Nähe').waitFor({ timeout: 10000 }).catch(() => {});
ok((await mj.locator('.near-round').count()) === 0 && (await mj.getByText('Keine Runde in der Nähe').isVisible()), 'Max, 1 km away: no round nearby');
await mj.getByRole('button', { name: 'Schließen' }).click();
// no code typed: the round nearby, a tap (Max stands ~100 m from Sascha's phone)
await M.context().setGeolocation({ latitude: 48.7817, longitude: 9.689, accuracy: 5 });
await M.getByRole('button', { name: 'Runde beitreten' }).click();
const nearRow = mj.locator('.near-round');
await nearRow.first().waitFor({ timeout: 10000 }).catch(() => {});
const nearText = (await nearRow.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
ok(nearText.length === 1 && /Runde von Sascha · Scramble/.test(nearText[0]) && /\b(9\d|10\d) m\b/.test(nearText[0]), `Max: "In der Nähe" – ${nearText.join(' | ') || 'nothing'}`);
await nearRow.first().click();
// the host must let him in (Sascha 29.10.2026): Max waits, Sascha's phone – on the hole map – asks
await mj.getByText('Anfrage an Sascha gesendet').waitFor({ timeout: 8000 }).catch(() => {});
ok(await mj.getByText('Anfrage an Sascha gesendet').isVisible(), 'Max: "Anfrage an Sascha gesendet" – waiting, no code yet');
const ask = H.getByRole('alertdialog', { name: 'Max möchte beitreten' });
await ask.waitFor({ timeout: 12000 }).catch(() => {});
ok(await ask.isVisible(), 'Sascha, on the hole map: "Max möchte deiner Runde beitreten"');
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/round-join-ask.png' });
await ask.getByRole('button', { name: 'Zulassen' }).click();
await mj.getByText('Wer bist du?').waitFor({ timeout: 10000 }).catch(() => {});
ok(await mj.getByText('Wer bist du?').isVisible(), 'Max: let in - the round opens on his phone (who is he in the flight?)');
ok((await mj.getByRole('button', { name: 'Eigenen Flight anlegen' }).count()) === 0, 'Max: no flight of his own - a round on the course is no tournament');
ok(pushes.some((x) => x.action === 'asked' && x.ref && x.from === 'Max'), 'push: the host hears that Max asks (nearby)');
ok((await ask.count()) === 0, 'Sascha: the request gone once answered');
await mj.getByRole('button', { name: 'Schließen' }).click();
ok(Object.keys(event().flights).length === 1, 'server: still the one flight');

// ---------- Tom, a stranger on the course: asks, Sascha declines ----------
const fourth = await phone('Tom');
const T = fourth.p;
await T.context().setGeolocation({ latitude: 48.7812, longitude: 9.6895, accuracy: 5 });
await T.getByRole('button', { name: 'Runde beitreten' }).click();
const tj = T.getByRole('dialog', { name: 'Runde beitreten' });
await tj.locator('.near-round').first().waitFor({ timeout: 10000 }).catch(() => {});
await tj.locator('.near-round').first().click();
const askT = H.getByRole('alertdialog', { name: 'Tom möchte beitreten' });
await askT.waitFor({ timeout: 12000 }).catch(() => {});
await askT.getByRole('button', { name: 'Ablehnen' }).click();
await tj.getByText('Sascha hat den Beitritt abgelehnt').waitFor({ timeout: 10000 }).catch(() => {});
ok(await tj.getByText('Sascha hat den Beitritt abgelehnt').isVisible(), 'Tom: declined – "Sascha hat den Beitritt abgelehnt"');
ok(Object.keys(event().flights).length === 1 && ![...shared.values()][0].members.includes('Tom'), 'server: Tom not in the event');
await fourth.p.context().close();

// ---------- scores: one keeps the team's card ----------
const enter = async (p, clicks) => {
  await p.locator('.map-score').click();
  await p.waitForTimeout(300);
  const plus = p.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ });
  for (let k = 0; k < clicks; k++) await plus.click();
  await p.getByRole('button', { name: 'Nächstes Loch' }).click();
  await p.waitForTimeout(500);
};
await enter(H, 1); // Sascha's phone: par on hole 1
await H.waitForTimeout(12000);
const g1 = await round(G);
ok(g1.entries.me[0].strokes != null && g1.entries.me[0].strokes === (await round(H)).entries.me[0].strokes, `Ben's phone: the team's score from Sascha's phone (${g1.entries.me[0].strokes})`);
// Ben's phone shows the card, it cannot change it – and offers to take it over
await G.locator('.map-score').click();
await G.waitForTimeout(300);
const kept = G.locator('.score-player.kept-elsewhere');
ok((await kept.count()) === 1 && /Sascha führt die Scorecard des Teams/.test(await kept.innerText()) && (await kept.getByRole('button', { name: /Schläge plus eins/ }).count()) === 0, `Ben: "${(await kept.innerText().catch(() => '')).replace(/\s+/g, ' ')}" – no steppers`);
if (process.env.SHOTS) await G.screenshot({ path: process.env.SHOTS + '/round-kept.png' });
await G.getByRole('button', { name: 'Zurück zur Karte' }).click();
// on to hole 2 – no score asked: Ben does not keep the card
await G.locator('.hole-bar-arrow[aria-label="Nächstes Loch"]').click();
await G.waitForTimeout(800);
ok((await G.locator('.map-hole-no').innerText()).includes('2') && (await G.locator('.score-panel').count()) === 0, `Ben: on hole 2 without the score panel (${(await G.locator('.map-hole-no').innerText()).trim()})`);
// Sascha's battery is empty: Ben takes the card over and goes on
await G.locator('.map-score').click();
await G.waitForTimeout(300);
await G.getByRole('button', { name: 'Scorekarte übernehmen' }).click();
await G.waitForTimeout(2500);
ok((await G.locator('.score-player.kept-elsewhere').count()) === 0 && (await G.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ }).count()) === 1, 'Ben: took the card over – the steppers are his now');
const plusG = G.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ });
await plusG.click();
await G.getByRole('button', { name: 'Nächstes Loch' }).click();
await G.waitForTimeout(12000);
const h2 = await round(H);
ok(h2.entries.me[1].strokes != null && h2.entries.me[1].strokes === (await round(G)).entries.me[1].strokes, `Sascha's phone: hole 2 from Ben's phone (${h2.entries.me[1].strokes})`);
ok(h2.entries.me[0].strokes != null, 'Sascha: his own hole 1 still there');
await H.locator('.map-score').click();
await H.waitForTimeout(300);
ok(/Ben führt die Scorecard des Teams/.test(await H.locator('.score-panel').innerText()), 'Sascha: now Ben keeps the card – Sascha can take it back');
await H.getByRole('button', { name: 'Zurück zur Karte' }).click();

// (the live leaderboard of a tournament: qa/plannedtourney.mjs – one team alone has none)
// one flight: in the event's row (a tournament's flights each in a row of their own – qa/plannedtourney.mjs)
const own = [...shared.values()].filter((r) => r.event_code === code);
ok(own.length === 0, "server: a round of one flight stays in the event's row");
console.log(`(writes refused because another phone wrote in between: ${refused()})`);
ok(host.errs.length === 0 && guest.errs.length === 0 && third.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs, ...third.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
