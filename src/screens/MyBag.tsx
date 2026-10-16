import { useState } from 'react';
import type { Club, Round } from '../types';
import { clubName, type CarryBag } from '../lib/caddie';
import { byOrder, catalogEntry, CLUB_CATALOG, MAX_CLUBS, STANDARD_CLUBS, type ClubGroup } from '../lib/clubs';
import { trackedCarry } from '../lib/stats';
import { loadCaddieSettings, loadCarryBag, loadUnit, saveCaddieSettings, saveCarryBag, type CaddieSettings } from '../lib/storage';
import { Segmented, TopBar } from '../components/ui';
import { CaddieSettingsFields } from '../components/CaddieSettingsFields';
import { clubCode, tr } from '../lib/i18n';
import { loadPartials, savePartials, suggestedPartial, trackedPartials, WEDGES, type Partials } from '../lib/partials';
import { DEFAULT_LOFTS, loadBagStyle, saveBagStyle, withLoft, type BagStyle } from '../lib/bagstyle';

// "My bag" (feature 008, reached from the profile and the round's drawer), as Sascha wants it (15.10.2026): two tabs –
// full swing and pitches (¾, ½ and the favourite approach distance) –, short club codes (2i, not "Eisen 2"), the
// putter in the bag, the wedges with their loft ("PW (43°)"), and a pencil to put the bag together (more than 14 clubs allowed –
// players change clubs by course).

type Tab = 'full' | 'pitch';

export function MyBag(props: { rounds: Round[]; part: 'bag' | 'caddie'; onBack: () => void }) {
  if (props.part === 'caddie')
    return (
      <main className="screen">
        <TopBar title={tr('Caddie', 'Caddie')} onBack={props.onBack} />
        <section className="card stats-card">
          <CaddieSettingsFields />
        </section>
      </main>
    );
  return <Bag rounds={props.rounds} onBack={props.onBack} />;
}

