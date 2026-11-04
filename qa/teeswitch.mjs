// QA (Sascha 04.11.2026 on Hetzenhof 2B: "I played from the red tee – by my GPS the app should notice and ask in the round
// check whether I played from red instead of yellow, or dropped the ball for the water"): the round of 16.10.2026 (C,
// yellow) with the first shot of 1C moved to the red tee – the check asks; "Von Rot" keeps red for the hole, "Gedroppt
// (Wasser)" puts the tee shot into the water before it; the other holes of the real round ask nothing.
// Usage: node qa/teeswitch.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const exp = JSON.parse(readFileSync(new URL('../../_data/golfos-runde-2026-10-16-golfclub-hetzenhof.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
await p.goto(url);
await p.waitForTimeout(800);

// the real round: which holes would ask (none – its first shots are on the yellow tee)
const asking = await p.evaluate(async (exp) => {
  const { teeQuestion } = await import('/src/lib/teecheck.ts');
  const { holeMapData } = await import('/src/lib/geo.ts');
  const { loadGeometry, ensureCourseMap } = await import('/src/lib/courses.ts').catch(() => ({}));
  const r = exp.round;
  if (ensureCourseMap) await ensureCourseMap(r.courseId);
  const geo = loadGeometry ? loadGeometry(r.courseId) : (await import('/src/data/seedGeometry.ts')).SEED_GEOMETRY[r.courseId];
  const me = r.players.find((x) => x.isMe).id;
  return r.holes.map((h, i) => (teeQuestion(r.entries[me][i]?.detail?.shots[0]?.pos, holeMapData(geo, h.loop, h.number), r.courseId, h.label, r.tee, geo.tee) ? h.label : null)).filter(Boolean);
}, exp);
ok(asking.length === 0, `the real round of 16.10.: no hole asks (${asking.join(', ') || 'none'})`);

const open = async (moveFirst) => {
  await p.evaluate(
    async ({ exp, moveFirst }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1');
      localStorage.setItem('golfos.tip.shots.v1', '1');
      sessionStorage.setItem('golfos.module', 'rounds');
      const r = { ...exp.round, signedAt: null, capture: 'full' };
      const me = r.players.find((x) => x.isMe).id;
      if (moveFirst) {
        // the first shot of 1C on the red tee
        const { SEED_GEOMETRY } = await import('/src/data/seedGeometry.ts');
        const { holeMapData } = await import('/src/lib/geo.ts');
        const { holeForTee } = await import('/src/lib/teeline.ts');
        const geo = SEED_GEOMETRY[r.courseId];
        const h = r.holes[0];
        const red = holeForTee(holeMapData(geo, h.loop, h.number), r.courseId, h.label, 'Red', geo.tee).tee;
        const e0 = r.entries[me][0];
        r.entries[me][0] = { ...e0, detail: { ...e0.detail, shots: [{ ...e0.detail.shots[0], pos: red }, ...e0.detail.shots.slice(1)] } };
      }
      localStorage.setItem('golfos.rounds.v1', JSON.stringify([r]));
      localStorage.setItem('golfos.track.v1.' + r.id, JSON.stringify(exp.track.map((x) => [x.t, x.p[0], x.p[1], x.acc, ...(x.open ? [1] : [])])));
    },
    { exp, moveFirst },
  );
  await p.reload();
  await p.waitForTimeout(1200);
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await p.waitForTimeout(400);
  await p.locator('button').filter({ hasText: /Hetzenhof/ }).first().click();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Schläge prüfen/ }).first().click();
  await p.waitForTimeout(3000);
};
const entry0 = () =>
  p.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('golfos.rounds.v1'))[0];
    const me = r.players.find((x) => x.isMe).id;
    return r.entries[me][0];
  });
const ask = p.getByRole('status', { name: 'Welcher Abschlag?' });

// 1 · played from red
await open(true);
const t = (await ask.innerText().catch(() => '')).replace(/\s+/g, ' ');
ok(/Der erste Schlag liegt \d+ m vor dem Abschlag Gelb – am Abschlag Rot/.test(t), `1C, the first shot on red: "${t.slice(0, 120)}"`);
const n0 = (await entry0()).detail.shots.length;
await ask.getByRole('button', { name: 'Von Rot' }).click();
await p.waitForTimeout(600);
const e1 = await entry0();
ok(e1.tee === 'Red' && e1.teeAsked === true && e1.detail.shots.length === n0 && (await ask.count()) === 0, `"Von Rot": the hole played from red, the shots as they were, the question gone (${e1.tee})`);

// 2 · a drop after the water
await open(true);
await ask.getByRole('button', { name: 'Gedroppt (Wasser)' }).click();
await p.waitForTimeout(600);
const e2 = await entry0();
const [s0, s1] = e2.detail.shots;
ok(e2.detail.shots.length === n0 + 1 && s0.lie === 'tee' && s0.penalty === true && s0.penaltyKind === 'water' && s1.lie !== 'tee' && !e2.tee, `"Gedroppt (Wasser)": a tee shot from yellow into the water before it, then the drop (${e2.detail.shots.length} shots)`);

// 3 · as it is
await open(true);
await ask.getByRole('button', { name: 'Stimmt so' }).click();
await p.waitForTimeout(600);
const e3 = await entry0();
ok(e3.teeAsked === true && !e3.tee && e3.detail.shots.length === n0 && (await ask.count()) === 0, '"Stimmt so": nothing changed, not asked again');

ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
