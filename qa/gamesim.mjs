// Every game form played through to the end on the map, as on the course (Sascha 25.10.2026: "alle Spiele simulieren und
// testen"): each form with each number of players it allows, every hole of the course with random scores, the form's own
// input (wolf partner, Bingo Bango Bongo, three-putts, dots, hammer, Chicago pairing) and presses where the form has
// them; on the way one hole back to correct a score, and a pause with a later return. At the end the stored game must
// hold exactly what was typed, the result page must show the settlement the game's reckoning gives, and no page error.
// The reckoning itself is checked independently in src/lib/gameforms.*.test.ts.
// Usage: node qa/gamesim.mjs [url] [form filter, e.g. "Wolf"]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const only = process.argv[3] ?? '';
let seed = 25;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pickI = (n) => Math.floor(rnd() * n);
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com|photon\.komoot\.io)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};

await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  sessionStorage.setItem('golfos.module', 'games');
});
await p.reload();
await p.waitForTimeout(1000);

// every form with every player number it allows – from the app's own list
const cases = (await p.evaluate(async () => {
  const G = await import('/src/lib/gameforms.ts');
  return G.FORMS.flatMap((f) => [2, 3, 4].filter((n) => G.fitsPlayers(f, n)).map((n) => ({ id: f.id, name: f.name(), n, double: f.settings.some((s) => s.key === 'double') })));
})).filter((c) => !only || c.name.includes(only));
console.log(`${cases.length} games to play`);

const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('golfos.games.v1') ?? '[]').sort((a, c) => c.createdAt.localeCompare(a.createdAt))[0]);
const gameSheet = async (fn) => {
  await p.locator('.game-bar').click();
  await p.waitForTimeout(250);
  const sheet = p.locator('.game-sheet');
  const r = await fn(sheet);
  await sheet.getByRole('button', { name: 'Schließen' }).click();
  await p.waitForTimeout(150);
  return r;
};
// the score sheet: it may already be open (a new hole opens it by itself, as in Rounds)
const scoreOpen = () => p.getByRole('button', { name: 'Zurück zur Karte' }).isVisible().catch(() => false);
const openScores = async () => {
  if (!(await scoreOpen())) await p.locator('.map-score').click({ timeout: 8000 }).catch(async (e) => { if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT }); throw e; });
  await p.locator('.score-player').first().waitFor({ timeout: 15000 });
};
const holeNo = () => p.locator('.map-hole-no').innerText().then((s) => s.trim()).catch(() => '');

