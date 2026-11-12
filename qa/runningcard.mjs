// QA (Sascha 12.11.2026, design "Heute": "„Läuft gerade“-Karte oben auf der Startseite"; 11.11.2026 design round 2:
// renamed "Jetzt dran", a green frame, every row a direct way there, the module cards only say what they are): a pool of bets on its days
// shows on the start page above the modules – its name, "Tag N von M", my standing in green when ahead – and a tap
// opens the pool; without anything running there is no such card.
// Usage: node qa/runningcard.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const day = (d) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const now = new Date().toISOString();
// day 3 of 8; I made a bet: +20 $ from Chris
const pool = {
  kind: 'wager-pool', id: 'pool-usa', name: 'USA-Wetten', from: day(-2), to: day(5), createdAt: now, currency: 'USD',
  players: [{ id: 'p0', name: 'Sascha' }, { id: 'p1', name: 'Chris' }],
  wagers: [{ id: 'w1', player: 'p0', kind: 'birdieRun', target: 2, stake: 20, payout: 'success', attempts: 'any', counted: true }],
  progress: { w1: { best: 2, done: true, rounds: 1, at: now, perRound: [{ day: day(-1), course: 'Celebration Golf Club', value: 2, counted: true }] } },
};
const seed = async (pools, extra = {}) => {
  await p.evaluate(([ps, extra]) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
    localStorage.setItem('golfos.pools.v1', JSON.stringify(ps));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, [pools, extra]);
  await p.reload();
  await p.waitForTimeout(1500);
};
await p.goto(url);
await p.waitForTimeout(1200);

// nothing running: no card
await seed([]);
ok((await p.locator('.running-card').count()) === 0, 'nothing running: no "Läuft gerade"');

// a pool on its days
await seed([{ code: 'USA1', pool, me: 'p0' }]);
const card = p.locator('.running-card');
ok((await card.count()) === 1, 'a pool on its days: the card "Jetzt dran"');
ok((await card.locator('.eyebrow').innerText()).trim().toLowerCase() === 'läuft gerade', 'its title "Läuft gerade" (12.11.2026)');
const frame = await card.evaluate((el) => [getComputedStyle(el).borderTopColor, getComputedStyle(el).borderTopWidth]);
const brand = await p.evaluate(() => { const d = document.createElement('i'); d.style.color = 'var(--brand)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
ok(frame[0] === brand && parseFloat(frame[1]) >= 1, `a green frame (${frame.join(' ')})`);
// the module cards no longer repeat it – only a quiet line what each module is, never cut
ok((await p.locator('.home-hero .module-card .module-live, .home-hero .module-card .module-todo, .home-hero .module-card .module-dot').count()) === 0, 'the module cards: no green hint, no dot');
const descs = await p.locator('.home-hero .module-card .module-desc').allInnerTexts();
ok(descs.join('|') === 'Runden spielen und auswerten|Spiele und Wetten mit Freunden|Turniere und Serien planen|Training und Übungspläne|Screening und Übungen', `each module says what it is (${descs.join(' | ')})`);
const cut = await p.locator('.home-hero .module-desc').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
ok(cut === 0, 'no description cut off');
const row = card.locator('.running-row').filter({ hasText: 'USA-Wetten' });
const txt = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Tag 3 von 8/.test(txt) && /\+20 \$/.test(txt), `the pool's row: day and my standing (${txt})`);
ok((await row.locator('.running-value.good-text').count()) === 1, 'ahead: the amount in green');
const cardBox = await card.boundingBox();
const firstModule = await p.locator('.home-hero .module-card').first().boundingBox();
ok(!!cardBox && !!firstModule && cardBox.y + cardBox.height <= firstModule.y + 1, 'above the modules');
ok(((await row.boundingBox())?.height ?? 0) >= 44, 'a row big enough to tap');
await row.click();
await p.waitForTimeout(1200);
ok((await p.locator('.pool-screen, .pool-standings').count()) >= 1, 'a tap opens the pool');
// the bets made (Sascha 11.11.2026, Prüfliste: "den Platz als Information zeigen; bei Klick der Pool mit der Runde, nicht gesamt")
await seed([{ code: 'USA1', pool, me: 'p0' }]);
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.reload();
await p.waitForTimeout(1500);
await p.locator('.tabbar button').filter({ hasText: 'Wetten' }).click();
await p.waitForTimeout(500);
await p.locator('.tile').filter({ hasText: 'geschafft' }).click();
await p.waitForTimeout(400);
const madeRow = p.locator('.made-bets .list-item').first();
const madeText = (await madeRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Celebration Golf Club · \d\d\.\d\d\./.test(madeText), `a bet made: its course and day (${madeText})`);
await madeRow.click();
await p.locator('.pool-standings').waitFor({ timeout: 10000 }).catch(() => {});
const shownRound = (await p.locator('.pool-standings .step-pick-now').innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Celebration/.test(shownRound), `a tap opens the pool on that round, not the total (${shownRound})`);
await p.evaluate(() => sessionStorage.setItem('golfos.module', ''));

// a paused training: its own row – a tap goes to Training
await seed([], { 'golfos.training.sessions.v1': [{ id: 's1', name: 'Putten', createdAt: now, finishedAt: null, current: 0, items: [{ drill: 'slice-gate', minutes: 10 }], spent: [0] }] });
const trow = p.locator('.running-card .running-row').filter({ hasText: 'Training' });
ok((await trow.count()) === 1 && /Eine Einheit ist pausiert/.test(await trow.innerText()), 'a paused training: a row in "Jetzt dran"');
await trow.click();
await p.waitForTimeout(1200);
const where = [await p.locator('.brand-claim').count(), await p.locator('.module-pill').first().innerText().catch(() => ''), (await p.locator('main').first().innerText().catch(() => '')).slice(0, 80).replace(/s+/g, ' ')];
ok(where[0] === 0 && /Training|Übung 1 von 1/i.test(where[1] + where[2]), `a tap goes to Training – the paused session (${where.join(' · ')})`);
// today's tournament: "Turnier heute" – once every flight has finished, no more (Sascha 12.11.2026: "Turnier ist vorbei,
// alle sind fertig und die Scorekarten unterschrieben – es sollte unter Läuft gerade nicht mehr angezeigt werden")
{
  const holes = Array.from({ length: 18 }, (_, i) => ({ index: i, number: i + 1, label: String(i + 1), par: 4, strokeIndex: i + 1 }));
  const tour = (finished) => ({
    code: 'TOUR01',
    ev: { kind: 'round-event', id: 'ev-t', name: 'StoneGate Oaks', tournament: true, planned: true, date: day(0), course: { id: 'test-course', name: 'StoneGate Golf Club – Oaks' }, loopOrder: ['A'], holes, createdAt: now,
      flights: Object.fromEntries(['f1', 'f2'].map((id) => [id, { id, players: [{ id: `${id}a`, name: id === 'f1' ? 'Sascha' : 'Erik' }], scores: {}, ...(finished ? { finishedAt: now } : {}) }])) },
  });
  await seed([], { 'golfos.tours.v1': [tour(false)] });
  const row = () => p.locator('.running-card .running-row').filter({ hasText: 'Turnier heute' });
  ok((await row().count()) === 1, 'today\'s tournament still played: "Turnier heute"');
  await seed([], { 'golfos.tours.v1': [tour(true)] });
  ok((await row().count()) === 0, 'every flight finished: no "Turnier heute" any more');
}

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(bad ? 1 : 0);
