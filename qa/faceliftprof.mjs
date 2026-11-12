// QA Facelift 11.11.2026 (prof) – the approved items not covered by their screens' own tests:
//  R12 the scorecard's "Heute gespieltes Handicap": the title small above, course rating and slope the same row as in
//      "Neue Runde" (RatingLine) – a change saved by itself, no "Ändern" link, no "Speichern" button
//  S1  "Runde abgerechnet" on the start page: a row under "Jetzt dran" that opens the pool, swiped away ("Rückgängig")
//  O5  the StepPick sheet: a round played with the SVG tick before its name, no "✓ …" in the text
// Usage: node qa/faceliftprof.mjs [url]   (SHOTS=<dir> for screenshots)
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control/.test(e.message)) errs.push(e.message); });
const shot = async (name) => process.env.SHOTS && (await p.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }));
const iso = (k) => new Date(Date.now() + k * 86400000).toISOString().slice(0, 10);

// ---------- R12 · the handicap played today on the scorecard ----------
await p.goto(url);
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  sessionStorage.setItem('golfos.module', 'rounds');
  const holes = Array.from({ length: 18 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: 4, strokeIndex: k + 1 }));
  const entry = () => ({ strokes: 5, putts: 2, pickedUp: false, fairway: null, penalties: 0 });
  const round = (id, rating) => ({ id, createdAt: '2026-11-10T10:00:00Z', finishedAt: '2026-11-10T14:00:00Z', signedAt: '2026-11-10T14:05:00Z', courseId: 'qa-course', courseName: id === 'r1' ? 'QA Rated' : 'QA Unrated', loopOrder: ['Main'], holes, mode: 'simple', players: [{ id: 'me', name: 'Sascha', playingHandicap: 12, isMe: true }], entries: { me: holes.map(entry) }, currentHole: 17, ...(rating ? { rating } : {}) });
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([round('r1', { cr: 72.2, slope: 136 }), round('r2', null)]));
});
await p.reload();
await p.waitForTimeout(1200);
const openRound = async (name) => {
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await p.waitForTimeout(500);
  await p.locator('.list-item').filter({ hasText: name }).first().click();
  await p.waitForTimeout(900);
};
await openRound('QA Rated');
const hcp = p.getByRole('region', { name: 'Heute gespieltes Handicap' });
await hcp.scrollIntoViewIfNeeded().catch(() => {});
ok((await hcp.count()) === 1 && (await hcp.locator('> .eyebrow').textContent()) === 'Heute gespieltes Handicap' && (await hcp.locator('h2').count()) === 0, 'R12: the title small above the block, no heading in the card');
const line = hcp.locator('.rating-line');
ok((await line.count()) === 1 && /Course Rating 72,2 · Slope 136/.test((await line.innerText()).replace(/\s+/g, ' ')), `the same row as in "Neue Runde": ${(await line.innerText()).replace(/\s+/g, ' ')}`);
ok((await hcp.getByRole('button', { name: 'Ändern' }).count()) === 0 && (await hcp.getByRole('button', { name: 'Speichern' }).count()) === 0, 'no "Ändern" link, no "Speichern" button');
const diff0 = (await hcp.locator('.played-hcp .num').innerText()).trim();
await shot('r12-row');
await line.click();
await p.waitForTimeout(300);
ok((await hcp.locator('#setup-cr').count()) === 1 && /von selbst gespeichert/.test(await hcp.locator('.autosave-note').innerText()), 'a tap opens course rating and slope – "Änderungen werden von selbst gespeichert"');
await hcp.locator('#setup-slope').fill('113');
await p.waitForTimeout(1500);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1')).find((r) => r.id === 'r1')?.rating);
ok(stored?.slope === 113 && stored?.cr === 72.2, `saved by itself a moment after the last digit (${JSON.stringify(stored)})`);
ok(/Gespeichert/.test(await hcp.locator('.autosave-note').innerText()), 'the quiet line: "Gespeichert"');
await p.getByRole('button', { name: 'Fertig', exact: true }).click(); // saves by itself: "Fertig" floats bottom right (13.11.2026)
await p.waitForTimeout(300);
const diff1 = (await hcp.locator('.played-hcp .num').innerText()).trim();
ok(diff1 !== diff0 && /Slope 113/.test((await hcp.locator('.rating-line').innerText()).replace(/\s+/g, ' ')), `the differential follows: ${diff0} → ${diff1}`);
await shot('r12-saved');
// a round without course rating: the row asks for it, with the scorecard's own line
await p.goto(url);
await p.waitForTimeout(1000);
await openRound('QA Unrated');
const hcp2 = p.getByRole('region', { name: 'Heute gespieltes Handicap' });
ok(/Course Rating und Slope eintragen/.test(await hcp2.innerText()) && /welches Handicap du heute gespielt hast/.test(await hcp2.innerText()) && !/Vorgabe aus dem HCP geschätzt/.test(await hcp2.innerText()), 'no rating yet: "Course Rating und Slope eintragen" with the scorecard\'s own line');

