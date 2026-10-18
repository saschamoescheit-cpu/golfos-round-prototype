// Development only (golf3d-preview.html, not part of the app build): a swing at several moments as stills, to check
// every position. Query: ?swing=<name>&view=front|side|angle|above&n=<stills>
import { createGolfViewer, type View } from './golf3d';
import * as SW from './swings';
import type { Swing } from './golf3d';

const q = new URLSearchParams(location.search);
const name = q.get('swing') ?? 'FULL_SWING';
const views = (q.get('view') ?? 'front').split(',') as View[];
const n = Number(q.get('n') ?? 8);
if (q.get('big')) document.body.classList.add('big');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const out = document.getElementById('out')!;
const v = createGolfViewer(canvas);
v.setPlaying(false);
const pairs = (SW as unknown as { PAIRS: Record<string, { fault: Swing; right: Swing; behind?: boolean }> }).PAIRS;
const pair = pairs[name];
const swing = pair ? pair.fault : (SW as unknown as Record<string, Swing>)[name];
(async () => {
  for (const view of views) {
    if (pair) v.setSwings((SW as unknown as { group: (id: string) => { swing: Swing; x?: number; z?: number }[] }).group(name));
    else v.setSwing(swing);
    v.setView(view);
    const cu = q.get('close');
    if (cu) v.closeUp?.(cu.split(',').map(Number) as [number, number, number], Number(q.get('dist') ?? 0.6));
    const len = swing.keys[swing.keys.length - 1].t;
    const div = document.createElement('div');
    div.innerHTML = `<h2>${name} · ${view}</h2><div class="row"></div>`;
    out.appendChild(div);
    const row = div.querySelector('.row')!;
    let label = '';
    v.onLabel((l) => (label = l?.de ?? ''));
    const times = q.get('times')?.split(',').map(Number) ?? Array.from({ length: n }, (_, i) => (len * i) / (n - 1));
    for (const t0 of times) {
      const t = t0 + 0.0001;
      v.seek(t);
      const f = document.createElement('figure');
      f.innerHTML = `<img src="${canvas.toDataURL('image/png')}"><figcaption>${t.toFixed(2)} s · ${label}</figcaption>`;
      row.appendChild(f);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  document.body.dataset.done = '1';
})();