function Bag(props: { rounds: Round[]; onBack: () => void }) {
  // metres or yards as the player set it (Sascha 15.10.2026) – stored in metres, shown and typed in his unit
  const unit = loadUnit();
  const U = unit === 'yd' ? 1.09361 : 1;
  const toU = (m: number) => Math.round(m * U);
  const toM = (x: number) => Math.round(x / U);
  const uL = unit === 'yd' ? 'yd' : 'm';
  // carry per club as typed (every club of the catalog, in the player's unit) and the clubs in the bag
  const [bag, setBag] = useState<Record<string, string>>(() => {
    const saved = loadCarryBag();
    return Object.fromEntries(CLUB_CATALOG.map((d) => [d.club, String(toU(saved?.find((s) => s.club === d.club)?.carry ?? d.carry))]));
  });
  const [inBag, setInBag] = useState<Club[]>(() => {
    const saved = loadCarryBag();
    return saved?.length ? byOrder(saved).map((b) => b.club) : STANDARD_CLUBS;
  });
  const [style, setStyle] = useState<BagStyle>(loadBagStyle);
  const [tab, setTab] = useState<Tab>('full');
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState<CaddieSettings>(loadCaddieSettings);
  // Wedges: three-quarter and half swing – empty = suggested from the full carry.
  const [partials, setPartials] = useState<Partials>(loadPartials);
  // what is typed in the pitch fields and the favourite distance (in the player's unit), saved on leaving the field
  const [pText, setPText] = useState<Record<string, string>>(() => {
    const p = loadPartials();
    const out: Record<string, string> = {};
    for (const [c, v] of Object.entries(p)) for (const sw of ['half', 'threeQ'] as const) if (v?.[sw] != null) out[`${c}|${sw}`] = String(toU(v[sw]!));
    return out;
  });
  const [favText, setFavText] = useState(() => String(toU(loadCaddieSettings().favourite)));
  const [note, setNote] = useState<string | null>(loadCarryBag() ? null : tr('Start values for a mid-handicap player – enter your own carry distances.', 'Startwerte für ein mittleres Handicap – trag deine eigenen Carry-Weiten ein.'));

  const setPartial = (club: Club, swing: 'half' | 'threeQ', v: string) => {
    const next: Partials = { ...partials, [club]: { ...partials[club], [swing]: v === '' ? undefined : Number(v) } };
    setPartials(next);
    savePartials(next);
  };
  const setStyleP = (patch: Partial<BagStyle>) => {
    const next = { ...style, ...patch };
    setStyle(next);
    saveBagStyle(next);
  };
  const fullOf = (club: Club) => toM(Number(bag[club])) || catalogEntry(club).carry; // metres
  const trackedP = trackedPartials(props.rounds, inBag.map((c) => ({ club: c, carry: fullOf(c) })), partials);
  // Only believable carries count (20–400 m); empty or odd values fall back to the standard for that club.
  const valid = (v: string) => toM(Number(v)) >= 20 && toM(Number(v)) <= 400;
  const persist = (next: Record<string, string>, clubs: Club[] = inBag) => {
    setBag(next);
    const out: CarryBag = clubs.map((c) => ({ club: c, carry: valid(next[c]) ? toM(Number(next[c])) : catalogEntry(c).carry }));
    saveCarryBag(out);
    return out;
  };
  const count = inBag.length + (style.putter ? 1 : 0);
  // saved with every change (Sascha 16.10.2026: no save buttons – it saves by itself)
  const setCarry = (c: Club, v: string) => {
    const next = { ...bag, [c]: v };
    setBag(next);
    persist(next);
  };
  const remove = (c: Club) => {
    const next = inBag.filter((x) => x !== c);
    setInBag(next);
    persist(bag, next);
    setNote(null);
  };
  const add = (c: Club) => {
    const next = byOrder([...inBag, c].map((club) => ({ club }))).map((x) => x.club);
    setInBag(next);
    persist(bag, next);
  };
  const setFav = (patch: Partial<CaddieSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveCaddieSettings(next);
  };
  // Tracked carry from your detailed rounds – compared with what you entered; you decide per club, any time.
  const tracked = trackedCarry(props.rounds);
  const differs = (club: Club) => {
    const t = tracked.get(club);
    return t != null && Math.abs(toM(Number(bag[club])) - t.carry) >= 5;
  };
  const toReview = inBag.filter((c) => differs(c)).length;
  const useTracked = (clubs: Club[]) => {
    const next = { ...bag };
    for (const c of clubs) next[c] = String(toU(tracked.get(c)!.carry));
    persist(next);
    setNote(null);
  };
  const groups: { id: ClubGroup; label: string }[] = [
    { id: 'wood', label: tr('Driver & woods', 'Driver & Hölzer') },
    { id: 'hybrid', label: tr('Hybrids', 'Hybride') },
    { id: 'iron', label: tr('Irons', 'Eisen') },
    { id: 'wedge', label: 'Wedges' },
  ];
  const wedges = inBag.filter((c) => WEDGES.includes(c));
  // under the table, in the app's quiet grey (Sascha 15.10.2026: not on top, not in yellow)
  const countLine = (
    <span className="muted small bag-count">
      {tr(`${count} clubs incl. putter`, `${count} Schläger inkl. Putter`)}
      {count > MAX_CLUBS ? tr(` · a counting round allows ${MAX_CLUBS}`, ` · in einer Wertungsrunde sind ${MAX_CLUBS} erlaubt`) : ''}
    </span>
  );
  const pencil = (
    <button type="button" className={`icon-btn bag-edit${editing ? ' on' : ''}`} aria-pressed={editing} aria-label={editing ? tr('Done', 'Fertig') : tr('Edit your bag', 'Bag bearbeiten')} onClick={() => setEditing(!editing)}>
      {editing ? (
        tr('Done', 'Fertig')
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="M14 6l4 4" />
        </svg>
      )}
    </button>
  );

  return (
    <main className="screen">
      <TopBar title={tr('My bag', 'Mein Bag')} onBack={props.onBack} right={pencil} />
      {!editing && (
        <Segmented<Tab>
          label={tr('Distances', 'Distanzen')}
          value={tab}
          onChange={(v) => v && setTab(v)}
          options={[
            { value: 'full', label: tr('Full swing', 'Voller Schwung') },
            { value: 'pitch', label: tr('Pitches', 'Pitches') },
          ]}
        />
      )}

      {editing ? (
        <>
          <section className="card stats-card">
            <h2>{tr('In your bag', 'In deinem Bag')}</h2>
            <div className="bag-grid">
              {inBag.map((c) => (
                <div key={c} className="bag-row edit">
                  <strong className="bag-code">{clubCode(c)}</strong>
                  {WEDGES.includes(c) && (
                    <span className="bag-input">
                      <input
                        className="input"
                        inputMode="numeric"
                        value={style.lofts[c] ?? ''}
                        placeholder={String(DEFAULT_LOFTS[c] ?? '')}
                        aria-label={tr(`Loft of the ${c}`, `Loft des ${c}`)}
                        onChange={(e) => setStyleP({ lofts: { ...style.lofts, [c]: Number(e.target.value.replace(/[^0-9]/g, '').slice(0, 2)) || undefined } })}
                      />
                      °
                    </span>
                  )}
                  <button type="button" className="bag-remove" aria-label={tr(`Remove ${clubCode(c)} from the bag`, `${clubCode(c)} aus dem Bag entfernen`)} onClick={() => remove(c)}>
                    ✕
                  </button>
                </div>
              ))}
              {style.putter && (
                <div className="bag-row edit">
                  <strong className="bag-code">Putter</strong>
                  <button type="button" className="bag-remove" aria-label={tr('Remove the putter from the bag', 'Putter aus dem Bag entfernen')} onClick={() => setStyleP({ putter: false })}>
                    ✕
                  </button>
                </div>
              )}
            </div>
            {countLine}
          </section>
          <section className="card stats-card">
            <h2>{tr('Add clubs', 'Schläger hinzufügen')}</h2>
            {groups.map((g) => {
              const missing = CLUB_CATALOG.filter((c) => c.group === g.id && !inBag.includes(c.club));
              if (!missing.length) return null;
              return (
                <div key={g.id} className="field">
                  <label>{g.label}</label>
                  <div className="chip-set">
                    {missing.map((c) => (
                      <button key={c.club} type="button" className="chip" aria-label={tr(`Add ${clubName(c.club)}`, `${clubName(c.club)} hinzufügen`)} onClick={() => add(c.club)}>
                        + {clubCode(c.club)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!style.putter && (
              <div className="field">
                <label>Putter</label>
                <div className="chip-set">
                  <button type="button" className="chip" onClick={() => setStyleP({ putter: true })}>
                    + Putter
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : tab === 'full' ? (
        <section className="card stats-card">
          <div className="bag-grid">
            <div className="bag-row full bag-th" aria-hidden="true">
              <span />
              <span />
              <span className="muted small">Carry</span>
            </div>
            {inBag.map((c) => {
              const t = tracked.get(c);
              return (
                <div key={c} className="bag-row full">
                  <strong className="bag-code">{withLoft(clubCode(c), c, style)}</strong>
                  {t && differs(c) ? (
                    <span className="bag-tracked differs">
                      <span className="bag-tracked-text">
                        <span className="bag-tracked-label">{tr(`${t.shots} shots tracked`, `${t.shots} Schläge gemessen`)}</span>
                        <span>
                          {toU(t.carry)} {uL}
                        </span>
                      </span>
                      {differs(c) && (
                        <button type="button" className="use-btn" aria-label={tr(`Use tracked ${toU(t.carry)} ${uL} for ${clubCode(c)}`, `Gemessene ${toU(t.carry)} ${uL} für ${clubCode(c)} übernehmen`)} title={tr('Use', 'Übernehmen')} onClick={() => useTracked([c])}>
                          <UseIcon />
                        </button>
                      )}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="bag-input">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={bag[c]}
                      aria-label={tr(`${clubCode(c)} carry in ${unit === 'yd' ? 'yards' : 'metres'}`, `${clubCode(c)} Carry in ${unit === 'yd' ? 'Yards' : 'Metern'}`)}
                      onChange={(e) => setCarry(c, e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                      aria-invalid={bag[c] !== '' && !valid(bag[c])}
                    />
                    {uL}
                  </span>
                </div>
              );
            })}
            {style.putter && (
              <div className="bag-row full">
                <strong className="bag-code">Putter</strong>
                <span />
                <span className="bag-input">
                  <input className="input" value="–" readOnly disabled aria-label={tr('Putter – no carry', 'Putter – ohne Weite')} />
                  {uL}
                </span>
              </div>
            )}
          </div>
          {/* under the table (Sascha 15.10.2026) */}
          {toReview > 0 && (
            <button type="button" className="btn-secondary use-all" onClick={() => useTracked(inBag.filter((c) => differs(c)))}>
              <UseIcon />
              {tr(`Use tracked values for ${toReview} ${toReview === 1 ? 'club' : 'clubs'}`, `Gemessene Werte für ${toReview} Schläger übernehmen`)}
            </button>
          )}
          {note && <p className="small" style={{ margin: 0 }}>{note}</p>}
          <div className="bag-foot">
            {countLine}
          </div>
        </section>
      ) : (
        <>
          <section className="card stats-card">
            <h2>{tr('Favourite approach', 'Lieblingsdistanz')}</h2>
            <div className="bag-row full">
              <span className="muted small">{tr('Layups leave this distance to the green.', 'Beim Vorlegen bleibt diese Distanz zum Grün.')}</span>
              <span />
              <span className="bag-input">
                <input
                  className="input"
                  inputMode="numeric"
                  value={favText}
                  aria-label={tr('Favourite approach distance', 'Lieblingsdistanz')}
                  onChange={(e) => setFavText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                  onBlur={() => {
                    const m = Math.min(200, Math.max(30, toM(Number(favText)) || 90));
                    setFav({ favourite: m });
                    setFavText(String(toU(m)));
                  }}
                />
                {uL}
              </span>
            </div>
          </section>
          <section className="card stats-card">
            <h2>{tr('Pitches with the wedges', 'Pitches mit den Wedges')}</h2>
            <div className="pitch-grid" role="table" aria-label={tr('Partial swings', 'Teilschwünge')}>
              <span className="pitch-h" role="columnheader" />
              <span className="pitch-h muted small" role="columnheader">{tr('full', 'voll')}</span>
              <span className="pitch-h muted small" role="columnheader">¾</span>
              <span className="pitch-h muted small" role="columnheader">½</span>
              {wedges.map((c) => (
                <div key={c} className="pitch-row" role="row">
                  <strong className="bag-code" role="cell">{withLoft(clubCode(c), c, style)}</strong>
                  <span className="muted" role="cell">{toU(fullOf(c))}</span>
                  {(['threeQ', 'half'] as const).map((sw) => {
                    const t = trackedP.get(`${c}|${sw}`);
                    const own = partials[c]?.[sw];
                    return (
                      <span key={sw} className="pitch-cell" role="cell">
                        <input
                          className="input"
                          inputMode="numeric"
                          value={pText[`${c}|${sw}`] ?? ''}
                          placeholder={`≈ ${toU(suggestedPartial(fullOf(c), sw))}`}
                          aria-label={tr(`${clubCode(c)} ${sw === 'threeQ' ? '¾' : '½'} swing carry`, `${clubCode(c)} ${sw === 'threeQ' ? '¾' : '½'}-Schwung Carry`)}
                          onChange={(e) => setPText({ ...pText, [`${c}|${sw}`]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
                          onBlur={() => {
                            const v = pText[`${c}|${sw}`] ?? '';
                            setPartial(c, sw, v === '' ? '' : String(toM(Number(v))));
                          }}
                        />
                        {t && Math.abs((own ?? suggestedPartial(fullOf(c), sw)) - t.carry) >= 4 && (
                          <span className="pitch-tracked">
                            <span className="muted small">{tr(`tracked ${toU(t.carry)}`, `gemessen ${toU(t.carry)}`)}</span>
                            <button
                              type="button"
                              className="use-btn small"
                              aria-label={tr(`Use tracked ${toU(t.carry)} ${uL}`, `Gemessene ${toU(t.carry)} ${uL} übernehmen`)}
                              title={tr('Use', 'Übernehmen')}
                              onClick={() => {
                                setPartial(c, sw, String(t.carry));
                                setPText({ ...pText, [`${c}|${sw}`]: String(toU(t.carry)) });
                              }}
                            >
                              <UseIcon />
                            </button>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            {!wedges.length && <p className="muted small">{tr('No wedges in your bag.', 'Keine Wedges in deinem Bag.')}</p>}
          </section>
        </>
      )}
    </main>
  );
}

/** "Use the tracked value": two arrows – the upper one to the left, the lower one to the right (Sascha 15.10.2026). */
function UseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 8H5M9 4L5 8l4 4" />
      <path d="M4 16h15M15 12l4 4-4 4" />
    </svg>
  );
}
