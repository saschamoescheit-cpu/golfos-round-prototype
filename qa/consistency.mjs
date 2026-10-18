// QA: the same screens in Rounds, Games and Training side by side (Sascha 15.10.2026: "the usability the same in every
// module") – the start page, the module's first tab, the running round/game with its pull-up overview and the exit
// question, the list with the bin, the profile. Screenshots into SHOTS=<dir>, named <nn>-<module>-<screen>.png.
// Usage: SHOTS=<dir> node qa/consistency.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.env.SHOTS ?? '.';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
// a same-origin load cut off by the next page load (a freed tile blob, a heights file while the test navigates) –
// WebKit under test reports it as "…localhost:5173/… due to access control checks"; nothing is wrong in the app
p.on('pageerror', (e) => { if (!/(localhost:\d+|api\.open-meteo\.com)\/\S* due to access control/.test(e.message)) errs.push(e.message); });
let n = 0;
const shot = async (name) => {
  n++;
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${name}.png` });
  console.log('shot', n, name);
};
const safe = async (what, fn) => {
  try {
    await fn();
  } catch (e) {
    console.log('skip', what, String(e.message).split('\n')[0]);
  }
};
await p.goto(url);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.tip.shots.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '7,0', homeClub: 'Golfclub Hetzenhof' }));
});
await p.reload();
await p.waitForTimeout(1500);
await shot('start-modules');

// ---------- Rounds ----------
await safe('rounds', async () => {
  await p.locator('.module-card').filter({ hasText: 'Rounds' }).click();
  await p.waitForTimeout(800);
  await shot('rounds-play');
  await p.getByRole('button', { name: 'Neue Runde' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(1200);
  await p.getByText('Runde starten').click();
  await p.waitForTimeout(6000);
  await shot('rounds-hole');
  await p.locator('.hole-bar-handle').click();
  await shot('rounds-drawer');
  await p.locator('.hole-drawer').getByRole('button', { name: /Runde beenden/ }).click();
  await shot('rounds-finish-question');
  await p.getByRole('button', { name: 'Runde löschen' }).click();
  await p.waitForTimeout(800);
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await shot('rounds-list-bin');
});

// ---------- Games ----------
await safe('games', async () => {
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.module-switch').first().click();
  await p.waitForTimeout(500);
  await p.locator('.module-card').filter({ hasText: 'Games' }).click();
  await p.waitForTimeout(800);
  await shot('games-play');
  await p.getByRole('button', { name: 'Neues Spiel' }).click();
  await p.locator('.settings-row').filter({ hasText: 'Platz' }).click();
  await p.fill('#course-search', 'Hetzenhof');
  await p.waitForTimeout(2000);
  await p.locator('button.list-item').first().click();
  await p.waitForTimeout(800);
  await p.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
  await p.getByRole('button', { name: 'Spiel starten' }).click();
  await p.waitForTimeout(600);
  await shot('games-hole');
  await p.locator('.hole-bar-handle').click();
  await shot('games-drawer');
  await p.locator('.hole-drawer').getByRole('button', { name: 'Spiel beenden' }).click();
  await shot('games-finish-question');
  await p.getByRole('button', { name: 'Spiel löschen' }).click();
  await p.waitForTimeout(800);
  await p.locator('.tabbar').getByRole('button', { name: 'Spiele', exact: true }).click();
  await shot('games-list-bin');
});

// ---------- Training ----------
await safe('training', async () => {
  await p.locator('.tabbar button').filter({ hasText: 'Spielen' }).first().click();
  await p.waitForTimeout(400);
  await p.locator('.module-switch').first().click();
  await p.waitForTimeout(500);
  await p.locator('.module-card').filter({ hasText: 'Training' }).click();
  await p.waitForTimeout(1200);
  await shot('training-start');
  const tabs = await p.locator('.tabbar button').allInnerTexts();
  console.log('training tabs:', tabs.join(' · '));
  for (const t of tabs.slice(1, 3)) {
    await p.locator('.tabbar button').filter({ hasText: t.trim() }).first().click();
    await shot(`training-${t.trim().toLowerCase().replace(/[^a-zäöü]+/g, '-')}`);
  }
  await p.locator('.tabbar button').filter({ hasText: 'Profil' }).first().click();
  await shot('training-profile');
});
console.log(errs.join(' / ') || 'no page errors');
await b.close();
