// Every game mode with 1–4 players in the browser: set up the round (mode, scoring), enter three holes for every
// player or team in the score panel, read the leaderboard, finish the round. Checks the number of score blocks
// (teams in scramble and foursomes), that team rounds have no putts, and that nothing breaks.
// Usage: node modes.mjs <app url>
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
const ok = (cond, what) => console.log(`${cond ? '✓' : '✗'} ${what}`);
const PEOPLE = [
  ['Sascha', '4'],
  ['Ben', '10'],
  ['Chris', '2'],
  ['Thomas', '14'],
];
const ALL = [
  { n: 1, mode: 'Einfaches Spiel', scoring: 'Zählspiel', blocks: 1 },
  { n: 1, mode: 'Einfaches Spiel', scoring: 'Stableford', blocks: 1 },
  { n: 2, mode: 'Einfaches Spiel', scoring: 'Stableford', blocks: 2 },
  { n: 2, mode: 'Einzel (Lochspiel)', scoring: 'Zählspiel', blocks: 2, status: true },
  { n: 2, mode: 'Scramble', scoring: 'Zählspiel', blocks: 1, team: true },
  { n: 2, mode: 'Vierer', scoring: 'Stableford', blocks: 1, team: true },
  { n: 3, mode: 'Scramble', scoring: 'Zählspiel', blocks: 1, team: true },
  { n: 4, mode: 'Einfaches Spiel', scoring: 'Zählspiel', blocks: 4 },
  { n: 4, mode: 'Better Ball', scoring: 'Zählspiel', blocks: 4 },
  { n: 4, mode: 'Better Ball (Lochspiel)', scoring: 'Zählspiel', blocks: 4, status: true },
  { n: 4, mode: 'Scramble', scoring: 'Stableford', blocks: 2, team: true },
  { n: 4, mode: 'Scramble (Lochspiel)', scoring: 'Zählspiel', blocks: 2, team: true, status: true },
  { n: 4, mode: 'Vierer', scoring: 'Zählspiel', blocks: 2, team: true },
  { n: 4, mode: 'Vierer (Lochspiel)', scoring: 'Zählspiel', blocks: 2, team: true, status: true },
];

