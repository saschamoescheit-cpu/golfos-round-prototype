import { useEffect, useRef, useState } from 'react';
import { tr } from '../../lib/i18n';
import { isLeftHanded } from '../../lib/profile';
import { createGolfViewer, type View, type Viewer } from './golf3d';
import { PAIRS, SWINGS, type PairId, type SwingId } from './swings';
import type { L } from '../types';
import { sided } from '../sides';

// The 3D video of a swing in Training (Sascha 17.10.2026: "3D animated videos rather than still pictures") – the same
// player as the Agility test videos: pause, slow motion, the view (front, from behind down the line, at an angle, from
// above), the step of the moment below the video. Loaded only when it is played (three.js in its own chunk); without
// WebGL the still picture stays.

const VIEW_NAMES: Record<View, () => string> = {
  front: () => tr('Front', 'Vorne'),
  side: () => tr('Behind', 'Hinten'),
  angle: () => tr('Angle', 'Schräg'),
  above: () => tr('Above', 'Oben'),
};

export default function Swing3D(props: { swing: SwingId | PairId; onFail?: () => void }) {
  // a fault picture: the fault (left) and the right way (right) side by side – from behind one beside the other in depth
  const pair = props.swing in PAIRS ? PAIRS[props.swing as PairId] : null;
  const swing = pair ? pair.fault : SWINGS[props.swing as SwingId];
  const behind = !!(pair && 'behind' in pair && pair.behind);
  const views: View[] = !pair ? ['front', 'side', 'angle', 'above'] : behind ? ['side', 'angle', 'above'] : ['front', 'angle', 'above'];
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const [view, setView] = useState<View>(behind ? 'side' : 'front');
  const [label, setLabel] = useState<{ l?: L; step: number }>({ step: 0 });
  const left = isLeftHanded();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // a fresh canvas for every start: its WebGL context is released for good when the video closes (many videos one
    // after another must not run the phone out of contexts or memory)
    const c = document.createElement('canvas');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', tr('3D video of the movement', '3D-Video der Bewegung'));
    // left-handers see the player mirrored, like every Training picture
    if (left) c.style.transform = 'scaleX(-1)';
    stage.prepend(c);
    let v: Viewer;
    try {
      v = createGolfViewer(c);
    } catch (e) {
      console.error('Training 3D: no WebGL', e);
      c.remove();
      props.onFail?.();
      return;
    }
    viewerRef.current = v;
    v.onLabel((l, step) => setLabel({ l, step }));
    if (pair) {
      v.setSwings(behind ? [{ swing: pair.fault, z: -1 }, { swing: pair.right, z: 1 }] : [{ swing: pair.fault, x: -1 }, { swing: pair.right, x: 1 }]);
      if (behind) v.setView('side');
    } else v.setSwing(swing);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => v.resize()) : null;
    ro?.observe(c);
    (window as Window & { __golf3d?: Viewer }).__golf3d = v;
    return () => {
      ro?.disconnect();
      v.dispose();
      c.remove();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.swing]);
  useEffect(() => viewerRef.current?.setPlaying(playing), [playing]);
  useEffect(() => viewerRef.current?.setSpeed(slow ? 0.4 : 1), [slow]);

  return (
    <div className="tr-3d">
      <div className="tr-3d-stage" ref={stageRef}>
        <div className="tr-3d-controls">
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
        </div>
        <div className="tr-3d-views" role="group" aria-label={tr('View', 'Ansicht')}>
          {views.map((x) => (
            <button
              key={x}
              type="button"
              className={`chip${view === x ? ' on' : ''}`}
              aria-pressed={view === x}
              onClick={() => {
                setView(x);
                viewerRef.current?.setView(x);
              }}
            >
              {VIEW_NAMES[x]()}
            </button>
          ))}
        </div>
      </div>
      <div className="tr-3d-step" aria-live="polite">
        <span className="tr-3d-no">{label.step || 1}</span>
        <span>{label.l ? sided(tr(label.l.en, label.l.de)) : ''}</span>
      </div>
    </div>
  );
}
