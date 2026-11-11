import { useSyncExternalStore } from 'react';
import { isSpeaking, onSpeaking, stopSpeaking } from '../lib/caddietalk';
import { loadCaddieSettings, saveCaddieSettings } from '../lib/storage';
import { tr } from '../lib/i18n';
import { SpeakerIcon } from './SpeakerIcon';

// While the caddie talks: stop him, or mute him (switches off reading every new advice aloud) – two round icon buttons,
// the square to stop and the crossed-out speaker (Facelift 11.11.2026, r7: no "■" and no emoji).

const Icon = (props: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={props.d} />
  </svg>
);

export function SpeechBar() {
  const talking = useSyncExternalStore(onSpeaking, isSpeaking, () => false);
  if (!talking) return null;
  const auto = loadCaddieSettings().voice;
  return (
    <div className="speech-bar" role="status">
      <SpeakerIcon />
      <span className="grow">{tr('Caddie is talking …', 'Caddie spricht …')}</span>
      <button type="button" className="speech-icon" onClick={stopSpeaking} aria-label={tr('Stop', 'Stopp')} title={tr('Stop', 'Stopp')}>
        <Icon d="M7 7h10v10H7z" />
      </button>
      {auto && (
        <button
          type="button"
          className="speech-icon"
          onClick={() => {
            saveCaddieSettings({ ...loadCaddieSettings(), voice: false });
            stopSpeaking();
          }}
          aria-label={tr('Mute the caddie – no more reading aloud on new shots', 'Caddie stumm – keine Ansage mehr bei neuen Schlägen')}
          title={tr('Mute', 'Stumm')}
        >
          <Icon d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6" />
        </button>
      )}
    </div>
  );
}
