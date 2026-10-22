// Every game mode with 1–4 players in the browser: set up the round (mode, scoring), enter three holes for every
// player or team in the score panel, read the leaderboard, finish the round. Checks the number of score blocks
// (teams in scramble and foursomes), that team rounds have no putts, and that nothing breaks.
// Usage: node modes.mjs <app url>
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

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
  await mockNet(ctx);
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
    // the HCP is typed, the playing handicap follows and is shown, not typed (Sascha 21.10.2026); 9 holes: half
    if (c.n === 4 && c.mode === 'Einfaches Spiel') {
      // Hetzenhof A from yellow: the A+B rating (71.6 / 130, par 71), halved for 9 holes (Sascha 21.10.2026)
      const shown = await p.locator('.playing-hcp').allInnerTexts();
      const want = PEOPLE.slice(0, c.n).map(([, h]) => String(Math.round((Number(h) * (130 / 113) + (71.6 - 71)) / 2)));
      ok(shown.join() === want.join() && (await p.locator('.playing-hcp input, input.playing-hcp').count()) === 0, `setup: HCP typed, playing handicap from course rating and slope (${shown.join(' · ')} – want ${want.join(' · ')})`);
      const line = (await p.locator('.rating-line').innerText()).replace(/\s+/g, ' ');
      ok(/Course Rating 71,6 · Slope 130/.test(line), `setup: course rating and slope shown (${line})`);
      // corrected from the club's scorecard: kept, the playing handicaps follow (with the holes' par – A twice: 72)
      await p.locator('.rating-line').click();
      await p.fill('#setup-cr', '73,0');
      await p.fill('#setup-slope', '140');
      await p.locator('.rating-form').getByRole('button', { name: 'Speichern' }).click();
      await p.waitForTimeout(200);
      const shown2 = await p.locator('.playing-hcp').allInnerTexts();
      const want2 = PEOPLE.slice(0, c.n).map(([, h]) => String(Math.round((Number(h) * (140 / 113) + (73 - 72)) / 2)));
      ok(/Course Rating 73,0 · Slope 140/.test(await p.locator('.rating-line').innerText()) && shown2.join() === want2.join(), `setup: own course rating saved, playing handicaps follow (${shown2.join(' · ')})`);
      // the tee per player: Ben (HCP 10) from red – red A+B 66,2 / 119, par 68: (10 × 119/113 − 1,8) / 2 = 4
      ok((await p.locator('.player-row .tee-pick').count()) === c.n && (await p.locator('.tee-row').count()) === 0 && (await p.locator('.player-row').first().locator('.field-label').first().innerText()) === 'Tee', 'setup: name · tee · HCP · playing handicap in each player row, no tee block of its own');
      await p.locator('.player-row').nth(1).locator('.tee-pick').click();
      await p.getByRole('dialog', { name: 'Tee' }).locator('.pick-option').filter({ hasText: 'Rot' }).click();
      await p.waitForTimeout(200);
      const shown3 = await p.locator('.playing-hcp').allInnerTexts();
      ok(shown3[1] === '4' && shown3[0] === shown2[0], `setup: Ben from red gets his own playing handicap (${shown3.join(' · ')})`);
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
    const y = async (loc) => (await loc.boundingBox())?.y ?? -1;
    const stats = p.getByRole('heading', { name: 'Deine Statistik' });
    await p.getByRole('button', { name: 'Speichern & beenden' }).click();
    await p.waitForTimeout(800);
    // the state on top after saving – changed there (Sascha 20.10.2026: "the state above the scorecard")
    const st = p.locator('.sc-status');
    const stText = await st.innerText().catch(() => '');
    ok((await st.count()) === 1 && /Runde gespeichert ✓/.test(stText) && (await y(st)) < (await y(p.locator('.sc-hero'))) && (await p.locator('.sign-card').count()) === 0, `${label}: finished – the state on top ("${stText.split(String.fromCharCode(10))[0]}")`);
    void stats;
    if (!c.team) {
      ok((await p.locator('.sc-actions').getByRole('button', { name: 'Schläge prüfen' }).count()) === 1 && (await p.locator('.sc-actions').getByRole('button', { name: 'Teilen' }).count()) === 1 && (await p.locator('.sc-actions').getByRole('button', { name: 'Löschen' }).count()) === 1, `${label}: the row of actions: check shots, share, delete`);
      await st.click();
      const sheet = p.getByRole('dialog', { name: 'Status der Runde' });
      ok(/Jetzt prüfen & signieren/.test(await sheet.innerText()) && /Nur speichern/.test(await sheet.innerText()), `${label}: the ways in the state's sheet`);
      await sheet.getByRole('button', { name: /^Später prüfen & signieren/ }).click();
      await p.waitForTimeout(400);
      const cap = await p.evaluate(() => JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0].capture);
      ok(cap === 'full' && /Prüfen & signieren/.test(await st.innerText()), `${label}: "Später prüfen & signieren" – the state says so (${cap})`);
    }
  } catch (e) {
    ok(false, `${label} [${step}]: ${String(e.message).split('\n')[0]}`);
  }
  if (errs.length) ok(false, `${label}: page errors ${errs.join(' / ')}`);
  await ctx.close();
}
await b.close();
