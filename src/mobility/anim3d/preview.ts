// Development only (anim3d-preview.html, not part of the app build): every clip at several moments as stills, to
// check each pose against the test text. Query: ?clip=<test id>&view=front|side|angle|above&n=<stills>
import { CLIPS } from './clips';
import { LAB } from './lab';
import { DRILL_CLIPS } from './drills';
import { createViewer, type View } from './scene';
import type { TestId } from '../types';

const q = new URLSearchParams(location.search);
const only = q.get('clip');
const forcedView = q.get('view') as View | null;
const n = Number(q.get('n') ?? 6);
if (only) document.body.classList.add('big');
const canvas = document.getElementById('c') as HTMLCanvasElement;
const out = document.getElementById('out')!;
const v = createViewer(canvas);
v.setPlaying(false);
(async () => {
  const entries = (q.get('lab') ? LAB : q.get('drills') ? Object.entries(DRILL_CLIPS) : Object.entries(CLIPS)) as [TestId, (typeof CLIPS)[TestId]][];
  for (const [id, clip] of entries) {
    if (only && only !== id) continue;
    const views = forcedView ? [forcedView] : [clip.view];
    for (const view of views) {
      v.setClip(clip);
      v.setView(view);
      const len = clip.length ?? clip.keys[clip.keys.length - 1].t;
      const div = document.createElement('div');
      div.className = 'clip';
      div.innerHTML = `<h2>${id} · ${view}</h2><div class="row"></div>`;
      out.appendChild(div);
      const row = div.querySelector('.row')!;
      let label = '';
      v.onLabel((l) => (label = l?.de ?? ''));
      for (let i = 0; i < n; i++) {
        const t = (len * i) / n + 0.0001;
        v.seek(t);
        const f = document.createElement('figure');
        f.innerHTML = `<img src="${canvas.toDataURL('image/png')}"><figcaption>${t.toFixed(1)} s · ${label}</figcaption>`;
        row.appendChild(f);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  document.body.dataset.done = '1';
})();
