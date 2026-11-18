import { useEffect, useState } from 'react';
import { loadCaddieSettings, saveCaddieSettings, type CaddieSettings } from '../lib/storage';
import { dec, tr } from '../lib/i18n';
import { altEffect, autoHomeAlt, hereAltitude, homeAltitude } from '../lib/homealt';
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
  // another device changed them: read again here – an open sheet stays open (Sascha 17.11.2026, iPad: the sheets closed by
  // themselves while the iPhone synced – the profile used to rebuild this block on every sync)
  useEffect(() => {
    const again = () => setS(loadCaddieSettings());
    window.addEventListener('golfos:pulled', again);
    return () => window.removeEventListener('golfos:pulled', again);
  }, []);
  const auto = autoHomeAlt();
  // where the phone is now – asked when the sheet opens (GPS once), shown beside the home course to compare
  const [here, setHere] = useState<{ name: string | null; alt: number | null } | null | 'asking'>('asking');
  const askHere = () => {
    setHere('asking');
    // the home course's height too, when not known yet (asked once, kept on the phone)
    void Promise.all([hereAltitude(), homeAltitude()]).then(([h]) => setHere(h));
  };
  const hereText =
    here === 'asking'
      ? tr('Here: finding your position …', 'Hier: Standort wird ermittelt …')
      : !here
        ? tr('Here: no GPS', 'Hier: kein GPS')
        : tr(`Here: ${here.name ?? tr('your position', 'dein Standort')}${here.alt != null ? ` – ${here.alt} m` : ''}`, `Hier: ${here.name ?? tr('your position', 'dein Standort')}${here.alt != null ? ` – ${here.alt} m` : ''}`);
  const homeText = auto.course
    ? tr(`Home course ${auto.course}${auto.alt != null ? ` – ${auto.alt} m` : ''}`, `Heimatclub ${auto.course}${auto.alt != null ? ` – ${auto.alt} m` : ''}`)
    : tr('Home course from the profile – not found yet: choose a height', 'Heimatclub aus dem Profil – noch nicht gefunden: Höhe wählen');
  const eff = here && here !== 'asking' && here.alt != null && auto.alt != null ? altEffect(here.alt, auto.alt) : null;
  const effText =
    eff == null || Math.abs(eff) < 0.5
      ? null
      : eff < 0
        ? tr(`the ball flies about ${dec((-eff).toFixed(1))} % shorter here`, `der Ball fliegt hier rund ${dec((-eff).toFixed(1))} % kürzer`)
        : tr(`the ball flies about ${dec(eff.toFixed(1))} % farther here`, `der Ball fliegt hier rund ${dec(eff.toFixed(1))} % weiter`);
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
      {/* the height of the player's distances (Sascha 16.11.2026: "je 300 Höhenmeter fliegt der Ball 2 % länger") – a
          course higher than home plays shorter, a lower one longer */}
      <ChoiceRow<string>
        label={tr('Height of your distances', 'Höhe deiner Weiten')}
        title={tr('Where your distances come from', 'Wo deine Weiten entstanden sind')}
        value={String(s.homeAlt ?? 'auto')}
        onChange={(v) => set({ homeAlt: v === 'auto' ? 'auto' : Number(v) })}
        onOpen={askHere}
        options={[
          {
            value: 'auto',
            name: tr('Automatic', 'Automatisch'),
            // here (GPS) and the home course, to compare (Sascha 18.11.2026)
            text: [hereText, homeText, effText].filter(Boolean).join(' · '),
          },
          ...[0, 100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000].map((m) => ({ value: String(m), name: m === 0 ? tr('0 m – sea level', '0 m – Meereshöhe') : `${m} m` })),
        ]}
      />
    </div>
  );
}