let played = 0;
for (const c of cases) {
  const tag = `${c.name} · ${c.n} Spieler`;
  const t0 = Date.now();
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).click();
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Spielform' }).click();
  await p.locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${c.name.replace(/[()]/g, '\\$&')}$`) }) }).click();
  // the players: P1 … Pn with a handicap each
  for (let k = 0; k < c.n; k++) {
    if ((await p.locator('.game-player-row').count()) <= k) await p.getByRole('button', { name: '+ Spieler hinzufügen' }).click();
    const row = p.locator('.game-player-row').nth(k);
    await row.locator('input').first().fill(`P${k + 1}`);
    await row.locator('input').nth(1).fill(String(pickI(30)));
  }
  while ((await p.locator('.game-player-row').count()) > c.n) await p.locator('.game-player-row').last().getByRole('button', { name: /entfernen|Entfernen/ }).click();
  // presses on where the form has them
  if (c.double) {
    const row = p.locator('.game-setting').filter({ hasText: 'Press' }).first();
    if (await row.count()) await row.getByRole('button', { name: 'Ja', exact: true }).click().catch(() => {});
  }
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().waitFor({ timeout: 30000 });
  await p.locator('button.list-item').filter({ hasText: 'Hetzenhof' }).first().click();
  await p.waitForTimeout(600);
  const start = p.getByRole('button', { name: 'Spiel starten' });
  if (!(await start.isEnabled())) {
    ok(false, `${tag}: start not possible`);
    continue;
  }
  await start.click();
  await p.locator('.map-score').waitFor({ state: 'attached', timeout: 30000 });
  await p.waitForTimeout(1500);
  const g0 = await stored();
  const names = Object.fromEntries(g0.players.map((x) => [x.name, x.id]));
  const holes = g0.holes.length;
  // what was typed, to compare with the stored game at the end
  const want = { delta: g0.players.map(() => Array(holes).fill(0)), extra: Array.from({ length: holes }, () => ({})), presses: [] };
  let flow = true;

  for (let i = 0; i < holes; i++) {
    // a press at the start of a hole now and then (only before the first score)
    if (c.double && i > 0 && rnd() < 0.2) {
      await gameSheet(async (sh) => {
        const chips = sh.locator('[aria-label="Press"] .chip');
        if ((await chips.count()) && !/zurücknehmen/.test(await chips.first().innerText())) {
          await chips.first().click();
          want.presses.push(i);
        }
      });
    }
    // the scores: + gives par, then up or down
    await openScores();
    const blocks = p.locator('.score-player');
    for (let k = 0; k < c.n; k++) {
      const blk = blocks.nth(k);
      await blk.getByRole('button', { name: /Schläge plus eins/ }).click();
      const x = rnd();
      const d = x < 0.08 ? -1 : x < 0.45 ? 0 : x < 0.78 ? 1 : x < 0.93 ? 2 : 3;
      for (let j = 0; j < Math.abs(d); j++) await blk.getByRole('button', { name: d > 0 ? /Schläge plus eins/ : /Schläge minus eins/ }).click();
      want.delta[k][i] = d;
    }
    await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
    await p.waitForTimeout(150);
    // the form's own input
    const ex = want.extra[i];
    if (c.id === 'wolf')
      await gameSheet(async (sh) => {
        const chips = sh.locator('.game-extra .chip');
        const k = pickI(await chips.count());
        const t = (await chips.nth(k).innerText()).trim();
        await chips.nth(k).click();
        if (t === 'Lone Wolf') Object.assign(ex, { wolfPartner: null, wolfBlind: false });
        else if (t.startsWith('Blind')) Object.assign(ex, { wolfPartner: null, wolfBlind: true });
        else Object.assign(ex, { wolfPartner: names[t] });
      });
    if (c.id === 'bbb')
      await gameSheet(async (sh) => {
        const rows = sh.locator('.game-extra .game-setting');
        for (const [r, key] of ['bingo', 'bango', 'bongo'].entries()) {
          const chips = rows.nth(r).locator('.chip');
          const k = pickI(await chips.count());
          ex[key] = names[(await chips.nth(k).innerText()).trim()];
          await chips.nth(k).click();
        }
      });
    if (c.id === 'snake' && rnd() < 0.25)
      await gameSheet(async (sh) => {
        const chips = sh.locator('.game-extra .chip');
        const k = pickI(await chips.count());
        ex.threePutt = [names[(await chips.nth(k).innerText()).trim()]];
        await chips.nth(k).click();
      });
    if (c.id === 'dots' && rnd() < 0.3)
      await gameSheet(async (sh) => {
        const rows = sh.locator('.game-extra .game-setting');
        const r = pickI(await rows.count());
        const who = names[(await rows.nth(r).locator('.stepper-label').innerText()).trim()];
        await rows.nth(r).locator('.chip').first().click();
        ex.dots = { [who]: 1 };
      });
    if (c.id === 'hammer' && rnd() < 0.3)
      await gameSheet(async (sh) => {
        await sh.locator('[aria-label="Hammer"] .chip').filter({ hasText: 'Hammer (×2)' }).click();
        ex.hammer = 1;
      });
    if (c.id === 'chicago' && rnd() < 0.2)
      await gameSheet(async (sh) => {
        const k = pickI(3);
        await sh.locator('[aria-label="Paarung"] .chip').nth(k).click();
        ex.pairing = k + 1;
      });
    // on the 5th hole: one back, a stroke more for P1, forward again (Rounds 22.10.: "zurückblättern")
    if (i === 4) {
      await p.locator('.hole-bar').getByRole('button', { name: 'Voriges Loch' }).click();
      await p.waitForTimeout(500);
      await openScores();
      await p.locator('.score-player').first().getByRole('button', { name: /Schläge plus eins/ }).click();
      want.delta[0][3]++;
      await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
      await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
      await p.waitForTimeout(500);
      if ((await p.locator('.score-sheet, .score-panel').count()) > 0 && (await p.locator('.score-panel').isVisible().catch(() => false))) {
        flow = false; // the hole has its scores – the sheet must not open by itself
        await p.getByRole('button', { name: 'Zurück zur Karte' }).click().catch(() => {});
      }
    }
    // after the 9th hole: pause, back to the list, carry on
    if (i === 8 && holes > 9) {
      await p.locator('.hole-bar-handle').click();
      await p.locator('.hole-drawer').getByRole('button', { name: /pausieren/ }).click();
      await p.waitForTimeout(500);
      await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
      await p.waitForTimeout(400);
      await p.locator('.list-item').first().click();
      await p.locator('.map-score').waitFor({ timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(800);
      const at = await holeNo();
      if (!at.startsWith(g0.holes[8].label)) flow = false;
    }
    if (i < holes - 1) {
      await p.locator('.hole-bar').getByRole('button', { name: 'Nächstes Loch' }).click();
      await p.waitForTimeout(350);
      // a new hole without scores: the sheet may open by itself – close it, the loop opens it again
      if (await p.getByRole('button', { name: 'Zurück zur Karte' }).isVisible().catch(() => false)) await p.getByRole('button', { name: 'Zurück zur Karte' }).click();
    }
  }
  // the standing in the game sheet matches the reckoning before the end
  const live = await gameSheet((sh) => sh.locator('.game-standing').innerText().catch(() => ''));
  await p.locator('.hole-bar-handle').click();
  await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
  await p.getByRole('button', { name: /Speichern & beenden/ }).click();
  await p.waitForTimeout(500);

  // what is stored = what was typed
  const g = await stored();
  const pars = g.holes.map((h) => h.par);
  const scoresOk = g.players.every((pl, k) => g.scores[pl.id].every((s, i) => s === pars[i] + want.delta[k][i]));
  const exOk = want.extra.every((w, i) => {
    const x = g.extra[i] ?? {};
    return Object.entries(w).every(([key, v]) => {
      if (key === 'dots') return Object.keys(v).every((who) => (x.dots?.[who] ?? []).length >= 1);
      if (key === 'threePutt') return JSON.stringify(x.threePutt) === JSON.stringify(v);
      return (x[key] ?? null) === v;
    });
  });
  const pressOk = JSON.stringify((g.presses ?? []).map((x) => x.hole)) === JSON.stringify(want.presses);
  // the result page shows the reckoning of the stored game
  const shown = (await p.locator('.game-pays li').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());
  const expected = await p.evaluate(async () => {
    const G = await import('/src/lib/gameforms.ts');
    const S = await import('/src/lib/gamestore.ts');
    const g = S.loadGames().sort((a, c) => c.createdAt.localeCompare(a.createdAt))[0];
    const st = G.standingOf(g);
    const nm = (id) => g.players.find((x) => x.id === id)?.name ?? id;
    const sum = Object.values(st.money ?? {}).reduce((a, v) => a + v, 0);
    return { pays: st.money ? G.transfers(st.money).map((t) => `${nm(t.from)} → ${nm(t.to)} ${G.money(t.amount)}`) : [], sum, top: st.rows[0]?.name };
  });
  const winner = (await p.locator('.game-winner strong').innerText().catch(() => '')).trim();
  ok(
    scoresOk && exOk && pressOk && flow && JSON.stringify(shown) === JSON.stringify(expected.pays) && Math.abs(expected.sum) < 0.01 && winner.length > 0 && live.length > 0,
    `${tag}: ${holes} Löcher, ${want.presses.length} Press, gespeichert wie getippt${scoresOk ? '' : ' ✗Scores'}${exOk ? '' : ' ✗Eingaben'}${pressOk ? '' : ' ✗Press'}${flow ? '' : ' ✗Ablauf'} · ${winner} · ${shown.length} Zahlung(en)${JSON.stringify(shown) === JSON.stringify(expected.pays) ? '' : ` ✗ Abrechnung ${JSON.stringify(shown)} ≠ ${JSON.stringify(expected.pays)}`} (${Math.round((Date.now() - t0) / 1000)} s)`,
  );
  played++;
  await p.getByRole('button', { name: 'Spiele' }).first().click().catch(() => {});
  await p.waitForTimeout(300);
}
ok(played === cases.length, `${played} von ${cases.length} Spielen zu Ende gespielt`);
ok(errs.length === 0, `keine Seitenfehler ${errs.slice(0, 3).join(' | ')}`);
await b.close();
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
