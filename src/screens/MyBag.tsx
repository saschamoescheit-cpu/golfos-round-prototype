import { Fragment, useState } from 'react';
import type { Club, Round } from '../types';
import { clubName, DEFAULT_CARRY, type CarryBag } from '../lib/caddie';
import { trackedCarry } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, loadUnit, saveCaddieSettings, saveCarryBag, saveUnit, type CaddieSettings } from '../lib/storage';
import { Segmented, TopBar } from '../components/ui';
import { clubCode, tr } from '../lib/i18n';
import { loadPartials, savePartials, suggestedPartial, trackedPartials, WEDGES, type Partials } from '../lib/partials';

// "My bag & caddie" (feature 008): carry distance per club for the AI caddie, and the switches for
// caddie, green slope and the miss map. An empty field = club not in the bag.

export function MyBag(props: { rounds: Round[]; onBack: () => void }) {
  const [bag, setBag] = useState<Record<string, string>>(() => {
    const saved = loadCarryBag();
    return Object.fromEntries(DEFAULT_CARRY.map((d) => [d.club, String(saved ? (saved.find((s) => s.club === d.club)?.carry ?? '') : d.carry)]));
  });
  const [settings, setSettings] = useState<CaddieSettings>(loadCaddieSettings);
  // Wedges: half (9 o'clock) and three-quarter (10:30) swing – empty = suggested from the full carry.
  const [partials, setPartials] = useState<Partials>(loadPartials);
  const setPartial = (club: Club, swing: 'half' | 'threeQ', v: string) => {
    const n = Number(v);
    const next: Partials = { ...partials, [club]: { ...partials[club], [swing]: v === '' ? undefined : n } };
    setPartials(next);
    savePartials(next);
  };
  const fullOf = (club: Club) => Number(bag[club]) || DEFAULT_CARRY.find((d) => d.club === club)!.carry;
  const trackedP = trackedPartials(props.rounds, DEFAULT_CARRY.map((d) => ({ club: d.club, carry: fullOf(d.club) })), partials);
  const [unit, setUnit] = useState(loadUnit);
  const [note, setNote] = useState<string | null>(loadCarryBag() ? null : tr('Start values for a mid-handicap player – enter your own carry distances.', 'Startwerte für ein mittleres Handicap – trag deine eigenen Carry-Weiten ein.'));

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
  // Only believable carries count (20–400 m); empty or odd values fall back to the standard for that club.
  const valid = (v: string) => Number(v) >= 20 && Number(v) <= 400;
  const save = () => {
    const out: CarryBag = DEFAULT_CARRY.map((d) => ({ club: d.club, carry: Number(bag[d.club]) })).filter((b) => valid(String(b.carry)));
    saveCarryBag(out);
    setNote(tr(`Saved · ${out.length} clubs.`, `Gespeichert · ${out.length} Schläger.`));
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
    saveCarryBag(DEFAULT_CARRY.map((d) => ({ club: d.club, carry: Number(next[d.club]) })).filter((b) => valid(String(b.carry))));
  };
  const useTracked = (clubs: string[]) => {
    const next = { ...bag };
    for (const c of clubs) next[c] = String(tracked.get(c as Club)!.carry);
    persist(next);
    setNote(tr(`Updated from your tracked shots: ${clubs.join(', ')}.`, `Aus deinen gemessenen Schlägen übernommen: ${clubs.map((c) => clubCode(c as Club)).join(', ')}.`));
  };

  return (
    <main className="screen">
      <TopBar title={tr('My bag & caddie', 'Mein Bag & Caddie')} onBack={props.onBack} />

      <section className="card stats-card">
        <h2>{tr('Distances in', 'Distanzen in')}</h2>
        <Segmented<'m' | 'yd'>
          label={tr('Unit', 'Einheit')}
          value={unit}
          onChange={(v) => {
            if (!v) return;
            setUnit(v);
            saveUnit(v);
          }}
          options={[
            { value: 'm', label: tr('Metres', 'Meter') },
            { value: 'yd', label: 'Yards' },
          ]}
        />
      </section>

      <section className="card stats-card">
        <h2>{tr('AI caddie', 'KI-Caddie')}</h2>
        <button type="button" className="toggle" aria-pressed={settings.caddie} onClick={() => toggle('caddie')}>
          {settings.caddie ? '✓' : '○'} {tr('Club advice on every hole (wind, temperature, slope)', 'Schlägerempfehlung an jedem Loch (Wind, Temperatur, Höhe)')}
        </button>
        <button type="button" className="toggle" aria-pressed={settings.greenSlope} onClick={() => toggle('greenSlope')}>
          {settings.greenSlope ? '✓' : '○'} {tr('Green slope when I am on the green', 'Grün-Neigung, wenn ich auf dem Grün bin')}
        </button>
        <button type="button" className="toggle" aria-pressed={settings.missMap} onClick={() => toggle('missMap')}>
          {settings.missMap ? '✓' : '○'} {tr('Show where not to miss on the hole map', 'Auf der Lochkarte zeigen, wo ich nicht verfehlen darf')}
        </button>
        <button type="button" className="toggle" aria-pressed={settings.voice} onClick={() => toggle('voice')}>
          {settings.voice ? '✓' : '○'} {tr('Caddie speaks (reads the advice aloud on every new shot)', 'Caddie spricht (liest die Empfehlung bei jedem neuen Schlag vor)')}
        </button>
        <div className="field">
          <label>{tr('How should the caddie plan?', 'Wie soll der Caddie planen?')}</label>
          <Segmented<CaddieSettings['style']>
            label={tr('Play style', 'Spielweise')}
            value={settings.style}
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
        <label className="bag-row">
          <span>
            <strong>{tr('Favourite approach', 'Lieblingsdistanz')}</strong> <span className="muted small">{tr('layups leave this distance', 'beim Vorlegen bleibt diese Distanz')}</span>
          </span>
          <span className="bag-input">
            <input
              className="input"
              inputMode="numeric"
              value={settings.favourite}
              aria-label={tr('Favourite approach distance in metres', 'Lieblingsdistanz in Metern')}
              onChange={(e) => set({ favourite: Number(e.target.value.replace(/[^0-9]/g, '').slice(0, 3)) || 0 })}
              onBlur={() => set({ favourite: Math.min(200, Math.max(30, settings.favourite || 90)) })}
            />
            m
          </span>
        </label>
      </section>

      <section className="card stats-card">
        <h2>{tr('Carry per club', 'Carry je Schläger')}</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {tr(
            'Carry = how far the ball flies in the air on a normal day (no wind, 20 °C, flat). Leave empty if the club is not in your bag. Next to it: what your tracked shots say (from 3 full shots per club). Keep your value or take the tracked one – check again after a few rounds. For the wedges also a three-quarter (10:30) and a half swing (9 o’clock): empty = suggested from the full carry, used between 30 m and the full pitching wedge.',
            'Carry = wie weit der Ball an einem normalen Tag fliegt (kein Wind, 20 °C, eben). Leer lassen, wenn der Schläger nicht im Bag ist. Daneben: was deine gemessenen Schläge sagen (ab 3 vollen Schlägen je Schläger). Behalte deinen Wert oder übernimm den gemessenen – schau nach ein paar Runden wieder rein. Bei den Wedges zusätzlich Dreiviertel- (10:30) und halber Schwung (9 Uhr): leer = Vorschlag aus der vollen Carry, für Distanzen zwischen 30 m und dem vollen Pitching Wedge.',
          )}
        </p>
        {toReview > 0 && (
          <button type="button" className="btn-secondary" onClick={() => useTracked(DEFAULT_CARRY.filter((d) => differs(d.club)).map((d) => d.club))}>
            {tr(`Use tracked values for ${toReview} ${toReview === 1 ? 'club' : 'clubs'}`, `Gemessene Werte für ${toReview} ${toReview === 1 ? 'Schläger' : 'Schläger'} übernehmen`)}
          </button>
        )}
        <div className="bag-grid">
          {DEFAULT_CARRY.map((d) => (
            <Fragment key={d.club}>
            <div className="bag-row club">
              <span className="bag-name">
                <strong>{clubCode(d.club as Club)}</strong>
                <span className="muted small">{clubName(d.club as Club)}</span>
              </span>
              {!tracked.get(d.club as Club) && <span className="bag-tracked muted">–</span>}
              {tracked.get(d.club as Club) && (
                <span className={`bag-tracked${differs(d.club) ? ' differs' : ''}`}>
                  {tr('tracked', 'gemessen')} {tracked.get(d.club as Club)!.carry} m <span className="muted">({tracked.get(d.club as Club)!.shots})</span>
                  {differs(d.club) && (
                    <button type="button" aria-label={tr(`Use tracked ${tracked.get(d.club as Club)!.carry} m for ${clubName(d.club as Club)}`, `Gemessene ${tracked.get(d.club as Club)!.carry} m für ${clubName(d.club as Club)} übernehmen`)} onClick={() => useTracked([d.club])}>
                      {tr('Use', 'Übernehmen')}
                    </button>
                  )}
                </span>
              )}
              <span className="bag-input">
                <input
                  className="input"
                  inputMode="numeric"
                  value={bag[d.club]}
                  aria-label={tr(`${clubName(d.club)} carry in metres`, `${clubName(d.club)} Carry in Metern`)}
                  onChange={(e) => setBag({ ...bag, [d.club]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
                  onBlur={save}
                  aria-invalid={bag[d.club] !== '' && !valid(bag[d.club])}
                />
                m
              </span>
            </div>
            {WEDGES.includes(d.club) && Number(bag[d.club]) > 0 && (
              <div className="bag-partials" role="group" aria-label={tr(`${clubName(d.club)} partial swings`, `${clubName(d.club)} Teilschwünge`)}>
                {(['threeQ', 'half'] as const).map((sw) => {
                  const t = trackedP.get(`${d.club}|${sw}`);
                  const own = partials[d.club]?.[sw];
                  const label = sw === 'threeQ' ? tr('¾ (10:30)', '¾ (10:30)') : tr('½ (9 o’clock)', '½ (9 Uhr)');
                  return (
                    <span key={sw} className="bag-partial">
                      <span className="muted small">{label}</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={own ?? ''}
                        placeholder={`≈ ${suggestedPartial(fullOf(d.club), sw)}`}
                        aria-label={tr(`${clubName(d.club)} ${sw === 'threeQ' ? 'three-quarter' : 'half'} swing carry in metres`, `${clubName(d.club)} ${sw === 'threeQ' ? 'Dreiviertel' : 'halber'} Schwung Carry in Metern`)}
                        onChange={(e) => setPartial(d.club, sw, e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                      />
                      {t && Math.abs((own ?? suggestedPartial(fullOf(d.club), sw)) - t.carry) >= 4 && (
                        <button type="button" className="bag-use" onClick={() => setPartial(d.club, sw, String(t.carry))}>
                          {tr(`tracked ${t.carry} m · use`, `gemessen ${t.carry} m · übernehmen`)}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            </Fragment>
          ))}
        </div>
        {note && <p className="small" style={{ margin: 0 }}>{note}</p>}
        <button type="button" className="btn-primary" onClick={save}>
          {tr('Save my values', 'Meine Werte speichern')}
        </button>
      </section>
    </main>
  );
}
