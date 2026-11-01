import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { isSpeaking, speak, stopSpeaking } from '../lib/caddietalk';
import { CLIPS } from './anim3d/clips';
import { createViewer, type Clip, type View, type Viewer } from './anim3d/scene';
import type { TestId } from './types';

// The 3D video of a test (Sascha 17.10.2026: "3D animated videos"): our golfer does the test in a loop; pause, slow
// motion and the view (front, side, at an angle, from above) can be changed. Loaded only with the Agility module
// (three.js); without WebGL the drawing below stays the picture. A voice says how it goes while the golfer shows it
// (Sascha 1.11.2026: the steps are written below the video anyway – a step line under it is not needed, a voice is
// better); the loudspeaker bottom left switches it off and on (remembered), on again it starts from the beginning.

const VOICE_KEY = 'golfos.mobility.voice';
const voiceWanted = (): boolean => {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
};
const keepVoice = (on: boolean) => {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: on for this page only */
  }
};

const VIEW_NAMES: Record<View, () => string> = {
  front: () => tr('Front', 'Vorne'),
  side: () => tr('Side', 'Seite'),
  angle: () => tr('Angle', 'Schräg'),
  above: () => tr('Above', 'Oben'),
};

/**
 * compact: the demo over the camera in the trainer mode – no controls, no voice of its own, a lighter picture.
 * say: what the voice reads (the setup and the steps of the test or drill).
 * Play/pause (Sascha 17.10.2026 via Training): a round symbol bottom right in the picture, ▶ / ❚❚ in CI green.
 */
export default function Anim3D(props: { test?: TestId; clip?: Clip; compact?: boolean; say?: string[] }) {
  const clip = props.clip ?? CLIPS[props.test!];
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(!reduce);
  const [slow, setSlow] = useState(false);
  const [view, setView] = useState<View>(clip.view);
  const [voice, setVoice] = useState(voiceWanted);
  const [said, setSaid] = useState(0);
  const ownRef = useRef(false);
  const text = props.compact ? '' : (props.say ?? []).filter(Boolean).join(' ');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // a fresh canvas each time: its WebGL context is given back when the video closes (WebKit crashes after a few
    // dozen open contexts – found by Training); a reused canvas cannot be revived after a forced context loss
    const c = document.createElement('canvas');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', tr('3D video of the test', '3D-Video des Tests'));
    stage.prepend(c);
    let v: Viewer;
    try {
      v = createViewer(c, props.compact ? { pixelRatio: 1 } : {});
    } catch {
      c.remove();
      setFailed(true);
      return;
    }
    viewerRef.current = v;
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
      c.remove();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);

  useEffect(() => viewerRef.current?.setPlaying(playing), [playing]);
  useEffect(() => viewerRef.current?.setSpeed(slow ? 0.4 : 1), [slow]);

  // the voice: once when the video opens (and when switched on again); it stops when the video closes
  useEffect(() => {
    if (!text || !voice || failed) return;
    ownRef.current = true;
    speak(text);
    setSaid((n) => n + 1);
    return () => {
      if (ownRef.current && isSpeaking()) stopSpeaking();
      ownRef.current = false;
    };
  }, [text, voice, failed]);

  if (failed) return null;
  const views = clip.views ?? ['front', 'side', 'angle'];
  return (
    <figure className={`mob-3d${props.compact ? ' compact' : ''}`} data-said={said || undefined}>
      <div className="mob-3d-stage" ref={stageRef}>
        {!props.compact && (
        <button type="button" className="mob-3d-play" aria-label={playing ? tr('Pause', 'Pause') : tr('Play', 'Abspielen')} aria-pressed={!playing} onClick={() => setPlaying(!playing)}>
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
        )}
        {text && (
          <button
            type="button"
            className="mob-3d-voice"
            aria-label={voice ? tr('Voice off', 'Stimme aus') : tr('Read it aloud', 'Vorlesen')}
            aria-pressed={voice}
            onClick={() => {
              keepVoice(!voice);
              if (voice) stopSpeaking();
              setVoice(!voice);
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
              {voice ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /> : <path d="M16 9l5 6M21 9l-5 6" />}
            </svg>
          </button>
        )}
        {!props.compact && (
        <div className="mob-3d-controls">
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
        )}
      </div>
    </figure>
  );
}
