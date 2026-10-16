// QA: one game on two phones (Sascha 15.10.2026) – the host invites (code + QR), the guest joins with the code, both
// enter scores, both see both. Supabase is simulated in this script (the table golfos_shared_games), the app is real.
// Usage: node qa/sharegame.mjs [url]
import { webkit, devices } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const b = await webkit.launch();
let fails = 0;
const ok = (cond, what) => {
  console.log(`${cond ? '✓' : '✗'} ${what}`);
  if (!cond) fails++;
};
// ---------- the simulated server ----------
const shared = new Map(); // code → { game, members }
async function serve(route) {
  const req = route.request();
  const u = new URL(req.url());
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body) });
  if (u.pathname.endsWith('/golfos_items')) return json(200, []);
  if (u.pathname.endsWith('/rpc/golfos_join_game')) {
    const { join_code } = JSON.parse(req.postData() ?? '{}');
    const row = shared.get(join_code);
    return json(200, row ? row.game : null);
  }
  if (u.pathname.endsWith('/golfos_shared_games')) {
    const code = (u.searchParams.get('code') ?? '').replace(/^eq\./, '');
    if (req.method() === 'GET') return json(200, code ? (shared.has(code) ? [{ game: shared.get(code).game }] : []) : []);
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData());
      if (shared.has(row.code)) return json(409, { code: '23505' });
      shared.set(row.code, { game: row.game });
      return json(201, null);
    }
    if (req.method() === 'PATCH') {
      shared.get(code).game = JSON.parse(req.postData()).game;
      return json(204, null);
    }
  }
  return json(404, { message: 'not simulated' });
}
async function phone(name) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
  await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth)\//, serve);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.evaluate((name) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: name, lastName: '', hcpIndex: '10', homeClub: '' }));
    // signed in (the token is only checked by the simulated server)
    localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: `${name}@test`, name }));
    sessionStorage.setItem('golfos.module', 'games');
  }, name);
  await p.reload();
  await p.waitForTimeout(1500);
  return { p, errs };
}
const host = await phone('Sascha');
const guest = await phone('Ben');

// host: a new game on Hetzenhof with Ben, invite
const H = host.p;
await H.getByRole('button', { name: 'Neues Spiel' }).click();
await H.locator('.settings-row').filter({ hasText: 'Platz' }).click();
await H.fill('#course-search', 'Hetzenhof');
await H.waitForTimeout(2000);
await H.locator('button.list-item').first().click();
await H.waitForTimeout(800);
await H.locator('.game-player-row').nth(1).locator('input').first().fill('Ben');
await H.getByRole('button', { name: 'Spiel starten' }).click();
await H.waitForTimeout(800);
await H.locator('.hole-bar-handle').click();
await H.locator('.hole-drawer').getByRole('button', { name: 'Mitspieler einladen' }).click();
await H.getByRole('button', { name: 'Code erzeugen' }).click();
await H.waitForTimeout(800);
const code = (await H.locator('.join-code').innerText()).trim();
ok(/^[A-Z0-9]{6}$/.test(code) && (await H.locator('.qr-box svg').count()) === 1, `host: code ${code} with a QR code`);
if (process.env.SHOTS) await H.screenshot({ path: process.env.SHOTS + '/share-invite.png' });
await H.getByRole('button', { name: 'Schließen' }).click();

// guest: join with the code (as from the QR link)
const G = guest.p;
await G.goto('about:blank');
await G.goto(url + '#join=' + code);
await G.waitForTimeout(2000);
ok(await G.getByRole('dialog', { name: 'Spiel beitreten' }).isVisible(), 'guest: the QR link opens "Spiel beitreten" with the code');
await G.getByRole('dialog', { name: 'Spiel beitreten' }).getByRole('button', { name: 'Beitreten', exact: true }).click();
await G.waitForTimeout(1500);
ok((await G.locator('.game-scores').innerText()).includes('Sascha') && (await G.locator('.game-scores').innerText()).includes('Ben'), 'guest: in the game with Sascha and Ben');

// both enter: the host his own score, the guest his – after a few seconds both phones show both
await H.locator('.game-scores .stepper').nth(0).getByRole('button', { name: 'plus eins' }).click(); // Sascha par 4
await G.locator('.game-scores .stepper').nth(1).getByRole('button', { name: 'plus eins' }).click(); // Ben par 4
await G.locator('.game-scores .stepper').nth(1).getByRole('button', { name: 'plus eins' }).click(); // Ben 5
await H.waitForTimeout(12000);
const vals = async (p) => (await p.locator('.game-scores .stepper-value').allInnerTexts()).map((t) => t.trim()).join(',');
ok((await vals(H)) === '4,5', `host sees both scores: ${await vals(H)}`);
ok((await vals(G)) === '4,5', `guest sees both scores: ${await vals(G)}`);
ok(host.errs.length === 0 && guest.errs.length === 0, `no page errors ${[...host.errs, ...guest.errs].slice(0, 2).join(' | ')}`);
await b.close();
process.exit(fails ? 1 : 0);
