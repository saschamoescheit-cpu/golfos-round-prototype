import { useState } from 'react';
import type { Club, Round } from '../types';
import { clubName, DEFAULT_CARRY, type CarryBag } from '../lib/caddie';
import { trackedCarry } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, saveCaddieSettings, saveCarryBag, type CaddieSettings } from '../lib/storage';
import { Segmented, TopBar } from '../components/ui';

// "My bag & caddie" (feature 008): carry distance per club for the AI caddie, and the switches for
// caddie, green slope and the miss map. An empty field = club not in the bag.

export function MyBag(props: { rounds: Round[]; onBack: () => void }) {
  const [bag, setBag] = useState<Record<string, string>>(() => {
    const saved = loadCarryBag();
    return Object.fromEntries(DEFAULT_CARRY.map((d) => [d.club, String(saved ? (saved.find((s) => s.club === d.club)?.carry ?? '') : d.carry)]));
  });
  const [settings, setSettings] = useState<CaddieSettings>(loadCaddieSettings);
  const [note, setNote] = useState<string | null>(loadCarryBag() ? null : 'Start values for a mid-handicap player – enter your own carry distances.');

  const set = (patch: Partial<CaddieSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveCaddieSettings(next);
  };
  const toggle = (k: 'caddie' | 'greenSlope' | 'missMap' | 'voice') => {
    const next = { ...settings, [k]: !settings[k] };
    setSettings(next);
    saveCaddieSettings(next);
  };
  const save = () => {
    const out: CarryBag = DEFAULT_CARRY.map((d) => ({ club: d.club, carry: Number(bag[d.club]) })).filter((b) => b.carry > 0);
    saveCarryBag(out);
    setNote(`Saved · ${out.length} clubs.`);
  };
  // Tracked carry from your detailed rounds – compared with what you entered; you decide per club, any time.
  const tracked = trackedCarry(props.rounds);
  const differs = (club: string) => {
    const t = tracked.get(club as Club);
    return t != null && (bag[club] === '' || Math.abs(Number(bag[club]) - t.carry) >= 5);
  };
  const toReview = DEFAULT_CARRY.filter((d) => differs(d.club)).length;
  const persist = (next: Record<string, string>) => {
    setBag(next);
    saveCarryBag(DEFAULT_CARRY.map((d) => ({ club: d.club, carry: Number(next[d.club]) })).filter((b) => b.carry > 0));
  };
  const useTracked = (clubs: string[]) => {
    const next = { ...bag };
    for (const c of clubs) next[c] = String(tracked.get(c as Club)!.carry);
    persist(next);
    setNote(`Updated from your tracked shots: ${clubs.join(', ')}.`);
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
        <button type="button" className="toggle" aria-pressed={settings.voice} onClick={() => toggle('voice')}>
          {settings.voice ? '✓' : '○'} Caddie speaks (reads the advice aloud on every new shot)
        </button>
        <div className="field">
          <label>How should the caddie plan?</label>
          <Segmented<CaddieSettings['style']>
            label="Play style"
            value={settings.style}
            onChange={(v) => v && set({ style: v })}
            options={[
              { value: 'safe', label: 'Safe' },
              { value: 'normal', label: 'Normal' },
              { value: 'aggressive', label: 'Aggressive' },
            ]}
          />
          <span className="muted small">
            Safe: one club less off the tee when out of bounds is close, middle of the green, lay up earlier. Aggressive: goes for the green sooner, at the flag.
          </span>
        </div>
        <label className="bag-row">
          <span>
            <strong>Favourite approach</strong> <span className="muted small">layups leave this distance</span>
          </span>
          <span className="bag-input">
            <input
              className="input"
              inputMode="numeric"
              value={settings.favourite}
              aria-label="Favourite approach distance in metres"
              onChange={(e) => set({ favourite: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
            />
            m
          </span>
        </label>
      </section>

      <section className="card stats-card">
        <h2>Carry per club</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Carry = how far the ball flies in the air on a normal day (no wind, 20 °C, flat). Leave empty if the club is not in your bag.
          Next to it: what your tracked shots say (from 3 full shots per club). Keep your value or take the tracked one – check again after a few rounds.
        </p>
        {toReview > 0 && (
          <button type="button" className="btn-secondary" onClick={() => useTracked(DEFAULT_CARRY.filter((d) => differs(d.club)).map((d) => d.club))}>
            Use tracked values for {toReview} {toReview === 1 ? 'club' : 'clubs'}
          </button>
        )}
        <div className="bag-grid">
          {DEFAULT_CARRY.map((d) => (
            <div key={d.club} className="bag-row club">
              <span className="bag-name">
                <strong>{d.club}</strong>
                <span className="muted small">{clubName(d.club as Club)}</span>
              </span>
              {!tracked.get(d.club as Club) && <span className="bag-tracked muted">–</span>}
              {tracked.get(d.club as Club) && (
                <span className={`bag-tracked${differs(d.club) ? ' differs' : ''}`}>
                  tracked {tracked.get(d.club as Club)!.carry} m <span className="muted">({tracked.get(d.club as Club)!.shots})</span>
                  {differs(d.club) && (
                    <button type="button" aria-label={`Use tracked ${tracked.get(d.club as Club)!.carry} m for ${clubName(d.club as Club)}`} onClick={() => useTracked([d.club])}>
                      Use
                    </button>
                  )}
                </span>
              )}
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
            </div>
          ))}
        </div>
        {note && <p className="small" style={{ margin: 0 }}>{note}</p>}
        <button type="button" className="btn-primary" onClick={save}>
          Save my values
        </button>
      </section>
    </main>
  );
}
