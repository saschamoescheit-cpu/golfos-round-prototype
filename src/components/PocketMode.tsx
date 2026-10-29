import { useEffect, useRef, useState } from 'react';
import { loadTrack } from '../lib/track';
import { tr } from '../lib/i18n';

// Pocket mode: a web app gets no GPS while the iPhone is locked – so the screen is kept awake (Wake Lock) and turned
// black (OLED: almost no power), touches in the pocket do nothing, and the GPS track keeps growing for the shot
// detection after the round – and the microphone keeps listening for "shot by sound". Hold for 1 second to leave.
// Taken out on 13.10.2026, back as a test on 28.10.2026 (Sascha: "test it on my next round"), switched on in the profile.

type WakeLockSentinel = { release: () => Promise<void>; addEventListener?: (t: 'release', f: () => void) => void };
type WakeLockApi = { request: (type: 'screen') => Promise<WakeLockSentinel> };

const KEY = 'golfos.pockettest.v1';
/** The test switch in the profile ("Pocket mode (test)"): the button on the hole map. */
export function pocketTestOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function setPocketTest(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

export function PocketMode(props: { roundId: string; onExit: () => void; listening?: boolean; cracks?: number; lastCrack?: number | null }) {
  const [awake, setAwake] = useState<'on' | 'unsupported' | 'pending'>('pending');
  const [points, setPoints] = useState(() => loadTrack(props.roundId).length);
  const [lastAgo, setLastAgo] = useState<number | null>(null);
  const [holding, setHolding] = useState(false);
  const lock = useRef<WakeLockSentinel | null>(null);
  const hold = useRef<number | undefined>(undefined);

  // keep the screen awake – and take the lock again when the page comes back (iOS drops it when hidden)
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    let alive = true;
    const take = async () => {
      if (!api) return setAwake('unsupported');
      try {
        const l = await api.request('screen');
        if (!alive) return void l.release();
        lock.current = l;
        setAwake('on');
      } catch {
        setAwake('unsupported');
      }
    };
    void take();
    const onVisible = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock.current?.release().catch(() => {});
      lock.current = null;
    };
  }, []);

  // how the recording is doing
  useEffect(() => {
    const t = window.setInterval(() => {
      // cheap: the track of the running round is kept in memory
      const track = loadTrack(props.roundId);
      setPoints(track.length);
      const last = track[track.length - 1];
      setLastAgo(last ? Math.max(0, Math.round((Date.now() - last.t) / 1000)) : null);
    }, 1000);
    return () => window.clearInterval(t);
  }, [props.roundId]);

  const start = () => {
    setHolding(true);
    hold.current = window.setTimeout(() => props.onExit(), 1000);
  };
  const stop = () => {
    setHolding(false);
    window.clearTimeout(hold.current);
  };

  return (
    <div
      className="pocket"
      role="dialog"
      aria-label={tr('Pocket mode – hold to leave', 'Taschenmodus – zum Beenden gedrückt halten')}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pocket-info">
        <strong>{tr('Pocket mode', 'Taschenmodus')}</strong>
        <span>
          {tr('GPS recording', 'GPS zeichnet auf')} · {points} {tr('points', 'Punkte')}
          {lastAgo != null ? tr(` · last ${lastAgo} s ago`, ` · letzter vor ${lastAgo} s`) : ''}
        </span>
        {props.listening && (
          <span>
            {tr('Microphone listening', 'Mikrofon hört mit')} · {props.cracks ?? 0} {tr(props.cracks === 1 ? 'crack' : 'cracks', props.cracks === 1 ? 'Knall' : 'Knalle')}
            {/* the last one with its time: hit, look – heard? (Sascha 29.10.2026: check it on the course) */}
            {props.lastCrack != null &&
              tr(` · last at ${new Date(props.lastCrack).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, ` · letzter um ${new Date(props.lastCrack).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`)}
          </span>
        )}
        {awake === 'unsupported' && (
          <span className="pocket-warn">
            {tr(
              'This iPhone cannot keep the screen awake here – set Auto-Lock to “Never” (Settings → Display & Brightness), otherwise the recording stops when it locks.',
              'Dieses iPhone kann den Bildschirm hier nicht wachhalten – stell die Auto-Sperre auf „Nie“ (Einstellungen → Anzeige & Helligkeit), sonst stoppt die Aufzeichnung beim Sperren.',
            )}
          </span>
        )}
        <span className={`pocket-hold${holding ? ' on' : ''}`}>{tr('Hold for 1 second to leave', 'Zum Beenden 1 Sekunde gedrückt halten')}</span>
      </div>
    </div>
  );
}
