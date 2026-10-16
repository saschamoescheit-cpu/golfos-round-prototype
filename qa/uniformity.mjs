// Uniformity check (night run 16./17.10.2026, Sascha: "Rounds is the base for Games and Training"): the same kinds
// of screens of the three modules side by side – tab pages, lists, a sub page, sheets, empty states – on iPhone 13
// and iPhone SE, dark and in sun mode. Writes PNGs plus an index.html contact sheet to compare.
// Usage: node uniformity.mjs <app url> <out dir> [13|se] [dark|sun]
import { webkit, devices } from 'playwright';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? '.';
const dev = process.argv[4] === 'se' ? devices['iPhone SE'] : devices['iPhone 13'];
const sun = process.argv[5] === 'sun';
const tag = `${process.argv[4] ?? '13'}-${sun ? 'sun' : 'dark'}`;
const b = await webkit.launch();
const ctx = await b.newContext({ ...dev, locale: 'de-DE' });
const p = await ctx.newPage();
const shots = [];
const shot = async (group, name, full = false) => {
  await p.waitForTimeout(350);
  const file = `${tag}-${group}-${name}.png`;
  await p.screenshot({ path: `${out}/${file}`, fullPage: full });
  shots.push({ group, name, file });
};
const tab = (name) => p.locator('.tabbar button').filter({ hasText: name }).first().click();
const back = () => p.locator('.topbar .icon-btn').first().click();
const seed = async (module) => {
  await p.evaluate(({ module, sun }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    localStorage.setItem('golfos.lang.v1', 'de');
    if (sun) localStorage.setItem('golfos.sun.v1', '1');
    localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: 'GC Hetzenhof' }));
    if (module) sessionStorage.setItem('golfos.module', module);
    const holes = Array.from({ length: 9 }, (_, k) => ({ index: k, label: String(k + 1), loop: 'Main', number: k + 1, par: [4, 3, 5, 4, 4, 3, 4, 5, 4][k], strokeIndex: k + 1 }));
    const entry = (k) => ({ strokes: [5, 4, 6, 5, 4, 3, 6, 5, 5][k], putts: 2, pickedUp: false, fairway: null, penalties: 0 });
    localStorage.setItem('golfos.rounds.v1', JSON.stringify([{ id: 'u1', createdAt: '2026-10-12T10:00:00Z', finishedAt: '2026-10-12T12:30:00Z', courseId: 'c', courseName: 'GC Hetzenhof', loopOrder: ['Main'], holes, mode: 'quick', players: [{ id: 'me', name: 'Sascha', playingHandicap: 6, isMe: true }], entries: { me: holes.map((_, k) => entry(k)) }, currentHole: 8 }]));
    const day = (d) => new Date(Date.now() - d * 864e5).toISOString();
    localStorage.setItem('golfos.training.log.v1', JSON.stringify([7, 9, 8, 11].map((v, i) => ({ id: 'l' + i, drill: 'ladder', at: day(9 - i * 2), value: v }))));
    localStorage.setItem('golfos.training.fav.v1', JSON.stringify(['tiger-gate', 'landing-ring']));
  }, { module, sun });
  await p.reload();
  await p.waitForTimeout(900);
};

await p.goto(url);
await p.waitForTimeout(1200);

// start page
await seed(null);
await shot('start', 'modules');

// Rounds
await seed('rounds');
await shot('rounds', 'tab-play');
await tab('Runden');
await shot('rounds', 'tab-list');
await p.locator('.list-item').first().click().catch(() => {});
await shot('rounds', 'sub-scorecard');
await back().catch(() => {});
await tab('Statistik').catch(() => {});
await shot('rounds', 'tab-stats');
await tab('Profil');
await shot('rounds', 'tab-profile');

// Games
await seed('games');
await shot('games', 'tab-1');
const gameTabs = await p.locator('.tabbar button').allInnerTexts();
for (const [k, name] of gameTabs.slice(1, 3).entries()) {
  await tab(name.trim());
  await shot('games', `tab-${k + 2}`);
}

// Training
await seed('training');
await shot('training', 'tab-learn');
await tab('Üben');
await shot('training', 'tab-train');
await tab('Verlauf');
await shot('training', 'tab-log');
await tab('Shop');
await shot('training', 'tab-shop');
await tab('Wissen');
await p.locator('.tr-cat').first().click();
await shot('training', 'sub-topic');
await p.locator('.tr-drill-row .list-item').first().click();
await shot('training', 'sub-drill');
await tab('Üben');
await p.locator('.tr-block .list-item').first().click();
await shot('training', 'sub-plan');
await p.getByRole('button', { name: 'Einheit starten' }).click();
await shot('training', 'session');
await p.locator('.topbar .icon-btn').first().click();
await shot('training', 'session-leave-sheet');

await b.close();
const groups = [...new Set(shots.map((s) => s.group))];
writeFileSync(
  `${out}/index-${tag}.html`,
  `<!doctype html><meta charset="utf-8"><title>Uniformity ${tag}</title><style>body{font:14px system-ui;background:#111;color:#eee}section{display:flex;gap:12px;overflow-x:auto;padding:8px}figure{margin:0}img{width:260px;border:1px solid #333}</style>` +
    groups.map((g) => `<h2>${g}</h2><section>${shots.filter((s) => s.group === g).map((s) => `<figure><img src="${s.file}"><figcaption>${s.name}</figcaption></figure>`).join('')}</section>`).join(''),
);
console.log(`${shots.length} screenshots (${tag})`);
