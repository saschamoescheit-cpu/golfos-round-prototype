// QA (Facelift-Abnahme 11.11.2026, Wetten / Pool – Sascha: "Passt"): the pool's page and sheets in the one look of the
// app. A pool on the host's phone with a skipped round, two free bets (one decided made) and a payment Chris → Sascha:
//  · W5: "Stand", "Abrechnung" and each player's name small headings (eyebrows) above their cards, no h2 in a card
//  · W6: the free bets' state as SVG signs (made / open), no "✓", "✗", "…" as text
//  · W4: a round not counted – "Aus dem Pool löschen" the red bin of an action bar, no red text button
//  · G4: a payment taken back by swiping left – "Zurücknehmen" with the arrow back, grey, no bin, no ↺ button
//  · O4: no connection – said in the green notice, not in red
//  · W9: "Pool jetzt beenden?" the one confirmation – head with ✕, the green "Beenden & abrechnen", "Zurück"
//  · O1/W7: the pencil's sheet – "Wer erfasst" right after the players, "Worum" a block of its own, then "Einstellungen"
//  · W2/"wetten": the library – chips to pick from; an own bet a row to tick, swiped away, "Rückgängig" brings it back;
//    "Eigene Wette bauen ›" a row
// Supabase is simulated (qa/sharesim.mjs), the app is real. Usage: node qa/wettenface.mjs [url]
import { webkit } from 'playwright';
import { sharedServer } from './sharesim.mjs';
import { swipeLeft, tapAction } from './swipeleft.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const day = (k) => {
  const d = new Date(Date.now() + k * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const d2 = day(-2);
const d1 = day(-1);
const sim = sharedServer(b, url);
const host = await sim.phone('Sascha');
const H = host.p;
const shots = process.env.SHOTS;

const code = await H.evaluate(
  async ({ from, to, d2, d1 }) => {
    const ws = await import('/src/lib/wagerstore.ts');
    const now = new Date().toISOString();
    const r = (day, course, value) => ({ day, course, value, counted: true });
    const per = [r(d2, 'Celebration Golf Club', 2), r(d2, 'Reunion Resort Golf Course', 1), r(d1, 'StoneGate Cypress', 3)];
    const made = {
      kind: 'wager-pool', id: 'pool-face', name: 'USA-Wetten', from, to, createdAt: now, currency: 'USD', counted: true,
      players: [{ id: 's', name: 'Sascha' }, { id: 'c', name: 'Chris' }],
      wagers: [
        { id: 'w1', player: 'c', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true },
        { id: 'w2', player: 'c', kind: 'free', text: 'Längster Drive an Loch 7', target: 1, stake: 20, payout: 'success', attempts: 'any', counted: true },
        { id: 'w3', player: 's', kind: 'free', text: 'Kein Wasser', target: 1, stake: 20, payout: 'success', attempts: 'any', counted: true },
      ],
      progress: {
        w1: { best: 3, done: true, rounds: 3, at: now, perRound: per },
        w2: { best: null, done: false, rounds: 0, at: now, manual: { done: true, by: 'Sascha' } },
      },
      skip: [{ day: d2, course: 'Reunion Resort Golf Course' }],
      payments: [{ id: 'pay1', from: 'c', to: 's', amount: 20, paidAt: now }],
    };
    const e = await ws.createPool(made, 's');
    // an own bet kept on this phone (Sascha 02.11.2026: "own bets in the library again and again")
    localStorage.setItem('golfos.mybets.v1', JSON.stringify([{ id: 'my1', bet: { metric: 'threePutt', compare: 'max', where: 'all', run: false, target: 0 } }]));
    return e?.code ?? null;
  },
  { from: day(-5), to: day(5), d2, d1 },
);
ok(!!code, `the pool set up (${code})`);
const server = () => sim.shared.get(code)?.game ?? sim.shared.get(code);

await H.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await H.reload();
await H.waitForTimeout(1500);
await H.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await H.getByText('USA-Wetten').first().click();
const stand = H.locator('.pool-standings');
await stand.waitFor({ timeout: 15000 });

// W5: the titles above the cards
{
  const brows = (await H.locator('main .setup-part > .eyebrow, main .setup-part > div > .eyebrow').allTextContents()).join('|');
  ok((await H.locator('main .card h2').count()) === 0, 'no h2 inside a card on the pool page');
  ok(/Stand/.test(brows) && /Abrechnung/.test(brows) && /Sascha/.test(brows) && /Chris/.test(brows), `"Stand", "Abrechnung" and the players as eyebrows above the cards (${brows})`);
  const region = H.getByRole('region', { name: 'Stand der Wetten' });
  const yHead = (await region.locator('.eyebrow').first().boundingBox())?.y ?? -1;
  const yCard = (await stand.boundingBox())?.y ?? -1;
  ok(yHead > 0 && yHead < yCard && (await stand.locator('.eyebrow', { hasText: /^Stand$/ }).count()) === 0, 'the eyebrow "Stand" above the card, not in it');
  const chris = H.locator('section.pool-player').filter({ has: H.locator('.pool-player-name', { hasText: /^Chris$/ }) });
  ok((await chris.count()) === 1 && (await chris.locator('.card .pool-player-name').count()) === 0 && (await chris.locator('.person-mark').count()) >= 1, "Chris's name above his card, with his figure");
  if (shots) await H.screenshot({ path: `${shots}/wettenface-pool.png`, fullPage: true });
}

// W6: the free bets' state as signs
{
  const free = stand.getByRole('group', { name: 'Freie Wetten' });
  const marks = await free.locator('svg.free-mark').evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')));
  const text = await free.innerText();
  ok(marks.join('|') === 'Geschafft|Offen' && !/[✓✗…]/.test(text), `free bets: SVG signs "Geschafft", "Offen" – no ✓ ✗ … (${marks.join(', ')})`);
  ok((await free.locator('svg.free-mark.good-text').count()) === 1, 'free bets: made in green');
}

// W4: the skipped round – "Aus dem Pool löschen" a red action of the bar
{
  await stand.getByRole('group', { name: 'Runden' }).locator('.step-pick-now').click();
  await H.getByRole('dialog', { name: 'Runden' }).locator('.pick-option').filter({ hasText: 'Reunion' }).click();
  await H.waitForTimeout(300);
  const del = stand.getByRole('button', { name: 'Runde aus dem Pool löschen' });
  ok((await del.count()) === 1 && /sc-action/.test(await del.getAttribute('class')) && /danger/.test(await del.getAttribute('class')) && (await del.innerText()).trim() === 'Aus dem Pool löschen' && (await del.locator('svg').count()) === 1, 'a round not counted: "Aus dem Pool löschen" – the red bin of an action bar');
  ok((await stand.locator('.btn-ghost').count()) === 0, 'no red text button any more');
  if (shots) await stand.screenshot({ path: `${shots}/wettenface-skip.png` });
  await stand.getByRole('group', { name: 'Runden' }).locator('.step-pick-now').click();
  await H.getByRole('dialog', { name: 'Runden' }).locator('.pick-option').filter({ hasText: 'Gesamt' }).click();
}

// G4: a payment taken back by swiping left
{
  const paid = H.getByRole('list', { name: 'Bezahlt' }).locator('li');
  ok((await paid.count()) === 1 && (await H.locator('.paid-undo').count()) === 0 && (await H.getByText('↺').count()) === 0, 'the payment: no ↺ button');
  ok((await H.locator('.paid-hint').count()) === 1, 'one line under the payments: swipe left to take back');
  await swipeLeft(H, paid.first().locator('.swipe'));
  const back = paid.first().locator('.swipe-bin');
  const html = await back.innerHTML().catch(() => '');
  ok(/Zurücknehmen/.test(await back.innerText().catch(() => '')) && /neutral/.test(await back.getAttribute('class')) && html.includes('M4 12a8 8 0 1 0 2.4-5.7') && !html.includes('M4 7h16'), 'swiped: "Zurücknehmen" with the arrow back, grey – no bin');
  const bg = await back.evaluate((e) => getComputedStyle(e).backgroundColor);
  ok(!/255, 107, 94/.test(bg), `the take-back not red (${bg})`);
  if (shots) await H.locator('.pool-settle').screenshot({ path: `${shots}/wettenface-takeback.png` });
  await tapAction(back);
  await H.waitForTimeout(1200);
  ok((server()?.payments ?? []).length === 0 && (await H.getByRole('list', { name: 'Bezahlt' }).count()) === 0, 'tapped: the payment taken back – on the server too');
}

// O4 + W9: "Pool beenden" – the one confirmation; no connection: a green notice
{
  await H.getByRole('button', { name: 'Pool beenden' }).click();
  const ask = H.locator('.confirm-sheet');
  const go = ask.getByRole('button', { name: 'Beenden & abrechnen' });
  ok((await ask.count()) === 1 && (await ask.locator('.sheet-head strong').innerText()) === 'Pool jetzt beenden?' && (await ask.getByRole('button', { name: 'Schließen' }).count()) === 1 && (await ask.getByRole('button', { name: 'Zurück', exact: true }).count()) === 1 && /btn-primary/.test(await go.getAttribute('class')) && (await ask.getByRole('button', { name: 'Abbrechen' }).count()) === 0, '"Pool jetzt beenden?": head with ✕, green "Beenden & abrechnen", "Zurück" – no "Abbrechen"');
  if (shots) await H.screenshot({ path: `${shots}/wettenface-finish.png` });
  // the connection gone: the write fails
  const cut = (r) => (r.request().method() === 'PATCH' ? r.abort() : r.fallback());
  await H.context().route(/golfos_shared_games/, cut);
  await go.click();
  await H.waitForTimeout(1500);
  const note = H.locator('main [role="alert"]').filter({ hasText: 'Keine Verbindung' });
  const look = await note.evaluate((e) => [e.className, getComputedStyle(e).color]).catch(() => ['', '']);
  ok((await note.count()) === 1 && /notice/.test(look[0]) && !/bad-text/.test(look[0]) && !/255, 107, 94/.test(look[1]), `no connection: the green notice, not red (${look.join(' · ')})`);
  ok(!server()?.finishedAt, 'not finished without the connection');
  await H.context().unroute(/golfos_shared_games/, cut);
  await ask.getByRole('button', { name: 'Zurück', exact: true }).click();
  ok((await H.locator('.confirm-sheet').count()) === 0 && !server()?.finishedAt, '"Zurück": the pool runs on');
}

// O1 / W7: the pencil's sheet in the order of "Neue Wette"
{
  await H.getByRole('button', { name: 'Pool bearbeiten' }).click();
  const edit = H.getByRole('dialog', { name: 'Pool bearbeiten' });
  const brows = (await edit.locator(':scope > .eyebrow').allTextContents()).join('|');
  ok(!brows.includes('Score-Erfassung') && /Spieler\|Worum\|Einstellungen$/.test(brows), `edit: Spieler → Worum → Einstellungen (${brows})`);
  const yAdd = (await edit.getByRole('button', { name: 'Spieler hinzufügen' }).boundingBox())?.y ?? -1;
  const yWho = (await edit.locator('.settings-row').filter({ hasText: 'Wer erfasst' }).boundingBox())?.y ?? -1;
  const yWorum = (await edit.locator(':scope > .eyebrow', { hasText: /^Worum$/ }).boundingBox())?.y ?? -1;
  ok(yAdd > 0 && yWho > yAdd && yWorum > yWho, `edit: "Wer erfasst" right after the players, before "Worum" (${Math.round(yAdd)} < ${Math.round(yWho)} < ${Math.round(yWorum)})`);
  await H.getByRole('button', { name: 'Fertig', exact: true }).click(); // saves by itself: "Fertig" floats bottom right (13.11.2026)
  await H.waitForTimeout(400);
}

// W2 / "wetten": the library of a player
{
  await H.getByRole('button', { name: 'Wetten für Chris hinzufügen' }).click();
  const lib = H.getByRole('dialog', { name: 'Wetten-Bibliothek' });
  const chips = lib.getByRole('group', { name: 'Auswählen aus' });
  ok(/chip-row/.test(await chips.getAttribute('class')) && (await lib.locator('.segmented').count()) === 0, 'where to pick from: green chips, no Segmented block');
  await chips.getByRole('button', { name: 'Eigene Wetten' }).click();
  ok((await chips.getByRole('button', { name: 'Eigene Wetten' }).getAttribute('aria-pressed')) === 'true', '"Eigene Wetten" chosen – the chip green');
  const own = lib.locator('.lib-list .swipe');
  ok((await own.count()) === 1 && (await lib.locator('.lib-list').getByText('✕', { exact: true }).count()) === 0 && (await lib.locator('.settings-row').filter({ hasText: 'Eigene Wette bauen' }).count()) === 1 && (await lib.getByRole('button', { name: '+ Eigene Wette bauen' }).count()) === 0, 'own bets: a row that swipes, no ✕; "Eigene Wette bauen ›" a row');
  await own.first().getByRole('checkbox').click();
  ok((await own.first().getByRole('checkbox').getAttribute('aria-checked')) === 'true' && (await own.first().locator('.stepper').count()) === 1, 'ticked: its number right below');
  if (shots) await H.screenshot({ path: `${shots}/wettenface-own.png` });
  await own.first().getByRole('checkbox').click();
  await swipeLeft(H, own.first());
  await tapAction(lib.locator('.lib-list .swipe-bin'));
  await H.waitForTimeout(500);
  const left = () => H.evaluate(() => JSON.parse(localStorage.getItem('golfos.mybets.v1') ?? '[]').length);
  ok((await left()) === 0 && (await lib.locator('.lib-list .swipe').count()) === 0 && /Wette gelöscht/.test(await H.locator('.undo-toast').innerText()), 'swiped away: gone, "Wette gelöscht · Rückgängig"');
  await H.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
  await H.waitForTimeout(300);
  ok((await left()) === 1 && (await lib.locator('.lib-list .swipe').count()) === 1, '"Rückgängig": the own bet back');
  await lib.getByRole('button', { name: 'Schließen' }).click();
}

ok(host.errs.length === 0, `no page errors ${host.errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
