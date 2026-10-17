import { useEffect, useRef, useState } from 'react';
import { tr } from '../../lib/i18n';
import { isLeftHanded } from '../../lib/profile';
import { createGolfViewer, type View, type Viewer } from './golf3d';
import { SWINGS, type SwingId } from './swings';
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

export default function Swing3D(props: { swing: SwingId; onFail?: () => void }) {
  const swing = SWINGS[props.swing];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const [view, setView] = useState<View>('front');
  const [label, setLabel] = useState<{ l?: L; step: number }>({ step: 0 });
  const left = isLeftHanded();

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    let v: Viewer;
    try {
      v = createGolfViewer(c);
    } catch {
      props.onFail?.();
      return;
    }
    viewerRef.current = v;
    v.onLabel((l, step) => setLabel({ l, step }));
    v.setSwing(swing);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => v.resize()) : null;
    ro?.observe(c);
    (window as Window & { __golf3d?: Viewer }).__golf3d = v;
    return () => {
      ro?.disconnect();
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.swing]);
  useEffect(() => viewerRef.current?.setPlaying(playing), [playing]);
  useEffect(() => viewerRef.current?.setSpeed(slow ? 0.4 : 1), [slow]);

  return (
    <div className="tr-3d">
      <div className="tr-3d-stage">
        {/* left-handers see the player mirrored, like every Training picture */}
        <canvas ref={canvasRef} role="img" aria-label={tr('3D video of the movement', '3D-Video der Bewegung')} style={left ? { transform: 'scaleX(-1)' } : undefined} />
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
          {(['front', 'side', 'angle', 'above'] as View[]).map((x) => (
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
