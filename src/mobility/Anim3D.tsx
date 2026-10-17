import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { CLIPS } from './anim3d/clips';
import { createViewer, type View, type Viewer } from './anim3d/scene';
import type { TestId } from './types';
import type { L } from '../training/types';

// The 3D video of a test (Sascha 17.10.2026: "3D animated videos"): our golfer does the test in a loop, the step of
// the moment is written below; pause, slow motion and the view (front, side, at an angle, from above) can be
// changed. Loaded only with the Agility module (three.js); without WebGL the drawing below stays the picture.

const VIEW_NAMES: Record<View, () => string> = {
  front: () => tr('Front', 'Vorne'),
  side: () => tr('Side', 'Seite'),
  angle: () => tr('Angle', 'Schräg'),
  above: () => tr('Above', 'Oben'),
};

export default function Anim3D(props: { test: TestId }) {
  const clip = CLIPS[props.test];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(!reduce);
  const [slow, setSlow] = useState(false);
  const [view, setView] = useState<View>(clip.view);
  const [label, setLabel] = useState<{ l?: L; step: number }>({ step: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let v: Viewer;
    try {
      v = createViewer(c);
    } catch {
      setFailed(true);
      return;
    }
    viewerRef.current = v;
    v.onLabel((l, step) => setLabel({ l, step }));
    v.setClip(clip);
    v.setPlaying(!reduce);
    setView(clip.view);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => v.resize()) : null;
    ro?.observe(c);
    // QA: stills at a chosen moment
    (window as Window & { __agility3d?: Viewer }).__agility3d = v;
    return () => {
      ro?.disconnect();
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.test]);

  useEffect(() => viewerRef.current?.setPlaying(playing), [playing]);
  useEffect(() => viewerRef.current?.setSpeed(slow ? 0.4 : 1), [slow]);

  if (failed) return null;
  const views = clip.views ?? ['front', 'side', 'angle'];
  return (
    <figure className="mob-3d">
      <div className="mob-3d-stage">
        <canvas ref={canvasRef} role="img" aria-label={tr('3D video of the test', '3D-Video des Tests')} />
        <div className="mob-3d-controls">
          <button type="button" className="icon-btn" aria-label={playing ? tr('Pause', 'Pause') : tr('Play', 'Abspielen')} aria-pressed={!playing} onClick={() => setPlaying(!playing)}>
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button type="button" className={`chip${slow ? ' on' : ''}`} aria-pressed={slow} onClick={() => setSlow(!slow)}>
            {tr('Slow', 'Zeitlupe')}
          </button>
          <span className="grow" />
          <div className="mob-3d-views" role="group" aria-label={tr('View', 'Ansicht')}>
            {views.map((v) => (
              <button
                key={v}
                type="button"
                className={`chip${view === v ? ' on' : ''}`}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  viewerRef.current?.setView(v);
                }}
              >
                {VIEW_NAMES[v]()}
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* the step of the moment – below the video, so it never covers the feet */}
      <figcaption className="mob-3d-step" aria-live="polite">
        <span className="mob-3d-no">{label.step || 1}</span>
        <span>{label.l ? tr(label.l.en, label.l.de) : ''}</span>
      </figcaption>
    </figure>
  );
}
