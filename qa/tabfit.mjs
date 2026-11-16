// QA: the menu bar at the bottom fits an iPhone SE in every language and every module (night 16./17.11.2026: in
// French "Bibliothèque · Entraînement" (Training), in Dutch "Geschiedenis" and Portuguese "Exercícios" (Agility) ran
// past the bar's right edge – the browser's 6px padding a side on each tab).
// Usage: node qa/tabfit.mjs [url]
import { webkit, devices } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
let fails = 0;
const ok = (c, m) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
const LANGS = ['de', 'en', 'da', 'es', 'fi', 'fr', 'it', 'ja', 'nb', 'nl', 'pl', 'pt', 'sv', 'zh'];
const MODULES = ['rounds', 'games', 'tournaments', 'training', 'mobility'];
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await ctx.route(/youtube|ytimg|open-meteo|photon|arcgis|lgl-bw|supabase/, (r) => r.abort());
const p = await ctx.newPage();
await p.goto(url);
for (const lang of LANGS) {
  const bad = [];
  for (const mod of MODULES) {
    await p.evaluate(([l, m]) => {
      localStorage.clear();
      localStorage.setItem('golfos.intro.v1', '1');
      localStorage.setItem('golfos.lang.v1', l);
      sessionStorage.setItem('golfos.module', m);
    }, [lang, mod]);
    await p.reload();
    await p.locator('.tabbar button').first().waitFor();
    const r = await p.evaluate(() => {
      const bar = document.querySelector('.tabbar');
      const right = bar.getBoundingClientRect().right;
      const tabs = [...bar.querySelectorAll('button')];
      return {
        fits: bar.scrollWidth <= bar.clientWidth + 1 && tabs.every((x) => x.getBoundingClientRect().right <= right + 0.5 && x.scrollWidth <= x.clientWidth + 1),
        labels: tabs.map((x) => x.innerText.trim()).join(' · '),
      };
    });
    if (!r.fits) bad.push(`${mod}: ${r.labels}`);
    // and no tab of the module scrolls sideways (17.11.2026: Agility's "Komplettes Screening" card ran 14 px past an
    // iPhone SE, in every language) – in the languages with the longest words
    if (['de', 'fr', 'fi', 'nl', 'pt'].includes(lang)) {
      const n = await p.locator('.tabbar button').count();
      for (let t = 0; t < n; t++) {
        await p.locator('.tabbar button').nth(t).click();
        await p.waitForTimeout(400);
        const w = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (w > 1) bad.push(`${mod}, tab ${t + 1}: the page scrolls sideways (${w} px)`);
      }
    }
  }
  ok(bad.length === 0, `${lang}: the menu bar fits in all ${MODULES.length} modules, no tab scrolls sideways${bad.length ? ` – not in ${bad.join(' | ')}` : ''}`);
}
await b.close();
process.exit(fails ? 1 : 0);