// ---------- S1 · "Runde abgerechnet" on the start page ----------
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(
  async ({ from, to, day }) => {
    const W = await import('/src/lib/wagers.ts');
    const S = await import('/src/lib/scoring.ts');
    const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
    const bet = { id: 'w', player: 'c', kind: 'birdieRun', target: 3, stake: 20, payout: 'success', attempts: 'any' };
    const played = { id: day, day, course: 'Orange Lake', pars: PARS, entries: PARS.map((x, i) => ({ ...S.emptyEntry(), strokes: i < 3 ? x - 1 : x })), hcp: 10, counted: true };
    const progress = { w: W.judge(bet, { from, to }, [played]) };
    const pool = { kind: 'wager-pool', id: 'p', name: 'USA-Wetten', from, to, createdAt: '', currency: 'USD', players: [{ id: 'c', name: 'Chris' }, { id: 'e', name: 'Erik' }, { id: 's', name: 'Sascha' }], wagers: [bet], progress };
    localStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.pools.v1', JSON.stringify([{ code: 'ABC123', me: 's', pool }]));
    sessionStorage.removeItem('golfos.module');
  },
  { from: iso(-6), to: iso(-1), day: iso(-2) },
);
await p.reload();
await p.waitForTimeout(1500);
const settle = p.getByRole('region', { name: 'Runde abgerechnet' });
const label = `USA-Wetten · Runde ${iso(-2).slice(8, 10)}.${iso(-2).slice(5, 7)}.`;
ok((await settle.count()) === 1, 'S1: the settled round on the start page');
const hasRunning = (await p.locator('.running-card').count()) > 0;
ok((await settle.locator('> .eyebrow').textContent()) === 'Runde abgerechnet' && (!hasRunning || (await settle.boundingBox()).y < (await p.locator('.running-card').boundingBox()).y), 'its own title "Runde abgerechnet", above "Läuft gerade" (12.11.2026)');
const row = settle.locator('.swipe .list-item');
const rowText = (await row.innerText()).replace(/\s+/g, ' ');
ok((await row.count()) === 1 && rowText.includes(label) && /Du −20/.test(rowText) && /Chris \+40/.test(rowText), `a list row: ${rowText}`);
ok((await settle.getByRole('button', { name: 'Verstanden' }).count()) === 0 && (await settle.locator('.badge').count()) === 0 && (await settle.locator('.link-eyebrow').count()) === 0, 'no "Verstanden" button, no badges, no link in the eyebrow');
const box = await settle.boundingBox();
const brand = await p.locator('.brand').boundingBox();
ok(!!box && !!brand && box.y > brand.y, 'below GOLFOS, with "Jetzt dran" – not above the brand');
await shot('s1-row');
// swiped away: put aside, "Rückgängig" brings it back
const swipeAway = () =>
  settle.locator('.swipe').first().evaluate((el) => {
    const f = el.querySelector('.swipe-front');
    const r = f.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const fire = (type, x) => f.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
    fire('pointerdown', r.right - 10);
    for (let x = r.right - 20; x > r.left - 40; x -= 30) fire('pointermove', x);
    fire('pointerup', r.left - 40);
  });
await swipeAway();
await p.waitForTimeout(600);
ok((await settle.count()) === 0 && /Ausgeblendet/.test(await p.locator('.undo-toast').innerText()), 'swiped away: gone, the toast "Ausgeblendet · Rückgängig"');
await p.locator('.undo-toast').getByRole('button', { name: 'Rückgängig' }).click();
await p.waitForTimeout(400);
ok((await settle.count()) === 1, '"Rückgängig": the row back');
// a tap opens the pool on that round
await row.click();
await p.waitForTimeout(1500);
ok((await p.locator('.pool-standings').count()) === 1 && (await p.getByRole('region', { name: 'Runde abgerechnet' }).count()) === 0, 'a tap opens the pool');
await p.evaluate(() => sessionStorage.removeItem('golfos.module'));
await p.goto(url);
await p.waitForTimeout(1200);
await swipeAway();
await p.waitForTimeout(600);
await p.reload();
await p.waitForTimeout(1200);
ok((await p.getByRole('region', { name: 'Runde abgerechnet' }).count()) === 0, 'put aside for good once the toast is gone');

// ---------- O5 · the StepPick sheet: a round played ticked with an SVG ----------
{
  const res = await p.evaluate(async () => {
    // the app's own React (the same module the page loaded), the switch rendered into a box of its own
    const urls = performance.getEntriesByType('resource').map((e) => e.name);
    const find = (re) => urls.find((u) => re.test(u));
    const React = (await import(find(/\/node_modules\/\.vite\/deps\/react\.js/))).default;
    const rd = await import(find(/\/node_modules\/\.vite\/deps\/react-dom_client\.js/));
    const createRoot = rd.createRoot ?? rd.default.createRoot;
    const { StepPick } = await import('/src/components/Settings.tsx');
    const host = document.createElement('div');
    host.id = 'qa-steppick';
    document.querySelector('main')?.prepend(host);
    createRoot(host).render(React.createElement(StepPick, { label: 'QA Runde', value: 1, onChange: () => {}, options: [{ value: 0, name: 'Runde 1 · 10.11.', done: true }, { value: 1, name: 'Runde 2 · 11.11.' }] }));
    await new Promise((r) => setTimeout(r, 300));
    return !!document.querySelector('#qa-steppick .step-pick-now');
  });
  ok(res, 'O5: a StepPick rendered with a round played');
  await p.locator('#qa-steppick .step-pick-now').click();
  const dlg = p.getByRole('dialog', { name: 'QA Runde' });
  await dlg.waitFor();
  const names = (await dlg.locator('.pick-option strong').allInnerTexts()).map((t) => t.trim());
  ok(names[0] === 'Runde 1 · 10.11.' && !names.some((n) => n.includes('✓')) && (await dlg.locator('.pick-option').nth(0).locator('svg.step-pick-tick').count()) === 1 && (await dlg.locator('.pick-option').nth(1).locator('svg.step-pick-tick').count()) === 0, `the sheet: the round played with the SVG tick, no "✓" in the name (${names.join(' | ')})`);
}

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
