import { useState } from 'react';
import { loadCaddieSettings, saveCaddieSettings, type CaddieSettings } from '../lib/storage';
import { tr } from '../lib/i18n';
import { ChoiceRow, OnOffRow } from './Settings';

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
  const set = (patch: Partial<CaddieSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveCaddieSettings(next);
  };
  return (
    // rows of a settings list, as the Golf block above (Sascha 12.11.2026: Caddie, Mitteilungen, Hilfe in exactly the same
    // row style); each with one line what it does
    <div className="settings-list caddie-list">
      {(
        [
          ['caddie', tr('Club advice', 'Schlägerempfehlungen'), tr('wind, temperature, slope', 'Wind, Temperatur, Höhe')],
          ['greenSlope', tr('Green slope on the green', 'Grün-Neigung auf dem Grün'), tr('arrow and gradient on the map', 'Pfeil und Gefälle auf der Karte')],
          ['voice', tr('Read aloud by itself', 'Von selbst vorlesen'), tr('with headphones', 'mit Kopfhörern')],
        ] as const
      ).map(([k, label, sub]) => (
        // a row with An/Aus and its sheet, no slider (Sascha 11.11.2026: "ohne Schieberegler – einheitlich")
        <OnOffRow key={k} label={label} text={sub} on={s[k]} onChange={(v) => set({ [k]: v })} />
      ))}
      {/* how the caddie plans: a row of the same list, the choice in a sheet (Sascha 17.10.2026: "does not fit the style") */}
      <ChoiceRow<CaddieSettings['style']>
        label={tr('How the caddie plans', 'Wie der Caddie plant')}
        value={s.style}
        onChange={(v) => set({ style: v })}
        options={STYLES.map((o) => ({ value: o.value, name: o.label(), text: o.hint() }))}
      />
    </div>
  );
}
