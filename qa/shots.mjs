// The topics as shots (Sascha 15.11.2026): Training → Wissen → Chippen opens on "Schläge" – the lie chart first,
// then the shots; a shot has Ansprache · Bewegung · Worauf achten · Üben, every tab with a picture, the set-up with
// ball position, stance, weight and club; "Üben" has the drills; back from a drill returns to the same tab.
//   node qa/shots.mjs [url] [screenshot dir]
import { webkit, devices } from 'playwright';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const shots = process.argv[3];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => !/(localhost:\d+|api\.open-meteo\.com|owsproxy\.lgl-bw\.de)\/\S* due to access control/.test(e.message) && errs.push(e.message));
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? '✓' : '✗'} ${what}`);
};
const shot = async (n) => shots && p.screenshot({ path: `${shots}/shots-${n}.png`, fullPage: true });
const back = () => p.locator('.topbar .icon-btn').first().click();
const viewNow = async () => ((await p.getByRole('button', { name: /^Ansicht: / }).getAttribute('aria-label')) ?? '').replace('Ansicht: ', '');
const viewNames = async () => {
  await p.getByRole('button', { name: /^Ansicht: / }).click();
  const names = await p.getByRole('dialog', { name: 'Ansicht' }).locator('.pick-option strong').allInnerTexts();
  await p.getByRole('dialog', { name: 'Ansicht' }).getByRole('button', { name: 'Schließen' }).click();
  return names;
};
const view = async (name) => {
  await p.getByRole('button', { name: /^Ansicht: / }).click();
  await p.getByRole('dialog', { name: 'Ansicht' }).locator('.pick-option').filter({ has: p.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).click();
  await p.waitForTimeout(150);
};

await p.goto(url, { timeout: 120000 });
await p.waitForTimeout(1500);
await p.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('golfos.intro.v1', '1');
  localStorage.setItem('golfos.lang.v1', 'de');
  localStorage.setItem('golfos.profile.v1', JSON.stringify({ firstName: 'Sascha', lastName: 'Möscheit', hcpIndex: '12,4', homeClub: '' }));
});
await p.reload();
await p.waitForTimeout(800);
await p.locator('.module-card').filter({ hasText: 'Training' }).click();
await p.getByRole('heading', { name: 'Wissen' }).waitFor({ timeout: 20000 }).catch(() => {});
await p.locator('.tr-cat').filter({ hasText: 'Chippen' }).first().click();
await p.waitForTimeout(400);

// the topic opens on its shots
const parts = await viewNames();
ok((await viewNow()) === 'Schläge' && parts[0] === 'Schläge' && parts.includes('Übungen') && parts.includes('Grundlagen'), `Chippen opens on "Schläge": ${parts.join(' · ')}`);
const lie = p.locator('.tr-lie');
ok(await lie.isVisible(), 'the lie chart "Lage und Gras → Ballposition und Schläger" first');
ok((await lie.locator('.tr-lie-row').count()) === 5 && (await lie.locator('.tr-lie-row svg').count()) === 10, 'five lies, each with its lie and the stance from above');
ok(/Kahlstelle/.test(await lie.innerText()) && /PW oder Eisen 9/.test(await lie.innerText()), 'the bare patch: PW or 9-iron');
const list = p.locator('.tr-shots .list-item');
const names = await list.locator('.title').allInnerTexts();
ok(names.length === 7 && names[0] === 'Der Standard-Chip' && names.includes('Chip bergauf') && names.includes('Ball unter den Füßen') && names.includes('Tief im Gras'), `the shots: ${names.join(' · ')}`);
ok((await list.locator('.tr-thumb, svg').count()) >= 7, 'every shot in the list with its picture');
await shot('1-topic');

// a shot: the four tabs, every one with a picture
await list.filter({ hasText: 'Chip bergab' }).click();
await p.waitForTimeout(300);
ok((await p.locator('.topbar h1').innerText()) === 'Chip bergab', 'the shot page');
const tabs = await viewNames();
ok(tabs.join('|') === 'Ansprache|Bewegung|Worauf achten|Üben' && (await viewNow()) === 'Ansprache', `the tabs: ${tabs.join(' · ')}`);
const rows = await p.locator('.tr-shot-rows dt').allInnerTexts();
ok(['Ballposition', 'Stand', 'Gewicht', 'Schläger'].every((x) => rows.includes(x)), `set-up rows: ${rows.join(' · ')}`);
ok(/Hinter der Mitte/.test(await p.locator('.tr-shot-rows').innerText()) && /Mehr Loft/.test(await p.locator('.tr-shot-rows').innerText()), 'downhill: ball back, more loft');
ok((await p.locator('main .tr-sketch svg').count()) >= 1, 'Ansprache with a picture');
await shot('2-setup');
for (const t of ['Bewegung', 'Worauf achten']) {
  await view(t);
  ok((await p.locator('main .tr-sketch svg').count()) >= 1 && (await p.locator('main .tr-section').count()) >= 1, `${t}: picture and text`);
  await shot(`3-${t === 'Bewegung' ? 'move' : 'watch'}`);
}
await view('Üben');
const drills = p.locator('.tr-drill-row');
ok((await drills.count()) >= 2, 'Üben: the drills for it');
ok(await p.getByRole('button', { name: 'Diese Übungen jetzt üben' }).isVisible(), 'Üben: start them as a session');
await shot('4-practise');
await drills.first().locator('.list-item').click();
await p.waitForTimeout(300);
await back();
await p.waitForTimeout(300);
ok((await viewNow()) === 'Üben', 'back from a drill: the same tab of the shot');

// the standard chip shows the 3D still of the set-up and the moving stroke (from the basics it replaced)
await back();
await p.waitForTimeout(300);
await p.locator('.tr-shots .list-item').filter({ hasText: 'Der Standard-Chip' }).click();
await p.waitForTimeout(300);
ok((await p.locator('main .tr-sketch svg').count()) >= 1, 'standard chip: the set-up picture');
await view('Bewegung');
ok((await p.locator('.tr-motion-btn').count()) >= 1, 'standard chip: the stroke moves (play symbol in the picture)');
await view('Üben');
// Sascha 15.11.2026: "Die Videos können wir vorerst aus allen Übungen entfernen" – no videos at the drills and shots
ok((await p.locator('.tr-video-thumb img, .tr-video').count()) === 0, 'standard chip: no videos in Üben for now (Sascha 15.11.2026)');
await p.locator('.tr-drill-row .list-item').first().click();
await p.waitForTimeout(300);
ok(!(await viewNames()).includes('Videos'), 'a drill has no Videos tab for now');
await back();
await p.waitForTimeout(300);
await back();
await p.waitForTimeout(300);

// the basics keep only what is not a shot
await view('Grundlagen');
const secs = (await p.locator('.tr-coll-head').allInnerTexts()).filter((x) => !/Quellen/.test(x));
ok(secs.length === 1 && /So übst du/.test(secs[0]), `basics: only "So übst du" left (${secs.join(' · ')})`);
// the topic videos stay: a video loads only on tap, from youtube-nocookie
const sec = p.locator('.tr-coll').filter({ hasText: 'So übst du' }).first();
if (!(await sec.locator('.tr-coll-body').count())) await sec.locator('.tr-coll-head').click();
ok((await p.locator('iframe').count()) === 0 && (await sec.locator('.tr-video-cover').count()) === 1, 'basics: a topic video with its cover, nothing loaded');
await sec.locator('.tr-video-cover').click();
ok((await p.locator('iframe[src*="youtube-nocookie.com"]').count()) === 1, 'the video loads from youtube-nocookie on tap');
// a topic without shots still opens on its drills
await back();
await p.waitForTimeout(300);
await p.locator('.tr-cat').filter({ hasText: 'Putten' }).first().click();
await p.waitForTimeout(300);
ok((await viewNow()).startsWith('Übungen'), 'Putten (no shots yet) still opens on the drills');
await back();
await p.waitForTimeout(300);

// every topic Sascha named: every shot, every tab with its picture (and the pictures for a contact sheet)
const TOPICS = [
  ['Pitchen', 4],
  ['Lob Shot', 2],
  ['Spinkontrolle', 3],
  ['Bunker', 6],
  ['Hanglagen', 4],
  ['Schwierige Lagen', 5],
  ['Hoch & flach', 2],
  ['Low Point', 4],
];
let pics = 0;
for (const [topic, n] of TOPICS) {
  await p.locator('.tr-cat').filter({ has: p.locator('strong', { hasText: new RegExp(`^${topic.replace('&', '\\&')}`) }) }).first().click();
  await p.waitForTimeout(300);
  const count = await p.locator('.tr-shots .list-item').count();
  ok((await viewNow()) === 'Schläge' && count === n, `${topic}: opens on ${n} shots (${count})`);
  for (let i = 0; i < count; i++) {
    await p.locator('.tr-shots .list-item').nth(i).click();
    await p.waitForTimeout(250);
    const name = await p.locator('.topbar h1').innerText();
    for (const tab of ['Ansprache', 'Bewegung', 'Worauf achten']) {
      if (tab !== 'Ansprache') await view(tab);
      const fig = p.locator('main figure.tr-sketch').first();
      const has = (await fig.count()) > 0 && (await fig.locator('svg').count()) > 0;
      ok(has, `${topic} › ${name} › ${tab}: a picture`);
      if (has && shots) {
        pics++;
        await fig.screenshot({ path: `${shots}/pic-${String(pics).padStart(3, '0')}.png` });
      }
    }
    await view('Üben');
    ok((await p.locator('.tr-drill-row').count()) >= 1, `${topic} › ${name} › Üben: drills`);
    await view('Ansprache');
    await back();
    await p.waitForTimeout(250);
  }
  await back();
  await p.waitForTimeout(250);
}

ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(bad ? `${bad} check(s) failed` : 'all checks passed');
process.exit(bad ? 1 : 0);
