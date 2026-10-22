import { useState } from 'react';
import { loadCaddieSettings, saveCaddieSettings, type CaddieSettings } from '../lib/storage';
import { tr } from '../lib/i18n';

// The caddie's few settings (Sascha 15.10.2026): on/off, green slope, reading aloud by itself (with headphones),
// and how he plans (green speed dropped, Sascha 15.10.2026). The miss map is gone until it is good; language and sun mode sit in
// the header.

const STYLES: { value: CaddieSettings['style']; label: () => string; hint: () => string }[] = [
  { value: 'safe', label: () => tr('Safe', 'Sicher'), hint: () => tr('Away from the hazards, the wide part of the fairway', 'Weg von den Hindernissen, auf den breiten Teil des Fairways') },
  { value: 'normal', label: () => 'Normal', hint: () => tr('The best line for your game', 'Die beste Linie für dein Spiel') },
  { value: 'aggressive', label: () => tr('Aggressive', 'Offensiv'), hint: () => tr('Shorter lines to the green, more risk', 'Kürzere Wege zum Grün, mehr Risiko') },
];

export function CaddieSettingsFields() {
  const [s, setS] = useState<CaddieSettings>(loadCaddieSettings);
  const [picking, setPicking] = useState(false);
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
        {/* how the caddie plans: a row of the same list, the choice in a sheet (Sascha 17.10.2026: "does not fit the style") */}
        <button type="button" className="drawer-row" aria-haspopup="dialog" onClick={() => setPicking(true)}>
          <span className="switch-label">
            <span>{tr('How the caddie plans', 'Wie der Caddie plant')}</span>
          </span>
          <span className="drawer-value">
            {STYLES.find((x) => x.value === s.style)?.label()} <span aria-hidden="true">›</span>
          </span>
        </button>
      </div>
      {picking && (
        <div className="sheet-backdrop" onClick={() => setPicking(false)}>
          <section className="sheet" role="dialog" aria-label={tr('How the caddie plans', 'Wie der Caddie plant')} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>{tr('How the caddie plans', 'Wie der Caddie plant')}</strong>
              <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={() => setPicking(false)}>
                ✕
              </button>
            </div>
            <div className="pick-list">
              {STYLES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="pick-option"
                  aria-pressed={s.style === o.value}
                  onClick={() => {
                    set({ style: o.value });
                    setPicking(false);
                  }}
                >
                  <span className="grow">
                    <strong>{o.label()}</strong>
                    <span className="muted small">{o.hint()}</span>
                  </span>
                  {s.style === o.value && <span className="pick-check" aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
