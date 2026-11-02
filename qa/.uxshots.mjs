// Local tool (not in the gate): screenshots of Rounds and Games side by side, to compare the usability and the look.
// Usage: SHOTS=<dir> node qa/.uxshots.mjs [url]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const S = process.env.SHOTS;
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
await ctx.route(/rgisfnilwehnqpmbrxmp\.supabase\.co\/(rest|auth|functions)\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
const p = await ctx.newPage();
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const now = new Date().toISOString();
const round = {
  id: 'r1', createdAt: now, finishedAt: now, courseId: 'osm:test', courseName: 'Golfclub Hetzenhof', loopOrder: ['A'],
  holes: PARS.map((par, i) => ({ index: i, id: `h${i}`, label: String(i + 1), loop: 'A', number: i + 1, par, strokeIndex: i + 1 })), mode: 'quick',
  players: [{ id: 'me', name: 'Sascha', playingHandicap: 10, isMe: true }],
  entries: { me: PARS.map((par) => ({ strokes: par + 1, pickedUp: false, putts: 2, fairway: null, penalties: 0, greensideBunker: false, upAndDown: null })) }, currentHole: 17,
};
await p.goto(url);
await p.waitForTimeout(1000);
await p.evaluate((round) => {
  localStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: '', hcpIndex: '10', homeClub: '' }));
  localStorage.setItem('golfos.auth.v1', JSON.stringify({ access_token: 'h.e30.s', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, email: 's@test', name: 'Sascha' }));
  localStorage.setItem('golfos.rounds.v1', JSON.stringify([round]));
  sessionStorage.setItem('golfos.module', 'rounds');
}, round);
await p.reload();
await p.waitForTimeout(2000);
const shot = async (n) => p.screenshot({ path: `${S}/ux-${n}.png`, fullPage: true });
await shot('rounds-play');
await p.locator('.tabbar button').nth(1).click();
await p.waitForTimeout(800);
await shot('rounds-list');
await p.locator('.tabbar button').first().click();
await p.getByRole('button', { name: 'Neue Runde' }).click();
await p.waitForTimeout(1200);
await shot('rounds-new');
await p.evaluate(() => sessionStorage.setItem('golfos.module', 'games'));
await p.goto(url);
await p.waitForTimeout(2000);
await shot('games-play');
await p.getByRole('button', { name: 'Neues Spiel' }).click();
await p.waitForTimeout(1000);
await shot('games-setup');
await p.goto(url);
await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Neue Wette' }).click();
await p.waitForTimeout(800);
await shot('bets-setup');
await b.close();