const CASES = process.argv[3] ? ALL.filter((c) => c.mode.includes(process.argv[3])) : ALL;
for (const c of CASES) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.7808, longitude: 9.689, accuracy: 5 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  const errs = [];
  // a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
  const label = `${c.n} Sp. · ${c.mode} · ${c.scoring}`;
  let step = 'setup';
  try {
    await p.goto(url);
    await p.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1'); sessionStorage.setItem('golfos.module', 'rounds');
      localStorage.setItem('golfos.tip.shots.v1', '1');
    });
    await p.reload();
    await p.waitForTimeout(700);
    await p.getByRole('button', { name: 'Neue Runde' }).click();
    await p.waitForTimeout(1200);
    await p.fill('#course-search', 'Hetzenhof');
    await p.waitForTimeout(2000);
    await p.locator('button.list-item').first().click();
    await p.getByText('Runde starten').waitFor({ timeout: 30000 });
    await p.getByRole('button', { name: /A · 9 Löcher/ }).click();
    await p.locator('input[id^="name-"]').first().fill(PEOPLE[0][0]);
    await p.locator('input[id^="hcp-"]').first().fill(PEOPLE[0][1]);
    for (let k = 1; k < c.n; k++) {
      await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
      await p.locator('input[id^="name-"]').last().fill(PEOPLE[k][0]);
      await p.locator('input[id^="hcp-"]').last().fill(PEOPLE[k][1]);
    }
    step = 'mode';
    await p.locator('.settings-row').filter({ hasText: 'Modus' }).click();
    await p.locator('.pick-option strong').getByText(c.mode, { exact: true }).click();
    await p.locator('.settings-row').filter({ hasText: 'Scoring' }).click();
    await p.locator('.pick-option').filter({ hasText: c.scoring }).first().click();
    const startable = await p.getByRole('button', { name: 'Runde starten' }).isEnabled();
    if (!startable) throw new Error('start button disabled');
    await p.getByRole('button', { name: 'Runde starten' }).click();
    await p.waitForTimeout(5000);
    step = 'score';
    // three holes in the score panel, every block a different score
    await p.locator('.map-score').click();
    await p.waitForTimeout(300);
    const blocks = await p.locator('.score-player').count();
    ok(blocks === c.blocks, `${label}: ${blocks} score blocks (expected ${c.blocks})`);
    if (c.team) ok((await p.locator('.score-panel').getByText('Putts', { exact: true }).count()) === 0, `${label}: team – no putts`);
    for (let h = 0; h < 3; h++) {
      // the sheet closes on the next hole (Sascha 15.10.2026) – open it again there
      if (h > 0) {
        await p.locator('.map-score').click();
        await p.waitForTimeout(300);
      }
      for (let k = 0; k < blocks; k++) {
        const plus = p.locator('.score-player').nth(k).getByRole('button', { name: /Schläge plus eins/ });
        for (let x = 0; x <= (k + h) % 3; x++) await plus.click();
      }
      await p.getByRole('button', { name: 'Nächstes Loch' }).click();
      await p.waitForTimeout(500);
    }
    const round = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0]);
    const scores = round.players.map((pl) => `${pl.name} (SV ${pl.playingHandicap}): ${round.entries[pl.id].slice(0, 3).map((e) => e.strokes).join('/')}`);
    ok(round.players.length === c.blocks && round.entries[round.players[0].id].slice(0, 3).every((e) => e.strokes != null), `${label}: stored ${scores.join(' · ')}`);
    step = 'leaderboard';
    if (c.blocks > 1) {
      // the leaderboard sits in the hole overview, pulled up from the hole bar
      await p.locator('.hole-bar-handle').click();
      await p.locator('.hole-drawer').getByRole('button', { name: 'Leaderboard' }).click();
      await p.waitForTimeout(300);
      const board = (await p.locator('.leaderboard').innerText()).replace(/\s+/g, ' ');
      ok(!c.status || /auf|All Square|gewinnt/.test(board), `${label}: leaderboard "${board.replace('Leaderboard ', '')}"`);
      await p.getByRole('button', { name: 'Schließen' }).last().click();
    }
    step = 'finish';
    // the hole overview (pulled up from the hole bar) has "Finish round"
    await p.locator('.hole-bar-handle').click();
    await p.locator('.hole-drawer').getByRole('button', { name: 'Runde beenden' }).click();
    await p.getByRole('button', { name: 'Speichern & beenden' }).click();
    await p.waitForTimeout(800);
    const card = await p.locator('.finish-card').innerText().catch(() => '');
    ok(/gespeichert/.test(card) && (c.team ? !/Prüfen & signieren/.test(card) : /Prüfen & signieren/.test(card) && /Als Runde behalten ✓/.test(card)), `${label}: finished – ${c.team ? 'no shot check (team)' : '"Prüfen & signieren" offered, kept as a round by default'}`);
    if (!c.team) {
      // the third way (Sascha 18.10.2026): check & sign later – the round waits under "prüfen & signieren"
      await p.locator('.finish-card').getByRole('button', { name: /^Später prüfen & signieren/ }).click();
      await p.waitForTimeout(300);
      const cap = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].capture);
      ok(cap === 'full' && /Später prüfen & signieren ✓/.test(await p.locator('.finish-card').innerText()), `${label}: "Später prüfen & signieren" keeps it open to check & sign (${cap})`);
      ok((await p.locator('.sc-actions').getByRole('button', { name: 'Teilen' }).count()) === 1 && (await p.getByRole('button', { name: 'Rundendaten exportieren' }).count()) === 0, `${label}: share in the action row, no data export`);
    }
  } catch (e) {
    ok(false, `${label} [${step}]: ${String(e.message).split('\n')[0]}`);
  }
  if (errs.length) ok(false, `${label}: page errors ${errs.join(' / ')}`);
  await ctx.close();
}
await b.close();
