import { useState } from 'react';
import { tr } from '../lib/i18n';
import { metres, specialBoard, specialName, specialsAt, type Special } from '../lib/specials';
import { setSpecial, type RoundEvent } from '../lib/sharedround';

// Special prizes at their hole (Sascha 01.11.2026: "Long Drive and Nearest to the Pin – the player enters his figure at
// the hole, everyone sees who leads"): a line on the hole map with the leader and "eintragen"; Nearest to the Pin the
// distance to the hole (one decimal), Long Drive the length from the tee – GPS suggests it, the player corrects it –
// and whether the ball is in the fairway (only then it counts). The host corrects an entry in Games.

/** The leader of a prize as one line: "Chris 2,4 m" – or none yet. */
export function leaderText(ev: RoundEvent, s: Special): string {
  const top = specialBoard(ev).find((x) => x.special.id === s.id)?.rows[0];
  return top ? `${top.name} ${metres(top.m, s.kind)}` : tr('nobody yet', 'noch keiner');
}

export function SpecialsAtHole(props: { ev: RoundEvent; code: string; flight: string; player: string; phone: string; hole: number; /** Long Drive: the length from the tee by GPS, metres */ fromTee: number | null }) {
  const specials = specialsAt(props.ev, props.hole);
  const [open, setOpen] = useState<Special | null>(null);
  if (!specials.length) return null;
  return (
    <>
      {specials.map((s) => {
        const mine = props.ev.flights[props.flight]?.specials?.[s.id]?.[props.player];
        return (
          <div key={s.id} className="test-shot-row">
            <span className="map-hint detected" role="status" aria-label={specialName(s.kind)}>
              <span>
                <strong>{specialName(s.kind)}</strong> · {tr('leading', 'führend')}: {leaderText(props.ev, s)}
              </span>
              <button type="button" className="btn-ghost" onClick={() => setOpen(s)}>
                {mine?.m != null ? tr(`yours ${metres(mine.m, s.kind)}`, `deins ${metres(mine.m, s.kind)}`) : s.kind === 'nearestPin' ? tr('Enter distance', 'Abstand eintragen') : tr('Enter length', 'Weite eintragen')}
              </button>
            </span>
          </div>
        );
      })}
      {open && <SpecialSheet {...props} special={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function SpecialSheet(props: { ev: RoundEvent; code: string; flight: string; player: string; phone: string; fromTee: number | null; special: Special; onClose: () => void }) {
  const s = props.special;
  const ntp = s.kind === 'nearestPin';
  const had = props.ev.flights[props.flight]?.specials?.[s.id]?.[props.player];
  const [value, setValue] = useState(() => (had?.m != null ? String(had.m).replace('.', ',') : !ntp && props.fromTee != null ? String(props.fromTee) : ''));
  const [fairway, setFairway] = useState(had?.fairway ?? true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const m = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(m) && m > 0 && m < (ntp ? 100 : 500);
  const save = async (entry: { m: number | null; fairway?: boolean } | null) => {
    setBusy(true);
    const ok = await setSpecial(props.code, props.flight, s.id, props.player, entry ? { ...entry, at: new Date().toISOString(), by: props.phone } : null);
    setBusy(false);
    if (ok) props.onClose();
    else setMsg(tr('No connection – try again in a moment.', 'Keine Verbindung – gleich noch einmal versuchen.'));
  };
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <section className="sheet" role="dialog" aria-label={specialName(s.kind)} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>
            {specialName(s.kind)} · {tr('hole', 'Loch')} {props.ev.holes[s.hole]?.label}
          </strong>
          <button type="button" className="icon-btn" aria-label={tr('Close', 'Schließen')} onClick={props.onClose}>
            ✕
          </button>
        </div>
        <span className="muted small">
          {tr('Leading', 'Führend')}: {leaderText(props.ev, s)}
        </span>
        <div className="field">
          <label htmlFor="special-m">{ntp ? tr('Distance to the hole (m)', 'Abstand zur Fahne (m)') : tr('Length from the tee (m)', 'Weite vom Abschlag (m)')}</label>
          <input id="special-m" className="input" inputMode="decimal" value={value} placeholder={ntp ? '2,4' : '240'} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))} />
          {!ntp && props.fromTee != null && (
            <button type="button" className="chip" onClick={() => setValue(String(props.fromTee))}>
              {tr(`GPS: ${props.fromTee} m from the tee`, `GPS: ${props.fromTee} m vom Abschlag`)}
            </button>
          )}
          {!ntp && props.fromTee == null && <span className="muted small">{tr('No GPS here – enter the length yourself.', 'Kein GPS hier – die Weite selbst eintragen.')}</span>}
        </div>
        {!ntp && (
          <label className="check-row">
            <input type="checkbox" checked={fairway} onChange={(e) => setFairway(e.target.checked)} />
            <span>{tr('In the fairway (only then it counts)', 'Im Fairway (nur dann zählt er)')}</span>
          </label>
        )}
        <button type="button" className="btn-primary" disabled={busy || !valid} onClick={() => void save({ m: ntp ? Math.round(m * 10) / 10 : Math.round(m), ...(ntp ? {} : { fairway }) })}>
          {busy ? tr('Saving …', 'Speichere …') : tr('Save', 'Eintragen')}
        </button>
        {had?.m != null && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save(null)}>
            {tr('Take mine back', 'Meinen Wert zurücknehmen')}
          </button>
        )}
        {msg && (
          <span className="small bad-text" role="alert">
            {msg}
          </span>
        )}
      </section>
    </div>
  );
}
