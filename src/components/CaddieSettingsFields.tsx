import { useState } from 'react';
import { loadCaddieSettings, saveCaddieSettings, type CaddieSettings } from '../lib/storage';
import { Segmented } from './ui';
import { tr } from '../lib/i18n';

// The caddie's few settings (Sascha 15.10.2026): on/off, green slope, reading aloud by itself (with headphones),
// and how he plans (green speed dropped, Sascha 15.10.2026). The miss map is gone until it is good; language and sun mode sit in
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
      {/* switches as in the hole overview (Sascha 15.10.2026: "a slider looks better and is what users know") */}
      <div className="drawer-list settings-switches">
        {(
          [
            ['caddie', tr('Club advice on every hole', 'Schlägerempfehlung an jedem Loch'), tr('wind, temperature, slope', 'Wind, Temperatur, Höhe')],
            ['greenSlope', tr('Green slope on the green', 'Grün-Neigung auf dem Grün'), null],
            ['voice', tr('Read aloud by itself', 'Von selbst vorlesen'), tr('with headphones', 'mit Kopfhörern')],
          ] as const
        ).map(([k, label, sub]) => (
          <button key={k} type="button" className="drawer-row" role="switch" aria-checked={s[k]} onClick={() => set({ [k]: !s[k] })}>
            <span className="switch-label">
              <span>{label}</span>
              {sub && <span className="muted small">{sub}</span>}
            </span>
            <span className={`drawer-switch${s[k] ? ' on' : ''}`} aria-hidden="true" />
          </button>
        ))}
      </div>
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
      </div>
    </>
  );
}
