import { useState } from 'react';
import { loadCaddieSettings, saveCaddieSettings, type CaddieSettings } from '../lib/storage';
import { Segmented } from './ui';
import { tr } from '../lib/i18n';

// The caddie's few settings (Sascha 15.10.2026): on/off, green slope, reading aloud by itself (with headphones),
// how he plans and how fast the greens are. The miss map is gone until it is good; language and sun mode sit in
// the header.

export function CaddieSettingsFields() {
  const [s, setS] = useState<CaddieSettings>(loadCaddieSettings);
  const set = (patch: Partial<CaddieSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveCaddieSettings(next);
  };
  return (
    <>
      <button type="button" className="toggle" aria-pressed={s.caddie} onClick={() => set({ caddie: !s.caddie })}>
        {s.caddie ? '✓' : '○'} {tr('Club advice on every hole (wind, temperature, slope)', 'Schlägerempfehlung an jedem Loch (Wind, Temperatur, Höhe)')}
      </button>
      <button type="button" className="toggle" aria-pressed={s.greenSlope} onClick={() => set({ greenSlope: !s.greenSlope })}>
        {s.greenSlope ? '✓' : '○'} {tr('Green slope when I am on the green', 'Grün-Neigung, wenn ich auf dem Grün bin')}
      </button>
      <button type="button" className="toggle" aria-pressed={s.voice} onClick={() => set({ voice: !s.voice })}>
        {s.voice ? '✓' : '○'} {tr('Read aloud by itself – with headphones', 'Von selbst vorlesen – mit Kopfhörern')}
      </button>
      <span className="muted small">
        {tr(
          'Off: the caddie only speaks when you tap 🔊 on his card. A web app cannot tell whether headphones are connected – switch this on when you wear them.',
          'Aus: Der Caddie spricht nur, wenn du auf seiner Karte 🔊 antippst. Ob Kopfhörer verbunden sind, kann eine Web-App nicht erkennen – schalte es ein, wenn du welche trägst.',
        )}
      </span>
      <div className="field">
        <label>{tr('How should the caddie plan?', 'Wie soll der Caddie planen?')}</label>
        <Segmented<CaddieSettings['style']>
          label={tr('Play style', 'Spielweise')}
          value={s.style}
          onChange={(v) => v && set({ style: v })}
          options={[
            { value: 'safe', label: tr('Safe', 'Sicher') },
            { value: 'normal', label: 'Normal' },
            { value: 'aggressive', label: tr('Aggressive', 'Offensiv') },
          ]}
        />
        <span className="muted small">
          {tr(
            'Safe: one club less off the tee when out of bounds is close, middle of the green, lay up earlier. Aggressive: goes for the green sooner, at the flag.',
            'Sicher: ein Schläger weniger vom Abschlag, wenn Aus nah ist, Grünmitte, früher vorlegen. Offensiv: geht früher aufs Grün, auf die Fahne.',
          )}
        </span>
      </div>
      <div className="field">
        <label>{tr('Greens today (for the putt line)', 'Grüns heute (für die Putt-Linie)')}</label>
        <Segmented<CaddieSettings['greenSpeed']>
          label={tr('Green speed', 'Grüngeschwindigkeit')}
          value={s.greenSpeed}
          onChange={(v) => v && set({ greenSpeed: v })}
          options={[
            { value: 'slow', label: tr('Slow', 'Langsam') },
            { value: 'medium', label: tr('Medium', 'Mittel') },
            { value: 'fast', label: tr('Fast', 'Schnell') },
          ]}
        />
      </div>
    </>
  );
}
