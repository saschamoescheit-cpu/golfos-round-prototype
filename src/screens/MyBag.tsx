import { useState } from 'react';
import type { Club, Round } from '../types';
import { clubName, DEFAULT_CARRY, type CarryBag } from '../lib/caddie';
import { analyse } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, saveCaddieSettings, saveCarryBag, type CaddieSettings } from '../lib/storage';
import { TopBar } from '../components/ui';

// "My bag & caddie" (feature 008): carry distance per club for the AI caddie, and the switches for
// caddie, green slope and the miss map. An empty field = club not in the bag.

export function MyBag(props: { rounds: Round[]; onBack: () => void }) {
  const [bag, setBag] = useState<Record<string, string>>(() => {
    const saved = loadCarryBag();
    return Object.fromEntries(DEFAULT_CARRY.map((d) => [d.club, String(saved ? (saved.find((s) => s.club === d.club)?.carry ?? '') : d.carry)]));
  });
  const [settings, setSettings] = useState<CaddieSettings>(loadCaddieSettings);
  const [note, setNote] = useState<string | null>(loadCarryBag() ? null : 'Start values for a mid-handicap player – enter your own carry distances.');

  const toggle = (k: keyof CaddieSettings) => {
    const next = { ...settings, [k]: !settings[k] };
    setSettings(next);
    saveCaddieSettings(next);
  };
  const save = () => {
    const out: CarryBag = DEFAULT_CARRY.map((d) => ({ club: d.club, carry: Number(bag[d.club]) })).filter((b) => b.carry > 0);
    saveCarryBag(out);
    setNote(`Saved · ${out.length} clubs.`);
  };
  /** Total distances from detailed rounds minus typical roll (≈ 7 %) as carry suggestion. */
  const fromRounds = () => {
    const clubs = analyse(props.rounds.filter((r) => r.finishedAt)).clubs.filter((c) => c.shots >= 3);
    if (!clubs.length) {
      setNote('No club has 3 tracked shots yet – track rounds in “Detailed” mode.');
      return;
    }
    setBag({ ...bag, ...Object.fromEntries(clubs.map((c) => [c.club, String(Math.round((c.median * 0.93) / 5) * 5)])) });
    setNote(`Filled from your tracked shots (${clubs.map((c) => c.club).join(', ')}) – check and save.`);
  };

  return (
    <main className="screen">
      <TopBar title="My bag & caddie" onBack={props.onBack} />

      <section className="card stats-card">
        <h2>AI caddie</h2>
        <button type="button" className="toggle" aria-pressed={settings.caddie} onClick={() => toggle('caddie')}>
          {settings.caddie ? '✓' : '○'} Club advice on every hole (wind, temperature, slope)
        </button>
        <button type="button" className="toggle" aria-pressed={settings.greenSlope} onClick={() => toggle('greenSlope')}>
          {settings.greenSlope ? '✓' : '○'} Green slope when I am on the green
        </button>
        <button type="button" className="toggle" aria-pressed={settings.missMap} onClick={() => toggle('missMap')}>
          {settings.missMap ? '✓' : '○'} Show where not to miss on the hole map
        </button>
      </section>

      <section className="card stats-card">
        <h2>Carry per club</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Carry = how far the ball flies in the air on a normal day (no wind, 20 °C, flat). Leave empty if the club is not in your bag.
        </p>
        <div className="bag-grid">
          {DEFAULT_CARRY.map((d) => (
            <label key={d.club} className="bag-row">
              <span>
                <strong>{d.club}</strong> <span className="muted small">{clubName(d.club as Club)}</span>
              </span>
              <span className="bag-input">
                <input
                  className="input"
                  inputMode="numeric"
                  value={bag[d.club]}
                  aria-label={`${clubName(d.club)} carry in metres`}
                  onChange={(e) => setBag({ ...bag, [d.club]: e.target.value.replace(/[^0-9]/g, '') })}
                />
                m
              </span>
            </label>
          ))}
        </div>
        {note && <p className="small" style={{ margin: 0 }}>{note}</p>}
        <div className="nav-bottom" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className="btn-secondary" onClick={fromRounds}>
            From my shots
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </section>
    </main>
  );
}
