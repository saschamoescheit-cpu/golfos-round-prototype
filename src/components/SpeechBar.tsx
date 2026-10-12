import { useSyncExternalStore } from 'react';
import { isSpeaking, onSpeaking, stopSpeaking } from '../lib/caddietalk';
import { loadCaddieSettings, saveCaddieSettings } from '../lib/storage';
import { tr } from '../lib/i18n';

// While the caddie talks: stop him, or mute him (switches off reading every new advice aloud).

export function SpeechBar() {
  const talking = useSyncExternalStore(onSpeaking, isSpeaking, () => false);
  if (!talking) return null;
  const auto = loadCaddieSettings().voice;
  return (
    <div className="speech-bar" role="status">
      <span aria-hidden="true">🔊</span>
      <span className="grow">{tr('Caddie is talking …', 'Caddie spricht …')}</span>
      <button type="button" onClick={stopSpeaking}>
        {tr('■ Stop', '■ Stopp')}
      </button>
      {auto && (
        <button
          type="button"
          onClick={() => {
            saveCaddieSettings({ ...loadCaddieSettings(), voice: false });
            stopSpeaking();
          }}
          aria-label={tr('Mute the caddie – no more reading aloud on new shots', 'Caddie stumm – keine Ansage mehr bei neuen Schlägen')}
        >
          {tr('🔇 Mute', '🔇 Stumm')}
        </button>
      )}
    </div>
  );
}
