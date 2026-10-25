// Numbers on coloured marks are white everywhere (Sascha 25.10.2026: "Zahlen … teils wieder in schwarz in den
// Diagrammen … Weiß sollte die Farbe sein"): every figure in the statistics (all topics), on the rounds list, the
// scorecard and the round check is scanned – a dark figure on a coloured bar, chip, box or mark fails, with its place.
// Dark and sun mode. Figures on white (the ball in the putt editor) keep dark ink. Data: the tutorial's example player.
// Usage: node qa/whitenumbers.mjs [url]
import { webkit, devices } from 'playwright';
import { readFileSync } from 'node:fs';
import { mockNet } from './netmock.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const demo = JSON.parse(readFileSync(new URL('../../tutorial/demo-state.json', import.meta.url), 'utf-8'));
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', geolocation: { latitude: 48.781065, longitude: 9.689329, accuracy: 5 }, permissions: ['geolocation'] });
await mockNet(ctx);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => { if (!/due to access control|sw\.js load failed/.test(e.message)) errs.push(e.message); });
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};

// every element with a figure of its own: its ink against the first opaque thing under its centre
const scan = () =>
  p.evaluate(() => {
    const rgba = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c ?? '');
      if (!m) return null;
      const [r, g, bl, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r, g, b: bl, a };
    };
    const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const colourful = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 60;
    const name = (e) => `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].join('.') : ''}`;
    const out = { seen: 0, coloured: 0, bad: [] };
    const els = [...document.querySelectorAll('body *')].filter(
      (e) => [...e.childNodes].some((n) => n.nodeType === 3 && /\d/.test(n.textContent ?? '') && n.textContent.trim().length <= 14) && e.getClientRects().length,
    );
    for (const el of els) {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const svgText = el instanceof SVGElement;
      const ink = rgba(svgText ? getComputedStyle(el).fill : getComputedStyle(el).color);
      if (!ink || ink.a < 0.5) continue;
      out.seen++;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let bg = null;
      if (svgText) {
        // in a chart: the last shape drawn before the figure that lies under its centre (clipped bars miss a hit test)
        const shapes = [...(el.ownerSVGElement?.querySelectorAll('rect, circle, ellipse, path, polygon') ?? [])].filter((s) => {
          if (!(s.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
          const q = s.getBoundingClientRect();
          return q.left <= cx && cx <= q.right && q.top <= cy && cy <= q.bottom;
        });
        // under a see-through fill: blended with the panel the chart sits on
        let panel = el.ownerSVGElement?.parentElement;
        while (panel && (rgba(getComputedStyle(panel).backgroundColor)?.a ?? 0) < 0.5) panel = panel.parentElement;
        const under = rgba(panel ? getComputedStyle(panel).backgroundColor : "rgb(0,0,0)");
        for (const s of shapes.reverse()) {
          const c = rgba(getComputedStyle(s).fill);
          const o = Number(getComputedStyle(s).fillOpacity || 1) * (c?.a ?? 0);
          if (c && o >= 0.3) {
            bg = { r: c.r * o + under.r * (1 - o), g: c.g * o + under.g * (1 - o), b: c.b * o + under.b * (1 - o), a: 1 };
            break;
          }
        }
      } else {
        // the element's own fill (a bar segment, a chip) or the first opaque thing under it
        for (const e of [el, ...document.elementsFromPoint(cx, cy).filter((e) => e !== el && !el.contains(e))]) {
          const c = rgba(getComputedStyle(e).backgroundColor);
          if (c && c.a >= 0.5) {
            bg = c;
            break;
          }
        }
      }
      if (!bg) continue;
      if (colourful(bg)) out.coloured++;
      // dark ink only on a light ground (a white ball, the sun mode panels) – on a bar, chip or box the figure is white
      if (lum(ink) < 0.4 && lum(bg) < 0.75) out.bad.push(`${name(el)} „${el.textContent.trim()}“ ink rgb(${ink.r},${ink.g},${ink.b}) on rgb(${bg.r},${bg.g},${bg.b})`);
    }
    return out;
  });

const report = async (where) => {
  const s = await scan();
  ok(s.bad.length === 0, `${where}: ${s.coloured} of ${s.seen} figures on colour – none dark on a bar, chip or box${s.bad.length ? ' – dark: ' + [...new Set(s.bad)].slice(0, 6).join(' | ') : ''}`);
  return s;
};

let coloured = 0;
for (const sun of [false, true]) {
  const mode = sun ? 'sun' : 'dark';
  await p.goto(url);
  await p.waitForTimeout(800);
  await p.evaluate(({ demo, sun }) => {
    localStorage.clear();
    sessionStorage.clear();
    for (const [k, v] of Object.entries(demo)) localStorage.setItem(k, v);
    localStorage.setItem('golfos.intro.v1', '1');
    localStorage.setItem('golfos.tip.shots.v1', '1');
    if (sun) localStorage.setItem('golfos.sun.v1', '1');
    sessionStorage.setItem('golfos.module', 'rounds');
  }, { demo, sun });
  await p.reload();
  await p.waitForTimeout(1500);

  // the statistics, topic by topic
  await p.locator('.tabbar button').filter({ hasText: 'Statistik' }).click();
  await p.waitForTimeout(600);
  const topics = await p.getByRole('group', { name: 'Thema' }).getByRole('button').allInnerTexts();
  for (const t of topics) {
    await p.getByRole('group', { name: 'Thema' }).getByRole('button', { name: t.trim(), exact: true }).click();
    await p.waitForTimeout(700);
    coloured += (await report(`${mode} · Statistik ${t.trim()}`)).coloured;
  }
  // the rounds: list, then a signed round's scorecard
  await p.locator('.tabbar button').filter({ hasText: 'Runden' }).click();
  await p.waitForTimeout(700);
  coloured += (await report(`${mode} · Runden`)).coloured;
  await p.locator('.round-row, .list-item').filter({ hasText: /Hetzenhof|Son|Alcanada/ }).first().click();
  await p.waitForTimeout(1200);
  coloured += (await report(`${mode} · Runde (Scorekarte)`)).coloured;
}
ok(coloured >= 20, `figures on colour were found and checked (${coloured})`);
ok(errs.length === 0, `no page errors ${errs.join(' | ')}`);
await b.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
